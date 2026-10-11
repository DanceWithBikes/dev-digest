import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Intent, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { buildMcpDeps } from '../src/mcp/compose.js';
import { mcpLogger } from '../src/mcp/logger.js';
import { createDevDigestMcpServer } from '../src/mcp/server.js';
import * as t from '../src/db/schema.js';

/**
 * The MCP surface (`src/mcp/`) end to end, against a REAL Container +
 * Testcontainers Postgres — no Fastify anywhere in this path, modelled on
 * `test/reviews.it.test.ts` but wired the way `src/mcp.ts` actually wires it:
 * `Container` → `buildMcpDeps` → `createDevDigestMcpServer` → a real JSON-RPC
 * round trip over `InMemoryTransport`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 65,
  findings: [
    {
      id: 'f-valid',
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
    },
  ],
};

// The Intent Layer runs as shared pre-work on every review, against the
// `review_intent` feature model (openrouter by default) — mock it the same
// way `reviews.it.test.ts` does, or the run's timing depends on a live network
// call. The PR body below references no issue/spec, so github/git mocks just
// need to exist; they are never asked to resolve anything.
const INTENT_FIXTURE: Intent = {
  intent: 'Add rate limiting to the public API.',
  in_scope: ['Rate limiting middleware'],
  out_of_scope: [],
};

/**
 * Review provider whose Review calls can be held on a gate (SPEC-06 AC-25):
 * while `gate` is set, every `Review` completion waits for it and `inflight` /
 * `peak` count the calls held. Intent calls (other schemas) pass straight through.
 */
class GateableLLM extends MockLLMProvider {
  gate: Promise<void> | null = null;
  inflight = 0;
  peak = 0;
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName !== 'Review' || !this.gate) return super.completeStructured(req);
    this.inflight += 1;
    this.peak = Math.max(this.peak, this.inflight);
    try {
      await this.gate;
    } finally {
      this.inflight -= 1;
    }
    return super.completeStructured(req);
  }
}

