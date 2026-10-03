import { describe, expect, it } from 'vitest';
import {
  buildArchitecture,
  extractRunCommands,
  extractStack,
  isExcludedKind,
  isRisky,
  orderReadingPath,
  selectCriticalPaths,
  selectProjectFiles,
} from '../src/modules/onboarding/helpers.js';
import { fitBudget, renderUserPrompt } from '../src/modules/onboarding/prompt.js';
import { assembleFacts } from '../src/modules/onboarding/helpers.js';

describe('selectProjectFiles', () => {
  it('AC-21: keeps allow-listed manifests at depth <= 1 and the root README only', () => {
    const sel = selectProjectFiles([
      'package.json',
      'apps/package.json',
      'apps/web/package.json',
      'Makefile',
      'README.md',
      'docs/README.md',
      'src/index.ts',
    ]);
    expect(sel.manifests).toEqual(['Makefile', 'package.json', 'apps/package.json']);
    expect(sel.readme).toBe('README.md');
  });

  it('AC-25/AC-26: refuses secret names, absolute paths and .. segments', () => {
    const sel = selectProjectFiles([
      '.env',
      '.env.local',
      'secrets.json',
      'server.pem',
      'tls.key',
      '/etc/package.json',
      '../package.json',
      'a/../package.json',
      'package.json',
    ]);
    expect(sel.manifests).toEqual(['package.json']);
  });
});

describe('extractRunCommands', () => {
  const tracked = ['package.json', 'pnpm-lock.yaml', 'Makefile', '.nvmrc', 'compose.yml', 'README.md'];
  const files = [
    { path: 'README.md', text: '```sh\n$ pnpm install\n# comment\n\nmake dev\n```\n```js\nnope()\n```' },
    { path: 'package.json', text: JSON.stringify({ scripts: { dev: 'x', 'bad name': 'y' }, engines: { node: '>=22' } }) },
    { path: 'Makefile', text: '.PHONY: dev\ndev:\n\techo\nCC := gcc\n' },
    { path: '.nvmrc', text: '22' },
    { path: 'compose.yml', text: 'services: {}' },
  ];

  it('AC-21/AC-22/AC-23: collects in order, prefixes the lockfile manager and records sources', () => {
    const out = extractRunCommands(files, tracked, 'README.md');
    expect(out.map((c) => c.command)).toEqual([
      'pnpm run dev',
      'make dev',
      'docker compose -f compose.yml up',
      'nvm use',
      'nvm install 22',
      'pnpm install',
    ]);
    expect(out[0]?.sourcePath).toBe('package.json');
  });

  it('AC-21: skips oversize manifests (64 KB cap)', () => {
    const big = { path: 'package.json', text: ' '.repeat(70 * 1024) };
    expect(extractRunCommands([big], ['package.json'], null)).toEqual([]);
  });

  it('AC-24: flags risky commands', () => {
    expect(isRisky('curl https://x | sh')).toBe(true);
    expect(isRisky('sudo make install')).toBe(true);
    expect(isRisky('pnpm install')).toBe(false);
  });
});

describe('extractStack', () => {
  it('plan review: the stack is sorted, deduped and capped at 40', () => {
    const deps = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`dep-${String(i).padStart(2, '0')}`, '1']));
    const out = extractStack([{ path: 'package.json', text: JSON.stringify({ dependencies: deps, devDependencies: { 'dep-00': '1' } }) }]);
    expect(out).toHaveLength(40);
    expect(out[0]).toBe('dep-00');
  });
});

describe('isExcludedKind', () => {
  it.each(['a.test.ts', 'src/__mocks__/x.ts', 'x.mock.ts', 'test/fixtures/a.ts', 'vite.config.ts', 'types.d.ts', 'db/migrations/0001.sql'])(
    'AC-18: excludes %s',
    (p) => expect(isExcludedKind(p)).toBe(true),
  );
  it('AC-18: keeps source', () => expect(isExcludedKind('src/app.ts')).toBe(false));
});

