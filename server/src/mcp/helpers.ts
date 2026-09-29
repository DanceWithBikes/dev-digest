import type { ConventionCandidate, Severity } from '@devdigest/shared';
import { ValidationError } from '../platform/errors.js';
import type { AgentSelection, PrRef, RepoRef } from './ports.js';
import type { ConventionStatusFilter } from './schemas.js';

/**
 * Pure helpers shared by the tool handlers: turning raw (already zod-parsed)
 * tool arguments into the discriminated shapes `ports.ts` declares, plus the
 * severity filter and truncation logic for `get_findings`. `platform/errors.ts`
 * is the one `src/platform/` import `mcp-tools-talk-to-ports` allows here.
 */

/**
 * `run_agent_on_pr` identifies the PR by EITHER `pr_id` OR `repo` + `number` —
 * never both, never neither (user decision, `docs/specs/devdigest-mcp.md`).
 */
export function parsePrRef(input: { pr_id?: string; repo?: string; number?: number }): PrRef {
  const hasId = input.pr_id !== undefined;
  const hasRepoRef = input.repo !== undefined || input.number !== undefined;
  if (hasId && hasRepoRef) {
    throw new ValidationError('Provide either pr_id, or repo + number — not both.');
  }
  if (hasId) return { kind: 'id', prId: input.pr_id! };
  if (input.repo !== undefined && input.number !== undefined) {
    return { kind: 'repo', fullName: input.repo, number: input.number };
  }
  throw new ValidationError('Provide either pr_id, or both repo ("owner/name") and number.');
}

/**
 * `run_agent_on_pr` requires an explicit `agent_id` OR `all: true` — never
 * both, never neither (user decision: no implicit "run everything").
 */
export function parseAgentSelection(input: { agent_id?: string; all?: true }): AgentSelection {
  const hasAgent = input.agent_id !== undefined;
  const hasAll = input.all !== undefined;
  if (hasAgent && hasAll) {
    throw new ValidationError('Provide either agent_id or all:true — not both.');
  }
  if (hasAgent) return { kind: 'agent', agentId: input.agent_id! };
  if (hasAll) return { kind: 'all' };
  throw new ValidationError('Provide agent_id, or all:true to run every enabled agent.');
}

/** `get_conventions` identifies the repo by EITHER `repo_id` OR `repo`. */
export function parseRepoRef(input: { repo_id?: string; repo?: string }): RepoRef {
  if (input.repo_id !== undefined && input.repo !== undefined) {
    throw new ValidationError('Provide either repo_id or repo — not both.');
  }
  if (input.repo_id !== undefined) return { repoId: input.repo_id };
  if (input.repo !== undefined) return { fullName: input.repo };
  throw new ValidationError('Provide repo_id, or repo ("owner/name").');
}

const SEVERITY_RANK: Record<Severity, number> = { SUGGESTION: 0, WARNING: 1, CRITICAL: 2 };

/** True when `severity` is at or above `min` (`CRITICAL` > `WARNING` > `SUGGESTION`). */
export function severityAtLeast(severity: Severity, min: Severity): boolean {
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[min];
}

/** Findings at or above `minSeverity` (all of them when it's omitted). */
export function filterBySeverity<T extends { severity: Severity }>(
  findings: T[],
  minSeverity: Severity | undefined,
): T[] {
  return minSeverity === undefined ? findings : findings.filter((f) => severityAtLeast(f.severity, minSeverity));
}

/** `conventions[]` narrowed to the requested `status` (`'all'` = no filter). */
export function filterByStatus(
  conventions: ConventionCandidate[],
  status: ConventionStatusFilter,
): ConventionCandidate[] {
  return status === 'all' ? conventions : conventions.filter((c) => c.status === status);
}

/** Counts across ALL statuses, independent of the requested filter — so a
 *  caller viewing `pending` still sees the accepted/rejected totals. */
export function countByStatus(
  conventions: ConventionCandidate[],
): { accepted: number; pending: number; rejected: number } {
  const counts = { accepted: 0, pending: 0, rejected: 0 };
  for (const c of conventions) counts[c.status]++;
  return counts;
}
