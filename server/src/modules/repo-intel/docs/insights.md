# Insights — server/modules/repo-intel

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-10-03 · The import graph does not resolve tsconfig `paths` aliases, so a monorepo's cross-package edges are missing** — the depgraph adapter passes `tsConfig` only when the clone has a ROOT `tsconfig.json`. A repo with per-package tsconfigs, like this one, gets none. Imports such as `@devdigest/reviewer-core` or `@devdigest/shared` resolve to nothing and produce no `file_edges` row. On DanceWithBikes/dev-digest, only 1 of 514 edges crosses a top-level directory, and there is no `server → reviewer-core` edge at all. Rank, blast radius and the SPEC-02 diagram therefore see each package as an island. To fix it, cruise each package with its own `tsconfig.json`. Until then, don't read "no edges between packages" as "independent packages".
  Where: `src/adapters/depgraph/index.ts:62` (`tsConfigPath = join(root, 'tsconfig.json')`), `file_edges` table (`select count(*) … where split_part(from_file,'/',1) <> split_part(to_file,'/',1)`)

- **2026-10-03 · `loadFileCommitCounts` swallows every error, including a programming error, so a broken git port silently means "no hotness"** — On any failure it returns `NO_COMMIT_COUNTS` and the index degrades to hotness 0 (`hotnessAvailable: false`). That is the intended degraded contract. It is also why the older `indexer-pipeline` test stubs, which have no `countFileCommits`, stay green: their TypeError is swallowed. If hotness is unexpectedly 0 everywhere, check `stats.hotnessAvailable` and whether the container's git client really implements `countFileCommits`. Don't assume a shallow clone.
  Where: `pipeline/hotness.ts:34` (`loadFileCommitCounts`), `pipeline/hotness.ts:40` (`catch`)

- **2026-10-03 · Rank is not always recomputed: two incremental early returns skip it, and a soft-budget full index writes no `file_rank` rows** — Anything stored on rank, such as SPEC-02 hotness, only updates when the graph block actually runs:
  - The incremental path returns early on `sha_unchanged` and on `no_supported_changes`, before rank.
  - The full path skips the whole graph and rank block when `softBudgetReached`.
  - So "0 `file_rank` rows" does not mean "no supported source files". Use `stats.totalCandidates` for that.
  - "Refreshes on the next resync" is false for these paths. Bump `INDEXER_VERSION`, or recompute rank on the early-return paths.

  `HOTNESS_WINDOW_DAYS` is declared but used nowhere.
  Where: `pipeline/incremental.ts:104` (`'sha_unchanged'`), `pipeline/incremental.ts:129` (`'no_supported_changes'`), `pipeline/full.ts:214` (`if (!softBudgetReached)`), `constants.ts:50` (`HOTNESS_WINDOW_DAYS`)
  **Update (2026-10-03):** SPEC-02 B2 bumped `INDEXER_VERSION` to 3, so every existing repo fully reindexes and gets hotness, and removed `HOTNESS_WINDOW_DAYS`. The early returns still skip rank, so any future rank input needs the same bump. Line numbers above are pre-B2; search by the quoted symbols.

- **2026-09-28 · `MAX_CALLERS_PER_SYMBOL` is now enforced per `viaSymbol`; `BFS_DEPTH` is not used by blast at all** — Until 2026-09-28 the persistent blast path applied the cap as one global `callers.slice(0, 20)` over the rank-sorted list, so one high-fan-out symbol could starve every other changed symbol (25 callers of A + 3 of B → 20 A, 0 B), and the ripgrep fallback had no cap. Both paths now count per symbol (pinned by `test/repo-intel-blast-cap.test.ts`). Blast looks exactly one hop (direct references); `BFS_DEPTH` only drives `getCriticalPaths` — don't expect it to widen the blast map.
  Where: `service.ts:383` (`countPerSymbol`, persistent path), `service.ts:275` (`countForSymbol`, ripgrep path), `service.ts:703` (the only `BFS_DEPTH` loop), `constants.ts:30` (`MAX_CALLERS_PER_SYMBOL`)

