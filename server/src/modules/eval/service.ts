import type {
  EvalBatch,
  EvalBatchDetail,
  EvalCaseFromFindingInput,
  EvalCaseRecord,
  EvalCaseUpsert,
  EvalOverview,
} from '@devdigest/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { DEFAULT_STRATEGY, ERR, MAX_BATCHES_LISTED, REAPED_BATCH_ERROR } from './constants.js';
import {
  buildOverview,
  expectationFromFinding,
  oneClickDiff,
  oneClickName,
  skillBodies,
  snapshotOf,
  toBatchDto,
  toCaseDto,
  toRunDto,
  validateCaseDiff,
} from './helpers.js';
import type { AgentSource, BatchExecutor, EvalLog, EvalStore, FindingSource } from './ports.js';

/**
 * Eval use cases: one-click cases, case CRUD, starting a batch, history and the
 * dashboard overview. Orchestration only — rules are in `helpers.ts`, SQL in the
 * repository, the background run in `runner.ts`.
 */

export interface EvalServiceDeps {
  store: EvalStore;
  findings: FindingSource;
  agents: AgentSource;
  runner: BatchExecutor;
  log: EvalLog;
}

export class EvalService {
  constructor(private deps: EvalServiceDeps) {}

  // ---- one-click case -------------------------------------------------------

  /** `created: false` when the finding already had a case (AC-33); the route maps it to 200/201. */
  async createFromFinding(
    workspaceId: string,
    findingId: string,
    body: EvalCaseFromFindingInput | null | undefined,
  ): Promise<{ created: boolean; case: EvalCaseRecord }> {
    const { store, findings, agents } = this.deps;
    const ctx = await findings.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');

    const expectation = expectationFromFinding(ctx.finding);
    if (!expectation) {
      throw new ConflictError('Accept or dismiss the finding first', undefined, ERR.FINDING_UNDECIDED);
    }

    const existing = await store.findCaseBySourceFinding(workspaceId, findingId);
    if (existing) return { created: false, case: toCaseDto(existing) };

    // The owner is the review's agent (AC-28), else the body's `agent_id` (AC-29). No owner at
    // all is a 409 (AC-30); an owner that no longer resolves (deleted, other workspace) is a 404 (AC-34).
    const ownerId = ctx.review.agentId ?? body?.agent_id;
    if (!ownerId) {
      throw new ConflictError('The finding’s review has no agent; pass agent_id', undefined, ERR.NO_AGENT);
    }
    const agent = await agents.getById(workspaceId, ownerId);
    if (!agent) throw new NotFoundError('Agent not found');

    const files = await findings.getPrFiles(ctx.pull.id);
    const patch = files.find((f) => f.path === ctx.finding.file)?.patch;
    if (!patch) throw new ConflictError('The PR has no stored patch for the finding’s file', undefined, ERR.NO_PATCH);

    const { case: stored, created } = await store.insertCase({
      workspaceId,
      ownerId: agent.id,
      name: oneClickName(expectation.kind, ctx.finding.title),
      inputDiff: oneClickDiff(ctx.finding.file, patch),
      inputMeta: { title: ctx.pull.title, body: ctx.pull.body },
      expectedOutput: { expectations: [expectation] },
      notes: null,
      createdFrom: 'finding',
      sourceFindingId: findingId,
    });
    return { created, case: toCaseDto(stored) };
  }

