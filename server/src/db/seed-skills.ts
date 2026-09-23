import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSkillMarkdown } from '../modules/skills/helpers.js';

/**
 * Built-in skill catalogue used by the seed (L02) — bodies, descriptions and
 * the agents each skill is attached to. `seed.ts` only writes what is here.
 *
 * A skill carries the RUBRIC; the agent prompt carries only the role, the
 * severity scale and the output discipline (see `docs/agent-prompts/README.md`).
 * That split is deliberate: it is what makes the difference between a run with
 * skills and a run without them visible instead of cosmetic. Do not "improve" a
 * reviewer by moving these rules back into its system prompt.
 *
 * Every body here carries an explicit ❌ Bad / ✅ Good pair. A rubric stated only
 * as prose gets applied by analogy; a pair pins the boundary, which is the part
 * models actually get wrong (they flag additive changes as breaking).
 *
 * Note that `no-over-mocking` is deliberately NOT a constant here — it ships as
 * `docs/skills-samples/no-over-mocking.md` and the seed runs it through the same
 * parser as the import endpoint (see `readSkillSample`), so at least one seeded
 * skill really has provenance `imported_file` instead of claiming it.
 */

export const TEST_COVERAGE_RUBRIC = `# Test coverage rubric

Judge the changed code by its *branches*, not by its line count.

## The rule
Enumerate every decision point in the code under test:
- every \`if\` and \`else\` / \`else if\`
- every early \`return\` or \`continue\` guard
- every \`catch\` and every explicit \`throw\`
- every \`switch\` case, including the default
- every short-circuit (\`??\`, \`||\`, \`&&\`) that changes the result
- every loop that can run zero times

A branch is covered only when an assertion would FAIL if that branch misbehaved.
Executing a branch without asserting on its effect is not coverage.

## What to report
Report a finding when a test exercises only the success path of a function that
has at least one other branch — this is the single most common gap, and it is
always worth the author's time.

Every finding MUST contain:
1. The exact branch that is unobserved, quoted from the diff with its line.
2. A concrete input that reaches it (e.g. "\`applyDiscount(100, 150)\`").
3. What the test should assert once it does.

A finding that says "add more tests" without those three parts is not actionable
— do not report it.

## Severity
- An unguarded error or failure path → **CRITICAL**.
- An unguarded ordinary branch → **WARNING**.
- A branch that is unreachable in practice → **SUGGESTION**, or skip it.`;

export const EDGE_CASE_CHECKLIST = `# Edge case checklist

Walk this list against the code changed in the diff. For each item, decide
whether that input or state is REACHABLE in the changed code. Ignore the ones
that are not — an impossible case is not a finding.

## Inputs
- Empty: empty string, empty array, empty object, no rows.
- Absent: \`null\`, \`undefined\`, a missing optional property.
- Zero, and negative where only positive was imagined.
- Boundaries: minimum, maximum, and exactly one past each. Percentages above 100,
  indices at \`length\`, dates at a month or year edge.
- Very large: input big enough to change the algorithm's behaviour or cost.
- Duplicates, and the same item submitted twice.
- Unicode and whitespace where the code assumes plain ASCII or a trimmed value.

## State
- The operation running twice (is it idempotent?).
- Two operations interleaving on the same record.
- A dependency returning an error or an empty result rather than data.

## What to report
One finding per reachable, untested case. State the case, the input that produces
it, and the behaviour the code currently has for it (including "it is not
defined" — an undefined behaviour at a boundary is itself the finding).

Do not list cases you checked and found covered; \`summary\` is the place for that.`;

export const FLAKY_TEST_SMELLS = `# Flaky test smells

A test that fails at random is worse than no test: it trains the team to re-run
CI until it passes, and it hides the real failure when it comes.

## Smells to flag
- **Wall-clock time** — asserting on \`new Date()\` / \`Date.now()\` without freezing
  it; comparing timestamps for equality; assuming an operation takes under N ms.
- **Randomness** — \`Math.random()\`, uuids, or faker data used in an assertion
  without a fixed seed.
- **Ordering** — asserting on the order of an unordered source: object keys, a
  \`Set\`, a DB query with no \`ORDER BY\`, \`Promise.all\` results treated as
  chronological.
- **Real I/O** — a test that hits the network, the real filesystem, or a shared
  database it does not own and clean up.
- **Shared mutable state** — a fixture, module-level variable or singleton mutated
  by one test and read by another; a test that passes alone and fails in the suite.
- **Sleeps** — \`setTimeout\` / arbitrary waits standing in for a condition. Wait for
  the condition, not for a duration.
- **Leaks** — timers, subscriptions, connections or spies not restored, so failures
  surface in an unrelated test.

## What to report
Name the smell, quote the line, and give the deterministic replacement (inject a
clock, seed the generator, sort before comparing, poll for the condition).

## Severity
A test whose outcome can differ between two runs of the same code is **CRITICAL**
— it will fail CI at random. A test that is merely order-dependent within its own
file is a **WARNING**.`;

