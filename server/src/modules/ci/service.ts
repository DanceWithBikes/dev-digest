import type {
  CiExportInput,
  CiExportResult,
  CiInstallation,
  CiPreview,
  CiPreviewQuery,
  CiRunsPage,
  CiRunsQuery,
} from '@devdigest/shared';
import {
  AppError,
  ConfigError,
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  NotFoundError,
} from '../../platform/errors.js';
import {
  AGENTS_DIR,
  BUNDLE_MARKER,
  CI_BRANCH,
  MAX_RUNNER_BYTES,
  PR_TITLE,
  SKILLS_DIR,
  WORKFLOW_PATH,
} from './constants.js';
import {
  patchWorkflow,
  stalePaths,
  validateEditedWorkflow,
  validateEdits,
} from './domain.js';
import type { BundleFile, RepoRecord } from './domain.js';
import {
  assertSafeSlugs,
  buildBundle,
  buildWorkflowYaml,
  githubStatusOf,
  installationIdFor,
  prNumberFromUrl,
  toCiRunDto,
  toInstallationDto,
  zipFiles,
  type SlugSet,
} from './helpers.js';
import type {
  AgentForCi,
  AgentSource,
  CiLog,
  CiStore,
  GitHubFactory,
  RunnerBundleSource,
} from './ports.js';

export interface CiServiceDeps {
  store: CiStore;
  agents: AgentSource;
  github: GitHubFactory;
  bundle: RunnerBundleSource;
  /** Pulls and verifies CI results before the runs list is read. */
  ingest: { refresh(workspaceId: string): Promise<{ repo: string; message: string }[]> };
  log: CiLog;
}

interface Prepared {
  agent: AgentForCi;
  repo: RepoRecord;
  runner: { contents: string; version: string };
  slugs: SlugSet;
  memory: { content: string; kind: string }[];
}

const BUILD_HINT = 'Build it: cd agent-runner && pnpm install && pnpm build';

/** Export-to-CI use cases: preview, install as PR or zip, installation list, CI runs list. */
export class CiService {
  constructor(private deps: CiServiceDeps) {}

  /** The freshly generated bundle for a repo; no GitHub call, nothing stored (AC-36). */
  async preview(workspaceId: string, agentId: string, query: CiPreviewQuery): Promise<CiPreview> {
    const prepared = await this.prepare(workspaceId, agentId, query.repo);
    const existing = await this.deps.store.findInstallationByRepo(workspaceId, query.repo);
    const installationId = existing?.agentId === agentId ? existing.id : installationIdFor(agentId, query.repo);
    const files = this.generate(prepared, installationId, query.triggers, query.post_as);
    return {
      files,
      installation_id: installationId,
      agent_version: prepared.agent.version,
      runner_version: prepared.runner.version,
    };
  }

  async export(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExportResult> {
    const prepared = await this.prepare(workspaceId, agentId, input.repo);
    const existing = await this.deps.store.findInstallationByRepo(workspaceId, input.repo);
    if (existing && existing.agentId !== agentId) {
      throw new ConflictError(
        `${input.repo} already has the DevDigest CI installation of another agent`,
        { agent_id: existing.agentId },
        'ci_repo_has_other_agent',
      );
    }
    const installationId = existing?.id ?? installationIdFor(agentId, input.repo);
    const generated = this.generate(prepared, installationId, input.triggers, input.post_as);
    const files = this.applyEdits(generated, input, installationId);

    if (input.mode === 'zip') {
      return {
        mode: 'zip',
        filename: `devdigest-ci-${prepared.repo.name}.zip`,
        zip_base64: zipFiles(files).toString('base64'),
      };
    }
    return this.openPr(workspaceId, prepared, installationId, files);
  }

  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    if (!(await this.deps.agents.getById(workspaceId, agentId))) throw new NotFoundError('Agent not found');
    const rows = await this.deps.store.listInstallations(workspaceId, agentId);
    return rows.map(toInstallationDto);
  }

  /** Refreshes from GitHub first (AC-48), then reads the stored runs. */
  async listRuns(workspaceId: string, query: CiRunsQuery): Promise<CiRunsPage> {
    const warnings = await this.deps.ingest.refresh(workspaceId);
    const { rows, hasMore } = await this.deps.store.listCiRuns(workspaceId, {
      window: query.window,
      agentId: query.agent_id,
      repo: query.repo,
      status: query.status,
      page: query.page,
    });
    return { runs: rows.map(toCiRunDto), warnings, page: query.page, has_more: hasMore };
  }

  // ---- private ------------------------------------------------------------

  /** Agent → repo → runner bundle → enabled skills + slugs → memory, in that order. */
  private async prepare(workspaceId: string, agentId: string, repoFullName: string): Promise<Prepared> {
    const { store, agents, bundle } = this.deps;
    const agent = await agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const repo = await store.findRepoByFullName(workspaceId, repoFullName);
    if (!repo) throw new NotFoundError(`Repository ${repoFullName} is not imported`);

    const runner = await bundle.read();
    if (!runner) throw new ConfigError(`Runner bundle not found. ${BUILD_HINT}`);
    if (runner.bytes > MAX_RUNNER_BYTES) {
      throw new ConfigError(`Runner bundle is ${runner.bytes} bytes; the limit is ${MAX_RUNNER_BYTES}`);
    }

    const linked = await agents.linkedSkills(agentId);
    const enabled = linked.map((l) => l.skill).filter((s) => s.enabled);
    const slugs = assertSafeSlugs(agent.name, enabled);
    const memory = await store.memoryForRepo(workspaceId, repo.id);
    return { agent, repo, runner, slugs, memory };
  }

