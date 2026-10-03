# Implementation Plan: Onboarding Tour (SPEC-02)

## Goal
A developer opens **Onboarding Tour** in the studio sidebar and sees a five-section tour of the active repo: Architecture overview, Critical paths, How to run locally, Guided reading path and First tasks. The page has a header, an "On this page" list, Regenerate, Share link, and honest status and staleness banners.

The server builds the tour in four parts:
- **Index facts** come deterministically from read-only `repoIntel.*` index readers.
- **Manifest facts** come from the onboarding module's own `ProjectFileReader` port over the clone.
- **The reading path** is computed over the import graph, ranked by PageRank × (1 + hotness), with hotness taken from the 50-commit resync window.
- **One structured model call** turns the facts into the five sections. When the index is missing, failed or partial, or the call fails, the server stores a deterministic skeleton with an honest status.

Today none of this exists. The only "onboarding" in the studio is the add-repository screen at `/onboarding`, and the unwired pre-L05 scaffolding (contract, table, prompt, copy) is replaced by this plan.

## Requirements
- Source: `docs/specs/onboarding-tour.md`, Spec ID **SPEC-02**, Status **approved** (user approved 2026-10-03), plus its four same-named module parts:
  - `server/src/modules/onboarding/docs/specs/onboarding-tour.md`
  - `server/src/modules/repo-intel/docs/specs/onboarding-tour.md`
  - `client/docs/specs/onboarding-tour.md`
  - `e2e/docs/specs/onboarding-tour.md`
- This plan targets the in-place amendment that spec-creator is applying in parallel:
  - **AC-3** gains `architecture.directories: {path, files}[]`.
  - **AC-42**'s 90 s clock starts when the generation is accepted, on a dedicated runner.
  - The **repo-intel part**'s scope note lists the read-only index readers and the `INDEXER_VERSION` bump.
  - Every other AC-N is unchanged.
  - When this plan was written, the file still showed the pre-amendment text (`docs/specs/onboarding-tour.md:50,101`). Confirm the amendment has landed before B1 starts.
- Covered: AC-1 … AC-107 (all) and NFR-1 … NFR-11 (all). The Non-goals in `docs/specs/onboarding-tour.md:21-32` are out of scope.

## Requirements review
None of these blocks the plan. Each states the assumption the plan makes.

- **AC-35, AC-41, NFR-4 — every provider retries at the transport level today.**
  - OpenAI wraps each structured attempt in `withRetry` (`server/src/adapters/llm/openai.ts:97`), and so does Anthropic (`server/src/adapters/llm/anthropic.ts:100`). Both use the default of 3 retries (`server/src/platform/resilience.ts:46`).
  - The OpenAI and Anthropic SDK clients also retry by default (`openai.ts:52`, `anthropic.ts:46`).
  - The OpenRouter client is built with `maxRetries: 2` (`reviewer-core/src/llm/openrouter.ts:71`). It ignores `req.timeoutMs` and aborts only on a constructor deadline that defaults to 900 s (`:32,145`).
  - `withTimeout` only races the promise; the request is not aborted (`resilience.ts:13-24`).
  - Assumption: "zero retries" means no second HTTP request of any kind, and the 60 s limit must abort the request. Step 10 implements both and tests them at provider level.
  - Recorded in `server/docs/insights.md`, entry "`maxRetries` on a structured LLM request only stops the repair re-prompts; every provider still retries at the transport level".
- **AC-38, AC-39 — a DB error on the index-state read looks like "no index".**
  - `tryGetIndexState` swallows every error (`server/src/modules/repo-intel/repository.ts:205-243`), and the facade then synthesises `no_data` (`server/src/modules/repo-intel/service.ts:189-205`).
  - Step 9 adds a strict `readIndexState`. It returns null only when no row exists; anything else is an error.
- **AC-7, AC-8, AC-12, AC-11 — rank is not always recomputed** (`server/src/modules/repo-intel/docs/insights.md`, entry "Rank is not always recomputed…").
  - The incremental path returns early at `pipeline/incremental.ts:104` (`sha_unchanged`) and `:129` (`no_supported_changes`).
  - The full path skips rank when `softBudgetReached` (`pipeline/full.ts:214`).
  - Per the user's decision, Step 7 bumps `INDEXER_VERSION` (`constants.ts:39`), so every repo fully reindexes, and gains hotness, on its next refresh.
  - A soft-budget full index still writes no `file_rank` rows. AC-49 and AC-50 handle that through the next finding.
- **AC-49, AC-50, AC-73, AC-74 — use the right signals.**
  - `unsupported_language` ⇔ `stats.totalCandidates === 0` (no JS/TS candidate on disk).
  - Candidates > 0 with 0 rank rows (soft budget, or an empty graph block) → `index_partial`.
  - The indexed count is the number of `file_rank` rows. `filesIndexed` is inflated by every incremental refresh (`pipeline/incremental.ts:260`).
  - The candidate count is `stats.totalCandidates`. When it is undefined (a state row written by an incremental refresh before Step 7), use `candidate_files = indexed_files` and treat `bounded` as 0.
  - A persisted `degraded` index status (`types.ts:27`) maps to `index_partial`. So do `partial` and `bounded > 0`.
  - Step 7 makes the incremental path persist the walk stats it already computes (`incremental.ts:218`).
- **AC-64, AC-101 — "no model call" is derived, not stored** (user decision; AC-64 is unchanged).
  - `provider` and `model` always hold the configured `onboarding` feature model, read at generation start (provenance table, `docs/specs/onboarding-tour.md:224`).
  - The studio decides "no model call" with a pure helper `modelCallMade(tour)`. It is false when:
    - `status ∈ {no_data, index_failed, llm_not_configured}`, or
    - `tokens_in === 0 && tokens_out === 0`, every section's origin is `skeleton`, and `status !== 'llm_failed'`.
  - Otherwise it is true, and a null `cost_usd` shows "cost unknown".
  - Residual ambiguity: a `timed_out` run whose call was in flight with no usage reported shows "no model call". This is listed in Open questions.
- **AC-21, AC-22 — the command text per source is assumed.** AC-22 is unchanged (user decision: no `cd <dir> &&` prefix). The rules:
  - `package.json` script → `<pm> run <script>`.
  - Makefile target → `make <target>`.
  - Compose file → `docker compose -f <path> up`.
  - `.nvmrc` → `nvm use`.
  - `engines.node` → `nvm install <first major in range>`.
  - README fenced block in `sh|bash|shell|zsh|console` (or no language) → one command per non-empty, non-comment line, with a leading `$ ` stripped.
  - Duplicates: the first occurrence wins.
  - Collection order: files by depth, then path. Within a directory: `package.json` → `Makefile` → Compose → `.nvmrc`/`engines`. The README comes last.
- **AC-25, AC-26 — manifest reads are owned by onboarding** (user decision).
  - The allow-list, the depth ≤ 1 rule and the secret-name refusal are pure functions in `onboarding/helpers.ts`.
  - Path containment (no `..`, no absolute path, no escaping symlink, no `.git/`) stays in `SimpleGitClient.readFile` / `listFiles` (`server/src/adapters/git/simple-git.ts:130-160`).
  - Lockfiles are checked for existence only, via `listFiles`.
  - Each manifest is capped at 64 KB. A JSON manifest over the cap is skipped as unparseable.
  - Only derived commands, the stack and the README excerpt reach the prompt.
- **AC-44 — what counts as "in the facts".** A cited path is in the facts when it is a file-fact path, a computed critical or reading path, an endpoint's file, a run command's source path, or the README path.
- **AC-29, AC-16, AC-18 — deterministic, filtered critical paths.**
  - Ranked reads have no tie-break (`repository.ts:449-459`), and neither does the next-hop sort (`service.ts:697-705`). Step 9 adds `path ASC` as the secondary key.
  - Chain roots come from unfiltered ranked paths. Step 13 applies the AC-18 exclusion inside `selectCriticalPaths`.
- **AC-18, AC-27 — exclusion predicate.** The repo-intel junk list (`service.ts:730-750`) misses `*.mock.*`, `mocks/` and `fixtures/`. Onboarding owns `isExcludedKind`; Conventions sampling is unchanged (Recommendation 1).
- **AC-30.** Self-edges (imports within one top-level directory) are excluded. Repo-root files form the node `(root)`.
- **AC-33, AC-34, NFR-5 — rate limiting.**
  - The route-level `@fastify/rate-limit` is keyed by IP and not registered under `NODE_ENV=test` (`server/src/app.ts:93-97`).
  - Plan: a per-repo sliding window in the service.
    - It counts every POST, including a deduplicated 202.
    - It checks the rate limit first, then in-flight.
    - It prunes timestamps older than 60 s.
    - It throws a new `RateLimitError` (429).
  - The state is per-process. That is acceptable because no second process generates (`server/docs/insights.md`, entry "Adding a second process against the same Postgres (the MCP server) exposes two single-process assumptions that were previously harmless").
- **AC-42 — the clock starts at acceptance** (user decision; amended AC-42).
  - A dedicated in-process runner with concurrency 1, no `jobs` row and no retries.
  - The deadline is `acceptedAt + 90 s`, so a generation that waits behind another one can end `timed_out`.
- **AC-80, AC-83.** While the first generation is in flight, the empty-state layout stays, with its button showing "Generating…" and disabled.
- **AC-62 — stale.** Stale is computed through `readIndexState`. Null or an error means "not stale". The tour stores the `lastIndexedSha` read at generation start, before the facts are collected.
- **NFR-7 vs AC-69.** Sidebar labels are literals in the design-system nav (`client/src/vendor/ui/nav.ts:29-30`), and `client/messages/en/shell.json:19` already has `nav.onboarding-tour`. The plan follows that convention. Every other new string goes to `client/messages/en/onboarding.json`.
- **NFR-8, AC-91.** User decision: a native SVG/flex node-edge diagram built on theme tokens, with no Mermaid.
- **"Stack" facts.** The user named them, and they are kept. Stack = dependency names from the `package.json` files that pass AC-21's selection, sorted, deduplicated, capped at 40, and wrapped as untrusted. No AC bounds them, so this is infrastructure for AC-36.
- **AC-104.** The empty state needs the seeded repo to have no stored tour. That holds on `e2e:hermetic`, but not on a second `npm test` against a reused DB.

## Recommendations
1. **Share one exclusion predicate between Conventions and onboarding.**
   - **Why:** two "not source" lists will drift (`server/src/modules/repo-intel/service.ts:730-750`).
   - **Trade-off:** widening the shared list changes the Conventions sample.
   - **Affects:** AC-18, AC-27; Steps 9, 13.
2. **Fix the incremental `filesIndexed` inflation as a separate bug.**
   - **Why:** `server/src/modules/repo-intel/pipeline/incremental.ts:260` double-counts the slice, so the Indexed badge is wrong. This plan avoids the field rather than fixing it.
   - **Trade-off:** out of SPEC-02 scope.
   - **Affects:** none.
3. **Make the runner per-repo serial instead of globally serial.**
   - **Why:** with concurrency 1 across all repos and the AC-42 clock starting at acceptance, a generation queued behind another repo's 90 s run can end `timed_out` without ever running.
   - **Trade-off:** more concurrent model calls; contradicts the user's "concurrency 1" decision.
   - **Affects:** AC-42, AC-85; Step 18.

