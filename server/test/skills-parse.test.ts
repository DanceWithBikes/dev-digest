import { describe, it, expect } from 'vitest';
import { parseSkillMarkdown } from '../src/modules/skills/helpers.js';
import { MAX_SKILL_BODY_CHARS } from '../src/modules/skills/constants.js';

/**
 * The markdown import parser. It is the only thing standing between a file a
 * user picked off disk and a block of text that becomes literal instructions in
 * an agent's prompt — so the interesting cases are the ones where the file
 * doesn't say what we hoped, and the guarantee that nothing in it ever runs.
 */

describe('parseSkillMarkdown', () => {
  it('prefers frontmatter over the heading', () => {
    const draft = parseSkillMarkdown(
      ['---', 'name: from-frontmatter', 'description: Flag X.', 'type: security', '---', '# from-heading', '', 'Body line.'].join('\n'),
    );
    expect(draft.name).toBe('from-frontmatter');
    expect(draft.description).toBe('Flag X.');
    expect(draft.type).toBe('security');
    expect(draft.body).not.toContain('name: from-frontmatter');
    expect(draft.warnings).toEqual([]);
  });

  it('falls back to the first heading, then the filename', () => {
    expect(parseSkillMarkdown('# My Rubric\n\nProse.').name).toBe('My Rubric');

    const fromFile = parseSkillMarkdown('- just a list\n', 'skills/no-over-mocking.md');
    expect(fromFile.name).toBe('no-over-mocking');
    expect(fromFile.warnings).toContain('no-heading');
  });

  it('uses the first prose line as the description, skipping headings and lists', () => {
    const draft = parseSkillMarkdown('# Title\n\n- a bullet\n\nThe real description.\n');
    expect(draft.description).toBe('The real description.');
  });

  it('falls back to custom and warns on an unknown type', () => {
    const draft = parseSkillMarkdown('---\ntype: nonsense\n---\n# T\n\nD.');
    expect(draft.type).toBe('custom');
    expect(draft.warnings).toContain('unknown-type');
  });

  it('truncates an oversized body and says so', () => {
    const draft = parseSkillMarkdown(`# T\n\n${'x'.repeat(MAX_SKILL_BODY_CHARS + 500)}`);
    expect(draft.body.length).toBe(MAX_SKILL_BODY_CHARS);
    expect(draft.warnings).toContain('truncated');
  });

  it('keeps a code block as plain text and never executes it', () => {
    const draft = parseSkillMarkdown('# T\n\nD.\n\n```sh\nrm -rf /\n```\n');
    expect(draft.body).toContain('rm -rf /');
    expect(draft.warnings).toContain('code-blocks-kept-as-text');
    // The fence is content, not a directive: it must not leak into the metadata.
    expect(draft.description).toBe('D.');
    expect(draft.name).toBe('T');
  });

  it('degrades to defaults on an empty file', () => {
    const draft = parseSkillMarkdown('');
    expect(draft.name).toBe('Untitled skill');
    expect(draft.description).toBe('');
    expect(draft.type).toBe('custom');
    expect(draft.warnings).toEqual(['no-heading', 'no-description']);
  });
});
