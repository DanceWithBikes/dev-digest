# Insights — server/modules/blast

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-28 · The persistent blast path does NOT drop the declaring file — the self-file filter in `toBlastRadius` is load-bearing, not defensive** — `getResolvedCallers` filters references only on `decl_file ∈ changedFiles`, so a recursive call or a second use inside the declaring file comes back as a "caller" of its own symbol. Only the ripgrep fallback skips the declaring file. Do not remove the `declaringFiles` check thinking the facade already did it; `test/blast.it.test.ts` inserts a real same-file reference to pin this.
  Where: `helpers.ts:40` (`toBlastRadius`, `declaringFiles…has(caller.file)`), `../repo-intel/repository.ts:503` (`getResolvedCallers`)

- **2026-09-28 · A degraded result can still carry callers — render the map AND the badge** — when the index is missing, `getBlastRadius` falls back to a ripgrep search over the clone and returns `degraded: true, reason: 'no_data'` WITH populated callers (rank 0, no `factsByFile`, so no per-group endpoints/crons). That fallback re-reads clone files (`readClone`), so the "reads the precomputed index, no re-parse" guarantee holds only on the persistent path. Never treat `degraded` as "empty map" in UI or MCP consumers.
  Where: `../repo-intel/service.ts:297` (`readClone` in the fallback), `../repo-intel/service.ts:308` (`reason: 'no_data'`)

- **2026-09-28 · The facade's `degraded: false` does not mean "full index"** — `repo-intel/service.ts#tryPersistentBlast` returns `degraded: false` for BOTH `status: 'full'` and `status: 'partial'` index states; it only refuses to answer (returns `null`, falling through to the ripgrep path) for `'degraded'`/`'failed'`. So a caller that trusts the facade's own `degraded` flag alone can never tell a complete map from a partial one, and can never see `index_failed` at all (a failed index state isn't checked by `getBlastRadius` — it just falls through to ripgrep, which reports `no_data` instead). `helpers.ts#refineDegradation` fixes this by reading `getIndexState()` SEPARATELY (one extra facade call, not counted against the "read the index once" log line since it's a metadata read, not a re-parse) and overriding the reason when the underlying state is `partial`/`failed`.
  Where: `../../repo-intel/service.ts:337-390` (`tryPersistentBlast`, always `degraded: false` on the success path), `helpers.ts` (`refineDegradation`), `service.ts` (`forPull`, the `Promise.all` of `getBlastRadius` + `getIndexState`)

- **2026-09-28 · `factsByFile` is keyed by the CALLER's file, not the changed symbol's file** — `BlastFacadeResult.factsByFile` maps a caller's file path to the endpoints/crons declared IN THAT FILE, so `toBlastRadius` attributes endpoints/crons to a downstream group by looking up `factsByFile[caller.file]` per caller row, not per changed symbol. A symbol with two callers in two different files can show endpoints from both — that's intentional, it means "if you touch this symbol, both of these HTTP surfaces might be affected."
  Where: `helpers.ts` (`toBlastRadius`, the `facts[caller.file]` lookup), `../../repo-intel/types.ts:79-83` (`BlastResult.factsByFile` doc comment)

## Tool & Library Notes

- **2026-09-29 · Caller `line` comes from the index sha, but the tree links it at the PR's `headSha` — on a stale index the links point at the wrong line** — `references.line` is correct for `repo_index_state.last_indexed_sha`, not for the PR head. Verified: index at `c6af1e4` has `<RunHistory` at `FindingsTab.tsx:131`, PR #10 head `02d6e32` has it at `:158`; the card showed `:131` linked at head. Nothing in `BlastRadius` flags a stale index (`refineDegradation` checks only `partial`/`failed`). Fix: expose the indexed sha and link with it, and/or treat `last_indexed_sha ≠ headSha` as a stale state; meanwhile Resync before trusting line numbers.
  Where: `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/_components/BlastTree/_components/SymbolNode/SymbolNode.tsx:65` (`githubBlobUrl(…, headSha, …)`), `repository.ts:19` (`headSha`), `helpers.ts` (`refineDegradation`)