## Constraints that shape this plan
| Constraint | Source | What it forces |
|---|---|---|
| `@devdigest/shared` exists in two copies; change both | `AGENTS.md:27`, `client/AGENTS.md:32`; drift: `docs/insights.md:50` | Steps 1+2 (contract), and Steps 5 and 10 edit `adapters.ts` in both copies |
| The shared barrel is extended with new files | `server/src/vendor/shared/index.ts:13-14` | New `contracts/onboarding.ts`; the legacy block `knowledge.ts:28-47` is removed |
| Migrations are generated, never hand-edited, and not run on boot | `AGENTS.md:28,33`, `server/src/db/AGENTS.md:6,10` | Step 4 runs `pnpm db:generate` + `pnpm db:migrate` |
| `db:generate` hangs if one table both gains and loses columns | `server/docs/insights.md`, entry "`pnpm db:generate` blocks forever when one table both gains and loses a column — split it into two generates" | Step 3 is additive only |
| Every domain table has `workspace_id`, and every query scopes by it | `server/src/db/AGENTS.md:5` | `workspace_id NOT NULL`; legacy rows deleted (Step 4) |
| Only repositories touch the DB; only routes know Fastify; services take ports, not the Container; no cross-module imports; the application ring has no direct I/O | `server/.dependency-cruiser.cjs:40,52,76,89,121`; `server/src/modules/AGENTS.md:17-21` | Onboarding file layout; the runner in `compose.ts` uses no I/O library |
| The purity gate covers only the exact names `domain`, `ports`, `helpers` and `constants.ts` | `server/docs/insights.md`, entry "`domain-files-are-pure` only checks files DIRECTLY under `src/modules/<m>/`…" | Pure logic in those names; `prompt.ts` purity is a review item |
| The feature model is resolved through the container | `server/src/modules/conventions/docs/insights.md:8`; `server/src/platform/container.ts:123` | `container.featureModel(ws, 'onboarding')` |
| `container.llm()` throws `ConfigError` when a key is missing | `server/src/platform/AGENTS.md:4`; `server/src/platform/container.ts:194-212` | `llm_not_configured` (AC-40) |
| The facade "never throws" only for missing data | `server/src/modules/repo-intel/docs/insights.md:27` | Every index read sits in a catch that maps to `index_failed` |
| Consumers use the facade, never the pipeline; structural ports (blast precedent) | `server/src/modules/repo-intel/AGENTS.md:5-6`; `server/src/modules/blast/ports.ts:11` | `OnboardingIndexReader` and `ProjectFileReader` are structural ports |
| Clone reads use the contained `GitClient` reads, never `.git/` | `server/docs/insights.md`, entry "Every clone's `.git/config` holds the GitHub token — never let a user-chosen path read inside `.git/`"; `server/src/adapters/git/simple-git.ts:130-160` | `ProjectFileReader` = `container.git.listFiles` + `readFile` |
| A new adapter method needs a mock that does not bypass overridable siblings | `server/src/adapters/AGENTS.md:6`; `server/docs/insights.md`, entry "A new method on a port must DELEGATE inside `MockGitClient`, not re-read `opts`…" | Step 5 |
| Errors are thrown as classes; numeric statuses live only in `errors.ts` | `server/AGENTS.md:27`; `server/src/platform/errors.ts:7-41` | `RateLimitError`; `reply.status(202)` as in `conventions/routes.ts` (`reply.status(201)`) |
| Untrusted text goes through `wrapUntrusted` / `escapeUntrustedContent` | `reviewer-core/src/prompt.ts:62-84`, `reviewer-core/src/index.ts:17` | Step 14 (AC-65, AC-66) |
| Client: copy via `useTranslations`; no `fetch` in components; folders entered through `index.ts`; both themes | `client/AGENTS.md:25-29`; `client/.dependency-cruiser.cjs:45,59,97` | Steps 21–26 |
| The `Markdown` primitive accepts only `children` | `client/src/vendor/ui/primitives/Markdown.tsx:6` | Step 24 adds one optional prop (no `components` passthrough exists) |
| `activeKeyFor` lights "Onboarding Tour" for `/onboarding` | `client/docs/insights.md:42`; `client/src/components/app-shell/helpers.ts:29` | Step 22 |
| A new client route fails typecheck until Next compiles it | `client/docs/insights.md:95` | B4 gate note |
| e2e uses seeded data, no LLM, and `--exact` on short text | `e2e/AGENTS.md:15-17`; `e2e/docs/insights.md:20` | Step 31 |

## Touched packages / modules
| Package | Module | Ring / layer | Why it changes |
|---|---|---|---|
| server | `src/vendor/shared/contracts/onboarding.ts` (NEW), `knowledge.ts`, `index.ts` | domain (contracts) | Tour contract AC-1..AC-6; remove the legacy `Onboarding` |
| client | `src/vendor/shared/contracts/onboarding.ts` (NEW), `knowledge.ts`, `index.ts` | contracts copy 2 | Same contract |
| server | `src/vendor/shared/adapters.ts` | port definitions | `GitClient.countFileCommits`; `StructuredRequest.singleAttempt` |
| client | `src/vendor/shared/adapters.ts` | port definitions copy 2 | Same additions |
| server | `src/db/schema/context.ts` + generated migration | infrastructure | `onboarding` table columns |
| server | `src/adapters/git/simple-git.ts`, `src/adapters/mocks.ts` | infrastructure | Commit-count read; mocks |
| server | `src/adapters/llm/openai.ts`, `src/adapters/llm/anthropic.ts` | infrastructure | Single-attempt structured call; test-only `baseURL` seam |
| reviewer-core | `src/llm/openrouter.ts` | adapter inside the pure package | Single attempt + per-request abort |
| server | `modules/repo-intel` (`constants.ts`, `types.ts`, `repository.ts`, `service.ts`, `pipeline/{hotness(NEW),rank,full,incremental}.ts`) | facade + pipeline | Hotness AC-7..AC-14; `INDEXER_VERSION` bump; read-only index readers |
| server | `src/platform/errors.ts` | platform | `RateLimitError` (429) |
| server | `modules/onboarding` (code files NEW), `modules/index.ts` | full module | Generation, storage, routes, serial runner |
| server | `src/prompts/onboarding.system.md` (DELETE) | — | Stale pre-L05 prompt |
| client | `src/lib/hooks/onboarding.ts` (NEW), `src/lib/hooks/index.ts` | data layer | Hooks |
| client | `src/vendor/ui/nav.ts`, `src/vendor/ui/primitives/Markdown.tsx` | design system | Nav item; optional link policy |
| client | `src/components/app-shell/helpers.ts` | shared | Active-key fix |
| client | `src/app/repos/[repoId]/onboarding/**` (NEW) | route | Page, view, sections, native diagram |
| client | `messages/en/onboarding.json` | copy | Replace the stale copy |
| e2e | `specs/10-onboarding-tour.flow.json` (NEW), `README.md` | e2e | AC-104, AC-105 |

## Steps

### Step 1 — Replace the onboarding contract in the server copy of `@devdigest/shared`
- **Files:**
  - `server/src/vendor/shared/contracts/onboarding.ts` (NEW)
  - `server/src/vendor/shared/index.ts`
  - `server/src/vendor/shared/contracts/knowledge.ts`
  - `server/test/contracts.test.ts`
- **Change:** Snake_case zod schemas, following `contracts/project-context.ts`:
  - `OnboardingSectionId`: anchors `architecture`, `critical-paths`, `run-locally`, `reading-path`, `first-tasks`, with an exported order constant.
  - `SectionOrigin` (`model|skeleton`) and `OnboardingStatus` (8 values).
  - The section shapes:
    - `architecture` = `prose`, `directories {path, files}[]` (amended AC-3) and `diagram {nodes ≤12 {id,label}, edges ≤20 {from,to,weight}}`.
    - `critical-paths` and `reading-path` = `entries {path, reason}[]`.
    - `run-locally` = `steps {command, source_path, risky}[]`.
    - `first-tasks` = `tasks {title, description, paths: string[] min 1}[]`.
    - Every section carries `origin`.
  - `OnboardingTour`, with a `sections` tuple in the AC-2 order plus:
    - `repo_full_name`, `commit_sha`, `generated_at`, `status`;
    - `indexed_files`, `candidate_files`, `dropped_file_facts`;
    - `provider`, `model` (non-null, the configured feature model);
    - `tokens_in`, `tokens_out`, `cost_usd|null`.
  - `OnboardingTourResponse {tour|null, stale, generating, last_failed: {status, at}|null}` and `OnboardingGenerateAccepted {generating: true}`.
  - Remove the legacy block (`knowledge.ts:28-47`) and update the barrel comment (`index.ts:7`).
  - Rewrite the legacy `Onboarding.parse` case (`contracts.test.ts:196-210`) to parse a minimal tour.
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
- **Skills:** zod, typescript-expert
- **Insights:**
  - `server/src/modules/onboarding/docs/insights.md:12` (replace the pre-L05 scaffolding)
  - `docs/insights.md:50` (the two shared copies drift)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `cd server && pnpm typecheck` is green, and `pnpm exec vitest run test/contracts.test.ts` passes.

### Step 2 — Mirror the contract in the client copy
- **Files:**
  - `client/src/vendor/shared/contracts/onboarding.ts` (NEW)
  - `client/src/vendor/shared/index.ts`
  - `client/src/vendor/shared/contracts/knowledge.ts`
- **Change:** A byte-identical copy of Step 1's `onboarding.ts`, the same legacy removal, and the barrel export.
- **Satisfies:** AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
- **Skills:** zod
- **Insights:** `docs/insights.md:50`
- **Owner:** implementer
- **Depends on:** 1
- **Done when:** `diff` of the two `onboarding.ts` copies prints nothing, and `cd client && pnpm typecheck` is green.

### Step 3 — Extend the `onboarding` table additively
- **Files:** `server/src/db/schema/context.ts` (`onboarding`, `:120-126`)
- **Change:**
  - Keep `repo_id` (PK, FK cascade), `json` and `generated_at`.
  - Add:
    - `workspace_id uuid NOT NULL` → `workspaces.id` cascade (pattern: `schema/knowledge.ts:12-14`);
    - `commit_sha text NOT NULL default ''`;
    - `status text NOT NULL` (Drizzle `enum` of the 8 statuses);
    - `last_failed_status text NULL`;
    - `last_failed_at timestamptz NULL`.
  - The columns `status`, `commit_sha` and `last_failed_*` are authoritative. `json` holds the tour body, and the mapper overrides the matching JSON fields with the column values.
- **Satisfies:** AC-52, AC-53, AC-54 (storage); infrastructure for AC-1, AC-60
- **Skills:** drizzle-orm-patterns, postgresql-table-design
- **Insights:**
  - `server/docs/insights.md`, entry "`pnpm db:generate` blocks forever when one table both gains and loses a column — split it into two generates"
  - `server/docs/insights.md`, entry "Drizzle's `text('col', { enum: [...] })` is a TypeScript narrowing only — widening one needs NO migration"
  - `server/src/modules/onboarding/docs/insights.md:12`
- **Owner:** implementer
- **Depends on:** 1
- **Done when:** `cd server && pnpm typecheck` is green.

