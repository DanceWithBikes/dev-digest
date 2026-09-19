# Insights — server/modules/pulls

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

- **2026-09-18 · The PR-list rollup was pre-scaffolded — check `status.ts` before writing new code** — `rollupSeverities()` and its `SeverityCounts` type had been sitting in `status.ts` (with unit tests in `test/pulls-status.test.ts`) unused since before the feature existed, and the file header already described the intended "SCORE + FINDINGS breakdown + STATUS" list. Implementing the findings column was mostly wiring, not new logic. The route comment claiming the breakdown was "intentionally not surfaced" was the only thing that had to go.
  Where: `status.ts:23` (`rollupSeverities`), `status.ts:16` (`SeverityCounts`), `routes.ts:194` (call in `GET /repos/:id/pulls`), `server/test/pulls-status.test.ts:59` (`describe('rollupSeverities')`)

## What Doesn't Work

## Codebase Patterns

- **2026-09-18 · The list endpoint derives everything from "the latest review", per PR, on read** — `score`, `severity_counts` and `finding_previews` all follow one shape: an `inArray` over the PR ids ordered newest-first, first-seen-per-PR wins, then a JS group. Adding another rollup means extending `latestReviewByPr` (it now carries the review `id` so its findings can be fetched) rather than denormalizing a column. Counts INCLUDE dismissed findings on purpose — the PR page renders dismissed cards (dimmed) and its severity pills count them, so excluding them here would make the two screens disagree.
  **Exception (2026-09-19): `cost_usd` is NOT "latest"** — it is the PR's total spend, `SUM(agent_runs.cost_usd) GROUP BY pr_id` over ALL runs (every agent, every re-run). It used to be "newest `done` run by `ranAt`", which showed one agent's cost for a multi-agent review and could pick a different run than the score (`ranAt` is enqueue time, reviews sort by completion). No status filter is needed: failed/cancelled/running rows persist `cost_usd = null` and SUM skips nulls — so don't "fix" it by adding `status='done'`, and don't reuse this SUM where a per-run number is expected.
  Where: `routes.ts:118` (`latestReviewByPr`), `routes.ts:136` (`findingsByReview` — dismissed included), `routes.ts:155` (`totalCostByPr`), `status.ts:65` (`toFindingPreviews`)

- **2026-09-18 · New `PrMeta` fields must be `.nullish()`** — `GET /pulls/:id` returns `PrDetail = PrMeta.extend(...)` from two paths that set none of the rollup fields (a spread of the GitHub adapter result, and an explicit literal), and `MockGitHubClient.getPullRequest` builds a `PrDetail` literal too. A required field breaks all three at typecheck. `score` and `cost_usd` set the precedent.
  Where: `server/src/vendor/shared/contracts/platform.ts:200` (`score`) / `:203` (`cost_usd`) / `:238` (`PrDetail`) — same lines in the `client/` copy; `routes.ts:258` (spread path) / `routes.ts:263` (literal path) in `GET /pulls/:id`; `server/src/adapters/mocks.ts:160` (`MockGitHubClient.getPullRequest` literal)

- **2026-09-18 · PR title and body sync on different routes** — The list refresh (`GET /repos/:id/pulls`) upserts only `title`, `headSha`, `status`, `updatedAt` from GitHub's list payload; `body` is refreshed solely by `GET /pulls/:id` (i.e. opening the PR page), which writes `body: detail.body`. The body matters beyond display: `run-executor` passes it to the reviewer as `## PR description`, so after editing a PR's description on GitHub, open the PR in the app before re-running a review, or the model still sees the old text.
  Where: `routes.ts:67` (list upsert `set:` — no `body`), `routes.ts:249` (`body: detail.body ?? null` in `GET /pulls/:id`), `server/src/modules/reviews/run-executor.ts:205` (`prDescription`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · `PrMeta.status` means two different things** — on the list it is the DERIVED review status (`needs_review`/`reviewed`/`stale`); on `GET /pulls/:id` it is GitHub's merge state; one enum mixes both. Open: split into `review_status` + `merge_state`?
  Where: `routes.ts:183` (`deriveReviewStatus` on the list), `routes.ts:258` (detail spread), `server/src/vendor/shared/contracts/platform.ts:155` (`PrStatus`)

- **2026-09-19 · Opening a PR doesn't move its `headSha`** — `GET /pulls/:id` rewrites `pr_files` from GitHub's current head but updates only body and stats, so until the list or a poll re-syncs, a review diffs `base...<stale headSha>` and `markReviewed` records the stale sha.
  Where: `routes.ts:248` (detail update), `server/src/modules/reviews/diff-loader.ts:23` (`pull.headSha`)
