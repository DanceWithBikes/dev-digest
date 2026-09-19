# Cost badge

> Introduced in: L01. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol.

## Goal
Show what review runs cost: per run on the PR page, and the total spend per PR on the PR list.

## Acceptance criteria
User-visible:
- [x] Every finished run records its USD cost; `null` means "price unknown" and every surface shows "—", never `$0.00` — `server/src/modules/reviews/repository/run.repo.ts:169` (`costUsd: values.costUsd ?? null`), `client/src/components/run-cost-badge/RunCostBadge.tsx:56` · test: `client/src/components/run-cost-badge/RunCostBadge.test.tsx:13` ("compact: a run without data renders — (never $0.00)")
- [x] The PR page shows each run's cost in three places — timeline row, verdict banner, Run Trace drawer Stats — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:220`, `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.tsx:56`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:70` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.test.tsx:34` ("shows the run cost line when run data is provided") — details in `client/docs/specs/cost-badge.md`
- [x] The PR list COST column shows the PR's TOTAL spend across all its runs (every agent, every re-run) — `server/src/modules/pulls/routes.ts:158` (`sum(t.agentRuns.costUsd)`), `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:67` · test: `server/test/reviews.it.test.ts:260` ("PR list cost is the TOTAL of all the PR runs, not the latest one") — details in `server/src/modules/pulls/docs/specs/cost-badge.md`

Cost source — `reviewer-core`, relied on as-is (L01 changed no engine code, so it has no part file):
- [x] Per call, `OpenRouterProvider` asks for the real cost (`usage: {include: true}`) and sums `usage.cost` across repair attempts — `reviewer-core/src/llm/openrouter.ts:83`, `reviewer-core/src/llm/openrouter.ts:98` · untested
- [x] Fallback chain: API cost → injected `estimateCost(model, tokensIn, tokensOut)` → null — `reviewer-core/src/llm/openrouter.ts:107` (`costFromApi ?? this.estimateCost?.(…) ?? null`) · untested
- [x] The engine has no price table. The server injects `PriceBook.estimate` (live OpenRouter prices, 6 h TTL, static-table fallback); the server's own OpenAI/Anthropic providers use the static table only — `server/src/platform/container.ts:186`, `server/src/platform/price-book.ts:5` (`SIX_HOURS_MS`), `server/src/adapters/llm/openai.ts:122`, `server/src/adapters/llm/anthropic.ts:135` · test: `server/test/price-book.test.ts:15` ("uses the fallback until the cache is warm, then live OpenRouter prices"), `server/test/adapters.test.ts:103` ("estimates cost for known models and returns null for unknown")
- [x] Per run, `costUsd` starts at 0 and adds each chunk's cost; one chunk returning null makes the whole run null — `reviewer-core/src/review/run.ts:159`, `reviewer-core/src/review/run.ts:184` · untested (every test provider returns a number)
- [x] Returned as `ReviewOutcome.costUsd: number | null`; a call that throws produces no outcome, so no cost reaches the caller — `reviewer-core/src/review/run.ts:110`, `reviewer-core/src/review/run.ts:216` · test: `server/test/reviews.it.test.ts:260` (numeric path only)

## Touched packages / modules
| Part | Code | Spec |
|---|---|---|
| Persistence (`agent_runs.cost_usd`, run history, trace) | `server/src/modules/reviews/`, `server/src/db/schema/runs.ts`, migration `0010_exotic_bloodaxe.sql` | [`server/src/modules/reviews/docs/specs/cost-badge.md`](../../server/src/modules/reviews/docs/specs/cost-badge.md) |
| PR list total | `server/src/modules/pulls/routes.ts` | [`server/src/modules/pulls/docs/specs/cost-badge.md`](../../server/src/modules/pulls/docs/specs/cost-badge.md) |
| Contracts `RunSummary` / `RunStats` / `PrMeta.cost_usd` | `server/src/vendor/shared/contracts/{trace,platform}.ts` + the `client/` copy | covered in the parts above |
| UI (badge + 4 surfaces) | `client/src/components/run-cost-badge/`, PR list + PR page components | [`client/docs/specs/cost-badge.md`](../../client/docs/specs/cost-badge.md) |
| Cost source (unchanged) | `reviewer-core/src/llm/openrouter.ts`, `reviewer-core/src/review/run.ts` | this file |

## Open questions
- **Partial `usage.cost` beats the estimator** — if only some repair attempts report `usage.cost`, `costFromApi` sums just those (`reviewer-core/src/llm/openrouter.ts:98`) and the estimator is never used for the rest (`reviewer-core/src/llm/openrouter.ts:107`), so the run's cost is understated.
- **Real spend is understated in three more ways** — failed/cancelled runs store no cost even after spending tokens; unpriced runs silently drop out of the PR total; no code writes `source='ci'` runs. Details and refs in the reviews and pulls parts.
