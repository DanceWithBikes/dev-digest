# src/mcp — the DevDigest MCP server (stdio)

An MCP server exposing 5 tools to an MCP client (Claude Code / Desktop / Cursor):
`list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`.
**Stdio transport only** — no HTTP step, no Fastify. Entrypoint: `../mcp.ts`
(sibling of `server.ts`), started with `pnpm mcp`.

## Why this isn't `src/modules/mcp/`

`no-cross-module-imports` (`.dependency-cruiser.cjs`) forbids one module folder
calling another's, and this surface needs `reviews`, `pulls`, `agents` and
`conventions` all at once. It plays the same role `app.ts` plays for HTTP: a
second **presentation adapter**, sitting beside the modules, not inside them.

## Layers (Onion rings, same discipline as a module)

- `ports.ts` — `McpDeps`, the one interface every tool handler depends on.
- `schemas.ts` — zod input/output schemas for the 5 tools; MCP-facing
  **projections** of `@devdigest/shared` contracts (e.g. `AgentConcise` = `Agent`
  minus `system_prompt`/`output_schema`). Never edit `vendor/shared` for an
  MCP-only shape.
- `helpers.ts` — pure: `parsePrRef`/`parseAgentSelection`/`parseRepoRef` turn the
  "exactly one of A or B" tool arguments into a discriminated shape; severity
  filtering; convention status filtering/counting.
- `errors.ts` — `toToolError(err)`: an `AppError` → `isError: true` + an
  actionable hint; anything else → a generic message (never a raw stack) logged
  to stderr.
- `logger.ts` — a pino-shaped `Logger`, JSON lines to **stderr only**.
- `tools/*.ts` — one `register(server, deps)` per tool.
- `server.ts` — `createDevDigestMcpServer(deps)`, wires the 5 tools.
- `compose.ts` — **the only file here that sees the `Container` or a module's
  service.** Wires `AgentsService`/`makePullsService`/`ReviewService`/
  `makeConventionsService` into `McpDeps`, and tracks the run ids
  `run_agent_on_pr` starts (`trackedRunIds`/`drain`, used by `../mcp.ts` on
  shutdown).

Enforced by 4 `pnpm arch:check` rules: `mcp-tools-talk-to-ports` (every file
here except `compose.ts` may import `@devdigest/shared` and
`platform/errors.ts`, nothing else from `db/`, `adapters/`, `modules/` or
`platform/`), `mcp-compose-uses-services-not-repositories`, `inner-rings-do-not-know-mcp`
(nothing outside `src/mcp/` may import it back), `mcp-does-not-know-fastify`.

## Rules you can't infer from the code

- **stdout is the JSON-RPC transport.** Nothing in this process may write to
  it — logging is `logger.ts` → stderr; `../mcp.ts` redirects `console.log` and
  gives `createDb` an `onnotice` no-op (postgres.js logs server NOTICEs to
  stdout otherwise). `pnpm mcp` has no `watch` variant for the same reason
  (`tsx watch` prints a rerun banner to stdout).
- **Local-DB-only resolver.** `run_agent_on_pr`'s `repo`+`number` and
  `get_conventions`'s `repo` go through `PullsService.resolveRepo`/`resolvePull`
  (`modules/pulls/service.ts`) — a plain workspace-scoped SQL lookup, never a
  GitHub sync. An unimported repo/PR 404s with "import it in the studio first",
  it does not trigger a fetch.
- **Bare tool names.** Registered as `list_agents`, not `devdigest__list_agents`
  — the client namespaces them (`mcp__devdigest__list_agents` in Claude Code),
  per `.mcp.json`'s server key.
- **`run_agent_on_pr` requires an explicit target.** `agent_id` XOR `all: true`
  — no implicit "run everything" default, and no implicit "run whatever's
  enabled" either; same discriminated-union treatment as the PR reference.
- **A failed/cancelled run is not a tool error.** `get_findings` returns it
  normally — `run.status`/`run.error` carry the failure; `review` is simply
  `null`. Only a genuinely unexpected condition (bad id, missing arguments) is
  `isError`.
- **`get_blast_radius` calls `modules/blast/compose.ts#makeBlastService(...).forPull`**
  — the exact same call `GET /pulls/:id/blast` makes, so a Claude Code answer
  and the studio card's payload are identical by construction. A DEGRADED
  result (index missing/partial) is returned normally, with its `reason`, not
  as `isError` — an empty map here means "the index can't answer yet", never
  "nothing is affected". Only an unresolvable PR reference is `isError`.
- **This process never calls `reapStaleRuns`.** `app.ts` does, on HTTP boot,
  because a fresh API process owns no in-flight runs yet. An MCP session shares
  the same Postgres as a possibly-running API instance; reaping here would mark
  that instance's in-flight runs failed out from under it. See "known
  limitations" below.
- **Runs started here live and die with this process.** `run_agent_on_pr` is
  fire-and-forget, same as the REST route — but there is no `runBus`/SSE
  client watching from outside. On shutdown (`SIGINT`/`SIGTERM`/stdin close),
  `../mcp.ts` waits up to `MCP_DRAIN_MS` (20s) for tracked runs to finish, then
  cancels whatever is still running, so a run is never silently abandoned
  `running` forever.

## Known limitations of stdio-only (accepted, not bugs)

- Runs execute **inside this process** — closing the MCP client's session ends
  them (bounded drain, then `cancelled`), unlike a REST-triggered run, which
  outlives the request.
- `runBus` (`platform/sse.ts`) is per-process: the studio's Live Log never sees
  an MCP-started run, and a studio "cancel" can't reach one either.
- Restarting the HTTP API reaps `agent_runs` still `running` (`app.ts`) — an
  MCP run in flight at that moment gets marked `failed`, then this process's
  own `completeAgentRun` overwrites it back to `done`/`failed` moments later
  (`completeAgentRun` has no status guard — same hole recorded for cancel in
  `modules/reviews/docs/insights.md`).
- MCP calls bypass the REST rate limit on `POST /pulls/:id/review` (10/min) —
  mitigated by Claude Code's own per-tool-call approval and the explicit
  `agent_id`/`all:true` requirement (no accidental fan-out).
- Finding text (`rationale`, `title`, file paths) is PR-derived, untrusted
  content returned straight to a model on the other end of the MCP
  connection — the same trust boundary `reviewer-core`'s `INJECTION_GUARD`
  defends inside a review prompt, now facing outward too.

## Docs

`../../../docs/specs/devdigest-mcp.md` (project-wide) · `docs/specs/devdigest-mcp.md` (this
surface) · `docs/insights.md` · the `backend-onion-architecture` skill.
