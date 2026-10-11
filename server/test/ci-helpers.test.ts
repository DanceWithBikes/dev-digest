/** Pure ring of the ci module: slugs, workflow generation and validation, zip, verification. */
import { describe, it, expect, vi } from 'vitest';
import { parse, stringify } from 'yaml';
import { AgentManifest, CiResultArtifact } from '@devdigest/shared';
import {
  patchWorkflow,
  shouldIngest,
  stalePaths,
  statusFor,
  validateEdits,
  validateEditedWorkflow,
  verifyArtifact,
  pullMatchesRun,
} from '../src/modules/ci/domain.js';
import {
  assertSafeSlugs,
  buildBundle,
  buildMemoryJsonl,
  buildWorkflowYaml,
  installationIdFor,
  readSingleZipEntry,
  slugify,
  verdictFor,
  zipFiles,
  ZipError,
} from '../src/modules/ci/helpers.js';
import { RUNNER_PACKAGE_JSON } from '../src/modules/ci/constants.js';
import type { AgentForCi } from '../src/modules/ci/ports.js';

const agent: AgentForCi = {
  id: 'a1',
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'm',
  systemPrompt: 'Be careful: "quotes" & colons',
  strategy: 'auto',
  ciFailOn: 'critical',
  version: 3,
};
const wf = (over: { triggers?: any; postAs?: any } = {}) =>
  buildWorkflowYaml({ triggers: ['opened', 'synchronize'], postAs: 'github_review', installationId: 'inst-1', ...over });
const mutate = (fn: (d: any) => void) => {
  const d = parse(wf());
  fn(d);
  return JSON.stringify(d);
};

describe('slugs', () => {
  it('slugifies per AC-133', () => {
    expect(slugify('Security / OWASP')).toBe('security-owasp');
    expect(slugify('!!!')).toBe('');
  });
  it('rejects "..", empty and colliding slugs with 422', () => {
    expect(() => assertSafeSlugs('A', [{ name: 'v1..v2', body: '' }])).toThrow(/v1\.\.v2/);
    expect(() => assertSafeSlugs('A', [{ name: '!!!', body: '' }])).toThrow(/!!!/);
    expect(() => assertSafeSlugs('A', [{ name: 'A b', body: '' }, { name: 'a-b', body: '' }])).toThrow(/A b.*a-b/);
    expect(() => assertSafeSlugs('???', [])).toThrow();
    expect(assertSafeSlugs('Agent', [{ name: 'Sk 1', body: 'x' }]).skills[0]!.slug).toBe('sk-1');
  });
});

