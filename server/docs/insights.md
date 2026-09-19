# Insights — server

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-19 · The "no-DB" unit suite writes to your dev DB — don't run it while a review is in flight** — `test/routes-smoke.test.ts` claims its routes "don't touch the database", but it calls `buildApp({ config })` without a `db`, so `buildApp` opens `DATABASE_URL` from `server/.env` and, on boot, reaps every `agent_runs` row still `running` → `failed` (all workspaces). With the dev Postgres up, `pnpm exec vitest run --exclude '**/*.it.test.ts'` therefore kills any review you started in the studio. Without Docker it just logs "stale-run reaping failed (non-fatal)". Instead: wait for runs to settle before running unit tests, or run them with `DATABASE_URL` pointed at a throwaway DB.
  Where: `test/routes-smoke.test.ts:7` (the "No-DB" claim), `test/routes-smoke.test.ts:15` (`buildApp({ config })`), `src/app.ts:43` (`createDb(config.databaseUrl)` when no `opts.db`), `src/app.ts:81` (`reapStaleRuns` on boot)

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · A failed background job can crash the API** — `JobRunner.enqueue` returns a `done` promise that rejects when the job fails, every caller drops it, and `src/` has no `unhandledRejection` handler, so Node's default (crash) applies. A timed-out job is also marked `failed` while its handler keeps running. Checked: `test/repo-intel-symbol-clamp.it.test.ts:6` records a past crash of this kind. Open: `.catch` at call sites, or a process-level handler?
  Where: `src/platform/jobs.ts:96` (`done` rejects), `src/modules/repos/service.ts:98` / `src/modules/repo-intel/routes.ts:53` (dropped promises), `src/platform/resilience.ts:20` (timeout doesn't cancel)

- **2026-09-19 · The API listens on all interfaces with no auth** — `app.listen({ host: '0.0.0.0' })` plus `LocalNoAuthProvider` means any host that can reach the port can call every route, e.g. write provider keys via `POST /settings/test-connection`; CORS only restricts browsers. Open: bind `127.0.0.1` by default for local use?
  Where: `src/server.ts:29` (`host: '0.0.0.0'`), `src/app.ts:90` (CORS)

- **2026-09-19 · `RunBus` never frees memory** — `complete()` deletes only the emitter; `buffers`, `seq` and `completed` grow for the process lifetime (its doc comment says it releases buffers).
  Where: `src/platform/sse.ts:82` (`complete`), `src/platform/sse.ts:75` (the doc claim)
