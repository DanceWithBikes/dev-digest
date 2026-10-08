# Implementation Plan: Eval Pipeline (SPEC-04)

## Goal

A repo owner can turn an accepted finding into a "must find" regression case, or a dismissed finding into a "must not flag" case, with one click. They can also write cases by hand. They run an agent over its whole case set with frozen inputs. Each run gets recall, precision and citation accuracy, computed in code with zero model calls. The studio shows the history, a trend chart, a side-by-side comparison of two runs with the prompt diff, and an Eval Dashboard across agents. A new root `pnpm verify` command proves the feature's checks are green. A real-model experiment at the end shows that a prompt change moves the metrics.

## Requirements

- Source: `docs/specs/eval-pipeline.md`, Spec ID SPEC-04, Status: approved. Parts (all approved): `server/src/modules/eval/docs/specs/eval-pipeline.md`, `server/docs/specs/eval-pipeline.md`, `reviewer-core/docs/specs/eval-pipeline.md`, `client/docs/specs/eval-pipeline.md`, `e2e/docs/specs/eval-pipeline.md`.
- Gate check (Step 1): every part is `Status: approved`; `grep "NEEDS CLARIFICATION"` returns nothing across all six files; OQ-1 to OQ-4 are all struck through and closed.
- Covered: AC-1 to AC-130 (130 ACs, numbered AC-1…AC-127 plus AC-128, AC-129, AC-130) and NFR-1 to NFR-11.
- Design input (not a requirement): `/Users/detrix/.claude/plans/prancy-wishing-firefly.md`. Its anchors were re-verified; the deviations are noted per step.

## Spec conflicts found while planning

- None. No `AC-N` depends on code that cannot support it. Some spec anchors have drifted, which is not a conflict. They are listed for `doc-writer` under Open questions.

## Recommendations

1. **Add a unique index on `eval_cases.source_finding_id` (nullable).**
   - **Why:** AC-33 (idempotent re-create) would otherwise rest on a check-then-insert in the service. Postgres UNIQUE allows many NULLs, so manual cases are unaffected (postgresql-table-design, "Unique + NULLs").
   - **Trade-off:** none for the product. A losing race surfaces as a unique violation, which the repository maps to "return the existing case".
   - **Affects:** AC-33; Step 4. Planned as part of Step 4, since it implements AC-33 rather than adding behaviour.
2. **Optionally add a partial unique index `eval_batches (agent_id) WHERE status = 'running'`.**
   - **Why:** the spec accepts the exact race between two `POST /agents/:id/eval-runs` (overview Edge cases, "Two `POST …` requests at almost the same time").
   - **Trade-off:** it closes the race for free, but it adds a second way to reach 409 `batch_running` (catching a unique violation).
   - **Affects:** AC-46; Step 4 / Step 9. **Not planned** unless the user accepts it.
3. **Order the batches as B1 = contracts + engine, not engine alone.**
   - **Why:** the scorers take `EvalExpectation`, and reviewer-core takes its contracts from `@devdigest/shared` (`reviewer-core/AGENTS.md:24`). The contract file has to exist before `score.ts` can type its input.
   - **Trade-off:** none. B2 shrinks to schema + seed.
   - **Affects:** Steps 1–3. **Planned this way.**
4. **Make the FindingCard self-contained instead of prop-wired.**
   - **Why:** the design wires `onTurnIntoEval` / `evalPending` / `evalHref` props through two parents, `FindingsPanel.tsx:91` and `DiffTab.tsx:91-97`. A `useTurnIntoEval` hook inside `FindingCard/` gives both surfaces the button with no parent changes (frontend-ui-architecture: stateful logic for one component lives in its folder).
   - **Trade-off:** the card gains a data dependency, so the FindingsPanel and DiffTab tests must `vi.mock` `lib/hooks/evals`.
   - **Affects:** AC-71 to AC-77; Step 18. **Planned this way.** Revert to props if the user prefers the design text.
5. **Plan the `backend-onion-architecture` skill eval separately.**
   - **Why:** the skill eval under `evals/skills/backend-onion-architecture/` is in the design's B8, but the spec lists it as a Non-goal and a separate artifact (overview, Non-goals and Touched packages).
   - **Trade-off:** none. It is excluded from this plan's steps.
   - **Affects:** none.

## Constraints that shape this plan

| Constraint | Source | What it forces |
|---|---|---|
| Modules may not import `src/adapters/**` | `server/.dependency-cruiser.cjs:67` | `parseUnifiedDiff` moves to `reviewer-core/src/diff/parse.ts`. `server/src/adapters/git/diff-parser.ts` becomes a re-export. The eval module parses via `@devdigest/reviewer-core`. |
| Only `repository.ts` touches drizzle / `src/db/**`, `import type` included | `server/.dependency-cruiser.cjs:40-48`, `server/src/modules/AGENTS.md:18` | Eval domain types live in `domain.ts`. Row types never leave `repository.ts`. Ports declare narrow structural shapes for review and agent data. |
| Services take ports, not the `Container` | `server/.dependency-cruiser.cjs:76-87`, `server/src/modules/AGENTS.md:19` | `EvalService` / `EvalBatchRunner` take a deps object. Only `compose.ts` and `routes.ts` see the container. |
| No cross-module imports | `server/.dependency-cruiser.cjs:120-128`, `server/src/modules/AGENTS.md:17` | Review and agent data come from `container.reviewRepo` (`findingContext` `server/src/modules/reviews/repository.ts:140`, `getPrFiles` `:42`) and `container.agentsRepo` (`getById` `server/src/modules/agents/repository.ts:65`, `linkedSkills` `:192`). `selectSkillBodies` (`server/src/modules/reviews/helpers.ts:31`) cannot be imported, so the eval module re-implements the 3-line `### name\nbody` / enabled-only mapping. |
| `domain-files-are-pure` matches exact filenames only | `server/.dependency-cruiser.cjs:105`, `server/docs/insights.md:105-108` | Pure code goes in `domain.ts` / `helpers.ts` / `constants.ts` / `ports.ts`, never in a prefixed file. The module stays flat. `runner.ts` is application ring, covered by the application rules. |
| Specific 409 codes need `AppError(code, msg, 409)` | `server/src/platform/errors.ts:7-17`, `:49-52`, `server/docs/insights.md:14` | `finding_undecided`, `no_agent`, `no_patch`, `no_eval_cases` and `batch_running` are thrown as `new AppError(<code>, message, 409)`, never `ConflictError`. |
| 422 for validation | `server/src/app.ts:116-127`, `server/src/platform/errors.ts:25-29` | Schema-level rules (AC-41, AC-128, AC-129) live in the route's zod body. Diff-dependent rules (AC-39, AC-40) throw `ValidationError` (code `validation_error`, 422) from the service. |
| A stored patch has no `--- a/` / `+++ b/` header and parses to 0 files | `server/docs/insights.md:16`, `server/src/adapters/git/diff-parser.ts:78` | One-click and seeded cases build their diff with `fileDiff(path, patch)` (AC-10, AC-26, AC-68). |
| reviewer-core purity is enforced only by the server's `arch:check`, and only for reached files | `reviewer-core/docs/insights.md:21`, `server/.dependency-cruiser.cjs:197-213` | Export `parse.ts` and `score.ts` from `reviewer-core/src/index.ts` and import them from the server (eval helpers, seed). |
| reviewer-core tests import server mocks, which import the parser | `reviewer-core/test/run.test.ts:3`, `server/src/adapters/mocks.ts:37`, `reviewer-core/vitest.config.ts` (no `@devdigest/reviewer-core` alias) | Once `diff-parser.ts` re-exports from `@devdigest/reviewer-core`, `reviewer-core`'s `npm test` cannot resolve it. Step 2 adds the alias `@devdigest/reviewer-core → ./src` to `reviewer-core/vitest.config.ts`. |
| A public API change can break the server typecheck | `reviewer-core/AGENTS.md:22`, `docs/insights.md:132` | Every B1 gate runs both packages. The server typecheck needs `reviewer-core/node_modules` (`npm ci` there). |
| Two `@devdigest/shared` copies, already drifting in 5 files | root `AGENTS.md:27`, `docs/insights.md:64` (`diff -rq` today shows `adapters.ts`, `eval-ci.ts`, `knowledge.ts`, `productionize.ts`, `trace.ts`) | The new `contracts/eval-pipeline.ts` must be byte-identical in both copies, and so must the barrel `index.ts` (identical today). The verify lane compares **these two files**, not the whole tree; a whole-tree `diff -r` fails today and AC-122 needs exit 0. `eval-pipeline.ts` imports only exports that are identical in both copies: `EvalCase` and `Provider` from `knowledge.ts`, `Finding` and `Severity` from `findings.ts`, `EvalRunRecord` from `eval-ci.ts`. |
| Client must never value-import `@devdigest/shared` | `client/docs/insights.md:50` | Client code uses `import type` only. Runtime constants such as the 200,000 cap are duplicated in `client/src/lib/eval-metrics.ts` or the editor's `constants.ts`. |
| Migrations are add-only, generated and never hand-edited | root `AGENTS.md:28,33`, `server/docs/insights.md:10` | One `pnpm db:generate` with only `CREATE TABLE` / `ADD COLUMN` / `CREATE INDEX`, then `pnpm db:migrate`. Never drop or rename in the same generate. |
| The seed is idempotent by name and never updates rows | `server/docs/insights.md:50` | The patch and agent backfills are explicit `UPDATE … WHERE patch IS NULL` / `WHERE agent_id IS NULL`. Cases are keyed by `(owner_id, name)` and batches by `(agent_id, model = 'seed')`. |
| `DiffHunk` holds line numbers, not text | `server/docs/insights.md:53` | The AC-67 test splits the raw diff for `+` lines (pattern: `server/test/seed-fixtures.test.ts`). |
| An IT test that starts a batch must override every reachable LLM | `server/docs/insights.md:125`, `:99`, `server/src/platform/container.ts:46-54` | `buildApp({ overrides: { llm: { openai: mock, anthropic: mock, openrouter: new MockLLMProvider('openai', …) } } })`. |
| The "no-DB" unit suite boots `buildApp` against the dev DB and runs boot reapers | `server/docs/insights.md:63` | The new eval reaper (AC-58) also fails any `running` dev batch whenever `routes-smoke.test.ts` runs. Do not run unit tests during the experiment (Risks). |
| Client boundaries: routes never import each other, `src/lib` never imports `src/app`, components through `index.ts`, UI only via `@devdigest/ui`, no baseline | `client/AGENTS.md:27-28`, `client/.dependency-cruiser.cjs:45,59,97`, `client/docs/insights.md:100` | Skill-diff helpers move to `src/lib/diff-text.ts` with a re-export left behind. Metric helpers go to `src/lib/eval-metrics.ts`. Test files are cruised too. |
| Copy only via `messages/en/*.json`; every component works in both themes | `client/AGENTS.md:25,29`, NFR-8 | Extend `client/messages/en/eval.json` and `prReview.json`. No literals in TSX. |
| `src/vendor/ui/**` is extended, never rewritten | `client/AGENTS.md:36` | `LineChart` gains optional `xLabels` / `renderTooltip`. `MetricCard` gains an optional `formatDelta`. Defaults stay unchanged. |
| A new route fails typecheck until Next generates its types | `client/docs/insights.md:117` | After Step 22, request `/eval` once under `pnpm dev`. `verify.sh` prints the hint (AC-121). |
| e2e: seeded data only, no LLM, deterministic locators | `e2e/AGENTS.md:15-17`, `e2e/docs/insights.md:21,24,30,33` | Flow 13 uses `--exact` locators and `wait --text` with uppercase metric labels. |
| No root `package.json` today; package managers differ | `ls /Users/detrix/Coding/AI_Neoversity/dev-digest` (no `package.json`, no `pnpm-workspace.yaml`), CLAUDE.md "No workspace" | The root `package.json` is scripts-only (no deps, no workspace). `verify.sh` uses `pnpm` for client/server and `npm` for reviewer-core. |
| A new module ships with its memory | root `AGENTS.md:25` | Step 7 creates `AGENTS.md`, the `CLAUDE.md` symlink and `docs/insights.md`. `docs/specs/` already exists with `.gitkeep`. |

