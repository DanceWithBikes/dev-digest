# Cost badge — reviews part

> Introduced in: L01. Overview: [`docs/specs/cost-badge.md`](../../../../../../docs/specs/cost-badge.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal
Show what review runs cost: per run on the PR page, and the total spend per PR on the PR list.
This part: persisting each run's cost and exposing it in run history and the run trace.

## Acceptance criteria
- [x] Column `agent_runs.cost_usd` is `double precision`, nullable, added by a generated migration — `server/src/db/schema/runs.ts:23` (`costUsd`), `server/src/db/migrations/0010_exotic_bloodaxe.sql:1` · test: `server/test/reviews.it.test.ts:260` ("PR list cost is the TOTAL of all the PR runs, not the latest one")
- [x] A `done` run stores `outcome.costUsd`, the engine's per-run sum (null when any call was unpriced) — `server/src/modules/reviews/run-executor.ts:248` (`costUsd`), `server/src/modules/reviews/repository/run.repo.ts:169` (`costUsd: values.costUsd ?? null`) · test: `server/test/reviews.it.test.ts:260`
- [x] Failed runs (including `failAll`) and cancelled runs store null — they pass no `costUsd`, and `completeAgentRun` writes `?? null` — `server/src/modules/reviews/run-executor.ts:78`, `server/src/modules/reviews/run-executor.ts:300`, `server/src/modules/reviews/repository/run.repo.ts:169` · untested
- [x] `POST /runs/:id/cancel` and the boot reaper only change `status`, so the cost left from the insert stays null — `server/src/modules/reviews/repository/run.repo.ts:97`, `server/src/modules/reviews/repository/run.repo.ts:108` · untested
- [x] Trace `stats.cost_usd` = the same value on `done`, always null in `traceFromBuffer` (failure, cancel, `failAll`) — `server/src/modules/reviews/run-executor.ts:269`, `server/src/modules/reviews/run-executor.ts:426` (`traceFromBuffer`) · test: `server/test/contracts.test.ts:158` ("RunTrace (data2.jsx TRACE single-document)")
- [x] Run history exposes it as `RunSummary.cost_usd` — `server/src/modules/reviews/repository/run.repo.ts:62` · untested
- [x] Contracts `RunStats.cost_usd` and `RunSummary.cost_usd` are `z.number().nullable()`; null means "price unknown" and the UI shows "—". The client copies have the same fields one line earlier (the files differ in comments) — `server/src/vendor/shared/contracts/trace.ts:68` (`RunStats`), `server/src/vendor/shared/contracts/trace.ts:108` (`RunSummary`), `client/src/vendor/shared/contracts/trace.ts:67`, `client/src/vendor/shared/contracts/trace.ts:107` · test: `server/test/contracts.test.ts:158`
- [x] `DELETE /runs/:id` removes the row, so its cost leaves the PR total; `DELETE /reviews/:id` keeps the run row, so its cost stays counted — `server/src/modules/reviews/repository/run.repo.ts:87`, `server/src/modules/reviews/repository/review.repo.ts:89` · untested

## Touched packages / modules
- `server/src/db/schema/runs.ts` + migration `server/src/db/migrations/0010_exotic_bloodaxe.sql` — the column.
- `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/repository/run.repo.ts`, `server/src/modules/reviews/repository.ts` — writing and listing it.
- `server/src/vendor/shared/contracts/trace.ts` + `client/src/vendor/shared/contracts/trace.ts` — `RunStats.cost_usd`, `RunSummary.cost_usd`.
- Other parts: [`server/src/modules/pulls/docs/specs/cost-badge.md`](../../../pulls/docs/specs/cost-badge.md) (sums these per PR), [`client/docs/specs/cost-badge.md`](../../../../../../client/docs/specs/cost-badge.md) (shows them).

## Open questions
- **Spent tokens and cost are lost on failure or cancel** — the catch block writes `tokensIn/Out = 0` and no cost (`server/src/modules/reviews/run-executor.ts:303`), even when map-reduce chunks already finished or the provider spent repair attempts before throwing (`reviewer-core/src/llm/openrouter.ts:115`). Run rows and the PR total understate real spend.
- **`source='ci'` is never written** — the column allows `'ci'` (`server/src/db/schema/runs.ts:27`), but the only insert hardcodes `'local'` (`server/src/modules/reviews/repository/run.repo.ts:136`), so CI-run cost can't reach these tables.
