import type {
  CompletionRequest,
  EvalAgentSummary,
  EvalBatch,
  EvalBatchRun,
  EvalCaseRecord,
  EvalExpectation,
  EvalOverview,
  LLMProvider,
  StructuredRequest,
} from '@devdigest/shared';
import { fileDiff, parseUnifiedDiff, scoreBatch } from '@devdigest/reviewer-core';
import { NO_CASES_LEFT_ERROR, RECENT_BATCHES_LIMIT, TREND_LIMIT } from './constants.js';
import type {
  AgentForEval,
  AgentSnapshot,
  BatchCompletion,
  CaseResult,
  FindingContext,
  OverviewRows,
  StoredBatch,
  StoredCase,
  StoredRun,
} from './domain.js';

/**
 * Pure helpers of the eval module — expectation mapping, diff validation,
 * snapshotting, batch finalisation and DTO mapping. No I/O.
 */

// ---------------------------------------------------------------------------
// One-click case
// ---------------------------------------------------------------------------

/**
 * Accepted → `must_find`, dismissed → `must_not_flag`, undecided → null. The
 * expectation carries the finding's title, severity and category (AC-25).
 */
export function expectationFromFinding(finding: FindingContext['finding']): EvalExpectation | null {
  const kind = finding.acceptedAt ? 'must_find' : finding.dismissedAt ? 'must_not_flag' : null;
  if (!kind) return null;
  return {
    kind,
    file: finding.file,
    start_line: finding.startLine,
    end_line: finding.endLine,
    title: finding.title,
    severity: finding.severity,
    category: finding.category,
  };
}

/** The finding's file only, with the header a stored patch lacks (AC-26). */
export function oneClickDiff(file: string, patch: string): string {
  return fileDiff(file, patch);
}

/** Case name for a one-click case: the decision and the finding's title. */
export function oneClickName(kind: EvalExpectation['kind'], title: string): string {
  return `${kind === 'must_find' ? 'Must find' : 'Must not flag'}: ${title}`;
}

// ---------------------------------------------------------------------------
// Request deadline
// ---------------------------------------------------------------------------

/**
 * Wraps a provider so every model request carries a hard deadline. Only
 * `singleAttempt: true` makes a request honour `timeoutMs`. Note the engine's own
 * parse-retry loop (`maxRetries` in `ReviewInput`) still re-calls the provider, so
 * one bad parse is retried at engine level. `complete` has no `singleAttempt`
 * option, so it only receives `timeoutMs`.
 */
export function withRequestDeadline(llm: LLMProvider, timeoutMs: number): LLMProvider {
  return {
    id: llm.id,
    listModels: () => llm.listModels(),
    complete: (req: CompletionRequest) => llm.complete({ ...req, timeoutMs }),
    completeStructured: <T>(req: StructuredRequest<T>) =>
      llm.completeStructured({ ...req, timeoutMs, singleAttempt: true }),
    embed: (texts) => llm.embed(texts),
  };
}

// ---------------------------------------------------------------------------
// Case validation
// ---------------------------------------------------------------------------

/**
 * Diff-dependent create/update rules (AC-39, AC-40). Returns the failure message,
 * or null when the case is valid. Schema-level rules live in the route's zod body.
 */
