/**
 * SPEC-02 deterministic facts and the sections computed from the import graph
 * (AC-16, AC-18..AC-30, NFR-2), written from the acceptance criteria. Pins the
 * invariant that the facts and the reading order are computed by a program, are
 * bounded, are reproducible, and never read secrets or escape the clone.
 * Pure functions only: no I/O, no clock, no model.
 */
import { describe, expect, it } from 'vitest';
import {
  assembleFacts,
  buildArchitecture,
  buildTree,
  extractRunCommands,
  isRisky,
  orderReadingPath,
  selectCriticalPaths,
  selectEndpoints,
  selectFileFacts,
  selectProjectFiles,
  selectReadingPath,
  type FactsInput,
} from '../src/modules/onboarding/helpers.js';

const pad = (n: number, w = 3) => String(n).padStart(w, '0');

function input(over: Partial<FactsInput> = {}): FactsInput {
  return {
    repoFullName: 'o/r',
    commitSha: 'abc',
    indexedFiles: 3,
    candidateFiles: 3,
    ranked: [
      { path: 'src/a.ts', rank: 0.9 },
      { path: 'src/b.ts', rank: 0.5 },
      { path: 'lib/c.ts', rank: 0.1 },
    ],
    edges: [{ from: 'src/a.ts', to: 'src/b.ts' }],
    endpoints: [{ file: 'src/a.ts', endpoint: 'GET /a' }],
    chains: [['src/a.ts', 'src/b.ts']],
    trackedPaths: ['package.json', 'pnpm-lock.yaml', 'README.md'],
    files: [
      { path: 'package.json', text: JSON.stringify({ scripts: { dev: 'x' } }) },
      { path: 'README.md', text: '# hi\n```sh\nmake all\n```' },
    ],
    readmePath: 'README.md',
    ...over,
  };
}

describe('facts: reproducibility (SPEC-02)', () => {
  it('AC-16: two builds from the same index and clone contents are byte-identical', () => {
    expect(JSON.stringify(assembleFacts(input()))).toBe(JSON.stringify(assembleFacts(input())));
  });
});

describe('facts: file facts and limits (SPEC-02)', () => {
  const ranked = [
    ...Array.from({ length: 40 }, (_, i) => ({ path: `src/f${pad(i)}.ts`, rank: 1 - i / 100 })),
  ];

  it('AC-18: at most the 30 highest-ranked files, in rank order', () => {
    const facts = selectFileFacts(ranked, []);
    expect(facts).toHaveLength(30);
    expect(facts[0]?.path).toBe('src/f000.ts');
    expect(facts[29]?.path).toBe('src/f029.ts');
  });

  it.each([
    'src/a.test.ts',
    'src/a.spec.tsx',
    'src/__tests__/a.ts',
    'test/a.ts',
    'src/mocks/a.ts',
    'src/a.mock.ts',
    'src/__mocks__/a.ts',
    'src/fixtures/a.ts',
    'src/__fixtures__/a.ts',
    'vitest.config.ts',
    'tsconfig.json',
    'src/types.d.ts',
    'src/db/migrations/0001_init.sql',
    'src/db/migrations/0001_init.ts',
  ])('AC-18: %s is left out of the file facts, the reading path and the critical paths', (path) => {
    const mixed = [{ path, rank: 5 }, { path: 'src/real.ts', rank: 1 }];
    expect(selectFileFacts(mixed, []).map((f) => f.path)).toEqual(['src/real.ts']);
    expect(selectReadingPath(mixed).map((f) => f.path)).toEqual(['src/real.ts']);
    expect(selectCriticalPaths([[path, 'src/real.ts']])).toEqual(['src/real.ts']);
  });

  it('AC-19: at most 50 endpoints', () => {
    const eps = Array.from({ length: 80 }, (_, i) => ({ file: 'src/a.ts', endpoint: `GET /r${i}` }));
    expect(selectEndpoints(eps)).toHaveLength(50);
  });

  it('AC-19: at most 20 run commands', () => {
    const makefile = Array.from({ length: 35 }, (_, i) => `t${pad(i)}:\n\techo`).join('\n');
    const out = extractRunCommands([{ path: 'Makefile', text: makefile }], ['Makefile'], null);
    expect(out).toHaveLength(20);
  });

  it('AC-19: a directory tree of at most 200 entries, down to depth 2 only', () => {
    const paths = Array.from({ length: 300 }, (_, i) => `d${pad(i)}/sub/deep/file.ts`);
    const tree = buildTree(paths);
    expect(tree.length).toBeLessThanOrEqual(200);
    expect(tree.every((e) => e.replace(/\/$/, '').split('/').length <= 2)).toBe(true);
    expect(buildTree(['a/b/c/d.ts'])).toEqual(['a/', 'a/b/']);
  });

  it('AC-19: at most the first 8,000 characters of the root README', () => {
    const text = 'x'.repeat(20_000);
    const facts = assembleFacts(input({ files: [{ path: 'README.md', text }] }));
    expect(facts.readme?.excerpt).toHaveLength(8_000);
    expect(facts.readme?.excerpt).toBe(text.slice(0, 8_000));
  });
});

