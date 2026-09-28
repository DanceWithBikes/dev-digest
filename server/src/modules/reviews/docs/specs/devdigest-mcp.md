# devdigest-mcp (reviews: workspace-scoped run result)

> Introduced in: L04. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol. Project-wide picture: `docs/specs/devdigest-mcp.md`.

## Goal

Give `get_findings` (the MCP surface's poll target) a single read that returns
a run's status AND the review it produced, workspace-scoped end to end — unlike
the HTTP routes `/runs/:id/*`, which resolve a bare run id with no workspace
check at all (`docs/insights.md`, "`/runs/:id/{events,trace,cancel}` aren't
workspace-scoped"). A run id from another workspace must 404, never be served.

## Data model

`agent_runs.workspace_id` and `reviews.workspace_id` are both real columns
(unlike `pr_intent`, which has none and compensates by joining through
`pull_requests`) — so both new queries are a direct `WHERE workspace_id = $1`,
no join needed.

## Acceptance criteria

- [x] `toRunSummary` extracted as a pure row→DTO mapper, reused by `listRunsForPull` (unchanged behaviour) and the new `getRunSummary` — `repository/run.repo.ts:6` (`toRunSummary`) · covered indirectly: `server/test/reviews.it.test.ts` (`listRunsForPull` via the PR run-history route) still passes unchanged
- [x] `getRunSummary(db, workspaceId, runId)` — one run by id, workspace-scoped — `repository/run.repo.ts:39` (approx.; search `getRunSummary`) · test: `server/test/mcp.it.test.ts` ("get_findings on a run from ANOTHER workspace is isError")
- [x] `reviewForRun(db, workspaceId, runId)` — the review (+ findings) a run produced, scoped by `reviews.workspace_id` directly (no join through the PR) — `repository/review.repo.ts` (search `reviewForRun`) · test: `server/test/mcp.it.test.ts` ("runs an agent by repo/number, then get_findings poll-and-read reaches \"done\"")
- [x] Both are faced on `ReviewRepository` (`getRunSummary`, `reviewForRun`) so `service.ts` never reaches into `repository/*.repo.ts` directly — `repository.ts:89`, `repository.ts:95`
- [x] `ReviewService.getRunResult(workspaceId, runId)` — throws `NotFoundError` when the run itself isn't in this workspace; returns `{ run, review: null }` when the run exists but has no persisted review yet (still running, or failed pre-persist); otherwise reuses `reviewToDto` (same converter `reviewsForPull` uses) so the shape matches `GET /pulls/:id/reviews` exactly — `service.ts:198` (`getRunResult`) · test: `server/test/mcp.it.test.ts` (both cases above)

## Touched packages / modules

| Part | Code | Spec |
|---|---|---|
| Overview + call flow | `server/src/mcp/` | [`mcp/docs/specs/devdigest-mcp.md`](../../../mcp/docs/specs/devdigest-mcp.md) |
| Project-wide picture | — | [`docs/specs/devdigest-mcp.md`](../../../../../../docs/specs/devdigest-mcp.md) |

## Open questions

- **The `verdict` narrowing cast in `src/mcp/compose.ts`.** `ReviewDto.verdict` is a bare `string | null` (read straight off the `text` column, same as every other reviews DTO); the MCP `ReviewRecord` output schema narrows it to the `Verdict` enum. `compose.ts` casts (`review as ReviewRecord`) rather than widening the port's type, on the reasoning that every PERSISTED value already satisfies the enum (it only ever comes from a schema-validated LLM `Review`). Not a bug, but the cast is a place a future `reviews` schema change (a new free-text verdict value, say) would silently stop being caught by the type system — grep `src/mcp/compose.ts` for `as ReviewRecord` if `Verdict` ever changes.
