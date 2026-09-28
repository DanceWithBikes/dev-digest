import { z } from 'zod';
import {
  Agent,
  ConventionCandidate,
  BlastRadius,
  FindingRecord,
  ReviewRecord,
  ReviewRunTarget,
  RunSummary,
  Severity,
} from '@devdigest/shared';

/**
 * MCP-facing projections of `@devdigest/shared` contracts, and the raw-shape
 * input schemas `McpServer.registerTool` expects. Nothing here imports the
 * `Container` or a module — `@devdigest/shared` is the one exception the
 * `mcp-tools-talk-to-ports` gate allows every file in this folder.
 *
 * "Raw shape" = a plain `Record<string, ZodType>`, not a `z.object(...)` — the
 * SDK's `registerTool` takes either shape for `inputSchema`; a full schema
 * (`z.object`) works for `outputSchema` too, so those stay wrapped.
 */

const REPO_FULL_NAME_RE = /^[^\s/]+\/[^\s/]+$/;
const repoFullName = () => z.string().regex(REPO_FULL_NAME_RE, 'Expected "owner/name"');

const responseFormat = () => z.enum(['concise', 'detailed']).default('concise');

// ---- list_agents ------------------------------------------------------------

/**
 * Everything an `Agent` has except the two fields that bloat a "which agent
 * should I run" answer for no benefit: the system prompt and any custom output
 * schema. `response_format: 'detailed'` returns the full `Agent` instead.
 */
export const AgentConcise = Agent.omit({ system_prompt: true, output_schema: true });
export type AgentConcise = z.infer<typeof AgentConcise>;

export const ListAgentsInput = {
  enabled_only: z.boolean().default(false),
  response_format: responseFormat(),
};

export const ListAgentsOutput = z.object({
  agents: z.array(z.union([AgentConcise, Agent])),
});
export type ListAgentsOutput = z.infer<typeof ListAgentsOutput>;

// ---- run_agent_on_pr ---------------------------------------------------------

export const RunAgentOnPrInput = {
  /** Identify the PR either by its studio id, or by repo + number — not both. */
  pr_id: z.string().uuid().optional(),
  repo: repoFullName().optional(),
  number: z.number().int().positive().optional(),
  /** Select the agent(s) to run: one explicit agent, or every enabled agent. */
  agent_id: z.string().uuid().optional(),
  all: z.literal(true).optional(),
};

export const RunAgentOnPrOutput = z.object({
  pr_id: z.string(),
  runs: z.array(ReviewRunTarget),
  status: z.literal('running'),
  /** What to do next — poll `get_findings` with one of `runs[].run_id`. */
  next_step: z.string(),
});
export type RunAgentOnPrOutput = z.infer<typeof RunAgentOnPrOutput>;

// ---- get_findings -------------------------------------------------------------

/**
 * Everything a triage pass needs to decide "does this matter" without the
 * prose fields (`rationale`, `suggestion`) that dominate the token count.
 * `response_format: 'detailed'` returns the full `FindingRecord`.
 */
export const FindingConcise = FindingRecord.omit({ rationale: true, suggestion: true, evidence: true });
export type FindingConcise = z.infer<typeof FindingConcise>;

/** The review's verdict/summary/score without its `findings` — the top-level
 *  `findings` of `get_findings` is the only (filtered, paged) finding list. */
export const ReviewHeader = ReviewRecord.omit({ findings: true });
export type ReviewHeader = z.infer<typeof ReviewHeader>;

export const GetFindingsInput = {
  run_id: z.string().uuid(),
  /** Only findings at or above this severity (`CRITICAL` > `WARNING` > `SUGGESTION`). */
  min_severity: Severity.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  response_format: responseFormat(),
};

export const GetFindingsOutput = z.object({
  run: RunSummary,
  /** null for a run with no persisted review yet (still running, or a
   *  pre-review failure) — a failed run is NOT an error result, its status and
   *  error live on `run`. */
  review: ReviewHeader.nullable(),
  findings: z.array(z.union([FindingConcise, FindingRecord])),
  /** Count after the severity filter, before `limit` truncation. */
  total: z.number().int(),
  truncated: z.boolean(),
});
export type GetFindingsOutput = z.infer<typeof GetFindingsOutput>;

// ---- get_conventions ----------------------------------------------------------

export const ConventionStatusFilter = z.enum(['accepted', 'pending', 'rejected', 'all']);
export type ConventionStatusFilter = z.infer<typeof ConventionStatusFilter>;

export const GetConventionsInput = {
  repo_id: z.string().uuid().optional(),
  repo: repoFullName().optional(),
  status: ConventionStatusFilter.default('accepted'),
  include_skill_markdown: z.boolean().default(false),
};

const RepoRef = z.object({ id: z.string(), owner: z.string(), name: z.string() });

export const GetConventionsOutput = z.object({
  repo: RepoRef,
  conventions: z.array(ConventionCandidate),
  /** Breakdown across ALL statuses, regardless of the requested filter — so a
   *  caller viewing `pending` still sees how many were accepted/rejected. */
  counts: z.object({
    accepted: z.number().int(),
    pending: z.number().int(),
    rejected: z.number().int(),
  }),
  /** Present only when `include_skill_markdown` was true. */
  skill_markdown: z.string().optional(),
});
export type GetConventionsOutput = z.infer<typeof GetConventionsOutput>;

// ---- get_blast_radius (stub) ----------------------------------------------------

export const GetBlastRadiusInput = {
  pr_id: z.string().uuid().optional(),
  repo: repoFullName().optional(),
  number: z.number().int().positive().optional(),
  files: z.array(z.string()).optional(),
};

/**
 * The final output shape, declared now so a later lesson only swaps the
 * handler — never actually returned today (the handler always answers
 * `isError: true`, which the SDK skips output-schema validation for).
 */
export const GetBlastRadiusOutput = BlastRadius;
