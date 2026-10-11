/**
 * SPEC-05 Export to CI — server integration (Step T1).
 *
 * Pins, through real `app.inject` calls on a seeded Postgres, the whole ci
 * module: bundle preview, PR install (one commit on `devdigest/ci`, stale-file
 * deletion, one installation per repo), zip install, pull-based ingest of CI
 * results through `GET /ci-runs` (verification, idempotency, PR linking, cost,
 * state transitions, exclusions), the installations list and the runs filters.
 * GitHub is an in-memory mock and the runner bundle a `MockRunnerBundleSource`;
 * no network, no model. Each test builds its own agent / repo rows with unique
 * names, and `beforeEach` clears every CI row because ingest refreshes ALL
 * installations of the (single) workspace.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { eq, and, count } from 'drizzle-orm';
import { parse, stringify } from 'yaml';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockEmbedder,
  MockGitHubClient,
  MockRunnerBundleSource,
  type MockGitHubOptions,
} from '../src/adapters/mocks.js';
import { readSingleZipEntry, zipFiles } from '../src/modules/ci/helpers.js';
import {
  CI_BRANCH,
  BUNDLE_MARKER,
  MAX_ARTIFACT_BYTES,
  RUNNER_PACKAGE_JSON,
  WORKFLOW_PATH,
} from '../src/modules/ci/constants.js';
import type { GitHubClient, RepoRef, WorkflowRunMeta } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

// ---------------------------------------------------------------------------
// GitHub doubles
// ---------------------------------------------------------------------------

/** Mock whose workflow runs are per repo and whose listing can fail per repo (AC-65). */
class RepoRunsGitHub extends MockGitHubClient {
  failRepos = new Set<string>();
  constructor(
    private runsByRepo: Record<string, WorkflowRunMeta[]> = {},
    opts: MockGitHubOptions = {},
  ) {
    super(opts);
  }
  override async listWorkflowRuns(repo: RepoRef): Promise<WorkflowRunMeta[]> {
    const full = `${repo.owner}/${repo.name}`;
    if (this.failRepos.has(full)) throw Object.assign(new Error('forbidden'), { status: 403 });
    return this.runsByRepo[full] ?? [];
  }
}

/** Wraps a GitHub client and records the name of every method called on it. */
function spy<T extends object>(gh: T) {
  const calls: string[] = [];
  const proxy = new Proxy(gh, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target);
      if (typeof v === 'function' && typeof prop === 'string') {
        return (...args: unknown[]) => {
          calls.push(prop);
          return v.apply(target, args);
        };
      }
      return v;
    },
  });
  return { gh: proxy as T, calls };
}

// ---------------------------------------------------------------------------
// Artifact / run fixtures
// ---------------------------------------------------------------------------

interface Fx {
  inst: string; // installation id
  repo: string; // owner/name
  runId: number;
  sha: string;
  pr: number;
}

const artifactJson = (fx: Fx, over: Record<string, unknown> = {}) => ({
  findings_count: 3,
  cost_usd: 0.0123,
  duration_ms: 4200,
  agent: 'string the artifact claims',
  pr_number: fx.pr,
  repository: fx.repo,
  repository_id: 4242,
  head_sha: fx.sha,
  installation_id: fx.inst,
  blockers: 1,
  model: 'test/model',
  ...over,
});

const zipOf = (json: unknown, name = 'devdigest-result.json') =>
  zipFiles([{ path: name, contents: typeof json === 'string' ? json : JSON.stringify(json) }]);

const runMeta = (fx: Fx, over: Partial<WorkflowRunMeta> = {}): WorkflowRunMeta => ({
  id: fx.runId,
  run_attempt: 1,
  head_sha: fx.sha,
  head_branch: 'feature/x',
  conclusion: 'success',
  html_url: `https://github.com/${fx.repo}/actions/runs/${fx.runId}`,
  repository: { id: 4242, full_name: fx.repo },
  pull_numbers: [fx.pr],
  updated_at: new Date().toISOString(),
  ...over,
});

/** The artifact meta + zip for a run, in the shape `MockGitHubOptions` expects. */
function withArtifact(fx: Fx, json: unknown, opts: { size?: number; zip?: Uint8Array } = {}) {
  const zip = opts.zip ?? zipOf(json);
  const id = fx.runId + 1000;
  return {
    artifacts: { [fx.runId]: [{ id, name: 'devdigest-result', size_in_bytes: opts.size ?? zip.length, expired: false }] },
    artifactZips: { [id]: zip },
  };
}

// ---------------------------------------------------------------------------

