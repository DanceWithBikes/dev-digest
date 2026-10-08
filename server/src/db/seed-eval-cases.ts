/**
 * SPEC-04 — seed data for the Security Reviewer's eval set: 8 cases (AC-66) and
 * the stored per-case outputs of 2 scored batches (AC-69).
 *
 * Pure data, no DB: `seed.ts` writes it, `test/seed-eval-cases.test.ts` checks
 * it. Every diff is built with `fileDiff(path, patch)` because a stored patch has
 * no `--- a/` / `+++ b/` header and would parse to 0 files (server/docs/insights.md).
 * Batch counts and metrics are NOT stored here — they are computed by the scorers
 * from the outputs below, so they cannot drift from the scorer.
 */

import { fileDiff } from '@devdigest/reviewer-core';
import type { EvalExpectation, EvalCaseMeta, Finding } from '@devdigest/shared';
import { PR_482_PATCHES, PR_483_DISCOUNT, PR_484_CONTRACT } from './seed-fixtures.js';

export interface SeedEvalCase {
  name: string;
  inputDiff: string;
  inputMeta: EvalCaseMeta;
  expectations: EvalExpectation[];
  notes: string;
}

const PR_482_META: EvalCaseMeta = {
  title: 'Add rate limiting to public API endpoints',
  body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
};

const mustFind = (
  file: string,
  start_line: number,
  end_line: number,
  title: string,
  category: string,
  severity = 'CRITICAL',
): EvalExpectation => ({ kind: 'must_find', file, start_line, end_line, title, severity, category });

const mustNotFlag = (
  file: string,
  start_line: number,
  end_line: number,
  title: string,
  category: string,
): EvalExpectation => ({
  kind: 'must_not_flag',
  file,
  start_line,
  end_line,
  title,
  severity: 'WARNING',
  category,
});

/** Patch of a fixture PR file by path (throws on a typo instead of seeding an empty diff). */
function fixturePatch(pr: typeof PR_483_DISCOUNT, path: string): string {
  const f = pr.files.find((x) => x.path === path);
  if (!f) throw new Error(`fixture ${pr.number} has no file ${path}`);
  return f.patch;
}

const WEBHOOKS_PATCH = `@@ -57,4 +57,10 @@ router.post('/webhooks/forward', async (req, res) => {
   const { url, payload } = req.body;
   const target = String(url);
   const started = Date.now();
+  const response = await fetch(target, {
+    method: 'POST',
+    headers: { 'content-type': 'application/json' },
+    body: JSON.stringify(payload),
+  });
+  const result = await response.text();
   res.json({ ok: true, ms: Date.now() - started });`;

const ADMIN_SEARCH_PATCH = `@@ -0,0 +1,8 @@
+import { db } from './client';
+
+export async function searchUsers(term: string) {
+  // admin-only user search
+  const sql = "SELECT id, email FROM users WHERE email LIKE '%" + term + "%'";
+  const rows = await db.query(sql);
+  return rows;
+}`;

const SESSION_TOKEN_PATCH = `@@ -0,0 +1,9 @@
+import jwt from 'jsonwebtoken';
+
+const SECRET = 'dev-secret-123';
+export function sign(userId: string) {
+  return jwt.sign({ sub: userId }, SECRET);
+}
+export function verify(token: string) {
+  return jwt.verify(token, SECRET, { algorithms: ['none', 'HS256'] });
+}`;

const FILES_PATCH = `@@ -0,0 +1,9 @@
+import fs from 'node:fs/promises';
+import path from 'node:path';
+
+const ROOT = '/srv/uploads';
+
+export async function readUpload(name: string) {
+  const full = path.join(ROOT, name);
+  return fs.readFile(full, 'utf8');
+}`;

