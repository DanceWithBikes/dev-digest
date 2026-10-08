/**
 * L02 — the two fixture PRs the control experiment runs on.
 *
 * Each `pr_files` row MUST carry a real `patch`: `diffFromPrFiles`
 * (`modules/reviews/diff-loader.ts`) skips any file without one, so a
 * patch-less fixture makes every agent review an EMPTY diff — and the
 * with-skills / without-skills comparison then shows nothing either way,
 * which looks exactly like the feature not working.
 *
 * The content is chosen so that each agent's skills have something concrete to
 * catch: #483 has a branch and a boundary the test never touches, #484 renames
 * a required query param and drops a response field.
 */

import type { PrBrief } from '@devdigest/shared';

export interface FixtureFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface FixturePr {
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  body: string;
  files: FixtureFile[];
  commitSha: string;
  commitMessage: string;
}

/** PR #483 — new code with two untested branches, and a happy-path-only test. */
export const PR_483_DISCOUNT: FixturePr = {
  number: 483,
  title: 'Add coupon discount calculation + tests',
  author: 'dev.ivanov',
  branch: 'feat/coupon-discount',
  base: 'main',
  headSha: 'b7c1d9e4f2a8',
  body: 'Adds applyDiscount() for coupon codes, with unit tests.',
  commitSha: 'b7c1d9e4f2a8',
  commitMessage: 'feat(billing): add applyDiscount with tests',
  files: [
    {
      path: 'src/billing/discount.ts',
      additions: 14,
      deletions: 0,
      patch: `@@ -0,0 +1,14 @@
+/** Apply a percentage discount to an amount in minor units. */
+export function applyDiscount(amount: number, pct: number): number {
+  if (pct > 100) {
+    throw new RangeError('discount percentage cannot exceed 100');
+  }
+
+  if (amount === 0) {
+    return 0;
+  }
+
+  const discounted = amount - Math.round((amount * pct) / 100);
+
+  return discounted;
+}`,
    },
    {
      path: 'src/billing/discount.test.ts',
      additions: 7,
      deletions: 0,
      patch: `@@ -0,0 +1,7 @@
+import { describe, it, expect } from 'vitest';
+import { applyDiscount } from './discount';
+
+describe('applyDiscount', () => {
+  it('applies a percentage discount', () => {
+    expect(applyDiscount(100, 10)).toBe(90);
+  });
+});`,
    },
  ],
};

/** PR #484 — a breaking rename plus a removed response field. */
export const PR_484_CONTRACT: FixturePr = {
  number: 484,
  title: 'Tighten /v1/payments query params',
  author: 'dev.ivanov',
  branch: 'chore/payments-params',
  base: 'main',
  headSha: 'c3a5b8d1e7f0',
  body: 'Renames the customer query param to camelCase and drops the legacy reference field.',
  commitSha: 'c3a5b8d1e7f0',
  commitMessage: 'chore(api): camelCase query params on /v1/payments',
  files: [
    {
      path: 'src/api/payments.ts',
      additions: 6,
      deletions: 7,
      patch: `@@ -12,17 +12,16 @@ import { listPayments } from '../services/payments';
 const ListQuery = z.object({
-  customer_id: z.string().uuid(),
+  customerId: z.string().uuid(),
   limit: z.coerce.number().int().max(100).default(25),
 });

 app.get('/v1/payments', { schema: { querystring: ListQuery } }, async (req) => {
-  const rows = await listPayments(req.query.customer_id, req.query.limit);
+  const rows = await listPayments(req.query.customerId, req.query.limit);

   return rows.map((r) => ({
     id: r.id,
     amount: r.amount,
     currency: r.currency,
-    legacy_reference: r.legacyReference,
     created_at: r.createdAt.toISOString(),
   }));
 });`,
    },
  ],
};

