/** CiService over an in-memory store and MockGitHubClient: no database, no network. */
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { MockGitHubClient, MockRunnerBundleSource } from '../src/adapters/mocks.js';
import { CiService } from '../src/modules/ci/service.js';
import { AGENT, CapturingLog, FakeStore, fakeAgents, REPO } from './helpers/ci.js';
import type { CiExportInput } from '@devdigest/shared';
import { readSingleZipEntry } from '../src/modules/ci/helpers.js';

const noIngest = { refresh: async () => [] };
const SKILLS = [
  { id: 's1', name: 'OWASP', body: 'owasp body', enabled: true },
  { id: 's2', name: 'Disabled one', body: 'x', enabled: false },
];

function setup(opts: { bundle?: string | null; gh?: any; skills?: typeof SKILLS } = {}) {
  const store = new FakeStore();
  const gh = opts.gh ?? new MockGitHubClient();
  let ghCalls = 0;
  const service = new CiService({
    store,
    agents: fakeAgents(opts.skills ?? SKILLS),
    github: async () => { ghCalls += 1; return gh; },
    bundle: new MockRunnerBundleSource(opts.bundle === undefined ? 'RUNNER' : opts.bundle),
    ingest: noIngest,
    log: new CapturingLog(),
  });
  return { store, gh, service, calls: () => ghCalls };
}
const input = (over: Partial<CiExportInput> = {}): CiExportInput => ({
  repo: 'acme/api', target: 'gha', mode: 'open_pr', post_as: 'github_review',
  triggers: ['opened', 'synchronize'], edits: [], ...over,
});

describe('preview', () => {
  it('returns the six generated paths, enabled skills only, with editable flags', async () => {
    const { service, calls } = setup();
    const p = await service.preview('w', AGENT.id, { repo: 'acme/api', triggers: ['opened'], post_as: 'none' });
    expect(p.files.map((f) => f.path)).toEqual([
      '.github/workflows/devdigest-review.yml', '.devdigest/agents/reviewer.yaml', '.devdigest/skills/owasp.md',
      '.devdigest/memory.jsonl', '.devdigest/runner/index.js', '.devdigest/runner/package.json',
    ]);
    expect(p.files.map((f) => f.editable)).toEqual([true, false, true, false, false, false]);
    expect(p.agent_version).toBe(2);
    expect(calls()).toBe(0);
  });
  it('explains how to build a missing bundle', async () => {
    const { service } = setup({ bundle: null });
    await expect(service.preview('w', AGENT.id, { repo: 'acme/api', triggers: ['opened'], post_as: 'none' }))
      .rejects.toThrow(/pnpm build/);
  });
  it('404 for unknown agent or repo with no GitHub call', async () => {
    const { service, calls } = setup();
    await expect(service.preview('w', 'nope', { repo: 'acme/api', triggers: ['opened'], post_as: 'none' })).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.preview('w', AGENT.id, { repo: 'x/y', triggers: ['opened'], post_as: 'none' })).rejects.toMatchObject({ statusCode: 404 });
    expect(calls()).toBe(0);
  });
});