  private generate(
    p: Prepared,
    installationId: string,
    triggers: CiPreviewQuery['triggers'],
    postAs: CiPreviewQuery['post_as'],
  ): BundleFile[] {
    return buildBundle({
      agent: p.agent,
      slugs: p.slugs,
      memory: p.memory,
      runner: p.runner.contents,
      workflow: buildWorkflowYaml({ triggers, postAs, installationId }),
    });
  }

  /** Wizard edits onto the generated files; an edited workflow is validated, re-patched, re-validated. */
  private applyEdits(generated: BundleFile[], input: CiExportInput, installationId: string): BundleFile[] {
    validateEdits(input.edits, generated);
    const byPath = new Map(input.edits.map((e) => [e.path, e.contents]));
    return generated.map((f) => {
      const edited = byPath.get(f.path);
      if (edited === undefined) return f;
      if (f.path !== WORKFLOW_PATH) return { ...f, contents: edited };
      validateEditedWorkflow(edited);
      const patched = patchWorkflow(edited, {
        triggers: input.triggers,
        postAs: input.post_as,
        installationId,
      });
      validateEditedWorkflow(patched);
      return { ...f, contents: patched };
    });
  }

  private async openPr(
    workspaceId: string,
    p: Prepared,
    installationId: string,
    files: BundleFile[],
  ): Promise<CiExportResult> {
    const { repo, agent } = p;
    const ref = { owner: repo.owner, name: repo.name };
    // Only errors thrown by GitHub calls are mapped; store errors propagate unchanged.
    const { info, pr } = await this.github(repo.fullName, async () => {
      const gh = await this.deps.github();
      const info = await gh.getRepository(ref);

      // AC-42: commitFiles force-moves an existing branch, so check first.
      const compare = await gh.compareCommits(ref, repo.defaultBranch, CI_BRANCH);
      if (compare?.commits.some((c) => !c.message.includes(BUNDLE_MARKER))) {
        throw new ConflictError(
          `Branch ${CI_BRANCH} has commits that DevDigest did not write; resolve it on GitHub first`,
          undefined,
          'ci_branch_foreign_commit',
        );
      }

      // AC-139: drop manifests / skills this bundle no longer contains.
      const parent = compare === null ? repo.defaultBranch : CI_BRANCH;
      const existing = await gh.listTreePaths(ref, parent, [AGENTS_DIR, SKILLS_DIR]);
      const deletePaths = stalePaths(existing, files.map((f) => f.path));

      await gh.commitFiles(ref, {
        branch: CI_BRANCH,
        base: repo.defaultBranch,
        message: `Add DevDigest CI review for ${agent.name}\n\n${BUNDLE_MARKER}`,
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
        ...(deletePaths.length > 0 ? { deletePaths } : {}),
      });

      const pr =
        (await gh.findOpenPr(ref, CI_BRANCH)) ??
        (await gh.openPullRequest(ref, {
          title: PR_TITLE,
          head: CI_BRANCH,
          base: repo.defaultBranch,
          body: prBody(agent.name),
        }));
      return { info, pr };
    });

    const installation = await this.deps.store.upsertInstallation({
      workspaceId,
      id: installationId,
      agentId: agent.id,
      repoId: repo.id,
      repo: repo.fullName,
      githubRepoId: info.id,
      agentVersion: agent.version,
      runnerVersion: p.runner.version,
      prUrl: pr.url,
      prNumber: prNumberFromUrl(pr.url),
    });
    return { mode: 'open_pr', installation: toInstallationDto(installation), pr_url: pr.url };
  }

  /** Runs a block of GitHub calls, translating its failures (and only those). */
  private async github<T>(fullName: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.mapGitHubError(err, fullName);
    }
  }

  /** AC-43: 403 / 404 → one clear write-access error; our own errors pass through. */
  private mapGitHubError(err: unknown, fullName: string): Error {
    if (err instanceof AppError) return err;
    const status = githubStatusOf(err);
    if (status === 403 || status === 404) {
      return new ForbiddenError(`token lacks write access to ${fullName}`, undefined, 'github_write_denied');
    }
    this.deps.log.warn({ repo: fullName, status }, 'ci export: GitHub request failed');
    return new ExternalServiceError(`GitHub request failed for ${fullName}`);
  }
}

function prBody(agentName: string): string {
  return [
    `Adds the DevDigest CI review for the agent "${agentName}".`,
    '',
    'Files: the agent manifest, its skills, repo memory, the pinned runner bundle and a least-privilege GitHub Actions workflow.',
    'Set the `OPENROUTER_API_KEY` repository secret before merging.',
  ].join('\n');
}
