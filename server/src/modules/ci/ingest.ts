import { CiResultArtifact } from '@devdigest/shared';
import { AppError } from '../../platform/errors.js';
import {
  ARTIFACT_FILE,
  ARTIFACT_NAME,
  INGEST_RUNS_PER_PAGE,
  MAX_ARTIFACT_BYTES,
  WORKFLOW_FILE,
} from './constants.js';
import { pullMatchesRun, shouldIngest, statusFor, verifyArtifact } from './domain.js';
import type { InstallationRecord } from './domain.js';
import { githubStatusOf, readSingleZipEntry, ZipError } from './helpers.js';
import type { CiGitHub, CiLog, CiStore, GitHubFactory } from './ports.js';

export interface IngestDeps {
  store: CiStore;
  github: GitHubFactory;
  log: CiLog;
}

export interface IngestWarning {
  repo: string;
  message: string;
}

type WorkflowRun = Awaited<ReturnType<CiGitHub['listWorkflowRuns']>>[number];

/**
 * Pull-based ingest of CI results. For every installation in the workspace it
 * lists the workflow's completed runs, downloads each run's `devdigest-result`
 * artifact with the server's own token, verifies it against GitHub's run
 * metadata, and only then records an `agent_runs` row with source 'ci'.
 * A rejection writes one log line (reason only — never the artifact body or a
 * token) and stores nothing.
 */
/** A failure while ingesting one workflow run; carries the run id for the NFR-8 log line. */
class RunIngestError extends Error {
  constructor(
    readonly runId: number,
    readonly cause: unknown,
  ) {
    super('ci ingest: run failed');
  }
}

export class CiIngest {
  constructor(private deps: IngestDeps) {}