describe('facts: run commands (SPEC-02)', () => {
  const run = (files: Array<{ path: string; text: string }>, tracked: string[], readme: string | null = null) => {
    const selection = selectProjectFiles(tracked);
    const wanted = files.filter((f) => selection.manifests.includes(f.path) || f.path === selection.readme);
    return extractRunCommands(wanted, tracked, readme ?? selection.readme);
  };
  const pkg = (scripts: Record<string, string>, extra: object = {}) =>
    JSON.stringify({ scripts, ...extra });

  it('AC-21: commands come from package.json scripts, Makefile targets, Compose files, .nvmrc / engines and README shell fences', () => {
    const out = run(
      [
        { path: 'package.json', text: pkg({ dev: 'x' }, { engines: { node: '>=22' } }) },
        { path: 'Makefile', text: 'build:\n\tgo build\n' },
        { path: 'docker-compose.yml', text: 'services: {}' },
        { path: '.nvmrc', text: '22' },
        { path: 'README.md', text: '```bash\nnpm ci\n```' },
      ],
      ['package.json', 'Makefile', 'docker-compose.yml', '.nvmrc', 'README.md'],
    );
    const sources = new Set(out.map((c) => c.sourcePath));
    expect([...sources].sort()).toEqual(['.nvmrc', 'Makefile', 'README.md', 'docker-compose.yml', 'package.json']);
    expect(out.find((c) => c.sourcePath === 'package.json' && c.command.endsWith('dev'))).toBeDefined();
    expect(out.find((c) => c.sourcePath === 'Makefile')?.command).toBe('make build');
    expect(out.find((c) => c.sourcePath === 'README.md')?.command).toBe('npm ci');
  });

  it('AC-21: manifests two directories deep, and READMEs below the root, contribute nothing', () => {
    const out = run(
      [
        { path: 'apps/web/package.json', text: pkg({ deep: 'x' }) },
        { path: 'docs/README.md', text: '```sh\nrm -rf /\n```' },
        { path: 'apps/package.json', text: pkg({ one: 'x' }) },
      ],
      ['apps/web/package.json', 'docs/README.md', 'apps/package.json'],
    );
    expect(out.map((c) => c.sourcePath)).toEqual(['apps/package.json']);
  });

  it('AC-21: only fenced SHELL blocks of the README count, not prose or other languages', () => {
    const readme = 'run `npm start` now\n```js\nconsole.log(1)\n```\n```sh\nnpm install\n```';
    const out = run([{ path: 'README.md', text: readme }], ['README.md']);
    expect(out.map((c) => c.command)).toEqual(['npm install']);
  });

  it.each([
    ['pnpm-lock.yaml', 'pnpm run dev'],
    ['yarn.lock', 'yarn run dev'],
    ['bun.lockb', 'bun run dev'],
    ['package-lock.json', 'npm run dev'],
  ])('AC-22: a script next to %s is prefixed %s', (lock, expected) => {
    const out = run([{ path: 'package.json', text: pkg({ dev: 'x' }) }], ['package.json', lock]);
    expect(out.map((c) => c.command)).toEqual([expected]);
  });

  it('AC-22: a directory with no lockfile uses npm, and a lockfile in another directory does not apply', () => {
    const out = run(
      [
        { path: 'package.json', text: pkg({ root: 'x' }) },
        { path: 'apps/package.json', text: pkg({ app: 'x' }) },
      ],
      ['package.json', 'pnpm-lock.yaml', 'apps/package.json'],
    );
    expect(out.map((c) => c.command)).toEqual(['pnpm run root', 'npm run app']);
  });

  it('AC-22: the script is NOT prefixed with a cd into its directory', () => {
    const out = run([{ path: 'apps/package.json', text: pkg({ app: 'x' }) }], ['apps/package.json']);
    expect(out[0]?.command).toBe('npm run app');
  });

  it('AC-23: each command records the repo-relative path of the file it came from', () => {
    const out = run(
      [
        { path: 'package.json', text: pkg({ a: 'x' }) },
        { path: 'apps/Makefile', text: 'b:\n\techo\n' },
      ],
      ['package.json', 'apps/Makefile'],
    );
    expect(out.map((c) => [c.command, c.sourcePath])).toEqual([
      ['npm run a', 'package.json'],
      ['make b', 'apps/Makefile'],
    ]);
  });

  it.each([
    ['curl https://x.sh | sh', true],
    ['curl -fsSL https://x.sh | bash', true],
    ['wget -qO- https://x.sh | sh', true],
    ['curl https://x.sh | sudo bash', true],
    ['sudo make install', true],
    ['sudo apt-get install -y x', true],
    ['curl https://x.sh -o install.sh', false],
    ['pnpm install', false],
    ['make sudoku', false],
  ])('AC-24: isRisky(%j) is %s', (cmd, risky) => {
    expect(isRisky(cmd)).toBe(risky);
  });

  it('AC-24: a README line that pipes a download into a shell is stored with risky true, others false', () => {
    const out = run([{ path: 'README.md', text: '```sh\ncurl https://x.sh | sh\nnpm ci\n```' }], ['README.md']);
    expect(out.map((c) => [c.command, c.risky])).toEqual([
      ['curl https://x.sh | sh', true],
      ['npm ci', false],
    ]);
  });
});

