import { describe, it, expect } from 'vitest';
import type { SkillEvalResult } from '@devdigest/shared';
import { SkillEvalsService } from '../src/modules/skills/evals-service.js';
import type { SkillEvalStore } from '../src/modules/skills/ports.js';
import type { SkillEvalRecord } from '../src/modules/skills/eval-records.js';
import { NotFoundError } from '../src/platform/errors.js';

const rec = (over: Partial<SkillEvalResult>): SkillEvalResult => ({
  id: 'i', run_id: 'r1', config: 'candidate', case_name: 'c', outcome: true, score: 1,
  threshold: 0.7, grounded: null, practices: [], git_sha: null, dirty: null, duration_ms: null,
  input_tokens: null, output_tokens: null, num_turns: null, ran_at: '2026-10-08T10:00:00.000Z',
  ...over,
});

function build(opts: { text: string | null; latest?: SkillEvalResult[] }) {
  const upserts: SkillEvalRecord[][] = [];
  const store: SkillEvalStore = {
    upsertMany: async (_w, _s, records) => (upserts.push(records), records.length),
    latestPerCase: async () => opts.latest ?? [],
    runs: async () => [],
  };
  const service = new SkillEvalsService({
    skills: { getById: async (_w, id) => (id === 'sk' ? { id: 'sk', name: 'my-skill' } : undefined) },
    store,
    source: { read: async () => opts.text },
  });
  return { service, upserts };
}

const L = (skill: string, case_: string) =>
  JSON.stringify({ run_id: '20261008T102101', config: 'candidate', nodeid: `/a > skill:${skill} > ${case_}`, outcome: true });

describe('SkillEvalsService', () => {
  it('imports only this skill\'s records', async () => {
    const { service, upserts } = build({ text: [L('my-skill', 'a'), L('other', 'b'), 'junk'].join('\n') });
    expect(await service.sync('w', 'sk')).toEqual({ imported: 1, skipped: 1 });
    expect(upserts[0]).toHaveLength(1);
  });

  it('treats a missing records file as nothing to import', async () => {
    const { service } = build({ text: null });
    expect(await service.sync('w', 'sk')).toEqual({ imported: 0, skipped: 0 });
  });

  it('404s for an unknown skill', async () => {
    const { service } = build({ text: null });
    await expect(service.sync('w', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.get('w', 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('summarises the latest results', async () => {
    const { service } = build({
      text: null,
      latest: [
        rec({ case_name: 'a' }),
        rec({ case_name: 'b', outcome: false, run_id: 'r2', ran_at: '2026-10-09T10:00:00.000Z' }),
      ],
    });
    const res = await service.get('w', 'sk');
    expect(res.summary).toEqual({
      total: 2, passing: 1, latest_run_id: 'r2', latest_ran_at: '2026-10-09T10:00:00.000Z',
    });
  });
});
