import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of GET /multi-agent-runs/:id
 *   - MultiAgentRunSummary one row of GET /multi-agent-runs
 *   - RunEstimate          one row of GET /multi-agent-runs/estimates
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - LocationGroup / ConflictTake  where agents' findings meet on one location
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  /** Null when the agent was deleted after the run. */
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  /** The run's failure message, when it failed. */
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(FindingRecord),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a location group. */
export const ConflictTake = z.object({
  agent_id: z.string().nullable(),
  persona: z.string().nullable(),
  /**
   * Severity if the agent flagged it, 'ignored' when the agent finished without
   * flagging it, 'no_result' when the agent's run did not finish.
   */
  verdict: z.union([Severity, z.literal('ignored'), z.literal('no_result')]),
  note: z.string().nullable(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/** A finding that belongs to a location group, by its original ids. */
export const LocationGroupMember = z.object({
  finding_id: z.string(),
  agent_id: z.string().nullable(),
});
export type LocationGroupMember = z.infer<typeof LocationGroupMember>;

/**
 * Findings of one parent run that point at the same place. Computed from the
 * persisted findings at read time; never stored. `conflict` is true when the
 * agents did not see it alike (one missed it, or severities differ).
 */
export const LocationGroup = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  conflict: z.boolean(),
  members: z.array(LocationGroupMember),
  takes: z.array(ConflictTake),
});
export type LocationGroup = z.infer<typeof LocationGroup>;

/** Response of GET /multi-agent-runs/:id. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullable(),
  ran_at: z.string(),
  status: z.enum(['running', 'done', 'failed', 'partial']),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  /** True when at least one child run has no recorded cost. */
  cost_partial: z.boolean(),
  columns: z.array(AgentColumn),
  groups: z.array(LocationGroup),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** One row of GET /multi-agent-runs (newest first). */
export const MultiAgentRunSummary = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  pr_title: z.string().nullable(),
  ran_at: z.string(),
  status: z.enum(['running', 'done', 'failed', 'partial']),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  cost_partial: z.boolean(),
});
export type MultiAgentRunSummary = z.infer<typeof MultiAgentRunSummary>;

/** One row of GET /multi-agent-runs/estimates. */
export const RunEstimate = z.object({
  agent_id: z.string(),
  median_duration_ms: z.number().int().nullable(),
  median_cost_usd: z.number().nullable(),
  /** How many runs the medians were computed from (0 = no estimate). */
  runs: z.number().int(),
});
export type RunEstimate = z.infer<typeof RunEstimate>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
