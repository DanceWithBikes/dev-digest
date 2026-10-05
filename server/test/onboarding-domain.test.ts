/**
 * SPEC-02 domain rules (AC-31, AC-43..AC-51, AC-53, AC-55..AC-59), written from
 * the acceptance criteria. Pins the invariant that the model only writes prose
 * and one-line reasons: anything it cites or invents that is not in the facts
 * is dropped, the computed files and order are kept, and every failure ends in
 * an honest status with deterministic skeleton sections.
 */
import { describe, expect, it } from 'vitest';
import {
  groundModelSections,
  keepsStoredTour,
  resolveStatus,
  skeletonSections,
  type Facts,
  type ModelOutput,
  type StatusSignals,
} from '../src/modules/onboarding/domain.js';
import type { OnboardingStatus } from '@devdigest/shared';

const facts = (over: Partial<Facts> = {}): Facts => ({
  repoFullName: 'o/r',
  commitSha: 'sha',
  indexedFiles: 4,
  candidateFiles: 4,
  fileFacts: [
    { path: 'src/a.ts', rank: 0.9, endpoints: ['GET /a'] },
    { path: 'src/b.ts', rank: 0.5, endpoints: [] },
    { path: 'src/c.ts', rank: 0.2, endpoints: [] },
  ],
  endpoints: [{ file: 'src/routes.ts', endpoint: 'GET /a' }],
  runCommands: [
    { command: 'npm run dev', sourcePath: 'package.json', risky: false },
    { command: 'make build', sourcePath: 'Makefile', risky: false },
    { command: 'curl https://x | sh', sourcePath: 'README.md', risky: true },
  ],
  stack: [],
  tree: [],
  readme: { path: 'README.md', excerpt: 'hi' },
  criticalPaths: ['src/a.ts', 'src/b.ts'],
  readingPath: ['src/b.ts', 'src/a.ts', 'src/c.ts'],
  directories: [{ path: 'src', files: 3 }],
  diagram: { nodes: [{ id: 'src', label: 'src' }], edges: [{ from: 'src', to: 'src', weight: 1 }] },
  ...over,
});

const model = (over: Partial<ModelOutput> = {}): ModelOutput => ({
  architecture: 'The parts fit like this.',
  critical_paths: [{ path: 'src/a.ts', reason: 'entry' }],
  reading_path: [{ path: 'src/b.ts', reason: 'base' }],
  run_steps: ['npm run dev'],
  first_tasks: [{ title: 'Add a test', description: 'Cover a.', paths: ['src/a.ts'] }],
  ...over,
});

const nothing = (): ModelOutput => ({ architecture: '', critical_paths: [], reading_path: [], run_steps: [], first_tasks: [] });