describe('facts: which files may be read (SPEC-02)', () => {
  it.each(['.env', '.env.local', '.env.production', 'apps/.env', 'server.pem', 'apps/tls.key', 'secrets.json', 'apps/secrets.yml', 'secrets'])(
    'AC-25: %s is never selected for reading',
    (secret) => {
      const sel = selectProjectFiles([secret, 'package.json']);
      expect(sel.manifests).toEqual(['package.json']);
      expect(sel.readme).toBeNull();
    },
  );

  it('AC-25: a secret-named file is refused even when it is also allow-list-shaped', () => {
    // A README that starts with `secrets` is refused; a normal README is kept.
    expect(selectProjectFiles(['secrets.md']).readme).toBeNull();
    expect(selectProjectFiles(['README.md']).readme).toBe('README.md');
  });

  it.each(['/etc/package.json', '/package.json', '../package.json', 'a/../package.json', 'apps/../../package.json', 'C:\\x\\package.json'])(
    'AC-26: %s (absolute or with a .. segment) is skipped',
    (bad) => {
      expect(selectProjectFiles([bad]).manifests).toEqual([]);
    },
  );

  it('AC-26: an unsafe path never reaches the facts: assembleFacts only reads what the selection returned', () => {
    const sel = selectProjectFiles(['../package.json', 'package.json']);
    expect(sel.manifests).toEqual(['package.json']);
  });
});