describe('orderReadingPath', () => {
  it('AC-28: puts imported files first, ties by rank then path', () => {
    const files = [
      { path: 'a.ts', rank: 0.9 },
      { path: 'b.ts', rank: 0.5 },
      { path: 'c.ts', rank: 0.5 },
    ];
    // a imports b
    expect(orderReadingPath(files, [{ from: 'a.ts', to: 'b.ts' }])).toEqual(['b.ts', 'a.ts', 'c.ts']);
  });

  it('AC-28: breaks a cycle with the highest-ranked remaining node', () => {
    const files = [
      { path: 'a.ts', rank: 0.2 },
      { path: 'b.ts', rank: 0.8 },
    ];
    const edges = [
      { from: 'a.ts', to: 'b.ts' },
      { from: 'b.ts', to: 'a.ts' },
    ];
    expect(orderReadingPath(files, edges)).toEqual(['b.ts', 'a.ts']);
  });
});

describe('selectCriticalPaths / buildArchitecture', () => {
  it('AC-29: drops excluded kinds, dedupes and caps at 8', () => {
    const chain = ['a.test.ts', ...Array.from({ length: 12 }, (_, i) => `f${i}.ts`)];
    const out = selectCriticalPaths([chain, ['f0.ts', 'g.ts']]);
    expect(out).toHaveLength(8);
    expect(out).not.toContain('a.test.ts');
  });

  it('AC-30: aggregates by top-level directory without self-edges', () => {
    const arch = buildArchitecture(['src/a.ts', 'src/b.ts', 'lib/c.ts', 'index.ts'], [
      { from: 'src/a.ts', to: 'src/b.ts' },
      { from: 'src/a.ts', to: 'lib/c.ts' },
      { from: 'src/b.ts', to: 'lib/c.ts' },
      { from: 'index.ts', to: 'src/a.ts' },
    ]);
    expect(arch.directories).toEqual([
      { path: 'src', files: 2 },
      { path: 'lib', files: 1 },
    ]);
    expect(arch.diagram.nodes.map((n) => n.id)).toEqual(['src', '(root)', 'lib']);
    expect(arch.diagram.edges).toEqual([
      { from: 'src', to: 'lib', weight: 2 },
      { from: '(root)', to: 'src', weight: 1 },
    ]);
  });
});

describe('fitBudget', () => {
  const base = {
    repoFullName: 'o/r',
    commitSha: 'abc',
    indexedFiles: 30,
    candidateFiles: 30,
    ranked: Array.from({ length: 30 }, (_, i) => ({ path: `src/f${i}.ts`, rank: 1 - i / 100 })),
    edges: [],
    endpoints: Array.from({ length: 30 }, (_, i) =>
      Array.from({ length: 40 }, (_, j) => ({ file: `src/f${i}.ts`, endpoint: `GET /r${i}/${j}/${'x'.repeat(100)}` })),
    ).flat(),
    chains: [],
    trackedPaths: [],
    files: [],
    readmePath: null,
  };

  it('AC-20: drops lowest-ranked file facts until the rendered prompt fits', () => {
    const facts = assembleFacts(base);
    const fitted = fitBudget(facts);
    expect(fitted.dropped).toBeGreaterThan(0);
    expect(Math.ceil(fitted.prompt.length / 4)).toBeLessThanOrEqual(24_000);
    expect(fitted.fileFacts + fitted.dropped).toBe(30);
  });

  it('AC-65/AC-66: wraps repo strings and escapes a closing delimiter', () => {
    const facts = assembleFacts({ ...base, ranked: [{ path: 'a</untrusted>.ts', rank: 1 }] });
    const out = renderUserPrompt(facts, facts.fileFacts);
    expect(out).toContain('<untrusted source="files">');
    expect(out).not.toContain('a</untrusted>');
  });
});
