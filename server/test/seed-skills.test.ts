import { describe, it, expect } from 'vitest';
import { parseSkillMarkdown } from '../src/modules/skills/helpers.js';
import {
  buildSeedSkills,
  readSkillSample,
  NO_OVER_MOCKING_SAMPLE,
  RETIRED_SKILL_NAMES,
} from '../src/db/seed-skills.js';

/**
 * The seeded skill catalogue. Nothing here needs a database: the point is the
 * *content* contract of a built-in skill, which is what the agent actually
 * reads — a description it can route on, and a body with a worked example.
 *
 * These assertions exist because both failures are invisible at run time: an
 * empty description just makes the skill unselectable in the editor, and a
 * rubric with no ❌/✅ pair still produces a plausible-looking review — one that
 * flags additive changes as breaking.
 */

const skills = buildSeedSkills();
const byName = new Map(skills.map((s) => [s.name, s]));

const API_CONTRACT_SKILLS = [
  'breaking-change',
  'response-schema',
  'semver-discipline',
  'deprecation-policy',
];

describe('built-in skill catalogue', () => {
  it('seeds the four API-contract skills and retires the omnibus rubric they replaced', () => {
    for (const name of API_CONTRACT_SKILLS) expect(byName.has(name)).toBe(true);
    // The split is only complete if the old skill is removed from existing DBs.
    expect(RETIRED_SKILL_NAMES).toContain('api-contract-rules');
    expect(byName.has('api-contract-rules')).toBe(false);
  });

  it('attaches all four to the API Contract Reviewer at distinct positions', () => {
    const orders = API_CONTRACT_SKILLS.map((name) => {
      const links = byName.get(name)!.attachTo;
      expect(links.map((l) => l.agent)).toEqual(['API Contract Reviewer']);
      return links[0]!.order;
    });

    expect(new Set(orders).size).toBe(orders.length);
  });

  it.each(API_CONTRACT_SKILLS)('%s has a directive one-line description', (name) => {
    const { description } = byName.get(name)!;

    expect(description.trim()).not.toBe('');
    // One line: the description is the interface an agent reads to decide
    // whether the skill applies, not a second body.
    expect(description).not.toContain('\n');
  });

  it.each(API_CONTRACT_SKILLS)('%s shows both a bad and a good example', (name) => {
    const { body } = byName.get(name)!;

    expect(body, 'missing ❌ Bad example').toContain('### ❌ Bad');
    expect(body, 'missing ✅ Good example').toContain('### ✅ Good');
    // An example is a snippet, not a sentence: the pair must carry real code.
    expect(body.match(/```/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it.each(API_CONTRACT_SKILLS)('%s is typed for the rules it carries', (name) => {
    expect(['convention', 'security']).toContain(byName.get(name)!.type);
  });
});

describe('imported sample skill', () => {
  it('parses the markdown file on disk into a named, described skill', () => {
    const draft = parseSkillMarkdown(
      readSkillSample(NO_OVER_MOCKING_SAMPLE),
      NO_OVER_MOCKING_SAMPLE,
    );

    expect(draft.name).toBe('no-over-mocking');
    expect(draft.description.trim()).not.toBe('');
    expect(draft.body.trim()).not.toBe('');
    // The frontmatter must not survive into the body that goes into a prompt.
    expect(draft.body).not.toContain('description:');
  });

  it('is seeded with provenance imported_file, from the file rather than a constant', () => {
    const imported = skills.filter((s) => s.source === 'imported_file');

    expect(imported).toHaveLength(1);
    expect(imported[0]!.name).toBe('no-over-mocking');
    expect(imported[0]!.body).toBe(
      parseSkillMarkdown(readSkillSample(NO_OVER_MOCKING_SAMPLE), NO_OVER_MOCKING_SAMPLE).body,
    );
    expect(imported[0]!.attachTo).toEqual([{ agent: 'Test Quality Reviewer', order: 3 }]);
  });
});