  // ---- case CRUD ------------------------------------------------------------

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    await this.requireAgent(workspaceId, agentId);
    const cases = await this.deps.store.listCasesWithLastRun(workspaceId, agentId);
    return cases.map(toCaseDto);
  }

  async createCase(workspaceId: string, agentId: string, body: EvalCaseUpsert): Promise<EvalCaseRecord> {
    await this.requireAgent(workspaceId, agentId);
    this.assertDiffValid(body);
    const { case: stored } = await this.deps.store.insertCase({
      workspaceId,
      ownerId: agentId,
      name: body.name,
      inputDiff: body.input_diff,
      inputMeta: body.input_meta ?? null,
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
      createdFrom: 'manual',
      sourceFindingId: null,
    });
    return toCaseDto(stored);
  }

  async updateCase(workspaceId: string, id: string, body: EvalCaseUpsert): Promise<EvalCaseRecord> {
    const existing = await this.deps.store.getCase(workspaceId, id);
    if (!existing) throw new NotFoundError('Eval case not found');
    this.assertDiffValid(body);
    const updated = await this.deps.store.updateCase(workspaceId, id, {
      name: body.name,
      inputDiff: body.input_diff,
      inputMeta: body.input_meta ?? null,
      expectedOutput: body.expected_output,
      notes: body.notes ?? null,
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return toCaseDto(updated);
  }

  async deleteCase(workspaceId: string, id: string): Promise<void> {
    const deleted = await this.deps.store.deleteCase(workspaceId, id);
    if (!deleted) throw new NotFoundError('Eval case not found');
  }

  // ---- batches --------------------------------------------------------------

  /** Snapshots the agent, stores the `running` batch and returns before any case runs (AC-43). */
  async startBatch(workspaceId: string, agentId: string): Promise<EvalBatch> {
    const { store, agents, runner, log } = this.deps;
    const agent = await this.requireAgent(workspaceId, agentId);

    const caseIds = await store.caseIdsForAgent(workspaceId, agentId);
    if (caseIds.length === 0) {
      throw new ConflictError('The agent has no eval cases to run', undefined, ERR.NO_EVAL_CASES);
    }
    const running = () => new ConflictError('A batch is already running for this agent', undefined, ERR.BATCH_RUNNING);
    if (await store.findRunningBatch(workspaceId, agentId)) throw running();

    // Skill bodies are resolved once and held in memory; only names are stored.
    const links = await agents.linkedSkills(agent.id);
    const snapshot = snapshotOf(agent, links);
    // The partial unique index closes the race the check above leaves open.
    const batch = await store.insertBatch({ workspaceId, agentId, snapshot, casesTotal: caseIds.length });
    if (!batch) throw running();

    // Fire-and-forget (not `container.jobs`: it would re-run a failed handler).
    void runner
      .execute(batch.id, {
        workspaceId,
        agentId,
        snapshot,
        skillBodies: skillBodies(links),
        strategy: agent.strategy ?? DEFAULT_STRATEGY,
        caseIds,
      })
      .catch((err) => {
        log.error(
          { batch_id: batch.id, agent_id: agentId, err: err instanceof Error ? err.message : String(err) },
          'eval: batch execution crashed',
        );
      });

    return toBatchDto(batch);
  }

  async listBatches(workspaceId: string, agentId: string): Promise<EvalBatch[]> {
    await this.requireAgent(workspaceId, agentId);
    const batches = await this.deps.store.listBatches(workspaceId, agentId, MAX_BATCHES_LISTED);
    return batches.map(toBatchDto);
  }

  async getBatch(workspaceId: string, batchId: string): Promise<EvalBatchDetail> {
    const found = await this.deps.store.getBatchWithRuns(workspaceId, batchId);
    if (!found) throw new NotFoundError('Eval batch not found');
    return { batch: toBatchDto(found.batch), runs: found.runs.map(toRunDto) };
  }

  async overview(workspaceId: string): Promise<EvalOverview> {
    return buildOverview(await this.deps.store.overview(workspaceId));
  }

  /** Boot reaper (AC-58): a batch still `running` at boot belongs to a dead process. */
  async reapOrphans(): Promise<number> {
    return this.deps.store.reapRunningBatches(REAPED_BATCH_ERROR);
  }

  // ---- internals ------------------------------------------------------------

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private assertDiffValid(body: EvalCaseUpsert): void {
    const problem = validateCaseDiff(body.input_diff, body.expected_output.expectations);
    if (problem) throw new ValidationError(problem);
  }
}
