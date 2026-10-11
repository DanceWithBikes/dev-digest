/**
 * Pure mappers from multi-agent domain objects to the API contracts. No DB, no
 * model call.
 */
import type {
  AgentColumn,
  FindingRecord,
  MultiAgentRun,
  MultiAgentRunSummary,
} from '@devdigest/shared';
import {
  buildLocationGroups,
  columnScore,
  deriveParentStatus,
  orderColumns,
  parentTotals,
  type ChildRun,
  type GroupableFinding,
  type ParentRow,
} from './domain.js';

/** Drops the grouping-only fields, leaving the contract's finding record. */
export function toFindingRecord(f: GroupableFinding): FindingRecord {
  const { agentId: _agentId, runId: _runId, ...record } = f;
  return record;
}

function toColumn(child: ChildRun, findings: readonly GroupableFinding[]): AgentColumn {
  return {
    run_id: child.id,
    agent_id: child.agentId,
    agent_name: child.agentName,
    provider: child.provider,
    model: child.model,
    status: child.status,
    verdict: child.verdict,
    score: columnScore(child),
    summary: child.summary,
    error: child.error,
    duration_ms: child.durationMs,
    cost_usd: child.costUsd,
    findings: findings.filter((f) => f.runId === child.id).map(toFindingRecord),
  };
}

/** One row of the parent run list. */
export function toSummaryDto(
  parent: ParentRow,
  children: readonly ChildRun[],
): MultiAgentRunSummary {
  const totals = parentTotals(children);
  return {
    id: parent.id,
    pr_id: parent.prId,
    pr_number: parent.prNumber,
    pr_title: parent.prTitle,
    ran_at: parent.createdAt,
    status: deriveParentStatus(children),
    agent_count: orderColumns(parent.agentIds, children).length,
    ...totals,
  };
}

/** The full results payload of one parent run. */
export function toMultiAgentRunDto(
  parent: ParentRow,
  children: readonly ChildRun[],
  findings: readonly GroupableFinding[],
): MultiAgentRun {
  const columns = orderColumns(parent.agentIds, children);
  return {
    ...toSummaryDto(parent, children),
    columns: columns.map((c) => toColumn(c, findings)),
    groups: buildLocationGroups(columns, findings),
  };
}