/**
 * Stored patches for the two demo-PR #482 files the eval seed cases build on
 * (SPEC-04 AC-64). The rest of #482 stays patch-less. `src/config.ts` carries the
 * `sk_live_` literal on new-side line 12; `src/api/users.ts` adds new-side lines
 * 45–51 (the N+1 loop) and removes 2 lines — matching the counts in `seed.ts`.
 */
export const PR_482_PATCHES: Record<'src/config.ts' | 'src/api/users.ts', string> = {
  'src/config.ts': `@@ -8,3 +8,7 @@ export const config = {
   port: Number(process.env.PORT ?? 3000),
   env: process.env.NODE_ENV ?? 'development',
+  // Public API rate limiting + billing credentials
+  rateLimitMax: 100,
+  stripeSecretKey: 'sk_live_51H_EXAMPLE_DO_NOT_USE_0000',
+  rateLimitWindowMs: 60_000,
 };`,
  'src/api/users.ts': `@@ -43,5 +43,10 @@ export async function listUsers(req: Request) {
   const users = await db.select().from(usersTable).limit(limit);
   const result = [];
-  const memberships = await loadMemberships(users);
-  return users.map((u) => ({ ...u, memberships: memberships[u.id] }));
+  // one memberships query and one plan lookup per user
+  for (const u of users) {
+    const memberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, u.id));
+    const plan = await loadPlan(u.accountId);
+    result.push({ ...u, memberships, plan });
+  }
+  return result;
 }`,
};

export const FIXTURE_PRS: FixturePr[] = [PR_483_DISCOUNT, PR_484_CONTRACT];

/**
 * Cached PR Brief for seeded PR #482 (SPEC-03). Built on the seeded facts: the
 * head SHA, the seven changed files and the sample review's two findings. The
 * hermetic seed has no repo-intel index, so `no_data` is the honest blast state.
 */
export const PR_482_BRIEF: PrBrief = {
  summary:
    'Adds token-bucket rate limiting to the public API endpoints to stop abuse from unauthenticated clients. The limiter is wired in through a new middleware and a config entry, but a live Stripe secret key is committed in plaintext and the user-list endpoint now issues one query per user.',
  intent: null,
  blast: {
    changed_symbols: [],
    downstream: [],
    summary: '0 symbols · 0 callers · 0 endpoints · 0 crons',
    degraded: true,
    reason: 'no_data',
  },
  risks: {
    risks: [
      {
        kind: 'security',
        title: 'Hardcoded Stripe secret key',
        explanation:
          'A literal live secret key is committed in the config. Anyone with read access to the repository can use it, so it must be rotated and moved to an environment variable.',
        severity: 'high',
        file_refs: ['src/config.ts:12'],
      },
      {
        kind: 'performance',
        title: 'N+1 query in the user list endpoint',
        explanation:
          'The handler issues one query per user. Under the new limiter this multiplies database load for every allowed request.',
        severity: 'medium',
        file_refs: ['src/api/users.ts:45-52'],
      },
      {
        kind: 'correctness',
        title: 'Limiter behaviour is untested',
        explanation:
          'The token-bucket middleware has no test for refill timing or for bursts at the limit, so regressions would go unnoticed.',
        severity: 'low',
        file_refs: ['src/middleware/ratelimit.ts'],
      },
    ],
  },
  history: { history: [] },
  review_focus: [
    { file: 'src/config.ts', line: 12, reason: 'Committed live Stripe secret key' },
    { file: 'src/api/users.ts', line: 45, reason: 'Per-user query loop (N+1) under the new limiter' },
    { file: 'src/middleware/ratelimit.ts', line: 1, reason: 'Core of the change: token-bucket refill and limits' },
  ],
  missing: [
    { source: 'intent', reason: 'no intent derived for this PR' },
    { source: 'blast', reason: 'blast radius degraded (no_data)' },
    { source: 'specs', reason: 'no project context documents attached' },
  ],
  head_sha: 'a1b2c3d4e5f6',
  generated_at: '2026-09-24T09:00:00.000Z',
  model: 'seed',
  cost_usd: null,
  tokens_in: null,
  tokens_out: null,
};
