import { z } from 'zod';
import { SkillEvalConfig, type SkillEvalPractice } from '@devdigest/shared';

/**
 * Pure parsing of the `evals/` package's `results/records.jsonl` (one JSON object
 * per case per run). The record shape is owned by `evals/src/records/record.ts`;
 * only the fields this module reads are declared here, and everything else is
 * ignored. No I/O — the file arrives as text through the `EvalRecordsSource` port.
 */

/**
 * A failed practice is written with `evidence: null` (the judge had no quote to give).
 * Normalise to '' here so such records — the interesting ones — are not skipped as malformed.
 */
const RecordPractice = z.object({
  practice: z.string(),
  passed: z.boolean(),
  evidence: z
    .string()
    .nullish()
    .transform((v) => v ?? ''),
});

const RecordLine = z.object({
  run_id: z.string().regex(/^\d{8}T\d{6}$/),
  config: z.string(),
  nodeid: z.string(),
  outcome: z.boolean(),
  score: z.number().nullish(),
  threshold: z.number().nullish(),
  grounded: z.number().nullish(),
  practices: z.array(RecordPractice).nullish(),
  git_sha: z.string().nullish(),
  dirty: z.boolean().nullish(),
  num_turns: z.number().nullish(),
  metrics: z
    .object({
      durationMs: z.number().nullish(),
      inputTokens: z.number().nullish(),
      outputTokens: z.number().nullish(),
    })
    .nullish(),
});

/** A record that belongs to a skill suite, normalised for persistence. */
export interface SkillEvalRecord {
  skillName: string;
  runId: string;
  ranAt: Date;
  config: SkillEvalConfig;
  caseName: string;
  outcome: boolean;
  score: number | null;
  threshold: number | null;
  grounded: number | null;
  practices: SkillEvalPractice[];
  gitSha: string | null;
  dirty: boolean | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  numTurns: number | null;
}

const NODEID_SEP = ' > ';
const SKILL_SEGMENT = 'skill:';

/** `"<abs path> > skill:<name> > <case title>"` → `{ skillName, caseName }`; null for agent/workflow/rules records. */
export function parseNodeId(nodeid: string): { skillName: string; caseName: string } | null {
  const parts = nodeid.split(NODEID_SEP);
  const idx = parts.findIndex((p) => p.startsWith(SKILL_SEGMENT));
  if (idx === -1) return null;
  const skillName = parts[idx]!.slice(SKILL_SEGMENT.length).trim();
  const caseName = parts.slice(idx + 1).join(NODEID_SEP).trim();
  if (!skillName || !caseName) return null;
  return { skillName, caseName };
}

/** `"20261008T102101"` (UTC, as written by the evals package) → Date; null when malformed. */
export function runIdToDate(runId: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(runId);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number) as [number, number, number, number, number, number, number];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ParsedLine =
  | { kind: 'record'; record: SkillEvalRecord }
  /** Valid JSON that is not a skill-suite record (agent / workflow / rules). */
  | { kind: 'foreign' }
  | { kind: 'invalid' };

/**
 * Parse one JSONL line. Never throws: a malformed line is `invalid`.
 * With `onlySkill`, other suites' records are `foreign` before their shape is
 * validated, so a legacy record of another skill never counts as a skipped line.
 */
export function parseRecordLine(line: string, onlySkill?: string): ParsedLine {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return { kind: 'invalid' };
  }
  const head = z.object({ nodeid: z.string() }).safeParse(json);
  if (!head.success) return { kind: 'invalid' };
  const node = parseNodeId(head.data.nodeid);
  if (!node || (onlySkill !== undefined && node.skillName !== onlySkill)) return { kind: 'foreign' };

  const parsed = RecordLine.safeParse(json);
  if (!parsed.success) return { kind: 'invalid' };
  const r = parsed.data;

  const config = SkillEvalConfig.safeParse(r.config);
  const ranAt = runIdToDate(r.run_id);
  if (!config.success || !ranAt) return { kind: 'invalid' };

  return {
    kind: 'record',
    record: {
      skillName: node.skillName,
      runId: r.run_id,
      ranAt,
      config: config.data,
      caseName: node.caseName,
      outcome: r.outcome,
      score: r.score ?? null,
      threshold: r.threshold ?? null,
      grounded: r.grounded ?? null,
      practices: r.practices ?? [],
      gitSha: r.git_sha ?? null,
      dirty: r.dirty ?? null,
      durationMs: roundOrNull(r.metrics?.durationMs),
      inputTokens: roundOrNull(r.metrics?.inputTokens),
      outputTokens: roundOrNull(r.metrics?.outputTokens),
      numTurns: roundOrNull(r.num_turns),
    },
  };
}

function roundOrNull(n: number | null | undefined): number | null {
  return n == null ? null : Math.round(n);
}

export interface ParsedRecords {
  /** Records for `skillName`, de-duplicated by (run, config, case) — the last line wins. */
  records: SkillEvalRecord[];
  /** Lines that could not be used: malformed, or a skill record with an unknown config/run id. */
  skipped: number;
}

/** Keep the records of one skill out of a whole records file. */
export function recordsForSkill(text: string, skillName: string): ParsedRecords {
  const byKey = new Map<string, SkillEvalRecord>();
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const parsed = parseRecordLine(line, skillName);
    if (parsed.kind === 'invalid') skipped++;
    else if (parsed.kind === 'record') {
      const r = parsed.record;
      byKey.set(`${r.runId}\u0000${r.config}\u0000${r.caseName}`, r);
    }
  }
  return { records: [...byKey.values()], skipped };
}