export const SEED_EVAL_CASES: SeedEvalCase[] = [
  {
    name: 'Hardcoded Stripe secret key in config',
    inputDiff: fileDiff('src/config.ts', PR_482_PATCHES['src/config.ts']),
    inputMeta: PR_482_META,
    expectations: [
      mustFind('src/config.ts', 12, 12, 'Hardcoded Stripe secret key', 'security'),
    ],
    notes: 'Seeded from the demo PR #482: a live `sk_live_` key committed on line 12.',
  },
  {
    name: 'SSRF in the webhook forwarder',
    inputDiff: fileDiff('src/api/public/webhooks.ts', WEBHOOKS_PATCH),
    inputMeta: PR_482_META,
    expectations: [
      mustFind('src/api/public/webhooks.ts', 60, 65, 'SSRF via customer-supplied webhook URL', 'security'),
    ],
    notes: 'The handler fetches a URL taken straight from the request body.',
  },
  {
    name: 'SQL injection in admin search',
    inputDiff: fileDiff('src/db/admin-search.ts', ADMIN_SEARCH_PATCH),
    inputMeta: { title: 'Add admin user search', body: 'Adds a search helper for the admin console.' },
    expectations: [
      mustFind('src/db/admin-search.ts', 5, 7, 'SQL injection via string-built query', 'security'),
    ],
    notes: 'User input is concatenated into the SQL text.',
  },
  {
    name: 'Hardcoded JWT secret and none algorithm',
    inputDiff: fileDiff('src/auth/session-token.ts', SESSION_TOKEN_PATCH),
    inputMeta: { title: 'Add session tokens', body: 'Signs and verifies session JWTs.' },
    expectations: [
      mustFind('src/auth/session-token.ts', 3, 3, 'Hardcoded JWT secret', 'security'),
      mustFind('src/auth/session-token.ts', 8, 8, 'JWT verification accepts the none algorithm', 'security'),
    ],
    notes: 'Two expectations in one case: a recall of 1/2 is a failing case.',
  },
  {
    name: 'Path traversal in upload reader',
    inputDiff: fileDiff('src/api/files.ts', FILES_PATCH),
    inputMeta: { title: 'Serve uploaded files', body: 'Reads an uploaded file by name.' },
    expectations: [
      mustFind('src/api/files.ts', 7, 8, 'Path traversal through the file name', 'security'),
    ],
    notes: 'The name is joined onto the upload root without normalising `..`.',
  },
  {
    name: 'N+1 query is not a security finding',
    inputDiff: fileDiff('src/api/users.ts', PR_482_PATCHES['src/api/users.ts']),
    inputMeta: PR_482_META,
    expectations: [
      mustNotFlag('src/api/users.ts', 45, 52, 'N+1 query in user list endpoint', 'perf'),
    ],
    notes: 'A real performance issue, but out of scope for a security reviewer.',
  },
  {
    name: 'Discount arithmetic is not a security finding',
    inputDiff: fileDiff('src/billing/discount.ts', fixturePatch(PR_483_DISCOUNT, 'src/billing/discount.ts')),
    inputMeta: { title: PR_483_DISCOUNT.title, body: PR_483_DISCOUNT.body },
    expectations: [
      mustNotFlag('src/billing/discount.ts', 1, 14, 'Discount arithmetic', 'bug'),
    ],
    notes: 'Fixture PR #483: plain business logic, nothing exploitable.',
  },
  {
    name: 'Query param rename is not a security finding',
    inputDiff: fileDiff('src/api/payments.ts', fixturePatch(PR_484_CONTRACT, 'src/api/payments.ts')),
    inputMeta: { title: PR_484_CONTRACT.title, body: PR_484_CONTRACT.body },
    expectations: [
      mustNotFlag('src/api/payments.ts', 12, 27, 'Query parameter rename', 'style'),
    ],
    notes: 'Fixture PR #484: a breaking contract change, not a vulnerability.',
  },
];

// ===========================================================================
// Scored batches
// ===========================================================================

/** What the engine "produced" for one case: the findings kept and dropped. */
export interface SeedCaseOutput {
  caseName: string;
  kept: Finding[];
  dropped: Finding[];
}

export interface SeedBatchDef {
  /** Days before the seed run the batch is dated. */
  daysAgo: number;
  durationMs: number;
  /** Maps the stored current prompt to the snapshot this batch carries. */
  promptSnapshot: (current: string) => string;
  outputs: SeedCaseOutput[];
}

function finding(
  id: string,
  file: string,
  start_line: number,
  end_line: number,
  title: string,
  category: Finding['category'] = 'security',
  severity: Finding['severity'] = 'CRITICAL',
): Finding {
  return {
    id,
    severity,
    category,
    title,
    file,
    start_line,
    end_line,
    rationale: `${title}.`,
    suggestion: null,
    confidence: 0.9,
  };
}

