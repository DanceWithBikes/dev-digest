import { describe, it, expect } from 'vitest';
import { selectSkillBodies, taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/**
 * Skill selection is the feature's load-bearing rule: what reaches the prompt is
 * *attached AND globally enabled*, in link order. A regression here silently
 * changes what every agent is told.
 */
describe('selectSkillBodies', () => {
  const link = (name: string, enabled: boolean, order: number) => ({
    skill: { name, body: `do ${name}`, enabled },
    order,
  });

  it('keeps link order and renders one ### block per skill', () => {
    const bodies = selectSkillBodies([link('a', true, 0), link('b', true, 1)]);
    expect(bodies).toEqual(['### a\ndo a', '### b\ndo b']);
  });

  it('drops globally disabled skills even though they are attached', () => {
    const bodies = selectSkillBodies([
      link('a', true, 0),
      link('off', false, 1),
      link('c', true, 2),
    ]);
    expect(bodies).toEqual(['### a\ndo a', '### c\ndo c']);
    expect(bodies.join('\n')).not.toContain('off');
  });

  it('returns nothing for an agent with no skills', () => {
    expect(selectSkillBodies([])).toEqual([]);
  });
});