- **2026-09-29 · On a fork, `listPullRequestsAssociatedWithCommit` also returns the UPSTREAM repo's PRs — Prior PRs then links them to a 404** — for commits inherited from the parent repo, GitHub returns the parent's merged PRs (verified: `DanceWithBikes/dev-digest` → `#137`, `#101` exist only in `ai-agentic-engineering-neo/dev-digest`). The adapter drops `pr.base.repo.full_name`, so the client builds `githubPrUrl(<fork>, number)` → 404. Fix: carry `base.repo.full_name` through `CommitPullRef` and link with it (or filter to the PR's own repo); do not assume every returned PR number belongs to `repo`.
  Where: `server/src/adapters/github/octokit.ts:162` (`listPullsForCommit`), `service.ts:64` (`priorPrs`), `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/_components/PriorPrs/PriorPrs.tsx:57` (`githubPrUrl`)

- **2026-09-28 · Tests that need the persistent blast path must insert `references` rows directly** — `RepoIntelRepository.insertReferences` never sets `decl_file` (resolution happens later in the indexer's `resolveReferences`), and `getResolvedCallers` only returns rows with a resolved `decl_file`. Seeding through `insertReferences` alone yields zero callers and a green-looking but empty map. Insert via `db.insert(t.references)` with `declFile` set, as `test/blast.it.test.ts` does.
  Where: `../repo-intel/repository.ts:280` (`insertReferences`), `../repo-intel/repository.ts:400` (`resolveReferences`), `test/blast.it.test.ts:84` (the direct insert, repo-root `server/`)

- **2026-09-28 · `GET /pulls/:id/blast` on a PR whose detail page was never opened reports `no_data`** — `pr_files` is filled only when `GET /pulls/:id` runs (`PullsService` → `replaceFiles`), so `getPullContext` returns `changedFiles: []` and the facade degrades. The studio always opens the detail first; MCP `get_blast_radius` on a freshly imported, never-opened PR does not. If that bites, open the PR in the studio (or call `GET /pulls/:id`) first.
  Where: `repository.ts` (`BlastRepository.getPullContext`), `../pulls/service.ts:125` (`replaceFiles`)

## Recurring Errors & Fixes

## Session Notes

- **2026-09-28 · Blast Radius L4 finished end-to-end (client + e2e + docs)** — Client `BlastRadiusCard` (tree, SVG graph, lazy Prior PRs, degraded notice + resync), e2e flow `09-blast-radius` (seeded repo → `no_data` notice), specs `blast-radius.md` in 5 places. Built via planner → implementer ×2 → architecture-reviewer ∥ plan-verifier → fix-ups → doc-writer. Follow-up: live demo on a real indexed repo; the work is uncommitted by user choice.

- **2026-09-28 · Implemented server-side Blast Radius (L4) — module, per-symbol caller cap fix, GitHub Prior-PRs port, MCP tool wiring.** Scope was steps 1-9 of the agreed dev plan (contract, GitHub port, repo-intel cap fix, the `blast/` module itself, MCP). Client UI, e2e and docs/specs are a separate run.
  Where: `server/src/modules/blast/**`, `server/src/modules/repo-intel/service.ts` (cap fix), `server/src/mcp/**` (real `get_blast_radius`), `server/src/vendor/shared` + `client/src/vendor/shared` (contract + adapter port, both copies)

## Open Questions

- **2026-09-28 · `flag_off` and `repo_too_large` are declared but never emitted** — `repo-intel/service.ts#getBlastRadius` never sets `reason: 'flag_off'` (the flag-off path just skips straight to the ripgrep fallback, reporting `'no_data'` like every other no-clone case) nor `'repo_too_large'` anywhere in the current facade. Both values exist in the shared `BlastDegradedReason` enum and this module passes them through faithfully if the facade ever starts emitting them, but today only `'no_data'`, `'index_partial'` and `'index_failed'` are actually reachable.
  Where: `../../repo-intel/service.ts:220-234` (`getBlastRadius`, the flag-off branch), `../../../vendor/shared/contracts/brief.ts` (`BlastDegradedReason`)
