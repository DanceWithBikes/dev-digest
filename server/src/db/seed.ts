import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { scoreCase, scoreBatch } from '@devdigest/reviewer-core';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-prompts.js';
import { FIXTURE_PRS, PR_482_BRIEF, PR_482_PATCHES } from './seed-fixtures.js';
import { SEED_EVAL_CASES, SEED_BATCHES } from './seed-eval-cases.js';
import { buildSeedSkills, RETIRED_SKILL_NAMES } from './seed-skills.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * L02 adds the Skills Lab: the built-in skills, the Test Quality / API Contract
 * reviewers, and the two fixture PRs (#483, #484) the control experiment runs on.
 *
 * Later course lessons populate the remaining tables (conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        // Matches the row count inserted below — was `9` while only 4 rows
        // existed (server/docs/insights.md, 2026-09-24 entry); now honest.
        filesCount: 7,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset). Deliberately spans more than one Smart Diff role
    // (core/wiring/docs/boilerplate) — with all-`core` files the Files-changed
    // tab renders exactly one group (server/docs/insights.md, 2026-09-24 entry).
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      {
        prId: pr!.id,
        path: 'src/config.ts',
        additions: 4,
        deletions: 0,
        patch: PR_482_PATCHES['src/config.ts'],
      },
      {
        prId: pr!.id,
        path: 'src/api/users.ts',
        additions: 7,
        deletions: 2,
        patch: PR_482_PATCHES['src/api/users.ts'],
      },
      { prId: pr!.id, path: 'src/api/public/index.ts', additions: 5, deletions: 0 },
      { prId: pr!.id, path: 'README.md', additions: 12, deletions: 2 },
      { prId: pr!.id, path: 'pnpm-lock.yaml', additions: 18, deletions: 3 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // SPEC-04 AC-64: dev DBs seeded before the patches existed get them too. The seed
  // never updates a row, so this is an explicit "only where empty" backfill.
  for (const [path, patch] of Object.entries(PR_482_PATCHES)) {
    await db
      .update(t.prFiles)
      .set({ patch })
      .where(and(eq(t.prFiles.prId, pr!.id), eq(t.prFiles.path, path), isNull(t.prFiles.patch)));
  }

  // Cached PR Brief for #482. Own existence check (by pr_id), so dev DBs seeded
  // before the brief existed get it too; never overwrites a regenerated brief.
  const [existingBrief] = await db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr!.id));
  if (!existingBrief) {
    await db.insert(t.prBrief).values({ prId: pr!.id, json: PR_482_BRIEF });
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Reviews the tests: uncovered branches, missed edge cases, over-mocking, flakes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Detects breaking changes to route signatures and response shapes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // SPEC-04 AC-65: the seeded #482 review predates agents — attribute it to the
  // Security Reviewer, only where no agent is set.
  const [securityAgent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  await db
    .update(t.reviews)
    .set({ agentId: securityAgent!.id })
    .where(
      and(
        eq(t.reviews.prId, pr!.id),
        eq(t.reviews.model, 'seed'),
        eq(t.reviews.kind, 'review'),
        isNull(t.reviews.agentId),
      ),
    );

  await seedSkills(db, workspaceId);
  await seedFixturePrs(db, workspaceId, repoId);
  await seedEvalCases(db, workspaceId, securityAgent!);

  return { workspaceId, userId };
}

/**
 * SPEC-04 — the Security Reviewer's 8 eval cases and 2 scored `seed` batches.
 *
 * Cases are idempotent by `(owner_id, name)`; batches by `(agent_id, model = 'seed')`.
 * Batch counts and metrics are computed by the same scorers the runner uses, from
 * the per-case outputs stored in `seed-eval-cases.ts` (AC-69).
 */
async function seedEvalCases(
  db: Db,
  workspaceId: string,
  agent: typeof t.agents.$inferSelect,
): Promise<void> {
  const caseIdByName = new Map<string, string>();
  for (const c of SEED_EVAL_CASES) {
    let [row] = await db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerId, agent.id), eq(t.evalCases.name, c.name)));
    if (!row) {
      [row] = await db
        .insert(t.evalCases)
        .values({
          workspaceId,
          ownerKind: 'agent',
          ownerId: agent.id,
          name: c.name,
          inputDiff: c.inputDiff,
          inputMeta: c.inputMeta,
          expectedOutput: { expectations: c.expectations },
          notes: c.notes,
          createdFrom: 'manual',
        })
        .returning();
    }
    caseIdByName.set(c.name, row!.id);
  }

  const [existingBatch] = await db
    .select()
    .from(t.evalBatches)
    .where(and(eq(t.evalBatches.agentId, agent.id), eq(t.evalBatches.model, 'seed')));
  if (existingBatch) return;

  for (const def of SEED_BATCHES) {
    const ranAt = new Date(Date.now() - def.daysAgo * 24 * 60 * 60 * 1000);
    const scored = def.outputs.map((o) => {
      const exps = SEED_EVAL_CASES.find((c) => c.name === o.caseName)!.expectations;
      return { o, score: scoreCase(exps, o.kept, o.dropped.length) };
    });
    const total = scoreBatch(scored.map((x) => x.score));

    const [batch] = await db
      .insert(t.evalBatches)
      .values({
        workspaceId,
        agentId: agent.id,
        agentVersion: 1,
        systemPrompt: def.promptSnapshot(agent.systemPrompt),
        provider: agent.provider,
        model: 'seed',
        skills: [],
        status: 'done',
        ranAt,
        finishedAt: new Date(ranAt.getTime() + def.durationMs),
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
        durationMs: def.durationMs,
      })
      .returning();

    await db.insert(t.evalRuns).values(
      scored.map(({ o, score }) => ({
        caseId: caseIdByName.get(o.caseName)!,
        batchId: batch!.id,
        ranAt,
        actualOutput: {
          kept: o.kept,
          dropped: o.dropped,
          matched_expectations: score.matched_expectations,
          noise_finding_ids: score.noise_finding_ids,
          mode: 'single-pass',
          tokens_in: null,
          tokens_out: null,
        },
        pass: score.pass,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        durationMs: Math.round(def.durationMs / def.outputs.length),
      })),
    );
  }
}

