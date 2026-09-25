/**
 * Smart Diff's pure layer (`modules/pulls/helpers.ts`): the role classifier
 * (Rule 1) and the file/finding grouping (Rule 2), unit-tested independent of
 * the route and the repository.
 */
import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import { buildSmartDiff, classifyFile } from '../src/modules/pulls/helpers.js';
import { SMART_DIFF_LARGE_LINES } from '../src/modules/pulls/constants.js';
import type { StoredFile } from '../src/modules/pulls/domain.js';

describe('classifyFile', () => {
  it.each([
    // Ordering-sensitive cases (Rule 1: boilerplate → tests → wiring → docs → core).
    ['src/app/__tests__/__snapshots__/x.snap', 'boilerplate'],
    ['.claude/skills/security/SKILL.md', 'wiring'],
    ['e2e/README.md', 'tests'],
    // Segment-vs-substring guard: "test" as a substring of a folder name must
    // NOT classify as `tests` — this one lands `wiring` via its `.claude` segment.
    ['.claude/skills/react-testing-library/SKILL.md', 'wiring'],
    // Everyday cases.
    ['pnpm-lock.yaml', 'boilerplate'],
    ['package-lock.json', 'boilerplate'],
    ['src/modules/pulls/helpers.test.ts', 'tests'],
    ['src/modules/pulls/helpers.ts', 'core'],
    ['docs/specs/smart-diff.md', 'docs'],
    ['README.md', 'docs'],
    ['src/api/public/index.ts', 'wiring'],
    ['package.json', 'wiring'],
    ['src/modules/pulls/service.ts', 'core'],
    // `*.config.*`, `tsconfig*.json`, `.eslintrc*`, `.env*`, `docker-compose*.yml`.
    ['vitest.config.ts', 'wiring'],
    ['next.config.mjs', 'wiring'],
    ['.eslintrc.json', 'wiring'],
    ['.env', 'wiring'],
    ['.env.local', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['docker-compose.e2e.yml', 'wiring'],
    // `*.config.*` requires a segment BEFORE `.config.` — `config.ts` alone
    // (no prefix) must stay `core`, not fall into the wiring pattern.
    ['src/config.ts', 'core'],
  ] as const)('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

describe('buildSmartDiff', () => {
  const file = (o: Partial<StoredFile> & { path: string }): StoredFile => ({
    additions: 10,
    deletions: 0,
    patch: null,
    ...o,
  });

  it('buckets by role, in ROLE_ORDER, omitting empty groups', () => {
    const result = buildSmartDiff(
      [file({ path: 'README.md' }), file({ path: 'src/config.ts' }), file({ path: 'src/config.test.ts' })],
      [],
    );
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
    expect(SmartDiff.parse(result)).toBeTruthy();
  });

  it('preserves input order within a group', () => {
    const result = buildSmartDiff(
      [file({ path: 'src/b.ts' }), file({ path: 'src/a.ts' })],
      [],
    );
    expect(result.groups[0]!.files.map((f) => f.path)).toEqual(['src/b.ts', 'src/a.ts']);
  });

  it('attaches sorted, deduped finding lines per path, from all runs', () => {
    const result = buildSmartDiff(
      [file({ path: 'src/config.ts' })],
      [
        { file: 'src/config.ts', startLine: 52 },
        { file: 'src/config.ts', startLine: 12 },
        { file: 'src/config.ts', startLine: 12 },
      ],
    );
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([12, 52]);
  });

  it('drops anchors naming a path absent from the diff', () => {
    const result = buildSmartDiff(
      [file({ path: 'src/config.ts' })],
      [{ file: 'src/other.ts', startLine: 1 }],
    );
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([]);
  });

  it('total_lines sums additions + deletions across all files; too_big is false at the threshold', () => {
    const result = buildSmartDiff(
      [file({ path: 'a.ts', additions: 100, deletions: 185 })],
      [],
    );
    expect(result.split_suggestion.total_lines).toBe(285);
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('too_big is false exactly at the SMART_DIFF_LARGE_LINES threshold (it is a strict >)', () => {
    const result = buildSmartDiff(
      [file({ path: 'a.ts', additions: SMART_DIFF_LARGE_LINES, deletions: 0 })],
      [],
    );
    expect(result.split_suggestion.total_lines).toBe(SMART_DIFF_LARGE_LINES);
    expect(result.split_suggestion.too_big).toBe(false);
  });

  it('flags too_big above SMART_DIFF_LARGE_LINES and proposes one split per non-empty group', () => {
    const result = buildSmartDiff(
      [
        file({ path: 'src/config.ts', additions: SMART_DIFF_LARGE_LINES + 1, deletions: 0 }),
        file({ path: 'README.md', additions: 3, deletions: 0 }),
      ],
      [],
    );
    expect(result.split_suggestion.too_big).toBe(true);
    expect(result.split_suggestion.proposed_splits).toEqual([
      { name: 'core', files: ['src/config.ts'] },
      { name: 'docs', files: ['README.md'] },
    ]);
  });

  it('sets pseudocode_summary to null (step 8 fills it later)', () => {
    const result = buildSmartDiff([file({ path: 'src/config.ts' })], []);
    expect(result.groups[0]!.files[0]!.pseudocode_summary).toBeNull();
  });
});
