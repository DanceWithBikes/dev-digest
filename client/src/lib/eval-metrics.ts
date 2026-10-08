/* eval-metrics.ts — pure helpers behind the Evals tab and the Eval Dashboard.
   The 200,000 cap is duplicated here on purpose: the client never value-imports
   `@devdigest/shared` (its `.js`-suffixed barrel breaks `next dev`). */
import type { EvalBatch } from "@devdigest/shared";

/** Hard cap on a case's input diff (characters); mirrors the shared contract. */
export const EVAL_INPUT_DIFF_MAX = 200_000;

/** Raw 0..1 double -> whole percent ("75%"); null -> "—". */
export function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export type EvalMetricKey = "recall" | "precision" | "citation_accuracy";

export interface BatchDelta {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

function diff(older: number | null, newer: number | null): number | null {
  return older == null || newer == null ? null : newer - older;
}

/** Newer minus older per metric, null when either side has no value. */
export function batchDelta(older: EvalBatch, newer: EvalBatch): BatchDelta {
  return {
    recall: diff(older.recall, newer.recall),
    precision: diff(older.precision, newer.precision),
    citation_accuracy: diff(older.citation_accuracy, newer.citation_accuracy),
  };
}

/**
 * Whole percentage points of a delta ("+5 pp", "-3 pp"), "—" for null.
 * `signed: false` drops the "+" for callers that show the direction elsewhere (an arrow).
 */
export function formatDeltaPp(delta: number | null, { signed = true }: { signed?: boolean } = {}): string {
  if (delta == null) return "—";
  const pp = Math.round(delta * 100);
  return `${signed && pp > 0 ? "+" : ""}${pp} pp`;
}

/** Put two batches in (older, newer) order by `ran_at`. */
export function orderPair(a: EvalBatch, b: EvalBatch): [older: EvalBatch, newer: EvalBatch] {
  return Date.parse(a.ran_at) <= Date.parse(b.ran_at) ? [a, b] : [b, a];
}

export interface TrendSeries {
  recall: number[];
  precision: number[];
  citation: number[];
  xLabels: string[];
  /** The `done` batches behind the points, chronological (for tooltips). */
  batches: EvalBatch[];
}

/** Chart input: `done` batches only, oldest first; a null metric plots as 0. */
export function trendSeries(batches: EvalBatch[]): TrendSeries {
  const done = batches
    .filter((b) => b.status === "done")
    .sort((a, b) => Date.parse(a.ran_at) - Date.parse(b.ran_at));
  return {
    recall: done.map((b) => b.recall ?? 0),
    precision: done.map((b) => b.precision ?? 0),
    citation: done.map((b) => b.citation_accuracy ?? 0),
    xLabels: done.map((b) => `v${b.agent_version}`),
    batches: done,
  };
}

/** Cost for a tooltip / table cell; null -> "—". */
export function formatCost(cost: number | null | undefined): string {
  return cost == null ? "—" : `$${cost.toFixed(4)}`;
}

/** Recall of the `done` batches in the trend, chronological; a null recall plots as 0. */
export function recallSeries(batches: EvalBatch[]): number[] {
  return trendSeries(batches).recall;
}

/** Newest first by `ran_at`. */
export function newestFirst(batches: EvalBatch[]): EvalBatch[] {
  return [...batches].sort((a, b) => Date.parse(b.ran_at) - Date.parse(a.ran_at));
}

/** The newest `done` batch and the one before it (for the delta). */
export function latestTwoDone(batches: EvalBatch[]): { newest: EvalBatch | undefined; previous: EvalBatch | undefined } {
  const done = newestFirst(batches).filter((b) => b.status === "done");
  return { newest: done[0], previous: done[1] };
}

/** Local date (and time unless `withTime` is false) of a batch; the raw string when it does not parse. */
export function formatRanAt(iso: string, withTime = true): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms);
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}
