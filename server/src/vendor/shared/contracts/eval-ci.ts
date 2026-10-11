import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, Conformance, Provider, CiFailOn } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  ran_at: z.string(),
  recall: z.number(),
  precision: z.number(),
  citation_accuracy: z.number(),
  pass_rate: z.number(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Aggregate dashboard for an owner (agent/skill) or the whole workspace. */
export const EvalDashboard = z.object({
  owner_kind: EvalOwnerKind.nullable(),
  owner_id: z.string().nullable(),
  cases_total: z.number().int(),
  current: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
    traces_passed: z.number().int(),
    traces_total: z.number().int(),
    cost_usd: z.number().nullable(),
  }),
  delta: z.object({
    recall: z.number(),
    precision: z.number(),
    citation_accuracy: z.number(),
  }),
  trend: z.array(EvalTrendPoint),
  recent_runs: z.array(EvalRunRecord),
  alert: z.string().nullable(),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: z.literal('gha').default('gha'),
  /** "open_pr" opens/updates the PR on `devdigest/ci`; "zip" returns the bundle. */
  mode: z.enum(['open_pr', 'zip']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z
    .array(z.enum(['opened', 'synchronize', 'reopened']))
    .min(1)
    .default(['opened', 'synchronize']),
  /** Wizard edits to editable bundle files (workflow, skills). */
  edits: z.array(z.object({ path: z.string(), contents: z.string() })).default([]),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** Query of `GET /agents/:id/export-ci/preview`. */
export const CiPreviewQuery = z.object({
  repo: z.string().min(1),
  triggers: z
    .array(z.enum(['opened', 'synchronize', 'reopened']))
    .min(1)
    .default(['opened', 'synchronize']),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
});
export type CiPreviewQuery = z.infer<typeof CiPreviewQuery>;

/** Response of the preview route: the freshly generated bundle. */
export const CiPreview = z.object({
  files: z.array(CiFile),
  installation_id: z.string(),
  agent_version: z.number().int(),
  runner_version: z.string(),
});
export type CiPreview = z.infer<typeof CiPreview>;

export const CiInstallationState = z.enum(['pr_open', 'active', 'pr_closed']);
export type CiInstallationState = z.infer<typeof CiInstallationState>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: z.literal('gha'),
  state: CiInstallationState,
  agent_version: z.number().int(),
  runner_version: z.string(),
  pr_url: z.string().nullable(),
  /** True when the agent has a newer version than the installed bundle. */
  behind: z.boolean(),
  installed_at: z.string(),
  updated_at: z.string(),
  latest_run: z.object({ status: CiRunStatus, ran_at: z.string() }).nullable(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`, discriminated on `mode`. */
export const CiExportResult = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('open_pr'),
    installation: CiInstallation,
    pr_url: z.string(),
  }),
  z.object({
    mode: z.literal('zip'),
    filename: z.string(),
    zip_base64: z.string(),
  }),
]);
export type CiExportResult = z.infer<typeof CiExportResult>;

/** A CI run, joined with its `agent_runs` row — ingested from Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  repository: z.string(),
  pr_number: z.number().int().nullable(),
  agent: z.string().nullable(),
  verdict: Verdict.nullable(),
  findings_count: z.number().int().nullable(),
  blockers: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  head_sha: z.string().nullable(),
  job_url: z.string().nullable(),
  status: CiRunStatus,
  ran_at: z.string(),
});
export type CiRun = z.infer<typeof CiRun>;

/** Query of `GET /ci-runs`. */
export const CiRunsQuery = z.object({
  window: z.enum(['7d', 'all']).default('7d'),
  agent_id: z.string().uuid().optional(),
  repo: z.string().optional(),
  status: CiRunStatus.optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type CiRunsQuery = z.infer<typeof CiRunsQuery>;

/** Response of `GET /ci-runs`. */
export const CiRunsPage = z.object({
  runs: z.array(CiRun),
  warnings: z.array(z.object({ repo: z.string(), message: z.string() })),
  page: z.number().int(),
  has_more: z.boolean(),
});
export type CiRunsPage = z.infer<typeof CiRunsPage>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs`. The identity fields are
 * optional so old runner bundles still parse; the server verifies them against
 * GitHub's own run metadata. Unknown keys are stripped (zod default).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative().nullish(),
  warning: z.number().int().nonnegative().nullish(),
  suggestion: z.number().int().nonnegative().nullish(),
  cost_usd: z.number().nonnegative().nullable(),
  duration_ms: z.number().int().nonnegative().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
  repository: z.string().nullish(),
  repository_id: z.number().int().positive().nullish(),
  head_sha: z.string().nullish(),
  verdict: Verdict.nullish(),
  blockers: z.number().int().nonnegative().nullish(),
  run_id: z.number().int().positive().nullish(),
  run_attempt: z.number().int().positive().nullish(),
  installation_id: z.string().nullish(),
  model: z.string().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