  /** Refresh every installation in parallel; a failing repo becomes a warning, never a throw. */
  async refresh(workspaceId: string): Promise<IngestWarning[]> {
    const installations = await this.deps.store.listInstallations(workspaceId);
    const results = await Promise.allSettled(
      installations.map((inst) => this.refreshOne(workspaceId, inst)),
    );
    const warnings: IngestWarning[] = [];
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') return;
      const repo = installations[i]!.repo;
      const failure = res.reason instanceof RunIngestError ? res.reason : null;
      const message = describeFailure(failure ? failure.cause : res.reason);
      this.deps.log.warn(
        failure ? { repo, runId: failure.runId, reason: message } : { repo, reason: message },
        'ci ingest: GitHub request failed',
      );
      warnings.push({ repo, message });
    });
    return warnings;
  }

  private async refreshOne(workspaceId: string, inst: InstallationRecord): Promise<void> {
    const { store, log } = this.deps;
    const gh = await this.deps.github();
    const [owner, name] = inst.repo.split('/') as [string, string];
    const ref = { owner, name };

    const runs = await gh.listWorkflowRuns(ref, WORKFLOW_FILE, {
      status: 'completed',
      perPage: INGEST_RUNS_PER_PAGE,
    });
    const known = await store.ingestedKeys(workspaceId, inst.id);
    let stored = 0;
    for (const run of runs) {
      if (!shouldIngest(run)) continue;
      if (known.has(`${run.id}:${run.run_attempt}`)) continue;
      let wrote: boolean;
      try {
        wrote = await this.ingestRun(gh, workspaceId, inst, ref, run);
      } catch (err) {
        throw new RunIngestError(run.id, err);
      }
      if (wrote) stored += 1;
    }

    let state = inst.state;
    if (state === 'pr_open' && stored > 0) {
      await store.setInstallationState(workspaceId, inst.id, 'active');
      state = 'active';
    }
    if (state === 'pr_open' && inst.prNumber !== null) {
      const pr = await gh.getPullState(ref, inst.prNumber);
      if (pr === 'merged') {
        await store.setInstallationState(workspaceId, inst.id, 'active');
      } else if (pr === 'closed' && !(await store.hasIngestedRun(workspaceId, inst.id))) {
        await store.setInstallationState(workspaceId, inst.id, 'pr_closed');
      }
    }
    log.info({ repo: inst.repo, stored }, 'ci ingest: refreshed');
  }

  /** True when a new run was stored. */
  private async ingestRun(
    gh: CiGitHub,
    workspaceId: string,
    inst: InstallationRecord,
    ref: { owner: string; name: string },
    run: WorkflowRun,
  ): Promise<boolean> {
    const base = {
      workspaceId,
      installationId: inst.id,
      agentId: inst.agentId,
      repo: inst.repo,
      headSha: run.head_sha,
      githubRunId: run.id,
      runAttempt: run.run_attempt,
      jobUrl: run.html_url,
      ranAt: new Date(run.updated_at),
    };

    const artifacts = await gh.listRunArtifacts(ref, run.id);
    const meta = artifacts.find((a) => a.name === ARTIFACT_NAME && !a.expired);
    if (!meta) {
      // AC-61: no artifact (also a cancelled run) → failed, metadata from GitHub only.
      return this.deps.store.insertCiRun({
        ...base,
        prNumber: run.pull_numbers[0] ?? null,
        artifactId: null,
        status: 'failed',
        model: null,
        durationMs: null,
        costUsd: null,
        findingsCount: null,
        blockers: null,
      });
    }
    if (meta.size_in_bytes > MAX_ARTIFACT_BYTES) return this.reject(inst, run, 'oversized');

    const zip = await gh.downloadArtifact(ref, meta.id);
    let text: string;
    try {
      text = readSingleZipEntry(zip, ARTIFACT_FILE, MAX_ARTIFACT_BYTES);
    } catch (err) {
      return this.reject(inst, run, err instanceof ZipError ? err.reason : 'malformed');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return this.reject(inst, run, 'invalid_json');
    }
    const parsed = CiResultArtifact.safeParse(json);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}:${i.code}`).join(',');
      return this.reject(inst, run, `schema:${issues}`);
    }
    const artifact = parsed.data;
    const pullVerified =
      run.pull_numbers.length === 0 && artifact.pr_number != null
        ? await this.pullBelongsToRun(gh, ref, artifact.pr_number, run)
        : false;
    const mismatch = verifyArtifact(artifact, run, inst, pullVerified);
    if (mismatch) return this.reject(inst, run, `mismatch:${mismatch.field}`);

    return this.deps.store.insertCiRun({
      ...base,
      prNumber: artifact.pr_number ?? null,
      artifactId: meta.id,
      status: statusFor(artifact),
      model: artifact.model ?? null,
      durationMs: artifact.duration_ms ?? null,
      costUsd: artifact.cost_usd,
      findingsCount: artifact.findings_count,
      blockers: artifact.blockers ?? null,
    });
  }

  /**
   * GitHub empties a run's `pull_numbers` after a merge or branch deletion, so
   * the artifact's PR is checked in the installation's own repo instead.
   */
  private async pullBelongsToRun(
    gh: CiGitHub,
    ref: { owner: string; name: string },
    prNumber: number,
    run: WorkflowRun,
  ): Promise<boolean> {
    try {
      const pr = await gh.getPullRequest(ref, prNumber);
      return pullMatchesRun({ head_ref: pr.branch, head_sha: pr.head_sha }, run);
    } catch {
      return false;
    }
  }

  /** Exactly one warn line per rejection; the reason names a field or issue path, never a value. */
  private reject(inst: InstallationRecord, run: WorkflowRun, reason: string): false {
    this.deps.log.warn({ repo: inst.repo, runId: run.id, reason }, 'ci ingest: artifact rejected');
    return false;
  }
}

/** A short, secret-free description of why a repo could not be refreshed. */
function describeFailure(err: unknown): string {
  if (err instanceof AppError) return err.message;
  const status = githubStatusOf(err);
  return status ? `GitHub request failed (${status})` : 'GitHub request failed';
}
