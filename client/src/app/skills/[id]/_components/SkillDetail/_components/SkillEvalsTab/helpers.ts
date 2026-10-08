import type { SkillEvalRunSummary } from "@devdigest/shared";
import { SHORT_SHA_LENGTH } from "./constants";

/** 0..1 score -> "0.75"; null -> "—". */
export function formatScore(n: number | null | undefined): string {
  return n == null ? "—" : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** Abbreviated git sha; "—" when the run had none. */
export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : "—";
}

/** ISO timestamp -> "2026-10-08 10:24" in UTC, so the label never shifts by timezone. */
export function formatRunDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

export interface ScoreTrend {
  xLabels: string[];
  data: number[];
}

/**
 * Average score per candidate run, oldest first (chart order). Baseline runs and
 * runs with no scored case are left out: they would plot as a fake zero.
 */
export function scoreTrend(runs: SkillEvalRunSummary[]): ScoreTrend {
  const points = runs
    .filter((r) => r.config === "candidate" && r.avg_score != null)
    .slice()
    .sort((a, b) => Date.parse(a.ran_at) - Date.parse(b.ran_at));
  return {
    xLabels: points.map((r) => formatRunDate(r.ran_at).slice(5)),
    data: points.map((r) => r.avg_score as number),
  };
}
