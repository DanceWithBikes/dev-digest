# Insights — server/modules/pulls

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

- **2026-09-18 · The PR-list rollup was pre-scaffolded — check `status.ts` before writing new code** — `rollupSeverities()` and its `SeverityCounts` type had been sitting in `status.ts` (with unit tests in `test/pulls-status.test.ts`) unused since before the feature existed, and the file header already described the intended "SCORE + FINDINGS breakdown + STATUS" list. Implementing the findings column was mostly wiring, not new logic. The route comment claiming the breakdown was "intentionally not surfaced" was the only thing that had to go.
  Where: `status.ts#rollupSeverities`, `routes.ts` (`GET /repos/:id/pulls`)

## What Doesn't Work

## Codebase Patterns

- **2026-09-18 · The list endpoint derives everything from "the latest review", per PR, on read** — `score`, `cost_usd`, `severity_counts` and `finding_previews` all follow one shape: an `inArray` over the PR ids ordered newest-first, first-seen-per-PR wins, then a JS group. Adding another rollup means extending `latestReviewByPr` (it now carries the review `id` so its findings can be fetched) rather than denormalizing a column. Counts INCLUDE dismissed findings on purpose — the PR page renders dismissed cards (dimmed) and its severity pills count them, so excluding them here would make the two screens disagree.
  Where: `routes.ts` (`GET /repos/:id/pulls`), `status.ts#toFindingPreviews`

- **2026-09-18 · New `PrMeta` fields must be `.nullish()`** — `GET /pulls/:id` returns `PrDetail = PrMeta.extend(...)` from two paths that set none of the rollup fields (a spread of the GitHub adapter result, and an explicit literal), and `MockGitHubClient.getPullRequest` builds a `PrDetail` literal too. A required field breaks all three at typecheck. `score` and `cost_usd` set the precedent.
  Where: `vendor/shared/contracts/platform.ts` (both copies), `routes.ts` (`GET /pulls/:id`), `adapters/mocks.ts`

- **2026-09-18 · PR title and body sync on different routes** — The list refresh (`GET /repos/:id/pulls`) upserts only `title`, `headSha`, `status`, `updatedAt` from GitHub's list payload; `body` is refreshed solely by `GET /pulls/:id` (i.e. opening the PR page), which writes `body: detail.body`. The body matters beyond display: `run-executor` passes it to the reviewer as `## PR description`, so after editing a PR's description on GitHub, open the PR in the app before re-running a review, or the model still sees the old text.
  Where: `routes.ts` (`GET /repos/:id/pulls` upsert vs `GET /pulls/:id` update), `reviews/run-executor.ts` (`prDescription`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
