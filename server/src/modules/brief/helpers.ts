import { RiskFileRef } from '@devdigest/shared';
import type { BlastRadius, BriefMissing, Risk, ReviewFocusItem } from '@devdigest/shared';
import {
  BODY_CAP_CHARS,
  CHARS_PER_TOKEN,
  DIFF_BUDGET_CHARS,
  DOC_BUDGET_TOKENS,
  MAX_FOCUS,
  MAX_RISKS,
  MISSING_BLAST_UNAVAILABLE,
  MISSING_NO_DOCS,
  MISSING_NO_INTENT,
  missingDegradedBlast,
  missingDiffTruncated,
  missingDocBudget,
  missingDocNotFound,
  missingStaleIntent,
} from './constants.js';
import type {
  AttachmentOwner,
  BriefFile,
  GroundedBrief,
  GroundingContext,
  ModelBriefOutput,
  SentDoc,
  StoredIntent,
} from './domain.js';

/** Pure input selection and grounding for the PR Brief. No imports beyond the domain ring. */

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---- Body (OQ-2) ----

export function capBody(body: string): { text: string; truncated: boolean } {
  if (body.length <= BODY_CAP_CHARS) return { text: body, truncated: false };
  return { text: body.slice(0, BODY_CAP_CHARS), truncated: true };
}

// ---- Missing data: intent and blast (AC-18, AC-19, AC-21, AC-22) ----

export function intentMissing(intent: StoredIntent | null, prHeadSha: string): BriefMissing | null {
  if (!intent) return { source: 'intent', reason: MISSING_NO_INTENT };
  if (intent.headSha !== prHeadSha) {
    return { source: 'intent', reason: missingStaleIntent(intent.headSha) };
  }
  return null;
}

export function blastMissing(blast: BlastRadius | null): BriefMissing | null {
  if (!blast) return { source: 'blast', reason: MISSING_BLAST_UNAVAILABLE };
  if (blast.degraded) return { source: 'blast', reason: missingDegradedBlast(blast.reason) };
  return null;
}

// ---- Project Context documents (AC-23..AC-30) ----

/** Agents by name, then createdAt; own paths, then enabled skills by link order; first position wins. */
export function collectBriefDocPaths(owners: AttachmentOwner[]): string[] {
  const sorted = [...owners].sort(
    (a, b) => byCodeUnit(a.name, b.name) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push(path);
  };
  for (const agent of sorted) {
    for (const p of [...agent.paths].sort(byCodeUnit)) add(p);
    const skills = [...agent.skills].sort((a, b) => a.order - b.order || byCodeUnit(a.id, b.id));
    for (const skill of skills) {
      for (const p of [...skill.paths].sort(byCodeUnit)) add(p);
    }
  }
  return out;
}

/** Whole documents in order; one that would cross the budget is skipped and the next is tried. */
export function applyDocBudget(
  planned: string[],
  reads: Map<string, { text: string }>,
): { sent: SentDoc[]; missing: BriefMissing[] } {
  if (planned.length === 0) {
    return { sent: [], missing: [{ source: 'specs', reason: MISSING_NO_DOCS }] };
  }
  const sent: SentDoc[] = [];
  const missing: BriefMissing[] = [];
  let tokens = 0;
  for (const path of planned) {
    const read = reads.get(path);
    if (!read) {
      missing.push({ source: 'specs', reason: missingDocNotFound(path) });
      continue;
    }
    const cost = Math.ceil(read.text.length / CHARS_PER_TOKEN);
    if (tokens + cost > DOC_BUDGET_TOKENS) {
      missing.push({ source: 'specs', reason: missingDocBudget(path) });
      continue;
    }
    tokens += cost;
    sent.push({ path, text: read.text });
  }
  return { sent, missing };
}

// ---- Diff budget (AC-31, AC-32) ----

/**
 * Patches go out in file order until the next one would cross the budget; that
 * file and every later one go without a patch. `withheld` counts only patches
 * that existed (a file GitHub sent without one is not "truncated").
 */
export function applyDiffBudget(files: BriefFile[]): {
  files: BriefFile[];
  withheld: number;
  missing: BriefMissing | null;
} {
  let total = 0;
  let stopped = false;
  let withheld = 0;
  const out = files.map((f) => {
    if (f.patch === null) return f;
    if (!stopped && total + f.patch.length <= DIFF_BUDGET_CHARS) {
      total += f.patch.length;
      return f;
    }
    stopped = true;
    withheld += 1;
    return { ...f, patch: null };
  });
  return {
    files: out,
    withheld,
    missing: withheld > 0 ? { source: 'diff', reason: missingDiffTruncated(withheld) } : null,
  };
}

// ---- Grounding (AC-36..AC-42) ----

export function allowedPaths(files: BriefFile[], blast: BlastRadius | null): Set<string> {
  const out = new Set(files.map((f) => f.path));
  for (const d of blast?.downstream ?? []) for (const c of d.callers) out.add(c.file);
  return out;
}

export function callerLines(blast: BlastRadius | null): Map<string, Set<number>> {
  const out = new Map<string, Set<number>>();
  for (const d of blast?.downstream ?? []) {
    for (const c of d.callers) {
      const set = out.get(c.file) ?? new Set<number>();
      set.add(c.line);
      out.set(c.file, set);
    }
  }
  return out;
}

/** The text before a valid `:<start>[-<end>]` suffix, else the whole string. */
export function parseRefPath(ref: string): string {
  const m = /^(.*):[1-9]\d*(?:-[1-9]\d*)?$/.exec(ref);
  return m ? m[1]! : ref;
}

/** New-side `[start, end]` ranges from the `@@ -a,b +c,d @@` headers; `len` defaults to 1, `len = 0` is skipped. */
export function newSideRanges(patch: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm;
  for (let m = re.exec(patch); m; m = re.exec(patch)) {
    const start = Number(m[1]);
    const len = m[2] === undefined ? 1 : Number(m[2]);
    if (len > 0) out.push([start, start + len - 1]);
  }
  return out;
}

function groundFocusLine(item: ReviewFocusItem, file: BriefFile | undefined): number {
  if (!file || file.patch === null) return item.line;
  const ranges = newSideRanges(file.patch);
  if (ranges.length === 0) return item.line;
  const inside = ranges.some(([s, e]) => item.line >= s && item.line <= e);
  return inside ? item.line : ranges[0]![0];
}

export function groundBrief(output: ModelBriefOutput, ctx: GroundingContext): GroundedBrief {
  const allowed = allowedPaths(ctx.files, ctx.blast);
  const changed = new Map(ctx.files.map((f) => [f.path, f]));
  const lines = callerLines(ctx.blast);
  const dropped = { fileRefs: 0, risks: 0, focus: 0 };

  const risks: Risk[] = [];
  for (const risk of output.risks) {
    const refs = risk.file_refs.filter((ref) => {
      const ok = allowed.has(parseRefPath(ref)) && RiskFileRef.safeParse(ref).success;
      if (!ok) dropped.fileRefs += 1;
      return ok;
    });
    if (refs.length === 0) {
      dropped.risks += 1;
      continue;
    }
    risks.push({ ...risk, file_refs: refs });
  }

  const focus: ReviewFocusItem[] = [];
  for (const item of output.review_focus) {
    if (!allowed.has(item.file)) {
      dropped.focus += 1;
      continue;
    }
    const file = changed.get(item.file);
    if (!file && !lines.get(item.file)?.has(item.line)) {
      dropped.focus += 1;
      continue;
    }
    focus.push({ ...item, line: groundFocusLine(item, file) });
  }

  return {
    risks: risks.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_FOCUS),
    dropped,
  };
}
