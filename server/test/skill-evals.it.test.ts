/**
 * `SkillEvalsRepository` over real Postgres: idempotent upsert, newest-candidate-
 * per-case and the per-run aggregate.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { SkillEvalsRepository } from '../src/modules/skills/repository/evals.repo.js';
import type { SkillEvalRecord } from '../src/modules/skills/eval-records.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const rec = (over: Partial<SkillEvalRecord>): SkillEvalRecord => ({
  skillName: 's', runId: '20261008T100000', ranAt: new Date('2026-10-08T10:00:00Z'),
  config: 'candidate', caseName: 'a', outcome: true, score: 1, threshold: 0.7, grounded: null,
  practices: [{ practice: 'p', passed: true, evidence: 'quote' }], gitSha: 'abc', dirty: false,
  durationMs: 1, inputTokens: 2, outputTokens: 3, numTurns: 4, ...over,
});

d('SkillEvalsRepository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: SkillEvalsRepository;
  let workspaceId: string;
  let skillId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [sk] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name: 'evals-it', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    skillId = sk!.id;
    repo = new SkillEvalsRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('upserts idempotently and reads back the newest candidate per case', async () => {
    const records = [
      rec({}),
      rec({ runId: '20261009T100000', ranAt: new Date('2026-10-09T10:00:00Z'), outcome: false, score: 0 }),
      rec({ caseName: 'b' }),
      rec({ config: 'baseline', outcome: false }),
    ];
    await repo.upsertMany(workspaceId, skillId, records);
    await repo.upsertMany(workspaceId, skillId, records); // re-sync: no duplicates

    const latest = await repo.latestPerCase(workspaceId, skillId);
    expect(latest.map((r) => r.case_name).sort()).toEqual(['a', 'b']);
    const a = latest.find((r) => r.case_name === 'a')!;
    expect(a).toMatchObject({ run_id: '20261009T100000', outcome: false });
    expect(a.practices[0]!.evidence).toBe('quote');

    const runs = await repo.runs(workspaceId, skillId, 20);
    expect(runs).toHaveLength(3); // 2 candidate runs + 1 baseline
    expect(runs[0]).toMatchObject({ run_id: '20261009T100000', passed: 0, total: 1 });
  });

  it('scopes by workspace', async () => {
    const other = '00000000-0000-0000-0000-000000000000';
    expect(await repo.latestPerCase(other, skillId)).toEqual([]);
  });
});
