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

export const FIXTURE_PRS: FixturePr[] = [PR_483_DISCOUNT, PR_484_CONTRACT];
