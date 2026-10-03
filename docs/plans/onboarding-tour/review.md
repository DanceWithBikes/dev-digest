# Cross-model review — onboarding-tour plan (SPEC-02)

Date: 2026-10-03. Reviewers: Sonnet 5.5 and Fable 5.1 (plan author: Opus 5.5). Both returned **APPROVE WITH CHANGES** and no blockers.

## User decisions on the review (2026-10-03)
- **Manifest reading** is split out of repo-intel. `repoIntel.*` serves index facts only: index state, ranked files, import edges, endpoints and structure. Onboarding reads manifests through its own `ProjectFileReader` port, filled structurally by `container.git` in `compose.ts`. The allow-list, the depth rule and the secret-name refusal are pure functions in `onboarding/helpers.ts`. Path containment stays in `SimpleGitClient.readFile` / `listFiles`.
- **Hotness for existing repos:** bump `INDEXER_VERSION`, so every repo does a full reindex on its next refresh.
- **Generation runner:** a dedicated in-process runner with concurrency 1, no `jobs` row and no retries. The 90 s clock starts when the generation is accepted. Drop the AC-42 queue-wait assumption.
- **Spec amendment:** only AC-3 gains `architecture.directories: {path, files}[]`. AC-64 is not changed: keep provider/model as configured, and tell "no call" apart from "cost unknown" by other means (for example `tokens_in === 0` together with a skeleton-only origin). AC-22 is not changed: no `cd <dir> &&` prefix.
- **Diagram:** a native SVG/flex node-edge component using theme tokens. No Mermaid, no Mermaid ID sanitising and no Mermaid fallback.

## Findings to fold into the plan

### Major
1. **Rank is not always recomputed** (Steps 5 and 7; AC-7, AC-8, AC-12):
   - Incremental refresh returns early at `incremental.ts:104` (`sha_unchanged`) and `:129` (`no_supported_changes`), before rank.
   - `full.ts:214` skips the graph and rank block when `softBudgetReached`.
   - Resolved by the `INDEXER_VERSION` bump. Remove `HOTNESS_WINDOW_DAYS` (`constants.ts:50`), which is unused.
   - Specify the shallow-boundary mechanism. The adapter resolves `git rev-parse --git-path shallow` and reads it with `node:fs` inside `SimpleGitClient`, never through the `readFile` port. A missing file means no boundary.
   - Use `-z` or `-c core.quotepath=off` so non-ASCII paths still join.
   - `--name-only` lists nothing for merge commits. Document it.
   - Report `commits` after the boundary commit is excluded.
   - Move the real-git `countFileCommits` test (Step 28) into B2 as a gate.
2. **`unsupported_language` and the indexed-file count use the wrong signal** (Steps 7 and 17; AC-49, AC-50, AC-73, AC-74):
   - Decide `unsupported_language` from `stats.totalCandidates === 0`. Candidates > 0 with 0 rank rows means `index_partial`.
   - When `candidateFiles` is undefined (incremental refresh before Step 7), set `candidate_files = indexed_files` and treat `bounded` as 0.
   - Map a persisted `degraded` IndexStatus (`types.ts:27`) to `index_partial`.
3. **"Exactly one call, zero retries" is not tested at the provider level** (Steps 10, 29, 30; AC-35, AC-41, NFR-4):
   - Add provider tests for openai, anthropic and openrouter, using a stubbed fetch or fake server that returns 500, 429 and a schema-invalid body. Assert exactly one request and a thrown error.
   - Pass SDK request options `{ maxRetries: 0, signal: AbortSignal.timeout(req.timeoutMs) }` on all three providers, so a timeout really aborts the HTTP request (`withTimeout` is only a race, `resilience.ts:13-24`).
   - Gate the OpenRouter `timeoutMs` switch on `singleAttempt`.
4. **The prompt budget is measured on raw facts** (Steps 13 and 14; AC-20, AC-65, AC-66). `fitBudget(facts, render)` must measure `ceil(chars/4)` on the rendered prompt, including the untrusted wrappers. Reverse the dependency, or put the loop in `prompt.ts`. Test that the rendered prompt is at most 24,000 estimated tokens.
5. **The gate and in-flight state can leak** (Steps 17 and 18; AC-33, AC-42):
   - If scheduling throws, call `end()` and rethrow.
   - Give each run a generation token or epoch, and have `replaceTour` and `recordFailedAttempt` accept only the current token, so an orphaned run past 90 s cannot overwrite a newer one.
   - A `timed_out` skeleton uses the facts collected so far, or empty sections.
   - The runner never retries; test that a rejected `write` with `{status: 500}` leads to no second `write`.
6. **Coverage rows cite tests no step creates** (AC-25, AC-26, AC-12, AC-7, AC-13):
   - Step 27: `selectProjectFiles` refuses `.env`, `.env.*`, `*.pem`, `*.key`, `secrets*`, absolute paths and `..` segments, and keeps only allow-listed names at depth ≤ 1.
   - Cite `server/test/git-context-read.test.ts` for containment.
   - Make the full and incremental pipeline hotness test mandatory, using `MockGitClient({fileCommitCounts})`.
   - AC-13: assert that the fake GitHub port records no calls across a generation and across an index.
7. **Wrong anchors.** `server/docs/insights.md` citations after line 60 are shifted by about 8 lines. Also `openai.ts:100` should be `:97` and `resilience.ts:47` should be `:46`. Re-anchor everything by entry title.

### Minor
- **Step 25 / Step 26 order:** Step 25 imports components that Step 26 creates. Swap them, or merge them into one step.
- **`allSkeleton`** (AC-47, AC-48): define it over the sections the model was permitted to fill for this run, so `unsupported_language` is not ambiguous. Define how vacuously empty sections are handled.
- **Manifest reads:** read lockfiles for existence only, from `listFiles`. Cap each manifest at a constant (for example 64 KB). Only derived commands and stack reach the prompt.
- **Rate limiter** (AC-34): count every POST, including a deduped 202. Check the rate limit first, then in-flight. Prune timestamps older than 60 s.
- **Stored JSON on read:** `getTour` uses `safeParse`; a failure becomes `tour: null`. Add a test.
- **Migration** (Step 4): `status` and `workspace_id` are NOT NULL. Decide before B1 what happens to legacy rows. The plan should handle a non-empty table explicitly, for example by deleting the legacy rows, since they have no workspace.
- **Columns vs JSON:** state that the columns (`status`, `commit_sha`, the failure fields) win, and that the mapper reads them.
- **`stale` on a DB blip:** use `readIndexState`; null or an error means "not stale".
- **Index SHA moving during a generation:** read `lastIndexedSha` first and store the SHA the facts started from.
- **Reading-path algorithm:** Kahn's algorithm over the direct edges among the 12 selected files, with the ready queue ordered `rank DESC, path ASC`. A cycle is broken by taking the highest-ranked remaining node. Use the stored rank doubles as they are.
- **Critical-path roots:** they can be test or config files (`getRankedPaths` is unfiltered). Apply the AC-18 exclusion in `selectCriticalPaths`.
- **Extract stack:** KEEP it (the user named stack explicitly), capped at 40 and wrapped as untrusted.
- **Cut** `getSymbolsInFiles`, which no AC uses.
- **Markdown primitive:** prefer a `components={{a}}` override from `TourMarkdown` if the primitive exposes one, before editing `vendor/ui`.
- **e2e Step 32:** wait on `/repos/<id>/onboarding`, not `/onboarding`.
- **Dependency edges:** add a compile-time port-shape assertion in `compose.ts` early. Steps 22 and 23 are prerequisites of Step 25's done-when.
