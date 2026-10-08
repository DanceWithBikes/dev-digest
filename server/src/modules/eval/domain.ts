import type {
  EvalCaseMeta,
  EvalCaseActual,
  EvalExpectedOutput,
  EvalBatchStatus,
  EvalCaseSource,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import type { CaseScore } from '@devdigest/reviewer-core';

/**
 * Domain types of the eval module. Plain TS: the repository maps its Drizzle
 * rows to these, and nothing outside the repository ever sees a row type.
 */

export interface StoredCase {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta | null;
  expectedOutput: EvalExpectedOutput;
  notes: string | null;
  createdAt: Date;
  createdFrom: EvalCaseSource;
  sourceFindingId: string | null;
  /** Newest run of the case; null when it never ran. Filled by list queries only. */
  lastRun: { pass: boolean | null; batchId: string | null } | null;
}

/** What a create (manual or one-click) writes. */
export interface NewCase {
  workspaceId: string;
  ownerId: string;
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta | null;
  expectedOutput: EvalExpectedOutput;
  notes: string | null;
  createdFrom: EvalCaseSource;
  sourceFindingId: string | null;
}

/** What a replace (PUT) writes. */
export interface CaseEdit {
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta | null;
  expectedOutput: EvalExpectedOutput;
  notes: string | null;
}

/** What a batch ran with, frozen when the request arrived (names of skills, not bodies). */
export interface AgentSnapshot {
  agentVersion: number;
  systemPrompt: string;
  provider: Provider;
  model: string;
  skills: string[];
}

/** Everything the runner needs, held in memory for the batch (AC-48 / AC-50). */
export interface FrozenBatch {
  workspaceId: string;
  agentId: string;
  snapshot: AgentSnapshot;
  /** Rendered `### name\nbody` blocks, enabled skills only. */
  skillBodies: string[];
  strategy: ReviewStrategy;
  /** Cases owned by the agent when the batch started (AC-47). */
  caseIds: string[];
}

export interface NewBatch {
  workspaceId: string;
  agentId: string;
  snapshot: AgentSnapshot;
  casesTotal: number;
}

export interface StoredBatch {
  id: string;
  workspaceId: string;
  agentId: string;
  snapshot: AgentSnapshot;
  status: EvalBatchStatus;
  error: string | null;
  ranAt: Date;
  finishedAt: Date | null;
  casesTotal: number;
  casesPassed: number;
  mustFindTotal: number;
  mustFindMatched: number;
  keptTotal: number;
  noiseTotal: number;
  droppedTotal: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/** Final state written by the runner when a batch ends. */
export interface BatchCompletion {
  status: 'done' | 'failed';
  error: string | null;
  casesTotal: number;
  casesPassed: number;
  mustFindTotal: number;
  mustFindMatched: number;
  keptTotal: number;
  noiseTotal: number;
  droppedTotal: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

export interface NewRun {
  caseId: string;
  batchId: string;
  actualOutput: EvalCaseActual | null;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number;
  costUsd: number | null;
  error: string | null;
}

export interface StoredRun {
  id: string;
  caseId: string;
  caseName: string | null;
  batchId: string;
  ranAt: Date;
  expectedOutput: EvalExpectedOutput;
  actualOutput: EvalCaseActual | null;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  durationMs: number | null;
  costUsd: number | null;
  error: string | null;
}

/** Raw overview rows; `buildOverview` (helpers) assembles the DTO. */
export interface OverviewRows {
  agents: { agentId: string; name: string; model: string; casesTotal: number }[];
  /** Newest batch (any status) per agent. */
  latestBatches: StoredBatch[];
  /** Up to `TREND_LIMIT` newest `done` batches per agent, any order. */
  doneBatches: StoredBatch[];
  /** Newest batches across the workspace, newest first. */
  recent: StoredBatch[];
}

/** One scored (or errored) case, as the runner hands it to `finaliseBatch`. */
export interface CaseResult {
  /** null = the engine failed on this case. */
  score: CaseScore | null;
  error: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

/** A decided-or-not finding with its review and PR, as the one-click use case reads it. */
export interface FindingContext {
  finding: {
    id: string;
    file: string;
    startLine: number;
    endLine: number;
    title: string;
    severity: string;
    category: string;
    acceptedAt: Date | null;
    dismissedAt: Date | null;
  };
  review: { agentId: string | null };
  pull: { id: string; workspaceId: string; title: string; body: string | null };
}

/** Agent data a batch snapshot needs. */
export interface AgentForEval {
  id: string;
  name: string;
  version: number;
  systemPrompt: string;
  provider: Provider;
  model: string;
  strategy: ReviewStrategy | null;
}
