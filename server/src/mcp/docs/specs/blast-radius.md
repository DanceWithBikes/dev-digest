# Blast Radius — `get_blast_radius` MCP tool

> Introduced in: L04. Overview: [`docs/specs/blast-radius.md`](../../../../../docs/specs/blast-radius.md).
> This tool's earlier stub is described in [`docs/specs/devdigest-mcp.md`](../../../../../docs/specs/devdigest-mcp.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal

Give an MCP client (Claude Code / Desktop / Cursor) the same blast-radius answer the studio's
Overview-tab card shows, so an agent can call it before reviewing or approving a PR: which callers,
HTTP endpoints and crons the PR's changed symbols can affect. Read-only, index-only, no model call —
the SAME call the HTTP route makes (`modules/blast/compose.ts#makeBlastService(...).forPull`), so a
Claude Code answer and the studio card's payload are identical by construction, never a separate
implementation that could drift.

## Acceptance criteria

- [x] `get_blast_radius` calls `makeBlastService(container, log).forPull(workspaceId, prId)` — the exact same call `GET /pulls/:id/blast` makes — `compose.ts:53` (`getBlastRadius`), reusing `resolvePrId` (`compose.ts:46`), extracted from `runAgentOnPr`'s prior inline resolution so both tools share one PR-reference resolver · test: `../../../test/mcp-tools.test.ts:415` ("returns structuredContent matching the payload the route would return")
- [x] The `files` input field, declared in the L04 stub for a later lesson but never read by any handler, was removed (D8) — `schemas.ts:137` (`GetBlastRadiusInput`, `pr_id`/`repo`/`number` only) · test: `../../../test/mcp-tools.test.ts:246` ("exposes exactly 5 bare-named, annotated tools")
- [x] The tool returns JSON text plus `structuredContent` (`GetBlastRadiusOutput = BlastRadius`), with `readOnlyHint: true, idempotentHint: true` — `tools/get-blast-radius.ts:19` (`registerGetBlastRadius`), `:30`-`:33` (`inputSchema`/`outputSchema`/`annotations`) · test: `../../../test/mcp-tools.test.ts:415`
- [x] A DEGRADED result (index missing/partial) is returned NORMALLY, with its `reason` — not as `isError`; only an unresolvable PR reference (`parsePrRef` failure, unknown PR, or `pr_id` given together with `repo`+`number`) is `isError` — `tools/get-blast-radius.ts:34`-`:46` (the only `catch` path wraps via `toToolError`) · test: `../../../test/mcp-tools.test.ts:421` ("isError with a not-found hint for an unknown PR"), `:428` ("isError when pr_id is given together with repo + number")
- [x] The tool count stays 5 (`list_agents`, `run_agent_on_pr`, `get_findings`, `get_conventions`, `get_blast_radius`) — `server.ts:14` (`createDevDigestMcpServer`) · test: `../../../test/mcp-tools.test.ts:246`

## Touched packages / modules

Project overview and the full cross-package table: [`docs/specs/blast-radius.md`](../../../../../docs/specs/blast-radius.md).
Prior stub-era history and the `devdigest-mcp` project overview: [`docs/specs/devdigest-mcp.md`](../../../../../docs/specs/devdigest-mcp.md).

## Open questions

- **No test exercises `get_blast_radius` returning a DEGRADED (not-`isError`) result with a specific `reason` through the MCP transport** — the mcp-tools suite proves the happy path (`structuredContent` matches the route) and the `isError` paths, but nothing calls the tool against a PR whose repo has `degraded:true, reason:'no_data'` and asserts `isError` is false with that reason in `structuredContent`. The server-level equivalent (`server/test/blast.it.test.ts:175`) covers this for the HTTP route, not for the MCP tool specifically.