## Touched packages / modules

| Package | Module | Ring / layer | Why it changes |
|---|---|---|---|
| server | `src/vendor/shared/contracts/eval-pipeline.ts` + `index.ts` | domain (contracts) | new eval-pipeline contracts (copy 1) |
| client | `src/vendor/shared/contracts/eval-pipeline.ts` + `index.ts` | contracts | byte-identical copy 2 |
| reviewer-core | `src/diff/parse.ts`, `src/eval/score.ts`, `src/index.ts`, `vitest.config.ts` | domain (pure engine) | parser move + `fileDiff`; scorers |
| server | `src/adapters/git/diff-parser.ts` | infrastructure | becomes a re-export of the engine parser |
| server | `src/db/schema/eval.ts`, `src/db/schema.ts`, `src/db/migrations/**` (generated) | infrastructure | `eval_batches`, new columns, indexes |
| server | `src/db/seed.ts`, `src/db/seed-fixtures.ts`, `src/db/seed-eval-cases.ts` (NEW) | infrastructure (seed) | #482 patches, review agent backfill, 8 cases, 2 batches |
| server | `src/modules/eval/**` (NEW) | all rings, flat module | one-click, CRUD, batches, history, overview, reaper |
| server | `src/modules/index.ts`, `src/app.ts` | composition root | register module; boot reaper |
| client | `src/lib/diff-text.ts`, `src/lib/eval-metrics.ts`, `src/lib/hooks/evals.ts`, `src/lib/hooks/index.ts` | shared lib / data access | diff helpers, metric helpers, query hooks |
| client | `src/app/skills/[id]/…/SkillVersionsTab/helpers.ts` | route | re-export moved helpers |
| client | `src/vendor/ui/charts/LineChart.tsx`, `MetricCard.tsx`, `src/vendor/ui/nav.ts` | design system | optional props; nav item + shortcut |
| client | `messages/en/eval.json`, `messages/en/prReview.json` | copy | new strings |
| client | `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**` | route component | "Turn into eval case" |
| client | `src/app/agents/[id]/**` (page, AgentEditor, `_components/EvalsTab/**`) | route | Evals tab, Case Editor, Compare |
| client | `src/app/eval/**` (NEW) | route | Eval Dashboard |
| e2e | `specs/13-eval-pipeline.flow.json` (NEW) | flow | AC-113 to AC-116 |
| repo root | `package.json` (NEW), `scripts/verify.sh` (NEW) | tooling | `pnpm verify`, `verify:l06`, `verify:it` |

## Steps

### Step 1 — Add the eval-pipeline contracts to both shared copies
- **Files:** `server/src/vendor/shared/contracts/eval-pipeline.ts` (NEW), `client/src/vendor/shared/contracts/eval-pipeline.ts` (NEW), `server/src/vendor/shared/index.ts`, `client/src/vendor/shared/index.ts`, `server/test/contracts.test.ts`
- **Change:**
  - Define these schemas: `EvalExpectationKind`, `EvalExpectation` (`file` min 1; `start_line`/`end_line` int ≥ 1; optional `title`, `severity`, `category` as `z.string()` so a legacy finding row never fails serialization), `EvalExpectedOutput` (`expectations` min 1), `EvalCaseMeta` (`title?`, `body?`), `EvalCaseSource`, `EvalCaseLastRun` (`pass`, `batch_id`), `EvalCaseRecord` (`EvalCase.extend` with the typed expected output, `created_at`, `created_from`, nullable `source_finding_id`, nullable `last_run`), `EvalCaseUpsert` (`name` min 1, `input_diff` max 200,000, `input_meta`, `expected_output: EvalExpectedOutput` with a refine that `start_line ≤ end_line` per expectation, `notes`), `EvalCaseFromFindingInput` (`agent_id` uuid optional), `EvalBatchStatus`, `EvalBatchSnapshot`, `EvalBatch` (all AC-4 fields), `EvalCaseActual`, `EvalBatchRun` (`EvalRunRecord.extend`), `EvalBatchDetail`, `EvalAgentSummary`, `EvalOverview`.
  - Write the server copy first, then `cp` it to the client and confirm with `diff`. Add one barrel line `export * from './contracts/eval-pipeline.js';` to both `index.ts` files.
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, NFR-7 (also the schema half of AC-41, AC-128, AC-129)
- **Skills:** zod, typescript-expert
- **Insights:** `docs/insights.md:64` (copies already drift; import only identical exports); `client/docs/insights.md:50` (client may `import type` only)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` and `diff server/src/vendor/shared/index.ts client/src/vendor/shared/index.ts` print nothing; `cd server && pnpm exec vitest run contracts` passes, including new parse/reject cases (empty `expectations`, `start_line` 0, 200,001-char diff); `cd client && pnpm typecheck` is green.

### Step 2 — Move the unified-diff parser into reviewer-core and add `fileDiff`
- **Files:** `reviewer-core/src/diff/parse.ts` (NEW), `reviewer-core/src/index.ts`, `reviewer-core/vitest.config.ts`, `server/src/adapters/git/diff-parser.ts`, `reviewer-core/test/diff-parse.test.ts` (NEW)
- **Change:**
  - Move `parseUnifiedDiff` verbatim from `server/src/adapters/git/diff-parser.ts:14-79` into `parse.ts`. Add `fileDiff(path, patch): string`, which prepends `--- a/<path>\n+++ b/<path>\n`.
  - Export both from `reviewer-core/src/index.ts`. Replace the server file body with `export { parseUnifiedDiff } from '@devdigest/reviewer-core';`. Its six importers stay untouched, and so does the baselined `reviews/diff-loader.ts → diff-parser.ts` edge (`.dependency-cruiser-known-violations.json:247`).
  - Add the `'@devdigest/reviewer-core': path.resolve(__dirname, 'src')` alias to `reviewer-core/vitest.config.ts`, so `test/run.test.ts → server mocks → diff-parser` keeps resolving.
  - Golden expectations in `diff-parse.test.ts` are captured from the HEAD parser: `git show HEAD:server/src/adapters/git/diff-parser.ts` into a throwaway file, run it on a corpus (git diff with `diff --git`, headerless `@@` patch, `/dev/null` add and delete, multi-file, "\ No newline" marker, the #483/#484 fixture patches), then delete the throwaway.
- **Satisfies:** AC-8, AC-9, AC-10
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `reviewer-core/docs/insights.md:8` (prove equivalence against HEAD, not against itself); `reviewer-core/docs/insights.md:21` (purity checked only when reached from server); `server/docs/insights.md:16` (headerless patch → 0 files)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd reviewer-core && npm test` passes, including `run.test.ts` and `diff-parse.test.ts`; `cd server && pnpm exec vitest run grounding seed-fixtures` passes unchanged (AC-9); `cd server && pnpm arch:check` reports no new violation.

### Step 3 — Write the pure scorers in reviewer-core
- **Files:** `reviewer-core/src/eval/score.ts` (NEW), `reviewer-core/src/index.ts`, `reviewer-core/test/eval-score.test.ts` (NEW)
- **Change:**
  - `rangesIntersect(aStart, aEnd, bStart, bEnd)` and `matchesExpectation(finding, expectation)` implement AC-11: exact file equality and inclusive intersection.
  - `scoreCase(expectations, kept: Finding[], droppedCount: number): CaseScore` returns the raw counts, `matched_expectations` (indices), `noise_finding_ids`, `pass` and per-case metrics via the shared ratio helper.
  - `scoreBatch(cases: (CaseScore | null)[]): BatchScore`: micro-average; `null` = an errored case, counted only in `cases_total`; fallback values of 1.
  - Imports are `import type` only, from `@devdigest/shared` (`Finding`, `EvalExpectation`). None of the AC-120 tokens appear.
- **Satisfies:** AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, NFR-2, NFR-3
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `reviewer-core/docs/insights.md:47` (citation accuracy inherits line-range-only grounding, a Non-goal); `reviewer-core/docs/insights.md:21`
- **Owner:** implementer
- **Depends on:** Step 1
- **Done when:** `cd reviewer-core && npm test` passes these cases: AC-20's exact three-case fixture (recall 0.5, precision 2/3 via `toBeCloseTo`, citation 0.75, `cases_passed` 1, `cases_total` 3); AC-21 with a fourth `null`; a dropped finding never matches; all-zero fallbacks; a perf test that scores 1,000 findings × 100 expectations in under 50 ms using `performance.now()` (NFR-2). `npm run typecheck` is green.

