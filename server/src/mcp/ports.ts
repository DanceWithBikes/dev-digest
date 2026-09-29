import type {
  Agent,
  BlastRadius,
  ConventionCandidate,
  ReviewRecord,
  ReviewRunTarget,
  RunSummary,
} from '@devdigest/shared';
/**
 * `McpDeps` — the one port every tool handler depends on. Only `compose.ts`
 * knows the `Container` or a module's service; everything under `src/mcp/`
 * (this file included) talks to this interface instead — enforced by the
 * `mcp-tools-talk-to-ports` gate (`server/.dependency-cruiser.cjs`).
 */

/** Identify a PR either by its studio id, or by repo + number (never both —
 *  `helpers.ts#parsePrRef` is what turns raw tool args into this shape). */
export type PrRef = { kind: 'id'; prId: string } | { kind: 'repo'; fullName: string; number: number };

/** Select which agent(s) `run_agent_on_pr` should run. */
export type AgentSelection = { kind: 'agent'; agentId: string } | { kind: 'all' };

/** Identify a repo either by its studio id, or by "owner/name". */
export type RepoRef = { repoId?: string; fullName?: string };

export interface ResolvedRepo {
  id: string;
  owner: string;
  name: string;
}

export interface RunResult {
  run: RunSummary;
  /** null when the run has no persisted review yet (still running, or it
   *  failed before producing one) — the run's own status/error is on `run`. */
  review: ReviewRecord | null;
}

export interface McpDeps {
  /** The single local workspace this MCP server acts as (no multi-tenant
   *  concept here — `LocalNoAuthProvider` always resolves the same one). */
  workspaceId(): Promise<string>;

  listAgents(workspaceId: string): Promise<Agent[]>;

  /** Local-DB only — never syncs with GitHub. 404s (`NotFoundError`) when the
   *  repo/PR/agent isn't already imported/configured in this workspace. */
  resolveRepo(workspaceId: string, ref: RepoRef): Promise<ResolvedRepo>;

  runAgentOnPr(
    workspaceId: string,
    pr: PrRef,
    selection: AgentSelection,
  ): Promise<{ pr_id: string; runs: ReviewRunTarget[] }>;

  getRunResult(workspaceId: string, runId: string): Promise<RunResult>;

  /** Every candidate for the repo, whatever its status — the tool filters by
   *  `status` itself so it can report counts across all statuses. */
  listConventions(workspaceId: string, repoId: string): Promise<ConventionCandidate[]>;

  /** The skill body the accepted candidates would assemble right now. */
  previewConventionsSkillBody(workspaceId: string, repoId: string): Promise<string>;

  /** Same payload `GET /pulls/:id/blast` returns — read-only, index-only, no model call. */
  getBlastRadius(workspaceId: string, pr: PrRef): Promise<BlastRadius>;
}
