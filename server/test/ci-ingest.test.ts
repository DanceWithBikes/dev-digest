/** CiIngest over an in-memory store and MockGitHubClient fixtures. */
import { describe, it, expect } from 'vitest';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { CiIngest } from '../src/modules/ci/ingest.js';
import { zipFiles } from '../src/modules/ci/helpers.js';
import { CapturingLog, FakeStore } from './helpers/ci.js';
import type { WorkflowRunMeta } from '@devdigest/shared';

const TOKEN = 'ghp_SENTINEL_TOKEN';
const INST = 'inst-1';
const run = (over: Partial<WorkflowRunMeta> = {}): WorkflowRunMeta => ({
  id: 100, run_attempt: 1, head_sha: 'abc', head_branch: 'feat', conclusion: 'success',
  html_url: 'https://github.com/acme/api/actions/runs/100',
  repository: { id: 4242, full_name: 'acme/api' }, pull_numbers: [5], updated_at: '2026-10-11T10:00:00Z', ...over,
});
const artifact = (over: Record<string, unknown> = {}) => ({
  findings_count: 2, cost_usd: 0.01, duration_ms: 1200, agent: 'Reviewer', repository: 'acme/api',
  repository_id: 4242, head_sha: 'abc', pr_number: 5, installation_id: INST, blockers: 1, model: 'm', ...over,
});
const zipOf = (body: string) => new Uint8Array(zipFiles([{ path: 'devdigest-result.json', contents: body }]));

async function setup(opts: {
  runs?: WorkflowRunMeta[]; art?: unknown | string; size?: number; noArtifact?: boolean;
  pull?: 'open' | 'closed' | 'merged'; state?: 'pr_open' | 'active'; zip?: Uint8Array;
  gh?: MockGitHubClient;
} = {}) {
  const store = new FakeStore();
  await store.upsertInstallation({ workspaceId: 'w', id: INST, agentId: 'agent-1', repoId: 'r', repo: 'acme/api', githubRepoId: 4242, agentVersion: 1, runnerVersion: 'v', prUrl: 'u', prNumber: 9 });
  if (opts.state === 'active') await store.setInstallationState('w', INST, 'active');
  const body = typeof opts.art === 'string' ? opts.art : JSON.stringify(opts.art ?? artifact());
  const runs = opts.runs ?? [run()];
  const gh = opts.gh ?? new MockGitHubClient({
    workflowRuns: runs,
    artifacts: Object.fromEntries(runs.map((r) => [r.id, opts.noArtifact ? [] : [{ id: r.id + 1000, name: 'devdigest-result', size_in_bytes: opts.size ?? 300, expired: false }]])),
    artifactZips: Object.fromEntries(runs.map((r) => [r.id + 1000, opts.zip ?? zipOf(body)])),
    pullStates: { 9: opts.pull ?? 'open' },
  });
  const log = new CapturingLog();
  const ingest = new CiIngest({ store, github: async () => gh, log });
  return { store, log, ingest, gh };
}
const warns = (l: CapturingLog) => l.lines.filter((x) => x.level === 'warn');