d('MCP surface (Testcontainers pg)', () => {
  const reviewLlm = new GateableLLM('openai', {
    structured: REVIEW_FIXTURE,
    structuredBySchema: { pr_intent: INTENT_FIXTURE },
  });
  let pg: PgFixture;
  let container: Container;
  let workspaceId: string;
  let repoFullName: string;
  let prNumber: number;
  let agentId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    container = new Container(config(), pg.handle.db, {
      git: new MockGitClient({ diff: DIFF }),
      github: new MockGitHubClient(),
      llm: { openrouter: reviewLlm },
    });

    const repoName = `mcp-widgets-${Date.now()}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: repoName, fullName: `acme/${repoName}` })
      .returning();
    repoFullName = repo!.fullName;

    prNumber = 909;
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: prNumber,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Add rate limiting.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const [agent] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId)).limit(1);
    agentId = agent!.id;

    // Accepted + pending conventions on the same repo, for get_conventions.
    await pg.handle.db.insert(t.conventions).values([
      {
        workspaceId,
        repoId: repo!.id,
        category: 'naming',
        rule: 'Use kebab-case for file names',
        evidencePath: 'src/foo-bar.ts',
        evidenceLine: 1,
        evidenceSnippet: '// file',
        confidence: 0.9,
        status: 'accepted',
      },
      {
        workspaceId,
        repoId: repo!.id,
        category: 'testing',
        rule: 'Every module gets an it.test.ts',
        evidencePath: 'test/foo.test.ts',
        evidenceLine: 1,
        evidenceSnippet: 'describe(...)',
        confidence: 0.7,
        status: 'pending',
      },
    ]);
  });

  afterAll(async () => {
    await pg?.stop();
  });

  async function connectClient(): Promise<Client> {
    const deps = buildMcpDeps(container, mcpLogger);
    const server = createDevDigestMcpServer(deps);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'it-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it('lists the seeded agents', async () => {
    const client = await connectClient();
    const result = await client.callTool({ name: 'list_agents', arguments: { enabled_only: true } });
    expect(result.isError).toBeFalsy();
    const agents = (result.structuredContent as { agents: { id: string }[] }).agents;
    expect(agents.some((a) => a.id === agentId)).toBe(true);
    await client.close();
  });

  it('runs an agent by repo/number, then get_findings poll-and-read reaches "done"', async () => {
    const client = await connectClient();

    const started = await client.callTool({
      name: 'run_agent_on_pr',
      arguments: { repo: repoFullName, number: prNumber, agent_id: agentId },
    });
    expect(started.isError).toBeFalsy();
    const { runs } = started.structuredContent as { runs: { run_id: string }[] };
    const runId = runs[0]!.run_id;

    // runReview is fire-and-forget: poll get_findings (the tool's own poll
    // target) until the run reaches a terminal status.
    let structured: { run: { status: string }; review: Record<string, unknown> | null; findings: unknown[] } | undefined;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const polled = await client.callTool({ name: 'get_findings', arguments: { run_id: runId } });
      structured = polled.structuredContent as typeof structured;
      if (structured?.run.status !== 'queued' && structured?.run.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(structured?.run.status).toBe('done');
    expect(structured?.findings).toHaveLength(1);
    await client.close();
  });

  it('get_findings on a run from ANOTHER workspace is isError (workspace scope closed)', async () => {
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `mcp-other-${Date.now()}` }).returning();
    const [foreignRun] = await pg.handle.db
      .insert(t.agentRuns)
      .values({ workspaceId: otherWs!.id, status: 'done', findingsCount: 0, grounding: '0/0 passed' })
      .returning();

    const client = await connectClient();
    const result = await client.callTool({ name: 'get_findings', arguments: { run_id: foreignRun!.id } });
    expect(result.isError).toBe(true);
    await client.close();
  });

  it('get_conventions filters by status, with counts across every status', async () => {
    const client = await connectClient();

    const acceptedOnly = await client.callTool({
      name: 'get_conventions',
      arguments: { repo: repoFullName },
    });
    expect(acceptedOnly.isError).toBeFalsy();
    const acceptedStructured = acceptedOnly.structuredContent as {
      conventions: { status: string }[];
      counts: { accepted: number; pending: number; rejected: number };
    };
    expect(acceptedStructured.conventions).toHaveLength(1);
    expect(acceptedStructured.conventions[0]?.status).toBe('accepted');
    expect(acceptedStructured.counts).toEqual({ accepted: 1, pending: 1, rejected: 0 });

    const all = await client.callTool({
      name: 'get_conventions',
      arguments: { repo: repoFullName, status: 'all' },
    });
    expect((all.structuredContent as { conventions: unknown[] }).conventions).toHaveLength(2);

    await client.close();
  });
  it('run_agent_on_pr all:true with 5 enabled agents keeps at most 4 running and queues the 5th (AC-25)', async () => {
    const db = pg.handle.db;
    // Exactly 5 enabled agents on the mocked provider, whatever the seed holds.
    const existing = await db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    const wasEnabled = existing.filter((a) => a.enabled).map((a) => a.id);
    const extras: string[] = [];
    try {
      for (const a of existing) await db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, a.id));
      for (let i = 0; i < 5; i++) {
        const [row] = await db
          .insert(t.agents)
          .values({ workspaceId, name: `Cap ${i} ${Date.now()}`, provider: 'openrouter', model: 'm', systemPrompt: 'p', enabled: true })
          .returning();
        extras.push(row!.id);
      }

      let release!: () => void;
      reviewLlm.gate = new Promise<void>((r) => (release = r));
      reviewLlm.peak = 0;

      const client = await connectClient();
      const started = await client.callTool({ name: 'run_agent_on_pr', arguments: { repo: repoFullName, number: prNumber, all: true } });
      expect(started.isError).toBeFalsy();
      const { runs } = started.structuredContent as { runs: { run_id: string; agent_id: string }[] };
      expect(runs).toHaveLength(5);
      const runIds = runs.map((r) => r.run_id);

      const statuses = async () =>
        (await db.select().from(t.agentRuns).where(inArray(t.agentRuns.id, runIds))).map((r) => r.status);
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && (await statuses()).filter((s) => s === 'running').length < 4) {
        await new Promise((r) => setTimeout(r, 25));
      }
      await new Promise((r) => setTimeout(r, 150)); // a wrongly started 5th would show by now
      const held = await statuses();
      expect(held.filter((s) => s === 'running')).toHaveLength(4);
      expect(held.filter((s) => s === 'queued')).toHaveLength(1);
      expect(reviewLlm.inflight).toBeLessThanOrEqual(4);

      release();
      while (Date.now() < deadline && (await statuses()).some((s) => s !== 'done' && s !== 'failed')) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect((await statuses()).every((s) => s === 'done')).toBe(true);
      expect(reviewLlm.peak).toBeLessThanOrEqual(4);
      await client.close();
    } finally {
      reviewLlm.gate = null;
      for (const a of existing) {
        await db.update(t.agents).set({ enabled: wasEnabled.includes(a.id) }).where(eq(t.agents.id, a.id));
      }
      for (const id of extras) await db.update(t.agents).set({ enabled: false }).where(eq(t.agents.id, id));
    }
  });
});