### Step 4 — Delete legacy rows, then generate and apply the migration
- **Files:** `server/src/db/migrations/0018_*.sql` and `meta/**` (generated, NEW)
- **Change:**
  - Decision taken before B1: legacy `onboarding` rows have no workspace, and no code has ever written them, so they are deleted, not migrated.
  - Run `docker exec devdigest-postgres psql -U devdigest -d devdigest -tc "select count(*) from onboarding"`. If the count is above 0, run `docker exec devdigest-postgres psql -U devdigest -d devdigest -c "delete from onboarding"`.
  - Then run `cd server && pnpm db:generate && pnpm db:migrate`.
  - Any other database (another developer's, or a long-lived one) needs the same delete before `db:migrate`. Fresh databases, including CI and `e2e:hermetic`, are empty.
  - Never edit the generated SQL by hand.
- **Satisfies:** infrastructure (AC-52..AC-54)
- **Skills:** drizzle-orm-patterns
- **Insights:**
  - `server/docs/insights.md`, entry "`pnpm db:generate` blocks forever…"
  - `server/docs/insights.md`, entry "`pnpm db:migrate` prints three raw Postgres objects that look like errors — they are NOTICEs, read the last line instead"
  - `docs/insights.md:69` (use `psql` via `docker exec`, user `devdigest`)
  - `docs/insights.md:128` (pnpm build-approval gate)
- **Owner:** implementer
- **Depends on:** 3
- **Done when:** exactly one new migration exists, holding only `ADD COLUMN` / `ADD CONSTRAINT` (no `DROP`), and `pnpm db:migrate` ends successfully.

### Step 5 — Add `countFileCommits` to the `GitClient` port, with a real-git test
- **Files:**
  - `server/src/vendor/shared/adapters.ts`
  - `client/src/vendor/shared/adapters.ts`
  - `server/src/adapters/git/simple-git.ts`
  - `server/src/adapters/mocks.ts`
  - `server/test/git-file-commit-counts.test.ts` (NEW)
- **Change:**
  - Add `countFileCommits(repo, maxCommits): Promise<{ commits: number; byPath: Record<string, number> }>` to both copies.
  - `SimpleGitClient`:
    - Make one `git -c core.quotepath=off log -n <max> --name-only -z --format=<sha marker>` read (NFR-6), so non-ASCII paths still join.
    - Find the shallow boundary by resolving `git rev-parse --git-path shallow`, then reading that file with `node:fs` inside the adapter, never through the `readFile` port. A missing file means no boundary.
    - Exclude every boundary commit from the counts. `commits` is the number counted after that exclusion.
    - Document that `--name-only` lists no files for merge commits, so a merge contributes 0 touches.
    - The read is local only.
  - `MockGitClient` returns `opts.fileCommitCounts`, defaulting to `{commits: 0, byPath: {}}`. Grep `extends MockGitClient` in `server/test` first.
  - The test uses a temp origin with more than 50 commits, plus `--depth 1` and `--depth 60` local clones. It asserts:
    - the depth-1 clone gives `commits: 0`;
    - at most 50 commits are counted;
    - the boundary is excluded;
    - a non-ASCII path is counted;
    - two calls give identical results;
    - no network is used (the remote is a local path).
- **Satisfies:** AC-7, AC-8, AC-13, AC-14, NFR-6
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:**
  - `server/docs/insights.md`, entry "A new method on a port must DELEGATE inside `MockGitClient`, not re-read `opts`…"
  - `server/docs/insights.md`, entry "`MockGitClient.readFile` returns `''` for an unknown path instead of throwing"
  - `docs/insights.md:50`
- **Owner:** implementer (the test pins this step's behaviour and is a B2 gate)
- **Depends on:** nothing
- **Done when:** `cd server && pnpm exec vitest run test/git-file-commit-counts.test.ts` passes, and server and client typecheck are green.

### Step 6 — Pure hotness and rank = PageRank × (1 + hotness)
- **Files:**
  - `server/src/modules/repo-intel/pipeline/hotness.ts` (NEW)
  - `server/src/modules/repo-intel/pipeline/rank.ts`
  - `server/src/modules/repo-intel/constants.ts`
  - `server/src/db/schema/repo-intel.ts` (comments `:92-111`)
- **Change:**
  - `computeHotness(indexedFiles, counts)` returns `count / max` over indexed files, or all 0 when the max is 0.
  - `computeFileRank(files, edges, hotness?)` computes `rank = pagerank * (1 + hotness)` and the percentile from that rank. Keep the third parameter optional, so `server/test/repo-intel-rank-map.test.ts` still compiles.
  - Add `HOTNESS_MAX_COMMITS = 50`. Remove the unused `HOTNESS_WINDOW_DAYS` (`constants.ts:50`).
  - Replace the "Option B" comments (`rank.ts:4-7`).
- **Satisfies:** AC-9, AC-10, AC-11, AC-14
- **Skills:** backend-onion-architecture
- **Insights:** `server/src/modules/repo-intel/docs/insights.md`, entry "Rank is not always recomputed…" (`HOTNESS_WINDOW_DAYS` unused)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** `pnpm exec vitest run test/repo-intel-rank-map.test.ts` is green, and typecheck is green.

### Step 7 — Wire hotness into the pipelines, bump `INDEXER_VERSION`, and record stats
- **Files:**
  - `server/src/modules/repo-intel/pipeline/full.ts` (`:212-264`)
  - `server/src/modules/repo-intel/pipeline/incremental.ts` (`:215-253`)
  - `server/src/modules/repo-intel/constants.ts` (`INDEXER_VERSION` `2 → 3`, with a comment explaining why)
  - `server/test/repo-intel-hotness-pipeline.test.ts` (NEW)
- **Change:**
  - Before each `computeFileRank`, call `container.git.countFileCommits(ref, HOTNESS_MAX_COMMITS)` once. On error, use `{commits: 0, byPath: {}}`.
  - Write `stats.hotnessAvailable = commits > 0` and `stats.hotnessCommits = commits`.
  - Incremental: keep the `walkClone` result (`:218`) and spread its stats (`totalCandidates`, `bounded`, `skippedTooLarge`).
  - The version bump makes every existing repo fully reindex, with hotness, on its next refresh. This resolves the early-return gap.
  - The new test uses the harness style of `test/indexer-pipeline.test.ts`, with `MockGitClient({fileCommitCounts})`. It asserts, for both full and incremental:
    - the written rank rows equal PageRank × (1 + hotness);
    - the stats carry `hotnessAvailable` and `hotnessCommits`;
    - a stub container whose `github()` counts calls is never invoked (AC-13).
- **Satisfies:** AC-7, AC-11, AC-12, AC-13, AC-106; infrastructure for AC-1, AC-49, AC-50, AC-74
- **Skills:** backend-onion-architecture
- **Insights:**
  - `server/src/modules/repo-intel/docs/insights.md`, entry "Rank is not always recomputed…"
  - `server/src/modules/repo-intel/docs/insights.md:30` (the indexer's limits don't fire)
  - `server/docs/insights.md`, entry "`arch:check` cannot see debt growing INSIDE a baselined file" (add no new imports)
- **Owner:** implementer (a mandatory B2 gate test)
- **Depends on:** 5, 6
- **Done when:**
  - `pnpm arch:check` reports no new violation;
  - `test/repo-intel-hotness-pipeline.test.ts`, `test/indexer-pipeline.test.ts` and `test/repo-intel-resync.test.ts` are green (update the version-mismatch fixtures if they pin `2`).

### Step 8 — Expose hotness and coverage on the index state
- **Files:**
  - `server/src/modules/repo-intel/types.ts` (`IndexState`, `:39-47`)
  - `server/src/modules/repo-intel/repository.ts` (`tryGetIndexState`, `:205-243`)
- **Change:** Add optional `hotnessAvailable`, `hotnessCommits`, `candidateFiles` and `boundedFiles` to `IndexState`, projected from `stats`.
- **Satisfies:** AC-12; infrastructure for AC-50, AC-74
- **Skills:** backend-onion-architecture, drizzle-orm-patterns
- **Insights:** `server/src/modules/repo-intel/docs/insights.md:27`
- **Owner:** implementer
- **Depends on:** 7
- **Done when:** typecheck is green, and `GET /repos/:id/index-state` includes the fields for a repo indexed after Step 7.

### Step 9 — Add read-only, deterministic index readers to the facade
- **Files:**
  - `server/src/modules/repo-intel/types.ts` (`RepoIntel`, `:136-171`)
  - `server/src/modules/repo-intel/service.ts`
  - `server/src/modules/repo-intel/repository.ts`
- **Change:**
  - New facade methods. They read the index only, let DB errors propagate, and honour `config.repoIntelEnabled` like the existing reads:
    - `readIndexState(repoId): Promise<IndexState|null>` — strict; null only when no row exists (or when the flag is off).
    - `getRankedFiles(repoId): Promise<{path, rank}[]>` — every `file_rank` row, ordered `rank DESC, path ASC`. Structure (the tree and directory counts) is derived from these paths.
    - `getImportEdges(repoId): Promise<{from, to}[]>` — sorted.
    - `getEndpoints(repoId): Promise<{file, endpoint}[]>` — from `file_facts`, sorted by file, keeping the stored order within a file.
  - Add a `path ASC` tie-break to `getRankedPaths` (`repository.ts:449`) and to the `getCriticalPaths` next-hop sort (`service.ts:697-705`).
  - No manifest reading here (user decision).
- **Satisfies:** AC-15, AC-16, AC-29, AC-39; infrastructure for AC-18..AC-30, AC-62, NFR-2
- **Skills:** backend-onion-architecture, drizzle-orm-patterns
- **Insights:**
  - `server/src/modules/repo-intel/docs/insights.md:27`
  - `server/docs/insights.md`, entry "`extractEndpoints` matches line by line — a route whose path is on the next line after `app.get(` is invisible to Blast Radius"
  - `server/src/modules/conventions/docs/insights.md:21` (sampling stays model-free)
- **Owner:** implementer
- **Depends on:** 8
- **Done when:** typecheck and `arch:check` are green, and the existing blast and conventions unit tests are green.

### Step 10 — Single-attempt structured LLM requests, with provider tests
- **Files:**
  - `server/src/vendor/shared/adapters.ts`
  - `client/src/vendor/shared/adapters.ts`
  - `server/src/adapters/llm/openai.ts`
  - `server/src/adapters/llm/anthropic.ts`
  - `reviewer-core/src/llm/openrouter.ts`
  - `server/test/llm-single-attempt.test.ts` (NEW)
- **Change:**
  - Add `singleAttempt?: boolean` to `StructuredRequest`.
  - When it is true, every provider:
    - makes exactly one HTTP request: no `withRetry`, no repair re-prompt, and the SDK request options `{ maxRetries: 0, signal: AbortSignal.timeout(req.timeoutMs) }`, so a timeout really aborts the request;
    - throws on a non-2xx response or a schema-invalid body.
  - OpenRouter uses `req.timeoutMs` for its abort only when `singleAttempt` is set. Otherwise the constructor deadline applies, so default behaviour is unchanged for every existing caller.
  - Give `OpenAIProvider` and `AnthropicProvider` an optional `baseURL` constructor option (a test seam; the default is unchanged). `OpenRouterProvider` already has one.
  - The test starts a local `node:http` fake server that answers 500, 429 and a schema-invalid 200. For each of the three providers it asserts one received request and a thrown error. A 2 s server hang with `timeoutMs: 200` aborts the request.
  - Reuse `MockLLMProvider.calls` (`mocks.ts:62`) for service-level counting; no mock change is needed.
- **Satisfies:** AC-35, AC-41, NFR-3, NFR-4
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:**
  - `server/docs/insights.md`, entry "`maxRetries` on a structured LLM request only stops the repair re-prompts; every provider still retries at the transport level"
  - `server/docs/insights.md`, entry "`MockLLMProvider`'s id is typed `'openai' | 'anthropic'`…"
  - `docs/insights.md:88` (server typecheck needs `reviewer-core/node_modules`)
- **Owner:** implementer (the test pins this step and is a B2 gate)
- **Depends on:** nothing
- **Done when:** `cd reviewer-core && npm run typecheck`, `cd server && pnpm typecheck`, `test/llm-single-attempt.test.ts`, `test/prompt-structured.test.ts` and `test/adapters.test.ts` are all green.

### Step 11 — Add a 429 error class
- **Files:** `server/src/platform/errors.ts`
- **Change:** `RateLimitError extends AppError` with code `rate_limited` and status 429.
- **Satisfies:** AC-34
- **Skills:** backend-onion-architecture, fastify-best-practices
- **Insights:** none apply (checked `server/docs/insights.md`)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** typecheck is green.

### Step 12 — Onboarding domain: statuses, skeletons and grounding
- **Files:**
  - `server/src/modules/onboarding/constants.ts` (NEW)
  - `server/src/modules/onboarding/domain.ts` (NEW)
- **Change:**
  - Constants:
    - Facts: 30 files, 50 endpoints, 20 commands, a 200-entry tree at depth 2, 8 000 README characters, 64 KB per manifest, 24 000 input tokens, 4 000 output tokens.
    - Sections: 12 reading-path entries, 8 critical-path files, 12 nodes and 20 edges, 5 tasks, 10 steps.
    - Timeouts: 60 s for the model call, 90 s for the generation.
    - Rate limit: 5 per 60 s.
    - The log message text.
  - `resolveStatus(signals)` applies the AC-51 order, from these signals:
    - clone present;
    - index state null or throwing;
    - index status (`failed` → `index_failed`; `partial` or `degraded` → `index_partial`);
    - `candidateFiles === 0` → `unsupported_language`;
    - `candidateFiles > 0 && rankedFiles === 0`, or `bounded > 0` → `index_partial`;
    - model configured, timed out, model failed, all-skeleton.
  - `keepsStoredTour` (AC-53).
  - Skeleton builders (AC-55..AC-59); `unsupported_language` gives empty critical and reading entries (AC-49).
  - `groundModelSections` applies AC-31 and AC-43..AC-46, then the per-section fallback of AC-47. It returns `allSkeleton`, defined as follows:
    - It is computed over the sections the model was permitted to fill in this run.
    - `architecture` is always permitted, and counts as model-filled when the grounded prose is non-empty.
    - `critical-paths` and `reading-path` are permitted only when they have computed files and the status is not `unsupported_language`.
    - `run-locally` is permitted only when there are fact commands.
    - `first-tasks` is permitted only when the facts hold at least one citable path.
    - A section with nothing to ground is vacuous: it is excluded from the permitted set and stored as a skeleton.
    - `allSkeleton` = every permitted section is a skeleton (AC-48).
- **Satisfies:** AC-31, AC-43, AC-44, AC-45, AC-46, AC-47, AC-48, AC-49, AC-50, AC-51, AC-53, AC-55, AC-56, AC-57, AC-58, AC-59
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:**
  - `server/docs/insights.md`, entry "`domain-files-are-pure` only checks files DIRECTLY under `src/modules/<m>/`…"
  - `server/src/modules/conventions/docs/insights.md:21` (ground every cited path)
- **Owner:** implementer
- **Depends on:** 1
- **Done when:** typecheck and `arch:check` are green, and both files import only domain-ring code.

### Step 13 — Onboarding facts, manifest selection and graph-derived sections
- **Files:** `server/src/modules/onboarding/helpers.ts` (NEW)
- **Change:** Pure, deterministic functions:
  - `isExcludedKind(path)` — test, mock, fixture, config, `.d.ts`, migration (AC-18).
  - `selectProjectFiles(trackedPaths)` keeps only allow-listed manifest names (`package.json`, `Makefile`, the Compose names, `.nvmrc`) at depth ≤ 1, plus the root README. It refuses:
    - `.env`, `.env.*`, `*.pem`, `*.key` and `secrets*` names;
    - absolute paths and paths with a `..` segment.
  - `lockfilePackageManager(dir, trackedPaths)` — existence only.
  - `extractRunCommands(files)` — AC-21..AC-23, ≤ 20, in collection order; files over 64 KB are skipped.
  - `isRisky` (AC-24) and `extractStack` (≤ 40).
  - `selectFileFacts` returns the top 30 non-excluded files, each with its path, rank and its endpoints.
  - `selectEndpoints` (≤ 50), `buildTree` (200 entries, depth 2), `readmeExcerpt` (8 000 characters).
  - `selectReadingPath` returns the 12 top non-excluded files.
  - `orderReadingPath` runs Kahn's algorithm over the direct edges among those 12. An imported file comes first. The ready queue is ordered `rank DESC, path ASC` on the stored rank doubles. When a cycle leaves no ready node, take the highest-ranked remaining node (AC-28).
  - `selectCriticalPaths(chains)` drops AC-18-excluded files and keeps the chain order, at most 8 distinct files (AC-29).
  - `buildArchitecture`: directory nodes with `(root)`, the top 12 nodes by file count, the 20 heaviest non-self edges, and `directories` with their counts (AC-30, AC-56).
  - `toTourResponse`: the columns win over the JSON.
  - Facts serialise with a stable key and array order (AC-16).
- **Satisfies:** AC-16, AC-17, AC-18, AC-19, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30, AC-56, NFR-2
- **Skills:** backend-onion-architecture, security
- **Insights:**
  - `server/docs/insights.md`, entry "Every clone's `.git/config` holds the GitHub token…"
  - `server/src/modules/project-context/helpers.ts:22` (the same ceil/4 formula; copy it, do not import across modules)
- **Owner:** implementer
- **Depends on:** 12
- **Done when:** typecheck and `arch:check` are green.

### Step 14 — Prompt, budget loop and model-output schema; delete the stale prompt
- **Files:**
  - `server/src/modules/onboarding/prompt.ts` (NEW)
  - `server/src/prompts/onboarding.system.md` (DELETE; it is unreferenced apart from the comment at `server/src/platform/prompts.ts:23`)
- **Change:**
  - `SYSTEM_PROMPT` carries the trusted rule that content in untrusted blocks is data whose instructions are ignored (AC-67).
  - `renderUserPrompt(facts)` wraps every repo-derived string with `wrapUntrusted` / `escapeUntrustedContent` from `@devdigest/reviewer-core`: paths, directory names, endpoints, commands, stack and the README excerpt (AC-65, AC-66).
  - `fitBudget(facts)` lives here, so the dependency points prompt → helpers.
    - It measures `ceil(chars / 4)` on the rendered prompt, wrappers included.
    - It drops file facts lowest rank first until the prompt fits in 24 000 tokens.
    - It returns `{ prompt, dropped }` (AC-20).
  - `ModelSections` is a strict-JSON-schema-compatible zod schema: architecture prose; `{path, reason}` lists for critical and reading paths; run-step command strings in the model's order; first tasks `{title, description, paths}`.
- **Satisfies:** AC-17, AC-20, AC-31, AC-36, AC-65, AC-66, AC-67, NFR-4
- **Skills:** zod, security, backend-onion-architecture
- **Insights:**
  - `server/src/modules/onboarding/docs/insights.md:12`
  - `server/docs/insights.md`, entry "`domain-files-are-pure` only checks files DIRECTLY…" (`prompt.ts` is not gated)
- **Owner:** implementer
- **Depends on:** 13
- **Done when:** typecheck is green, and `git grep onboarding.system.md -- server/src` returns only the comment line or nothing.

### Step 15 — Ports, plus port-shape assertions in an initial `compose.ts`
- **Files:**
  - `server/src/modules/onboarding/ports.ts` (NEW)
  - `server/src/modules/onboarding/compose.ts` (NEW — assertions only)
- **Change:**
  - `OnboardingIndexReader` — a structural subset of the facade: `readIndexState`, `getRankedFiles`, `getImportEdges`, `getCriticalPaths`, `getEndpoints`.
  - `ProjectFileReader` — `listFiles(ref)` and `readFile(ref, path)`, the structural shape of `GitClient`.
  - `TourWriter` — `describe(ws)` returns `{provider, model}`; `prepare(ws)` returns `{configured: false} | {configured: true, write(messages, opts)}`.
  - `OnboardingStore`.
  - `GenerationGate` — `admit(repoId, now)`, `tryBegin(repoId) → token|null`, `isCurrent(repoId, token)`, `end(repoId, token)`, `isInFlight(repoId)`.
  - `GenerationRunner.submit(task)`, `OnboardingLog.info`, `Clock.now`.
  - `compose.ts` starts with compile-time checks, e.g. `const _r: OnboardingIndexReader = {} as Container['repoIntel']`, and the same for `ProjectFileReader` against `GitClient`. A facade drift then fails typecheck early.
- **Satisfies:** infrastructure (AC-15, AC-25, AC-26, AC-32..AC-37, AC-68)
- **Skills:** backend-onion-architecture
- **Insights:** `server/docs/insights.md`, entry "`domain-files-are-pure`…" (`ports.ts` is gated; never import `Container` there)
- **Owner:** implementer
- **Depends on:** 9, 12
- **Done when:** typecheck and `arch:check` are green.

### Step 16 — Onboarding repository
- **Files:** `server/src/modules/onboarding/repository.ts` (NEW)
- **Change:** Every query is scoped by `workspaceId` (pattern: `conventions/repository.ts:28-37`).
  - `getRepo(ws, id)` returns `{id, owner, name, fullName, clonePath}`.
  - `getTour(ws, repoId)` `safeParse`s the `json` column through `OnboardingTour`. A parse failure returns `tour: null`. The columns overlay the JSON.
  - `replaceTour` upserts on `repo_id`, writes the columns and clears `last_failed_*` (AC-52, AC-54).
  - `recordFailedAttempt(ws, repoId, status, at)` (AC-53).
- **Satisfies:** AC-52, AC-53, AC-54, AC-60, NFR-1
- **Skills:** drizzle-orm-patterns, backend-onion-architecture, zod
- **Insights:** `server/docs/insights.md`, entry "`src/db/rows.ts` looks like the sanctioned way to share row types — reaching for it from a service ADDS an arch violation"
- **Owner:** implementer
- **Depends on:** 4, 15
- **Done when:** typecheck and `arch:check` are green.

### Step 17 — Onboarding service: read, request, run
- **Files:** `server/src/modules/onboarding/service.ts` (NEW)
- **Change:** `OnboardingService(deps)` takes ports only.
  - **`getTour(ws, repoId)`:**
    - Throws `NotFoundError` when the repo is not in the workspace.
    - `stale` = `readIndexState()?.lastIndexedSha !== tour.commit_sha`. Null or an error means not stale.
    - Fills `generating` and `last_failed`.
  - **`requestGeneration(ws, repoId)`:**
    1. Throw `NotFoundError` for an unknown repo.
    2. Call `gate.admit`, which counts every POST and prunes timestamps older than 60 s. Over 5 → `RateLimitError`.
    3. If a run is in flight, return accepted without starting a second one.
    4. Otherwise get a token from `tryBegin`, set `acceptedAt = now`, and call `runner.submit(() => runGeneration(…))`.
    5. If submitting throws, call `gate.end` and rethrow.
  - **`runGeneration(ws, repoId, {token, acceptedAt})`:**
    - Race a deadline at `acceptedAt + 90 s`. On expiry the status is `timed_out`, with skeleton sections built from whatever facts the run context has collected so far, or empty sections.
    - Read `describe` (provider and model) and `readIndexState` first, and keep that SHA.
    - No clone, or a null state → `no_data`. A read error, or status `failed` → `index_failed`.
    - Collect facts. Index readers and `ProjectFileReader` are each wrapped, and an index read error → `index_failed`.
    - Compute the sections.
    - `prepare` not configured → `llm_not_configured`.
    - Otherwise make exactly one `write` (`singleAttempt`, 60 s, also raced in the service). A failure, timeout or invalid output → `llm_failed`. Never retry.
    - Ground the output, resolve the status, and build the tour. Tokens are 0 and the cost is null when no call was made (AC-64).
    - Store only if `gate.isCurrent(repoId, token)`, so an orphaned run past 90 s cannot overwrite a newer one. Follow AC-52..AC-55.
    - In `finally`: `gate.end(repoId, token)`, then log exactly one line `{repoId, status, fileFacts, runCommands, tokensIn, tokensOut, durationMs}`. Never log errors, prompt text or repo content.
- **Satisfies:** AC-6, AC-15, AC-17, AC-32, AC-33, AC-34, AC-35, AC-36, AC-37, AC-38, AC-39, AC-40, AC-41, AC-42, AC-49, AC-50, AC-51, AC-52, AC-53, AC-54, AC-55, AC-60, AC-61, AC-62, AC-63, AC-64, AC-68, NFR-3, NFR-5, NFR-10
- **Skills:** backend-onion-architecture, typescript-expert
- **Insights:**
  - `server/src/modules/repo-intel/docs/insights.md:27`
  - `server/src/modules/conventions/docs/insights.md:28` (the missing-key trap)
- **Owner:** implementer
- **Depends on:** 11, 14, 15, 16
- **Done when:** typecheck and `arch:check` are green, and `service.ts` imports no `drizzle-orm`, `fastify`, `platform/container`, `node:*` or adapter.

### Step 18 — Complete `compose.ts`: readers, writer, gate, serial runner
- **Files:** `server/src/modules/onboarding/compose.ts`
- **Change:** `makeOnboardingService(container, log)`, following `blast/compose.ts:12`.
  - The index reader is `container.repoIntel`; the `ProjectFileReader` is `container.git`.
  - `LlmTourWriter`:
    - `describe` → `container.featureModel(ws, 'onboarding')` (AC-37).
    - `prepare` → `container.llm(provider)`. A `ConfigError` means not configured.
    - `write` → `completeStructured({ schema: ModelSections, singleAttempt: true, timeoutMs: 60_000, maxTokens: 4_000, temperature: 0 })`.
  - An in-memory `GenerationGate`: a Map of tokens plus per-repo timestamp arrays.
  - `SerialRunner`: a promise chain with concurrency 1. It writes no `jobs` row and never retries. Each task is wrapped so a rejection is swallowed after the gate ends; no unhandled rejection is possible.
- **Satisfies:** AC-32, AC-33, AC-34, AC-35, AC-37, AC-40, AC-42, NFR-4, NFR-5
- **Skills:** backend-onion-architecture
- **Insights:**
  - `server/src/modules/conventions/docs/insights.md:8`
  - `server/docs/insights.md`, entry "A failed background job can crash the API"
  - `server/docs/insights.md`, entry "Adding a second process against the same Postgres (the MCP server)…"
- **Owner:** implementer
- **Depends on:** 10, 17
- **Done when:** typecheck and `arch:check` are green.

### Step 19 — Routes and module registration
- **Files:**
  - `server/src/modules/onboarding/routes.ts` (NEW)
  - `server/src/modules/index.ts`
- **Change:**
  - `GET /repos/:id/onboarding` with `params: IdParams` and `response: {200: OnboardingTourResponse}`.
  - `POST /repos/:id/onboarding/generate` with `reply.status(202)` and `response: {202: OnboardingGenerateAccepted}`.
  - Both handlers get the workspace through `getContext` and do one service call.
  - Register the module in `modules/index.ts`.
- **Satisfies:** AC-6, AC-32, AC-60, AC-61, AC-63
- **Skills:** fastify-best-practices, backend-onion-architecture
- **Insights:** none apply (checked `server/src/modules/onboarding/docs/insights.md`)
- **Owner:** implementer
- **Depends on:** 18
- **Done when:**
  - `cd server && pnpm arch:check && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` is green;
  - a manual `curl -X POST …/onboarding/generate` against the seeded repo returns `202`;
  - a `GET` then returns a `no_data` tour.

### Step 20 — Module memory
- **Files:**
  - `server/src/modules/onboarding/AGENTS.md`
  - `server/src/modules/repo-intel/AGENTS.md`
  - `server/src/modules/onboarding/docs/insights.md`
- **Change:**
  - Onboarding `AGENTS.md`: the routes, the layers, and the rules — index facts only via `repoIntel.*`, manifests via `ProjectFileReader`, single-attempt call, serial runner, generation token, one log line.
  - Repo-intel `AGENTS.md`: rank includes hotness; `INDEXER_VERSION` is 3; the strict readers exist.
  - Onboarding insights: a correction to the pre-L05 entry saying it has been replaced.
  - Verify the `CLAUDE.md` symlink.
- **Satisfies:** infrastructure
- **Skills:** engineering-insights
- **Insights:** `server/src/modules/onboarding/docs/insights.md:12`
- **Owner:** implementer
- **Depends on:** 19
- **Done when:** both `AGENTS.md` files list the routes and readers, and `readlink server/src/modules/onboarding/CLAUDE.md` prints `AGENTS.md`.

### Step 21 — Client query hooks
- **Files:**
  - `client/src/lib/hooks/onboarding.ts` (NEW)
  - `client/src/lib/hooks/index.ts`
- **Change:**
  - `useOnboardingTour(repoId, {poll})` with `refetchInterval: poll ? 3000 : false`.
  - `useGenerateOnboardingTour(repoId)`: a POST with no body (pattern: `hooks/conventions.ts:32-44`) that invalidates the tour query.
  - Export both from the barrel.
- **Satisfies:** AC-81, AC-82, AC-84, NFR-11
- **Skills:** react-best-practices, frontend-ui-architecture
- **Insights:** `client/docs/insights.md:112` (there is no global fetch mock)
- **Owner:** implementer
- **Depends on:** 2
- **Done when:** `cd client && pnpm typecheck && pnpm arch:check` is green.

### Step 22 — Sidebar entry and active-key fix
- **Files:**
  - `client/src/vendor/ui/nav.ts` (`:25-31`)
  - `client/src/components/app-shell/helpers.ts` (`:29`)
- **Change:**
  - Add `{ key: "onboarding-tour", label: "Onboarding Tour", icon: <existing IconName>, href: "/repos/:repoId/onboarding" }` after `context`.
  - Map only `/^\/repos\/[^/]+\/onboarding(\/|$)/` to `onboarding-tour`, so `/onboarding` gets no tour highlight.
- **Satisfies:** AC-69, AC-70, AC-71
- **Skills:** frontend-ui-architecture
- **Insights:** `client/docs/insights.md:42`
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** client typecheck and `arch:check` are green.

### Step 23 — Replace the onboarding copy
- **Files:** `client/messages/en/onboarding.json`
- **Change:** Rewrite the namespace with every new string:
  - the title; the header lines (AC-73, AC-74); "On this page"; the five section titles;
  - Regenerate, Generating…, Share link, Link copied, Copy, Open, Review before running, Outline · no AI;
  - the stale, timeout and last-failed sentences, and the seven AC-87 sentences verbatim;
  - the AC-102 and AC-103 notices; "cost unknown" and "no model call";
  - the empty-state title and CTA "Generate onboarding tour", with the body text from the design;
  - the diagram's accessible labels.
- **Satisfies:** NFR-7, AC-72, AC-73, AC-74, AC-79, AC-80, AC-83, AC-85, AC-86, AC-87, AC-89, AC-90, AC-96, AC-101, AC-102, AC-103
- **Skills:** next-best-practices
- **Insights:** `client/docs/insights.md:75` (grepping message keys is unreliable)
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** the JSON parses, and every AC-87 sentence appears verbatim.

### Step 24 — Optional link policy on the Markdown primitive
- **Files:** `client/src/vendor/ui/primitives/Markdown.tsx`
- **Change:**
  - The primitive accepts only `children` (`:6`); there is no `components` passthrough to override from outside. So add one optional prop, `isAllowedHref?: (href: string) => boolean`.
  - A rejected link renders its children as plain text. Default behaviour is unchanged.
  - Rendering stays free of raw HTML (no `rehype-raw`).
- **Satisfies:** AC-99, AC-100
- **Skills:** frontend-ui-architecture, react-best-practices, security
- **Insights:** `client/docs/insights.md:72`
- **Owner:** implementer
- **Depends on:** nothing
- **Done when:** client typecheck and `arch:check` are green.

### Step 25 — Section components and the native diagram
- **Files:**
  - `client/src/app/repos/[repoId]/onboarding/_components/OnboardingTourView/_components/{TourSection,ArchitectureSection,ArchitectureDiagram,PathListSection,RunLocallySection,FirstTasksSection,TourMarkdown}/` (NEW, each with an `index.ts`)
  - `.../OnboardingTourView/helpers.ts` (NEW; the shared pure helpers)
- **Change:**
  - `TourSection`: an anchor id, the title, and "Outline · no AI" when the origin is `skeleton`.
  - `TourMarkdown`: `Markdown` with `isAllowedHref = isRepoLink(href, fullName)`, which accepts only `https://github.com/<owner>/<repo>/`.
  - `ArchitectureSection`: the prose, the directory list and an `ArchitectureDiagram`.
    - The diagram is a native SVG/flex component. A pure `layoutDiagram(diagram)` places the nodes deterministically.
    - It draws labelled boxes and directed arrow edges with weight labels, using theme CSS variables only.
    - Labels are React text, never HTML. There is no Mermaid.
  - `PathListSection` (critical and reading):
    - an ordered list of monospace path, reason and "Open";
    - links built with `githubBlobUrl(full_name, commit_sha, path)` (`client/src/lib/github-urls.ts`), opening with `target="_blank" rel="noopener noreferrer"`;
    - the AC-102 notice for `unsupported_language`.
  - `RunLocallySection`: numbered plain-text commands, the source path, a native Copy button (pattern: `PromptBlock.tsx:38-43`) and the risky marker.
  - `FirstTasksSection`: the title, the description and the cited-path links; the AC-103 notice when there are no tasks.
- **Satisfies:** AC-90, AC-91, AC-107, AC-92, AC-93, AC-94, AC-95, AC-96, AC-97, AC-98, AC-99, AC-100, AC-102, AC-103, NFR-8, NFR-9
- **Skills:** frontend-ui-architecture, react-best-practices, security
- **Insights:**
  - `client/docs/insights.md:72` (`MonoLink` drops `aria-*`)
  - `client/docs/insights.md:37`
- **Owner:** implementer
- **Depends on:** 2, 23, 24
- **Done when:** client typecheck and `arch:check` are green.

### Step 26 — Tour page, header, TOC, share, banners, empty state, polling
- **Files:**
  - `client/src/app/repos/[repoId]/onboarding/page.tsx` (NEW, thin; model: `context/page.tsx`)
  - `.../OnboardingTourView/{OnboardingTourView.tsx, constants.ts, styles.ts, useGenerationPolling.ts, index.ts}` (NEW)
  - `.../OnboardingTourView/_components/{TourHeader,TourToc,StatusBanner}/` (NEW)
- **Change:** Inside `AppShell`; the repo comes from `useActiveRepo` (pattern: `ProjectContextView.tsx:9-24`).
  - Header:
    - "Onboarding for <full name>";
    - the coverage line (AC-73, or AC-74 when `indexed_files < candidate_files`), with `useFormatter().relativeTime`;
    - the model and its cost, "cost unknown" or "no model call", decided by `modelCallMade(tour)` (Requirements review);
    - Regenerate and Share link.
  - "On this page": `<a href="#anchor">` that scrolls the section into view and calls `history.replaceState` (AC-76). On mount, scroll to a valid fragment (AC-77).
  - Share: copy `origin + pathname + hash`, then show "Link copied".
  - Banners:
    - stale;
    - status, with a `/settings/models` link for `llm_not_configured`;
    - last failed, followed by its status sentence.
  - The empty state when `tour == null && !generating`.
  - `useGenerationPolling` polls while generating, from the click or from the first time it sees `generating`. It stops after 120 s or 40 refetches and shows the timeout notice.
  - The Generate and Regenerate buttons show "Generating…" and are disabled while a generation is in flight.
- **Satisfies:** AC-72, AC-73, AC-74, AC-75, AC-76, AC-77, AC-78, AC-79, AC-80, AC-81, AC-82, AC-83, AC-84, AC-85, AC-86, AC-87, AC-88, AC-89, AC-101, NFR-7, NFR-8, NFR-9, NFR-11
- **Skills:** frontend-ui-architecture, react-best-practices, next-best-practices
- **Insights:**
  - `client/docs/insights.md:66` (`main` scrolls, not the window)
  - `client/docs/insights.md:19` (decode the design bundle in memory; the tour module is `6b4bd252-f74f-484f-95c0-0574656ffaae`)
  - `client/docs/insights.md:95`
  - `client/docs/insights.md:48`
- **Owner:** implementer
- **Depends on:** 21, 22, 23, 25
- **Done when:**
  - `cd client && pnpm typecheck && pnpm arch:check && pnpm test` is green, after opening `/repos/<id>/onboarding` once under `pnpm dev`;
  - the seeded repo shows the empty state in both themes;
  - a stored tour renders all five sections in both themes.

### Step 27 — Server pure-unit tests derived from the AC
- **Files:**
  - `server/test/onboarding-contract.test.ts` (NEW)
  - `server/test/repo-intel-hotness.test.ts` (NEW)
  - `server/test/onboarding-helpers.test.ts` (NEW)
  - `server/test/onboarding-domain.test.ts` (NEW)
  - `server/test/onboarding-prompt.test.ts` (NEW)
- **Change:** Each `it` is named after its AC and written from the spec text, not from the code.
  - Contract: tuple order, the 12/20 limits, the enums, the `origin` field (AC-1..AC-5).
  - Hotness and rank (AC-9..AC-11, AC-14).
  - Facts:
    - the exclusion kinds and the limits (AC-18, AC-19);
    - run-command sources, prefixes, source paths and the risky flag (AC-21..AC-24);
    - `selectProjectFiles` refuses `.env`, `.env.*`, `*.pem`, `*.key`, `secrets*`, absolute paths and `..`, and keeps only allow-listed names at depth ≤ 1 (AC-25, AC-26);
    - byte-identical facts (AC-16).
  - Sections:
    - the reading path, with cycles and ties (AC-27, AC-28);
    - critical paths with excluded roots (AC-29);
    - the diagram and the directories (AC-30, AC-56).
  - Domain:
    - grounding, `allSkeleton` and the vacuous sections (AC-31, AC-43..AC-48);
    - the status signals and precedence (AC-49..AC-51);
    - the skeleton forms (AC-55..AC-59).
  - Prompt:
    - delimiter escaping and the system rule (AC-65..AC-67);
    - `fitBudget`: the rendered prompt is at most 24 000 estimated tokens, and the lowest-ranked facts are dropped first (AC-20, NFR-4).
  - A synthetic 5 000-file timing check of the fact helpers (NFR-2).
- **Satisfies:** AC-1..AC-5, AC-9, AC-10, AC-11, AC-14, AC-16, AC-18..AC-31, AC-43..AC-51, AC-55..AC-59, AC-65..AC-67, NFR-2, NFR-4
- **Skills:** backend-onion-architecture
- **Insights:** `client/docs/insights.md:13` (delete the guard; keep the test only if it goes red)
- **Owner:** test-writer
- **Depends on:** 20
- **Done when:** the unit suite is green, and every AC listed has a named test.

### Step 28 — Onboarding service unit tests with fakes
- **Files:** `server/test/onboarding-service.test.ts` (NEW)
- **Change:** In-memory fakes for every port, with fake timers. Tests per AC:
  - Facts come only from the readers (AC-15, AC-17).
  - The 202 does not wait for the run. Requests made while a run is in flight are deduplicated. Every POST counts, rate limit before in-flight, so a 6th request → `RateLimitError` with no `write` (AC-32..AC-34).
  - A rejected `write` with `{status: 500}` leads to no second `write` (AC-35).
  - Exactly one `write` with `singleAttempt` and `maxTokens 4000` (AC-36, NFR-4).
  - The feature model comes from `describe` (AC-37).
  - Every degraded status: `no_data`, `index_failed`, `llm_not_configured`, `llm_failed`, `timed_out` (measured from acceptance, including a wait in the queue), `unsupported_language` and `index_partial`, including `degraded` and undefined `candidateFiles` (AC-38..AC-42, AC-49, AC-50).
  - A submit that throws ends the gate.
  - An orphaned run past 90 s does not store (AC-42, AC-52).
  - Replace, keep, record-failed and clear (AC-52..AC-55).
  - Stale, including "not stale" on a null or throwing read; the SHA stored is the one read at start; not-found (AC-60..AC-62).
  - No generation without a request (AC-63).
  - Provider, model, tokens and cost (AC-64).
  - Exactly one log call with only the AC-68 fields, and no README sentinel in it (AC-68, NFR-10).
  - The service deps contain no GitHub port at all (AC-13).
- **Satisfies:** AC-13, AC-15, AC-17, AC-32..AC-42, AC-49, AC-50, AC-52..AC-55, AC-60..AC-64, AC-68, NFR-3, NFR-4, NFR-5, NFR-10
- **Skills:** backend-onion-architecture
- **Insights:** `client/docs/insights.md:69` (with fake timers, advance the timers instead of using `waitFor`)
- **Owner:** test-writer
- **Depends on:** 20
- **Done when:** green in the unit suite.

### Step 29 — Server integration tests (Docker)
- **Files:** `server/test/onboarding.it.test.ts` (NEW)
- **Change:** `buildApp` with these overrides:
  - `llm.openrouter: new MockLLMProvider('openai', …)`;
  - `repoIntel`;
  - `git` (a `MockGitClient` subclass holding fixture manifests, including a `.env` and a symlinked `package.json` entry that is never listed);
  - a counting `github` stub.
  
  It checks:
  - `GET` → 200 with null, then the stored tour, then `stale` after the SHA moves; 404 for a foreign repo (AC-6, AC-60..AC-62).
  - `POST` → 202, and 429 on the 6th within a minute (AC-32..AC-34).
  - Replace, keep and clear in Postgres (AC-52..AC-54).
  - A corrupt `json` row yields `tour: null` (safeParse).
  - `GET /repos/:id/index-state` shows `hotnessAvailable` and `hotnessCommits` from a seeded stats row (AC-12).
  - The counting GitHub stub records zero calls across a generation (AC-13).
  - An indicative GET timing check against 5 000 `file_rank` rows (NFR-1).
- **Satisfies:** AC-6, AC-12, AC-13, AC-32, AC-33, AC-34, AC-52, AC-53, AC-54, AC-60, AC-61, AC-62, NFR-1, NFR-5
- **Skills:** drizzle-orm-patterns, fastify-best-practices
- **Insights:**
  - `server/docs/insights.md`, entry "`expected 'running' to be 'done'` in a `*.it.test.ts` means the test is making a REAL network call, not that the run hung" (mock every provider)
  - `server/docs/insights.md`, entry "The \"no-DB\" unit suite writes to your dev DB — don't run it while a review is in flight"
- **Owner:** test-writer
- **Depends on:** 20
- **Done when:** `cd server && pnpm exec vitest run .it.test` is green with Docker up.

### Step 30 — Client tests derived from the AC
- **Files:**
  - `client/src/components/app-shell/helpers.test.ts` (NEW)
  - `.../OnboardingTourView/{OnboardingTourView.test.tsx, helpers.test.ts}` (NEW)
  - tests next to each section and diagram component (NEW)
  - `client/src/lib/hooks/onboarding.test.tsx` (NEW)
- **Change:** `vi.mock` the hooks; a next-intl provider with a fixed `now`. Tests per AC:
  - `activeKeyFor` for `/repos/x/onboarding` vs `/onboarding`, and the nav order (AC-69..AC-71).
  - The header and coverage line (AC-72..AC-74).
  - TOC order and `replaceState` (AC-75..AC-77).
  - Share copy and step copy via the clipboard (AC-78, AC-79, AC-95).
  - Empty, Generate, Regenerate and disabled states; a refetch every 3 s; a stop at 120 s with at most 40 refetches (AC-80..AC-85, NFR-11).
  - Banners with their exact sentences (AC-86..AC-89).
  - The skeleton label (AC-90).
  - Diagram nodes and directed edges as SVG elements (AC-91).
  - The `directories` list (path + indexed file count) under the diagram, for both origins (AC-107).
  - Links at the tour SHA, opening in a new tab (AC-92, AC-93, AC-97, AC-98).
  - Steps and the risky marker (AC-94, AC-96).
  - No `<script>` and no raw HTML; a foreign link renders as plain text (AC-99, AC-100).
  - `modelCallMade` and the cost labels (AC-101).
  - The AC-102 and AC-103 notices.
  - No literal UI strings (NFR-7); rendering under both `data-theme` values (NFR-8); the structural keyboard contract (NFR-9).
- **Satisfies:** AC-69..AC-103, NFR-7, NFR-8, NFR-9, NFR-11
- **Skills:** react-testing-library
- **Insights:**
  - `client/docs/insights.md:63` (keyboard tests are structural only; give `relativeTime` a `now`)
  - `client/docs/insights.md:78` (`arch:check` cruises test files)
  - `client/docs/insights.md:112`
- **Owner:** test-writer
- **Depends on:** 26
- **Done when:** `cd client && pnpm test && pnpm arch:check` is green.

### Step 31 — e2e flow for the seeded, never-cloned repo
- **Files:**
  - `e2e/specs/10-onboarding-tour.flow.json` (NEW)
  - `e2e/README.md` (the flow table near `:101`)
- **Change:**
  1. `open {BASE}/`, then `wait --url /pulls`.
  2. `find text "Onboarding Tour" click --exact`, then `wait --url "**/repos/*/onboarding"`. If agent-browser has no glob support, use the `/repos/` + `/onboarding` form the runner supports; never bare `/onboarding`.
  3. `wait --text "Onboarding for acme/payments-api"`.
  4. `wait --text "Generate onboarding tour"` (AC-104).
  5. `find role button click --name "Generate onboarding tour"`, then `wait --text "No index for this repository yet — showing an outline built without AI."` (AC-105). There is no clone, so no model call is made.
- **Satisfies:** AC-104, AC-105
- **Skills:** none apply (flow JSON)
- **Insights:**
  - `e2e/docs/insights.md:12` (the seed has no clone or index)
  - `e2e/docs/insights.md:20` (`--exact`)
  - `e2e/docs/insights.md:23`
  - `e2e/docs/insights.md:28` (a stale process on port 3100 hangs `e2e:hermetic`)
  - `e2e/docs/insights.md:31` (agent-browser must be installed)
- **Owner:** test-writer
- **Depends on:** 26
- **Done when:** `cd e2e && npm run typecheck && npm run e2e:hermetic` passes, including flow 10.

## Batches
| Batch | Steps | Why together | Gate at the end |
|---|---|---|---|
| B1 — contracts + DB | 1, 2, 3, 4 | The contract in both copies, then its storage | `cd server && pnpm arch:check && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; `cd client && pnpm arch:check && pnpm typecheck`; legacy rows deleted, and `pnpm db:migrate` succeeded |
| B2 — repo-intel hotness, index readers, single-attempt LLM | 5, 6, 7, 8, 9, 10 | Infrastructure before any consumer | `cd reviewer-core && npm run typecheck`; `cd server && pnpm arch:check && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` (including `git-file-commit-counts`, `repo-intel-hotness-pipeline` and `llm-single-attempt`); `cd client && pnpm typecheck` |
| B3 — onboarding module | 11–20 | One module, built from the centre outwards | `cd server && pnpm arch:check && pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'`; a manual `curl` of both routes |
| B4 — studio | 21–26 | One package and one route | `cd client && pnpm arch:check && pnpm typecheck && pnpm test` (open the new route once under `pnpm dev` first) |

Steps 27–31 belong to `test-writer` and run after B4, in order.

## Requirements coverage
| Requirement | Steps | Proved by |
|---|---|---|
| AC-1 | 1, 2, 8 | Step 1 (`contracts.test.ts`); Step 27 (`onboarding-contract.test.ts`); Step 29 |
| AC-2 | 1, 2 | Step 27 `onboarding-contract.test.ts` |
| AC-3 | 1, 2 | Step 27 `onboarding-contract.test.ts` |
| AC-4 | 1, 2 | Step 27 `onboarding-contract.test.ts` |
| AC-5 | 1, 2 | Step 27 `onboarding-contract.test.ts` |
| AC-6 | 1, 2, 17, 19 | Step 29 `onboarding.it.test.ts` |
| AC-7 | 5, 7 | Step 5 `git-file-commit-counts.test.ts`; Step 7 `repo-intel-hotness-pipeline.test.ts` |
| AC-8 | 5 | Step 5 `git-file-commit-counts.test.ts` |
| AC-9 | 6 | Step 27 `repo-intel-hotness.test.ts` |
| AC-10 | 6 | Step 27 `repo-intel-hotness.test.ts` |
| AC-11 | 6, 7 | Step 27 `repo-intel-hotness.test.ts`; Step 7 pipeline test |
| AC-12 | 7, 8 | Step 7 pipeline test; Step 29 (`index-state`) |
| AC-13 | 5, 7, 17 | Step 5 (local remote); Step 7 (`github()` never called during an index); Step 28 (no GitHub port); Step 29 (counting stub across a generation) |
| AC-14 | 5, 6 | Step 5; Step 27 |
| AC-15 | 9, 17 | Step 28 |
| AC-16 | 9, 13 | Step 27 `onboarding-helpers.test.ts` |
| AC-17 | 13, 14, 17 | Step 28 |
| AC-18 | 13 | Step 27 |
| AC-19 | 13 | Step 27 |
| AC-20 | 14 | Step 27 `onboarding-prompt.test.ts` |
| AC-21 | 13 | Step 27 |
| AC-22 | 13 | Step 27 |
| AC-23 | 13 | Step 27 |
| AC-24 | 13 | Step 27 |
| AC-25 | 13 | Step 27 (`selectProjectFiles`); Step 29 (`.env` fixture never read) |
| AC-26 | 13 | Step 27 (`selectProjectFiles`: absolute, `..`); existing `server/test/git-context-read.test.ts` (containment, escaping symlink); Step 29 |
| AC-27 | 13 | Step 27 |
| AC-28 | 13 | Step 27 |
| AC-29 | 9, 13 | Step 27 |
| AC-30 | 13 | Step 27 |
| AC-31 | 12, 14 | Step 27 |
| AC-32 | 17, 19 | Steps 28, 29 |
| AC-33 | 17, 18 | Steps 28, 29 |
| AC-34 | 11, 17, 18 | Steps 28, 29 |
| AC-35 | 10, 17, 18 | Step 10 `llm-single-attempt.test.ts`; Step 28 |
| AC-36 | 14, 17 | Step 28 |
| AC-37 | 18 | Step 28 |
| AC-38 | 17 | Step 28 |
| AC-39 | 9, 17 | Step 28 |
| AC-40 | 17, 18 | Step 28 |
| AC-41 | 10, 17 | Step 10; Step 28 |
| AC-42 | 17, 18 | Step 28 |
| AC-43 | 12 | Step 27 |
| AC-44 | 12 | Step 27 |
| AC-45 | 12 | Step 27 |
| AC-46 | 12 | Step 27 |
| AC-47 | 12 | Step 27 |
| AC-48 | 12 | Step 27 |
| AC-49 | 12, 17 | Steps 27, 28 |
| AC-50 | 12, 17 | Steps 27, 28 |
| AC-51 | 12 | Step 27 |
| AC-52 | 3, 16, 17 | Steps 28, 29 |
| AC-53 | 3, 12, 16, 17 | Steps 28, 29 |
| AC-54 | 3, 16, 17 | Steps 28, 29 |
| AC-55 | 12, 17 | Steps 27, 28 |
| AC-56 | 12, 13 | Step 27 |
| AC-57 | 12 | Step 27 |
| AC-58 | 12 | Step 27 |
| AC-59 | 12 | Step 27 |
| AC-60 | 16, 17, 19 | Step 29 |
| AC-61 | 17, 19 | Step 29 |
| AC-62 | 17 | Steps 28, 29 |
| AC-63 | 17, 19 | Step 28 |
| AC-64 | 17 | Step 28 |
| AC-65 | 14 | Step 27 |
| AC-66 | 14 | Step 27 |
| AC-67 | 14 | Step 27 |
| AC-68 | 17 | Step 28 |
| AC-69 | 22 | Step 30; Step 31 |
| AC-70 | 22 | Step 30 |
| AC-71 | 22 | Step 30 |
| AC-72 | 26 | Step 30 |
| AC-73 | 26 | Step 30 |
| AC-74 | 26 | Step 30 |
| AC-75 | 26 | Step 30 |
| AC-76 | 26 | Step 30 |
| AC-77 | 26 | Step 30 |
| AC-78 | 26 | Step 30 |
| AC-79 | 26 | Step 30 |
| AC-80 | 26 | Steps 30, 31 |
| AC-81 | 21, 26 | Step 30 |
| AC-82 | 21, 26 | Step 30 |
| AC-83 | 26 | Step 30 |
| AC-84 | 21, 26 | Step 30 |
| AC-85 | 26 | Step 30 |
| AC-86 | 26 | Step 30 |
| AC-87 | 23, 26 | Steps 30, 31 |
| AC-88 | 26 | Step 30 |
| AC-89 | 26 | Step 30 |
| AC-90 | 25 | Step 30 |
| AC-91 | 25 | Step 30; manual in both themes |
| AC-92 | 25 | Step 30 |
| AC-93 | 25 | Step 30 |
| AC-94 | 25 | Step 30 |
| AC-95 | 25 | Step 30 |
| AC-96 | 25 | Step 30 |
| AC-97 | 25 | Step 30 |
| AC-98 | 25 | Step 30 |
| AC-99 | 24, 25 | Step 30 |
| AC-100 | 24, 25 | Step 30 |
| AC-101 | 26 | Step 30 |
| AC-102 | 25 | Step 30 |
| AC-103 | 25 | Step 30 |
| AC-104 | 31 | `e2e/specs/10-onboarding-tour.flow.json` (Step 31) |
| AC-105 | 31 | `e2e/specs/10-onboarding-tour.flow.json` (Step 31) |
| AC-106 | 7 | Step 29: the pipeline test asserts that an index built with the previous `INDEXER_VERSION` triggers a full reindex that writes hotness |
| AC-107 | 25 | Step 30: the architecture section renders the directory list (path + count) for both a model-origin and a skeleton-origin fixture |
| NFR-1 | 16, 19 | Step 29 (indicative); manual: `curl -w %{time_total}` × 20 on a 5 000-file repo |
| NFR-2 | 9, 13 | Step 27 (synthetic 5 000 files); manual on a real repo |
| NFR-3 | 10, 17 | Steps 10, 28 |
| NFR-4 | 10, 14, 18 | Steps 10, 27, 28 |
| NFR-5 | 17, 18 | Steps 28, 29 |
| NFR-6 | 5 | Step 5 |
| NFR-7 | 23, 26 | Step 30 |
| NFR-8 | 25, 26 | Step 30; manual in both themes |
| NFR-9 | 25, 26 | Step 30 (structural); manual Tab/Enter pass |
| NFR-10 | 17 | Step 28 |
| NFR-11 | 21, 26 | Step 30 |

## Skills the implementer must apply
| Path / glob | Skill | Why it applies |
|---|---|---|
| `server/src/vendor/shared/contracts/onboarding.ts`, `client/src/vendor/shared/contracts/onboarding.ts`, `server/src/modules/onboarding/{prompt,repository}.ts` | zod | New contract, model-output schema, `safeParse` of stored JSON |
| `server/src/db/schema/context.ts` | drizzle-orm-patterns, postgresql-table-design | Columns, FK, generated migration |
| `server/src/modules/{repo-intel,onboarding}/**`, `server/src/adapters/**`, `reviewer-core/src/llm/openrouter.ts`, `server/src/platform/errors.ts` | backend-onion-architecture | Ring placement, ports, compose, no cross-module imports |
| `server/src/modules/onboarding/routes.ts` | fastify-best-practices | Response schemas, 202 and 429 |
| `server/src/modules/onboarding/{helpers,prompt}.ts`, `client/src/vendor/ui/primitives/Markdown.tsx`, the section components | security | Untrusted repo text, secret-file refusal, link and HTML rendering |
| `client/src/app/repos/[repoId]/onboarding/**`, `client/src/lib/hooks/onboarding.ts`, `client/src/vendor/ui/nav.ts`, `client/src/components/app-shell/helpers.ts` | frontend-ui-architecture, react-best-practices, next-best-practices | New route, `_components` layout, polling state |
| `server/src/modules/{onboarding,repo-intel}/AGENTS.md`, `docs/insights.md` | engineering-insights | Records the new rules and the replaced scaffolding |
| Non-trivial types (section tuple, port unions, `SerialRunner`) | typescript-expert | Tuple contract, discriminated results |

## Verification
| Command | cwd | Triggered by | Expected |
|---|---|---|---|
| `pnpm arch:check` | `server` | `server/src/**` | No new violations, no re-baselining |
| `pnpm typecheck` | `server` | `server/**/*.ts`, `reviewer-core/src/**` | Green (needs `reviewer-core/node_modules`) |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server` | `server/src/**` | Green; it touches the dev DB |
| `pnpm exec vitest run .it.test` | `server` | Step 29 | Green — **needs Docker** |
| delete legacy rows, then `pnpm db:generate` and `pnpm db:migrate` | `server` | Steps 3–4 | One additive migration; migrate succeeds — **needs Docker** |
| `npm run typecheck` / `npm test` | `reviewer-core` | `src/llm/openrouter.ts` | Green |
| `pnpm arch:check` | `client` | `client/src/**` | Zero violations |
| `pnpm typecheck` | `client` | `client/**/*.{ts,tsx}` | Green after the new route was compiled once |
| `pnpm test` | `client` | `client/src/**` | Green |
| `npm run typecheck` | `e2e` | `e2e/specs/**` | Green |
| `npm run e2e:hermetic` | `e2e` | Step 31 | All flows pass, including `10-onboarding-tour` — **needs Docker** and agent-browser |

## Risks, dead ends already recorded
- **Legacy rows.** The NOT NULL `workspace_id` and `status` columns fail on existing rows. Step 4 deletes them first, and every long-lived DB needs the same delete.
- **Additive schema only.** `db:generate` blocks when adds and drops land on the same table in the same diff (`server/docs/insights.md`, entry "`pnpm db:generate` blocks forever…").
- **The `INDEXER_VERSION` bump** forces a full reindex of every repo on its next refresh. Index jobs run at concurrency 3 and are bounded by the job timeout (`server/src/platform/jobs.ts:40-41`).
- **Rank order changes** for Blast Radius callers, Conventions samples and the repo map (accepted in `docs/specs/onboarding-tour.md:194`). Order-pinning tests may need fixture updates.
- **The single-attempt option touches three providers shared by reviews.** The default path must stay unchanged; Step 10's tests and the architecture-reviewer cover this.
- **The global serial runner plus the acceptance-based clock** can time out queued generations (Recommendation 3).
- **In-memory gate and limiter.** They are per-process (`server/docs/insights.md`, entry "Adding a second process against the same Postgres (the MCP server)…").
- **Unhandled rejections.** The runner must never leak one (`server/docs/insights.md`, entry "A failed background job can crash the API").
- **Manifest reads load whole files into memory before the 64 KB cap.** `GitClient.readFile` has no size limit. This is acceptable for allow-listed manifest names.
- **`.git/config` holds the PAT.** Only `listFiles` + `readFile` may be used (`server/docs/insights.md`, entry "Every clone's `.git/config` holds the GitHub token…").
- **Integration tests make real calls** unless every provider is mocked (`server/docs/insights.md`, entry "`expected 'running' to be 'done'`…").
- **The design file is a compressed bundle.** A 0-hit grep proves nothing (`client/docs/insights.md:19`).
- **A new client route** fails typecheck until Next compiles it (`client/docs/insights.md:95`).
- **e2e.** Use `--exact` (`e2e/docs/insights.md:20`). The flow fails against a reused DB that already holds a tour.
- **No new dependency.**

## Open questions
- **Spec amendment.** It is assumed to land as described: AC-3 `directories`, the AC-42 acceptance clock with a dedicated runner, and the repo-intel scope note. `docs/specs/onboarding-tour.md:50,101` still showed the old text when this was written. Check before B1.
- **The `timed_out` "no model call" ambiguity.** A run that timed out with its call in flight and no usage shows "no model call" under the user's derivation rule (Requirements review). Confirm this is acceptable, or store an explicit flag, which would need a spec change.
- **A settings read failure in `describe`** is assumed to fall back to the registry default `onboarding` model for provenance, with status `llm_not_configured`. Confirm.
- **`REPO_INTEL_ENABLED=false`** is assumed to make `readIndexState` return null, so the generation ends `no_data` (`server/AGENTS.md:35`).
- **The command texts** for Makefile, Compose, `.nvmrc`/`engines` and README lines are plan defaults (Requirements review).
- **The agent-browser `wait --url` glob support** is not verified. Step 31 states a fallback.
- **The nav icon** was not decoded from the design's sidebar. The implementer should check the bundle (`client/docs/insights.md:19`).

**Resolved by the orchestrator, 2026-10-03, before B1:**
- The spec amendment has landed and SPEC-02 is re-approved. It covers AC-3, AC-42, AC-56 and AC-106, plus AC-107: the studio shows `directories` under the diagram for both origins.
- A `timed_out` run whose call was in flight still counts as a model call. Store an explicit server-side `model_call_made` flag, set just before `write` is invoked, and derive the AC-101 labels from it. No spec change is needed: AC-64 still holds, and the flag only removes the ambiguity.
- Settings read failure in `describe`, `REPO_INTEL_ENABLED=false`, the command texts, the `wait --url` fallback and the nav icon: accept the plan defaults as written.

## Review resolution
| Finding (`docs/plans/onboarding-tour/review.md`) | Resolved in |
|---|---|
| UD-1 Manifest reading split out of repo-intel; `ProjectFileReader`; allow-list, depth and secret refusal in `helpers.ts` | Steps 9 (no manifest reader), 13 (`selectProjectFiles`), 15 (port + assertion), 18 (`container.git`), 27 |
| UD-2 `INDEXER_VERSION` bump | Step 7 |
| UD-3 Dedicated in-process runner, concurrency 1, no `jobs` row, no retries, clock from acceptance | Steps 17, 18; Requirements review (AC-42) |
| UD-4 Only AC-3 amended; AC-64 provider/model as configured, with "no call" derived; no `cd` prefix | Steps 1, 2, 17, 26 (`modelCallMade`); Requirements review |
| UD-5 Native SVG/flex diagram, no Mermaid | Step 25 (`ArchitectureDiagram`) |
| M-1 Rank not always recomputed; boundary mechanism; `-z`/quotepath; merge commits; `commits` after exclusion; real-git test in B2; drop `HOTNESS_WINDOW_DAYS` | Steps 5, 6, 7; B2 gate |
| M-2 `unsupported_language` from `totalCandidates`; undefined candidates; `degraded` → `index_partial` | Steps 7, 12, 17; Requirements review |
| M-3 Provider-level one-call / zero-retry tests; SDK `{maxRetries: 0, signal}`; OpenRouter timeout gated on `singleAttempt` | Step 10 |
| M-4 Budget measured on the rendered prompt | Step 14 (`fitBudget` in `prompt.ts`); Step 27 |
| M-5 Gate leak on submit failure; generation token; `timed_out` skeleton from partial facts; no retry on 500 | Steps 17, 18, 28 |
| M-6 Coverage rows citing nonexistent tests (AC-25, AC-26, AC-12, AC-7, AC-13) | Steps 5, 7, 27, 28, 29; coverage table |
| M-7 Wrong anchors; re-anchor `server/docs/insights.md` by entry title | Throughout; `openai.ts:97`, `resilience.ts:46` |
| m-1 Step 25/26 order | Steps 25 (sections) → 26 (view) |
| m-2 `allSkeleton` over permitted sections; vacuous sections | Step 12 |
| m-3 Lockfiles existence only; 64 KB cap; only derived data reaches the prompt | Steps 12, 13 |
| m-4 Rate limiter counts every POST, rate limit before in-flight, prune at 60 s | Steps 17, 18, 28 |
| m-5 `safeParse` on read → `tour: null`, tested | Steps 16, 29 |
| m-6 Legacy rows handled explicitly | Step 4 (delete before migrate) |
| m-7 Columns win over JSON | Steps 3, 13, 16 |
| m-8 `stale` via `readIndexState`; null or error → not stale | Steps 17, 28 |
| m-9 Store the SHA read at generation start | Steps 17, 28 |
| m-10 Kahn's algorithm with the `rank DESC, path ASC` queue | Steps 13, 27 |
| m-11 AC-18 exclusion in `selectCriticalPaths` | Steps 13, 27 |
| m-12 Keep the stack, capped at 40, untrusted | Steps 13, 14 |
| m-13 Cut `getSymbolsInFiles` | Step 15 (not in the reader port); Step 13 (file facts = path, rank, endpoints) |
| m-14 Prefer a `components` override before editing `vendor/ui` | Step 24 (the primitive exposes none, so one optional prop) |
| m-15 e2e waits on `/repos/<id>/onboarding` | Step 31 |
| m-16 Early port-shape assertion; Steps 22/23 as prerequisites of the view | Steps 15, 26 (Depends on) |

## Handoff
1. **`implementer`.** Run B1 (Steps 1–4), then a fresh implementer for each of B2 (5–10), B3 (11–20) and B4 (21–26), sequentially, each ending on its gate.
2. **`plan-verifier`**, against this plan's Steps.
3. **`test-writer`** for Steps 27–31, with tests derived from the AC text, not from the code.
4. **`/code-review`** for bugs.
5. **`architecture-reviewer`** on Steps 5, 7, 9, 10, 15–19, 22, 24, 25 and 26. It must check these invariants:
   1. `modules/onboarding/**` imports no other module folder. It reaches repo-intel only through the structural `OnboardingIndexReader`, and the clone only through the structural `ProjectFileReader`, both filled in `compose.ts`. It never imports `repo-intel/pipeline/**` or `repo-intel/types.ts`.
   2. `onboarding/service.ts` takes a deps object of ports. It never imports `Container`, `drizzle-orm`, `src/db/**`, `fastify`, adapters, SDKs or `node:*`.
   3. Only `onboarding/repository.ts` touches the DB, and every query is scoped by `workspaceId`. The columns are authoritative over the JSON.
   4. `routes.ts` does parse → one service call → return, with `response` schemas. Statuses come from error classes, except the `reply.status(202)` precedent.
   5. `domain.ts`, `helpers.ts`, `constants.ts`, `ports.ts` and `prompt.ts` are pure. `prompt.ts` purity is reviewed by hand.
   6. The module has exactly one LLM call site (`LlmTourWriter.write`) with `singleAttempt`. The facts are computed before it, and model output only fills prose and reasons.
   7. `pipeline/rank.ts` and `pipeline/hotness.ts` are pure. The history read happens once per rank computation, through `container.git`. `INDEXER_VERSION` is bumped.
   8. The repo-intel facade methods are read-only index readers. Manifest selection and secret refusal live in `onboarding/helpers.ts`.
   9. `countFileCommits` exists in both `adapters.ts` copies, in `SimpleGitClient` and in `MockGitClient`. The shallow file is read with `node:fs` only inside the adapter. Adapters are constructed only in `container.ts`.
   10. `singleAttempt` leaves default behaviour unchanged. The `reviewer-core` change stays in `llm/openrouter.ts`, and reviewer-core is still imported only through its index.
   11. The two `contracts/onboarding.ts` copies are byte-identical.
   12. Only a generated, additive migration was added.
   13. The serial runner lives in `compose.ts`, uses no I/O library and no `jobs` table, never retries, and leaks no rejection. The generation token guards every store.
   14. Client: no cross-route imports; folders are entered via `index.ts`; the design-system `Markdown` change knows nothing about repos (the policy is injected); no `fetch` in components; no Mermaid in the tour.
   15. `pnpm arch:check` is green in both packages with no baseline change.
6. **`security-review`** on Steps 13–14 (manifest selection, secret refusal, untrusted delimiting, risky commands), 17–18 (rate limit, cost amplification, the token guard) and 24–26 (Markdown, links, clipboard).
7. **`plan-verifier`** again, against SPEC-02 AC-1..AC-107 and NFR-1..NFR-11.
8. **`doc-writer`** to anchor the AC lines in all five spec files and mark SPEC-02 implemented.
9. **`pr-self-review`** last.

Hand back to `spec-creator` if the AC-64 `timed_out` ambiguity needs an explicit "model call made" field.

## Confidence
Medium-High. The user's decisions removed the largest open design choices, and every review finding is mapped to a step. Three things would raise it to High:
- the spec amendment landing as described;
- confirming the `timed_out` "no model call" rule and the `describe` fallback;
- a quick check of agent-browser `wait --url` glob support.