describe('CiIngest', () => {
  it('stores a verified run: GitHub metadata for ids/url, null cost stays null, flips pr_open to active', async () => {
    const { ingest, store } = await setup({ art: artifact({ cost_usd: null }) });
    expect(await ingest.refresh('w')).toEqual([]);
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({ status: 'succeeded', blockers: 1, costUsd: null, githubRunId: 100, jobUrl: 'https://github.com/acme/api/actions/runs/100', prNumber: 5 });
    expect(store.states[INST]).toBe('active');
  });
  it('0 findings is no_findings; findings on a failed job are succeeded with blockers', async () => {
    const a = await setup({ art: artifact({ findings_count: 0, blockers: 0 }) });
    await a.ingest.refresh('w');
    expect(a.store.runs[0]!.status).toBe('no_findings');
    const b = await setup({ runs: [run({ conclusion: 'failure' })] });
    await b.ingest.refresh('w');
    expect(b.store.runs[0]).toMatchObject({ status: 'succeeded', blockers: 1 });
  });
  it.each([
    ['repository', { repository: 'evil/x' }],
    ['repository_id', { repository_id: 1 }],
    ['head_sha', { head_sha: 'forged' }],
    ['pr_number', { pr_number: 77 }],
    ['installation_id', { installation_id: 'other' }],
  ])('rejects a forged %s with one warn naming it', async (field, patch) => {
    const { ingest, store, log } = await setup({ art: artifact(patch) });
    await ingest.refresh('w');
    expect(store.runs).toHaveLength(0);
    expect(warns(log)).toHaveLength(1);
    expect(warns(log)[0]!.obj.reason).toBe(`mismatch:${field}`);
  });
  it('verifies the PR through GitHub when pull_numbers was emptied (merged PR)', async () => {
    // The mock's getPullRequest reports branch feat/rate-limit-public and head sha a1b2c3d4.
    const ok = await setup({ runs: [run({ pull_numbers: [], head_branch: 'feat/rate-limit-public' })] });
    await ok.ingest.refresh('w');
    expect(ok.store.runs).toHaveLength(1);
    const bySha = await setup({
      runs: [run({ pull_numbers: [], head_sha: 'a1b2c3d4', head_branch: null })],
      art: artifact({ head_sha: 'a1b2c3d4' }),
    });
    await bySha.ingest.refresh('w');
    expect(bySha.store.runs).toHaveLength(1);
    const bad = await setup({ runs: [run({ pull_numbers: [], head_branch: 'unrelated' })] });
    await bad.ingest.refresh('w');
    expect(bad.store.runs).toHaveLength(0);
    expect(warns(bad.log)[0]!.obj.reason).toBe('mismatch:pr_number');
  });
  it('rejects malformed JSON and schema failures; logs no body', async () => {
    const a = await setup({ art: '{not json' });
    await a.ingest.refresh('w');
    expect(a.store.runs).toHaveLength(0);
    expect(warns(a.log)[0]!.obj.reason).toBe('invalid_json');
    const b = await setup({ art: { findings_count: 'many', secret: TOKEN } });
    await b.ingest.refresh('w');
    expect(b.store.runs).toHaveLength(0);
    expect(JSON.stringify(b.log.lines)).not.toContain(TOKEN);
  });
  it('rejects an oversized artifact before downloading or parsing', async () => {
    const { ingest, store, log } = await setup({ size: 70_000 });
    await ingest.refresh('w');
    expect(store.runs).toHaveLength(0);
    expect(warns(log)[0]!.obj.reason).toBe('oversized');
  });
  it('rejects an entry that inflates past the limit', async () => {
    const { ingest, store, log } = await setup({ zip: zipOf('x'.repeat(65_537)) });
    await ingest.refresh('w');
    expect(store.runs).toHaveLength(0);
    expect(warns(log)[0]!.obj.reason).toBe('oversized');
  });
  it('stores failed with GitHub metadata when there is no artifact (also cancelled)', async () => {
    const { ingest, store } = await setup({ noArtifact: true, runs: [run({ conclusion: 'cancelled' })] });
    await ingest.refresh('w');
    expect(store.runs[0]).toMatchObject({ status: 'failed', prNumber: 5, headSha: 'abc', findingsCount: null });
  });
  it('ignores devdigest/ci and skipped runs and keeps the installation pr_open', async () => {
    const { ingest, store, log } = await setup({ runs: [run({ id: 1, head_branch: 'devdigest/ci' }), run({ id: 2, conclusion: 'skipped' })] });
    await ingest.refresh('w');
    expect(store.runs).toHaveLength(0);
    expect(warns(log)).toHaveLength(0);
    expect(store.states[INST]).toBeUndefined();
  });
  it('is idempotent across refreshes and honours attempts', async () => {
    const { ingest, store } = await setup({ runs: [run(), run({ run_attempt: 2 })] });
    await ingest.refresh('w');
    await ingest.refresh('w');
    expect(store.runs).toHaveLength(2);
  });
  it('PR transitions: merged → active; closed with no runs → pr_closed; closed with a run stays active', async () => {
    const m = await setup({ runs: [], pull: 'merged' });
    await m.ingest.refresh('w');
    expect(m.store.states[INST]).toBe('active');
    const c = await setup({ runs: [], pull: 'closed' });
    await c.ingest.refresh('w');
    expect(c.store.states[INST]).toBe('pr_closed');
    const r = await setup({ pull: 'closed' });
    await r.ingest.refresh('w');
    expect(r.store.states[INST]).toBe('active');
  });
  it('a 403 for one repo yields a warning, not a throw', async () => {
    const gh = new MockGitHubClient();
    gh.listWorkflowRuns = async () => { throw Object.assign(new Error(`bad ${TOKEN}`), { status: 403 }); };
    const { ingest, log } = await setup({ gh });
    expect(await ingest.refresh('w')).toEqual([{ repo: 'acme/api', message: 'GitHub request failed (403)' }]);
    expect(JSON.stringify(log.lines)).not.toContain(TOKEN);
  });

  it('a GitHub failure on one run logs exactly one line with the repo and the run id (NFR-8)', async () => {
    const { ingest, log, gh } = await setup();
    gh.downloadArtifact = async () => { throw Object.assign(new Error(`bad ${TOKEN}`), { status: 502 }); };
    expect(await ingest.refresh('w')).toEqual([{ repo: 'acme/api', message: 'GitHub request failed (502)' }]);
    expect(warns(log)).toEqual([
      { level: 'warn', obj: { repo: 'acme/api', runId: 100, reason: 'GitHub request failed (502)' }, msg: 'ci ingest: GitHub request failed' },
    ]);
    expect(JSON.stringify(log.lines)).not.toContain(TOKEN);
  });
});
