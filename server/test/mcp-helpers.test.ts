/**
 * Pure helpers for the MCP tool handlers (`src/mcp/helpers.ts`): parsing the
 * "exactly one of A or B" tool arguments into a discriminated `PrRef` /
 * `AgentSelection` / `RepoRef`, and the severity/status filtering used by
 * `get_findings` / `get_conventions`.
 */
import { describe, it, expect } from 'vitest';
import type { ConventionCandidate, Severity } from '@devdigest/shared';
import {
  countByStatus,
  filterByStatus,
  filterBySeverity,
  parseAgentSelection,
  parsePrRef,
  parseRepoRef,
  severityAtLeast,
} from '../src/mcp/helpers.js';
import { ValidationError } from '../src/platform/errors.js';

describe('parsePrRef', () => {
  it('accepts pr_id alone', () => {
    expect(parsePrRef({ pr_id: 'pr-1' })).toEqual({ kind: 'id', prId: 'pr-1' });
  });

  it('accepts repo + number', () => {
    expect(parsePrRef({ repo: 'acme/widgets', number: 42 })).toEqual({
      kind: 'repo',
      fullName: 'acme/widgets',
      number: 42,
    });
  });

  it('rejects neither', () => {
    expect(() => parsePrRef({})).toThrow(ValidationError);
  });

  it('rejects pr_id together with repo/number', () => {
    expect(() => parsePrRef({ pr_id: 'pr-1', repo: 'acme/widgets', number: 42 })).toThrow(ValidationError);
  });

  it('rejects repo without number', () => {
    expect(() => parsePrRef({ repo: 'acme/widgets' })).toThrow(ValidationError);
  });
});

describe('parseAgentSelection', () => {
  it('accepts agent_id alone', () => {
    expect(parseAgentSelection({ agent_id: 'agent-1' })).toEqual({ kind: 'agent', agentId: 'agent-1' });
  });

  it('accepts all:true alone', () => {
    expect(parseAgentSelection({ all: true })).toEqual({ kind: 'all' });
  });

  it('rejects neither', () => {
    expect(() => parseAgentSelection({})).toThrow(ValidationError);
  });

  it('rejects both', () => {
    expect(() => parseAgentSelection({ agent_id: 'agent-1', all: true })).toThrow(ValidationError);
  });
});

describe('parseRepoRef', () => {
  it('accepts repo_id alone', () => {
    expect(parseRepoRef({ repo_id: 'repo-1' })).toEqual({ repoId: 'repo-1' });
  });

  it('accepts repo alone', () => {
    expect(parseRepoRef({ repo: 'acme/widgets' })).toEqual({ fullName: 'acme/widgets' });
  });

  it('rejects neither', () => {
    expect(() => parseRepoRef({})).toThrow(ValidationError);
  });

  it('rejects both', () => {
    expect(() => parseRepoRef({ repo_id: 'repo-1', repo: 'acme/widgets' })).toThrow(ValidationError);
  });
});

describe('severityAtLeast / filterBySeverity', () => {
  it('orders CRITICAL > WARNING > SUGGESTION', () => {
    expect(severityAtLeast('CRITICAL', 'WARNING')).toBe(true);
    expect(severityAtLeast('WARNING', 'CRITICAL')).toBe(false);
    expect(severityAtLeast('SUGGESTION', 'SUGGESTION')).toBe(true);
  });

  it('keeps only findings at or above the minimum', () => {
    const findings = (['CRITICAL', 'WARNING', 'SUGGESTION'] as Severity[]).map((severity) => ({ severity }));
    expect(filterBySeverity(findings, 'WARNING')).toEqual([{ severity: 'CRITICAL' }, { severity: 'WARNING' }]);
  });

  it('returns everything when no minimum is given', () => {
    const findings = [{ severity: 'SUGGESTION' as Severity }];
    expect(filterBySeverity(findings, undefined)).toEqual(findings);
  });
});

describe('filterByStatus / countByStatus', () => {
  const at = (status: ConventionCandidate['status']): ConventionCandidate => ({
    id: `c-${status}`,
    repo_id: 'repo-1',
    category: 'naming',
    rule: `rule ${status}`,
    evidence_path: 'src/a.ts',
    evidence_line: 1,
    evidence_snippet: 'x',
    confidence: 0.8,
    status,
    created_at: '2026-01-01T00:00:00.000Z',
  });
  const all = [at('accepted'), at('pending'), at('rejected')];

  it('"all" returns every candidate unfiltered', () => {
    expect(filterByStatus(all, 'all')).toEqual(all);
  });

  it('narrows to one status', () => {
    expect(filterByStatus(all, 'pending')).toEqual([at('pending')]);
  });

  it('counts across every status regardless of the filter', () => {
    expect(countByStatus(all)).toEqual({ accepted: 1, pending: 1, rejected: 1 });
  });
});
