import type { LocationGroup, RunEstimate } from "@devdigest/shared";
import { PALETTE } from "./constants";

/** The palette entry for the agent at `index`; wraps around. */
export function paletteAt(index: number) {
  return PALETTE[index % PALETTE.length]!;
}

/** "<s.1>s · $<c.2>"; a missing half renders as `none` (the localized placeholder). */
export function formatSecondsCost(
  ms: number | null | undefined,
  usd: number | null | undefined,
  none: string,
): string {
  const seconds = ms == null ? none : `${(ms / 1000).toFixed(1)}s`;
  const cost = usd == null ? none : `$${usd.toFixed(2)}`;
  return `${seconds} · ${cost}`;
}

export interface EstimateTotals {
  /** The slowest checked agent: agents run side by side. */
  maxSeconds: number;
  /** Summed median cost of the checked agents. */
  sumCost: number;
  /** True when a checked agent has no estimate, so the totals are a floor. */
  partial: boolean;
}

/** Time and cost shown for the current selection on the Configure run screen. */
export function estimateTotals(
  checkedIds: readonly string[],
  estimates: readonly RunEstimate[],
): EstimateTotals {
  let maxMs = 0;
  let sumCost = 0;
  let partial = false;
  for (const id of checkedIds) {
    const est = estimates.find((e) => e.agent_id === id);
    if (!est || est.median_duration_ms == null || est.median_cost_usd == null) {
      partial = true;
    }
    if (est?.median_duration_ms != null) maxMs = Math.max(maxMs, est.median_duration_ms);
    if (est?.median_cost_usd != null) sumCost += est.median_cost_usd;
  }
  return { maxSeconds: maxMs / 1000, sumCost, partial };
}

export type ResultsView = "columns" | "tabs";

/** `?view=tabs` selects Tabs; anything else falls back to Columns. */
export function parseResultsView(param: string | null | undefined): ResultsView {
  return param === "tabs" ? "tabs" : "columns";
}

/** The location groups the table shows: all of them, or only the conflicts. */
export function visibleGroups(groups: readonly LocationGroup[], onlyConflicts: boolean): LocationGroup[] {
  return onlyConflicts ? groups.filter((g) => g.conflict) : [...groups];
}

export type TakeLabelKey = "CRITICAL" | "WARNING" | "SUGGESTION" | "didNotFlag" | "noResult";

/** Which label a take renders: its severity, "did not flag" or "no result". */
export function takeLabel(verdict: LocationGroup["takes"][number]["verdict"]): TakeLabelKey {
  if (verdict === "ignored") return "didNotFlag";
  if (verdict === "no_result") return "noResult";
  return verdict;
}
