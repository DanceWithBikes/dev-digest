import type { BlastRadius } from "@devdigest/shared";

export interface BlastStatsResult {
  symbols: number;
  totalCallers: number;
  endpoints: number;
  crons: number;
}

/**
 * Tallies the header stats row off the map the server already sent — no
 * re-fetch, no re-rank. `totalCallers` sums every group's caller list;
 * endpoints/crons are deduplicated UNIONS across groups, since the same
 * endpoint reachable through two changed symbols should count once, not twice.
 */
export function blastStats(radius: BlastRadius): BlastStatsResult {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let totalCallers = 0;
  for (const group of radius.downstream) {
    totalCallers += group.callers.length;
    for (const e of group.endpoints_affected) endpoints.add(e);
    for (const c of group.crons_affected) crons.add(c);
  }
  return {
    symbols: radius.changed_symbols.length,
    totalCallers,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

/** Whether the map has anything to render as a tree/graph — a changed symbol
   with zero callers still counts as "no downstream" for this purpose. */
export function hasDownstream(radius: BlastRadius): boolean {
  return radius.downstream.some((group) => group.callers.length > 0);
}