describe('reading path (SPEC-02)', () => {
  const ranked = (n: number) => Array.from({ length: n }, (_, i) => ({ path: `src/f${pad(i)}.ts`, rank: 1 - i / 100 }));

  it('AC-27: the 12 highest-ranked non-excluded files', () => {
    const withExcluded = [{ path: 'src/top.test.ts', rank: 9 }, ...ranked(20)];
    const out = selectReadingPath(withExcluded);
    expect(out).toHaveLength(12);
    expect(out.map((f) => f.path)).toEqual(ranked(12).map((f) => f.path));
  });

  it('AC-27: all of them when fewer than 12 exist', () => {
    expect(selectReadingPath(ranked(5))).toHaveLength(5);
    expect(selectReadingPath([])).toEqual([]);
  });

  it('AC-28: each file comes after every other reading-path file it imports', () => {
    const files = [
      { path: 'app.ts', rank: 0.9 },
      { path: 'svc.ts', rank: 0.6 },
      { path: 'db.ts', rank: 0.3 },
      { path: 'util.ts', rank: 0.1 },
    ];
    const edges = [
      { from: 'app.ts', to: 'svc.ts' },
      { from: 'svc.ts', to: 'db.ts' },
      { from: 'db.ts', to: 'util.ts' },
      { from: 'app.ts', to: 'util.ts' },
    ];
    expect(orderReadingPath(files, edges)).toEqual(['util.ts', 'db.ts', 'svc.ts', 'app.ts']);
  });

  it('AC-28: among ready files the higher rank goes first, and equal ranks go by path ascending', () => {
    const files = [
      { path: 'x.ts', rank: 0.5 },
      { path: 'a.ts', rank: 0.5 },
      { path: 'm.ts', rank: 0.5 },
      { path: 'hi.ts', rank: 0.8 },
    ];
    expect(orderReadingPath(files, [])).toEqual(['hi.ts', 'a.ts', 'm.ts', 'x.ts']);
  });

  it('AC-28: a high-ranked file is delayed behind a lower-ranked file it imports', () => {
    const files = [
      { path: 'a.ts', rank: 0.9 },
      { path: 'b.ts', rank: 0.5 },
      { path: 'c.ts', rank: 0.1 },
      { path: 'e.ts', rank: 0.3 },
    ];
    const edges = [
      { from: 'a.ts', to: 'b.ts' },
      { from: 'b.ts', to: 'c.ts' },
    ];
    expect(orderReadingPath(files, edges)).toEqual(['e.ts', 'c.ts', 'b.ts', 'a.ts']);
  });

  it('AC-28: a three-file cycle is broken by the highest-ranked remaining file, then the order resumes', () => {
    const files = [
      { path: 'a.ts', rank: 0.9 },
      { path: 'b.ts', rank: 0.5 },
      { path: 'c.ts', rank: 0.1 },
      { path: 'd.ts', rank: 0.7 },
    ];
    const edges = [
      { from: 'a.ts', to: 'b.ts' },
      { from: 'b.ts', to: 'c.ts' },
      { from: 'c.ts', to: 'a.ts' },
    ];
    expect(orderReadingPath(files, edges)).toEqual(['d.ts', 'a.ts', 'c.ts', 'b.ts']);
  });

  it('AC-28: an import of a file outside the reading path imposes no order, and a self-import is ignored', () => {
    const files = [
      { path: 'a.ts', rank: 0.9 },
      { path: 'b.ts', rank: 0.1 },
    ];
    const edges = [
      { from: 'a.ts', to: 'outside.ts' },
      { from: 'a.ts', to: 'a.ts' },
    ];
    expect(orderReadingPath(files, edges)).toEqual(['a.ts', 'b.ts']);
  });

  it('AC-28: the order is a permutation of exactly the selected files', () => {
    const files = ranked(12);
    const edges = files.slice(1).map((f, i) => ({ from: files[i]!.path, to: f.path }));
    const out = orderReadingPath(files, edges);
    expect([...out].sort()).toEqual(files.map((f) => f.path).sort());
  });
});

