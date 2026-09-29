# devdigest-mcp (server surface)

> Introduced in: L04. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol. Project-wide picture: `docs/specs/devdigest-mcp.md`.

## Goal

Expose the studio's core workflow (list agents, run a review, poll findings, read
conventions) to an MCP client over **stdio only** — no HTTP step, no Fastify —
as a thin presentation adapter alongside `app.ts`, in-process against the
existing application services.

## Acceptance criteria

- [x] `src/mcp.ts` connects a `McpServer` over `StdioServerTransport`, never calls `reapStaleRuns`, and gives `createDb` an `onnotice` no-op — `src/mcp.ts:38` (`createDb(config.databaseUrl, { onnotice: () => {} })`) · untested (process entrypoint; exercised manually, see Session Notes)
- [x] `console.log` is redirected to stderr before anything else runs, so a stray call from a dependency can't corrupt the JSON-RPC stream on stdout — `src/mcp.ts:29` · untested (process-level)
- [x] 5 tools are registered with bare names (`list_agents`, not `devdigest__list_agents`) — `src/mcp/server.ts:14` (`createDevDigestMcpServer`) · test: `server/test/mcp-tools.test.ts` ("exposes exactly 5 bare-named, annotated tools")
- [x] `list_agents` returns `Agent[]` minus `system_prompt`/`output_schema` by default (`response_format: 'concise'`), the full `Agent` when `'detailed'`; `enabled_only` filters — `src/mcp/tools/list-agents.ts:14` · test: `server/test/mcp-tools.test.ts` (`describe('list_agents')`, 3 cases) · `server/test/mcp.it.test.ts` ("lists the seeded agents")
- [x] `run_agent_on_pr` requires `pr_id` XOR `repo`+`number`, and `agent_id` XOR `all:true` — violating either is `isError` with an actionable message, never a 500 — `src/mcp/helpers.ts:17` (`parsePrRef`), `src/mcp/helpers.ts:34` (`parseAgentSelection`) · test: `server/test/mcp-helpers.test.ts` (`describe('parsePrRef')`, `describe('parseAgentSelection')`) · `server/test/mcp-tools.test.ts` (`describe('run_agent_on_pr')`, the 3 `isError` cases)
- [x] The `repo`+`number` branch resolves LOCALLY only — `PullsService.resolveRepo`/`resolvePull` (workspace-scoped SQL, case-insensitive `owner/name` match), never a GitHub sync; an unimported repo/PR 404s — `src/mcp/compose.ts:43` (`runAgentOnPr`), `../../pulls/service.ts:56` (`resolveRepo`), `../../pulls/service.ts:75` (`resolvePull`) · test: `server/test/pulls-resolve.test.ts` · `server/test/mcp.it.test.ts` ("runs an agent by repo/number...")
- [x] `run_agent_on_pr` returns immediately with `status: 'running'` and a `next_step` hint naming `get_findings`; the review itself runs fire-and-forget, same as `POST /pulls/:id/review` — `src/mcp/tools/run-agent-on-pr.ts:14` · test: `server/test/mcp-tools.test.ts` ("runs by pr_id + agent_id", "runs by repo + number + all:true")
- [x] `get_findings` is workspace-scoped end to end: `ReviewService.getRunResult` closes the scope gap left open for `/runs/:id/*` (`../../reviews/docs/insights.md`) — a run id from another workspace 404s → `isError`, never served — `../../reviews/service.ts:198` (`getRunResult`), `../../reviews/repository.ts:89` (`getRunSummary` facade), `../../reviews/repository.ts:95` (`reviewForRun` facade) · test: `server/test/mcp.it.test.ts` ("get_findings on a run from ANOTHER workspace is isError")
- [x] A FAILED or CANCELLED run is never an `isError` result from `get_findings` — its `status`/`error` are on `run`, `review` is `null` — `src/mcp/tools/get-findings.ts:20` · test: `server/test/mcp-tools.test.ts` ("isError for an unknown run_id" — the contrast case; the failed-run-is-not-isError path itself is untested, no fixture drives a run to `failed`)
- [x] `get_findings` filters by `min_severity` (`CRITICAL` > `WARNING` > `SUGGESTION`) and truncates to `limit` (1–200, default 50), reporting `total`/`truncated` before/after truncation — `src/mcp/helpers.ts:58` (`severityAtLeast`), `:63` (`filterBySeverity`) · test: `server/test/mcp-helpers.test.ts` (`describe('severityAtLeast / filterBySeverity')`) · `server/test/mcp-tools.test.ts` ("min_severity filters, limit truncates")
- [x] The top-level `findings` is the only finding list in a `get_findings` result: `review` is a `ReviewHeader` (`ReviewRecord` minus `findings`), so `min_severity`/`limit`/`concise` cannot be bypassed through it — `src/mcp/schemas.ts:82` (`ReviewHeader`), `src/mcp/tools/get-findings.ts:13` (`toHeader`) · test: `server/test/mcp-tools.test.ts` ("review carries no findings of its own, so filters cannot be bypassed")
- [x] `get_conventions` resolves `repo_id` or `repo` via the same `resolveRepo`, filters the returned list by `status` (default `accepted`) while `counts` always covers every status regardless of the filter — `src/mcp/tools/get-conventions.ts:14`, `src/mcp/helpers.ts:71` (`filterByStatus`), `:80` (`countByStatus`) · test: `server/test/mcp-tools.test.ts` (`describe('get_conventions')`) · `server/test/mcp.it.test.ts` ("get_conventions filters by status...")
- [x] `get_blast_radius` calls `modules/blast/compose.ts#makeBlastService(...).forPull` (via `compose.ts#getBlastRadius`, sharing `resolvePrId` with `runAgentOnPr`) and returns `structuredContent: BlastRadius` identical to what `GET /pulls/:id/blast` returns; a DEGRADED result is returned normally (not `isError`), and the stub-era `files` input field was removed (D8) — `src/mcp/compose.ts:53` (`getBlastRadius`), `src/mcp/tools/get-blast-radius.ts:19` · test: `server/test/mcp-tools.test.ts` (`describe('get_blast_radius')`, 3 cases) · full detail: [`docs/specs/blast-radius.md`](../../../../../docs/specs/blast-radius.md) (project-wide), [`blast-radius.md`](blast-radius.md) (this surface)
- [x] `AppError` → `isError: true` + a code-specific actionable hint; any other error is logged to stderr (never the raw message to the client) and reported as "Internal error." — `src/mcp/errors.ts:32` (`toToolError`) · untested directly (exercised indirectly by every `isError` case above, which all go through `NotFoundError`/`ValidationError`)
- [x] Every log line in this process is a JSON object on **stderr**, never stdout — `src/mcp/logger.ts:29` (`write`) · test: `server/test/mcp.it.test.ts` (the mcpLogger output visible in the suite's own stderr capture) · manual: piping `initialize`+`tools/list` into `pnpm --silent --dir server mcp` — stdout is exactly the 2 JSON-RPC response lines (see Session Notes)
- [x] 4 `pnpm arch:check` rules keep this surface a presentation adapter: `mcp-tools-talk-to-ports`, `mcp-compose-uses-services-not-repositories`, `inner-rings-do-not-know-mcp`, `mcp-does-not-know-fastify` — `../../../.dependency-cruiser.cjs` (search `mcp-`) · verified: `pnpm arch:check` — 0 new violations (baseline stayed at 33)

## Data / call flow

The start→poll sequence (client → `run_agent_on_pr` → background execution →
polling `get_findings` to a terminal status) is diagrammed once, at the
project level: [`docs/specs/devdigest-mcp.md`](../../../../../docs/specs/devdigest-mcp.md).

## Touched packages / modules

| Part | Code | Spec |
|---|---|---|
| PR/repo resolver | `../../pulls/` | [`pulls/docs/specs/devdigest-mcp.md`](../../pulls/docs/specs/devdigest-mcp.md) |
| Run result (workspace-scoped) | `../../reviews/` | [`reviews/docs/specs/devdigest-mcp.md`](../../reviews/docs/specs/devdigest-mcp.md) |
| `get_blast_radius`'s real implementation (L04) | `../../blast/` | [`docs/specs/blast-radius.md`](blast-radius.md) (this surface) · [`../../../../../docs/specs/blast-radius.md`](../../../../../docs/specs/blast-radius.md) (project-wide) |
| Overview + client registration | — | [`docs/specs/devdigest-mcp.md`](../../../../../docs/specs/devdigest-mcp.md) |

## Open questions

- **The failed/cancelled-run-is-not-isError path is only exercised by contrast, not directly.** No test drives a run all the way to `status: 'failed'` and then reads it back through `get_findings` — the integration suite only proves the happy (`done`) path and the unknown-run-id `isError` path. A future test could mock the LLM provider to throw and assert `get_findings` still returns `isError: false` with `run.status === 'failed'`.
- **`toToolError`'s hint table (`HINTS` in `errors.ts`) is untested directly** — every current test path happens to go through `NotFoundError`/`ValidationError`, so the `config_error`/`external_service_error` hints have no coverage. Low risk (the mapping is a static lookup), but worth a unit test if another `AppError` subclass starts flowing through this path.
- **No live Claude Code session has exercised this yet.** The manual smoke test (piping raw JSON-RPC into `pnpm --silent --dir server mcp`) and the `mcp.it.test.ts` integration suite both prove the server side; `.mcp.json` registration and an end-to-end `/mcp` panel check need a Claude Code restart outside this session's reach.
