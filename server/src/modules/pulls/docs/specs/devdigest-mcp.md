# devdigest-mcp (pulls: local-DB-only repo/PR resolver)

> Introduced in: L04. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol. Project-wide picture: `docs/specs/devdigest-mcp.md`.

## Goal

Give the MCP surface (`server/src/mcp/`) a way to turn `repo:"owner/name"` +
`number` into a PR id — and `repo_id`/`repo` into a repo ref — using ONLY the
local database. No GitHub call: an unimported repo/PR must 404, never trigger
a fetch (`src/mcp/AGENTS.md`'s "Local-DB-only resolver" rule).

## Acceptance criteria

- [x] `PullsRepository.findRepoByFullName` matches `owner/name` case-insensitively (`ilike` with no wildcards), scoped to the workspace — `repository.ts:76` (`findRepoByFullName`) · untested directly (covered end-to-end via `resolveRepo`'s service test and `server/test/mcp.it.test.ts`, which exercises the real SQL)
- [x] `PullsRepository.findPullByNumber` looks up a PR by `(workspaceId, repoId, number)`, reusing `PULL_COLUMNS` so it returns the same `PullRecord` shape every other read does — `repository.ts:85` (`findPullByNumber`) · untested directly (same reasoning as above)
- [x] `PullsService.resolveRepo` accepts either `{ repoId }` or `{ fullName }` (never both resolved), throws `NotFoundError` with an actionable "import it in the studio first" message otherwise — `service.ts:56` (`resolveRepo`) · test: `server/test/pulls-resolve.test.ts` (`describe('resolveRepo')`, 4 cases incl. cross-workspace)
- [x] `PullsService.resolvePull` resolves `(workspaceId, repoId, number)` to a `PullRecord`, throws `NotFoundError` with an actionable "open it in the studio first" message otherwise — `service.ts:75` (`resolvePull`) · test: `server/test/pulls-resolve.test.ts` (`describe('resolvePull')`)
- [x] Neither method ever calls `this.deps.github` — verified by a `github` stub that throws if invoked — `server/test/pulls-resolve.test.ts:38` (`github: async () => { throw ... }`)

## Touched packages / modules

| Part | Code | Spec |
|---|---|---|
| Overview + call flow | `server/src/mcp/` | [`mcp/docs/specs/devdigest-mcp.md`](../../../mcp/docs/specs/devdigest-mcp.md) |
| Project-wide picture | — | [`docs/specs/devdigest-mcp.md`](../../../../../../docs/specs/devdigest-mcp.md) |

## Open questions

- None — this is a small, fully-covered addition (2 repository queries + 2 service wrappers, both direct unit-tested and exercised again in the MCP integration suite).