describe('critical paths (SPEC-02)', () => {
  it('AC-29: at most 8 distinct files, taken from the chains in chain order', () => {
    const chains = [
      ['a.ts', 'b.ts', 'c.ts'],
      ['d.ts', 'b.ts', 'e.ts'],
      ['f.ts', 'g.ts', 'h.ts', 'i.ts', 'j.ts'],
    ];
    expect(selectCriticalPaths(chains)).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts', 'g.ts', 'h.ts']);
  });

  it('AC-29: a chain root that is a test or config file is skipped, the rest of its chain stays', () => {
    expect(selectCriticalPaths([['vitest.config.ts', 'src/a.ts', 'src/a.test.ts', 'src/b.ts']])).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('AC-29: no chains give no critical paths', () => {
    expect(selectCriticalPaths([])).toEqual([]);
  });
});

describe('architecture diagram (SPEC-02)', () => {
  it('AC-30: with no cross-group imports at any depth, depth 1 is used: one node per top-level directory, root files in (root)', () => {
    const arch = buildArchitecture(['index.ts', 'main.ts', 'src/a.ts', 'src/deep/b.ts', 'lib/x/y.ts'], []);
    // depth 1: (root), src (src/a.ts; only-`src` dirs group by their whole directory), deep, lib
    expect(arch.diagram.nodes.map((n) => n.id).sort()).toEqual(['(root)', 'deep', 'lib', 'src']);
    expect(arch.diagram.edges).toEqual([]);
    expect(arch.diagram.nodes.every((n) => n.label.length > 0)).toBe(true);
  });

  it('AC-30: a monorepo whose packages import only within themselves picks depth 2, with `src` not counting as a level', () => {
    const paths = [
      'client/src/app/page.ts',
      'client/src/app/layout.ts',
      'client/src/lib/api.ts',
      'server/src/modules/a.ts',
      'server/src/modules/b.ts',
      'server/src/db/schema.ts',
    ];
    const arch = buildArchitecture(paths, [
      { from: 'client/src/app/page.ts', to: 'client/src/lib/api.ts' },
      { from: 'client/src/app/layout.ts', to: 'client/src/lib/api.ts' },
      { from: 'server/src/modules/a.ts', to: 'server/src/db/schema.ts' },
    ]);
    expect(arch.diagram.nodes.map((n) => n.id).sort()).toEqual(['client/app', 'client/lib', 'server/db', 'server/modules']);
    expect(arch.diagram.nodes.every((n) => n.label === n.id)).toBe(true);
    expect(arch.diagram.edges).toEqual([
      { from: 'client/app', to: 'client/lib', weight: 2 },
      { from: 'server/modules', to: 'server/db', weight: 1 },
    ]);
    // `directories` stays top-level
    expect(arch.directories.map((d) => d.path).sort()).toEqual(['client', 'server']);
  });

  it('AC-30: test, mock and config files are neither nodes nor edge endpoints', () => {
    const arch = buildArchitecture(
      ['a/x.ts', 'a/x.test.ts', 'b/y.ts', 'test/helper.ts', 'c/z.ts'],
      [
        { from: 'a/x.test.ts', to: 'b/y.ts' },
        { from: 'test/helper.ts', to: 'c/z.ts' },
        { from: 'a/x.ts', to: 'b/y.ts' },
      ],
    );
    expect(arch.diagram.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    expect(arch.diagram.edges).toEqual([{ from: 'a', to: 'b', weight: 1 }]);
  });

  it('AC-30: when two depths score the same, the smaller depth wins', () => {
    // One cross edge at depth 1 (a -> b) and the same single edge at depth 2 (a/x -> b): the scores tie at 1.
    const tie = buildArchitecture(['a/x/1.ts', 'a/y/2.ts', 'b/3.ts'], [{ from: 'a/x/1.ts', to: 'b/3.ts' }]);
    expect(tie.diagram.nodes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(tie.diagram.edges).toEqual([{ from: 'a', to: 'b', weight: 1 }]);
  });

  it('AC-30: the 12-group and 20-edge caps hold at the chosen depth', () => {
    // 7 packages x (m, n) = 14 groups at depth 2; imports only inside a package, so depth 1 scores 0.
    const paths: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      for (let f = 0; f < 3; f += 1) paths.push(`p${pad(d, 2)}/src/m/f${f}.ts`);
      for (let f = 0; f < 2; f += 1) paths.push(`p${pad(d, 2)}/src/n/g${f}.ts`);
    }
    const edges = Array.from({ length: 7 }, (_, d) => ({ from: `p${pad(d, 2)}/src/m/f0.ts`, to: `p${pad(d, 2)}/src/n/g0.ts` }));
    const arch = buildArchitecture(paths, edges);
    expect(arch.diagram.nodes).toHaveLength(12);
    expect(arch.diagram.nodes.every((n) => n.id.split('/').length === 2)).toBe(true);
    expect(arch.diagram.edges.length).toBeGreaterThan(0);

    // 30 distinct edges between 12 groups at depth 2 -> only the 20 heaviest survive
    const many: string[] = [];
    for (let d = 0; d < 12; d += 1) for (let f = 0; f < 3; f += 1) many.push(`p${pad(d, 2)}/src/m/f${f}.ts`);
    const manyEdges: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < 12; i += 1) for (let j = 0; j < 12; j += 1) {
      if (i !== j && (i * 12 + j) % 4 === 0) manyEdges.push({ from: `p${pad(i, 2)}/src/m/f0.ts`, to: `p${pad(j, 2)}/src/m/f1.ts` });
    }
    expect(manyEdges.length).toBeGreaterThan(20);
    const capped = buildArchitecture(many, manyEdges);
    expect(capped.diagram.edges).toHaveLength(20);
  });

  it('AC-30: an edge A to B is weighted by the number of import edges from files in A to files in B', () => {
    const arch = buildArchitecture(
      ['a/1.ts', 'a/2.ts', 'a/3.ts', 'b/1.ts', 'b/2.ts'],
      [
        { from: 'a/1.ts', to: 'b/1.ts' },
        { from: 'a/2.ts', to: 'b/1.ts' },
        { from: 'a/3.ts', to: 'b/2.ts' },
        { from: 'b/1.ts', to: 'a/1.ts' },
      ],
    );
    expect(arch.diagram.edges).toContainEqual({ from: 'a', to: 'b', weight: 3 });
    expect(arch.diagram.edges).toContainEqual({ from: 'b', to: 'a', weight: 1 });
    expect(arch.diagram.edges).toHaveLength(2);
  });

  it('AC-30: keeps the 12 nodes with the most indexed files; edges touching a dropped node are dropped too', () => {
    // d00 has 14 files ... d13 has 1 file; d12 and d13 are the two smallest.
    const paths: string[] = [];
    for (let d = 0; d < 14; d += 1) for (let f = 0; f < 14 - d; f += 1) paths.push(`d${pad(d, 2)}/f${f}.ts`);
    const edges = [
      { from: 'd00/f0.ts', to: 'd13/f0.ts' },
      { from: 'd12/f0.ts', to: 'd00/f1.ts' },
      { from: 'd00/f0.ts', to: 'd01/f0.ts' },
    ];
    const arch = buildArchitecture(paths, edges);
    const ids = arch.diagram.nodes.map((n) => n.id);
    expect(ids).toHaveLength(12);
    expect(ids).not.toContain('d12');
    expect(ids).not.toContain('d13');
    expect(arch.diagram.edges).toEqual([{ from: 'd00', to: 'd01', weight: 1 }]);
  });

  it('AC-30: keeps the 20 heaviest edges among the kept nodes, heaviest first', () => {
    const paths: string[] = [];
    for (let d = 0; d < 12; d += 1) for (let f = 0; f < 15; f += 1) paths.push(`d${pad(d, 2)}/f${f}.ts`);
    const edges: Array<{ from: string; to: string }> = [];
    for (let i = 0; i < 12; i += 1) for (let j = i + 1; j < 12; j += 1) edges.push({ from: `d${pad(i, 2)}/f0.ts`, to: `d${pad(j, 2)}/f0.ts` });
    // make two pairs heavier: add distinct file-level imports
    for (const f of [1, 2]) edges.push({ from: `d00/f${f}.ts`, to: 'd01/f0.ts' });
    edges.push({ from: 'd02/f1.ts', to: 'd03/f0.ts' });
    const arch = buildArchitecture(paths, edges);
    expect(arch.diagram.edges).toHaveLength(20);
    expect(arch.diagram.edges[0]).toEqual({ from: 'd00', to: 'd01', weight: 3 });
    expect(arch.diagram.edges[1]).toEqual({ from: 'd02', to: 'd03', weight: 2 });
    expect(arch.diagram.edges.slice(2).every((e) => e.weight === 1)).toBe(true);
  });

  it('AC-30: the architecture of a given index is reproducible', () => {
    const paths = ['a/1.ts', 'b/1.ts', 'c/1.ts'];
    const edges = [{ from: 'a/1.ts', to: 'b/1.ts' }, { from: 'c/1.ts', to: 'b/1.ts' }];
    expect(buildArchitecture(paths, edges)).toEqual(buildArchitecture(paths, edges));
  });
});

describe('fact collection cost (SPEC-02)', () => {
  it('NFR-2: collecting facts for 5,000 indexed files stays far under the 5,000 ms budget', () => {
    const ranked = Array.from({ length: 5_000 }, (_, i) => ({ path: `pkg${pad(i % 40, 2)}/src/f${i}.ts`, rank: 1 - i / 5_000 }));
    const edges = Array.from({ length: 20_000 }, (_, i) => ({
      from: ranked[i % 5_000]!.path,
      to: ranked[(i * 7 + 1) % 5_000]!.path,
    }));
    const started = performance.now();
    const facts = assembleFacts(input({ ranked, edges, indexedFiles: 5_000, candidateFiles: 5_000 }));
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(facts.fileFacts).toHaveLength(30);
    expect(facts.readingPath).toHaveLength(12);
  });
});
