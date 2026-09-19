# Cost badge — client part

> Introduced in: L01. Overview: [`docs/specs/cost-badge.md`](../../../docs/specs/cost-badge.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal
Show what review runs cost: per run on the PR page, and the total spend per PR on the PR list.
This part: the `RunCostBadge` component and the four surfaces that show it.

## Acceptance criteria
### Contract (vendored `@devdigest/shared`)
- [x] `RunSummary.cost_usd` and `RunStats.cost_usd` are `number | null` — null means unknown, not free — `client/src/vendor/shared/contracts/trace.ts:107`, `client/src/vendor/shared/contracts/trace.ts:67` · untested
- [x] `PrMeta.cost_usd` (list only, nullish) = total of ALL the PR's runs, every agent and re-run — `client/src/vendor/shared/contracts/platform.ts:203` · untested

### `RunCostBadge` (`client/src/components/run-cost-badge/`)
- [x] `compact` (default): cost only, tokens ignored — `client/src/components/run-cost-badge/RunCostBadge.tsx:32` · test: `client/src/components/run-cost-badge/RunCostBadge.test.tsx:8` ("compact: renders the cost alone")
- [x] `detail`: `"$0.014 · 8.2K→1.3K"`; tokens need both in and out; the cost part is dropped when null — `client/src/components/run-cost-badge/RunCostBadge.tsx:42` · test: `client/src/components/run-cost-badge/RunCostBadge.test.tsx:19` ("detail: renders cost · in→out tokens"), `client/src/components/run-cost-badge/RunCostBadge.test.tsx:24` ("detail: tokens without cost still render (cost part omitted)")
- [x] `timeline`: tokens first, `"9,119 tok · $0.0013"`; total = in + out with en-US separators, shown only when > 0 — `client/src/components/run-cost-badge/RunCostBadge.tsx:44`, `client/src/components/run-cost-badge/RunCostBadge.tsx:48` · test: `client/src/components/run-cost-badge/RunCostBadge.test.tsx:39`, `client/src/components/run-cost-badge/RunCostBadge.test.tsx:44`
- [x] Nothing to show → muted `"—"`, never `"$0.00"` — `client/src/components/run-cost-badge/RunCostBadge.tsx:56` · test: `client/src/components/run-cost-badge/RunCostBadge.test.tsx:13` ("compact: a run without data renders — (never $0.00)"), `client/src/components/run-cost-badge/RunCostBadge.test.tsx:49`
- [x] `formatRunCost`: ≥ $1 → 2 decimals; exactly 0 → `"$0.00"`; < 0.0001 → `"<$0.0001"`; else 2 significant digits — `client/src/components/run-cost-badge/RunCostBadge.tsx:14` (`formatRunCost`) · test: `client/src/components/run-cost-badge/RunCostBadge.test.tsx:56` (`it.each` table)
- [x] `formatTokens`: < 1000 as is, else one-decimal `K` with `.0` dropped — `client/src/components/run-cost-badge/RunCostBadge.tsx:22` (`formatTokens`) · test: `client/src/components/run-cost-badge/RunCostBadge.test.tsx:69`

### Surfaces
- [x] PR list COST column (between Status and Updated) shows the PR total, `compact` — `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:67`, `client/src/app/repos/[repoId]/pulls/constants.ts:49` (`COLUMN_KEYS`) · untested
- [x] Timeline run row: `timeline` badge for `done` runs only — failed, cancelled and running rows show no cost line — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:157` (`settled`), `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:220` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:102` ("a settled run shows total tokens · cost"), `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:112` ("a failed run shows no cost line at all")
- [x] VerdictBanner `detail` line is fed by the `agent_runs` row whose `run_id` matches the review (`runsById`); `run` omitted → no line, `null` → `"—"` — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:84` (`runsById`), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:189`, `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.tsx:56` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.test.tsx:34` ("shows the run cost line when run data is provided"), `client/src/app/repos/[repoId]/pulls/[number]/_components/VerdictBanner/VerdictBanner.test.tsx:48` ("shows — for a run without cost/token data (never $0.00)")
- [x] Run Trace drawer Stats: COST tile via `formatRunCost`, `"—"` when null — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx:70` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:69` (expects `$0.06`)
- [x] Copy: `prReview.list.columns.cost` "Cost", `runs.trace.stat.cost` "COST" — `client/messages/en/prReview.json:108`, `client/messages/en/runs.json:43` · untested

### Freshness
- [x] A finished live run invalidates `["pulls", repoId]`, so the list total doesn't wait for the 60 s refetch — `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:62` (`invalidatePullsList`) · untested — only while the Findings tab is mounted (see Open questions)

## Touched packages / modules
- `client/src/components/run-cost-badge/` — `RunCostBadge`, `formatRunCost`, `formatTokens` (new).
- `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`, `client/src/app/repos/[repoId]/pulls/constants.ts` — COST column.
- PR page: `RunHistory`, `FindingsTab`, `ReviewRunAccordion`, `VerdictBanner`, `RunTraceDrawer/_components/TraceBody` (all under `client/src/app/repos/[repoId]/pulls/[number]/_components/`), `page.tsx`.
- `client/messages/en/prReview.json`, `client/messages/en/runs.json`; `client/src/vendor/shared/contracts/{trace,platform}.ts`.
- Other parts: [`server/src/modules/reviews/docs/specs/cost-badge.md`](../../../server/src/modules/reviews/docs/specs/cost-badge.md), [`server/src/modules/pulls/docs/specs/cost-badge.md`](../../../server/src/modules/pulls/docs/specs/cost-badge.md).

## Open questions
- **Run-done refresh depends on the open tab** — `onRunDone` is called only by `RunStatus` inside `FindingsTab` (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:126`), which mounts only on `tab === "findings"` (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:145`); a run finishing while Overview/Files is open never invalidates `pulls`.
- **`formatRunCost` drops trailing zeros under $1** — `Number(costUsd.toPrecision(2))` (`client/src/components/run-cost-badge/RunCostBadge.tsx:18`): 0.1 → "$0.1", 0.996 → "$1" (while ≥ 1 gives "$1.00"); the `it.each` table (`client/src/components/run-cost-badge/RunCostBadge.test.tsx:56`) has no such case.