const [C_STRIPE, C_SSRF, C_SQLI, C_JWT, C_PATH, C_N1, C_DISCOUNT, C_PAYMENTS] = SEED_EVAL_CASES.map(
  (c) => c.name,
) as [string, string, string, string, string, string, string, string];

/** The current prompt without its last paragraph (the "Findings discipline" section). */
const dropLastParagraph = (prompt: string): string => {
  const paras = prompt.split('\n\n');
  return paras.length > 1 ? paras.slice(0, -1).join('\n\n') : prompt;
};

/**
 * Older batch, run with a looser prompt: it misses the SSRF and the path
 * traversal, finds only half of the JWT case, and flags the N+1 query as noise.
 */
const OLDER_BATCH: SeedBatchDef = {
  daysAgo: 2,
  durationMs: 41_200,
  promptSnapshot: dropLastParagraph,
  outputs: [
    {
      caseName: C_STRIPE,
      kept: [finding('seed-a-1', 'src/config.ts', 12, 12, 'Hardcoded Stripe secret key')],
      dropped: [],
    },
    {
      caseName: C_SSRF,
      kept: [],
      dropped: [finding('seed-a-2', 'src/api/public/webhooks.ts', 140, 142, 'Unvalidated webhook target')],
    },
    {
      caseName: C_SQLI,
      kept: [finding('seed-a-3', 'src/db/admin-search.ts', 5, 6, 'SQL injection via string-built query')],
      dropped: [],
    },
    {
      caseName: C_JWT,
      kept: [finding('seed-a-4', 'src/auth/session-token.ts', 3, 3, 'Hardcoded JWT secret')],
      dropped: [finding('seed-a-5', 'src/auth/session-token.ts', 30, 31, 'Token never expires')],
    },
    { caseName: C_PATH, kept: [], dropped: [] },
    {
      caseName: C_N1,
      kept: [finding('seed-a-6', 'src/api/users.ts', 45, 50, 'N+1 query in user list endpoint', 'perf', 'WARNING')],
      dropped: [],
    },
    { caseName: C_DISCOUNT, kept: [], dropped: [] },
    { caseName: C_PAYMENTS, kept: [], dropped: [] },
  ],
};

/**
 * Newer batch, run with the current prompt: it finds everything but the path
 * traversal, and keeps one finding that matches nothing (not noise, not a hit).
 */
const NEWER_BATCH: SeedBatchDef = {
  daysAgo: 1,
  durationMs: 38_700,
  promptSnapshot: (current) => current,
  outputs: [
    {
      caseName: C_STRIPE,
      kept: [finding('seed-b-1', 'src/config.ts', 12, 12, 'Hardcoded Stripe secret key')],
      dropped: [],
    },
    {
      caseName: C_SSRF,
      kept: [finding('seed-b-2', 'src/api/public/webhooks.ts', 60, 64, 'SSRF via customer-supplied webhook URL')],
      dropped: [],
    },
    {
      caseName: C_SQLI,
      kept: [finding('seed-b-3', 'src/db/admin-search.ts', 5, 7, 'SQL injection via string-built query')],
      dropped: [],
    },
    {
      caseName: C_JWT,
      kept: [
        finding('seed-b-4', 'src/auth/session-token.ts', 3, 3, 'Hardcoded JWT secret'),
        finding('seed-b-5', 'src/auth/session-token.ts', 8, 8, 'JWT verification accepts the none algorithm'),
      ],
      dropped: [],
    },
    {
      caseName: C_PATH,
      kept: [finding('seed-b-6', 'src/api/files.ts', 1, 2, 'Unused import', 'style', 'SUGGESTION')],
      dropped: [finding('seed-b-7', 'src/api/files.ts', 40, 41, 'Missing size limit on upload read')],
    },
    { caseName: C_N1, kept: [], dropped: [] },
    { caseName: C_DISCOUNT, kept: [], dropped: [] },
    { caseName: C_PAYMENTS, kept: [], dropped: [] },
  ],
};

/** Chronological: older first. */
export const SEED_BATCHES: SeedBatchDef[] = [OLDER_BATCH, NEWER_BATCH];