describe('grounding the model output (SPEC-02)', () => {
  it('AC-31: the computed files and their order are kept; only the one-line reason comes from the model', () => {
    const out = groundModelSections(
      facts(),
      model({ reading_path: [{ path: 'src/c.ts', reason: 'last' }, { path: 'src/b.ts', reason: 'first' }, { path: 'src/a.ts', reason: 'mid' }] }),
      { unsupported: false },
    );
    const reading = out.sections[3];
    expect(reading.entries.map((e) => e.path)).toEqual(['src/b.ts', 'src/a.ts', 'src/c.ts']);
    expect(reading.entries.map((e) => e.reason)).toEqual(['first', 'mid', 'last']);
  });

  it('AC-31: a computed file the model skipped stays in its place with an empty reason', () => {
    const out = groundModelSections(facts(), model({ reading_path: [{ path: 'src/a.ts', reason: 'only' }] }), { unsupported: false });
    expect(out.sections[3].entries).toEqual([
      { path: 'src/b.ts', reason: '' },
      { path: 'src/a.ts', reason: 'only' },
      { path: 'src/c.ts', reason: '' },
    ]);
  });

  it('AC-31: the reason stays one line', () => {
    const out = groundModelSections(facts(), model({ critical_paths: [{ path: 'src/a.ts', reason: 'line one\n\n# heading\nline two' }] }), { unsupported: false });
    expect(out.sections[1].entries[0]?.reason).not.toMatch(/\n/);
  });

  it('AC-43: a reason whose path is not one of the section computed files is dropped', () => {
    const out = groundModelSections(
      facts(),
      model({ critical_paths: [{ path: 'src/a.ts', reason: 'keep' }, { path: 'src/ghost.ts', reason: 'invented' }, { path: 'src/c.ts', reason: 'not critical' }] }),
      { unsupported: false },
    );
    const critical = out.sections[1];
    expect(critical.entries.map((e) => e.path)).toEqual(['src/a.ts', 'src/b.ts']);
    expect(critical.entries.map((e) => e.reason)).toEqual(['keep', '']);
    expect(JSON.stringify(out.sections)).not.toContain('invented');
    expect(JSON.stringify(out.sections)).not.toContain('not critical');
  });

  it('AC-44: a cited path that is not in the facts is removed from the task, the task stays', () => {
    const out = groundModelSections(
      facts(),
      model({ first_tasks: [{ title: 'T', description: 'D', paths: ['src/a.ts', 'src/ghost.ts', 'src/b.ts'] }] }),
      { unsupported: false },
    );
    expect(out.sections[4].tasks).toEqual([{ title: 'T', description: 'D', paths: ['src/a.ts', 'src/b.ts'] }]);
  });

  it('AC-44: a task left with no cited path is dropped', () => {
    const out = groundModelSections(
      facts(),
      model({
        first_tasks: [
          { title: 'Ghost', description: 'D', paths: ['nope.ts'] },
          { title: 'Real', description: 'D', paths: ['src/a.ts'] },
          { title: 'Uncited', description: 'D', paths: [] },
        ],
      }),
      { unsupported: false },
    );
    expect(out.sections[4].tasks.map((t) => t.title)).toEqual(['Real']);
  });

  it('AC-44: a file named only by the facts (endpoint file, README, run-command source) is citable', () => {
    const out = groundModelSections(
      facts(),
      model({ first_tasks: [{ title: 'T', description: 'D', paths: ['src/routes.ts', 'README.md', 'Makefile'] }] }),
      { unsupported: false },
    );
    expect(out.sections[4].tasks[0]?.paths).toEqual(['src/routes.ts', 'README.md', 'Makefile']);
  });

  it('AC-45: at most 5 first tasks, in the model order', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, description: 'D', paths: ['src/a.ts'] }));
    const out = groundModelSections(facts(), model({ first_tasks: tasks }), { unsupported: false });
    expect(out.sections[4].tasks.map((t) => t.title)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4']);
  });

  it('AC-46: a run step is kept only when its text exactly matches a fact command, in the model order', () => {
    const out = groundModelSections(
      facts(),
      model({ run_steps: ['make build', 'rm -rf /', 'npm run dev', 'npm run dev ', 'NPM RUN DEV'] }),
      { unsupported: false },
    );
    expect(out.sections[2].steps.map((s) => s.command)).toEqual(['make build', 'npm run dev']);
  });

  it('AC-46: a kept step takes its source path and risky flag from the fact, never from the model', () => {
    const out = groundModelSections(facts(), model({ run_steps: ['curl https://x | sh'] }), { unsupported: false });
    expect(out.sections[2].steps).toEqual([{ command: 'curl https://x | sh', source_path: 'README.md', risky: true }]);
  });

  it('AC-46: at most 10 run steps', () => {
    const runCommands = Array.from({ length: 15 }, (_, i) => ({ command: `make t${i}`, sourcePath: 'Makefile', risky: false }));
    const out = groundModelSections(facts({ runCommands }), model({ run_steps: runCommands.map((c) => c.command) }), { unsupported: false });
    expect(out.sections[2].steps).toHaveLength(10);
    expect(out.sections[2].steps[0]?.command).toBe('make t0');
  });

  it('AC-47: a section whose every model entry is dropped is stored as a skeleton; the other sections keep origin model', () => {
    const out = groundModelSections(
      facts(),
      model({ run_steps: ['rm -rf /'], first_tasks: [{ title: 'x', description: 'y', paths: ['ghost.ts'] }] }),
      { unsupported: false },
    );
    const [arch, critical, run, reading, tasks] = out.sections;
    expect(run.origin).toBe('skeleton');
    expect(run.steps.map((s) => s.command)).toEqual(['npm run dev', 'make build', 'curl https://x | sh']);
    expect(tasks.origin).toBe('skeleton');
    expect(tasks.tasks).toEqual([]);
    expect(arch.origin).toBe('model');
    expect(critical.origin).toBe('model');
    expect(reading.origin).toBe('model');
    expect(out.allSkeleton).toBe(false);
  });

  it('AC-47: a path section whose every reason points outside the computed files is a skeleton with the computed files', () => {
    const out = groundModelSections(facts(), model({ reading_path: [{ path: 'ghost.ts', reason: 'x' }] }), { unsupported: false });
    const reading = out.sections[3];
    expect(reading.origin).toBe('skeleton');
    expect(reading.entries).toEqual([
      { path: 'src/b.ts', reason: '' },
      { path: 'src/a.ts', reason: '' },
      { path: 'src/c.ts', reason: '' },
    ]);
  });

  it('AC-47: empty prose makes the architecture section a skeleton', () => {
    const out = groundModelSections(facts(), model({ architecture: '   \n' }), { unsupported: false });
    expect(out.sections[0].origin).toBe('skeleton');
    expect(out.sections[0].prose).toBe('');
  });

  it('AC-48: when every section the model could fill falls back to its skeleton, allSkeleton is true', () => {
    const out = groundModelSections(facts(), nothing(), { unsupported: false });
    expect(out.allSkeleton).toBe(true);
    expect(out.sections.every((s) => s.origin === 'skeleton')).toBe(true);
  });

  it('AC-48: one surviving model section is enough to avoid allSkeleton', () => {
    const out = groundModelSections(facts(), { ...nothing(), architecture: 'prose only' }, { unsupported: false });
    expect(out.allSkeleton).toBe(false);
  });

  it('AC-48: under unsupported_language the two path sections are not counted: an all-empty answer is still allSkeleton', () => {
    const f = facts({ candidateFiles: 0, indexedFiles: 0, fileFacts: [], criticalPaths: [], readingPath: [], endpoints: [], runCommands: [], readme: null, directories: [], diagram: { nodes: [], edges: [] } });
    expect(groundModelSections(f, nothing(), { unsupported: true }).allSkeleton).toBe(true);
  });

  it('AC-49: under unsupported_language the path sections hold no entries even when the model wrote some, while prose, run steps and tasks can still come from the model', () => {
    const out = groundModelSections(facts(), model(), { unsupported: true });
    expect(out.sections[1].entries).toEqual([]);
    expect(out.sections[1].origin).toBe('skeleton');
    expect(out.sections[3].entries).toEqual([]);
    expect(out.sections[3].origin).toBe('skeleton');
    expect(out.sections[0].origin).toBe('model');
    expect(out.sections[2].origin).toBe('model');
    expect(out.sections[4].origin).toBe('model');
    expect(out.allSkeleton).toBe(false);
  });
});