### Step 4 — Extend the eval schema (add-only)
- **Files:** `server/src/db/schema/eval.ts`, `server/src/db/schema.ts`
- **Change:**
  - **New table `eval_batches`:** uuid pk; `workspace_id` FK `workspaces` cascade; `agent_id` FK `agents` cascade; `agent_version` int not null; `system_prompt` text not null; `provider`, `model` text not null; `skills` jsonb `string[]` not null default `[]`, which stores the resolved skill **bodies** so AC-48/AC-50 hold even if a skill is edited mid-batch; `status` text enum `running|done|failed` not null; `error` text; `ran_at` timestamptz defaultNow not null; `finished_at` timestamptz; seven int counts not null default 0; `recall`, `precision`, `citation_accuracy` double nullable; `duration_ms`, `tokens_in`, `tokens_out` int nullable; `cost_usd` double nullable.
  - **`eval_runs`:** add `batch_id` uuid FK `eval_batches` cascade (nullable) and `error` text.
  - **`eval_cases`:** add `created_at` timestamptz defaultNow not null, `created_from` text enum `finding|manual` default `manual` not null, and `source_finding_id` uuid FK `findings` on delete set null.
  - **Indexes:** `eval_batches (agent_id, ran_at)`, `eval_batches (workspace_id, ran_at)`, `eval_runs (batch_id)`, `eval_runs (case_id, ran_at)`, `eval_cases (workspace_id, owner_id)`, and a unique index on `eval_cases (source_finding_id)` (Recommendation 1).
  - Register `evalBatches` in the `schema.ts` import list (`:38`) and the `schema` object (`:81-82`).