/**
 * L02 — the control-experiment PRs (#483, #484). Idempotent by `(repoId, number)`.
 *
 * Unlike the demo PR #482, every file here carries a real unified-diff `patch`:
 * `diffFromPrFiles` drops patch-less files, so without one the agents would
 * review an empty diff and the with/without-skills comparison would show
 * nothing. See `seed-fixtures.ts`.
 */
async function seedFixturePrs(db: Db, workspaceId: string, repoId: string): Promise<void> {
  for (const fx of FIXTURE_PRS) {
    const [existing] = await db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, fx.number)));
    if (existing) continue;

    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: fx.number,
        title: fx.title,
        author: fx.author,
        branch: fx.branch,
        base: fx.base,
        headSha: fx.headSha,
        additions: fx.files.reduce((n, f) => n + f.additions, 0),
        deletions: fx.files.reduce((n, f) => n + f.deletions, 0),
        filesCount: fx.files.length,
        status: 'needs_review',
        body: fx.body,
      })
      .returning();

    await db.insert(t.prFiles).values(
      fx.files.map((f) => ({
        prId: pr!.id,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
    );

    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: fx.commitSha,
      message: fx.commitMessage,
      author: fx.author,
    });
  }
}

/**
 * L02 — persist the built-in skills and their agent links.
 *
 * The catalogue itself (bodies, descriptions, attachment order) lives in
 * `seed-skills.ts`; this function only writes it.
 *
 * Idempotent by `(workspaceId, name)`. NOTE this bypasses `SkillsRepository`,
 * so the v1 `skill_versions` snapshot is written explicitly — otherwise a
 * seeded skill would claim `version: 1` with no history behind it.
 */
async function seedSkills(db: Db, workspaceId: string): Promise<void> {
  const seedSkillRows = buildSeedSkills();

  for (const name of RETIRED_SKILL_NAMES) {
    await db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, name)));
  }

  for (const sk of seedSkillRows) {
    let [row] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, sk.name)));

    if (!row) {
      [row] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: sk.name,
          description: sk.description,
          type: sk.type,
          source: sk.source ?? 'manual',
          body: sk.body,
          enabled: true,
          version: 1,
        })
        .returning();
      await db
        .insert(t.skillVersions)
        .values({ skillId: row!.id, version: 1, body: sk.body })
        .onConflictDoNothing();
    }

    for (const link of sk.attachTo) {
      const [agent] = await db
        .select()
        .from(t.agents)
        .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, link.agent)));
      if (!agent) continue;
      await db
        .insert(t.agentSkills)
        .values({ agentId: agent.id, skillId: row!.id, order: link.order })
        .onConflictDoNothing();
    }
  }
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