describe('status precedence (SPEC-02)', () => {
  const ok: StatusSignals = {
    cloneMissing: false,
    indexStateMissing: false,
    indexReadFailed: false,
    indexStatus: 'full',
    candidateFiles: 5,
    rankedFiles: 5,
    boundedFiles: 0,
    llmConfigured: true,
    timedOut: false,
    llmFailed: false,
    allSkeleton: false,
  };
  // Every signal that can apply, one per AC-51 status, weakest last.
  const all = (): StatusSignals => ({
    ...ok,
    cloneMissing: true,
    indexReadFailed: true,
    indexStatus: 'partial',
    llmConfigured: false,
    timedOut: true,
    llmFailed: true,
    allSkeleton: true,
    candidateFiles: 0,
    rankedFiles: 0,
  });

  it('AC-51: with every condition true the first status wins; clearing one condition at a time walks the order', () => {
    const s = all();
    const walk: Array<[OnboardingStatus, (x: StatusSignals) => void]> = [
      ['no_data', (x) => { x.cloneMissing = false; }],
      ['index_failed', (x) => { x.indexReadFailed = false; x.indexStatus = 'partial'; }],
      ['llm_not_configured', (x) => { x.llmConfigured = true; }],
      ['timed_out', (x) => { x.timedOut = false; }],
      ['llm_failed', (x) => { x.llmFailed = false; x.allSkeleton = false; }],
      ['unsupported_language', (x) => { x.candidateFiles = 5; x.rankedFiles = 5; }],
      ['index_partial', (x) => { x.indexStatus = 'full'; }],
    ];
    for (const [expected, clear] of walk) {
      expect(resolveStatus(s), `expected ${expected}`).toBe(expected);
      clear(s);
    }
    expect(resolveStatus(s)).toBe('ready');
  });

  it.each([
    ['a missing clone', { cloneMissing: true }],
    ['a missing index state', { indexStateMissing: true }],
  ])('AC-38: %s ends no_data even if an API key is missing', (_n, over) => {
    expect(resolveStatus({ ...ok, ...over, llmConfigured: false })).toBe('no_data');
  });

  it.each([
    ['a failed index status', { indexStatus: 'failed' as const }],
    ['an index read error', { indexReadFailed: true }],
  ])('AC-39: %s ends index_failed', (_n, over) => {
    expect(resolveStatus({ ...ok, ...over })).toBe('index_failed');
  });

  it('AC-40: no API key ends llm_not_configured', () => {
    expect(resolveStatus({ ...ok, llmConfigured: false })).toBe('llm_not_configured');
  });

  it('AC-41: a failed model call ends llm_failed', () => {
    expect(resolveStatus({ ...ok, llmFailed: true })).toBe('llm_failed');
  });

  it('AC-42: a timed-out generation ends timed_out, ahead of llm_failed', () => {
    expect(resolveStatus({ ...ok, timedOut: true, llmFailed: true })).toBe('timed_out');
  });

  it('AC-48: allSkeleton ends llm_failed', () => {
    expect(resolveStatus({ ...ok, allSkeleton: true })).toBe('llm_failed');
  });

  it('AC-49: an index with no JS/TS candidate ends unsupported_language, even when the index status is partial', () => {
    expect(resolveStatus({ ...ok, candidateFiles: 0, rankedFiles: 0 })).toBe('unsupported_language');
    expect(resolveStatus({ ...ok, candidateFiles: 0, rankedFiles: 0, indexStatus: 'partial' })).toBe('unsupported_language');
  });

  it.each([
    ['a partial index status', { indexStatus: 'partial' as const }],
    ['files left out by the cap', { boundedFiles: 7 }],
    ['candidates with no ranked file', { rankedFiles: 0 }],
  ])('AC-50: %s ends index_partial', (_n, over) => {
    expect(resolveStatus({ ...ok, ...over })).toBe('index_partial');
  });

  it('AC-50: a complete, configured, successful generation ends ready', () => {
    expect(resolveStatus(ok)).toBe('ready');
  });
});