- **Satisfies:** infrastructure for AC-4, AC-33, AC-35, AC-44, AC-52, AC-59, AC-62, AC-63, NFR-5
- **Skills:** drizzle-orm-patterns, postgresql-table-design
- **Insights:** `server/docs/insights.md:10` (add-only, or drizzle-kit hangs); `server/docs/insights.md:110` (text enums need no migration of their own)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` is green.

### Step 5 — Generate and apply the migration
- **Files:** `server/src/db/migrations/0019_*.sql` + `server/src/db/migrations/meta/*` (generated, never hand-edited)
- **Change:** run `cd server && pnpm db:generate`, inspect the SQL, then `pnpm db:migrate` against the dev DB (Docker Postgres :5432).
- **Satisfies:** infrastructure
- **Skills:** drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:10`; `server/docs/insights.md:102` (the migrate NOTICEs are not errors — read the last line)
- **Owner:** implementer
- **Depends on:** Step 4
- **Done when:** the new SQL file contains only `CREATE TABLE`, `ALTER TABLE … ADD COLUMN`, `ADD CONSTRAINT … FOREIGN KEY` and `CREATE [UNIQUE] INDEX` statements (no `DROP`, no `RENAME`); `pnpm db:migrate` ends with its success line.

### Step 6 — Seed PR #482 patches, the review agent, 8 cases and 2 scored batches
- **Files:** `server/src/db/seed-fixtures.ts`, `server/src/db/seed-eval-cases.ts` (NEW), `server/src/db/seed.ts`, `server/test/seed-eval-cases.test.ts` (NEW)
- **Change:**
  - **`seed-fixtures.ts`:** add `PR_482_PATCHES` for `src/config.ts` (4 additions, the `sk_live_` literal on new-side line 12) and `src/api/users.ts` (added new-side lines 45–51, 2 deletions), matching the counts at `seed.ts:133-134`.
  - **`seed.ts`, patches:** set `patch` in the #482 insert (`seed.ts:131-139`). After the block, run `UPDATE pr_files SET patch = … WHERE pr_id = … AND path = … AND patch IS NULL` (AC-64, AC-70).
  - **`seed.ts`, review agent:** after the agents loop (`seed.ts:257-264`), backfill the seeded #482 review (`model = 'seed'`) with `agent_id` = Security Reviewer `WHERE agent_id IS NULL` (AC-65).
  - **`seed-eval-cases.ts` (pure data):** holds the 8 case definitions of AC-66. Diffs for files outside the #482 patches are hand-written with headers. The 3 must-not-flag cases use `fileDiff()` over the #482 users patch, `PR_483_DISCOUNT` (`seed-fixtures.ts:53`) and `PR_484_CONTRACT` (`:102`). It also holds two per-case actual outputs (kept/dropped findings) for 2 batches.
  - **`seedEvalCases(db, workspaceId)`:** added in `seed.ts` and called after `seedFixturePrs` (`seed.ts:267`). It inserts missing cases by `(owner_id, name)`. It inserts the 2 batches (`model: 'seed'`, agent v1, snapshot = current Security Reviewer prompt) only when the agent has no `seed` batch. Their counts and metrics come from `scoreBatch(cases.map(scoreCase))`, and runs are linked by `batch_id` (AC-69, AC-70).
  - Choose the second (newer) batch's outputs so that its rounded percentages differ from the first. Flow 13 asserts them (Step 25).
- **Satisfies:** AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70
- **Skills:** drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:50` (insert-only by name — backfills must be explicit `WHERE … IS NULL`); `server/docs/insights.md:53` (split raw diff for `+` lines); `server/docs/insights.md:41` (#482 file roles)
- **Owner:** implementer
- **Depends on:** Steps 2, 3, 5
- **Done when:** `cd server && pnpm exec vitest run seed-eval` passes. The test asserts: 8 cases, 5 must-find with 6 expectations, 3 must-not-flag (AC-66); every must-find range intersects a `+` line (AC-67); every diff parses to ≥ 1 file and contains every expectation's file (AC-68); the stored batch constants equal `scoreBatch` over the stored outputs (AC-69). Running `pnpm db:seed` twice on the dev DB leaves exactly 8 Security Reviewer cases and 2 `seed` batches, checked with `docker exec devdigest-postgres psql -U devdigest -d devdigest -tc "<count sql>"` (`docs/insights.md:113`).

### Step 7 — Scaffold the eval module's memory
- **Files:** `server/src/modules/eval/AGENTS.md` (NEW), `server/src/modules/eval/CLAUDE.md` (NEW symlink: `cd server/src/modules/eval && ln -s AGENTS.md CLAUDE.md`), `server/src/modules/eval/docs/insights.md` (NEW, the standard empty insights skeleton). `docs/specs/` already exists with `.gitkeep`.
- **Change:** a short `AGENTS.md`: purpose, file map, the rules from the module part's Module notes (`getContext`, no cross-module, `AppError` 409 codes, the IT-mock rule).
- **Satisfies:** infrastructure
- **Skills:** none apply
- **Insights:** `docs/insights.md:155` (symlink content must be the bare `AGENTS.md`)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `readlink server/src/modules/eval/CLAUDE.md` prints `AGENTS.md`.

### Step 8 — Write the eval module's pure ring: constants, domain, ports, helpers
- **Files:** `server/src/modules/eval/constants.ts` (NEW), `domain.ts` (NEW), `ports.ts` (NEW), `helpers.ts` (NEW), `server/test/eval-helpers.test.ts` (NEW)
- **Change:**
  - **`constants.ts`:** limits (50 batches, trend of 10, 20 recent, 200,000 chars), the five 409 codes, and the all-failed message builder input.
  - **`domain.ts`:** `StoredCase`, `StoredBatch`, `StoredRun`, `AgentSnapshot`.
  - **`ports.ts`:**
    - `EvalStore`, the repository methods the use cases need.
    - `FindingSource`: `findingContext(id)` returns `{ finding: { id, file, startLine, endLine, title, severity, category, acceptedAt, dismissedAt }, review: { agentId }, pull: { id, workspaceId, title, body } }`, plus `getPrFiles(prId)` returning `{ path, patch }[]`.
    - `AgentSource`: `getById` returns `{ id, workspaceId, version, systemPrompt, provider, model, name }`; `linkedSkills` returns `{ skill: { name, body, enabled } }[]`.
    - `LlmResolver`: `resolve(provider) → LLMProvider`.
    - `ReviewEngine`: `run({ systemPrompt, model, diff, skills?, prDescription?, llm }) → { kept, dropped, mode, tokensIn, tokensOut, costUsd }`.
    - `EvalLog`: `info` / `error`.
  - **`helpers.ts`:** `expectationFromFinding` (accepted → `must_find`, dismissed → `must_not_flag`, else `null`); `oneClickDiff` via `fileDiff`; `validateCaseDiff`, which returns the AC-39 / AC-40 failure via `parseUnifiedDiff`; `skillBodies` (enabled only, `### name\nbody`); `snapshotOf`; `finaliseBatch(caseScores, errors, totals)`, which applies AC-54 / AC-55 / AC-57; `trendOf` (newest 10 `done`, chronological); `toCaseDto` / `toBatchDto` / `toRunDto`; `batchLogFields` (NFR-11 fields only).
- **Satisfies:** AC-23, AC-24, AC-25, AC-26, AC-27, AC-39, AC-40, AC-48, AC-49, AC-54, AC-55, AC-57, AC-62, NFR-11
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `server/docs/insights.md:105-108` (purity rule covers exact filenames only); `server/docs/insights.md:47` (never reach for `src/db/rows.ts` from a non-repository file)
- **Owner:** implementer
- **Depends on:** Steps 1, 2, 3
- **Done when:** `cd server && pnpm exec vitest run eval-helpers` passes. The test covers kind mapping, the one-click diff parsing to exactly 1 file with the finding's path, `validateCaseDiff` 0-file and file-not-in-diff failures, `finaliseBatch` for done / all-failed (`"all N cases failed"` + first error) / cost null vs sum, and `trendOf` order. `pnpm arch:check` is green.

### Step 9 — Write the eval repository
- **Files:** `server/src/modules/eval/repository.ts` (NEW)
- **Change:**
  - `EvalRepository` is the only file in the module importing drizzle or `src/db`. Every query is workspace-scoped, and rows map to `domain.ts` types.
  - **Cases:** `findCaseBySourceFinding`; `insertCase` (maps a unique violation on `source_finding_id` to "return existing"); `listCasesWithLastRun(ws, agentId)` (latest run per case via `DISTINCT ON (case_id) … ORDER BY ran_at DESC`); `getCase`; `updateCase`; `deleteCase` (cascade removes runs); `caseIdsForAgent`.
  - **Batches:** `findRunningBatch(agentId)`; `insertBatch`; `insertRun` (returns `false` when the case was deleted mid-batch); `completeBatch`; `listBatches(ws, agentId, 50)`; `getBatchWithRuns`.
  - **Overview:** `overview(ws)` with set-based queries, no N+1 per agent: case counts `GROUP BY owner_id`; newest batch per agent via `DISTINCT ON`; trend via `row_number() OVER (PARTITION BY agent_id ORDER BY ran_at DESC) ≤ 10 WHERE status = 'done'`; recent 20.
  - **Reaper:** `reapRunningBatches()` sets `status = 'failed'`, `error = <non-empty>`, `finished_at = now()`.
- **Satisfies:** AC-33, AC-35, AC-38, AC-42, AC-52, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, NFR-5
- **Skills:** drizzle-orm-patterns, postgresql-table-design, backend-onion-architecture
- **Insights:** `server/docs/insights.md:20` (no `ORDER BY` means heap order — always order explicitly); `server/docs/insights.md:26` (keep row types inside the repository)
- **Owner:** implementer
- **Depends on:** Steps 5, 8
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check` are green. Behaviour is proven by Step T1.

### Step 10 — Write the batch runner and the service
- **Files:** `server/src/modules/eval/runner.ts` (NEW), `server/src/modules/eval/service.ts` (NEW), `server/test/eval-service.test.ts` (NEW)
- **Change:**
  - **`EvalService` (deps: `store`, `findings`, `agents`, `runner`, `log`):**
    - `createFromFinding(ws, findingId, body)`: 404 if the context is missing or `pull.workspaceId ≠ ws`, as in `server/src/modules/reviews/findings.ts:17-19`. Undecided → `AppError('finding_undecided', …, 409)`. Existing case → `{ status: 200, case }`. Owner = `review.agentId ?? body.agent_id`, else `AppError('no_agent', …, 409)`. Agent missing in workspace → `NotFoundError`. No patch → `AppError('no_patch', …, 409)`. Otherwise insert, returning `{ status: 201 }`.
    - `listCases`, `createCase`, `updateCase`, `deleteCase`: 404s; `ValidationError` from `validateCaseDiff`.
    - `startBatch`: agent 404; 0 cases → `no_eval_cases`; running batch → `batch_running`; snapshot the agent and its skill bodies at request time; insert `running`; then `void runner.execute(batch.id).catch(log.error)`, the same pattern as `server/src/modules/reviews/service.ts:144`. Returns the batch before any case runs.
    - `listBatches`, `getBatch`, `overview`, `reapOrphans`.
  - **`EvalBatchRunner.execute(batchId)`:**
    1. Resolve the LLM from the **snapshot** provider. A failure marks the batch `failed` with the message (AC-56).
    2. Load the case ids present at start (AC-47). For each case, sequentially: parse the diff; call `engine.run` with only the snapshot prompt, model and skills plus the case's diff and `input_meta.title` / `body` as `prDescription`, and nothing else (AC-48, AC-49); `scoreCase`; `insertRun`. A thrown error stores a run with `error` and no metrics, then continues (AC-53).
    3. `finaliseBatch`, then `completeBatch`, then one NFR-11 log line.
- **Satisfies:** AC-23, AC-24, AC-28, AC-29, AC-30, AC-31, AC-32, AC-33, AC-34, AC-36, AC-37, AC-39, AC-40, AC-42, AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, AC-50, AC-52, AC-53, AC-54, AC-55, AC-56, AC-57, AC-61, NFR-4, NFR-11
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `server/docs/insights.md:84` (do not run the batch inside `container.jobs` — `JobRunner` re-runs failed handlers); `server/docs/insights.md:134` (a dropped rejected promise crashes the API — always `.catch`)
- **Owner:** implementer
- **Depends on:** Steps 8, 9
- **Done when:** `cd server && pnpm exec vitest run eval-service` passes with in-memory fakes per port (pattern `server/test/brief-service.test.ts`). The test covers: each 409 code, 404s, the idempotent 200, `no_agent` fallback order, `engine.run` called once per case with exactly the frozen fields (no `intent` / `memory` / `specs` / `callers` / `repoMap` keys), an agent edit after `startBatch` not changing later calls, continue-after-error, the all-failed path, the provider-resolution failure, and a log line that contains no diff, prompt or PR text.

### Step 11 — Wire compose, routes, the registry and the boot reaper
- **Files:** `server/src/modules/eval/compose.ts` (NEW), `server/src/modules/eval/routes.ts` (NEW), `server/src/modules/index.ts`, `server/src/app.ts`
- **Change:**
  - **`compose.ts`:** `makeEvalService(container, log)` adapts `container.reviewRepo` → `FindingSource` and `container.agentsRepo` → `AgentSource` (structural, no row-type imports outside compose), `container.llm` → `LlmResolver`, and a `CoreReviewEngine` around `reviewPullRequest` (mapping `review.findings` → `kept`, `dropped.length`, `mode`, tokens, cost).
  - **`routes.ts`:** `withTypeProvider<ZodTypeProvider>()`, `IdParams`, `getContext`. The nine routes of the design table each have a `response` schema. The one-click route sets `reply.status(201 | 200)` from the service result; the body schema tolerates an empty object. Batch start answers 202.
  - Register `eval` in `modules/index.ts`.
  - In `app.ts`, call `makeEvalService(container, app.log).reapOrphans()` in its own try/catch next to `server/src/app.ts:81`.
- **Satisfies:** AC-23, AC-24, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-43, AC-58, AC-59, AC-60, AC-61, AC-62, AC-63, AC-128, AC-129
- **Skills:** fastify-best-practices, backend-onion-architecture, zod, security
- **Insights:** `server/docs/insights.md:67` (body-less POST is accepted; nullable response serializes `null`); `server/docs/insights.md:18` (only `container.ts` may import a module compose — `app.ts` is the unrestricted top-level entry point, `server/docs/insights.md:32`)
- **Owner:** implementer
- **Depends on:** Step 10
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` are all green.

### Step 12 — Move the text-diff helpers to `src/lib` and add the client diff splitter
- **Files:** `client/src/lib/diff-text.ts` (NEW), `client/src/lib/diff-text.test.ts` (NEW), `client/src/app/skills/[id]/_components/SkillDetail/_components/SkillVersionsTab/helpers.ts`
- **Change:**
  - Move `DiffOp`, `diffLines`, `toUnifiedDiff`, `toDiffFile` and the `DIFF_MAX_LINES` budget (`helpers.ts:5-108`, `constants.ts`) into `lib/diff-text.ts`. The SkillVersionsTab `helpers.ts` re-exports them, keeping `VersionDiffModal.tsx:12` and its `helpers.test.ts` working.
  - Add `splitUnifiedDiff(text): PrFile[]`. It takes the path from `+++ b/` exactly as the server parser does (`parse.ts`) and returns one `PrFile` per file with counts and patch, for the editor preview and the file selector.
- **Satisfies:** AC-95, AC-98, AC-99 (infrastructure)
- **Skills:** frontend-ui-architecture, react-testing-library
- **Insights:** `client/docs/insights.md:106` (DiffViewer takes synthetic `PrFile`s); `client/docs/insights.md:100` (tests are cruised)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd client && pnpm exec vitest run diff-text SkillVersionsTab` passes, including headerless input → 0 files and a two-file diff → 2 paths; `pnpm arch:check` is green.

### Step 13 — Write the metric helpers
- **Files:** `client/src/lib/eval-metrics.ts` (NEW), `client/src/lib/eval-metrics.test.ts` (NEW)
- **Change:** `pct(x)` uses `Math.round(x * 100) + "%"`. The other helpers: `newestDone`, `previousDone`, `metricDelta`, `trendSeries(batches)` (done only, chronological, plus `v<agent_version>` labels), `orderPair(a, b)` (older by `ran_at`), `compareMetrics`, `formatCostOrDash`, `isRunning(batches)`, and `EVAL_DIFF_MAX_CHARS = 200_000` (a client-side constant; no runtime import from shared).
- **Satisfies:** AC-86, AC-87, AC-89, AC-90, AC-94
- **Skills:** frontend-ui-architecture
- **Insights:** `client/docs/insights.md:103` (format dates with `toISOString().slice(0,16)`, not Intl month names)
- **Owner:** implementer
- **Depends on:** Step 1
- **Done when:** `cd client && pnpm exec vitest run eval-metrics` passes: 0.75 → `75%`, 2/3 → `67%`, null cost → `—`, failed batches excluded from the trend, and older/newer chosen by `ran_at`.

### Step 14 — Write the eval query hooks
- **Files:** `client/src/lib/hooks/evals.ts` (NEW), `client/src/lib/hooks/index.ts`, `client/src/lib/hooks/evals.test.tsx` (NEW)
- **Change:**
  - Hooks: `useEvalCases(agentId)` (`["eval-cases", agentId]`); `useCreateEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase` (invalidate cases); `useCreateEvalCaseFromFinding()` (always posts an object body, `{}` or `{ agent_id }`; invalidates `["eval-cases", ownerId]`); `useEvalBatches(agentId)` with `refetchInterval: data.some(running) ? 4000 : false` (pattern `client/src/lib/hooks/reviews.ts:49-50`); `useRunEvals()` (invalidates batches and overview); `useEvalBatch(id)` (`["eval-batch", id]`); `useEvalOverview()`.
  - Add `export * from "./evals";` to the barrel.
- **Satisfies:** AC-73, AC-81, AC-84, AC-85, AC-96, AC-101, AC-108, NFR-6
- **Skills:** react-best-practices, react-testing-library, frontend-ui-architecture
- **Insights:** `client/docs/insights.md:91` (fake timers + `advanceTimersByTimeAsync`, not `vi.waitFor`); `client/AGENTS.md:33` (`apiFetch` sets content-type only with a body)
- **Owner:** implementer
- **Depends on:** Step 1
- **Done when:** `cd client && pnpm exec vitest run hooks/evals` passes. With a running batch, the list is refetched after 4,000 ms. With none running, there is no refetch after 8,000 ms.

### Step 15 — Extend the design system and the nav
- **Files:** `client/src/vendor/ui/charts/LineChart.tsx`, `client/src/vendor/ui/charts/MetricCard.tsx`, `client/src/vendor/ui/nav.ts`
- **Change:**
  - **`LineChart`:** optional `xLabels?: string[]` (shows the XAxis with those ticks; today `<XAxis dataKey="i" hide />`, `LineChart.tsx:44`) and `renderTooltip?: (index: number) => ReactNode` (a recharts `Tooltip` with custom content). Neither renders when omitted.
  - **`MetricCard`:** optional `formatDelta?: (abs: number) => string`, defaulting to today's `toFixed(2)`, so deltas can show percentage points.
  - **`nav.ts`:** add `{ key: "eval", label: "Eval Dashboard", icon: "FlaskConical", href: "/eval", gKey: "e" }` to SKILLS LAB (`nav.ts:35-41`) and `{ keys: "g e", label: "Go to Eval Dashboard", group: "Navigation" }` to `SHORTCUTS`. G-then-E then works through the existing `gKey` lookup (`client/src/components/app-shell/hooks/useGlobalShortcuts.ts:43-46`). Active state comes from `activeKeyFor` (`client/src/components/app-shell/helpers.ts:36`).
- **Satisfies:** AC-89, AC-90, AC-87, AC-103, AC-104
- **Skills:** frontend-ui-architecture, react-best-practices, dataviz
- **Insights:** `client/AGENTS.md:36` (extend, defaults unchanged)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm test` are green, and existing `LineChart` / `MetricCard` consumers render unchanged.

### Step 16 — Add the copy
- **Files:** `client/messages/en/eval.json`, `client/messages/en/prReview.json`
- **Change:**
  - **`eval.json`:** replace the obsolete `caseEditor` keys (`runCase`, `expectedOutput`, `validJson`, `invalidJson`, `eval.json:36,53-55`) with expectation-row keys (kind labels "must find" / "must not flag", file, start line, end line, "Add expectation", "Remove", notes, invalid-state message, preview). Add `evalsTab` keys ("Run evals ({count})", "New case", "passed" / "failed" / "never run" already exist, run history columns, Compare, failed). Add a `compare` block. Add `dashboard` keys (Run, "Run all agents", the per-agent error notification `{agent}: {message}`, recent runs columns, open Evals). Keep `noRuns` ("No runs yet. Create an eval case and run it."), the metric labels and the page breadcrumbs.
  - **`prReview.json`:** add `finding.turnIntoEval` ("Turn into eval case"), `finding.evalNeedsDecision`, `finding.evalCreated` ("Eval case created") and `finding.openEvals` ("Open in Evals").
- **Satisfies:** NFR-8 (copy for AC-71 to AC-111)
- **Skills:** none apply
- **Insights:** `client/docs/insights.md:97` (grepping for unused keys is unreliable — remove only the keys the spec names as obsolete)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** both files are valid JSON; `cd client && pnpm test` is green (existing tests import these files).

### Step 17 — Add "Turn into eval case" to FindingCard
- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx`, `FindingCard/useTurnIntoEval.ts` (NEW), `FindingCard/FindingCard.test.tsx`, `FindingsPanel/FindingsPanel.test.tsx`, `DiffTab/DiffTab.test.tsx` (add `vi.mock` of `lib/hooks/evals` only)
- **Change:**
  - `useTurnIntoEval(findingId)` wraps `useCreateEvalCaseFromFinding`. On success it calls `notify.success(t("finding.evalCreated"))` and stores the returned `owner_id`. On error it calls `notify.error(err.message)` (`client/src/lib/toast.tsx:34`).
  - In the action row (`FindingCard.tsx:91-112`), add a ghost `FlaskConical` button. It is disabled with a visible `evalNeedsDecision` hint while `!accepted && !dismissed` (`:50-51`), and disabled while pending. Once the case exists, the button is replaced by a link to `/agents/<owner_id>?tab=evals`.
  - Both FindingsPanel and DiffTab get the button with no prop changes (Recommendation 4).
- **Satisfies:** AC-71, AC-72, AC-73, AC-74, AC-75, AC-76, AC-77, NFR-9
- **Skills:** react-best-practices, frontend-ui-architecture, react-testing-library
- **Insights:** `client/docs/insights.md:134` (fetch is not globally mocked — `vi.mock` the hook module); `client/docs/insights.md:75` (mutation `isError` resets on re-mutate); `client/docs/insights.md:85` (keyboard: assert native enabled `<button>`)
- **Owner:** implementer
- **Depends on:** Steps 14, 16
- **Done when:** `cd client && pnpm exec vitest run FindingCard FindingsPanel DiffTab` passes. `FindingCard.test.tsx` covers disabled with hint when undecided, enabled when accepted, mutate called with the finding id, disabled while pending, and the link `href` after success.

### Step 18 — Register the Evals tab
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`, `client/src/app/agents/[id]/page.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`
- **Change:**
  - Add `{ key: "evals", labelKey: "editor.tabs.evals", icon: "FlaskConical" }` to `TABS` (`constants.ts:11-15`; the label already exists at `client/messages/en/agents.json:58`).
  - Add `"evals"` to `VALID_TABS` (`page.tsx:15`).
  - Add an `{tab === "evals" && <EvalsTab agent={agent} />}` branch and exclude it from the Config fallback (`AgentEditor.tsx:25-27`).
- **Satisfies:** AC-78
- **Skills:** frontend-ui-architecture, next-best-practices
- **Insights:** none apply (checked `client/docs/insights.md`)
- **Owner:** implementer
- **Depends on:** Step 19 (same batch; implement together)
- **Done when:** opening `/agents/<id>?tab=evals` renders the Evals tab (`AgentEditor.test.tsx` stays green).

### Step 19 — Build the Evals tab view
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/{EvalsTab.tsx, index.ts, styles.ts, helpers.ts}` (NEW) and `EvalsTab/_components/{EvalMetrics, EvalTrendChart, EvalCaseList, EvalRunHistory, CompareRunsModal}/{<Name>.tsx, index.ts, styles.ts}` (NEW)
- **Change:**
  - **Header:** "Run evals (N)", disabled at 0 cases or while a batch is running, calls `useRunEvals`; "New case".
  - **`EvalMetrics`:** 4 `MetricCard`s for `newestDone` with `pct` values and a delta versus `previousDone` (percentage points via `formatDelta`), or the `noRuns` copy.
  - **`EvalTrendChart`:** `LineChart` with 3 series, `xLabels = v<agent_version>`, a tooltip showing version and `formatCostOrDash(cost)`, and `yMin` 0.
  - **`EvalCaseList`:** name; each expectation as "must find" / "must not flag" with `file:start-end`; last-run status; Edit / Delete.
  - **`EvalRunHistory`:** newest first with version, run time, status, the 3 metrics, passed/total, cost and a native checkbox. Failed rows show the error. Compare is enabled only with exactly 2 selected.
  - **`CompareRunsModal`:** `useEvalBatch` for each id, nothing else. Metrics for both batches plus the newer − older delta. Prompt diff via `DiffViewer` with `toDiffFile("system-prompt.md", older.system_prompt, newer.system_prompt)`.
  - All user and provider text renders as plain text, never `Markdown`.
- **Satisfies:** AC-79, AC-80, AC-81, AC-82, AC-83, AC-84, AC-85, AC-86, AC-87, AC-88, AC-89, AC-90, AC-91, AC-92, AC-93, AC-94, AC-95, AC-96, AC-112, NFR-6, NFR-9, NFR-10
- **Skills:** frontend-ui-architecture, react-best-practices, dataviz, next-best-practices
- **Insights:** `client/docs/insights.md:106` (synthetic `PrFile` for the prompt diff); `client/docs/insights.md:13` (FileCard auto-opens under 200 lines); `client/docs/insights.md:47` (responsive stacking via grid `auto-fit`)
- **Owner:** implementer
- **Depends on:** Steps 12, 13, 14, 15, 16
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check` are green; in `pnpm dev`, the Security Reviewer's Evals tab shows 8 seeded cases, 2 history rows, the trend and a working Compare.

### Step 20 — Build the Case Editor modal
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseEditorModal/{CaseEditorModal.tsx, helpers.ts, constants.ts, styles.ts, index.ts}` (NEW)
- **Change:**
  - `Modal` with name, diff `Textarea`, a `DiffViewer` preview of `splitUnifiedDiff(text)` while the diff is non-empty, notes, and expectation rows (kind select, file select offering exactly the parsed paths, start and end inputs).
  - "Add expectation" adds a row. "Remove" is disabled when 1 row is left.
  - A pure `validateDraft` in `helpers.ts` drives the invalid state and disables Save (empty name, 0 files, missing file, line < 1, start > end, over 200,000 chars).
  - Save calls `useCreateEvalCase` (new) or `useUpdateEvalCase` (edit), closes on success, and on failure stays open with the values and shows the server message. A zod 422 message is read from `details[].params.issue.message`.
  - Edit opens with the case's values.
- **Satisfies:** AC-80, AC-97, AC-98, AC-99, AC-100, AC-101, AC-102, AC-130, AC-112, NFR-9, NFR-10
- **Skills:** frontend-ui-architecture, react-best-practices
- **Insights:** `client/docs/insights.md:56` (422 human message lives in `details[].params.issue.message`)
- **Owner:** implementer
- **Depends on:** Step 19
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check` are green; in `pnpm dev`, a pasted two-file diff offers both paths, and saving creates a case that appears in the list.

### Step 21 — Build the `/eval` Eval Dashboard
- **Files:** `client/src/app/eval/page.tsx` (NEW), `client/src/app/eval/_components/EvalDashboardView/{EvalDashboardView.tsx, helpers.ts, styles.ts, index.ts}` (NEW), with `_components/AgentEvalRow/` (NEW) if the row grows its own state
- **Change:**
  - `page.tsx` is thin (model: `client/src/app/agents/page.tsx`) and renders `EvalDashboardView` inside `AppShell` with `crumb` = Skills Lab › Eval Dashboard from `eval.page.*`.
  - One row per `overview.agents`: name, model badge, newest batch `v<n>` · date · passed/total, a `Sparkline` over the trend (rendered only with ≥ 2 points, because `Sparkline.tsx:18` divides by `length - 1`), the 3 metrics or nothing, a link to `/agents/<id>?tab=evals`, and Run.
  - "Run all agents" calls `useRunEvals` once per agent with `cases > 0`. Each failure raises `notify.error(t("dashboard.runError", { agent, message }))`.
  - Recent runs table: the 20 newest, with agent name, version, time, status, 3 metrics and cost.
- **Satisfies:** AC-105, AC-106, AC-107, AC-108, AC-109, AC-110, AC-111, AC-112, NFR-9, NFR-10
- **Skills:** frontend-ui-architecture, next-best-practices, react-best-practices, dataviz
- **Insights:** `client/docs/insights.md:117` (request `/eval` once under `pnpm dev` before typecheck)
- **Owner:** implementer
- **Depends on:** Steps 13, 14, 15, 16
- **Done when:** after one `GET http://localhost:3000/eval` under `cd client && pnpm dev`, `pnpm typecheck && pnpm arch:check && pnpm test` are green, and `/eval` shows the Security Reviewer row with the newest seeded batch.

### Step 22 — Add the root `pnpm verify`
- **Files:** `package.json` (NEW, repo root), `scripts/verify.sh` (NEW, executable)
- **Change:**
  - `package.json`: `{ "name": "dev-digest", "private": true, "scripts": { "verify": "bash scripts/verify.sh", "verify:l06": "bash scripts/verify.sh", "verify:it": "bash scripts/verify.sh --it" } }`. No deps, no workspace.
  - `verify.sh` is bash. It does **not** use `set -e`. It runs each lane from its package directory, records PASS or FAIL, prints a summary table, and exits 1 on any FAIL. The lanes:
    1. reviewer-core `npm run typecheck` + `npm test`
    2. server `pnpm typecheck`
    3. server `pnpm arch:check`
    4. server `pnpm exec vitest run --exclude '**/*.it.test.ts' eval seed-eval contracts`
    5. shared copies: `diff` of `contracts/eval-pipeline.ts` and of `index.ts` across the two copies
    6. scoring guard on `reviewer-core/src/eval/score.ts`: fail if any `import`/`export … from` line is not `import type`, or if `grep -F` finds `openai`, `anthropic`, `openrouter`, `completeStructured`, `LLMProvider`, `fetch(` or `process.env`
    7. client `pnpm typecheck`; on failure, print the route-types hint
    8. client `pnpm arch:check`
    9. client `pnpm exec vitest run eval Eval diff-text FindingCard FindingsPanel DiffTab hooks/evals`
  - `--it` adds the lane `cd server && pnpm exec vitest run eval.it`, which needs Docker.
  - Preflight: if `reviewer-core/node_modules` is missing, print `npm ci` advice.
