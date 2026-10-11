import type { Finding, Verdict } from '@devdigest/shared';
import { CiResultArtifact } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/** Runner version string embedded in every artifact (informational only). */
export const RUNNER_VERSION = '1';

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  agent: string;
  prNumber: number;
  /** Identity fields (AC-120); omitted when the workflow did not provide them. */
  repository?: string;
  repositoryId?: number;
  headSha?: string;
  /** Deterministic verdict from the gate, never the model's self-report (AC-121). */
  verdict: Verdict;
  blockers: number;
  runId?: number;
  runAttempt?: number;
  installationId?: string;
  model: string;
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/**
 * Build + validate the `devdigest-result.json` artifact (AC-26). Validated
 * against the SAME `CiResultArtifact` Zod contract the studio's ingest path
 * (T6) will `safeParse` on the way back in, so a malformed artifact fails
 * loudly here rather than silently on ingest.
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  const candidate = {
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    cost_usd: input.costUsd,
    duration_ms: input.durationMs,
    agent: input.agent,
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
    repository: input.repository,
    repository_id: input.repositoryId,
    head_sha: input.headSha,
    verdict: input.verdict,
    blockers: input.blockers,
    run_id: input.runId,
    run_attempt: input.runAttempt,
    installation_id: input.installationId,
    model: input.model,
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    // Should be unreachable — every field above is shaped to the schema. If
    // this ever fires it's a genuine internal bug, not a user/config error.
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}