describe('export', () => {
  it('opens a PR on devdigest/ci with one commit and records the installation', async () => {
    const { service, gh, store } = setup();
    const r = await service.export('w', AGENT.id, input());
    expect(r.mode).toBe('open_pr');
    expect(gh.committed).toHaveLength(1);
    expect(gh.committed[0].branch).toBe('devdigest/ci');
    expect(gh.committed[0].message).toContain('DevDigest-Bundle: v1');
    for (const f of gh.committed[0].files) expect(f.path.startsWith('.devdigest/') || f.path === '.github/workflows/devdigest-review.yml').toBe(true);
    expect(gh.openedPrs).toHaveLength(1);
    expect(store.installations).toHaveLength(1);
    expect(store.installations[0]).toMatchObject({ state: 'pr_open', githubRepoId: 4242, agentVersion: 2 });
  });
  it('second export reuses the PR and keeps one installation', async () => {
    const { service, gh, store } = setup();
    await service.export('w', AGENT.id, input());
    await service.export('w', AGENT.id, input());
    expect(gh.openedPrs).toHaveLength(1);
    expect(gh.committed).toHaveLength(2);
    expect(store.installations).toHaveLength(1);
  });
  it('zip mode makes no GitHub call and no store write', async () => {
    const { service, calls, store } = setup();
    const r = await service.export('w', AGENT.id, input({ mode: 'zip' }));
    if (r.mode !== 'zip') throw new Error('expected zip');
    expect(r.filename).toBe('devdigest-ci-api.zip');
    const zip = Buffer.from(r.zip_base64, 'base64');
    expect(readSingleZipEntry(zip, '.devdigest/runner/index.js', 1000)).toBe('RUNNER');
    expect(calls()).toBe(0);
    expect(store.upserts).toBe(0);
  });
  it('another agent installation answers 409 in both modes with no GitHub call', async () => {
    const { service, store, calls } = setup();
    await store.upsertInstallation({ workspaceId: 'w', id: 'i', agentId: 'other', repoId: REPO.id, repo: 'acme/api', githubRepoId: 1, agentVersion: 1, runnerVersion: 'v', prUrl: 'u', prNumber: 1 });
    store.upserts = 0;
    for (const mode of ['open_pr', 'zip'] as const) {
      await expect(service.export('w', AGENT.id, input({ mode }))).rejects.toMatchObject({ statusCode: 409, code: 'ci_repo_has_other_agent' });
    }
    expect(calls()).toBe(0);
  });
  it.each([
    ['unknown path', { path: 'x.txt', contents: '' }],
    ['manifest', { path: '.devdigest/agents/reviewer.yaml', contents: '' }],
    ['runner', { path: '.devdigest/runner/index.js', contents: '' }],
    ['runner package', { path: '.devdigest/runner/package.json', contents: '' }],
    ['bad workflow', { path: '.github/workflows/devdigest-review.yml', contents: 'on: pull_request_target' }],
  ])('rejects an edit to %s with 422 and no GitHub call', async (_n, edit) => {
    const { service, calls, gh } = setup();
    await expect(service.export('w', AGENT.id, input({ edits: [edit] }))).rejects.toMatchObject({ statusCode: 422 });
    expect(calls()).toBe(0);
    expect(gh.committed).toHaveLength(0);
  });
  it('re-applies Configure choices onto an edited workflow', async () => {
    const { service, gh } = setup();
    const pv = await service.preview('w', AGENT.id, { repo: 'acme/api', triggers: ['opened'], post_as: 'github_review' });
    const text = '# mine\n' + pv.files[0]!.contents;
    await service.export('w', AGENT.id, input({ triggers: ['reopened'], post_as: 'none', edits: [{ path: pv.files[0]!.path, contents: text }] }));
    const committed = gh.committed[0].files.find((f: any) => f.path.endsWith('devdigest-review.yml')).contents;
    expect(committed).toContain('# mine');
    const d = parse(committed);
    expect(d.on.pull_request.types).toEqual(['reopened']);
    expect(d.jobs.review.steps[2].env.DEVDIGEST_POST_AS).toBe('none');
  });
  it('409 and no commit when devdigest/ci has a foreign commit', async () => {
    const gh = new MockGitHubClient();
    gh.committed.push({ branch: 'devdigest/ci', base: 'main', message: 'hand edit', files: [] });
    const { service, store } = setup({ gh });
    await expect(service.export('w', AGENT.id, input())).rejects.toMatchObject({ statusCode: 409, code: 'ci_branch_foreign_commit' });
    expect(gh.committed).toHaveLength(1);
    expect(store.upserts).toBe(0);
  });
  it('maps GitHub 403 to a clear error and stores nothing', async () => {
    const gh = new MockGitHubClient();
    gh.commitFiles = async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }); };
    const { service, store } = setup({ gh });
    await expect(service.export('w', AGENT.id, input())).rejects.toMatchObject({
      statusCode: 403, message: 'token lacks write access to acme/api',
    });
    expect(store.upserts).toBe(0);
  });
  it('deletes exactly the stale manifest on a renamed re-install', async () => {
    const gh = new MockGitHubClient({ treePaths: { main: ['.devdigest/agents/old-name.yaml', '.devdigest/skills/owasp.md', 'README.md'] } });
    const { service } = setup({ gh });
    await service.export('w', AGENT.id, input());
    expect(gh.committed[0].deletePaths).toEqual(['.devdigest/agents/old-name.yaml']);
  });
  it('422 for a skill slug collision with no GitHub call', async () => {
    const { service, calls } = setup({ skills: [{ id: '1', name: 'A b', body: '', enabled: true }, { id: '2', name: 'a-b', body: '', enabled: true }] });
    await expect(service.export('w', AGENT.id, input())).rejects.toMatchObject({ statusCode: 422 });
    expect(calls()).toBe(0);
  });
});