- **Satisfies:** AC-117, AC-118, AC-119, AC-120, AC-121
- **Skills:** none apply
- **Insights:** `docs/insights.md:132` (server typecheck needs `reviewer-core/node_modules`; npm there); `docs/insights.md:64` (whole-tree shared `diff -r` fails today — compare the eval files only); `docs/insights.md:100` (zsh quirks — the script is bash, invoked via `bash`)
- **Owner:** implementer
- **Depends on:** Steps 1–21
- **Done when:** `pnpm verify` at the repo root prints 9 PASS lanes and exits 0. Inserting a temporary `import { z } from 'zod'` into `score.ts` turns the guard lane FAIL with exit 1; revert it afterwards.

### Step 23 — Run the experiment (manual, real model, user's DB)
- **Files:** none in code. Results are recorded by `doc-writer` in `docs/specs/eval-pipeline.md` `## Experiment log`, and in `docs/insights.md` via the `engineering-insights` skill.
- **Change:**
  1. Preconditions: `OPENROUTER_API_KEY` is configured in `~/.devdigest/secrets.json` or `.env` (never printed); `./scripts/dev.sh` is up with the migration applied and the seed run; no unit tests run during the experiment (the reaper).
  2. In the studio, on a PR reviewed by the Security Reviewer, Accept one finding and Dismiss another, then press "Turn into eval case" on both. Confirm the Security Reviewer's Evals tab shows at least 10 cases, including the two new ones (AC-123).
  3. Batch 1: "Run evals (N)", or `curl -X POST http://localhost:3001/agents/<securityId>/eval-runs`. Poll `GET /agents/<id>/eval-runs` until `done`. Note the wall time (NFR-1 ≤ 10 min).
  4. Batch 2: tighten the prompt via the Config tab (`PUT /agents/<id>` with `system_prompt`, which bumps the version). Run again.
  5. Batch 3: append the line `Flag every \`const\` declaration as a SUGGESTION`. Run again.
  6. For each batch, read `GET /eval-runs/<batchId>` and record batch id, `agent_version`, model, recall, precision, citation accuracy, passed/total, cost and a one-line prompt summary.
  7. Confirm batch 2 differs from batch 1 in recall or precision (AC-125), and that batch 3's precision is below batch 2's (AC-126). Compare 2 vs 3 in the UI shows the added line.
  8. Restore the seeded prompt afterwards if wanted.