export const BREAKING_CHANGE = `# Breaking change detection

Decide, for each changed route, whether a client that worked yesterday still
works today. That is the whole question — not whether the change is an
improvement.

## Breaking — always CRITICAL
- Renaming or removing a **required** request parameter, body field or header.
  A rename is a removal plus an addition: the old name stops working.
- Making a previously optional parameter required.
- Narrowing an input type: string → enum, number → positive integer, raising a
  minimum, lowering a maximum, adding a regex to an existing free-text field.
- Tightening validation on input that was previously accepted.
- Changing a status code for an existing outcome, or the error body's shape.
- Changing a route's path or method.

## Not breaking — do NOT report these as breakage
- Adding a new **optional** request parameter.
- Adding a new route, or a new status code for a genuinely new outcome.
- Loosening validation: a wider type, a higher maximum, a dropped regex.
- Any internal refactor that leaves the wire format identical.

## Examples

### ❌ Bad — an existing client's request stops validating
\`\`\`ts
// before
const ListQuery = z.object({ customer_id: z.string(), limit: z.number().optional() });
// after
const ListQuery = z.object({ customerId: z.string().uuid(), limit: z.number() });
\`\`\`
Three breaks in two lines: \`customer_id\` is gone, \`customerId\` is narrowed to a
uuid, and \`limit\` became required. Every call in flight during the deploy 400s.

### ✅ Good — additive, old requests keep working
\`\`\`ts
const ListQuery = z.object({
  customer_id: z.string(),                 // kept, still accepted
  customerId: z.string().optional(),       // new spelling, optional for now
  limit: z.number().optional(),
  cursor: z.string().optional(),           // new optional parameter
});
\`\`\`

## Required output
Every breaking finding MUST state:
1. What an existing client sends **today**.
2. What it receives **after** this change.
3. A concrete migration in \`suggestion\` — accept both names for a release,
   version the route, or deprecate first and remove later.

## Rolling deploys
Both versions serve traffic during a deploy. A change that is only safe once every
client has updated is still breaking; say so explicitly in the rationale.`;

export const RESPONSE_SCHEMA = `# Response schema rules

The response body is a contract in the other direction: the client *reads* it.
Removing or renaming a field breaks it; adding the wrong one leaks data.

## Rules
- Removing a response field, or renaming one, is **CRITICAL** — the client reads
  \`undefined\` and usually fails silently, downstream of the request that
  succeeded.
- Changing a field's type or its encoding is breaking even when the name is
  stable: number → string, epoch seconds → ISO 8601, a scalar becoming an object,
  \`null\` newly possible on a field that was always present.
- Nullability counts. Making a non-null field nullable breaks every client that
  did not guard.
- A field must be serialised from an explicit response schema, never by spreading
  a database row. A spread turns "we added a column" into "we shipped a new
  public field" — and that is how password hashes, internal ids and PII reach the
  wire without anyone deciding to publish them.
- Adding a field is compatible, but a field carrying internal or personal data is
  a leak regardless of compatibility: report it as **CRITICAL** on those grounds,
  not as breakage.

## Examples

### ❌ Bad — the row is the response
\`\`\`ts
const user = await repo.findById(id);
return { ...user };          // email_hash, internal_notes, stripe_customer_id…
\`\`\`
Whatever the next migration adds to the table becomes public API, and nothing in
the diff will say so.

### ✅ Good — an explicit, reviewable projection
\`\`\`ts
const user = await repo.findById(id);
return { id: user.id, name: user.name, created_at: user.createdAt.toISOString() };
\`\`\`

## What to report
Name the field, quote the line, and say what the client that reads it does now
(reads \`undefined\`, parses the wrong type, receives data it should not have).`;

