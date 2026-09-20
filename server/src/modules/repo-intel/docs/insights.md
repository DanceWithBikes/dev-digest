# Insights — server/modules/repo-intel

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

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