- **Satisfies:** AC-123, AC-124, AC-125, AC-126, AC-127 (recorded via handoff), NFR-1
- **Skills:** engineering-insights (record the outcome and any model quirk)
- **Insights:** `server/docs/insights.md:70` (deepseek-v4-flash reasoning tokens vs `max_tokens`); `server/docs/insights.md:63` (unit suite reaps running rows — don't run it mid-batch)
- **Owner:** the user (or the main session with the user's key). Results go to `doc-writer`.
- **Depends on:** Steps 1–22, T1–T3 green
- **Done when:** three `done` batches exist for the Security Reviewer, AC-125 and AC-126 hold, and the numbers are handed to `doc-writer` for the Experiment log.

### Step T1 — Write the server integration tests for the eval module
- **Files:** `server/test/eval.it.test.ts` (NEW), `server/test/helpers/evals.ts` (NEW, `waitForEvalBatch`, which polls `eval_batches.status` until terminal **and** the run rows count equals the case count)
- **Change:**
  - Setup: `startPg` + `seed`; `buildApp` with `MockLLMProvider` on `openai`, `anthropic` and `openrouter`, plus a fixture with a true positive `src/config.ts:12`, noise `src/api/users.ts:47` and a hallucinated `src/config.ts:999`.
  - One-click on seeded #482: accept → 201 `must_find` with header diff, PR meta and owner = Security Reviewer; dismiss → `must_not_flag`; second call → 200 same id; undecided → 409 `finding_undecided`; no patch → 409 `no_patch`; review without agent and no body → 409 `no_agent`, with body → owned; cross-workspace → 404.
  - CRUD: 422s for AC-39, AC-40, AC-41, AC-128 and AC-129 with nothing stored; `last_run` null vs set; delete cascades runs.
  - Batches: 202 `running` before runs; 409s; the snapshot; mock `completeStructured` calls equal the case count; exact recall/precision/citation for designed cases; cost = Σ 0.001; an all-failed batch via a throwing provider; provider resolution failure (no override + no key → `failed`); reaper on a second `buildApp`; history limit 50 and order; detail; overview counts, trend ≤ 10 chronological done-only, recent 20.
  - Zero mock calls after the CRUD / one-click / overview routes (NFR-4).
  - Seed: run twice, assert idempotency and the backfills.
  - NFR-5 timing: 50 batches × 8 runs inserted; p95 of 20 `inject` calls per route under 200 ms.
- **Satisfies:** AC-23 to AC-64 (server behaviour), AC-65, AC-70, NFR-4, NFR-5
- **Skills:** backend-onion-architecture, drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:125` (override every reachable provider); `server/docs/insights.md:122` (terminal status ≠ all rows written — wait on both); `server/docs/insights.md:99` (`new MockLLMProvider('openai', …)` for openrouter)
- **Owner:** test-writer
- **Depends on:** Steps 6, 11
- **Done when:** `cd server && pnpm exec vitest run eval.it` passes with Docker running.

### Step T2 — Write the client component tests
- **Files:** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx`, `…/CaseEditorModal/CaseEditorModal.test.tsx`, `…/CompareRunsModal/CompareRunsModal.test.tsx`, `client/src/app/eval/_components/EvalDashboardView/EvalDashboardView.test.tsx`, `client/src/components/app-shell/helpers.test.ts` (NAV `eval` item with `gKey: "e"`) (all NEW except the last)
- **Change:** RTL tests with `vi.mock` of `@/lib/hooks/evals` and `NextIntlClientProvider`. They cover: case list labels and statuses; "Run evals (N)" disabled states; metrics 75% / 67%; no-runs copy; trend labels and tooltip with `—`; history order and failed error; Compare enabled only at 2; deltas newer − older; only `useEvalBatch` used; prompt diff rendered; Case Editor invalid states, Remove disabled at 1 row, paths offered, POST vs PUT, stays open with error; dashboard rows, no-batch row, Run, Run all (only agents with cases), named error notification, recent table; a literal `**bold**` / `<b>` stays text (AC-112); native focusable buttons and checkboxes (NFR-9, structural).
- **Satisfies:** AC-78 to AC-112, AC-130, NFR-9 (structural)
- **Skills:** react-testing-library
- **Insights:** `client/docs/insights.md:85` (keyboard tests structural only); `client/docs/insights.md:73` (no `toHaveBeenCalledExactlyOnceWith`)
- **Owner:** test-writer
- **Depends on:** Steps 17–21
- **Done when:** `cd client && pnpm exec vitest run eval Eval app-shell` passes.

### Step T3 — Write the e2e flow 13
- **Files:** `e2e/specs/13-eval-pipeline.flow.json` (NEW)
- **Change:** steps in order:
  1. open `{BASE}/` → `wait --url /pulls` → click the #482 row → `/pulls/482`
  2. "Agent runs" tab, where the first card is expanded by default (`FindingsPanel.tsx:88`)
  3. `find role button --name Accept --exact` → `find role button --name "Turn into eval case" --exact` → `wait --text "Eval case created"`
  4. open `{BASE}/agents` → click "Security Reviewer" → "Evals" tab → `wait --url tab=evals` → `wait --text "must find"` and the new case's name
  5. open `{BASE}/eval` → `wait --text "Eval Dashboard"` → `wait --text` for the newest seeded batch's rounded percentages from Step 6
- **Satisfies:** AC-113, AC-114, AC-115, AC-116
- **Skills:** none apply
- **Insights:** `e2e/docs/insights.md:21` (`--exact`); `:24` (`wait --url` is a substring); `:30` (`find text` can hit the RSC script — prefer `role`); `:33` (uppercase metric labels)
- **Owner:** test-writer writes it. The main session or user runs `cd e2e && npm run e2e:hermetic`, since test-writer may not run hermetic.
- **Depends on:** Steps 6, 17, 18, 21
- **Done when:** `cd e2e && npm run e2e:hermetic` passes all 13 flows; `npm run typecheck` in `e2e` is green.

## Batches

| Batch | Steps | Why together | Gate at the end |
|---|---|---|---|
| B1 — contracts + engine | 1, 2, 3 | The pure centre everything else imports; crosses shared ×2 + reviewer-core + one server re-export | `cd reviewer-core && npm run typecheck && npm test`; `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `diff` of both `eval-pipeline.ts` and `index.ts` copies; `cd client && pnpm typecheck` |
| B2 — data | 4, 5, 6 | Schema → generated migration → seed that uses the B1 scorers | `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm db:migrate && pnpm db:seed` twice, counts unchanged |
| B3 — server module | 7, 8, 9, 10, 11 | One module from the centre outwards, registered and reaped | `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` |
| B4 — client foundations | 12, 13, 14, 15, 16 | Shared lib, hooks, design-system props, nav and copy that B5–B7 consume | `cd client && pnpm typecheck && pnpm arch:check && pnpm test` |
| B5 — one-click | 17 | One component + its two parents' tests | same client gate |
| B6 — Evals tab | 18, 19, 20 | The agent-editor tab tree with editor and compare | same client gate |
| B7 — dashboard | 21 | New route; needs the one-time `pnpm dev` request for route types | same client gate (after requesting `/eval` once) |
| B8 — glue | 22 | Root verify after every lane's files exist | `pnpm verify` at the root exits 0 |

Batches run strictly one after another, each in a fresh `implementer`. Steps T1–T3 run after B8, and Step 23 runs last.

## Requirements coverage

| Requirement | Steps | Proved by |
|---|---|---|
| AC-1 | 1 | `server/test/contracts.test.ts` |
| AC-2 | 1 | `server/test/contracts.test.ts` (empty list rejected) |
| AC-3 | 1, 9 | contracts test; T1 response schema |
| AC-4 | 1, 4 | contracts test; T1 |
| AC-5 | 1, 9 | contracts test; T1 (`GET /eval-runs/:id`) |
| AC-6 | 1, 9 | contracts test; T1 (overview) |
| AC-7 | 1 | verify lane 5 (`diff`) |
| AC-8 | 2 | `reviewer-core/test/diff-parse.test.ts` (golden from HEAD) |
| AC-9 | 2 | `server/test/grounding.test.ts`, `seed-fixtures.test.ts` unchanged |
| AC-10 | 2 | `diff-parse.test.ts` (`fileDiff`) |
| AC-11 | 3 | `reviewer-core/test/eval-score.test.ts` |
| AC-12 | 3 | eval-score test (dropped never matches) |
| AC-13 | 3 | eval-score test |
| AC-14 | 3 | eval-score test |
| AC-15 | 3 | eval-score test |
| AC-16 | 3 | eval-score test (fallback 1) |
| AC-17 | 3 | eval-score test |
| AC-18 | 3 | eval-score test |
| AC-19 | 3 | eval-score test (micro-average, null case) |
| AC-20 | 3 | eval-score test (exact fixture) |
| AC-21 | 3 | eval-score test |
| AC-22 | 3, 22 | verify lane 6 (scoring guard) |
| AC-23 | 8, 10, 11 | T1; `eval-service.test.ts` |
| AC-24 | 8, 10, 11 | T1; eval-service test |
| AC-25 | 8 | `eval-helpers.test.ts`; T1 |
| AC-26 | 8 | eval-helpers test; T1 (parses to 1 file) |
| AC-27 | 8 | eval-helpers test; T1 |
| AC-28 | 10 | eval-service test; T1 |
| AC-29 | 10 | eval-service test; T1 |
| AC-30 | 10 | eval-service test; T1 (409 `no_agent`) |
| AC-31 | 10 | eval-service test; T1 |
| AC-32 | 10 | eval-service test; T1 |
| AC-33 | 4, 9, 10 | eval-service test; T1 (200, same id) |
| AC-34 | 10, 11 | eval-service test; T1 (cross-workspace 404) |
| AC-35 | 9, 11 | T1 (`last_run` null / set) |
| AC-36 | 10, 11 | T1 |
| AC-37 | 10, 11 | T1 |
| AC-38 | 9, 11 | T1 (cascade) |
| AC-39 | 8, 10 | eval-helpers test; T1 (422) |
| AC-40 | 8, 10 | eval-helpers test; T1 |
| AC-41 | 1, 11 | contracts test; T1 |
| AC-42 | 10, 11 | T1 |
| AC-43 | 10, 11 | T1 (202 `running`) |
| AC-44 | 10 | eval-service test; T1 |
| AC-45 | 10 | eval-service test; T1 |
| AC-46 | 10 | eval-service test; T1 |
| AC-47 | 10 | eval-service test |
| AC-48 | 8, 10 | eval-service test (exact engine input) |
| AC-49 | 10 | eval-service test (absent keys) |
| AC-50 | 10 | eval-service test (edit after start) |
| AC-51 | 10 | T1 (mock calls = cases) |
| AC-52 | 9, 10 | T1 |
| AC-53 | 10 | eval-service test; T1 |
| AC-54 | 8, 10 | eval-helpers test; T1 |
| AC-55 | 8, 10 | eval-helpers test; T1 |
| AC-56 | 10 | eval-service test; T1 |
| AC-57 | 8 | eval-helpers test; T1 (Σ 0.001) |
| AC-58 | 9, 11 | T1 (second `buildApp`) |
| AC-59 | 9, 11 | T1 |
| AC-60 | 9, 11 | T1 |
| AC-61 | 10, 11 | T1 |
| AC-62 | 8, 9 | T1 |
| AC-63 | 9 | T1 |
| AC-64 | 6 | T1 (seed); manual Files changed tab |
| AC-65 | 6 | T1 (seed) |
| AC-66 | 6 | `seed-eval-cases.test.ts` |
| AC-67 | 6 | seed-eval-cases test |
| AC-68 | 6 | seed-eval-cases test |
| AC-69 | 6 | seed-eval-cases test |
| AC-70 | 6 | T1 (seed twice) |
| AC-71 | 17 | `FindingCard.test.tsx`; T3 |
| AC-72 | 17 | FindingCard test |
| AC-73 | 17 | FindingCard test |
| AC-74 | 17 | FindingCard test |
| AC-75 | 17 | FindingCard test; T3 |
| AC-76 | 17 | FindingCard test |
| AC-77 | 17 | FindingCard test |
| AC-78 | 18 | T2; `AgentEditor.test.tsx`; T3 |
| AC-79 | 19 | T2; T3 |
| AC-80 | 19, 20 | T2 |
| AC-81 | 19 | T2 |
| AC-82 | 19 | T2 |
| AC-83 | 19 | T2 |
| AC-84 | 19 | T2 |
| AC-85 | 14 | `hooks/evals.test.tsx` |
| AC-86 | 13, 19 | `eval-metrics.test.ts`; T2 |
| AC-87 | 13, 15, 19 | T2 |
| AC-88 | 19 | T2 |
| AC-89 | 13, 15, 19 | eval-metrics test; T2 |
| AC-90 | 15, 19 | T2 |
| AC-91 | 19 | T2 |
| AC-92 | 19 | T2 |
| AC-93 | 19 | T2 |
| AC-94 | 13, 19 | eval-metrics test; T2 |
| AC-95 | 12, 19 | T2 |
| AC-96 | 14, 19 | T2 (only `useEvalBatch`) |
| AC-97 | 20 | T2 |
| AC-98 | 12, 20 | `diff-text.test.ts`; T2 |
| AC-99 | 12, 20 | diff-text test; T2 |
| AC-100 | 20 | T2 |
| AC-101 | 20 | T2 |
| AC-102 | 20 | T2 |
| AC-103 | 15 | T2 (app-shell helpers test); manual sidebar |
| AC-104 | 15 | T2 (NAV `gKey: "e"`); manual G then E |
| AC-105 | 21 | T2; T3 |
| AC-106 | 21 | T2 |
| AC-107 | 21 | T2 |
| AC-108 | 21 | T2 |
| AC-109 | 21 | T2 |
| AC-110 | 21 | T2 |
| AC-111 | 21 | T2 |
| AC-112 | 19, 20, 21 | T2 (literal markup stays text) |
| AC-113 | T3 | `e2e/specs/13-eval-pipeline.flow.json` |
| AC-114 | T3 | flow 13 |
| AC-115 | 6, T3 | flow 13 |
| AC-116 | 6, T3 | `npm run e2e:hermetic` (13/13) |
| AC-117 | 22 | `pnpm verify` / `verify:l06` / `verify:it` |
| AC-118 | 22 | `pnpm verify` lane list |
| AC-119 | 22 | manual: break one lane, observe all lanes run + exit 1 |
| AC-120 | 22 | manual: temporary bad import → guard FAIL |
| AC-121 | 22 | manual: hint printed on client typecheck FAIL |
| AC-122 | 1–22, T1–T3 | `pnpm verify` exits 0 |
| AC-123 | 23 | manual experiment |
| AC-124 | 23 | manual experiment |
| AC-125 | 23 | manual experiment |
| AC-126 | 23 | manual experiment |
| AC-127 | 23 + doc-writer | Experiment log filled |
| AC-128 | 1, 11 | contracts test; T1 |
| AC-129 | 1, 11 | contracts test; T1 |
| AC-130 | 20 | T2 |
| NFR-1 | 23 | manual: batch-1 wall time ≤ 10 min |
| NFR-2 | 3 | eval-score perf test |
| NFR-3 | 3, 22 | verify lane 6 |
| NFR-4 | 10, T1 | T1 (mock call counts) |
| NFR-5 | 4, 9, T1 | T1 timing test |
| NFR-6 | 14 | hooks/evals test |
| NFR-7 | 1, 22 | verify lane 5 |
| NFR-8 | 16 | review: no literals in new TSX (`/code-review`); T2 renders via messages |
| NFR-9 | 17, 19, 20, 21 | T2 structural; manual Tab/Enter/Space pass |
| NFR-10 | 19, 20, 21 | manual: view in `dark` and `light` |
| NFR-11 | 8, 10 | eval-service test (log fields, no text) |

## Skills the implementer must apply

| Path / glob | Skill | Why it applies |
|---|---|---|
| `server/src/vendor/shared/contracts/eval-pipeline.ts`, client copy | zod, typescript-expert | new contracts with refinements and caps |
| `reviewer-core/src/diff/**`, `reviewer-core/src/eval/**` | backend-onion-architecture, typescript-expert | pure engine ring; type-only imports |
| `server/src/adapters/git/diff-parser.ts` | backend-onion-architecture | adapter now re-exports from the engine index |
| `server/src/db/schema/eval.ts`, `schema.ts` | drizzle-orm-patterns, postgresql-table-design | new table, FKs, indexes |
| `server/src/db/seed*.ts` | drizzle-orm-patterns | idempotent inserts and guarded backfills |
| `server/src/modules/eval/{domain,ports,helpers,constants}.ts` | backend-onion-architecture | domain ring; narrow ports |
| `server/src/modules/eval/repository.ts` | drizzle-orm-patterns, postgresql-table-design, backend-onion-architecture | the only db importer; set-based overview queries |
| `server/src/modules/eval/{service,runner}.ts` | backend-onion-architecture | application ring; background run with ports |
| `server/src/modules/eval/{routes,compose}.ts`, `server/src/app.ts` | fastify-best-practices, backend-onion-architecture, zod, security | presentation, 201/200/202, cross-workspace 404s |
| `client/src/lib/{diff-text,eval-metrics}.ts` | frontend-ui-architecture | promoted shared pure helpers |
| `client/src/lib/hooks/evals.ts` | react-best-practices, frontend-ui-architecture | query hooks with conditional polling |
| `client/src/vendor/ui/**` | frontend-ui-architecture, dataviz | extend charts with optional props |
| `client/src/app/**/FindingCard/**` | react-best-practices, frontend-ui-architecture, react-testing-library | local hook + button states |
| `client/src/app/agents/[id]/**`, `client/src/app/eval/**` | frontend-ui-architecture, next-best-practices, react-best-practices, dataviz | new tab tree, modals, new route, charts |
| `**/*.test.ts(x)` | react-testing-library | component and hook tests |
| `scripts/verify.sh` | — | plain bash |
| Step 23, and any new dead end | engineering-insights | record the experiment outcome and quirks |

## Verification

| Command | cwd | Triggered by | Expected |
|---|---|---|---|
| `npm run typecheck` | `reviewer-core` | `reviewer-core/**/*.ts` | exit 0 |
| `npm test` | `reviewer-core` | `reviewer-core/**` | all pass, incl. `diff-parse`, `eval-score`, `run` |
| `pnpm typecheck` | `server` | `server/**/*.ts`, `reviewer-core/src/**` (needs `reviewer-core/node_modules`) | exit 0 |
| `pnpm arch:check` | `server` | `server/src/**` | no new violation |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server` | `server/src/**` | all pass (do not run during a live dev batch) |
| `pnpm exec vitest run eval.it` | `server` | eval module, seed | pass — **needs Docker** |
| `pnpm typecheck` | `client` | `client/**/*.{ts,tsx}` | exit 0 (after requesting `/eval` once under `pnpm dev`) |
| `pnpm arch:check` | `client` | `client/src/**` | 0 violations |
| `pnpm test` | `client` | `client/src/**` | all pass |
| `npm run typecheck` | `e2e` | `e2e/**/*.ts` | exit 0 |
| `npm run e2e:hermetic` | `e2e` | flow 13, seed, client | 13/13 flows pass — needs Docker; stop dev web :3000 first (`e2e/docs/insights.md:9`) |
| `pnpm verify` | repo root | everything above except IT/e2e | 9 PASS lanes, exit 0 |
| `pnpm verify:it` | repo root | + eval IT lane | 10 PASS lanes — **needs Docker** |
| `diff server/src/vendor/shared/contracts/eval-pipeline.ts client/src/vendor/shared/contracts/eval-pipeline.ts` | repo root | contracts | no output |

## Risks, dead ends already recorded

- After the parser move, `reviewer-core`'s own tests break on `@devdigest/reviewer-core` resolution unless the vitest alias is added (Step 2). The chain is verified: `reviewer-core/test/run.test.ts:3` → `server/src/adapters/mocks.ts:37`.
- drizzle-kit hangs if one generate mixes adds and drops (`server/docs/insights.md:10`). Keep Step 4 strictly additive.
- The shared copies already drift in 5 files (`docs/insights.md:64`). A whole-tree `diff -r` in verify would fail forever, so the lane compares only the eval files.
- The boot reaper extends an existing hazard: `routes-smoke.test.ts` boots `buildApp` against the dev DB (`server/docs/insights.md:63`). Running unit tests during the experiment will now also fail a live eval batch.
- IT tests that miss an LLM override make real network calls when a key exists (`server/docs/insights.md:125`).
- Adding patches to #482 and an agent to its review changes the Files changed tab, Smart Diff and possibly the run accordion label. Flows 04, 05, 08 and 11 must stay green (AC-116, `e2e/docs/insights.md:21`, `server/docs/insights.md:41`).
- `Sparkline` produces a NaN path with one point (`client/src/vendor/ui/charts/Sparkline.tsx:18`). The dashboard renders it only with ≥ 2 points.
- `MetricCard` prints deltas with `toFixed(2)` (`MetricCard.tsx` delta span). Without the new `formatDelta`, deltas would show as fractions next to whole percentages.
- The client splitter and the server parser must agree on file paths (AC-99 vs AC-40). Both take the path from `+++ b/`; a divergence surfaces as a 422 after the editor said valid.
- A new route fails typecheck until Next generates its types (`client/docs/insights.md:117`).
- The experiment model (deepseek-v4-flash via OpenRouter) can truncate JSON on reasoning tokens (`server/docs/insights.md:70`). Such cases error per AC-53 and lower the counted set.
- Citation accuracy cannot catch a wrong line inside a brand-new file (`reviewer-core/docs/insights.md:47`). This is a Non-goal, but it explains suspiciously perfect citation scores.
- The root `package.json` lives in a new top-level location that no CI workflow path filter covers (`docs/insights.md:57`). `pnpm verify` is a local gate unless CI is changed (not required by the spec).
- No new dependency is introduced.

## Open questions

- **The snapshot `skills` stores resolved bodies (`### name\nbody`, enabled only), not ids.** Assumed so that AC-48/AC-50 hold if a skill is edited mid-batch. The contract shows `skills: string[]` either way. Confirm with the user if they want names visible in history.
- **Seeded batches are both `agent_version` 1 with the current prompt, so a seeded Compare shows an empty prompt diff.** This is allowed by the overview Edge cases (identical prompts). The implementer may vary the older seed's prompt if a visible diff is wanted.
- **NFR-5 is measured with `app.inject` in T1, not over HTTP.** This assumes inject latency is an acceptable proxy for "the local dev stack". A manual `curl -w '%{time_total}'` loop would confirm it.
- **Stale anchors in the spec parts, for `doc-writer` to re-resolve (not conflicts):**
  - `server/src/modules/eval/docs/specs/eval-pipeline.md` cites `server/docs/insights.md:103` (modules→adapters; the rule is `server/.dependency-cruiser.cjs:67`), `:121` (now `:125`) and `:95` (now `:99`).
  - `server/docs/specs/eval-pipeline.md` cites `:46` (now `:50`) and `:49` (now `:53`).
- **Running `npm run e2e:hermetic` falls outside test-writer's allowed commands** (`.claude/agents/README.md:96`). The main session or the user must run it for T3.

## Handoff

1. `implementer` B1 → B2 → B3 → B4 → B5 → B6 → B7 → B8, one fresh run per batch, strictly sequential. Each batch ends on its gate.
2. `plan-verifier` (Steps mode) against this plan's Steps 1–22.
3. `test-writer` for T1 (server IT), T2 (client components) and T3 (flow 13). The main session or user runs `npm run e2e:hermetic`.
4. `/code-review` over the whole diff.
5. `architecture-reviewer` for Step 2 (the parser crosses a package boundary; adapter re-export), Steps 8–11 (new module, ports, composition, `app.ts` reaper), Step 12 (promotion to `src/lib`), Steps 18–21 (new tab tree and route) and Step 15 (vendor/ui extension).
6. `security-review` for Steps 10–11: cross-workspace `agent_id` fallback (AC-34), untrusted diffs and PR text into the engine, the 200,000-char cap. Also Steps 19–21 (plain-text rendering, AC-112).
7. `implementer` on the review findings.
8. `plan-verifier` (Acceptance mode) against AC-1 to AC-130 and NFR-1 to NFR-11, saved as `docs/plans/eval-pipeline/verification.md`.
9. Step 23 (experiment) by the user or main session.
10. `doc-writer`: AC anchors; `Status: implemented`; the `## Experiment log` rows from Step 23; Features row in `docs/specs/README.md`; the server README API map and client README route map; the eval module `AGENTS.md` polish; re-resolve the stale anchors listed above.
11. `engineering-insights` entries for the experiment outcome and the quirks below.
12. `pr-self-review` last.

`spec-creator` is not needed: no requirements finding.

## Confidence

Medium-High. Every boundary, anchor and reused symbol was opened and verified, and the one non-obvious breakage (the reviewer-core test alias) is planned. Three things would raise it:
- a dry run of `pnpm db:generate` showing a purely additive SQL;
- confirming that `IdParams` + an optional body schema accept a body-less one-click POST under Fastify 5;
- the user's answer on snapshot skill bodies vs ids.

---

Things worth recording via `engineering-insights`:
- `server/docs/insights.md`: moving any server module into reviewer-core breaks `reviewer-core`'s own `npm test`, because `reviewer-core/test/run.test.ts` imports `server/src/adapters/mocks.ts` and `reviewer-core/vitest.config.ts` has no `@devdigest/reviewer-core` alias.
- `client/docs/insights.md`: `Sparkline` draws a NaN path with a single data point, because it divides by `length - 1`.
- The spec-part anchors into `server/docs/insights.md` drifted by about 4 lines when the two 2026-10-07 entries were added at the top of Codebase Patterns.