export const SEMVER_DISCIPLINE = `# Semver discipline for HTTP APIs

A breaking change is not forbidden — shipping it in place, on the same version,
is. Check that the diff puts the change where clients can opt into it.

## The rule
- Breaking change → a new version of the surface: a new path (\`/v2/...\`), a
  version header, or a new route beside the old one. The previous version keeps
  serving until its deprecation window closes.
- Additive change → same version. Do not let an author version a route for a new
  optional field; a needless \`/v2\` splits the traffic and doubles the code with
  nothing gained.
- A version bump is not a migration on its own. If \`/v1\` is deleted in the same
  diff that adds \`/v2\`, that is still a break — the old clients are still on
  \`/v1\`.
- Package \`version\` fields, changelog entries and OpenAPI \`info.version\` must move
  with the wire change. A major wire change under a patch bump is a **WARNING**:
  consumers pinning a range will pull it in unannounced.

## Examples

### ❌ Bad — breaking edit in place
\`\`\`ts
// routes/v1/payments.ts — same path, different contract
- app.get('/v1/payments', { schema: { response: PaymentV1 } }, listPayments);
+ app.get('/v1/payments', { schema: { response: PaymentV2 } }, listPayments);
\`\`\`

### ✅ Good — both versions serve traffic
\`\`\`ts
app.get('/v1/payments', { schema: { response: PaymentV1 } }, listPaymentsV1); // deprecated 2026-06-01
app.get('/v2/payments', { schema: { response: PaymentV2 } }, listPaymentsV2);
\`\`\`

## Severity
- Breaking change shipped on the existing version → **CRITICAL**.
- Old version removed in the same diff that introduces the new one → **CRITICAL**.
- Wire change without the matching version/changelog bump → **WARNING**.
- A new version created for a purely additive change → **SUGGESTION**.`;

export const DEPRECATION_POLICY = `# Deprecation policy

How a field or route is retired. Removal is the last step, never the first one in
the diff that announces it.

## The required sequence
1. **Announce** — mark the field or route deprecated in the schema/OpenAPI
   description and the changelog, with the replacement named.
2. **Signal at runtime** — respond with \`Deprecation\` and \`Sunset\` headers (RFC
   8594) or the project's equivalent, so clients learn from traffic and not from
   release notes they did not read.
3. **Keep serving** — the old field or route stays, unchanged, for the whole
   announced window.
4. **Remove** — only after the sunset date, in a separate change.

A diff that deletes a field is reviewable only against evidence that steps 1–3
already happened. If the diff itself introduces the deprecation AND the removal,
that is a **CRITICAL** breaking change, not a deprecation.

## Rules
- A deprecation with no replacement named and no sunset date is a **WARNING**:
  clients cannot act on it.
- Deprecated ≠ optional. Do not let a deprecated required parameter become
  optional-but-still-required-in-practice; keep it working exactly as before.
- Silent removal — field gone, nothing in the description, changelog or headers —
  is **CRITICAL** even when the field looks unused. You cannot see the clients.

## Examples

### ❌ Bad — announced and removed in one change
\`\`\`ts
return {
  id: r.id,
  amount: r.amount,
-  legacy_reference: r.legacyReference,   // "deprecated, nobody uses it"
};
\`\`\`

### ✅ Good — announced now, removed after the window
\`\`\`ts
reply.header('Deprecation', 'true');
reply.header('Sunset', 'Wed, 01 Jul 2026 00:00:00 GMT'); // use \`reference\` instead
return {
  id: r.id,
  amount: r.amount,
  legacy_reference: r.legacyReference,   // still served until the sunset date
  reference: r.reference,                // replacement, available today
};
\`\`\`

## What to report
State which step of the sequence is missing, and give the concrete next step in
\`suggestion\` (add the header, name the replacement, split the removal into a
follow-up PR).`;

// ---- imported sample ------------------------------------------------------

/** Filename of the sample that is seeded through the import parser, not inline. */
export const NO_OVER_MOCKING_SAMPLE = 'no-over-mocking.md';

/**
 * Read a sample skill markdown file from `docs/skills-samples/`.
 *
 * Resolved from `import.meta.url` rather than `process.cwd()`: the seed runs
 * both as `pnpm db:seed` from `server/` and from `scripts/dev.sh` at the repo
 * root, and a cwd-relative path silently resolves to a different file (or none)
 * depending on which one started it.
 */
export function readSkillSample(filename: string): string {
  const path = fileURLToPath(new URL(`../../../docs/skills-samples/${filename}`, import.meta.url));

  return readFileSync(path, 'utf8');
}

// ---- catalogue ------------------------------------------------------------

