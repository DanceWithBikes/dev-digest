import { describe, it, expect } from 'vitest';
import type { ConventionCandidate, ConventionDraft } from '@devdigest/shared';
import {
  assembleSkillBody,
  dropKnownRules,
  groundDrafts,
  ruleKey,
  toCandidateDto,
} from '../src/modules/conventions/helpers.js';
import { MIN_CONFIDENCE } from '../src/modules/conventions/constants.js';

/** A draft with sane defaults; override only what the case is about. */
function draft(over: Partial<ConventionDraft> = {}): ConventionDraft {
  return {
    category: 'naming',
    rule: 'Hooks are named useX and live in lib/hooks.',
    evidence_path: 'src/lib/hooks/skills.ts',
    evidence_line: 8,
    evidence_snippet: 'export function useSkills() {',
    confidence: 0.9,
    ...over,
  };
}

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    ...draft(),
    id: 'c1',
    repo_id: 'r1',
    status: 'accepted',
    created_at: '2026-09-21T00:00:00.000Z',
    ...over,
  };
}

describe('groundDrafts', () => {
  const sampled = ['a.ts', 'b.ts'];

  it('drops a draft citing a file the scan never sent', () => {
    const kept = groundDrafts(
      [draft({ evidence_path: 'a.ts' }), draft({ evidence_path: 'never-sampled.ts' })],
      sampled,
    );
    expect(kept.map((d) => d.evidence_path)).toEqual(['a.ts']);
  });

  it('drops drafts the model itself is unsure about', () => {
    const kept = groundDrafts(
      [
        draft({ evidence_path: 'a.ts', confidence: MIN_CONFIDENCE }),
        draft({ evidence_path: 'b.ts', confidence: MIN_CONFIDENCE - 0.01 }),
      ],
      sampled,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.evidence_path).toBe('a.ts');
  });

  it('ranks by confidence so the strongest evidence is triaged first', () => {
    const kept = groundDrafts(
      [
        draft({ evidence_path: 'a.ts', confidence: 0.6, rule: 'weak' }),
        draft({ evidence_path: 'b.ts', confidence: 0.95, rule: 'strong' }),
      ],
      sampled,
    );
    expect(kept.map((d) => d.rule)).toEqual(['strong', 'weak']);
  });

  it('drops a blank rule even when it is grounded and confident', () => {
    expect(groundDrafts([draft({ evidence_path: 'a.ts', rule: '   ' })], sampled)).toEqual([]);
  });
});

describe('ruleKey', () => {
  it('ignores case, punctuation and whitespace so a rephrasing still matches', () => {
    expect(ruleKey('Hooks are named  useX.')).toBe(ruleKey('hooks are named usex'));
  });
});

describe('dropKnownRules', () => {
  it('keeps a rejected rule from coming back on the next scan', () => {
    const kept = dropKnownRules(
      [draft({ rule: 'Errors are thrown as classes.' })],
      ['errors are thrown as classes'],
    );
    expect(kept).toEqual([]);
  });

  it('de-duplicates within a single scan', () => {
    const kept = dropKnownRules([draft({ rule: 'Same rule' }), draft({ rule: 'same rule!' })], []);
    expect(kept).toHaveLength(1);
  });

  it('keeps a genuinely new rule', () => {
    const kept = dropKnownRules([draft({ rule: 'Something new' })], ['an old rule']);
    expect(kept).toHaveLength(1);
  });
});

describe('assembleSkillBody', () => {
  it('cites file and line for every rule, grouped by category', () => {
    const body = assembleSkillBody([
      candidate({ id: '1', category: 'naming', rule: 'Rule A', evidence_path: 'a.ts', evidence_line: 3 }),
      candidate({ id: '2', category: 'testing', rule: 'Rule B', evidence_path: 'b.test.ts', evidence_line: 42 }),
    ]);
    expect(body).toContain('## Naming');
    expect(body).toContain('## Testing');
    expect(body).toContain('`a.ts:3`');
    expect(body).toContain('`b.test.ts:42`');
  });

  it('omits a heading for a category with no accepted rules', () => {
    const body = assembleSkillBody([candidate({ category: 'naming' })]);
    expect(body).not.toContain('## Testing');
  });
});

describe('toCandidateDto', () => {
  it('maps a row with null evidence into a usable DTO', () => {
    const dto = toCandidateDto({
      id: 'x',
      repoId: 'r',
      category: 'other',
      rule: 'A rule',
      evidencePath: null,
      evidenceLine: null,
      evidenceSnippet: null,
      confidence: null,
      status: 'pending',
      createdAt: new Date('2026-09-21T00:00:00.000Z'),
    });
    expect(dto).toMatchObject({ evidence_path: '', evidence_line: 1, confidence: 0 });
  });
});
