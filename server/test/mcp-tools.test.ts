/**
 * The 5 MCP tools end-to-end over a real JSON-RPC round trip
 * (`InMemoryTransport.createLinkedPair()` + a real `Client`), against a fake
 * `McpDeps` — no Postgres, no `Container`. This is what actually exercises the
 * SDK's own input/output-schema validation, unlike calling the handler
 * function directly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Agent, ConventionCandidate, ReviewRecord, RunSummary } from '@devdigest/shared';
import { NotFoundError } from '../src/platform/errors.js';
import type { McpDeps } from '../src/mcp/ports.js';
import { createDevDigestMcpServer } from '../src/mcp/server.js';

const WS = 'ws-1';

// `pr_id`/`agent_id`/`run_id`/`repo_id` are `.uuid()`-validated tool ARGUMENTS
// (`schemas.ts`) — the SDK rejects a malformed id before our handler ever
// runs, so the fixtures need real-shaped uuids, not `'pr-1'`-style ids.
const PR_ID = '11111111-1111-4111-a111-111111111111';
const AGENT_A_ID = '22222222-2222-4222-a222-222222222222';
const AGENT_B_ID = '33333333-3333-4333-a333-333333333333';
const RUN_ID = '44444444-4444-4444-a444-444444444444';
const MISSING_RUN_ID = '77777777-7777-4777-a777-777777777777';
const REPO_ID = '55555555-5555-4555-a555-555555555555';
const REVIEW_ID = '66666666-6666-4666-a666-666666666666';

const enabledAgent: Agent = {
  id: AGENT_A_ID,
  name: 'Security',
  description: 'Finds security issues.',
  provider: 'openai',
  model: 'gpt-4.1',
  system_prompt: 'You are a meticulous security reviewer.',
  output_schema: null,
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

const disabledAgent: Agent = { ...enabledAgent, id: AGENT_B_ID, name: 'Perf', enabled: false };

const runSummary: RunSummary = {
  run_id: RUN_ID,
  agent_id: AGENT_A_ID,
  agent_name: 'Security',
  provider: 'openai',
  model: 'gpt-4.1',
  status: 'done',
  error: null,
  duration_ms: 1200,
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.01,
  findings_count: 2,
  grounding: '2/2 passed',
  ran_at: '2026-01-01T00:00:00.000Z',
  score: 65,
  blockers: 1,
};

const review: ReviewRecord = {
  id: REVIEW_ID,
  pr_id: PR_ID,
  agent_id: AGENT_A_ID,
  run_id: RUN_ID,
  agent_name: 'Security',
  kind: 'review',
  verdict: 'request_changes',
  summary: 'One hardcoded secret.',
  score: 65,
  model: 'gpt-4.1',
  grounding: '2/2 passed',
  created_at: '2026-01-01T00:00:00.000Z',
  findings: [
    {
      id: 'f-critical',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
      trifecta_components: null,
      evidence: null,
      out_of_scope: false,
      review_id: REVIEW_ID,
      accepted_at: null,
      dismissed_at: null,
    },
    {
      id: 'f-warning',
      severity: 'WARNING',
      category: 'bug',
      title: 'Missing null check',
      file: 'src/config.ts',
      start_line: 20,
      end_line: 20,
      rationale: 'x may be undefined.',
      suggestion: null,
      confidence: 0.6,
      kind: 'finding',
      trifecta_components: null,
      evidence: null,
      out_of_scope: false,
      review_id: REVIEW_ID,
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

const conventions: ConventionCandidate[] = [
  {
    id: 'c-accepted',
    repo_id: REPO_ID,
    category: 'naming',
    rule: 'Use kebab-case for file names',
    evidence_path: 'src/foo-bar.ts',
    evidence_line: 1,
    evidence_snippet: '// file',
    confidence: 0.9,
    status: 'accepted',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'c-pending',
    repo_id: REPO_ID,
    category: 'testing',
    rule: 'Every module gets an it.test.ts',
    evidence_path: 'test/foo.test.ts',
    evidence_line: 1,
    evidence_snippet: 'describe(...)',
    confidence: 0.7,
    status: 'pending',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'c-rejected',
    repo_id: REPO_ID,
    category: 'other',
    rule: 'Never rejected in practice',
    evidence_path: 'src/x.ts',
    evidence_line: 1,
    evidence_snippet: 'x',
    confidence: 0.5,
    status: 'rejected',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

function fakeDeps(): McpDeps {
  return {
    async workspaceId() {
      return WS;
    },
    async listAgents(workspaceId) {
      expect(workspaceId).toBe(WS);
      return [enabledAgent, disabledAgent];
    },
    async resolveRepo(workspaceId, ref) {
      expect(workspaceId).toBe(WS);
      if (ref.repoId === REPO_ID || ref.fullName?.toLowerCase() === 'acme/widgets') {
        return { id: REPO_ID, owner: 'acme', name: 'widgets' };
      }
      throw new NotFoundError(`Repo not found in this workspace: ${ref.repoId ?? ref.fullName}`);
    },
    async runAgentOnPr(workspaceId, pr, selection) {
      expect(workspaceId).toBe(WS);
      if (pr.kind === 'id' && pr.prId !== PR_ID) throw new NotFoundError('PR not found');
      if (pr.kind === 'repo' && !(pr.fullName.toLowerCase() === 'acme/widgets' && pr.number === 42)) {
        throw new NotFoundError('PR not found');
      }
      const agentId = selection.kind === 'agent' ? selection.agentId : AGENT_A_ID;
      return { pr_id: PR_ID, runs: [{ run_id: RUN_ID, agent_id: agentId, agent_name: 'Security' }] };
    },
    async getRunResult(workspaceId, runId) {
      expect(workspaceId).toBe(WS);
      if (runId !== RUN_ID) throw new NotFoundError('Run not found');
      return { run: runSummary, review };
    },
    async listConventions(workspaceId, repoId) {
      expect(workspaceId).toBe(WS);
      expect(repoId).toBe(REPO_ID);
      return conventions;
    },
    async previewConventionsSkillBody(workspaceId, repoId) {
      expect(workspaceId).toBe(WS);
      expect(repoId).toBe(REPO_ID);
      return '### repo-conventions\n- Use kebab-case for file names';
    },
  };
}

describe('devdigest MCP server', () => {
  let client: Client;

  beforeEach(async () => {
    const server = createDevDigestMcpServer(fakeDeps());
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
  });

  it('exposes exactly 5 bare-named, annotated tools', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(5);
    const byName = new Map(tools.map((t) => [t.name, t]));
    expect([...byName.keys()].sort()).toEqual([
      'get_blast_radius',
      'get_conventions',
      'get_findings',
      'list_agents',
      'run_agent_on_pr',
    ]);
    for (const tool of tools) {
      expect(tool.annotations).toBeDefined();
    }
    expect(byName.get('list_agents')?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get('run_agent_on_pr')?.annotations?.readOnlyHint).toBe(false);
    expect(byName.get('run_agent_on_pr')?.annotations?.openWorldHint).toBe(true);
  });

  describe('list_agents', () => {
    it('omits system_prompt/output_schema by default (concise)', async () => {
      const result = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(result.isError).toBeFalsy();
      const agents = (result.structuredContent as { agents: Record<string, unknown>[] }).agents;
      expect(agents).toHaveLength(2);
      for (const agent of agents) {
        expect(agent).not.toHaveProperty('system_prompt');
        expect(agent).not.toHaveProperty('output_schema');
      }
    });

    it('includes system_prompt when response_format is detailed', async () => {
      const result = await client.callTool({
        name: 'list_agents',
        arguments: { response_format: 'detailed' },
      });
      const agents = (result.structuredContent as { agents: { system_prompt: string }[] }).agents;
      expect(agents.every((a) => typeof a.system_prompt === 'string')).toBe(true);
    });

    it('enabled_only drops disabled agents', async () => {
      const result = await client.callTool({ name: 'list_agents', arguments: { enabled_only: true } });
      const agents = (result.structuredContent as { agents: { id: string }[] }).agents;
      expect(agents.map((a) => a.id)).toEqual([AGENT_A_ID]);
    });
  });

  describe('run_agent_on_pr', () => {
    it('runs by pr_id + agent_id', async () => {
      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { pr_id: PR_ID, agent_id: AGENT_A_ID },
      });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toMatchObject({
        pr_id: PR_ID,
        status: 'running',
        runs: [{ run_id: RUN_ID, agent_id: AGENT_A_ID }],
      });
    });

    it('runs by repo + number + all:true', async () => {
      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { repo: 'acme/widgets', number: 42, all: true },
      });
      expect(result.isError).toBeFalsy();
      expect((result.structuredContent as { pr_id: string }).pr_id).toBe(PR_ID);
    });

    it('isError + an actionable hint when neither pr_id nor repo/number is given', async () => {
      const result = await client.callTool({ name: 'run_agent_on_pr', arguments: { agent_id: AGENT_A_ID } });
      expect(result.isError).toBe(true);
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
      expect(text).toContain('pr_id');
    });

    it('isError when neither agent_id nor all:true is given', async () => {
      const result = await client.callTool({ name: 'run_agent_on_pr', arguments: { pr_id: PR_ID } });
      expect(result.isError).toBe(true);
    });

    it('isError with a workspace hint for an unimported repo', async () => {
      const result = await client.callTool({
        name: 'run_agent_on_pr',
        arguments: { repo: 'acme/ghost', number: 1, all: true },
      });
      expect(result.isError).toBe(true);
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
      expect(text).toContain('workspace');
    });
  });

  describe('get_findings', () => {
    it('returns the run, review and findings (concise omits rationale/suggestion)', async () => {
      const result = await client.callTool({ name: 'get_findings', arguments: { run_id: RUN_ID } });
      expect(result.isError).toBeFalsy();
      const structured = result.structuredContent as {
        run: { status: string };
        total: number;
        truncated: boolean;
        findings: Record<string, unknown>[];
      };
      expect(structured.run.status).toBe('done');
      expect(structured.total).toBe(2);
      expect(structured.truncated).toBe(false);
      for (const finding of structured.findings) {
        expect(finding).not.toHaveProperty('rationale');
        expect(finding).not.toHaveProperty('suggestion');
      }
    });

    it('min_severity filters, limit truncates', async () => {
      const result = await client.callTool({
        name: 'get_findings',
        arguments: { run_id: RUN_ID, min_severity: 'CRITICAL', limit: 1 },
      });
      const structured = result.structuredContent as { total: number; truncated: boolean; findings: unknown[] };
      expect(structured.total).toBe(1);
      expect(structured.findings).toHaveLength(1);
      expect(structured.truncated).toBe(false);
    });

    it('review carries no findings of its own, so filters cannot be bypassed', async () => {
      const result = await client.callTool({
        name: 'get_findings',
        arguments: { run_id: RUN_ID, min_severity: 'CRITICAL', limit: 1 },
      });
      const structured = result.structuredContent as { review: Record<string, unknown> | null };
      expect(structured.review).not.toBeNull();
      expect(structured.review).toHaveProperty('verdict');
      expect(structured.review).not.toHaveProperty('findings');
      const text = (result.content as { type: string; text: string }[])[0]!.text;
      expect(JSON.parse(text).review).not.toHaveProperty('findings');
    });

    it('isError for an unknown run_id', async () => {
      const result = await client.callTool({ name: 'get_findings', arguments: { run_id: MISSING_RUN_ID } });
      expect(result.isError).toBe(true);
    });
  });

  describe('get_conventions', () => {
    it('defaults to accepted, with counts across every status', async () => {
      const result = await client.callTool({ name: 'get_conventions', arguments: { repo_id: REPO_ID } });
      expect(result.isError).toBeFalsy();
      const structured = result.structuredContent as {
        conventions: { status: string }[];
        counts: { accepted: number; pending: number; rejected: number };
        skill_markdown?: string;
      };
      expect(structured.conventions).toHaveLength(1);
      expect(structured.conventions[0]?.status).toBe('accepted');
      expect(structured.counts).toEqual({ accepted: 1, pending: 1, rejected: 1 });
      expect(structured.skill_markdown).toBeUndefined();
    });

    it('status: "all" returns every candidate; include_skill_markdown adds the body', async () => {
      const result = await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/widgets', status: 'all', include_skill_markdown: true },
      });
      const structured = result.structuredContent as { conventions: unknown[]; skill_markdown?: string };
      expect(structured.conventions).toHaveLength(3);
      expect(structured.skill_markdown).toContain('repo-conventions');
    });
  });

  describe('get_blast_radius', () => {
    it('always isError, regardless of input', async () => {
      const result = await client.callTool({ name: 'get_blast_radius', arguments: { pr_id: PR_ID } });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
      expect(text.toLowerCase()).toContain('not implemented');
    });
  });
});