/** One built-in skill and the agents it is attached to, in prompt order. */
export interface SeedSkill {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
  /** Provenance. Defaults to `manual`; the sample import sets `imported_file`. */
  source?: 'manual' | 'imported_url' | 'imported_file' | 'extracted' | 'community';
  /** agent name → position in that agent's `## Skills / rules` section. */
  attachTo: Array<{ agent: string; order: number }>;
}

/**
 * Skills an earlier seed created and that a later one split or renamed.
 * The seed deletes them by name, which keeps an already-seeded dev database in
 * step with this file: `api-contract-rules` would otherwise stay attached at
 * order 0 and the agent would carry both the old omnibus rubric and the four
 * skills that replaced it. `agent_skills` and `skill_versions` cascade.
 */
export const RETIRED_SKILL_NAMES = ['api-contract-rules'];

/**
 * The one seeded skill whose body is NOT a constant above: the sample markdown
 * is read off disk and pushed through `parseSkillMarkdown` — the exact parser
 * behind `POST /skills/import` — so its provenance really is `imported_file`.
 *
 * Do not "simplify" this by inlining the body: the point is that the import path
 * runs on every seed, so a parser regression breaks the seed instead of quietly
 * producing a different skill than the UI would.
 */
function importedSampleSkill(): SeedSkill {
  const draft = parseSkillMarkdown(readSkillSample(NO_OVER_MOCKING_SAMPLE), NO_OVER_MOCKING_SAMPLE);

  return {
    name: draft.name,
    description: draft.description,
    type: draft.type,
    body: draft.body,
    source: 'imported_file',
    attachTo: [{ agent: 'Test Quality Reviewer', order: 3 }],
  };
}

/**
 * Every built-in skill, in the order the seed writes it.
 *
 * The API Contract Reviewer gets four narrow skills rather than one omnibus
 * rubric: attached one per concern, each can be switched off on its own and the
 * Run Trace names the one that produced a finding — with a single skill, "the
 * rubric fired" is all you ever learn.
 *
 * A function, not a constant: `importedSampleSkill` reads a file, and doing that
 * at module load would make importing this catalogue fail in any context where
 * the repo's docs are not on disk.
 */
export function buildSeedSkills(): SeedSkill[] {
  return [
    {
      name: 'test-coverage-rubric',
      description:
        'Require a test case for every branch in the code under test; flag happy-path-only tests.',
      type: 'rubric',
      body: TEST_COVERAGE_RUBRIC,
      attachTo: [{ agent: 'Test Quality Reviewer', order: 0 }],
    },
    {
      name: 'edge-case-checklist',
      description: 'Check the changed code against empty, null, zero, negative and boundary inputs.',
      type: 'rubric',
      body: EDGE_CASE_CHECKLIST,
      attachTo: [{ agent: 'Test Quality Reviewer', order: 1 }],
    },
    {
      name: 'flaky-test-smells',
      description: 'Flag tests whose result can change between two runs of the same code.',
      type: 'rubric',
      body: FLAKY_TEST_SMELLS,
      attachTo: [{ agent: 'Test Quality Reviewer', order: 2 }],
    },
    {
      name: 'breaking-change',
      description:
        'Classify each changed route as breaking or additive, and require a concrete migration for every break.',
      type: 'convention',
      body: BREAKING_CHANGE,
      attachTo: [{ agent: 'API Contract Reviewer', order: 0 }],
    },
    {
      // `security`, not `convention`: half this rubric is about what must NOT
      // reach a response body — internal ids and PII spread from a DB row.
      name: 'response-schema',
      description:
        'Flag removed, renamed or retyped response fields, and response bodies spread from a database row.',
      type: 'security',
      body: RESPONSE_SCHEMA,
      attachTo: [{ agent: 'API Contract Reviewer', order: 1 }],
    },
    {
      name: 'semver-discipline',
      description:
        'Require a breaking change to ship as a new API version beside the old one, with a matching version bump.',
      type: 'convention',
      body: SEMVER_DISCIPLINE,
      attachTo: [{ agent: 'API Contract Reviewer', order: 2 }],
    },
    {
      name: 'deprecation-policy',
      description:
        'Require announce → signal → keep serving → remove before any field or route disappears.',
      type: 'convention',
      body: DEPRECATION_POLICY,
      attachTo: [{ agent: 'API Contract Reviewer', order: 3 }],
    },
    importedSampleSkill(),
  ];
}
