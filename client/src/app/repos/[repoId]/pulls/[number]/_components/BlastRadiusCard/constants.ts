import type { BlastDegradedReason } from "@devdigest/shared";

/** The stats-row segmented toggle. Tree is the default — it matches how the
   server already orders `downstream` (rank order), so it needs no client sort. */
export const VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof VIEWS)[number];

/** Every degraded reason gets a Resync affordance except `flag_off` — the
   feature is switched off entirely, so resyncing the index changes nothing. */
export const RESYNC_REASONS: readonly BlastDegradedReason[] = [
  "index_failed",
  "index_partial",
  "repo_too_large",
  "no_data",
];