d('SPEC-05 export to CI (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const uid = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });
  beforeEach(async () => {
    const db = pg.handle.db;
    await db.delete(t.ciRuns);
    await db.delete(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));
    await db.delete(t.ciInstallations);
  });

  const db = () => pg.handle.db;

  async function appWith(gh: GitHubClient, bundle: string | null = '// mock runner\n') {
    return buildApp({
      config: config(),
      db: db(),
      overrides: {
        github: gh,
        embedder: new MockEmbedder(),
        runnerBundle: new MockRunnerBundleSource(bundle) as never,
      },
    });
  }
  type App = Awaited<ReturnType<typeof appWith>>;

  async function mkAgent(over: Partial<typeof t.agents.$inferInsert> = {}) {
    const [row] = await db()
      .insert(t.agents)
      .values({
        workspaceId,
        name: `CI Agent ${uid()}`,
        provider: 'openrouter',
        model: 'm',
        systemPrompt: 'review carefully',
        ...over,
      })
      .returning();
    return row!;
  }
  async function mkSkill(agentId: string, name: string, over: { enabled?: boolean; body?: string } = {}) {
    const [skill] = await db()
      .insert(t.skills)
      .values({
        workspaceId,
        name,
        description: 'd',
        type: 'custom',
        source: 'manual',
        body: over.body ?? `# ${name}\n`,
        enabled: over.enabled ?? true,
      })
      .returning();
    await db().insert(t.agentSkills).values({ agentId, skillId: skill!.id, order: 0 });
    return skill!;
  }
  async function mkRepo(defaultBranch = 'main') {
    const owner = 'acme';
    const name = `ci-${uid()}`;
    const [row] = await db()
      .insert(t.repos)
      .values({ workspaceId, owner, name, fullName: `${owner}/${name}`, defaultBranch })
      .returning();
    return row!;
  }
  async function mkInstallation(agentId: string, repo: string, over: Partial<typeof t.ciInstallations.$inferInsert> = {}) {
    const [row] = await db()
      .insert(t.ciInstallations)
      .values({
        workspaceId,
        agentId,
        repo,
        githubRepoId: 4242,
        targetType: 'gha',
        state: 'pr_open',
        agentVersion: 1,
        runnerVersion: 'mockrunner01',
        prUrl: 'https://github.com/acme/x/pull/7',
        prNumber: 7,
        ...over,
      })
      .returning();
    return row!;
  }

  const preview = (app: App, agentId: string, repo: string, qs = '') =>
    app.inject({ method: 'GET', url: `/agents/${agentId}/export-ci/preview?repo=${encodeURIComponent(repo)}${qs}` });
  const exportCi = (app: App, agentId: string, body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/agents/${agentId}/export-ci`, payload: body });
  const runsList = (app: App, qs = '') => app.inject({ method: 'GET', url: `/ci-runs${qs}` });

  /** Preview's generated workflow, parsed, mutated and re-serialised — the "wizard edit". */
  async function editedWorkflow(app: App, agentId: string, repo: string, mutate: (wf: any) => void) {
    const res = await preview(app, agentId, repo);
    const file = res.json().files.find((f: any) => f.path === WORKFLOW_PATH);
    const wf = parse(file.contents);
    mutate(wf);
    return stringify(wf);
  }

  // =========================================================================
  describe('preview (GET /agents/:id/export-ci/preview)', () => {
    it('returns exactly the six bundle files with editable flags on workflow and skills only (AC-8, AC-12, AC-13)', async () => {
      const agent = await mkAgent({ name: 'Security / OWASP Reviewer' });
      await mkSkill(agent.id, 'Auth Checks');
      await mkSkill(agent.id, 'Dormant Skill', { enabled: false });
      const repo = await mkRepo();
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh);

      const res = await preview(app, agent.id, repo.fullName);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const byPath = Object.fromEntries(body.files.map((f: any) => [f.path, f]));
      expect(Object.keys(byPath).sort()).toEqual(
        [
          '.devdigest/agents/security-owasp-reviewer.yaml',
          '.devdigest/memory.jsonl',
          '.devdigest/runner/index.js',
          '.devdigest/runner/package.json',
          '.devdigest/skills/auth-checks.md',
          '.github/workflows/devdigest-review.yml',
        ].sort(),
      );
      expect(byPath['.devdigest/runner/package.json'].contents).toBe(RUNNER_PACKAGE_JSON);
      expect(byPath['.devdigest/runner/index.js'].contents).toBe('// mock runner\n');
      const editable = body.files.filter((f: any) => f.editable).map((f: any) => f.path).sort();
      expect(editable).toEqual(['.devdigest/skills/auth-checks.md', '.github/workflows/devdigest-review.yml']);
      expect(body.runner_version).toBe('mockrunner01');
      expect(body.agent_version).toBe(agent.version);
      expect(calls).toEqual([]); // the preview never talks to GitHub (AC-36 area)
      await app.close();
    });

    it('writes repo + global memory as {content, kind} lines and excludes other repos (AC-10)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const other = await mkRepo();
      const tag = uid();
      await db().insert(t.memory).values([
        { workspaceId, scope: 'repo', repoId: repo.id, kind: 'fact', content: `repo-${tag}` },
        { workspaceId, scope: 'global', kind: 'convention', content: `global-${tag}` },
        { workspaceId, scope: 'repo', repoId: other.id, kind: 'fact', content: `other-${tag}` },
      ]);
      const app = await appWith(new MockGitHubClient());

      const res = await preview(app, agent.id, repo.fullName);
      const file = res.json().files.find((f: any) => f.path === '.devdigest/memory.jsonl');
      const lines = file.contents.split('\n').filter(Boolean).map((l: string) => JSON.parse(l));
      expect(lines).toContainEqual({ content: `repo-${tag}`, kind: 'fact' });
      expect(lines).toContainEqual({ content: `global-${tag}`, kind: 'convention' });
      expect(lines.map((l: any) => l.content)).not.toContain(`other-${tag}`);
      for (const l of lines) expect(Object.keys(l).sort()).toEqual(['content', 'kind']);
      await app.close();
    });

    it('writes a 0-byte memory file when the workspace has no applicable memory (AC-11)', async () => {
      await db().delete(t.memory);
      const agent = await mkAgent();
      const repo = await mkRepo();
      const app = await appWith(new MockGitHubClient());

      const res = await preview(app, agent.id, repo.fullName);
      const file = res.json().files.find((f: any) => f.path === '.devdigest/memory.jsonl');
      expect(file.contents).toBe('');
      await app.close();
    });

    it('applies the requested triggers from a single-valued query string', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const app = await appWith(new MockGitHubClient());

      const res = await preview(app, agent.id, repo.fullName, '&triggers=reopened&post_as=none');
      const wf = parse(res.json().files.find((f: any) => f.path === WORKFLOW_PATH).contents);
      expect(wf.on.pull_request.types).toEqual(['reopened']);
      const runStep = wf.jobs.review.steps.find((s: any) => s.run);
      expect(runStep.env.DEVDIGEST_POST_AS).toBe('none');
      await app.close();
    });

    it('answers 404 with zero GitHub calls for a repo that is not imported (AC-17)', async () => {
      const agent = await mkAgent();
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh);

      const res = await preview(app, agent.id, 'acme/never-imported');
      expect(res.statusCode).toBe(404);
      expect(calls).toEqual([]);
      await app.close();
    });

    it('answers 404 for an unknown agent', async () => {
      const repo = await mkRepo();
      const app = await appWith(new MockGitHubClient());
      const res = await preview(app, '00000000-0000-4000-8000-000000000000', repo.fullName);
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('fails with a message pointing at the agent-runner build when the bundle is missing (AC-14)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh, null);

      const prev = await preview(app, agent.id, repo.fullName);
      const inst = await exportCi(app, agent.id, { repo: repo.fullName, mode: 'open_pr' });
      for (const res of [prev, inst]) {
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.json().error.message).toMatch(/agent-runner/);
      }
      expect(calls).toEqual([]);
      await app.close();
    });

    it('rejects a skill whose slug contains ".." with 422 naming the skill (AC-16)', async () => {
      const agent = await mkAgent();
      await mkSkill(agent.id, 'v1..v2');
      const repo = await mkRepo();
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh);

      const prev = await preview(app, agent.id, repo.fullName);
      const inst = await exportCi(app, agent.id, { repo: repo.fullName, mode: 'open_pr' });
      for (const res of [prev, inst]) {
        expect(res.statusCode).toBe(422);
        expect(res.json().error.message).toContain('v1..v2');
      }
      expect(calls).toEqual([]);
      await app.close();
    });

    it('rejects two enabled skills with the same slug, naming both (AC-134)', async () => {
      const agent = await mkAgent();
      await mkSkill(agent.id, 'Auth Checks');
      await mkSkill(agent.id, 'auth checks');
      const repo = await mkRepo();
      const app = await appWith(new MockGitHubClient());

      const res = await preview(app, agent.id, repo.fullName);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toContain('Auth Checks');
      expect(res.json().error.message).toContain('auth checks');
      await app.close();
    });

    it('rejects a name that slugifies to empty with 422 (AC-134)', async () => {
      const agent = await mkAgent({ name: '!!!' });
      const repo = await mkRepo();
      const app = await appWith(new MockGitHubClient());

      const res = await preview(app, agent.id, repo.fullName);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.message).toContain('!!!');
      await app.close();
    });

    it('rejects an unknown trigger type with 422', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const app = await appWith(new MockGitHubClient());
      const res = await preview(app, agent.id, repo.fullName, '&triggers=closed');
      expect(res.statusCode).toBe(422);
      await app.close();
    });
  });

  // =========================================================================
  describe('PR install (POST /agents/:id/export-ci, mode open_pr)', () => {
    it('commits the whole bundle as one commit on devdigest/ci, opens the PR and records one pr_open installation (AC-37..41, AC-44)', async () => {
      const agent = await mkAgent();
      await mkSkill(agent.id, 'Auth Checks');
      const repo = await mkRepo('trunk');
      const gh = new MockGitHubClient();
      const app = await appWith(gh);
      const generated = (await preview(app, agent.id, repo.fullName)).json().files.map((f: any) => f.path).sort();

      const res = await exportCi(app, agent.id, { repo: repo.fullName, mode: 'open_pr' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe('open_pr');
      expect(body.pr_url).toBe('https://github.com/mock/mock/pull/1');
      expect(body.installation.state).toBe('pr_open');
      expect(gh.committed).toHaveLength(1);
      const commit = gh.committed[0]!;
      expect(commit.branch).toBe(CI_BRANCH);
      expect(commit.base).toBe('trunk'); // created from the workspace's recorded default branch (AC-39)
      expect(commit.message).toContain(BUNDLE_MARKER);
      expect(commit.files.map((f) => f.path).sort()).toEqual(generated);
      expect(commit.deletePaths).toBeUndefined();
      expect(gh.openedPrs).toHaveLength(1);
      expect(gh.openedPrs[0]).toMatchObject({ title: 'Add DevDigest CI review', head: CI_BRANCH, base: 'trunk' });

      const rows = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.repo, repo.fullName));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        agentId: agent.id,
        state: 'pr_open',
        githubRepoId: 4242,
        agentVersion: agent.version,
        runnerVersion: 'mockrunner01',
        prUrl: 'https://github.com/mock/mock/pull/1',
        prNumber: 1,
      });
      await app.close();
    });

    it('updates the same installation and reuses the open PR on a repeat install (AC-40, AC-45)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const gh = new MockGitHubClient();
      const app = await appWith(gh);

      const first = await exportCi(app, agent.id, { repo: repo.fullName });
      const second = await exportCi(app, agent.id, { repo: repo.fullName });

      expect(second.statusCode).toBe(200);
      expect(second.json().installation.id).toBe(first.json().installation.id);
      expect(gh.committed).toHaveLength(2);
      expect(gh.openedPrs).toHaveLength(1);
      const [{ n }] = await db()
        .select({ n: count() })
        .from(t.ciInstallations)
        .where(eq(t.ciInstallations.repo, repo.fullName));
      expect(n).toBe(1);
      await app.close();
    });

    it('refuses with 409 when devdigest/ci holds a commit DevDigest did not write, leaving the branch alone (AC-42)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const gh = new MockGitHubClient();
      gh.committed.push({ branch: CI_BRANCH, base: 'main', message: 'someone else was here', files: [] });
      const app = await appWith(gh);

      const res = await exportCi(app, agent.id, { repo: repo.fullName });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ci_branch_foreign_commit');
      expect(gh.committed).toHaveLength(1);
      expect(gh.openedPrs).toHaveLength(0);
      expect(await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.repo, repo.fullName))).toHaveLength(0);
      await app.close();
    });

    it('maps a GitHub 403 on the write to "token lacks write access" and records no installation (AC-43)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const gh = new MockGitHubClient();
      gh.commitFiles = async () => {
        throw Object.assign(new Error('Resource not accessible'), { status: 403 });
      };
      const app = await appWith(gh);

      const res = await exportCi(app, agent.id, { repo: repo.fullName });

      expect(res.statusCode).toBe(403);
      expect(res.json().error.message).toBe(`token lacks write access to ${repo.fullName}`);
      expect(await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.repo, repo.fullName))).toHaveLength(0);
      await app.close();
    });

    it('applies an edited skill and re-enforces the Configure choices on an edited workflow (AC-37, AC-135..137)', async () => {
      const agent = await mkAgent();
      await mkSkill(agent.id, 'Auth Checks');
      const repo = await mkRepo();
      const gh = new MockGitHubClient();
      const app = await appWith(gh);
      const wfText = (await editedWorkflow(app, agent.id, repo.fullName, () => {})) + '# keep this comment\n';

      const res = await exportCi(app, agent.id, {
        repo: repo.fullName,
        triggers: ['reopened'],
        post_as: 'none',
        edits: [
          { path: WORKFLOW_PATH, contents: wfText },
          { path: '.devdigest/skills/auth-checks.md', contents: '# edited skill\n' },
        ],
      });

      expect(res.statusCode).toBe(200);
      const files = Object.fromEntries(gh.committed[0]!.files.map((f) => [f.path, f.contents]));
      expect(files['.devdigest/skills/auth-checks.md']).toBe('# edited skill\n');
      const committed = files[WORKFLOW_PATH]!;
      const wf = parse(committed);
      expect(wf.on.pull_request.types).toEqual(['reopened']);
      expect(wf.jobs.review.steps.find((s: any) => s.run).env.DEVDIGEST_POST_AS).toBe('none');
      expect(committed).toContain('# keep this comment');
      await app.close();
    });

    it('deletes the previous manifest and removed skills in the same commit, never other paths (AC-37, AC-139)', async () => {
      const agent = await mkAgent({ name: 'Old Name' });
      const skill = await mkSkill(agent.id, 'Old Skill');
      const repo = await mkRepo();
      const gh = new MockGitHubClient();
      const app = await appWith(gh);
      expect((await exportCi(app, agent.id, { repo: repo.fullName })).statusCode).toBe(200);
      expect(gh.committed[0]!.files.map((f) => f.path)).toContain('.devdigest/agents/old-name.yaml');

      await db().update(t.agents).set({ name: 'New Name' }).where(eq(t.agents.id, agent.id));
      await db().delete(t.agentSkills).where(and(eq(t.agentSkills.agentId, agent.id), eq(t.agentSkills.skillId, skill.id)));
      const res = await exportCi(app, agent.id, { repo: repo.fullName });

      expect(res.statusCode).toBe(200);
      expect(gh.committed).toHaveLength(2);
      const second = gh.committed[1]!;
      expect([...(second.deletePaths ?? [])].sort()).toEqual([
        '.devdigest/agents/old-name.yaml',
        '.devdigest/skills/old-skill.md',
      ]);
      expect(second.files.map((f) => f.path)).toContain('.devdigest/agents/new-name.yaml');
      // The mock derives the tree from commits minus deletions: exactly one manifest remains.
      expect(await gh.listTreePaths({ owner: 'acme', name: 'x' }, CI_BRANCH, ['.devdigest/agents/', '.devdigest/skills/']))
        .toEqual(['.devdigest/agents/new-name.yaml']);
      await app.close();
    });

    it('refuses with 409 and makes no GitHub write when another agent already owns the repo (AC-138)', async () => {
      const a = await mkAgent();
      const b = await mkAgent();
      const repo = await mkRepo();
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh);
      expect((await exportCi(app, a.id, { repo: repo.fullName })).statusCode).toBe(200);
      const before = calls.length;

      const res = await exportCi(app, b.id, { repo: repo.fullName, mode: 'open_pr' });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ci_repo_has_other_agent');
      expect(calls.length).toBe(before);
      const rows = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.repo, repo.fullName));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.agentId).toBe(a.id);
      await app.close();
    });

    // Every validation failure is a 422 and reaches GitHub zero times.
    describe('validation failures answer 422 with zero GitHub calls', () => {
      type Case = { name: string; body?: Record<string, unknown>; edit?: (wf: any) => void; setup?: (agentId: string) => Promise<void> };
      const cases: Case[] = [
        { name: 'target other than gha (AC-18)', body: { target: 'circle' } },
        { name: 'no trigger type (AC-20)', body: { triggers: [] } },
        { name: 'unknown trigger type (AC-20)', body: { triggers: ['closed'] } },
        { name: 'edit for the agent manifest (AC-35)', body: { edits: [{ path: '.devdigest/agents/x.yaml', contents: 'x' }] } },
        { name: 'edit for memory.jsonl (AC-35)', body: { edits: [{ path: '.devdigest/memory.jsonl', contents: 'x' }] } },
        { name: 'edit for the runner bundle (AC-35)', body: { edits: [{ path: '.devdigest/runner/index.js', contents: 'x' }] } },
        { name: 'edit for a path outside the bundle (AC-35)', body: { edits: [{ path: 'README.md', contents: 'x' }] } },
        { name: 'workflow that is not valid YAML (AC-32)', body: { edits: [{ path: WORKFLOW_PATH, contents: 'a: [unclosed' }] } },
        { name: 'workflow without a permissions block (AC-33)', edit: (wf) => delete wf.permissions },
        { name: 'workflow granting contents: write (AC-33)', edit: (wf) => (wf.permissions.contents = 'write') },
        { name: 'workflow using pull_request_target (AC-34)', edit: (wf) => (wf.on = { pull_request_target: { types: ['opened'] } }) },
        { name: 'workflow without the base checkout (AC-131)', edit: (wf) => (wf.jobs.review.steps[0].with.ref = '${{ github.event.pull_request.head.sha }}') },
        { name: 'workflow without the same-repo guard (AC-131)', edit: (wf) => delete wf.jobs.review.if },
        { name: 'workflow with an unpinned action (AC-131)', edit: (wf) => (wf.jobs.review.steps[1].uses = 'actions/setup-node@v4') },
        { name: 'workflow without the runner step (AC-131)', edit: (wf) => (wf.jobs.review.steps = wf.jobs.review.steps.filter((s: any) => !s.run)) },
        { name: 'skill slug with ".." (AC-16)', setup: async (id) => void (await mkSkill(id, 'a..b')) },
        {
          name: 'colliding skill slugs (AC-134)',
          setup: async (id) => {
            await mkSkill(id, 'Same Name');
            await mkSkill(id, 'same name');
          },
        },
      ];

      for (const c of cases) {
        for (const mode of ['open_pr', 'zip'] as const) {
          it(`${c.name} — ${mode}`, async () => {
            const agent = await mkAgent();
            await c.setup?.(agent.id);
            const repo = await mkRepo();
            const { gh, calls } = spy(new MockGitHubClient());
            const app = await appWith(gh);
            let body: Record<string, unknown> = { repo: repo.fullName, mode, ...c.body };
            if (c.edit) {
              // Workflow edits are derived from a valid bundle, so the mutation is the only fault.
              const clean = await mkAgent();
              const text = await editedWorkflow(app, clean.id, repo.fullName, c.edit);
              body = { ...body, edits: [{ path: WORKFLOW_PATH, contents: text }] };
              const res = await exportCi(app, clean.id, body);
              expect(res.statusCode).toBe(422);
              expect(res.json().error.code).toBe('validation_error');
            } else {
              const res = await exportCi(app, agent.id, body);
              expect(res.statusCode).toBe(422);
              expect(res.json().error.code).toBe('validation_error');
            }
            expect(calls).toEqual([]);
            expect(await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.repo, repo.fullName))).toHaveLength(0);
            await app.close();
          });
        }
      }
    });

    it('answers 404 with zero GitHub calls for a repo that is not imported (AC-17)', async () => {
      const agent = await mkAgent();
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh);
      const res = await exportCi(app, agent.id, { repo: 'acme/never-imported' });
      expect(res.statusCode).toBe(404);
      expect(calls).toEqual([]);
      await app.close();
    });
  });

  // =========================================================================
  describe('zip install (POST /agents/:id/export-ci, mode zip)', () => {
    /** Entry names straight from the zip's central directory. */
    function zipNames(buf: Buffer): string[] {
      let eocd = buf.length - 22;
      while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
      const n = buf.readUInt16LE(eocd + 10);
      let p = buf.readUInt32LE(eocd + 16);
      const names: string[] = [];
      for (let i = 0; i < n; i++) {
        const nameLen = buf.readUInt16LE(p + 28);
        const extra = buf.readUInt16LE(p + 30);
        const comment = buf.readUInt16LE(p + 32);
        names.push(buf.toString('utf8', p + 46, p + 46 + nameLen));
        p += 46 + nameLen + extra + comment;
      }
      return names;
    }

    it('returns a zip holding exactly the bundle files with edits applied, and writes nothing (AC-46, AC-47)', async () => {
      const agent = await mkAgent();
      await mkSkill(agent.id, 'Auth Checks');
      const repo = await mkRepo();
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh);
      const generated = (await preview(app, agent.id, repo.fullName)).json().files.map((f: any) => f.path).sort();

      const res = await exportCi(app, agent.id, {
        repo: repo.fullName,
        mode: 'zip',
        edits: [{ path: '.devdigest/skills/auth-checks.md', contents: '# zipped edit\n' }],
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.mode).toBe('zip');
      expect(body.filename).toBe(`devdigest-ci-${repo.name}.zip`);
      const buf = Buffer.from(body.zip_base64, 'base64');
      expect(zipNames(buf).sort()).toEqual(generated);
      expect(readSingleZipEntry(buf, '.devdigest/skills/auth-checks.md', 1 << 20)).toBe('# zipped edit\n');
      expect(readSingleZipEntry(buf, '.devdigest/runner/package.json', 1 << 20)).toBe(RUNNER_PACKAGE_JSON);
      expect(calls).toEqual([]);
      expect(await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.repo, repo.fullName))).toHaveLength(0);
      await app.close();
    });

    it('refuses with 409 and no GitHub call when another agent owns the repo (AC-138)', async () => {
      const owner = await mkAgent();
      const other = await mkAgent();
      const repo = await mkRepo();
      await mkInstallation(owner.id, repo.fullName);
      const { gh, calls } = spy(new MockGitHubClient());
      const app = await appWith(gh);

      const res = await exportCi(app, other.id, { repo: repo.fullName, mode: 'zip' });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('ci_repo_has_other_agent');
      expect(calls).toEqual([]);
      await app.close();
    });

    it('lets the owning agent export a zip of its own installation without changing the row (AC-47)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const inst = await mkInstallation(agent.id, repo.fullName, { state: 'active' });
      const app = await appWith(new MockGitHubClient());

      const res = await exportCi(app, agent.id, { repo: repo.fullName, mode: 'zip' });

      expect(res.statusCode).toBe(200);
      const [row] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.id, inst.id));
      expect(row!.state).toBe('active');
      expect(row!.updatedAt.getTime()).toBe(inst.updatedAt.getTime());
      await app.close();
    });
  });

  // =========================================================================
  describe('ingest through GET /ci-runs', () => {
    const fixture = async (over: Partial<Fx> = {}) => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      const inst = await mkInstallation(agent.id, repo.fullName, { prNumber: 7 });
      const fx: Fx = {
        inst: inst.id,
        repo: repo.fullName,
        runId: 9_000_000 + seq++ * 10,
        sha: `sha${uid()}`,
        pr: 482,
        ...over,
      };
      return { agent, repo, inst, fx };
    };
    const ciRunRows = (instId: string) => db().select().from(t.ciRuns).where(eq(t.ciRuns.ciInstallationId, instId));

    it('stores a verified artifact as a source=ci agent run with the run metadata, and reports the installation agent (AC-48, AC-49, AC-52, AC-53, AC-70)', async () => {
      const { agent, inst, fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx)] }, withArtifact(fx, artifactJson(fx)));
      const app = await appWith(gh);

      const res = await runsList(app);

      expect(res.statusCode).toBe(200);
      const [run] = res.json().runs;
      expect(run).toMatchObject({
        repository: fx.repo,
        pr_number: 482,
        agent: agent.name, // installation's agent, not the artifact's `agent` string
        findings_count: 3,
        blockers: 1,
        cost_usd: 0.0123,
        duration_ms: 4200,
        head_sha: fx.sha,
        job_url: `https://github.com/${fx.repo}/actions/runs/${fx.runId}`, // run html_url (AC-53)
        status: 'succeeded',
      });
      const [ci] = await ciRunRows(inst.id);
      expect(ci).toMatchObject({
        repo: fx.repo,
        githubRunId: fx.runId,
        runAttempt: 1,
        artifactId: fx.runId + 1000,
        headSha: fx.sha,
        prNumber: 482,
        githubUrl: `https://github.com/${fx.repo}/actions/runs/${fx.runId}`,
      });
      const [ar] = await db().select().from(t.agentRuns).where(eq(t.agentRuns.id, ci!.agentRunId));
      expect(ar).toMatchObject({ source: 'ci', agentId: agent.id, model: 'test/model', findingsCount: 3, blockers: 1, durationMs: 4200 });
      await app.close();
    });

    it('is idempotent: two refreshes leave exactly one run record (AC-54)', async () => {
      const { inst, fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx)] }, withArtifact(fx, artifactJson(fx)));
      const app = await appWith(gh);

      const first = await runsList(app);
      const second = await runsList(app);

      expect(first.json().runs).toHaveLength(1);
      expect(second.json().runs).toHaveLength(1);
      expect(await ciRunRows(inst.id)).toHaveLength(1);
      const [{ n }] = await db().select({ n: count() }).from(t.agentRuns).where(eq(t.agentRuns.source, 'ci'));
      expect(n).toBe(1);
      await app.close();
    });

    it('links the run to an imported PR and leaves an unknown PR unlinked, importing nothing (AC-55, AC-56, AC-57)', async () => {
      const [seeded] = await db()
        .select({ repo: t.repos, pr: t.pullRequests })
        .from(t.pullRequests)
        .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
        .where(and(eq(t.repos.fullName, 'acme/payments-api'), eq(t.pullRequests.number, 482)));
      const agent = await mkAgent();
      const inst = await mkInstallation(agent.id, 'acme/payments-api');
      const known: Fx = { inst: inst.id, repo: 'acme/payments-api', runId: 8_100_001, sha: 'shaknown', pr: 482 };
      const unknown: Fx = { ...known, runId: 8_100_002, sha: 'shaunknown', pr: 987654 };
      const gh = new RepoRunsGitHub(
        { 'acme/payments-api': [runMeta(known), runMeta(unknown)] },
        {
          artifacts: { ...withArtifact(known, artifactJson(known)).artifacts, ...withArtifact(unknown, artifactJson(unknown)).artifacts },
          artifactZips: { ...withArtifact(known, artifactJson(known)).artifactZips, ...withArtifact(unknown, artifactJson(unknown)).artifactZips },
        },
      );
      const app = await appWith(gh);
      const [{ repos: reposBefore }] = await db().select({ repos: count() }).from(t.repos);
      const [{ prs: prsBefore }] = await db().select({ prs: count() }).from(t.pullRequests);

      await runsList(app);

      const rows = await db()
        .select({ prNumber: t.ciRuns.prNumber, prId: t.agentRuns.prId })
        .from(t.ciRuns)
        .innerJoin(t.agentRuns, eq(t.ciRuns.agentRunId, t.agentRuns.id))
        .where(eq(t.ciRuns.ciInstallationId, inst.id));
      expect(rows.find((r) => r.prNumber === 482)!.prId).toBe(seeded!.pr.id);
      expect(rows.find((r) => r.prNumber === 987654)!.prId).toBeNull();
      const [{ repos: reposAfter }] = await db().select({ repos: count() }).from(t.repos);
      const [{ prs: prsAfter }] = await db().select({ prs: count() }).from(t.pullRequests);
      expect(reposAfter).toBe(reposBefore);
      expect(prsAfter).toBe(prsBefore);
      await app.close();
    });

    it("adds a linked CI run's cost to the PR feed COST through the existing totals (AC-74)", async () => {
      const [seeded] = await db()
        .select({ repoId: t.repos.id, prId: t.pullRequests.id })
        .from(t.pullRequests)
        .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
        .where(and(eq(t.repos.fullName, 'acme/payments-api'), eq(t.pullRequests.number, 482)));
      const agent = await mkAgent();
      const inst = await mkInstallation(agent.id, 'acme/payments-api');
      const fx: Fx = { inst: inst.id, repo: 'acme/payments-api', runId: 8_200_001, sha: 'shacost', pr: 482 };
      const gh = new RepoRunsGitHub(
        { 'acme/payments-api': [runMeta(fx)] },
        withArtifact(fx, artifactJson(fx, { cost_usd: 1.5 })),
      );
      const app = await appWith(gh);
      const feedCost = async () => {
        const res = await app.inject({ method: 'GET', url: `/repos/${seeded!.repoId}/pulls` });
        return (res.json() as any[]).find((p) => p.number === 482).cost_usd as number | null;
      };
      const before = (await feedCost()) ?? 0;

      await runsList(app);

      expect((await feedCost()) ?? 0).toBeCloseTo(before + 1.5, 6);
      await app.close();
    });

    it('stores a null cost as null, never 0 (AC-58)', async () => {
      const { inst, fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx)] }, withArtifact(fx, artifactJson(fx, { cost_usd: null })));
      const app = await appWith(gh);

      const res = await runsList(app);

      expect(res.json().runs[0].cost_usd).toBeNull();
      const [ci] = await ciRunRows(inst.id);
      const [ar] = await db().select().from(t.agentRuns).where(eq(t.agentRuns.id, ci!.agentRunId));
      expect(ar!.costUsd).toBeNull();
      await app.close();
    });

    it('maps zero findings to no_findings and one or more to succeeded even when the job failed (AC-59, AC-60)', async () => {
      const { fx } = await fixture();
      const failed: Fx = { ...fx, runId: fx.runId + 1, sha: `${fx.sha}b` };
      const zeroArt = withArtifact(fx, artifactJson(fx, { findings_count: 0, blockers: 0 }));
      const failedArt = withArtifact(failed, artifactJson(failed, { findings_count: 2, blockers: 2 }));
      const gh = new RepoRunsGitHub(
        { [fx.repo]: [runMeta(fx), runMeta(failed, { conclusion: 'failure' })] },
        {
          artifacts: { ...zeroArt.artifacts, ...failedArt.artifacts },
          artifactZips: { ...zeroArt.artifactZips, ...failedArt.artifactZips },
        },
      );
      const app = await appWith(gh);

      const runs = (await runsList(app)).json().runs as any[];

      expect(runs.find((r) => r.head_sha === fx.sha).status).toBe('no_findings');
      const f = runs.find((r) => r.head_sha === failed.sha);
      expect(f).toMatchObject({ status: 'succeeded', blockers: 2, findings_count: 2 });
      await app.close();
    });

    it('stores a run without an artifact, including a cancelled one, as failed with GitHub metadata only (AC-61)', async () => {
      const { fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx, { conclusion: 'cancelled' })] });
      const app = await appWith(gh);

      const [run] = (await runsList(app)).json().runs;

      expect(run).toMatchObject({
        status: 'failed',
        pr_number: 482,
        head_sha: fx.sha,
        job_url: `https://github.com/${fx.repo}/actions/runs/${fx.runId}`,
        findings_count: null,
        cost_usd: null,
      });
      await app.close();
    });

    it('stores nothing for a run on devdigest/ci and keeps the installation pr_open (AC-140)', async () => {
      const { inst, fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx, { head_branch: CI_BRANCH })] });
      const app = await appWith(gh);

      const res = await runsList(app);

      expect(res.json().runs).toEqual([]);
      expect(await ciRunRows(inst.id)).toHaveLength(0);
      const [row] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.id, inst.id));
      expect(row!.state).toBe('pr_open');
      await app.close();
    });

    it('stores nothing for a run that concluded skipped (AC-141)', async () => {
      const { inst, fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx, { conclusion: 'skipped' })] });
      const app = await appWith(gh);

      const res = await runsList(app);

      expect(res.json().runs).toEqual([]);
      expect(await ciRunRows(inst.id)).toHaveLength(0);
      await app.close();
    });

    describe('rejected artifacts store nothing and log the field or reason', () => {
      const cases: { name: string; reason: string; make: (fx: Fx) => ReturnType<typeof withArtifact> }[] = [
        { name: 'repository differs (AC-51)', reason: 'mismatch:repository', make: (fx) => withArtifact(fx, artifactJson(fx, { repository: 'evil/other' })) },
        { name: 'repository_id differs (AC-51)', reason: 'mismatch:repository_id', make: (fx) => withArtifact(fx, artifactJson(fx, { repository_id: 1 })) },
        { name: 'head_sha differs (AC-51)', reason: 'mismatch:head_sha', make: (fx) => withArtifact(fx, artifactJson(fx, { head_sha: 'deadbeef' })) },
        { name: 'pr_number is not one of the run PRs (AC-51)', reason: 'mismatch:pr_number', make: (fx) => withArtifact(fx, artifactJson(fx, { pr_number: 31337 })) },
        { name: 'pr_number is missing (AC-51)', reason: 'mismatch:pr_number', make: (fx) => withArtifact(fx, artifactJson(fx, { pr_number: undefined })) },
        { name: 'installation_id differs (AC-51)', reason: 'mismatch:installation_id', make: (fx) => withArtifact(fx, artifactJson(fx, { installation_id: '00000000-0000-4000-8000-000000000000' })) },
        { name: 'installation_id is missing (AC-51)', reason: 'mismatch:installation_id', make: (fx) => withArtifact(fx, artifactJson(fx, { installation_id: undefined })) },
        { name: 'fails the CiResultArtifact schema (AC-50)', reason: 'schema:', make: (fx) => withArtifact(fx, artifactJson(fx, { findings_count: 'many' })) },
        { name: 'is not JSON (AC-50)', reason: 'invalid_json', make: (fx) => withArtifact(fx, 'not json {') },
        {
          name: 'is declared larger than 64 KB (AC-132)',
          reason: 'oversized',
          make: (fx) => withArtifact(fx, artifactJson(fx), { size: MAX_ARTIFACT_BYTES + 1 }),
        },
        {
          name: 'inflates past 64 KB although its metadata claims it is small (AC-132)',
          reason: 'oversized',
          make: (fx) => withArtifact(fx, null, { size: 100, zip: zipOf(JSON.stringify(artifactJson(fx, { agent: 'x'.repeat(MAX_ARTIFACT_BYTES) }))) }),
        },
      ];

      for (const c of cases) {
        it(c.name, async () => {
          const { inst, fx } = await fixture();
          const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx)] }, c.make(fx));
          const app = await appWith(gh);
          const warn = vi.spyOn(app.log, 'warn');

          const res = await runsList(app);

          expect(res.statusCode).toBe(200);
          expect(res.json().runs).toEqual([]);
          expect(await ciRunRows(inst.id)).toHaveLength(0);
          const rejection = warn.mock.calls.find((a) => (a[0] as any)?.runId === fx.runId);
          expect(rejection).toBeDefined();
          expect(String((rejection![0] as any).reason)).toContain(c.reason);
          await app.close();
        });
      }
    });

    it('moves pr_open to active when the first run is stored (AC-62)', async () => {
      const { inst, fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx)] }, withArtifact(fx, artifactJson(fx)));
      const app = await appWith(gh);

      await runsList(app);

      const [row] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.id, inst.id));
      expect(row!.state).toBe('active');
      await app.close();
    });

    it('moves pr_open to active when the PR was merged (AC-63)', async () => {
      const { inst } = await fixture();
      const app = await appWith(new RepoRunsGitHub({}, { pullStates: { 7: 'merged' } }));

      await runsList(app);

      const [row] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.id, inst.id));
      expect(row!.state).toBe('active');
      await app.close();
    });

    it('moves pr_open to pr_closed when the PR was closed unmerged and no run was ingested (AC-64)', async () => {
      const { inst } = await fixture();
      const app = await appWith(new RepoRunsGitHub({}, { pullStates: { 7: 'closed' } }));

      await runsList(app);

      const [row] = await db().select().from(t.ciInstallations).where(eq(t.ciInstallations.id, inst.id));
      expect(row!.state).toBe('pr_closed');
      await app.close();
    });

    it('still returns stored runs plus a warning naming the repo when GitHub fails for it (AC-65)', async () => {
      const { fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx)] }, withArtifact(fx, artifactJson(fx)));
      const app = await appWith(gh);
      expect((await runsList(app)).json().runs).toHaveLength(1);
      gh.failRepos.add(fx.repo);

      const res = await runsList(app);

      expect(res.statusCode).toBe(200);
      expect(res.json().runs).toHaveLength(1);
      expect(res.json().warnings).toEqual([{ repo: fx.repo, message: expect.any(String) }]);
      await app.close();
    });

    it('does not leak a token or an artifact body into a warning (AC-67)', async () => {
      const { fx } = await fixture();
      const gh = new RepoRunsGitHub({ [fx.repo]: [runMeta(fx)] });
      gh.failRepos.add(fx.repo);
      const app = await appWith(gh);

      const res = await runsList(app);

      expect(JSON.stringify(res.json().warnings)).not.toMatch(/ghp_|github_pat|OPENROUTER/i);
      await app.close();
    });
  });

  // =========================================================================
  describe('runs list: window, filters, pagination (GET /ci-runs)', () => {
    it('returns 50 per page newest first and flags the 51st on the next page (AC-68, NFR-2)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      await mkInstallation(agent.id, repo.fullName);
      const base: Fx = { inst: '', repo: repo.fullName, runId: 7_000_000, sha: 'p', pr: 1 };
      const now = Date.now();
      const runs = Array.from({ length: 51 }, (_, i) =>
        runMeta({ ...base, runId: base.runId + i, sha: `sha-${i}` }, { updated_at: new Date(now - i * 60_000).toISOString() }),
      );
      const app = await appWith(new RepoRunsGitHub({ [repo.fullName]: runs }));

      const page1 = (await runsList(app)).json();
      const page2 = (await runsList(app, '?page=2')).json();

      expect(page1.runs).toHaveLength(50);
      expect(page1.has_more).toBe(true);
      expect(page1.page).toBe(1);
      const times = page1.runs.map((r: any) => Date.parse(r.ran_at));
      expect(times).toEqual([...times].sort((a, b) => b - a));
      expect(page1.runs[0].head_sha).toBe('sha-0');
      expect(page2.runs).toHaveLength(1);
      expect(page2.runs[0].head_sha).toBe('sha-50');
      expect(page2.has_more).toBe(false);
      await app.close();
    });

    it('defaults to the last 7 days and returns older runs with window=all (AC-69)', async () => {
      const agent = await mkAgent();
      const repo = await mkRepo();
      await mkInstallation(agent.id, repo.fullName);
      const fx: Fx = { inst: '', repo: repo.fullName, runId: 7_100_000, sha: 'recent', pr: 1 };
      const old: Fx = { ...fx, runId: 7_100_001, sha: 'old' };
      const app = await appWith(
        new RepoRunsGitHub({
          [repo.fullName]: [
            runMeta(fx),
            runMeta(old, { updated_at: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() }),
          ],
        }),
      );

      const def = (await runsList(app)).json().runs.map((r: any) => r.head_sha);
      const week = (await runsList(app, '?window=7d')).json().runs.map((r: any) => r.head_sha);
      const all = (await runsList(app, '?window=all')).json().runs.map((r: any) => r.head_sha);

      expect(def).toEqual(['recent']);
      expect(week).toEqual(['recent']);
      expect(all).toEqual(['recent', 'old']);
      await app.close();
    });

    it('filters by agent, repository and status (AC-69)', async () => {
      const agentA = await mkAgent();
      const agentB = await mkAgent();
      const repoA = await mkRepo();
      const repoB = await mkRepo();
      await mkInstallation(agentA.id, repoA.fullName);
      await mkInstallation(agentB.id, repoB.fullName);
      const a: Fx = { inst: '', repo: repoA.fullName, runId: 7_200_001, sha: 'a', pr: 1 };
      const b: Fx = { inst: '', repo: repoB.fullName, runId: 7_200_002, sha: 'b', pr: 1 };
      // Runs without artifacts are stored as `failed`, so both are failed; status filter is exercised below.
      const gh = new RepoRunsGitHub({ [repoA.fullName]: [runMeta(a)], [repoB.fullName]: [runMeta(b)] });
      const app = await appWith(gh);

      const byAgent = (await runsList(app, `?agent_id=${agentA.id}`)).json().runs;
      const byRepo = (await runsList(app, `?repo=${encodeURIComponent(repoB.fullName)}`)).json().runs;
      const byStatusFailed = (await runsList(app, '?status=failed')).json().runs;
      const byStatusOk = (await runsList(app, '?status=succeeded')).json().runs;

      expect(byAgent.map((r: any) => r.repository)).toEqual([repoA.fullName]);
      expect(byAgent[0].agent).toBe(agentA.name);
      expect(byRepo.map((r: any) => r.repository)).toEqual([repoB.fullName]);
      expect(byRepo[0].agent).toBe(agentB.name);
      expect(byStatusFailed).toHaveLength(2);
      expect(byStatusOk).toEqual([]);
      await app.close();
    });

    it('rejects an unknown window or status with 422', async () => {
      const app = await appWith(new MockGitHubClient());
      expect((await runsList(app, '?window=30d')).statusCode).toBe(422);
      expect((await runsList(app, '?status=bogus')).statusCode).toBe(422);
      await app.close();
    });
  });

  // =========================================================================
  describe('installations list (GET /agents/:id/ci-installations)', () => {
    it('returns repo, target, state, versions, and the latest stored run or null (AC-71)', async () => {
      const agent = await mkAgent();
      const quiet = await mkRepo();
      const busy = await mkRepo();
      await mkInstallation(agent.id, quiet.fullName, { agentVersion: 1, runnerVersion: 'rv-quiet' });
      const busyInst = await mkInstallation(agent.id, busy.fullName, { agentVersion: 1, runnerVersion: 'rv-busy' });
      const fx: Fx = { inst: busyInst.id, repo: busy.fullName, runId: 6_000_001, sha: 'latest', pr: 3 };
      const app = await appWith(
        new RepoRunsGitHub({ [busy.fullName]: [runMeta(fx)] }, withArtifact(fx, artifactJson(fx, { findings_count: 0, blockers: 0 }))),
      );
      await runsList(app); // ingest

      const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci-installations` });

      expect(res.statusCode).toBe(200);
      const list = res.json() as any[];
      const q = list.find((i) => i.repo === quiet.fullName);
      const b = list.find((i) => i.repo === busy.fullName);
      expect(q).toMatchObject({ target_type: 'gha', state: 'pr_open', agent_version: 1, runner_version: 'rv-quiet', latest_run: null });
      expect(b).toMatchObject({ target_type: 'gha', state: 'active', runner_version: 'rv-busy' });
      expect(b.latest_run.status).toBe('no_findings');
      expect(typeof b.latest_run.ran_at).toBe('string');
      await app.close();
    });

    it('flags an installation behind only when the agent version is newer than the installed one (AC-72)', async () => {
      const agent = await mkAgent({ version: 2 });
      const current = await mkRepo();
      const stale = await mkRepo();
      await mkInstallation(agent.id, current.fullName, { agentVersion: 2 });
      await mkInstallation(agent.id, stale.fullName, { agentVersion: 1 });
      const app = await appWith(new MockGitHubClient());

      const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci-installations` })).json() as any[];

      expect(list.find((i) => i.repo === current.fullName).behind).toBe(false);
      expect(list.find((i) => i.repo === stale.fullName).behind).toBe(true);

      await db().update(t.agents).set({ version: 3 }).where(eq(t.agents.id, agent.id));
      const after = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/ci-installations` })).json() as any[];
      expect(after.find((i) => i.repo === current.fullName).behind).toBe(true);
      await app.close();
    });

    it("lists only the requested agent's installations and 404s an unknown agent", async () => {
      const a = await mkAgent();
      const b = await mkAgent();
      const repoA = await mkRepo();
      const repoB = await mkRepo();
      await mkInstallation(a.id, repoA.fullName);
      await mkInstallation(b.id, repoB.fullName);
      const app = await appWith(new MockGitHubClient());

      const list = (await app.inject({ method: 'GET', url: `/agents/${a.id}/ci-installations` })).json() as any[];
      const missing = await app.inject({ method: 'GET', url: '/agents/00000000-0000-4000-8000-000000000000/ci-installations' });

      expect(list.map((i) => i.repo)).toEqual([repoA.fullName]);
      expect(missing.statusCode).toBe(404);
      await app.close();
    });
  });
});
