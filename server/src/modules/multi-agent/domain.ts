/**
 * Multi-agent review domain: the types and rules of a parent run — status,
 * totals, column order, location grouping, takes and estimates. Pure: no I/O,
 * no model call.
 */
import type {
  ConflictTake,
  FindingRecord,
  LocationGroup,
  Severity,
} from '@devdigest/shared';
import {
  LINE_GAP,
  ESTIMATE_SAMPLE,
  SEVERITY_RANK,
  TITLE_SIMILARITY_MIN,
} from './constants.js';

export type ChildStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
export type ParentStatus = 'running' | 'done' | 'failed' | 'partial';

/** A parent run as stored: which PR, which agents were selected, and when. */
export interface ParentRow {
  id: string;
  prId: string;
  prNumber: number | null;
  prTitle: string | null;
  /** Agent ids in the order the reviewer selected them. */
  agentIds: string[];
  createdAt: string;
}

/** One agent's run inside a parent. `agentId` is null once the agent is deleted. */
export interface ChildRun {
  id: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: ChildStatus;
  error: string | null;
  score: number | null;
  summary: string | null;
  verdict: string | null;
  durationMs: number | null;
  costUsd: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

/** A persisted finding plus where it came from. */
export type GroupableFinding = FindingRecord & {
  agentId: string | null;
  runId: string;
};

/** One finished run of an agent, as an estimate input. */
export interface EstimateSample {
  agentId: string;
  durationMs: number | null;
  costUsd: number | null;
}

export interface ParentTotals {
  total_duration_ms: number;
  total_cost_usd: number | null;
  cost_partial: boolean;
}

/** Findings merged into one location, before takes are built. */
export interface FindingGroup {
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  members: GroupableFinding[];
}

// ---------------------------------------------------------------------------
// Parent status and totals
// ---------------------------------------------------------------------------

/** AC-34–AC-37. A parent with no child run has nothing to show, so it is failed. */
export function deriveParentStatus(children: readonly ChildRun[]): ParentStatus {
  if (children.length === 0) return 'failed';
  if (children.some((c) => c.status === 'queued' || c.status === 'running')) return 'running';
  const done = children.filter((c) => c.status === 'done').length;
  if (done === children.length) return 'done';
  return done === 0 ? 'failed' : 'partial';
}

/** AC-38–AC-40. Duration runs from the earliest start to the latest finish. */
export function parentTotals(children: readonly ChildRun[]): ParentTotals {
  const starts = children.flatMap((c) => (c.startedAt ? [c.startedAt.getTime()] : []));
  const finishes = children.flatMap((c) => (c.finishedAt ? [c.finishedAt.getTime()] : []));
  const total_duration_ms =
    starts.length > 0 && finishes.length > 0
      ? Math.max(0, Math.max(...finishes) - Math.min(...starts))
      : 0;

  const costs = children.flatMap((c) => (c.costUsd === null ? [] : [c.costUsd]));
  return {
    total_duration_ms,
    total_cost_usd: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
    cost_partial: children.some((c) => c.costUsd === null),
  };
}

/**
 * AC-32. Columns follow the selection order. A child whose agent was deleted
 * (`agentId` null) fills the first selected slot nobody else claimed.
 */
export function orderColumns(
  agentIds: readonly string[],
  children: readonly ChildRun[],
): ChildRun[] {
  const used = new Set<string>();
  const slots: (ChildRun | undefined)[] = agentIds.map((agentId) => {
    const child = children.find((c) => c.agentId === agentId && !used.has(c.id));
    if (child) used.add(child.id);
    return child;
  });
  const orphans = children.filter((c) => !used.has(c.id));
  const filled = slots.map((slot) => slot ?? orphans.shift());
  return [...filled.filter((c): c is ChildRun => c !== undefined), ...orphans];
}

/** AC-41. */
export function columnScore(child: ChildRun): number | null {
  return child.status === 'done' ? child.score : null;
}

// ---------------------------------------------------------------------------
// Location groups
// ---------------------------------------------------------------------------

/** AC-43. Lower-case, split on every non-alphanumeric, drop empty tokens. */
export function normaliseTitle(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/** AC-43. |intersection| / |union| of the two token sets; 0 when both are empty. */
export function titleSimilarity(a: string, b: string): number {
  const left = new Set(normaliseTitle(a));
  const right = new Set(normaliseTitle(b));
  const union = new Set([...left, ...right]).size;
  if (union === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / union;
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function tokenSimilarity(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const union = new Set([...left, ...right]).size;
  if (union === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / union;
}

function sameLocation(
  a: GroupableFinding,
  aTokens: ReadonlySet<string>,
  b: GroupableFinding,
  bTokens: ReadonlySet<string>,
): boolean {
  if (a.file !== b.file) return false;
  const gap = Math.max(a.start_line, b.start_line) - Math.min(a.end_line, b.end_line);
  return gap <= LINE_GAP && tokenSimilarity(aTokens, bTokens) >= TITLE_SIMILARITY_MIN;
}

/**
 * AC-42, AC-44–AC-49. Transitive grouping (union-find) of findings by location.
 * `selectionOrder` lists run ids in column order; it breaks title ties.
 */
export function groupFindings(
  findings: readonly GroupableFinding[],
  selectionOrder: readonly string[],
): FindingGroup[] {
  const parent = findings.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root] as number;
    parent[i] = root;
    return root;
  };
  const tokens = findings.map((f) => new Set(normaliseTitle(f.title)));
  // Only findings in the same file can share a location: compare within a file bucket.
  const byFile = new Map<string, number[]>();
  findings.forEach((f, i) => {
    const idx = byFile.get(f.file);
    if (idx) idx.push(i);
    else byFile.set(f.file, [i]);
  });
  for (const idx of byFile.values()) {
    for (let x = 0; x < idx.length; x++) {
      for (let y = x + 1; y < idx.length; y++) {
        const i = idx[x] as number;
        const j = idx[y] as number;
        if (
          sameLocation(
            findings[i] as GroupableFinding,
            tokens[i] as Set<string>,
            findings[j] as GroupableFinding,
            tokens[j] as Set<string>,
          )
        ) {
          parent[find(j)] = find(i);
        }
      }
    }
  }

  const buckets = new Map<number, GroupableFinding[]>();
  findings.forEach((f, i) => {
    const root = find(i);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(f);
    else buckets.set(root, [f]);
  });

  const rankOf = (runId: string): number => {
    const at = selectionOrder.indexOf(runId);
    return at === -1 ? Number.MAX_SAFE_INTEGER : at;
  };
  const moreImportant = (a: GroupableFinding, b: GroupableFinding): number =>
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    b.confidence - a.confidence ||
    rankOf(a.runId) - rankOf(b.runId);

  const groups: FindingGroup[] = [...buckets.values()].map((members) => {
    const lead = [...members].sort(moreImportant)[0] as GroupableFinding;
    return {
      file: lead.file,
      startLine: Math.min(...members.map((m) => m.start_line)),
      endLine: Math.max(...members.map((m) => m.end_line)),
      title: lead.title,
      members,
    };
  });

  return groups.sort(
    (a, b) => byCodeUnit(a.file, b.file) || a.startLine - b.startLine || a.endLine - b.endLine,
  );
}

/**
 * AC-53–AC-56. Exactly one take per selected column, in column order. A column
 * with members takes its most severe member (ties: higher confidence).
 */
export function buildTakes(
  group: FindingGroup,
  columns: readonly ChildRun[],
): ConflictTake[] {
  return columns.map((column) => {
    const own = group.members.filter((m) => m.runId === column.id);
    const top = [...own].sort(
      (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.confidence - a.confidence,
    )[0];
    const base = { agent_id: column.agentId, persona: column.agentName };
    if (top) return { ...base, verdict: top.severity, note: top.title };
    if (column.status === 'done') return { ...base, verdict: 'ignored', note: null };
    return { ...base, verdict: 'no_result', note: null };
  });
}

/**
 * AC-51, AC-52. A conflict is a location some agent flagged and a finished
 * agent did not, or one the flagging agents rated at different severities.
 */
export function isConflict(takes: readonly ConflictTake[]): boolean {
  const flagged = takes.flatMap((t) =>
    t.verdict === 'ignored' || t.verdict === 'no_result' ? [] : [t.verdict as Severity],
  );
  if (flagged.length === 0) return false;
  return takes.some((t) => t.verdict === 'ignored') || new Set(flagged).size > 1;
}

/**
 * AC-45. Groups the findings of the `done` columns and attaches takes. Findings
 * of runs that did not finish are left out of the input.
 */
export function buildLocationGroups(
  columns: readonly ChildRun[],
  findings: readonly GroupableFinding[],
): LocationGroup[] {
  const doneRuns = new Set(columns.filter((c) => c.status === 'done').map((c) => c.id));
  const groups = groupFindings(
    findings.filter((f) => doneRuns.has(f.runId)),
    columns.map((c) => c.id),
  );
  return groups.map((g) => {
    const takes = buildTakes(g, columns);
    return {
      file: g.file,
      start_line: g.startLine,
      end_line: g.endLine,
      title: g.title,
      conflict: isConflict(takes),
      members: g.members.map((m) => ({ finding_id: m.id, agent_id: m.agentId })),
      takes,
    };
  });
}

// ---------------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------------

/** Median of the values; null when there are none. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

/**
 * AC-59, AC-60. `samples` are the agent's finished runs on its current model,
 * newest first; the latest `ESTIMATE_SAMPLE` count.
 */
export function toEstimate(
  agentId: string,
  samples: readonly EstimateSample[],
): { agent_id: string; median_duration_ms: number | null; median_cost_usd: number | null; runs: number } {
  const used = samples.slice(0, ESTIMATE_SAMPLE);
  const duration = median(used.flatMap((s) => (s.durationMs === null ? [] : [s.durationMs])));
  return {
    agent_id: agentId,
    median_duration_ms: duration === null ? null : Math.round(duration),
    median_cost_usd: median(used.flatMap((s) => (s.costUsd === null ? [] : [s.costUsd]))),
    runs: used.length,
  };
}