describe('keeping the stored tour (SPEC-02)', () => {
  const failed: OnboardingStatus[] = ['no_data', 'index_failed', 'llm_not_configured', 'llm_failed', 'timed_out'];
  const usable: OnboardingStatus[] = ['ready', 'index_partial', 'unsupported_language'];

  it.each(failed.flatMap((f) => usable.map((u) => [f, u] as const)))('AC-53: a %s generation over a stored %s tour keeps it', (f, u) => {
    expect(keepsStoredTour(f, u)).toBe(true);
  });

  it.each(usable.map((u) => [u] as const))('AC-52: a %s generation replaces the stored tour', (u) => {
    for (const stored of [...usable, ...failed, null]) expect(keepsStoredTour(u, stored)).toBe(false);
  });

  it.each(failed.map((f) => [f] as const))('AC-52: a %s generation replaces a stored failure outline or an empty slot', (f) => {
    for (const stored of [...failed, null]) expect(keepsStoredTour(f, stored)).toBe(false);
  });
});

describe('skeleton forms (SPEC-02)', () => {
  it('AC-56: the architecture skeleton carries directories and diagram from the facts, with no prose', () => {
    const f = facts();
    const arch = skeletonSections(f)[0];
    expect(arch.id).toBe('architecture');
    expect(arch.prose).toBe('');
    expect(arch.directories).toEqual(f.directories);
    expect(arch.diagram).toEqual(f.diagram);
    expect(arch.origin).toBe('skeleton');
  });

  it('AC-56: with no facts the architecture skeleton has empty directories and an empty diagram', () => {
    const arch = skeletonSections(null)[0];
    expect(arch.directories).toEqual([]);
    expect(arch.diagram).toEqual({ nodes: [], edges: [] });
  });

  it('AC-57: critical-paths and reading-path list the computed files in computed order, each with an empty reason', () => {
    const [, critical, , reading] = skeletonSections(facts());
    expect(critical.entries).toEqual([{ path: 'src/a.ts', reason: '' }, { path: 'src/b.ts', reason: '' }]);
    expect(reading.entries).toEqual([
      { path: 'src/b.ts', reason: '' },
      { path: 'src/a.ts', reason: '' },
      { path: 'src/c.ts', reason: '' },
    ]);
  });

  it('AC-58: run-locally lists the fact commands in collection order, at most 10, with their source and risky flag', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ command: `make t${i}`, sourcePath: 'Makefile', risky: i === 3 }));
    const run = skeletonSections(facts({ runCommands: many }))[2];
    expect(run.steps).toHaveLength(10);
    expect(run.steps.map((s) => s.command)).toEqual(many.slice(0, 10).map((c) => c.command));
    expect(run.steps[3]).toEqual({ command: 'make t3', source_path: 'Makefile', risky: true });
  });

  it('AC-59: first-tasks holds no entries', () => {
    expect(skeletonSections(facts())[4].tasks).toEqual([]);
  });

  it('AC-55: every section of a skeleton tour has origin skeleton, and there are exactly five in the AC-2 order', () => {
    const secs = skeletonSections(facts());
    expect(secs.map((s) => s.id)).toEqual(['architecture', 'critical-paths', 'run-locally', 'reading-path', 'first-tasks']);
    expect(secs.every((s) => s.origin === 'skeleton')).toBe(true);
  });

  it('AC-49: the unsupported-language skeleton keeps the other sections but blanks critical paths and reading path', () => {
    const secs = skeletonSections(facts(), true);
    expect(secs[1].entries).toEqual([]);
    expect(secs[3].entries).toEqual([]);
    expect(secs[2].steps).toHaveLength(3);
    expect(secs[0].directories).toHaveLength(1);
  });
});