export function validateCaseDiff(
  inputDiff: string,
  expectations: readonly Pick<EvalExpectation, 'file'>[],
): string | null {
  const parsed = parseUnifiedDiff(inputDiff);
  if (parsed.files.length === 0) return 'The input diff contains no files';
  const paths = new Set(parsed.files.map((f) => f.path));
  const missing = expectations.find((e) => !paths.has(e.file));
  if (missing) return `Expectation file "${missing.file}" is not a file of the input diff`;
  return null;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

/** `### name\nbody` blocks of the enabled skills, in link order. */
export function skillBodies(links: { skill: { name: string; body: string; enabled: boolean } }[]): string[] {
  return links.filter((l) => l.skill.enabled).map((l) => `### ${l.skill.name}\n${l.skill.body}`);
}

/** The frozen record of what a batch runs with; skills are stored by name. */
export function snapshotOf(
  agent: AgentForEval,
  links: { skill: { name: string; body: string; enabled: boolean } }[],
): AgentSnapshot {
  return {
    agentVersion: agent.version,
    systemPrompt: agent.systemPrompt,
    provider: agent.provider,
    model: agent.model,
    skills: links.filter((l) => l.skill.enabled).map((l) => l.skill.name),
  };
}

// ---------------------------------------------------------------------------
// Batch finalisation
// ---------------------------------------------------------------------------

function sumReported(values: (number | null)[]): number | null {
  const reported = values.filter((v): v is number => v !== null);
  return reported.length === 0 ? null : reported.reduce((a, b) => a + b, 0);
}

/**
 * Final state of a batch (AC-54, AC-55, AC-57). At least one scored case →
 * `done` with the micro-averaged metrics; every case errored → `failed` with no
 * metrics and "all N cases failed: <first error>".
 */
export function finaliseBatch(results: readonly CaseResult[], durationMs: number): BatchCompletion {
  const zero = {
    casesPassed: 0,
    mustFindTotal: 0,
    mustFindMatched: 0,
    keptTotal: 0,
    noiseTotal: 0,
    droppedTotal: 0,
    recall: null,
    precision: null,
    citationAccuracy: null,
    tokensIn: null,
    tokensOut: null,
    costUsd: null,
  };
  if (results.length === 0) {
    return { status: 'failed', error: NO_CASES_LEFT_ERROR, casesTotal: 0, durationMs, ...zero };
  }
  if (results.every((r) => r.score === null)) {
    const first = results[0]!.error ?? 'unknown error';
    return {
      status: 'failed',
      error: `all ${results.length} cases failed: ${first}`,
      casesTotal: results.length,
      durationMs,
      ...zero,
    };
  }
  const total = scoreBatch(results.map((r) => r.score));
  return {
    status: 'done',
    error: null,
    casesTotal: total.cases_total,
    casesPassed: total.cases_passed,
    mustFindTotal: total.must_find_total,
    mustFindMatched: total.must_find_matched,
    keptTotal: total.kept_total,
    noiseTotal: total.noise_total,
    droppedTotal: total.dropped_total,
    recall: total.recall,
    precision: total.precision,
    citationAccuracy: total.citation_accuracy,
    durationMs,
    tokensIn: sumReported(results.map((r) => r.tokensIn)),
    tokensOut: sumReported(results.map((r) => r.tokensOut)),
    costUsd: sumReported(results.map((r) => r.costUsd)),
  };
}

/** Newest `TREND_LIMIT` `done` batches, chronological (oldest first). */
export function trendOf(batches: readonly StoredBatch[]): StoredBatch[] {
  return batches
    .filter((b) => b.status === 'done')
    .sort((a, b) => b.ranAt.getTime() - a.ranAt.getTime())
    .slice(0, TREND_LIMIT)
    .reverse();
}

/** Assemble the dashboard overview from the repository's set-based rows. */
export function buildOverview(rows: OverviewRows): EvalOverview {
  const agents: EvalAgentSummary[] = rows.agents.map((a) => {
    const latest = rows.latestBatches.find((b) => b.agentId === a.agentId) ?? null;
    const done = rows.doneBatches.filter((b) => b.agentId === a.agentId);
    return {
      agent_id: a.agentId,
      name: a.name,
      model: a.model,
      cases_total: a.casesTotal,
      latest_batch: latest ? toBatchDto(latest) : null,
      trend: trendOf(done).map(toBatchDto),
    };
  });
  return { agents, recent_batches: rows.recent.slice(0, RECENT_BATCHES_LIMIT).map(toBatchDto) };
}

/** NFR-11: ids, counts and metrics only — never a diff, prompt or PR text. */
export function batchLogFields(
  batchId: string,
  agentId: string,
  c: BatchCompletion,
  snapshot: Pick<AgentSnapshot, 'agentVersion' | 'model'>,
): Record<string, unknown> {
  return {
    batch_id: batchId,
    agent_id: agentId,
    agent_version: snapshot.agentVersion,
    model: snapshot.model,
    status: c.status,
    cases_total: c.casesTotal,
    cases_passed: c.casesPassed,
    recall: c.recall,
    precision: c.precision,
    citation_accuracy: c.citationAccuracy,
    duration_ms: c.durationMs,
    tokens_in: c.tokensIn,
    tokens_out: c.tokensOut,
    cost_usd: c.costUsd,
  };
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

export function toCaseDto(c: StoredCase): EvalCaseRecord {
  return {
    id: c.id,
    owner_kind: 'agent',
    owner_id: c.ownerId,
    name: c.name,
    input_diff: c.inputDiff,
    input_files: null,
    input_meta: c.inputMeta,
    expected_output: c.expectedOutput,
    notes: c.notes,
    created_at: c.createdAt.toISOString(),
    created_from: c.createdFrom,
    source_finding_id: c.sourceFindingId,
    last_run: c.lastRun ? { pass: c.lastRun.pass, batch_id: c.lastRun.batchId } : null,
  };
}

export function toBatchDto(b: StoredBatch): EvalBatch {
  return {
    id: b.id,
    agent_id: b.agentId,
    agent_version: b.snapshot.agentVersion,
    system_prompt: b.snapshot.systemPrompt,
    provider: b.snapshot.provider,
    model: b.snapshot.model,
    skills: b.snapshot.skills,
    status: b.status,
    error: b.error,
    ran_at: b.ranAt.toISOString(),
    finished_at: b.finishedAt ? b.finishedAt.toISOString() : null,
    cases_total: b.casesTotal,
    cases_passed: b.casesPassed,
    must_find_total: b.mustFindTotal,
    must_find_matched: b.mustFindMatched,
    kept_total: b.keptTotal,
    noise_total: b.noiseTotal,
    dropped_total: b.droppedTotal,
    recall: b.recall,
    precision: b.precision,
    citation_accuracy: b.citationAccuracy,
    duration_ms: b.durationMs,
    tokens_in: b.tokensIn,
    tokens_out: b.tokensOut,
    cost_usd: b.costUsd,
  };
}

export function toRunDto(r: StoredRun): EvalBatchRun {
  return {
    id: r.id,
    case_id: r.caseId,
    case_name: r.caseName,
    ran_at: r.ranAt.toISOString(),
    actual_output: r.actualOutput,
    pass: r.pass,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
    batch_id: r.batchId,
    expected_output: r.expectedOutput,
    error: r.error,
  };
}
