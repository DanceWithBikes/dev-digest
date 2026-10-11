# Implementation Plan: Multi-Agent Review (SPEC-06)

## Goal

A reviewer picks any subset of agents on the PR page, or on a new Configure run screen that shows a time and cost estimate per agent, and launches them with one click. The selected agents run concurrently, at most 4 at a time, and one agent's failure never stops the others. Each launch is one parent run. Its results page shows the agents in Columns or Tabs, a live log per unsettled agent, Accept / Dismiss / Learn / Turn into eval case on each original finding, and a "Where agents disagree" table computed at read time from location groups. An index page and a GLOBAL sidebar entry list past runs. MCP reviews pick up the same concurrent executor.

## Requirements

- Source: `docs/specs/multi-agent-review.md`, Spec ID SPEC-06, Status: approved. Parts, all approved: `client/docs/specs/multi-agent-review.md`, `server/docs/specs/multi-agent-review.md` (it also holds the new module's AC-31…AC-60), `server/src/modules/reviews/docs/specs/multi-agent-review.md`, `e2e/docs/specs/multi-agent-review.md`.
- Gate check: every part says `Status: approved`. `grep "NEEDS CLARIFICATION"` finds nothing. OQ-6 is struck through. OQ-1…OQ-5 are open with `blocks: none`, so their stated defaults are adopted:
  - OQ-1: mixed `agentIds` + `agentId`/`all` → 400 `invalid_run_request`.
  - OQ-2: only `agentIds` launches create a parent.
  - OQ-3: Learn does not count as decided.
  - OQ-4: `GET /multi-agent-runs` returns the 50 newest.
  - OQ-5: active repository only.
- Covered: AC-1…AC-125 (AC-124 is the CI-runner boundary, AC-125 the seed) and NFR-1…NFR-10. **AC-30 is uncovered** and NFR-8 is partially uncovered; see the next section.

## Spec conflicts found while planning

- **AC-30** ("`POST /findings/:id/reply` … respond 400 `invalid_action`, *as before this spec*"). The premise is false. No `reply` route exists. `FINDING_ACTIONS = ['accept', 'dismiss']` (`server/src/modules/reviews/routes.ts:20`) registers only those two paths (`:166-172`), so today the request gets Fastify's default **404 route-not-found**. The `invalid_action` branch (`server/src/modules/reviews/findings.ts:31`) is unreachable for `reply`. Even if a route were registered, a finding outside the workspace would answer 404 before reaching that branch (`findings.ts:17-20`). "Keep today's behaviour" and "answer 400" contradict each other. AC-30 is left **uncovered** → route to spec-creator: state the intended response (400 regardless of the finding, 400 only for an existing in-workspace finding, or keep 404). A ready step is in Recommendation 4.
- **NFR-8 vs AC-119** (no hard-coded user-visible strings vs the sidebar entry). The sidebar renders `NAV[].label` and `grp.section` as literals straight from `client/src/vendor/ui/nav.ts:25-43` (`client/src/vendor/ui/shell/Sidebar.tsx:45-57`). `messages/en/shell.json` `nav.*` feeds only the command palette (`client/docs/insights.md:44`). So the "Multi-Agent Review" label and the "GLOBAL" section header cannot come from `messages/en` without rewriting a design-system component, which `client/AGENTS.md:36` forbids. The plan implements AC-119 the existing way (literals in `nav.ts`; `shell.json` already has `nav["multi-agent"]` at `client/messages/en/shell.json:26`). NFR-8 is therefore **uncovered for these two nav literals only** → route to spec-creator: add an explicit exception, as `client/docs/insights.md:44` advises, or require a Sidebar refactor.

## Recommendations

1. **Do not move AC-31…AC-60 into the new module's `docs/specs/` before shipping.**
   - **Why:** any spec-creator edit to an approved spec, even a verbatim move, flips it back to `draft` (`docs/insights.md:43`). The server part already says the criteria live there for now (`server/docs/specs/multi-agent-review.md:9`).
   - **Trade-off:** the module's `docs/specs/` holds only `.gitkeep` until doc-writer anchors the shipped criteria.
   - **Affects:** Step 0, Handoff. **Planned this way.**
2. **Seed the finished parent run on PR #484, not #482.**
   - **Why:** flows 04 and 13 depend on #482's newest review being the seeded one: its accordion opens by default, and flow 13 clicks its first Accept (`e2e/specs/04-pr-findings.flow.json`, `e2e/specs/13-eval-pipeline.flow.json:14`). Two newer seeded reviews on #482 would change what those flows see. No flow opens #484 (`grep -l 484 e2e/specs/*` returns nothing), and AC-125 only asks for "a seeded PR".
   - **Trade-off:** the e2e flow reaches the results page through the index, not through #482.
   - **Affects:** AC-123, AC-125; Steps 18, T4. **Planned this way.**
3. **Optional index `agent_runs (agent_id, ran_at desc)` for the estimates query.**
   - **Why:** NFR-6 (200 ms, 20 agents) is a per-agent top-10 window over `agent_runs`, and no such index exists (`server/src/db/schema/runs.ts:8-34`).
   - **Trade-off:** one more index on a write-hot table.
   - **Affects:** NFR-6; Step 5. **Not planned** unless T2's NFR-6 timing fails.
4. **Ready step for AC-30, once spec-creator decides.** If the answer is "always 400": add a `POST /findings/:id/reply` route in `reviews/routes.ts` that throws `new AppError('invalid_action', …, 400)` before any lookup. If the answer is "400 for an existing finding": add `'reply'` to `FINDING_ACTIONS`, so `findings.ts`'s `default` branch answers.
   - **Affects:** AC-30; Step 8. **Not planned.**
5. **One `FindingCard` for both Columns and Tabs.**
   - **Why:** collapsed, it already shows the severity icon, title and `file:line` (AC-100). Expanded, it shows the category tag, `<n>% conf` (`client/src/vendor/ui/primitives/ConfidenceNum.tsx:18`), Markdown rationale, SUGGESTED FIX, Accept / Dismiss / Turn into eval case (`FindingCard.tsx:57-139`), which is AC-106 / AC-107 / AC-110 / AC-122. Only Learn is missing.
   - **Trade-off:** each card expands on its own, so the Tabs "accordion" may have several open items at once.
   - **Affects:** AC-100, AC-106–AC-110, AC-122; Steps 11, 21. **Planned this way.**
6. **Launch through an extended `useRunReview`, not a new mutation hook.**
   - **Why:** `page.test.tsx:63-71` already mocks `lib/hooks/reviews` → `useRunReview`. A new hook in another file would need a `QueryClientProvider` in that page test.
   - **Affects:** AC-67, AC-87; Step 13. **Planned this way.**

## Constraints that shape this plan

| Constraint | Source | What it forces |
|---|---|---|
| Only repositories touch drizzle / `src/db/**`, `import type` included | `server/.dependency-cruiser.cjs:40`, `server/docs/insights.md:48` | The multi-agent domain types live in `multi-agent/domain.ts`, and the repository selects named columns. `src/db/rows.ts` is never imported from a service. |
| Debt growing inside a baselined file is invisible to `arch:check` | `server/docs/insights.md:27`; baselined `reviews/run-executor.ts → db/schema.ts`, `reviews/service.ts → db/rows.ts` | New parameters in `run-executor.ts` / `service.ts` use narrow or shared types. No new `schema.*` / `AgentRow` use is added. |
| Services take ports, not the container; only `compose.ts` / `routes.ts` see it | `server/.dependency-cruiser.cjs:76`, `server/src/modules/AGENTS.md` | `MultiAgentService({ store })`, wired in `multi-agent/compose.ts` (copy `eval/compose.ts`). |
| No cross-module imports; cross-module **data** is a query in your own repository | `server/.dependency-cruiser.cjs:121`, `server/src/modules/reviews/docs/insights.md:73`, `server/docs/specs/multi-agent-review.md:78` | `multi-agent/repository.ts` reads `multi_agent_runs`, `agent_runs`, `reviews`, `findings`, `agents`, `pull_requests` itself. It re-implements the finding-row → `FindingRecord` mapping instead of importing `reviews/helpers.ts`. |
| The purity gate matches exact filenames only | `server/.dependency-cruiser.cjs:100-105`, `server/docs/insights.md:106` | Pure code goes in `domain.ts` / `helpers.ts` / `constants.ts` / `ports.ts`, never in a prefixed or nested file. |
| `ZodError` → **422**; `AppError` → its own status | `server/src/app.ts:149-162`, `:163-168`; `server/src/platform/errors.ts:7-17` | AC-17 (400) cannot come from a bare `RunRequest.parse`. The route `safeParse`s and maps any `agentIds` issue to `new AppError('invalid_run_request', …, 400)`. |
| `IdParams` is a uuid schema → a non-uuid id answers 422 | `server/src/modules/AGENTS.md` (uuid params → `IdParams`), `server/src/app.ts:128-136` | AC-33 / AC-16 need 404 for "names no run / agent". `GET /multi-agent-runs/:id` takes `z.object({ id: z.string().min(1) })`, and the service treats a non-uuid id as not found. `agentIds` entries are checked the same way before any query. This deviates from the IdParams convention on purpose. |
| In-flight = `queued` OR `running` everywhere | `server/src/modules/reviews/docs/insights.md:48`, `repository/run.repo.ts:10` | The pool keeps rows `queued` until a slot frees. Parent status treats both as "running" (AC-34). |
| One agent's chunks stay sequential | `server/src/modules/reviews/docs/insights.md:47` | Concurrency happens only at agent level (4), so a launch makes at most 4 concurrent provider streams. |
| Cancelling is unreliable; out of scope | `server/src/modules/reviews/docs/insights.md:106` | No change to `cancelRun`. The pool only has to tolerate `startAgentRun` returning false. |
| `/runs/:id/*` are not workspace-scoped; don't copy that | `server/src/modules/reviews/docs/insights.md:112` | Every new read is scoped by `workspaceId` in its SQL (AC-33). |
| MCP shares `ReviewService.runReview` in-process | `server/src/mcp/compose.ts:58-67`, `server/src/mcp/docs/insights.md:15` | The `runReview` signature stays backward-compatible (an optional trailing option). MCP needs no code change, and AC-25 is inherited. |
| Two `@devdigest/shared` copies, already drifting in 5 other files | root `AGENTS.md:28`, `docs/insights.md:75` | `observability.ts`, `review-api.ts` and `platform.ts` must end byte-identical in both copies (`diff` per file, not `diff -r`). |
| `agent-runner` compiles against the **server** shared copy | `agent-runner/tsconfig.json` (`paths`), Non-goals | The contract edits must keep `cd agent-runner && pnpm typecheck` green (AC-124). No file under `agent-runner/` changes. |
| Migrations are generated, additive, not run on boot | root `AGENTS.md:29,34`, `server/docs/insights.md:10`, `server/src/db/AGENTS.md` | One `pnpm db:generate` with only ADD COLUMN / CREATE INDEX, then `pnpm db:migrate`. `multi_agent_runs` is extended, never renamed or dropped. |
| The seed is idempotent by key and never updates | `server/docs/insights.md:51`, `server/src/db/AGENTS.md` | The AC-125 seeder skips when a `model = 'seed'` child run with a parent already exists on #484. |
| The "no-DB" unit suite boots `buildApp` against the dev DB and reaps in-flight runs | `server/docs/insights.md:64` | Never run server unit gates while a dev review is in flight. The reaper now also writes `finished_at`. |
| An IT that triggers a review must mock every reachable provider | `server/docs/insights.md:126` | T2 overrides `openai`, `anthropic` and `openrouter` (the intent classifier), plus `github`. |
| Client: routes never import each other; shared code never imports `src/app`; folders entered through `index.ts`; no baseline | `client/.dependency-cruiser.cjs:26-52`, `:81-95`; `client/docs/insights.md:102` | `RunTraceDrawer` and `FindingCard` move to `src/components/` (a move, not a copy) with their tests. All importers switch to `@/components/...`. |
| Never value-import `@devdigest/shared` in the client | `client/docs/insights.md:52` | Client code uses `import type` only. Runtime constants (palette, `MAX_PARALLEL` labels) stay client-local. |
| `src/vendor/ui/**`: extend with new files | `client/AGENTS.md:36` | A new `kit/Popover.tsx` (Dropdown closes on every item click, `kit/Dropdown.tsx:12-15`, and renders `items` only). `CircularScore` takes a number only (`primitives/CircularScore.tsx:3-11`), so a route-local `ScoreRing` handles null. The `nav.ts` gets a data-only entry. |
| A new route fails typecheck until Next compiles it | `client/docs/insights.md:119` | B5 requests `/multi-agent-review`, `/multi-agent-review/new` and one `/multi-agent-review/<id>` once under `pnpm dev` before `pnpm typecheck`. |
| `useSearchParams` pages are wrapped in `Suspense` | `client/src/app/skills/page.tsx:9-11` | `new/page.tsx` and `[id]/page.tsx` wrap their view in `<Suspense>`. |
| Keyboard tests in jsdom are structural only | `client/docs/insights.md:87` | NFR-9 is proved by native `<button>` / `role="checkbox"` / `tabIndex` assertions plus a manual pass. |
| e2e: seeded data only, no LLM, `--exact` locators, `wait --url` is a substring, the click target must be in the viewport | `e2e/AGENTS.md:17`, `e2e/docs/insights.md:21,24,27,30,40` | Flow 14 opens the seeded parent through the index. It counts columns, tabs and conflict rows with `eval` + `stdoutIncludes "true"`. |
| A new module ships with its memory | root `AGENTS.md:26`, `docs/insights.md:49` | Step 0 scaffolds `server/src/modules/multi-agent/`. |
| `ci/` and `agent-runner/` untouched | caller constraint; Non-goals | No step names a file there. Final gate: `git diff --stat -- agent-runner` is empty. |

## Touched packages / modules

| Package | Module | Ring / layer | Why it changes |
|---|---|---|---|
| server | `src/vendor/shared/contracts/{observability,review-api,platform}.ts` | domain (contracts) | AC-1…AC-12, copy 1 |
| client | `src/vendor/shared/contracts/{observability,review-api,platform}.ts` | contracts | byte-identical copy 2 |
| server | `src/db/schema/runs.ts`, `src/db/schema/reviews.ts`, `src/db/migrations/**` (generated) | infrastructure | parent link, selected agents, start/finish timestamps, `learned_at` |
| server | `src/db/seed.ts` | infrastructure (seed) | AC-125 seeded parent on #484 |
| server | `modules/reviews/{constants,helpers}.ts` | domain | pool constant + `runInSlots`, `agentIds` helpers |
| server | `modules/reviews/repository/{run,review}.repo.ts`, `repository.ts` | infrastructure | launch transaction, timestamps, `setFindingLearned` |
| server | `modules/reviews/{service,findings,run-executor}.ts` | application | `agentIds` trigger, Learn, concurrent executor |
| server | `modules/reviews/routes.ts` | presentation | 400 mapping, `multi_agent_run_id`, `/learn` route |
| server | `modules/multi-agent/` (NEW: `constants,domain,ports,helpers,repository,service,compose,routes`.ts) | all rings | parent list/detail, grouping, takes, estimates |
| server | `modules/index.ts` | composition root | register the module |
| server | `src/mcp/compose.ts` | composition (MCP) | **no code change**; inherits the executor (AC-25), verified by T2 |
| client | `src/components/run-trace-drawer/` (moved), `src/components/finding-card/` (moved) | shared components | reuse across the PR and multi-agent routes |
| client | `src/vendor/ui/kit/Popover.tsx` (NEW), `kit/index.ts`, `nav.ts` | design system | popover primitive; GLOBAL nav entry |
| client | `src/components/app-shell/helpers.ts` | shared | active key for `/multi-agent-review` |
| client | `src/lib/multi-agent.ts` (NEW), `src/lib/hooks/{multi-agent.ts (NEW), reviews.ts, index.ts}` | shared lib / data access | pure helpers; query hooks |
| client | `messages/en/{prReview,runs}.json` | copy | all new strings; remove "p-queue" |
| client | `src/app/repos/[repoId]/pulls/[number]/**` | route (PR) | popover replaces dropdown; importers of the moved components |
| client | `src/app/multi-agent-review/**` (NEW) | route | index, Configure run, results |
| e2e | `specs/15-multi-agent-review.flow.json` (NEW) | e2e | AC-123 |

## Steps

### Step 0 — Scaffold the new module's memory (before B1)
- **Files:**
  - `server/src/modules/multi-agent/AGENTS.md` (NEW): purpose; flat-module layers (copy the shape of `server/src/modules/eval/AGENTS.md`); routes `GET /multi-agent-runs`, `GET /multi-agent-runs/estimates`, `GET /multi-agent-runs/:id`; parent rows are written by `reviews` (trigger), read here.
  - `server/src/modules/multi-agent/CLAUDE.md` (NEW symlink: `cd server/src/modules/multi-agent && ln -s AGENTS.md CLAUDE.md`)
  - `server/src/modules/multi-agent/docs/specs/.gitkeep` (NEW, empty)
  - `server/src/modules/multi-agent/docs/insights.md` (NEW, copied from `.claude/skills/engineering-insights/references/template.md`)
- **Change:** the memory a new module ships with. No spec text goes into `docs/specs/` (Recommendation 1).
- **Satisfies:** infrastructure
- **Skills:** engineering-insights (template only)
- **Insights:** `docs/insights.md:49` (scaffold new-module docs); `docs/insights.md:43` (don't relocate approved ACs)
- **Owner:** main session (the user), as agreed
- **Depends on:** nothing
- **Done when:** `test -L server/src/modules/multi-agent/CLAUDE.md && readlink server/src/modules/multi-agent/CLAUDE.md` prints `AGENTS.md`, and the three other paths exist.

### Step 1 — Change the contracts in both shared copies
- **Files:**
  - `server/src/vendor/shared/contracts/observability.ts`, `client/src/vendor/shared/contracts/observability.ts`
  - `server/src/vendor/shared/contracts/review-api.ts`, `client/src/vendor/shared/contracts/review-api.ts`
  - `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts`
  - fixture updates that typecheck demands: `server/test/mcp-tools.test.ts`, plus every client test that builds a `FindingRecord` literal (`pnpm typecheck` lists them; expected: `FindingCard.test.tsx`, `FindingsPanel.test.tsx`, `DiffTab.test.tsx`, `RunTraceDrawer.test.tsx`, `OverviewTab/helpers.test.ts`, `components/findings-summary/helpers.test.ts`)
- **Change:**
  - `platform.ts:305`: `RunRequest.agentIds: z.array(z.string()).min(1).max(6).optional()`; `agentId` / `all` unchanged (AC-2).
  - `review-api.ts:15`: `FindingRecord.learned_at: z.string().nullable()` (AC-6).
  - `review-api.ts:51`: `ReviewRunResponse.multi_agent_run_id: z.string().nullable()` (AC-3).
  - `observability.ts` `AgentColumn` (AC-4, AC-5): `status` = `queued|running|done|failed|cancelled`; `findings: z.array(FindingRecord)` (import from `./review-api.js`); add `error: z.string().nullable()` (AC-101); make `agent_id` / `agent_name` nullable (edge case "agent deleted").
  - `observability.ts` `ConflictTake` (AC-7, AC-8): `verdict` = `Severity | 'ignored' | 'no_result'`, `note` nullable, `agent_id` / `persona` nullable.
  - `observability.ts`: replace `Conflict` with `LocationGroupMember { finding_id, agent_id (nullable) }` and `LocationGroup { file, start_line, end_line, title, conflict: boolean, members, takes }` (AC-11).
  - `observability.ts` `MultiAgentRun` (AC-9, AC-10, AC-11): `status` = `running|done|failed|partial`, `pr_title`, `cost_partial: boolean`, `groups: z.array(LocationGroup)` in place of `conflicts`.
  - `observability.ts`: new `MultiAgentRunSummary` (AC-31 fields + `ran_at`, `cost_partial`) and `RunEstimate { agent_id, median_duration_ms (nullable int), median_cost_usd (nullable), runs (int) }` (AC-12).
  - Fix the header comment's route names (no `POST /pulls/:id/multi-agent-run`).
  - Write the server copy first, `cp` it to the client, confirm with `diff`.
  - Add `learned_at: null` to the typed fixtures.
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12
- **Skills:** zod, typescript-expert
- **Insights:** `docs/insights.md:75` (copies drift elsewhere; diff these three files only); `client/docs/insights.md:52` (client `import type` only); `server/src/mcp/docs/insights.md:18` (MCP outputs derive from `FindingRecord`, so `learned_at` reaches `FindingConcise` automatically)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:**
  - `diff` of each of the three file pairs prints nothing;
  - `cd server && pnpm typecheck` and `cd client && pnpm typecheck` are green;
  - `cd agent-runner && pnpm typecheck` is green (AC-124 guard).

### Step 2 — Add the concurrency pool and the `agentIds` helpers to the reviews domain
- **Files:** `server/src/modules/reviews/constants.ts`, `server/src/modules/reviews/helpers.ts`
- **Change:**
  - `MAX_PARALLEL_AGENTS = 4` (NFR-1).
  - `runInSlots<T>(items, limit, { start(item): Promise<boolean>, run(item): Promise<void> })`:
    - awaits `start` for the first `min(limit, n)` items **together**, then runs the started ones (AC-21);
    - when one settles, takes the next item in request order, `start`s it, and runs it if `start` returned true (AC-22);
    - never more than `limit` running (AC-20);
    - catches each `run` rejection, so siblings finish (AC-23);
    - exposes the live running count to the callbacks (NFR-10).
  - `dedupeIds(ids)` keeps the first occurrence in request order (AC-13). `isUuid(id)` (AC-16 / AC-33 404 path).
  - Pure: no imports beyond the domain ring.
- **Satisfies:** AC-13 (dedupe half), AC-20, AC-21, AC-22, AC-23, NFR-1 (concurrency half)
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `server/src/modules/reviews/docs/insights.md:45-48` (queued semantics; chunk-level stays sequential); `server/docs/insights.md:106` (`helpers.ts` is purity-gated by exact name)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check` are green with no new violation. A pinning unit test, `server/test/reviews-run-in-slots.test.ts`, passes: 6 items, limit 4, deferred runs; it asserts the max concurrent count, start order and isolation of a rejecting item.

### Step 3 — Write the multi-agent pure ring: constants, domain, ports, DTO helpers
- **Files:** `server/src/modules/multi-agent/constants.ts`, `domain.ts`, `ports.ts`, `helpers.ts` (all NEW)
- **Change:**
  - `constants.ts`: `LINE_GAP = 3`, `TITLE_SIMILARITY_MIN = 0.5`, `ESTIMATE_SAMPLE = 10`, `LIST_LIMIT = 50` (OQ-4), `SEVERITY_RANK`.
  - `domain.ts` types: `ParentRow`, `ChildRun` (id, agentId|null, agentName|null, provider, model, status, error, score, summary, verdict, durationMs, costUsd, startedAt, finishedAt), `GroupableFinding` (`FindingRecord` + `agentId` + `runId`), `EstimateSample`.
  - `domain.ts` rules:
    - `deriveParentStatus(children)` (AC-34–AC-37);
    - `parentTotals(children)` → `{ total_duration_ms` = latest `finished_at` − earliest `started_at`, 0 when none (AC-40); `total_cost_usd` = sum of non-null (AC-38); `cost_partial` (AC-39) `}`;
    - `orderColumns(agentIds, children)`: selection order from `multi_agent_runs.agent_ids`; a child whose agent was deleted fills the first unmatched slot (AC-32);
    - `columnScore` → null unless `done` (AC-41);
    - `normaliseTitle` / `titleSimilarity` (AC-43);
    - `groupFindings(findings, selectionOrder)`: union-find over pairs with the same file, ranges overlapping or ≤3 lines apart, similarity ≥ 0.5 (AC-42, AC-44, AC-45); only findings of `done` children are input; members keep the original ids (AC-46); span = min/max (AC-48); title = most severe, then higher confidence, then earlier selection (AC-49); order by file (code-unit `<`, not `localeCompare`), then start line (AC-47);
    - `buildTakes(group, selected)`: one per selected agent (AC-53), verdict / note per AC-54–AC-56;
    - `isConflict` (AC-51, AC-52; reading in Open questions);
    - `median(values)` and `toEstimate(agentId, samples)` (AC-59, AC-60).
  - `ports.ts`: `MultiAgentStore { listParents(ws, limit), getParent(ws, id), estimateSamples(ws) }` in use-case vocabulary.
  - `helpers.ts`: `toMultiAgentRunDto`, `toSummaryDto`, `toFindingRecord(row-shaped domain object)`. No DB, no model call (AC-57).
- **Satisfies:** AC-32 (ordering), AC-34–AC-57, AC-59, AC-60 (rules), NFR-2 (zero model calls in grouping/estimates)
- **Skills:** backend-onion-architecture, typescript-expert, zod (contract types)
- **Insights:** `server/docs/insights.md:106` (keep these four exact filenames); `server/docs/insights.md:48` (don't import `db/rows.ts`); `server/src/modules/reviews/docs/insights.md:73` (cross-module data through own repository)
- **Owner:** implementer
- **Depends on:** Step 0, Step 1
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check` are green; no import outside `@devdigest/shared`, `zod`, `platform/errors.ts` and siblings.

### Step 4 — Write the client's pure multi-agent helpers
- **Files:** `client/src/lib/multi-agent.ts` (NEW), `client/src/lib/multi-agent.test.ts` (NEW, pinning)
- **Change:**
  - `initialAgentSelection(agents)`: enabled → checked (AC-62, AC-77, AC-78).
  - `formatSecondsCost(ms, usd)` → `"<s.1>s · $<c.2>"` (AC-80, AC-91, AC-96, AC-105).
  - `estimateTotals(checkedIds, estimates)` → `{ maxSeconds, sumCost, partial }` (AC-85, AC-86).
  - `parseResultsView(param)`: `"tabs"` → tabs, anything else → columns (AC-93).
  - `visibleGroups(groups, onlyConflicts)` (AC-112, AC-113).
  - `takeLabel(verdict)` → severity key / `didNotFlag` / `noResult` (AC-115).
  - Types are `import type` from `@devdigest/shared`.
- **Satisfies:** AC-62, AC-77, AC-78, AC-80, AC-85, AC-86, AC-93, AC-112, AC-113, AC-115 (logic halves)
- **Skills:** frontend-ui-architecture, typescript-expert
- **Insights:** `client/docs/insights.md:52` (no value import of shared)
- **Owner:** implementer
- **Depends on:** Step 1
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm exec vitest run lib/multi-agent` are green.

### Step 5 — Extend the schema (additive only)
- **Files:** `server/src/db/schema/runs.ts`, `server/src/db/schema/reviews.ts`
- **Change:**
  - `agent_runs`:
    - `multiAgentRunId uuid` references `multiAgentRuns.id` `onDelete: 'set null'`;
    - `startedAt timestamptz` (nullable);
    - `finishedAt timestamptz` (nullable);
    - index `agent_runs_multi_agent_run_id_idx` on `multi_agent_run_id`.
  - `multi_agent_runs`:
    - `agentIds jsonb.$type<string[]>().notNull().default(sql\`'[]'::jsonb\`)` (selection order, AC-32);
    - index `multi_agent_runs_workspace_ran_at_idx` on `(workspace_id, ran_at)` (NFR-5).
  - `findings`: `learnedAt timestamptz` (nullable, AC-6 / AC-26).
  - Nothing renamed or dropped.
- **Satisfies:** AC-14, AC-15, AC-26, AC-32, AC-40 (storage), NFR-5
- **Skills:** drizzle-orm-patterns, postgresql-table-design
- **Insights:** `server/docs/insights.md:10` (adds-only, so `db:generate` does not prompt); `server/src/db/AGENTS.md` (extend `multi_agent_runs`, don't rename)
- **Owner:** implementer
- **Depends on:** B1
- **Done when:** `cd server && pnpm typecheck` is green.

### Step 6 — Generate and apply the migration
- **Files:** `server/src/db/migrations/00NN_*.sql` + `meta/**` (generated only, never hand-edited)
- **Change:** `cd server && pnpm db:generate`, then `pnpm db:migrate`.
- **Satisfies:** infrastructure (for AC-14, AC-15, AC-26, AC-40)
- **Skills:** drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:10`; `server/docs/insights.md:103` (migrate prints NOTICEs; read the last line); `docs/insights.md:183` (pnpm build-script gate)
- **Owner:** implementer
- **Depends on:** Step 5
- **Done when:** the new SQL contains only `ALTER TABLE … ADD COLUMN`, `ADD CONSTRAINT … FOREIGN KEY` and `CREATE INDEX`, and `pnpm db:migrate` ends successfully.

### Step 7 — Add the launch transaction, timestamps and Learn to the reviews repository
- **Files:** `server/src/modules/reviews/repository/run.repo.ts`, `server/src/modules/reviews/repository/review.repo.ts`, `server/src/modules/reviews/repository.ts`, `server/src/modules/reviews/helpers.ts`
- **Change:**
  - `createMultiAgentLaunch(db, { workspaceId, prId, agents: {id, provider, model}[] })`: in one `db.transaction`, insert the parent with `agent_ids`, then one `queued`, `local` child per agent with `multi_agent_run_id`, in order. Returns `{ parentId, runIds[] }` (AC-13–AC-15).
  - `startAgentRun` also sets `startedAt`.
  - `completeAgentRun`, `cancelRunIfRunning` and `reapStaleRunningRuns` also set `finishedAt` (AC-40; the edge case "server restarts mid-run").
  - `setFindingLearned(db, findingId, at)` sets **only** `learnedAt` (AC-28; `setFindingAccepted` clears `dismissedAt` at `review.repo.ts:147`, so do not copy it).
  - Facade methods in `repository.ts`.
  - `ReviewDtoFinding` + `findingRowToDto` gain `learned_at` (`helpers.ts:73-114`).
- **Satisfies:** AC-13, AC-14, AC-15, AC-26, AC-28, AC-40 (data)
- **Skills:** drizzle-orm-patterns, backend-onion-architecture
- **Insights:** `server/src/modules/reviews/docs/insights.md:87` (reaper shape: `error` stays null); `server/src/modules/reviews/docs/insights.md:48` (in-flight = both statuses)
- **Owner:** implementer
- **Depends on:** Step 6
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check` are green; `pnpm exec vitest run run-queue.it` passes (needs Docker).

### Step 8 — Add the `agentIds` trigger and the Learn action
- **Files:** `server/src/modules/reviews/service.ts`, `server/src/modules/reviews/routes.ts`, `server/src/modules/reviews/findings.ts`
- **Change:**
  - `resolveTargets(ws, { agentId?, all?, agentIds? })`:
    - `agentIds` with `agentId` or `all` → `AppError('invalid_run_request', …, 400)` (OQ-1);
    - `agentIds` → `dedupeIds`; any non-uuid or unknown id (`this.agents.getById` per id, ≤ 6) → `NotFoundError` **before anything is created** (AC-16);
    - the old branches are unchanged (AC-18, `service.ts:61-67`).
  - `runReview(ws, prId, targets, logger?, opts?: { multiAgent?: boolean })`:
    - with `multiAgent`, use `createMultiAgentLaunch` and log once `logger.info({ parentId, prId, agentCount }, …)` (NFR-10);
    - otherwise per-target `createAgentRun` as today;
    - return `multi_agent_run_id` (parent id or null, AC-3);
    - the trailing parameter keeps `mcp/compose.ts:64` compiling unchanged.
  - Route `POST /pulls/:id/review`:
    - `RunRequest.safeParse(req.body ?? {})`; an issue whose `path[0] === 'agentIds'` → `AppError('invalid_run_request', …, 400)` (AC-17); other issues rethrow the `ZodError` (422 as today);
    - pass `{ multiAgent: body.agentIds !== undefined }`;
    - respond `{ pr_id, runs, reviews, multi_agent_run_id }`;
    - the rate-limit config stays as it is (NFR-3, `routes.ts:31`).
  - `FINDING_ACTIONS` gains `'learn'`. `findings.ts` gains `case 'learn'` → `setFindingLearned(now)` after the workspace check (AC-26, AC-27). No model call, no memory, no eval case (AC-29).
  - AC-30 is **not** touched (uncovered).
- **Satisfies:** AC-3, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-26, AC-27, AC-28, AC-29, NFR-3, NFR-10 (parent line)
- **Skills:** backend-onion-architecture, fastify-best-practices, zod, security
- **Insights:** `server/docs/insights.md:14` (`AppError` with a specific code); `server/src/modules/reviews/docs/insights.md:112` (scope every new read)
- **Owner:** implementer
- **Depends on:** Step 7, Step 2
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check` are green with no new violation; `pnpm exec vitest run reviews.it` passes (needs Docker).

### Step 9 — Run a launch's agents concurrently
- **Files:** `server/src/modules/reviews/run-executor.ts`
- **Change:**
  - Replace the `for` loop (`run-executor.ts:147-186`) with `runInSlots(jobs, MAX_PARALLEL_AGENTS, { start, run })`. `start` = today's `startAgentRun` + skip-and-persist-trace branch (`:151-160`). `run` = `runOneAgent` + the existing done/failed log lines.
  - Diff load, intent and `failAll` stay before the pool and run once (AC-19, AC-24).
  - Replace the "Queued — waiting for N agent(s) ahead" line (`:143-145`) with one for jobs at index ≥ 4 only: waiting for a free slot (AC-98's "Queued" line).
  - The agent-start info line (`:162`) adds `running: <count>` from the pool (NFR-10).
  - No new `schema.*` / `AgentRow` use in this baselined file.
  - `server/src/mcp/compose.ts` is **not edited**. MCP runs reach this executor through `runReview` (AC-25).
- **Satisfies:** AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, NFR-1, NFR-2, NFR-10 (agent line)
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:** `server/docs/insights.md:27` (no new debt in a baselined file); `server/src/modules/reviews/docs/insights.md:45-48`; `server/docs/insights.md:36` (MCP and API are separate processes; each has its own bus); `server/src/modules/reviews/docs/insights.md:106` (cancel is out of scope)
- **Owner:** implementer
- **Depends on:** Step 8
- **Done when:**
  - `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` are green;
  - `pnpm exec vitest run reviews.it reviews-skills.it run-queue.it mcp.it intent.it` pass (needs Docker; no dev review in flight).

### Step 10 — Move the run trace drawer to a shared component
- **Files:**
  - Move the whole of `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/**` (incl. `_components/*`, `helpers.ts`, `constants.ts`, `styles.ts`, test) → `client/src/components/run-trace-drawer/**` (NEW location).
  - `client/src/components/run-trace-drawer/index.ts` (explicit named exports: `RunTraceDrawer`, `RunTraceDrawerProps`, `eventsToLog`).
  - Importer to update: `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:17`.
- **Change:**
  - `git mv`, behaviour unchanged.
  - Test `vi.mock` paths become `@/lib/hooks/trace` / `@/lib/hooks/reviews`.
  - Intra-folder imports stay relative.
  - Delete the old folder.
- **Satisfies:** AC-103 (enabler)
- **Skills:** frontend-ui-architecture, react-testing-library
- **Insights:** `client/docs/insights.md:102` (tests are cruised too); `client/docs/insights.md:139` (the drawer streams only with `running`)
- **Owner:** implementer
- **Depends on:** B1
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm exec vitest run run-trace-drawer` are green; no file under `src/app` imports `RunTraceDrawer` by a route path.

### Step 11 — Move the finding card to a shared component and add Learn
- **Files:**
  - Move `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**` (incl. `useTurnIntoEval.ts`, test) → `client/src/components/finding-card/**` (NEW location), plus `index.ts`.
  - Importers to update: `…/_components/FindingsPanel/FindingsPanel.tsx:10`, `…/_components/DiffTab/DiffTab.tsx:11` (both become `@/components/finding-card`).
- **Change:**
  - Move with tests; `vi.mock` paths become `@/lib/hooks/evals` / `@/lib/toast`.
  - New optional prop `showLearn?: boolean` (default false, so the PR page is unchanged). When true, a Learn button calls `onAction("learn")` (AC-107).
  - A `learned` tag shows when `learned_at` is set (AC-109).
  - No Reply button (AC-107).
  - `useTurnIntoEval` keeps "decided = accepted or dismissed" (AC-110, OQ-3).
- **Satisfies:** AC-100, AC-106, AC-107, AC-110, AC-122 (component level)
- **Skills:** frontend-ui-architecture, react-best-practices, react-testing-library
- **Insights:** `client/docs/insights.md:61` (the old sibling `../FindingCard` import relied on the index rule; after the move use the alias); `client/docs/insights.md:96` (primitives drop `aria-label`)
- **Owner:** implementer
- **Depends on:** B1
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm exec vitest run finding-card FindingsPanel DiffTab` are green.

### Step 12 — Add the Popover primitive, the GLOBAL nav entry and the active key
- **Files:** `client/src/vendor/ui/kit/Popover.tsx` (NEW), `client/src/vendor/ui/kit/index.ts`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts`, `client/src/components/app-shell/helpers.test.ts`
- **Change:**
  - `Popover` takes `{ trigger, open, onOpenChange, align, width, children }`; it closes on outside mousedown and Escape. Same visual shell as `Dropdown` (`kit/Dropdown.tsx:83-100`), knows nothing about the app.
  - `NAV` gains `{ section: "GLOBAL", items: [{ key: "multi-agent", label: "Multi-Agent Review", icon: <existing IconName>, href: "/multi-agent-review" }] }` (AC-119). `shell.json` `nav["multi-agent"]` already exists.
  - `activeKeyFor`: `pathname.startsWith("/multi-agent-review")` → `"multi-agent"` (AC-120; replaces `includes("/multi-agent")` at `helpers.ts:28`).
- **Satisfies:** AC-119, AC-120, NFR-9 (Escape / outside close)
- **Skills:** frontend-ui-architecture, react-best-practices
- **Insights:** `client/docs/insights.md:44` (nav label literal; NFR-8 conflict recorded); `client/docs/insights.md:55` (precise path matching in `activeKeyFor`)
- **Owner:** implementer
- **Depends on:** B1
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm exec vitest run app-shell` are green.

### Step 13 — Write the multi-agent query hooks
- **Files:** `client/src/lib/hooks/multi-agent.ts` (NEW), `client/src/lib/hooks/reviews.ts`, `client/src/lib/hooks/index.ts`
- **Change:**
  - `useRunReview`'s `RunReviewInput` gains `agentIds?: string[]` and sends it when present (AC-67, AC-87).
  - New hooks:
    - `useMultiAgentRuns()` → `GET /multi-agent-runs`;
    - `useMultiAgentRun(id)` → `GET /multi-agent-runs/:id`, `refetchInterval` 4000 while `status === "running"`;
    - `useRunEstimates()` → `GET /multi-agent-runs/estimates`;
    - `useMultiAgentFindingAction(parentId)` → `POST /findings/:id/(accept|dismiss|learn)`, invalidates `["multi-agent-run", parentId]` (AC-108, AC-109).
  - Add one barrel line.
- **Satisfies:** AC-67, AC-87, AC-99, AC-108, AC-109 (data layer)
- **Skills:** react-best-practices, frontend-ui-architecture
- **Insights:** `client/docs/insights.md:77` (`useMutation` resets `isError` on re-mutate); `client/AGENTS.md` (components never `fetch`)
- **Owner:** implementer
- **Depends on:** B1
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check` are green.

### Step 14 — Add the copy
- **Files:** `client/messages/en/prReview.json`, `client/messages/en/runs.json`
- **Change:**
  - `prReview.runReview`: `pickAgents` ("PICK AGENTS TO RUN"), `clear`, `runMulti` ("Run multi-agent review ({count})"); keep `configureAgents`, `mergedWarning`.
  - `prReview.finding`: `learn`, `learned`.
  - `runs.page`: rewrite for SPEC-06. `meta` becomes "{count} selected agents · parallel"; `summary` is "{count} agents · parallel · {duration}s total · {cost}"; add `partial`, `crumb`, `configureRun`, `notFound`, `view.columns` / `view.tabs`, index empty-state copy. The "fan-out via p-queue" string at `runs.json:127` is removed (AC-121).
  - New `runs.configure` block with the AC-71 / AC-72 / AC-75 / AC-81 / AC-83 / AC-85 strings.
  - `runs.conflicts.noResult` ("no result").
  - No literal English in any new TSX (NFR-8).
- **Satisfies:** AC-121, NFR-8 (except the nav literals), text of AC-61, AC-65, AC-71, AC-72, AC-75, AC-81, AC-83, AC-85, AC-86, AC-89, AC-91, AC-92, AC-102, AC-111, AC-115, AC-116, AC-118
- **Skills:** none apply
- **Insights:** `client/docs/insights.md:99` (grep for unused keys is unreliable; delete `runs.page.*` keys only after checking `useTranslations("runs")` callers)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `rg -n "p-queue|worktrees" client/messages client/src` prints nothing; the JSON parses (`pnpm test` loads it).

### Step 15 — Replace the PR page's Run Review dropdown with the agent-picker popover
- **Files:**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewPopover/{RunReviewPopover.tsx, styles.ts, index.ts}` (NEW)
  - delete `…/_components/RunReviewDropdown/**` (incl. its test)
  - `…/_components/PrDetailHeader/PrDetailHeader.tsx`
  - `…/[number]/page.tsx`
- **Change:**
  - The "Run Review" button opens `Popover` headed "PICK AGENTS TO RUN" with one vendor `Checkbox` row per agent (`useAgents`) (AC-61). Selection is reset from `initialAgentSelection` on each open (AC-62).
  - Disabled rows are dimmed but operable (AC-63). "Clear" unchecks all (AC-64).
  - The primary button reads "Run multi-agent review (N)" and is disabled at 0 (AC-65, AC-66).
  - On click: `useRunReview().mutateAsync({ prId, agentIds })` → `router.push('/multi-agent-review/' + multi_agent_run_id)` (AC-67). On error: stay open, show `err.message`, no navigation (AC-68).
  - "Configure agents…" → `/multi-agent-review/new?pr=<prId>` (AC-69). The merged warning sits above the list (AC-70).
  - `PrDetailHeader` drops `onRunStart` / `onRunsStarted`; `page.tsx:139-147` stops passing them.
- **Satisfies:** AC-61, AC-62, AC-63, AC-64, AC-65, AC-66, AC-67, AC-68, AC-69, AC-70, NFR-9 (popover)
- **Skills:** frontend-ui-architecture, react-best-practices, next-best-practices
- **Insights:** `client/docs/insights.md:67` (portal / bubbling; the popover is not a portal); `client/docs/insights.md:58` (error message location; this route throws `AppError`, so `ApiError.message` holds it)
- **Owner:** implementer
- **Depends on:** Steps 4, 12, 13, 14
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check && pnpm test` are green, `page.test.tsx` included.

### Step 16 — Write the multi-agent repository
- **Files:** `server/src/modules/multi-agent/repository.ts` (NEW)
- **Change:** `MultiAgentRepository implements MultiAgentStore`; every query scoped by `workspace_id`.
  - `listParents(ws, 50)`: parents ⋈ `pull_requests` (number, title), `ORDER BY ran_at DESC LIMIT 50`; then one query for the children of those parent ids (status, cost, `started_at`, `finished_at`) (AC-31, NFR-5).
  - `getParent(ws, id)`:
    1. parent + PR;
    2. children ⋈ `agents` (name) ⋈ `reviews` on `run_id` (summary, verdict);
    3. findings ⋈ `reviews` where `reviews.run_id IN children` (NFR-4: 3 queries).
  - `estimateSamples(ws)`: agents (id, model) + `row_number() OVER (PARTITION BY agent_id ORDER BY ran_at DESC)` over `done` runs where `agent_runs.model = agents.model`, rn ≤ 10 (AC-58, AC-59, NFR-6).
  - Rows are mapped to domain types inside this file.
- **Satisfies:** AC-31, AC-32, AC-33 (scoping), AC-50 (reads only), AC-58, AC-59, NFR-4, NFR-5, NFR-6
- **Skills:** drizzle-orm-patterns, postgresql-table-design, backend-onion-architecture
- **Insights:** `server/src/modules/reviews/docs/insights.md:73` (query other modules' tables from your own repository)
- **Owner:** implementer
- **Depends on:** Steps 3, 6
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check` are green.

### Step 17 — Write the service, compose, routes and registration
- **Files:** `server/src/modules/multi-agent/service.ts`, `compose.ts`, `routes.ts` (all NEW), `server/src/modules/index.ts`
- **Change:**
  - `MultiAgentService({ store })`:
    - `list(ws)` → `toSummaryDto` with derived status and totals;
    - `get(ws, id)`: non-uuid or missing → `NotFoundError` (AC-33); else columns in selection order + groups + takes built in domain (AC-32–AC-57);
    - `estimates(ws)` (AC-58–AC-60).
  - `compose.ts#makeMultiAgentService(container)`.
  - `routes.ts`, each with a `response` schema:
    - `GET /multi-agent-runs` (`z.array(MultiAgentRunSummary)`);
    - `GET /multi-agent-runs/estimates` (`z.array(RunEstimate)`);
    - `GET /multi-agent-runs/:id` (params `z.object({ id: z.string().min(1) })`, `MultiAgentRun`).
  - Add one import + one entry `multiAgent` in `modules/index.ts`.
- **Satisfies:** AC-31, AC-32, AC-33, AC-34–AC-60
- **Skills:** backend-onion-architecture, fastify-best-practices, zod, security
- **Insights:** `server/src/modules/reviews/docs/insights.md:112` (don't repeat unscoped reads); `server/docs/insights.md:68` (response-schema behaviour)
- **Owner:** implementer
- **Depends on:** Step 16
- **Done when:** `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'` are green; `curl -s localhost:3001/multi-agent-runs` returns `[]` or a JSON array.

### Step 18 — Seed one finished 2-agent parent run on PR #484
- **Files:** `server/src/db/seed.ts`
- **Change:**
  - New `seedMultiAgentRun(db, workspaceId, repoId)`, called after `seedFixturePrs` (`seed.ts:308`).
  - Skip if #484 already has an `agent_runs` row with `model = 'seed'` and non-null `multi_agent_run_id`.
  - Otherwise insert:
    - the parent with `agent_ids = [API Contract Reviewer, Security Reviewer]`;
    - 2 `done` children (`model 'seed'`, fixed `started_at` / `finished_at`, `duration_ms` 8400 / 11200, `cost_usd` 0.012 / 0.018, `score` 64 / 72, `source 'local'`, `findings_count`, `grounding`);
    - one `reviews` row per child (`run_id`, `agent_id`, `model 'seed'`, summary, verdict);
    - findings on `src/api/payments.ts` (fixture `server/src/db/seed-fixtures.ts:88-118`):
      - API Contract WARNING "Breaking rename of customer_id query param" L14;
      - Security WARNING "Breaking rename of the customer_id query param" L13–14. These group with the one above (similarity 7/8, same severity → no conflict).
      - API Contract WARNING "Response field legacy_reference removed" L26. Security is done and has no member → **conflict** (AC-51).
- **Satisfies:** AC-125
- **Skills:** drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:51` (idempotent by key, never update); `docs/insights.md:29` (a bare seed has no runs; this adds run-linked data on #484 only)
- **Owner:** implementer
- **Depends on:** Steps 6, 17
- **Done when:** `cd server && pnpm db:seed` run twice leaves exactly one parent on #484. `GET /multi-agent-runs/<id>` shows 2 `done` columns and 2 groups, exactly 1 with `conflict: true`.

### Step 19 — Build the index route `/multi-agent-review`
- **Files:** `client/src/app/multi-agent-review/page.tsx` (NEW), `client/src/app/multi-agent-review/_components/MultiAgentIndexView/{MultiAgentIndexView.tsx, styles.ts, index.ts}` (NEW)
- **Change:**
  - A thin page.
  - The view uses `useMultiAgentRuns`. Rows, newest first: `#number` + plain-text title, agent count, status, `formatSecondsCost`, link to `/multi-agent-review/<id>` (AC-117).
  - Empty state with a "Configure run" action → `/multi-agent-review/new` (AC-118).
  - `AppShell` crumb.
  - A `data-run-row` attribute on each row for e2e.
- **Satisfies:** AC-117, AC-118, AC-122 (titles as text)
- **Skills:** frontend-ui-architecture, next-best-practices, react-best-practices
- **Insights:** `client/docs/insights.md:119` (request the route once before typecheck)
- **Owner:** implementer
- **Depends on:** Steps 12, 13, 14
- **Done when:** under `pnpm dev`, `curl -s localhost:3000/multi-agent-review` returns 200; then `cd client && pnpm typecheck && pnpm arch:check` are green.

### Step 20 — Build the Configure run route `/multi-agent-review/new`
- **Files:** `client/src/app/multi-agent-review/new/page.tsx` (NEW, `<Suspense>`), `client/src/app/multi-agent-review/_components/ConfigureRunView/{ConfigureRunView.tsx, constants.ts, styles.ts, index.ts, _components/AgentCard/{AgentCard.tsx,index.ts}}` (NEW)
- **Change:**
  - Breadcrumb, title and subtitle (AC-71).
  - Step 1 uses vendor `SelectInput` / `SearchableSelect` over `usePulls(activeRepo.id)`, placeholder and "#n · title" (AC-72). `?pr=` preselects only if the id is in the list (AC-73, AC-74).
  - Step 2: an empty state until a PR is chosen (AC-75). Then one `AgentCard` per agent: checkbox, name, description, estimate or "—" + "no history" (AC-76, AC-80, AC-81).
  - Selection: `initialAgentSelection` applied on first display (AC-77, AC-78). "Select all" (AC-82).
  - Palette: `constants.ts` `PALETTE = [{ color: "var(--…)", icon: IconName }, …]` indexed by position modulo length (AC-79).
  - Footer: "Run multi-agent review (N)", disabled without a PR or at 0 (AC-83, AC-84); `≈ Ts · $C · parallel` + "partial" (AC-85, AC-86).
  - Launch via `useRunReview` → navigate (AC-87). On error, show the message and keep the state (AC-88).
- **Satisfies:** AC-71–AC-88, NFR-9 (Select all, checkboxes)
- **Skills:** frontend-ui-architecture, next-best-practices, react-best-practices
- **Insights:** `client/docs/insights.md:70` (derive selection, don't store stale copies); `client/docs/insights.md:119`
- **Owner:** implementer
- **Depends on:** Steps 4, 13, 14
- **Done when:** `curl -s localhost:3000/multi-agent-review/new` returns 200 under `pnpm dev`; `cd client && pnpm typecheck && pnpm arch:check` are green.

### Step 21 — Build the results route `/multi-agent-review/[id]`
- **Files:**
  - `client/src/app/multi-agent-review/[id]/page.tsx` (NEW, `<Suspense>`)
  - `client/src/app/multi-agent-review/_components/MultiAgentResultsView/{MultiAgentResultsView.tsx, styles.ts, index.ts}` (NEW) with `_components/{ResultsHeader, ViewToggle, ScoreRing, AgentColumns, AgentColumn, AgentTabs, DisagreementSection}/` (each `X.tsx` + `index.ts`)
- **Change:**
  - **View:** `useMultiAgentRun(id)`. 404 → a not-found state with a link to `/multi-agent-review` (AC-94).
  - **Header:** breadcrumb, title, "N selected agents · parallel", "Configure run" → `/new?pr=<pr_id>` (AC-89, AC-90). Subheader `#n title` + `N agents · parallel · Ts total · $C` + "partial" (AC-91, AC-92).
  - **ViewToggle:** native buttons with `aria-pressed`, writes `?view=` via `router.replace` (AC-93).
  - **AgentColumns:** columns in `columns` order (AC-95), with `data-agent-column`. Each `AgentColumn` header shows name, `formatSecondsCost`, `ScoreRing` (null → "—", AC-96, AC-97) and status.
    - Body while `queued` / `running`: `LiveLogStream` over `eventsToLog(useRunEvents([run_id]).events)`, so one SSE per unsettled column (AC-98, NFR-7). When the stream ends, invalidate the detail query (AC-99).
    - Body when `failed`: `error` text (AC-101).
    - Otherwise: `FindingCard showLearn onAction=useMultiAgentFindingAction` (AC-100, AC-108, AC-109).
    - Footer: "View trace" + "N findings" (AC-102).
  - **AgentTabs:** vendor `Tabs` labelled "name · score", with `data-agent-tab` (AC-104). Panel shows `ScoreRing`, name, summary as plain text, "View trace", seconds and cost (AC-105). Findings as `FindingCard showLearn` (AC-106, AC-107, AC-110).
  - **"View trace"** in both modes opens the shared `RunTraceDrawer` with `runId`, `agentName`, `findings`, and `running` when unsettled (AC-103).
  - **DisagreementSection** below both modes: "Where agents disagree" + `Toggle` "Show only conflicts", default on (AC-111). Uses `visibleGroups` (AC-112, AC-113). Rows show `file:start` + plain title + takes in `columns` order (AC-114), each labelled with name and severity / "did not flag" / "no result" (AC-115), with `data-conflict-row` when `conflict`. Empty + on → "No conflicts — …" (AC-116).
  - Everything is rendered with `FindingCard` / `Markdown` exactly as on the PR page, titles as text (AC-122).
- **Satisfies:** AC-89–AC-116, AC-122, NFR-7, NFR-9 (toggle, tabs, conflicts toggle, finding actions)
- **Skills:** frontend-ui-architecture, next-best-practices, react-best-practices
- **Insights:** `client/docs/insights.md:139` (the drawer streams only when `running` is passed); `client/docs/insights.md:96` (primitives drop `aria-label`, so wrap with a `label`); `client/docs/insights.md:114` (`borderColor` shorthand warning)
- **Owner:** implementer
- **Depends on:** Steps 4, 10, 11, 13, 14
- **Done when:**
  - `curl -s localhost:3000/multi-agent-review/00000000-0000-0000-0000-000000000000` returns 200 under `pnpm dev`;
  - `cd client && pnpm typecheck && pnpm arch:check && pnpm test` are green;
  - manual: the seeded run (after Step 18) renders in both modes in `dark` and `light`.

### Step T1 — Write the server unit tests
- **Files:**
  - `server/test/contracts.test.ts` (extend): `agentIds` 0 / 7 rejected, 1 / 6 accepted; verdict union; `cost_partial`; `RunEstimate` nulls.
  - `server/test/multi-agent-domain.test.ts` (NEW): status matrix AC-34–AC-37; totals AC-38–AC-40; AC-41; grouping AC-42–AC-49 incl. a transitive chain, the 3-line gap boundary, similarity exactly 0.5, file-order code-unit sort; takes and conflict AC-51–AC-56; median and estimates AC-59, AC-60; deleted-agent column ordering.
  - `server/test/multi-agent-helpers.test.ts` (NEW): DTO shapes.
  - extend the Step 2 `reviews-run-in-slots.test.ts`.
- **Change:** pure tests with no Docker.
- **Satisfies:** AC-2, AC-7–AC-12, AC-20–AC-23, AC-34–AC-57, AC-59, AC-60, NFR-1
- **Skills:** backend-onion-architecture (testing by ring)
- **Insights:** `server/docs/insights.md:64` (the unit suite reaps dev runs; don't run it mid-review)
- **Owner:** test-writer
- **Depends on:** B4
- **Done when:** `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` is green.

### Step T2 — Write the server integration tests
- **Files:** `server/test/multi-agent.it.test.ts` (NEW), `server/test/mcp.it.test.ts` (extend)
- **Change:** `startPg` + `seed`; `buildApp` overrides `openai`, `anthropic`, `openrouter`, `github`, plus a test-local gated `LLMProvider` (deferred completions, call counter).
  - **Trigger:**
    - `agentIds` with duplicates → one run per distinct id + 1 parent with `agent_ids` (AC-13–AC-15);
    - unknown or non-uuid id → 404 and 0 rows (AC-16); `[]` / 7 ids → 400 and 0 rows (AC-17);
    - mixed with `agentId` / `all` → 400 `invalid_run_request` (OQ-1);
    - `agentId` / `all` → no parent, `multi_agent_run_id: null` (AC-3, AC-18).
  - **Executor:** 6 agents gated → 4 `running` + 2 `queued`; release one → the 5th by request order (AC-20, AC-22); 3 agents → all `running` before any settles (AC-21); one throwing provider → the others `done` (AC-23); no patches + no clone → all `failed` with the load error (AC-24); exactly 1 intent call (AC-19, NFR-2); a log spy sees the parent line and the per-agent `running` count (NFR-10).
  - **MCP:** `run_agent_on_pr` `all: true` with 5 enabled agents keeps ≤ 4 running (AC-25).
  - **Learn:** sets `learned_at`, keeps accept/dismiss, 0 LLM calls (AC-26, AC-28, AC-29); cross-workspace → 404 unchanged (AC-27).
  - **Reads:** list order and fields (AC-31); detail columns order (AC-32); 404 cross-workspace / unknown / non-uuid (AC-33); status / totals / partial cost on real rows (AC-34–AC-40); groups rebuilt after a finding insert, so nothing is persisted (AC-50); estimates over 12 done runs on the current model + one on an old model (AC-58–AC-60).
  - **Seed:** run twice → 1 parent, ≥ 1 conflict group (AC-125).
  - **Timing:** p95 of 20 `inject` calls (NFR-4: 6 children × 300 findings < 300 ms; NFR-5: 200 parents < 300 ms; NFR-6: 20 agents < 200 ms).
  - AC-30 is left out until spec-creator decides.
- **Satisfies:** AC-3, AC-13–AC-29, AC-31–AC-33, AC-50, AC-58, AC-125, NFR-2, NFR-4, NFR-5, NFR-6, NFR-10
- **Skills:** backend-onion-architecture, drizzle-orm-patterns
- **Insights:** `server/docs/insights.md:126` (override every provider); `server/docs/insights.md:123` (wait for the trace row, not status); `server/docs/insights.md:100` (`new MockLLMProvider('openai', …)` for openrouter); `server/src/modules/reviews/docs/insights.md:37` (#482 has no patches, which helps AC-24)
- **Owner:** test-writer
- **Depends on:** B4, T1 (sequential: both run server suites)
- **Done when:** `cd server && pnpm exec vitest run multi-agent.it mcp.it` passes (needs Docker).

### Step T3 — Write the client component tests
- **Files (all NEW):**
  - `client/src/app/repos/[repoId]/pulls/[number]/_components/RunReviewPopover/RunReviewPopover.test.tsx`
  - `client/src/app/multi-agent-review/_components/MultiAgentIndexView/MultiAgentIndexView.test.tsx`
  - `…/ConfigureRunView/ConfigureRunView.test.tsx`
  - `…/MultiAgentResultsView/MultiAgentResultsView.test.tsx`
  - `…/DisagreementSection/DisagreementSection.test.tsx`
  - `client/src/components/finding-card/FindingCard.test.tsx` (extend: Learn, learned tag)
  - `client/src/vendor/ui/kit/Popover.test.tsx`
- **Change:** RTL with `vi.mock("@/lib/hooks/...")` and `NextIntlClientProvider`.
  - **Popover (AC-61–AC-70):** heading, rows, pre-check, dimmed operable, Clear, N, disabled at 0, the payload `agentIds` + `router.push`, error stays open, Configure link, merged warning.
  - **Configure (AC-71–AC-88):** copy, `?pr=` in / not in the list, empty Step 2, cards, palette by index, `8.4s · $0.01`, "—" + "no history", Select all, footer max / sum / partial, disabled states, payload, error keeps the selection.
  - **Results (AC-89–AC-116, AC-122):** header and subheader, partial label, `view` param parsing, not-found, columns order, score "—", live log only while unsettled (one `useRunEvents` per unsettled column, NFR-7), findings after settle, failed error text, footer count, trace drawer opens for the right run, tabs labels and panel, the actions call the original id, invalidate on success, eval disabled when undecided, conflicts default on / off / empty text, take labels, `**bold**` stays literal in titles.
  - **Index (AC-117, AC-118).**
  - **NFR-9 structural:** native buttons, `role="checkbox"`, `tabIndex ≥ 0`.
  - **AC-121:** a test scans `messages/en/*.json` for "p-queue" / "worktrees".
- **Satisfies:** AC-61–AC-122, NFR-7, NFR-8 (no literals in the new components), NFR-9 (structural)
- **Skills:** react-testing-library
- **Insights:** `client/docs/insights.md:87` (keyboard tests are structural only); `client/docs/insights.md:16` (a fallback test that cannot fail); `client/docs/insights.md:75` (no `toHaveBeenCalledExactlyOnceWith`); `client/docs/insights.md:102` (tests are cruised)
- **Owner:** test-writer
- **Depends on:** B5 (runs in parallel with T1 / T2; disjoint package)
- **Done when:** `cd client && pnpm test && pnpm arch:check` are green.

### Step T4 — Write the e2e flow 14
- **Files:** `e2e/specs/15-multi-agent-review.flow.json` (NEW)
- **Change:**
  1. `open {BASE}/multi-agent-review` → `wait --text "Tighten /v1/payments query params"`.
  2. `eval` scroll-into-view on the row, then `find text "Tighten /v1/payments query params" click --exact` → `wait --url "/multi-agent-review/"` → `wait --text "Where agents disagree"`.
  3. `eval "document.querySelectorAll('[data-agent-column]').length===2"` with `stdoutIncludes "true"` (Columns, 2).
  4. `find role button --name "Tabs" --exact click` → `wait --url "view=tabs"` → `eval "…[data-agent-tab]…length===2"` → `"true"`.
  5. `eval "document.querySelectorAll('[data-conflict-row]').length>=1"` → `"true"`.

  No launch, no chat, no LLM.
- **Satisfies:** AC-123
- **Skills:** none apply
- **Insights:** `e2e/docs/insights.md:21` (`--exact`); `:24` (`wait --url` is a substring); `:27`, `:40` (scroll into view before a click); `:30` (RSC script collisions); `:9` (stop the dev web before hermetic); `:38` (rate limit is lifted by `scripts/e2e.sh`)
- **Owner:** test-writer writes it; the main session or user runs `npm run e2e:hermetic`, since test-writer may not (`.claude/agents/README.md` test-writer row)
- **Depends on:** Steps 18, 21
- **Done when:** `cd e2e && npm run typecheck` is green and `npm run e2e:hermetic` passes all 14 flows.

## Batches

Lanes: after B1, the **server lane** (B2 → B4) and the **client lane** (B3 → B5) run **in parallel**, as the caller asked and as SPEC-03 did successfully (`docs/insights.md:206`). This is safe here because:
- the lanes write disjoint trees (`server/**` vs `client/**`);
- the only shared files, the two vendor contract copies, are frozen in B1;
- the HTTP shapes the client consumes are fixed by Step 1's contracts and Step 17's routes in this plan, not by B4's code;
- each lane runs only its own package's suites, so the server unit suite is never raced.

Inside a lane, batches are strictly sequential. Each batch goes to a fresh `implementer`.

| Batch | Steps | Why together | Gate at the end |
|---|---|---|---|
| B1 — contracts + pure centre | 1, 2, 3, 4 | Both contract copies plus every pure function the lanes import; crosses server, client and the agent-runner typecheck | `diff` of the 3 contract pairs is empty; `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `cd client && pnpm typecheck && pnpm arch:check && pnpm test`; `cd agent-runner && pnpm typecheck` |
| B2 — server: data, trigger, executor (server lane) | 5, 6, 7, 8, 9 | Schema → migration → repository → trigger and Learn → concurrent executor; one module, centre outwards | `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm exec vitest run reviews.it reviews-skills.it run-queue.it mcp.it intent.it` (Docker) |
| B3 — client foundations (client lane, ∥ B2) | 10, 11, 12, 13, 14, 15 | Shared-component moves, design-system popover, nav, hooks, copy, and the PR-page popover that uses them | `cd client && pnpm typecheck && pnpm arch:check && pnpm test` |
| B4 — server: multi-agent module + seed (server lane, after B2) | 16, 17, 18 | The new read module from the centre outwards, then the seed it serves | `cd server && pnpm typecheck && pnpm arch:check && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `pnpm db:seed` twice → 1 parent on #484; `curl` of `/multi-agent-runs` and its detail |
| B5 — client: multi-agent routes (client lane, after B3; ∥ B4) | 19, 20, 21 | The three pages of one route area | request the 3 routes once under `pnpm dev`, then `cd client && pnpm typecheck && pnpm arch:check && pnpm test`; manual `dark` / `light` pass once B4 has seeded |

After both lanes join: T1 → T2 (sequential, server), and T3 in parallel with them (client). T4 runs last. Fallback: if the parallel lanes collide, run B2 → B3 → B4 → B5 sequentially; the steps do not change.

## Requirements coverage

| Requirement | Steps | Proved by |
|---|---|---|
| AC-1 | 1 | B1 `diff` gate; `verify` |
| AC-2 | 1 | T1 `contracts.test.ts` |
| AC-3 | 1, 8 | T2 (`multi_agent_run_id` set / null) |
| AC-4, AC-5, AC-6 | 1, 7 | T1 contracts; T2 detail / Learn response |
| AC-7, AC-8, AC-9, AC-10, AC-11, AC-12 | 1, 3 | T1 contracts + domain |
| AC-13, AC-14, AC-15 | 2, 7, 8 | T2 trigger |
| AC-16, AC-17, AC-18 | 8 | T2 trigger |
| AC-19 | 9 | T2 (1 diff load, 1 intent call) |
| AC-20, AC-21, AC-22, AC-23 | 2, 9 | T1 `runInSlots`; T2 gated LLM |
| AC-24 | 9 | T2 (#482 has no patches) |
| AC-25 | 9 | T2 `mcp.it` |
| AC-26, AC-27, AC-28, AC-29 | 7, 8 | T2 Learn |
| AC-30 | — | **uncovered**: spec conflict, see Recommendation 4 |
| AC-31, AC-32, AC-33 | 3, 16, 17 | T2 reads |
| AC-34 – AC-41 | 3, 7, 17 | T1 domain; T2 on real rows |
| AC-42 – AC-49 | 3 | T1 domain |
| AC-50 | 3, 16 | T2 (group set changes after a finding insert; no group table) |
| AC-51 – AC-56 | 3 | T1 domain; T2 seed conflict |
| AC-57 | 3 | T2 (0 LLM calls across the GET routes); code review |
| AC-58, AC-59, AC-60 | 3, 16, 17 | T1 median; T2 estimates |
| AC-61 – AC-70 | 4, 12, 13, 14, 15 | T3 popover test |
| AC-71 – AC-88 | 4, 13, 14, 20 | T3 configure test |
| AC-89 – AC-116 | 4, 10, 11, 13, 14, 21 | T3 results / disagreement tests; T4 (AC-95, AC-104, AC-112) |
| AC-117, AC-118 | 19 | T3 index test |
| AC-119, AC-120 | 12 | T3 / `app-shell/helpers.test.ts`; manual sidebar |
| AC-121 | 14 | T3 message scan; `rg` gate in Step 14 |
| AC-122 | 11, 19, 21 | T3 (`**bold**` literal in title; rationale via `Markdown`) |
| AC-123 | 21, T4 | `npm run e2e:hermetic` |
| AC-124 | — (boundary) | `git diff --stat main -- agent-runner` empty; `cd agent-runner && pnpm typecheck && pnpm test` |
| AC-125 | 18 | T2 seed-twice test; B4 gate |
| NFR-1 | 2, 8, 9 | T1 / T2 (max 4 running; 7 ids → 400) |
| NFR-2 | 3, 9 | T2 call counter |
| NFR-3 | 8 | code review: `routes.ts:31` config unchanged (the limit is off under `NODE_ENV=test`) |
| NFR-4, NFR-5, NFR-6 | 5, 16 | T2 p95 timings |
| NFR-7 | 21 | T3 (one `useRunEvents` per unsettled column) |
| NFR-8 | 14, 19–21 | T3 + review; **partially uncovered** for the nav literals (spec conflict) |
| NFR-9 | 12, 15, 20, 21 | T3 structural; manual Tab / Enter / Space pass and both themes |
| NFR-10 | 8, 9 | T2 log spy |

## Skills the implementer must apply

| Path / glob | Skill | Why it applies |
|---|---|---|
| `{server,client}/src/vendor/shared/contracts/{observability,review-api,platform}.ts` | zod, typescript-expert | contract changes with caps, unions, nullability |
| `server/src/modules/reviews/{constants,helpers}.ts`, `server/src/modules/multi-agent/{constants,domain,ports,helpers}.ts` | backend-onion-architecture, typescript-expert | domain ring; pure, exact filenames |
| `server/src/db/schema/{runs,reviews}.ts` | drizzle-orm-patterns, postgresql-table-design | new FK, timestamps, jsonb, indexes |
| `server/src/modules/{reviews,multi-agent}/repository*` | drizzle-orm-patterns, postgresql-table-design, backend-onion-architecture | transaction, window query, scoped reads |
| `server/src/modules/reviews/{service,findings,run-executor}.ts`, `multi-agent/service.ts` | backend-onion-architecture | application ring; baselined files must not gain debt |
| `server/src/modules/{reviews,multi-agent}/routes.ts`, `multi-agent/compose.ts`, `modules/index.ts` | fastify-best-practices, backend-onion-architecture, zod, security | 400 / 404 mapping, response schemas, workspace scoping |
| `server/src/db/seed.ts` | drizzle-orm-patterns | idempotent insert-only seeder |
| `client/src/components/{run-trace-drawer,finding-card}/**` | frontend-ui-architecture, react-best-practices, react-testing-library | promotion to shared scope; moved tests |
| `client/src/vendor/ui/{kit/Popover.tsx,kit/index.ts,nav.ts}` | frontend-ui-architecture | extend the design system with a new file; domain-free |
| `client/src/lib/multi-agent.ts`, `client/src/lib/hooks/{multi-agent,reviews,index}.ts` | frontend-ui-architecture, react-best-practices | pure helpers; query hooks with conditional polling |
| `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/src/app/multi-agent-review/**` | frontend-ui-architecture, next-best-practices, react-best-practices | new route area, thin pages, Suspense, popover |
| `server/test/**`, `client/src/**/*.test.tsx` | react-testing-library (client), backend-onion-architecture (server testing by ring) | test steps |
| any newly found dead end or quirk | engineering-insights | record it in the nearest `docs/insights.md` |

## Verification

| Command | cwd | Triggered by | Expected |
|---|---|---|---|
| `diff server/src/vendor/shared/contracts/<f> client/src/vendor/shared/contracts/<f>` for `observability.ts`, `review-api.ts`, `platform.ts` | repo root | Step 1 | no output |
| `pnpm typecheck` | `server` | `server/**/*.ts` (needs `reviewer-core/node_modules`, `docs/insights.md:143`) | exit 0 |
| `pnpm arch:check` | `server` | `server/src/**` | no new violation |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server` | `server/src/**` | all pass (not while a dev review is in flight) |
| `pnpm exec vitest run reviews.it reviews-skills.it run-queue.it mcp.it intent.it multi-agent.it` | `server` | reviews, executor, MCP, new module, seed | pass; **needs Docker** |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` (×2) | `server` | Steps 5, 6, 18 | additive SQL; migrate OK; one seeded parent |
| `pnpm typecheck` | `client` | `client/**/*.{ts,tsx}` | exit 0 (after requesting the 3 new routes once under `pnpm dev`) |
| `pnpm arch:check` | `client` | `client/src/**` | 0 violations |
| `pnpm test` | `client` | `client/src/**` | all pass |
| `pnpm typecheck` and `pnpm test` | `agent-runner` | shared contract copy 1 (AC-124) | exit 0; no file changed (`git diff --stat -- agent-runner` empty) |
| `npm run typecheck` | `e2e` | `e2e/specs/14-*.json` (runner unchanged) | exit 0 |
| `npm run e2e:hermetic` | `e2e` | flow 14, seed, client | 14/14 pass; **needs Docker**; stop the dev web :3000 first |
| `pnpm verify` | repo root | everything above except IT / e2e | all lanes PASS |
| `rg -n "p-queue\|worktrees" client/messages client/src` | repo root | AC-121 | no output |

## Risks, dead ends already recorded

- **Parallel lanes.** The caller asked for B2 ∥ B3 and B4 ∥ B5. The agent rules say "never in parallel", because of shared files and server-suite races. This plan avoids both: disjoint package trees, contracts frozen in B1, client lanes never run server suites. If a lane needs to edit a contract file, stop and re-run B1's gate sequentially.
- **The unit suite reaps dev runs.** `routes-smoke.test.ts` boots `buildApp` on the dev DB (`server/docs/insights.md:64`). Since the reaper now also writes `finished_at`, a launch reaped this way shows a finished parent (`partial` / `failed`).
- **Hidden live calls in IT.** An IT that misses the `openrouter` override makes a real intent call and flakes as a timeout (`server/docs/insights.md:126`).
- **Additive migration only.** Mixing a drop into the same generate hangs drizzle-kit (`server/docs/insights.md:10`).
- **New debt in baselined files.** It is invisible to `arch:check` (`server/docs/insights.md:27`). Reviewers should read the diff of `run-executor.ts` and `service.ts` for new `schema` / `AgentRow` uses.
- **Response serialization.** The `MultiAgentRun` response schema validates `FindingRecord.category` / `kind` enums. A persisted finding with an out-of-enum value would 500 the detail route, unlike the schema-less `/pulls/:id/reviews`. Seeds and the engine emit valid values.
- **More visible cancel holes.** Concurrency makes the cancel holes easier to hit (`server/src/modules/reviews/docs/insights.md:106`). Out of scope, unchanged.
- **MCP and API are separate processes.** MCP-started runs remain invisible to the studio's SSE (`server/docs/insights.md:36`). AC-25 is about concurrency only.
- **New-route typecheck.** New routes fail typecheck until requested once (`client/docs/insights.md:119`).
- **Hermetic vs dev web.** Hermetic e2e next to a running dev web rewires it to :3101 (`e2e/docs/insights.md:9`).
- **Seeded trace.** The seeded children have no `run_traces` row, so "View trace" on the seeded run shows an empty trace. AC-123 does not assert it.
- **No new dependency is introduced.**

## Open questions

- **AC-52 reading (assumed).** "Agents … assigned different severities" is compared on each agent's take verdict (its most severe member), not on every member severity. The only case where the two readings differ: A = {CRITICAL, WARNING}, B = {CRITICAL} → not a conflict under the assumed reading. T1 pins it. Route to spec-creator if the user wants member-level comparison.
- **AC-40 "start" (assumed)** = the new `agent_runs.started_at`, set on `queued → running`. "Finish" = the new `finished_at`. While nothing has finished, the total is 0. Confirm if the launch time (`ran_at`) is the preferred start instead.
- **Deleted agents.** `AgentColumn.agent_id` / `agent_name`, `ConflictTake.agent_id` / `persona` and `LocationGroupMember.agent_id` are made nullable for the spec's edge case. A deleted agent's column fills its selection slot by elimination, which is exact for one deleted agent and arbitrary between two.
- **AC-33 / AC-16 non-uuid ids** answer 404 by a service check rather than 422 from `IdParams`. This deviates from the module convention on purpose.
- **Running `npm run e2e:hermetic`** is outside test-writer's allowed commands. The main session or the user runs it for T4.
- **Spec anchors to re-resolve later (not conflicts).** `server/docs/specs/multi-agent-review.md:72` cites `../../src/db/AGENTS.md` by phrase; fine. The overview cites `run-executor.ts:147` and `routes.ts:31`; still correct today, but they will drift once Steps 8 and 9 land. doc-writer re-resolves them by symbol (`docs/insights.md:40`).

## Handoff

1. Main session: Step 0 scaffold.
2. `implementer` B1 (one fresh run). Then, in parallel: lane S = `implementer` B2 → `implementer` B4; lane C = `implementer` B3 → `implementer` B5. Each batch ends on its gate.
3. `plan-verifier` (Steps mode) against Steps 0–21.
4. `test-writer` T1 → T2 (server, sequential), with T3 (client) in parallel. Then T4; the main session or user runs `npm run e2e:hermetic`.
5. `/code-review` over the whole diff.
6. `architecture-reviewer` for:
   - Step 9 (executor in a baselined file);
   - Steps 3, 16, 17 (new module, ports, composition, registry);
   - Steps 10, 11 (promotion of route components to `src/components`);
   - Step 12 (new design-system file + nav).
7. `security-review` for Steps 8 and 17 (untrusted `agentIds`, workspace scoping, the 400/404 paths, cost amplification capped at 6 / 4) and Step 21 (LLM text rendering, AC-122).
8. `implementer` on review findings.
9. `plan-verifier` (Acceptance mode) against AC-1…AC-125 and NFR-1…NFR-10.
10. `spec-creator`, in parallel and as early as possible: resolve **AC-30** and the **NFR-8 nav-label** conflict, then the user re-approves. Optionally confirm the AC-52 / AC-40 readings.
11. `doc-writer`:
    - anchor the `AC-N`s and set `Status: implemented`;
    - move AC-31…AC-60 into `server/src/modules/multi-agent/docs/specs/multi-agent-review.md` only as part of that pass;
    - update the `server/README.md` API map, the `client/README.md` route map, `server/src/modules/reviews/AGENTS.md` (sequential-loop wording, `/learn`) and `server/src/mcp/AGENTS.md` (concurrency inherited).
12. `engineering-insights` entries (below).
13. `pr-self-review` last.

## Confidence

Medium-High. Every anchor, importer, rule and reused symbol named above was opened. Two spec items (AC-30, the NFR-8 nav literals) are routed rather than guessed. Three things would raise it:
- spec-creator's answers on AC-30, NFR-8, and the AC-52 / AC-40 readings;
- a dry `pnpm db:generate` showing purely additive SQL for the FK from `agent_runs` to the later-declared `multi_agent_runs` (`server/src/db/schema/runs.ts:8` vs `:44`);
- a T2 timing run confirming NFR-6 without the optional index (Recommendation 3).

---

Worth recording via `engineering-insights`:
- `server/src/modules/reviews/docs/insights.md`: `POST /findings/:id/reply` has never had a route. `FINDING_ACTIONS` is `['accept', 'dismiss']` (`routes.ts:20`), so it answers Fastify's 404, and the `invalid_action` branch in `findings.ts:31` is unreachable for `reply`.
- `server/docs/insights.md`: `POST /pulls/:id/review` parses its body by hand (`RunRequest.parse`, `routes.ts:34`), and `app.ts:149-162` maps any `ZodError` to **422**. A spec that wants a 400 for a body-shape rule needs an explicit `AppError` mapping in the route.
- `server/src/modules/reviews/docs/insights.md`: before SPEC-06, `agent_runs` had no start or finish timestamps. `ran_at` is the enqueue time, and `duration_ms` is measured from `runOneAgent`'s start, so wall-clock spans across runs were not derivable.