describe('generated workflow', () => {
  const doc = parse(wf());
  it('passes its own validator', () => expect(() => validateEditedWorkflow(wf())).not.toThrow());
  it('has only pull_request with the given types', () => {
    expect(doc.on).toEqual({ pull_request: { types: ['opened', 'synchronize'] } });
  });
  it('has the two least-privilege grants', () => {
    expect(doc.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
  });
  it('pins every action and keeps ${{ out of run steps', () => {
    const steps = doc.jobs.review.steps;
    for (const s of steps) if (s.uses) expect(s.uses).toMatch(/@[0-9a-f]{40}$/);
    for (const s of steps) if (s.run) expect(s.run).not.toContain('${{');
  });
  it('checks out the base sha, uploads always, sets installation id and post-as', () => {
    const steps = doc.jobs.review.steps;
    expect(steps[0].with.ref).toBe('${{ github.event.pull_request.base.sha }}');
    expect(steps.at(-1).if).toBe('${{ always() }}');
    const run = steps.find((s: any) => s.run);
    expect(run.env.DEVDIGEST_INSTALLATION_ID).toBe('inst-1');
    expect(run.env.DEVDIGEST_POST_AS).toBe('github_review');
  });
});

describe('validateEditedWorkflow', () => {
  it.each([
    ['invalid yaml', 'a: [', /YAML/],
    ['permissions', mutate((d) => (d.permissions.contents = 'write')), /permissions/],
    ['job permissions', mutate((d) => (d.jobs.review.permissions = { contents: 'write' })), /permissions/],
    ['pull_request_target', mutate((d) => (d.on = { pull_request_target: {} })), /pull_request only/],
    ['head checkout', mutate((d) => (d.jobs.review.steps[0].with.ref = '${{ github.event.pull_request.head.sha }}')), /not allowed/],
    ['guard', mutate((d) => delete d.jobs.review.if), /same-repo/],
    ['unpinned', mutate((d) => (d.jobs.review.steps[1].uses = 'actions/setup-node@v4')), /pinned/],
    ['no runner', mutate((d) => (d.jobs.review.steps[2].run = 'echo hi')), /review step/],
  ])('rejects %s', (_n, text, re) => {
    expect(() => validateEditedWorkflow(text as string)).toThrow(re as RegExp);
  });
});

describe('validateEditedWorkflow allowlist bypasses', () => {
  const GUARD = 'github.event.pull_request.head.repo.full_name == github.repository';
  const SHA = '34e114876b0b11c390a56381ad16ebd13914f8d5';
  const HEAD = '${{ github.event.pull_request.head.sha }}';
  const yamlOf = (fn: (d: any) => void) => {
    const d = parse(wf());
    fn(d);
    return stringify(d);
  };
  it.each([
    ['always() || guard', (d: any) => (d.jobs.review.if = `always() || ${GUARD}`), /same-repo/],
    ['negated guard', (d: any) => (d.jobs.review.if = `!(${GUARD})`), /same-repo/],
    ['guard plus extra', (d: any) => (d.jobs.review.if = `${GUARD} || true`), /same-repo/],
    ['extra event', (d: any) => (d.on.workflow_run = { workflows: ['x'] }), /pull_request only/],
    ['push event', (d: any) => (d.on = { push: {}, pull_request: {} }), /pull_request only/],
    ['on as string', (d: any) => (d.on = 'pull_request'), /pull_request only/],
    ['on as list', (d: any) => (d.on = ['pull_request', 'workflow_dispatch']), /pull_request only/],
    ['job uses', (d: any) => (d.jobs.review = { if: GUARD, uses: 'evil/repo/.github/workflows/x.yml@main', secrets: 'inherit' }), /not allowed/],
    ['container', (d: any) => (d.jobs.review.container = 'evil/img:latest'), /"container" is not allowed/],
    ['services', (d: any) => (d.jobs.review.services = { x: { image: 'y' } }), /"services" is not allowed/],
    ['uppercase checkout with head ref', (d: any) => (d.jobs.review.steps[0] = { uses: `Actions/checkout@${SHA}`, with: { ref: HEAD } }), /not allowed/],
    ['checkout of another repository', (d: any) => (d.jobs.review.steps[0].with.repository = 'evil/x'), /base commit/],
    ['local action', (d: any) => (d.jobs.review.steps[1] = { uses: './evil' }), /pinned/],
    ['docker action', (d: any) => (d.jobs.review.steps[1] = { uses: `docker://x@${SHA}` }), /pinned/],
    ['head sha in run', (d: any) => (d.jobs.review.steps.splice(2, 0, { run: `git checkout ${HEAD}` })), /not allowed/],
    ['head sha via env', (d: any) => (d.jobs.review.steps[2].env.REF = HEAD), /not allowed/],
    ['pr title in env', (d: any) => (d.env = { T: '${{ github.event.pull_request.title }}' }), /not allowed/],
    ['runner before checkout', (d: any) => d.jobs.review.steps.unshift(d.jobs.review.steps.splice(2, 1)[0]), /One job must/],
    ['checkout in job A, runner in job B', (d: any) => {
      const { steps } = d.jobs.review;
      d.jobs.review = { ...d.jobs.review, steps: steps.slice(0, 2) };
      d.jobs.other = { 'runs-on': 'ubuntu-latest', if: GUARD, steps: steps.slice(2, 3) };
    }, /One job must/],
  ])('rejects %s', (_n, fn, re) => {
    expect(() => validateEditedWorkflow(yamlOf(fn as any))).toThrow(re as RegExp);
  });

  it('rejects an alias step and anchors with merge keys', () => {
    const aliased = wf().replace(
      '    steps:\n',
      '    steps:\n      - &s\n        run: echo hi\n      - *s\n',
    );
    expect(() => validateEditedWorkflow(aliased)).toThrow(/alias/);
  });
  it('accepts the guard wrapped in ${{ }} and whitespace changes', () => {
    expect(() => validateEditedWorkflow(yamlOf((d) => (d.jobs.review.if = `\${{   ${GUARD}  }}`)))).not.toThrow();
    expect(() => validateEditedWorkflow(yamlOf((d) => (d.jobs.review.if = GUARD.replace(' == ', '  ==  '))))).not.toThrow();
    expect(() => validateEditedWorkflow(yamlOf((d) => (d.jobs.review['timeout-minutes'] = 10)))).not.toThrow();
  });
  it('never returns a non-422 error for odd shapes', () => {
    for (const t of ['on: pull_request', '[1]', 'jobs: 3', 'on: {pull_request: {}}\njobs: {a: 1}']) {
      expect(() => validateEditedWorkflow(t)).toThrow(/Workflow|permissions/);
    }
  });
});

describe('patchWorkflow', () => {
  it('rewrites triggers and post-as and preserves comments and other keys', () => {
    const text = '# keep me\n' + wf().replace('name: DevDigest Review', 'name: DevDigest Review\nenv:\n  EXTRA: "1" # note');
    const out = patchWorkflow(text, { triggers: ['reopened'], postAs: 'none', installationId: 'inst-new' });
    expect(out).toContain('# keep me');
    expect(out).toContain('# note');
    const d = parse(out);
    expect(d.on.pull_request.types).toEqual(['reopened']);
    expect(d.jobs.review.steps[2].env.DEVDIGEST_POST_AS).toBe('none');
    expect(d.env).toEqual({ EXTRA: '1' });
    expect(() => validateEditedWorkflow(out)).not.toThrow();
  });
  it('overwrites a stale installation id on the runner step only', () => {
    const stale = wf().replace('inst-1', 'stale-id');
    const d = parse(patchWorkflow(stale, { triggers: ['opened'], postAs: 'none', installationId: 'inst-new' }));
    expect(d.jobs.review.steps[2].env.DEVDIGEST_INSTALLATION_ID).toBe('inst-new');
    expect(d.jobs.review.steps[0].env).toBeUndefined();
  });
  it('patches the right step when a non-mapping step precedes it', () => {
    const text = wf().replace('steps:\n', 'steps:\n      - null\n');
    const d = parse(patchWorkflow(text, { triggers: ['opened'], postAs: 'none', installationId: 'x' }));
    expect(d.jobs.review.steps[3].env.DEVDIGEST_INSTALLATION_ID).toBe('x');
  });
  it('turns yaml errors into a 422', () => {
    expect(() => patchWorkflow('a: [', { triggers: ['opened'], postAs: 'none', installationId: 'x' })).toThrow(/YAML/);
    expect(() => patchWorkflow('on: pull_request', { triggers: ['opened'], postAs: 'none', installationId: 'x' })).toThrow(/patched|YAML/);
  });
});

describe('bundle', () => {
  const slugs = assertSafeSlugs(agent.name, [{ name: 'Sk', body: 'body' }]);
  const files = buildBundle({ agent, slugs, memory: [], runner: 'R', workflow: wf() });
  it('has all kinds with editable flags, including the runner package.json', () => {
    expect(files.map((f) => [f.path, f.editable])).toEqual([
      ['.github/workflows/devdigest-review.yml', true],
      ['.devdigest/agents/security-reviewer.yaml', false],
      ['.devdigest/skills/sk.md', true],
      ['.devdigest/memory.jsonl', false],
      ['.devdigest/runner/index.js', false],
      ['.devdigest/runner/package.json', false],
    ]);
    expect(files.at(-1)!.contents).toBe(RUNNER_PACKAGE_JSON);
  });
  it('manifest round-trips through AgentManifest', () => {
    const m = AgentManifest.parse(parse(files[1]!.contents));
    expect(m.name).toBe(agent.name);
    expect(m.skills).toEqual(['sk']);
    expect(m.system_prompt).toBe(agent.systemPrompt);
  });
  it('empty memory is an empty file', () => {
    expect(buildMemoryJsonl([])).toBe('');
    expect(buildMemoryJsonl([{ content: 'c', kind: 'fact' }])).toBe('{"content":"c","kind":"fact"}\n');
  });
  it('edits may only target editable generated files', () => {
    expect(() => validateEdits([{ path: '.devdigest/sk.md', contents: '' }], files)).toThrow(/not part/);
    for (const p of ['.devdigest/memory.jsonl', '.devdigest/runner/index.js', '.devdigest/runner/package.json', '.devdigest/agents/security-reviewer.yaml']) {
      expect(() => validateEdits([{ path: p, contents: '' }], files)).toThrow(/not editable/);
    }
    expect(() => validateEdits([{ path: '.devdigest/skills/sk.md', contents: 'n' }], files)).not.toThrow();
  });
  it('installationIdFor is deterministic and uuid-shaped', () => {
    const id = installationIdFor('a', 'o/r');
    expect(id).toBe(installationIdFor('a', 'o/r'));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('zip', () => {
  it('round-trips an entry', () => {
    const zip = zipFiles([{ path: 'a.txt', contents: 'héllo' }, { path: 'devdigest-result.json', contents: '{"x":1}' }]);
    expect(readSingleZipEntry(zip, 'devdigest-result.json', 100)).toBe('{"x":1}');
    expect(readSingleZipEntry(zip, 'a.txt', 100)).toBe('héllo');
  });
  it('throws oversized without parsing, and missing', () => {
    const spy = vi.spyOn(JSON, 'parse');
    const zip = zipFiles([{ path: 'devdigest-result.json', contents: 'x'.repeat(65_537) }]);
    expect(() => readSingleZipEntry(zip, 'devdigest-result.json', 65_536)).toThrow(ZipError);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(() => readSingleZipEntry(zip, 'nope', 10)).toThrow(/missing/);
  });
  it('enforces the limit while inflating even if the header lies', () => {
    const zip = zipFiles([{ path: 'f', contents: 'x'.repeat(5000) }]);
    // forge the central-directory uncompressed size down to 10
    const eocd = zip.length - 22;
    const cdOff = zip.readUInt32LE(eocd + 16);
    zip.writeUInt32LE(10, cdOff + 24);
    expect(() => readSingleZipEntry(zip, 'f', 100)).toThrow(/oversized/);
  });
});

describe('verifyArtifact / ingest rules', () => {
  const run = { head_sha: 'abc', head_branch: 'feat', repository: { id: 7, full_name: 'o/r' }, pull_numbers: [5] };
  const inst = { id: 'i1', repo: 'o/r', githubRepoId: 7 };
  const art = CiResultArtifact.parse({
    findings_count: 1, cost_usd: null, agent: 'a', repository: 'o/r', repository_id: 7,
    head_sha: 'abc', pr_number: 5, installation_id: 'i1',
  });
  it('accepts a matching artifact', () => expect(verifyArtifact(art, run, inst)).toBeNull());
  it('requires the artifact to match the installation repo (AC-51)', () => {
    const other = { ...run, repository: { id: 9, full_name: 'x/y' } };
    expect(verifyArtifact({ ...art, repository: 'x/y', repository_id: 9 }, other, inst)).toEqual({ field: 'repository' });
    expect(verifyArtifact(art, run, { ...inst, githubRepoId: 8 })).toEqual({ field: 'repository_id' });
  });
  it('accepts an emptied pull_numbers only when the PR was verified', () => {
    const emptied = { ...run, pull_numbers: [] };
    expect(verifyArtifact(art, emptied, inst)).toEqual({ field: 'pr_number' });
    expect(verifyArtifact(art, emptied, inst, true)).toBeNull();
    expect(verifyArtifact(art, run, { ...inst }, true)).toBeNull();
    expect(verifyArtifact({ ...art, pr_number: 6 }, run, inst, true)).toEqual({ field: 'pr_number' });
    expect(pullMatchesRun({ head_ref: 'feat', head_sha: 'z' }, run)).toBe(true);
    expect(pullMatchesRun({ head_ref: 'o', head_sha: 'abc' }, run)).toBe(true);
    expect(pullMatchesRun({ head_ref: 'o', head_sha: 'z' }, run)).toBe(false);
  });
  it.each([
    ['repository', { repository: 'x/y' }],
    ['repository_id', { repository_id: 8 }],
    ['head_sha', { head_sha: 'zzz' }],
    ['pr_number', { pr_number: 6 }],
    ['pr_number', { pr_number: undefined }],
    ['installation_id', { installation_id: 'other' }],
    ['installation_id', { installation_id: undefined }],
  ])('names %s on mismatch', (field, patch) => {
    expect(verifyArtifact({ ...art, ...patch }, run, inst)).toEqual({ field });
  });
  it('shouldIngest / statusFor / stalePaths / verdictFor', () => {
    expect(shouldIngest({ head_branch: 'devdigest/ci', conclusion: 'failure' })).toBe(false);
    expect(shouldIngest({ head_branch: 'x', conclusion: 'skipped' })).toBe(false);
    expect(shouldIngest({ head_branch: 'x', conclusion: 'cancelled' })).toBe(true);
    expect(statusFor({ findings_count: 0 })).toBe('no_findings');
    expect(statusFor({ findings_count: 2 })).toBe('succeeded');
    const existing = ['.devdigest/agents/old.yaml', '.devdigest/agents/new.yaml', '.devdigest/skills/x.md', '.github/workflows/devdigest-review.yml', '.devdigest/runner/index.js', '.devdigest/agents/dir/deep.yaml'];
    expect(stalePaths(existing, ['.devdigest/agents/new.yaml'])).toEqual(['.devdigest/agents/old.yaml', '.devdigest/skills/x.md']);
    expect(verdictFor({ status: 'failed', blockers: null, findingsCount: null })).toBeNull();
    expect(verdictFor({ status: 'succeeded', blockers: 1, findingsCount: 1 })).toBe('request_changes');
    expect(verdictFor({ status: 'no_findings', blockers: 0, findingsCount: 0 })).toBe('approve');
  });
});
