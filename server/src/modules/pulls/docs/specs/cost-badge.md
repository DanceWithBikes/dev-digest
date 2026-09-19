# Cost badge — pulls part

> Introduced in: L01. Overview: [`docs/specs/cost-badge.md`](../../../../../../docs/specs/cost-badge.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal
Show what review runs cost: per run on the PR page, and the total spend per PR on the PR list.
This part: the PR list's `cost_usd` = the PR's total spend.

## Acceptance criteria
- [x] List `cost_usd` = the PR's TOTAL spend: `SUM(agent_runs.cost_usd) GROUP BY pr_id` over ALL its runs (every agent, every re-run); a re-run adds to the total rather than replacing it — `server/src/modules/pulls/routes.ts:158` (`totalCostByPr`, `sum(t.agentRuns.costUsd)`), `server/src/modules/pulls/routes.ts:161` (`groupBy`) · test: `server/test/reviews.it.test.ts:260` ("PR list cost is the TOTAL of all the PR runs, not the latest one")
- [x] No status filter: failed, cancelled and running rows store `cost_usd = null` and SUM skips nulls, just as it skips `done` runs with unknown pricing — `server/src/modules/pulls/routes.ts:160` (`inArray(t.agentRuns.prId, prIds)`) · untested (only `done` runs in tests)
- [x] Null when no run reported a cost (no runs yet, or every cost null), so the list shows "—", never `$0.00` — `server/src/modules/pulls/routes.ts:164` (`row.total != null`), `server/src/modules/pulls/routes.ts:193` (`?? null`) · test: `server/test/reviews.it.test.ts:260` ("PR list cost is the TOTAL of all the PR runs, not the latest one")
- [x] Drizzle's `sum()` returns a string, so it goes through `Number()` before reaching the contract — `server/src/modules/pulls/routes.ts:164` (`Number(row.total)`) · test: `server/test/reviews.it.test.ts:260`
- [x] `cost_usd` is the only list rollup that is NOT latest-review; `score` stays latest-review — `server/src/modules/pulls/routes.ts:192` (`score: review ? review.score : null`) · untested (`score`)
- [x] Contract: `PrMeta.cost_usd` is `z.number().nullish()` (absent on `GET /pulls/:id`); the client copy is identical — `server/src/vendor/shared/contracts/platform.ts:203` (`cost_usd`), `client/src/vendor/shared/contracts/platform.ts:203` · test: `server/test/contracts.test.ts:219` ("PrMeta findings rollup is optional (only the list endpoint fills it)")

## Touched packages / modules
- `server/src/modules/pulls/routes.ts` — `GET /repos/:id/pulls`, the `totalCostByPr` query.
- `server/src/vendor/shared/contracts/platform.ts` + `client/src/vendor/shared/contracts/platform.ts` — `PrMeta.cost_usd`.
- Other parts: [`server/src/modules/reviews/docs/specs/cost-badge.md`](../../../reviews/docs/specs/cost-badge.md) (where the per-run value comes from), [`client/docs/specs/cost-badge.md`](../../../../../../client/docs/specs/cost-badge.md) (the COST column).

## Open questions
- **Unpriced runs silently lower the PR total** — a `done` run whose model has no known price stores `cost_usd = null` and SUM skips it (`server/src/modules/pulls/routes.ts:158`). The list shows a partial total with no "incomplete" marker; "—" appears only when every run is unpriced.