- **2026-09-28 · The `blast/service.ts` comment is a forward-reference to a module that doesn't exist yet — don't go looking for it** — `types.ts`'s Blast radius section says `getBlastRadius` is "Adopted by blast/service.ts in T2"; there is no `server/src/modules/blast/` anywhere in the repo (`find server/src/modules -iname '*blast*'` → nothing). The comment describes a planned FUTURE module, written before it existed and never updated once the stub landed elsewhere: the MCP surface's `get_blast_radius` tool (L04, `server/src/mcp/tools/get-blast-radius.ts`) is the current placeholder for this facade method, and it does not call `getBlastRadius` at all yet — it always returns `isError`. When a real `blast` (or similarly-named) module is finally built, it is the one that should call `container.repoIntel.getBlastRadius`, and this comment should be updated to point at it instead of describing it prospectively.
  Where: `types.ts:53` (`// Blast radius (facade method \`getBlastRadius\`). Adopted by blast/service.ts in T2...`), `types.ts:147` (`getBlastRadius` signature), `../../mcp/tools/get-blast-radius.ts:1` (the current placeholder, unrelated to this facade method today)
  **Correction (2026-09-28):** superseded — `server/src/modules/blast/` now exists and calls `getBlastRadius` through its structural `BlastRadiusReader` port; the `types.ts` comment was updated to say so, and MCP `get_blast_radius` calls the same `BlastService.forPull`. Where: `types.ts:51` (updated comment), `../../mcp/compose.ts:53` (`getBlastRadius`)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · "The facade never throws" only covers missing data** — `AGENTS.md` says the facade never throws, but only `tryGetIndexState` catches; the other reads query the DB unguarded, so a DB error propagates. The reviews run-executor wraps each call in try/catch to compensate. Consumers in later lessons must do the same.
  Where: `repository.ts:234` (the one catch), `repository.ts:440` (`getFileRankFor`, unguarded), `server/src/modules/reviews/run-executor.ts:338` (compensating try/catch)

- **2026-09-19 · The indexer's safety limits don't fire** — (1) the 110 s soft budget is checked in a loop that only enqueues parses, so it trips only if the walk alone took > 110 s; (2) the 2 s per-file timeout races a synchronous parse and can never win; (3) `DepCruiseGraph.buildEdges` swallows every error and returns `[]`, so "graph failure → `partial`" never happens — a crashed cruise ends `full` with zero edges. Open: which of these limits should actually be enforced?
  Where: `pipeline/full.ts:136` (`void parseQ.add`), `pipeline/full.ts:156` (sync parse in `.then`), `server/src/adapters/depgraph/index.ts:100` (catch → `[]`), `pipeline/full.ts:219` (`graphFailed`)

- **2026-09-19 · The repo map vanishes after a commit with no code changes** — `no_supported_changes` advances `lastIndexedSha` but renders no repo-map cache row for the new sha, and `getRepoMap` looks up exactly `(repoId, lastIndexedSha, 1500)`, so review prompts lose the repo skeleton until the next pass that re-parses code. Also: `AGENTS.md` says incremental is "keyed by file content hash", but it diffs `lastIndexedSha..HEAD`; `content_hash` is written and never read.
  Where: `pipeline/incremental.ts:123` (`no_supported_changes`), `service.ts:412` (cache lookup), `pipeline/incremental.ts:111` (git diff)

- **2026-09-19 · Index writes are neither transactional nor serialised per repo** — full index is delete-all-then-insert in separate statements, and nothing prevents two index jobs for one repo running at once (queue concurrency 3), so a mid-way failure leaves a partial index and overlapping jobs can collide on the symbols unique index.
  Where: `pipeline/full.ts:204` (delete-then-insert), `server/src/platform/jobs.ts:40` (concurrency 3)
