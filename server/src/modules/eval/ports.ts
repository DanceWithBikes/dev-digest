import type {
  Finding,
  LLMProvider,
  Provider,
  ReviewStrategy,
  UnifiedDiff,
} from '@devdigest/shared';
import type {
  AgentForEval,
  BatchCompletion,
  CaseEdit,
  FindingContext,
  FrozenBatch,
  NewBatch,
  NewCase,
  NewRun,
  OverviewRows,
  StoredBatch,
  StoredCase,
  StoredRun,
} from './domain.js';

/**
 * The capabilities the eval use cases need, as interfaces, so `service.ts` and
 * `runner.ts` are unit-tested with in-memory fakes. `compose.ts` is the only
 * file that knows which implementations satisfy them.
 */

/** Persistence of cases, batches and runs. Every method is workspace-scoped. */
export interface EvalStore {
  findCaseBySourceFinding(workspaceId: string, findingId: string): Promise<StoredCase | undefined>;
  /** `created: false` = a case for that finding already existed (unique violation) and is returned. */
  insertCase(values: NewCase): Promise<{ case: StoredCase; created: boolean }>;
  listCasesWithLastRun(workspaceId: string, agentId: string): Promise<StoredCase[]>;
  getCase(workspaceId: string, id: string): Promise<StoredCase | undefined>;
  updateCase(workspaceId: string, id: string, edit: CaseEdit): Promise<StoredCase | undefined>;
  deleteCase(workspaceId: string, id: string): Promise<boolean>;
  /** Cases by id, in the given order; ids that no longer exist are skipped. */
  getCasesByIds(workspaceId: string, ids: string[]): Promise<StoredCase[]>;
  caseIdsForAgent(workspaceId: string, agentId: string): Promise<string[]>;

  findRunningBatch(workspaceId: string, agentId: string): Promise<StoredBatch | undefined>;
  /** `undefined` = another batch of the agent is already `running` (partial unique index). */
  insertBatch(values: NewBatch): Promise<StoredBatch | undefined>;
  /** Returns false when the case was deleted mid-batch and nothing was stored. */
  insertRun(values: NewRun): Promise<boolean>;
  completeBatch(batchId: string, completion: BatchCompletion): Promise<void>;
  /** Newest first. */
  listBatches(workspaceId: string, agentId: string, limit: number): Promise<StoredBatch[]>;
  getBatchWithRuns(
    workspaceId: string,
    batchId: string,
  ): Promise<{ batch: StoredBatch; runs: StoredRun[] } | undefined>;
  overview(workspaceId: string): Promise<OverviewRows>;
  /** Marks every `running` batch `failed` with `error`; returns how many. */
  reapRunningBatches(error: string): Promise<number>;
}

/** Review data, narrowed to what the one-click case needs. */
export interface FindingSource {
  findingContext(findingId: string): Promise<FindingContext | undefined>;
  getPrFiles(prId: string): Promise<{ path: string; patch: string | null }[]>;
}

/** Agent data, narrowed to what a batch snapshot needs. */
export interface AgentSource {
  getById(workspaceId: string, id: string): Promise<AgentForEval | undefined>;
  linkedSkills(agentId: string): Promise<{ skill: { name: string; body: string; enabled: boolean } }[]>;
}

/** Resolves a provider id to a ready model client; throws when the key is missing (AC-56). */
export interface LlmResolver {
  resolve(provider: Provider): Promise<LLMProvider>;
}

/**
 * The review call. Its input is deliberately the frozen set only: no intent,
 * memory, specs, callers or repo map can be passed through it (AC-49).
 */
export interface ReviewEngineInput {
  systemPrompt: string;
  model: string;
  diff: UnifiedDiff;
  llm: LLMProvider;
  strategy: ReviewStrategy;
  skills?: string[];
  prDescription?: string;
  task: string;
}

export interface ReviewEngineResult {
  kept: Finding[];
  dropped: Finding[];
  mode: 'single-pass' | 'map-reduce';
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

export interface ReviewEngine {
  run(input: ReviewEngineInput): Promise<ReviewEngineResult>;
}

/** Runs a started batch in the background; the service never awaits it. */
export interface BatchExecutor {
  execute(batchId: string, frozen: FrozenBatch): Promise<void>;
}

/** Structured logger; the module logs ids, counts and metrics only (NFR-11). */
export interface EvalLog {
  info(fields: Record<string, unknown>, msg: string): void;
  error(fields: Record<string, unknown>, msg: string): void;
}
