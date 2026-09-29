/**
 * The queued → running lifecycle of `agent_runs` over real Postgres. A review
 * runs its agents one at a time, so every run is created `queued` and only the
 * one the executor is working on is `running`; both count as in flight.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('agent_runs queue lifecycle (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prId: string;
  let repo: ReviewRepository;

  const newRun = () => repo.createAgentRun({ workspaceId, agentId: null, prId, provider: null, model: null });
  const statusOf = async (runId: string) => {
    const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    return row?.status;
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [pr] = await pg.handle.db.select().from(t.pullRequests);
    prId = pr!.id;
    repo = new ReviewRepository(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('creates runs queued, starts them once, and lists both states as active', async () => {
    const first = await newRun();
    const second = await newRun();
    expect(await statusOf(first)).toBe('queued');

    await expect(repo.startAgentRun(workspaceId, first)).resolves.toBe(true);
    await expect(repo.startAgentRun(workspaceId, first)).resolves.toBe(false); // already running
    expect(await statusOf(first)).toBe('running');

    const active = await repo.activeRunsForPull(workspaceId, prId);
    expect(active.find((r) => r.run_id === first)?.status).toBe('running');
    expect(active.find((r) => r.run_id === second)?.status).toBe('queued');
  });

  it('a run is only started within its own workspace', async () => {
    const runId = await newRun();
    const otherWorkspace = '00000000-0000-4000-8000-000000000000';
    await expect(repo.startAgentRun(otherWorkspace, runId)).resolves.toBe(false);
    expect(await statusOf(runId)).toBe('queued');
  });

  it('a run cancelled while queued can no longer be started', async () => {
    const runId = await newRun();
    await expect(repo.cancelRunIfRunning(runId)).resolves.toBe(true);
    expect(await statusOf(runId)).toBe('cancelled');
    await expect(repo.startAgentRun(workspaceId, runId)).resolves.toBe(false);
  });

  it('reaps queued runs on boot as well as running ones', async () => {
    const queued = await newRun();
    const running = await newRun();
    await repo.startAgentRun(workspaceId, running);

    await repo.reapStaleRunningRuns();
    expect(await statusOf(queued)).toBe('failed');
    expect(await statusOf(running)).toBe('failed');
  });
});
