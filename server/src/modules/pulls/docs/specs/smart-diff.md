# Smart Diff — pulls part

> Introduced in: L03. Overview: [`docs/specs/smart-diff.md`](../../../../../../docs/specs/smart-diff.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal
Group a PR's files by reviewer role and attach finding-line anchors, purely and without a GitHub or
model call, and cache an on-demand "what this does" summary per file.
This part: `GET /pulls/:id/smart-diff`, `POST /pulls/:id/smart-diff/summaries`, the pure classifier
and grouping helpers, and the `pr_file_summary` cache.

## Acceptance criteria

### Pure layer (`helpers.ts`, `constants.ts`, `domain.ts`)
- [x] `classifyFile(path)`: first-match-wins over an ordered `RULES` table (`boilerplate → tests → wiring → docs`, `core` fallback), every check matching a whole `/`-segment or filename, never a substring — `server/src/modules/pulls/helpers.ts:216` (`classifyFile`), `server/src/modules/pulls/helpers.ts:181` (`RULES`), `server/src/modules/pulls/helpers.ts:144` (`hasSegment`) · test: `server/test/pulls-smart-diff.test.ts:12` (`classifyFile` table, 22 cases)
- [x] `*.config.*` requires a segment before `.config.`, so `src/config.ts` stays `core` — `server/src/modules/pulls/helpers.ts:159` (`WIRING_CONFIG_FILE_RE`) · test: `server/test/pulls-smart-diff.test.ts:41`
- [x] `buildSmartDiff(files, anchors, summaries?)`: buckets by role, emits groups in `ROLE_ORDER` omitting empty ones, preserves each file's input order within its group — `server/src/modules/pulls/helpers.ts:254` (`buildSmartDiff`), `server/src/modules/pulls/constants.ts:18` (`ROLE_ORDER`) · test: `server/test/pulls-smart-diff.test.ts:55`, `server/test/pulls-smart-diff.test.ts:64`
- [x] `finding_lines` per file = sorted, deduped `startLine`s from the anchors naming that path; an anchor naming an absent path is dropped — `server/src/modules/pulls/helpers.ts:259`-`:274` · test: `server/test/pulls-smart-diff.test.ts:72` ("attaches sorted, deduped finding lines per path, from all runs"), `server/test/pulls-smart-diff.test.ts:84` ("drops anchors naming a path absent from the diff")
- [x] `total_lines` = Σ(additions + deletions) across all files; `too_big` = `total_lines > SMART_DIFF_LARGE_LINES` (500), a strict `>`; `proposed_splits` = one entry per non-empty group only when `too_big`, else `[]` — `server/src/modules/pulls/helpers.ts:286`-`:294`, `server/src/modules/pulls/constants.ts:21` · test: `server/test/pulls-smart-diff.test.ts:92`, `server/test/pulls-smart-diff.test.ts:102` ("too_big is false exactly at the SMART_DIFF_LARGE_LINES threshold (it is a strict >)"), `server/test/pulls-smart-diff.test.ts:111`
- [x] `patchSha(patch)` = SHA-1 hex of the patch text (`null` hashes the empty string); `resolveSummary` serves a cached summary only while `cached.patchSha === patchSha(file.patch)`, otherwise `null` — `server/src/modules/pulls/helpers.ts:229` (`patchSha`), `server/src/modules/pulls/helpers.ts:239` (`resolveSummary`) · test: `server/test/pulls-smart-diff-summaries.it.test.ts:116` (exercises the match/mismatch behaviour end-to-end through the route; no direct unit test of `resolveSummary`/`patchSha` in isolation)
- [x] With no `summaries` map at all (or an empty one), every `pseudocode_summary` is `null` — the step is fully droppable — `server/src/modules/pulls/helpers.ts:257` (default parameter `= new Map()`) · test: `server/test/pulls-smart-diff.test.ts:126` ("sets pseudocode_summary to null (step 8 fills it later)")
- [x] Result shape satisfies the `SmartDiff` Zod contract — `server/src/modules/pulls/helpers.ts:289` (return) · test: `server/test/pulls-smart-diff.test.ts:61` (`SmartDiff.parse(result)`)

### Routes and service (`routes.ts`, `service.ts`, `repository.ts`)
- [x] `GET /pulls/:id/smart-diff` makes no GitHub call and no model call; a 404 via `NotFoundError` when the PR isn't found in this workspace — `server/src/modules/pulls/service.ts:131` (`smartDiff`), `server/src/modules/pulls/routes.ts:41` · test: `server/test/pulls-smart-diff-summaries.it.test.ts:77` ("GET never calls a model: every pseudocode_summary is null before any POST")
- [x] `findingAnchorsForPull` reads `{file, startLine}` from `findings` joined to `reviews` where `pr_id = :prId AND kind = 'review'` — no state filter, so accepted and dismissed findings from every run are all included — `server/src/modules/pulls/repository.ts:180` (`findingAnchorsForPull`) · untested at the repository/integration level (see the project overview's Open questions)
- [x] `POST /pulls/:id/smart-diff/summaries` targets only `core`-group files with no valid cache entry, capped at `SMART_DIFF_SUMMARY_LIMIT` (10), rate-limited to 10/minute — `server/src/modules/pulls/service.ts:151`-`:164` (`generateSummaries`), `server/src/modules/pulls/routes.ts:56` (`config.rateLimit`) · test: `server/test/pulls-smart-diff-summaries.it.test.ts:88` ("POST summarises only the uncached core-group file; GET then serves it from cache"); the 10-file cap and the rate limit itself are untested (every test drives at most one target file)
- [x] A single file's summary-generation failure is caught, logged, and skipped — it never fails the other files in the same batch — `server/src/modules/pulls/service.ts:178` (`catch (err) { log.warn(...) }`) · untested (no test forces `SummaryGenerator.summarize` to reject)
- [x] A second `POST` with nothing left to summarise (already cached, same patch) makes zero model calls — `server/src/modules/pulls/service.ts:160`-`:163` (the cache-membership filter) · test: `server/test/pulls-smart-diff-summaries.it.test.ts:109` ("A second POST finds nothing left to summarise (already cached, same patch)")
- [x] A cached summary survives a `replaceFiles` delete-and-reinsert with the SAME patch (separate `pr_file_summary` table, not a `pr_files` column); it goes stale — served as `null`, row not deleted — when the patch text changes — `server/src/db/schema/pulls.ts:68` (`prFileSummary`), `server/src/modules/pulls/repository.ts:213` (`replaceFiles`) · test: `server/test/pulls-smart-diff-summaries.it.test.ts:116`
- [x] The model call goes through the `SummaryGenerator` port, resolved in `compose.ts` from `container.featureModel(workspaceId, 'smart_diff')`, a plain `complete` (not `completeStructured`) since the output is prose — `server/src/modules/pulls/ports.ts:37` (`SummaryGenerator`), `server/src/modules/pulls/compose.ts:14` (`LlmSummaryGenerator`) · test: `server/test/pulls-smart-diff-summaries.it.test.ts:88` (drives the whole path with a `MockLLMProvider`)
- [x] The summary prompt wraps the (PR-author-controlled) patch text via `wrapUntrusted`, capped at `SUMMARY_MAX_PATCH_CHARS` (6,000 chars) — `server/src/modules/pulls/summary-prompt.ts:35` (`buildSummaryPrompt`), `server/src/modules/pulls/summary-prompt.ts:30` (`cappedPatch`) · untested (no test asserts on the prompt's literal text or the truncation boundary)

### Contract
- [x] `SmartDiffRole` widened to 5 roles, `ROLE_ORDER` matches `SmartDiffRole.options` exactly — `server/src/vendor/shared/contracts/brief.ts:82`, `server/src/modules/pulls/constants.ts:18` · test: `server/test/contracts.test.ts:132` ("SmartDiffRole reading order (Rule 1: core → tests → wiring → docs → boilerplate)")
- [x] `'smart_diff'` added to `FeatureModelId` and `FEATURE_MODELS` (default `openrouter` / `deepseek/deepseek-v4-flash`) in both vendored `platform.ts` copies — `server/src/vendor/shared/contracts/platform.ts:21`, `server/src/vendor/shared/contracts/platform.ts:82` · untested by a dedicated assertion (covered indirectly: `pulls-smart-diff-summaries.it.test.ts` exercises `container.featureModel(ws, 'smart_diff')` end-to-end, which would throw if the id weren't registered)
- [x] The two vendored copies (`server/src/vendor/shared`, `client/src/vendor/shared`) stay byte-identical for `brief.ts` and `platform.ts` — verified with `diff` at the time of writing (both files: `EXIT:0`) · untested by any repo script (no CI check enforces vendor-copy parity; see server's `AGENTS.md`/root `AGENTS.md` rule "change both")

## Touched packages / modules
- `server/src/modules/pulls/helpers.ts` — `classifyFile`, `RULES`, `buildSmartDiff`, `patchSha`, `resolveSummary`.
- `server/src/modules/pulls/constants.ts` — `ROLE_ORDER`, `SMART_DIFF_LARGE_LINES`, `SMART_DIFF_SUMMARY_LIMIT`, `SUMMARY_MAX_PATCH_CHARS`, `SUMMARY_TEMPERATURE`, `SUMMARY_MAX_TOKENS`.
- `server/src/modules/pulls/domain.ts` — `FindingAnchor`, `FileSummaryRecord`, `FileSummaryWrite`.
- `server/src/modules/pulls/ports.ts` — `SummaryGenerator`, `SummaryInput`, `SummaryOutput`.
- `server/src/modules/pulls/compose.ts` — `LlmSummaryGenerator`, wired in `makePullsService`.
- `server/src/modules/pulls/summary-prompt.ts` — `SUMMARY_SYSTEM_PROMPT`, `buildSummaryPrompt`.
- `server/src/modules/pulls/repository.ts` — `findingAnchorsForPull`, `getFileSummaries`, `upsertFileSummary`.
- `server/src/modules/pulls/service.ts` — `smartDiff`, `generateSummaries`.
- `server/src/modules/pulls/routes.ts` — `GET /pulls/:id/smart-diff`, `POST /pulls/:id/smart-diff/summaries`.
- `server/src/db/schema/pulls.ts` — `prFileSummary` table; `server/src/db/migrations/0016_perfect_madame_web.sql`.
- `server/src/vendor/shared/contracts/{brief,platform}.ts` + the `client/` copies.
- `server/src/db/seed.ts:128` — PR #482 widened to span `core`/`wiring`/`docs`/`boilerplate` (was all-`core`, 4 rows vs. a claimed `filesCount: 9`; now 7 rows matching `filesCount: 7`).
- Other part: [`client/docs/specs/smart-diff.md`](../../../../../../client/docs/specs/smart-diff.md).

## Open questions
- **`findingAnchorsForPull`'s "all runs, dismissed included" behaviour has no integration test** — `server/src/modules/pulls/repository.ts:180`. See the project overview.
- **The `SMART_DIFF_SUMMARY_LIMIT` (10-file) cap and the 10/min rate limit are both untested** — `server/src/modules/pulls/service.ts:164`, `server/src/modules/pulls/routes.ts:56`.
- **No test forces `SummaryGenerator.summarize` to reject**, so the "one file's failure doesn't fail the batch" behaviour (`server/src/modules/pulls/service.ts:178`) is exercised only by code inspection.
