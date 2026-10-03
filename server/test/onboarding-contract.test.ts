/**
 * SPEC-02 contract (AC-1..AC-6): the `@devdigest/shared` onboarding-tour shape.
 * Written from the acceptance criteria. Pins the invariant that a stored tour
 * is exactly five sections in a fixed order, each with an origin, with the
 * diagram bounded at 12 nodes / 20 edges.
 */
import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_SECTION_IDS,
  ONBOARDING_STATUSES,
  OnboardingTour,
  OnboardingTourResponse,
} from '@devdigest/shared';

const section = {
  arch: (over: object = {}) => ({
    id: 'architecture',
    origin: 'model',
    prose: 'p',
    directories: [{ path: 'src', files: 3 }],
    diagram: { nodes: [{ id: 'src', label: 'src' }], edges: [{ from: 'src', to: 'src', weight: 1 }] },
    ...over,
  }),
  critical: { id: 'critical-paths', origin: 'skeleton', entries: [{ path: 'a.ts', reason: '' }] },
  run: { id: 'run-locally', origin: 'model', steps: [{ command: 'npm run dev', source_path: 'package.json', risky: false }] },
  reading: { id: 'reading-path', origin: 'model', entries: [{ path: 'a.ts', reason: 'why' }] },
  tasks: { id: 'first-tasks', origin: 'model', tasks: [{ title: 't', description: 'd', paths: ['a.ts'] }] },
};

const tour = (over: object = {}) => ({
  repo_full_name: 'o/r',
  commit_sha: 'abc',
  generated_at: '2026-10-03T00:00:00.000Z',
  status: 'ready',
  indexed_files: 3,
  candidate_files: 3,
  dropped_file_facts: 0,
  provider: 'openrouter',
  model: 'm',
  model_call_made: true,
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: null,
  sections: [section.arch(), section.critical, section.run, section.reading, section.tasks],
  ...over,
});

describe('onboarding contract (SPEC-02)', () => {
  it('AC-1: a stored tour carries sha, time, status, counts, dropped facts, provider/model, tokens and a nullable cost', () => {
    const parsed = OnboardingTour.parse(tour());
    expect(parsed).toMatchObject({
      repo_full_name: 'o/r',
      commit_sha: 'abc',
      indexed_files: 3,
      candidate_files: 3,
      dropped_file_facts: 0,
      provider: 'openrouter',
      model: 'm',
      tokens_in: 1,
      tokens_out: 1,
      cost_usd: null,
    });
    expect(OnboardingTour.safeParse(tour({ cost_usd: 0.25 })).success).toBe(true);
    for (const key of ['commit_sha', 'indexed_files', 'candidate_files', 'dropped_file_facts', 'tokens_in', 'cost_usd']) {
      const { [key]: _omitted, ...rest } = tour() as Record<string, unknown>;
      expect(OnboardingTour.safeParse(rest).success, `missing ${key}`).toBe(false);
    }
  });

  it('AC-2: the section ids are exactly the five anchors in tour order', () => {
    expect([...ONBOARDING_SECTION_IDS]).toEqual([
      'architecture',
      'critical-paths',
      'run-locally',
      'reading-path',
      'first-tasks',
    ]);
  });

  it('AC-2: a tour with sections in another order, or with four or six sections, is rejected', () => {
    const s = tour().sections;
    expect(OnboardingTour.safeParse(tour({ sections: [s[1], s[0], s[2], s[3], s[4]] })).success).toBe(false);
    expect(OnboardingTour.safeParse(tour({ sections: s.slice(0, 4) })).success).toBe(false);
    expect(OnboardingTour.safeParse(tour({ sections: [...s, s[4]] })).success).toBe(false);
  });

  it('AC-3: architecture holds prose, directories and a diagram of at most 12 nodes and 20 edges', () => {
    const nodes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, label: `n${i}` }));
    const edges = (n: number) => Array.from({ length: n }, (_, i) => ({ from: 'a', to: 'b', weight: i }));
    const withDiagram = (n: number, e: number) =>
      tour({ sections: [section.arch({ diagram: { nodes: nodes(n), edges: edges(e) } }), section.critical, section.run, section.reading, section.tasks] });
    expect(OnboardingTour.safeParse(withDiagram(12, 20)).success).toBe(true);
    expect(OnboardingTour.safeParse(withDiagram(13, 20)).success).toBe(false);
    expect(OnboardingTour.safeParse(withDiagram(12, 21)).success).toBe(false);
    const noDirs = section.arch() as Record<string, unknown>;
    delete noDirs.directories;
    expect(OnboardingTour.safeParse(tour({ sections: [noDirs, section.critical, section.run, section.reading, section.tasks] })).success).toBe(false);
  });

  it('AC-3: a run step needs command, source_path and risky; a first task needs at least one cited path', () => {
    const badRun = { ...section.run, steps: [{ command: 'x', source_path: 'p' }] };
    expect(OnboardingTour.safeParse(tour({ sections: [section.arch(), section.critical, badRun, section.reading, section.tasks] })).success).toBe(false);
    const noPaths = { ...section.tasks, tasks: [{ title: 't', description: 'd', paths: [] }] };
    expect(OnboardingTour.safeParse(tour({ sections: [section.arch(), section.critical, section.run, section.reading, noPaths] })).success).toBe(false);
  });

  it('AC-4: every section must carry an origin of model or skeleton', () => {
    expect(OnboardingTour.safeParse(tour({ sections: [section.arch({ origin: 'human' }), section.critical, section.run, section.reading, section.tasks] })).success).toBe(false);
    const { origin: _o, ...noOrigin } = section.critical;
    expect(OnboardingTour.safeParse(tour({ sections: [section.arch(), noOrigin, section.run, section.reading, section.tasks] })).success).toBe(false);
  });

  it('AC-5: the status set is exactly the eight statuses', () => {
    expect([...ONBOARDING_STATUSES].sort()).toEqual(
      ['index_failed', 'index_partial', 'llm_failed', 'llm_not_configured', 'no_data', 'ready', 'timed_out', 'unsupported_language'].sort(),
    );
    expect(OnboardingTour.safeParse(tour({ status: 'weird' })).success).toBe(false);
  });

  it('AC-6: the GET response carries tour-or-null, stale, generating and last_failed-or-null', () => {
    const empty = { tour: null, stale: false, generating: false, last_failed: null };
    expect(OnboardingTourResponse.safeParse(empty).success).toBe(true);
    expect(
      OnboardingTourResponse.safeParse({ ...empty, tour: tour(), last_failed: { status: 'llm_failed', at: '2026-10-03T00:00:00.000Z' } }).success,
    ).toBe(true);
    for (const key of ['tour', 'stale', 'generating', 'last_failed']) {
      const { [key]: _o, ...rest } = empty as Record<string, unknown>;
      expect(OnboardingTourResponse.safeParse(rest).success, `missing ${key}`).toBe(false);
    }
  });
});
