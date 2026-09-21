# Insights — server

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-20 · The `routes → service → repository` layering is convention-only, and half the modules skip it** — Nothing enforces module layering: no ESLint, no dependency-cruiser config, no CI gate (`dependency-cruiser` in `package.json` is a runtime library for repo-intel, not a linter). Only `repos`, `agents`, `reviews` and `repo-intel` actually have a service + repository; `pulls`, `settings`, `polling` and `workspace` import `drizzle-orm` and the schema barrel straight into `routes.ts` and query inside handlers. The "tiny modules may live in a single `routes.ts`" allowance was written for `polling`/`workspace`, but `pulls/routes.ts` grew to ~360 lines under it. So don't copy `pulls` or `settings` as a template for a new module — copy `repos` — and any route file that needs a Drizzle import should get a `repository.ts` instead. A mechanical import-boundary check (dependency-cruiser `forbidden` rules with a baseline for the four files above) is planned alongside a `backend-onion-architecture` skill.
  Where: `src/modules/AGENTS.md:10` (the "Tiny modules" allowance), `src/modules/pulls/routes.ts:3` (`from 'drizzle-orm'`) / `:6` (`db/schema.js`), `src/modules/settings/routes.ts:3` / `:10`, `src/modules/polling/routes.ts:3`, `src/modules/workspace/routes.ts:2`; clean reference: `src/modules/repos/repository.ts:20` (`RepoRepository`)
  **Update (2026-09-21):** shipped — `.dependency-cruiser.cjs` (13 rules), `pnpm arch:check` / `arch:all` / `arch:baseline`, a CI step in the `typecheck` job, and `.dependency-cruiser-known-violations.json` holding the 43 pre-existing violations. `pnpm arch:check` now passes and fails on any NEW wrong-way import (verified with a throwaway file). Two rules found more than the manual survey did: `services-take-ports-not-the-container` (9 hits — every service takes the whole `Container`) and, thanks to `tsPreCompilationDeps: true`, type-only leaks of Drizzle row types into `reviews/service.ts` and `repos/helpers.ts`. Rationale per rule: `.claude/skills/backend-onion-architecture/references/enforcement.md`.

- **2026-09-21 · `server/package.json` is NOT skip-worktree — TESTING.md says it is** — `TESTING.md:83` states the file is `skip-worktree` with a diverging local variant, and `.github/workflows/server-unit.yml` inlines `pnpm exec vitest run …` rather than calling a script because of it. `git ls-files -v server/package.json` returns **`H`** (normal); a skip-worktree file would return a lowercase `S`. Edits to it do show up in `git diff` (verified by adding the `arch:*` scripts). So new scripts CAN be added and committed normally — but keep CI inlining its commands anyway: the workflow comments cite the stale reason, and quietly switching CI to `pnpm arch:check` would break if anyone re-sets the bit locally.
  Where: `TESTING.md:83` (the stale claim), `server/package.json:12` (`arch:check`, added and committed fine), `.github/workflows/server-unit.yml:72` (the inlined architecture step)

- **2026-09-19 · The "no-DB" unit suite writes to your dev DB — don't run it while a review is in flight** — `test/routes-smoke.test.ts` claims its routes "don't touch the database", but it calls `buildApp({ config })` without a `db`, so `buildApp` opens `DATABASE_URL` from `server/.env` and, on boot, reaps every `agent_runs` row still `running` → `failed` (all workspaces). With the dev Postgres up, `pnpm exec vitest run --exclude '**/*.it.test.ts'` therefore kills any review you started in the studio. Without Docker it just logs "stale-run reaping failed (non-fatal)". Instead: wait for runs to settle before running unit tests, or run them with `DATABASE_URL` pointed at a throwaway DB.
  Where: `test/routes-smoke.test.ts:7` (the "No-DB" claim), `test/routes-smoke.test.ts:15` (`buildApp({ config })`), `src/app.ts:43` (`createDb(config.databaseUrl)` when no `opts.db`), `src/app.ts:81` (`reapStaleRuns` on boot)

## Tool & Library Notes

- **2026-09-21 · Upgrading drizzle-orm will make `pnpm arch:check` report 5 "new" violations** — The architecture baseline matches a violation by the exact `rule + from + to` triple, and for an npm package `to` is the resolved pnpm path **with the version in it**: `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts`. 5 of the 43 baselined entries look like that (the `drizzle-orm` imports in `pulls`/`settings`/`polling`/`workspace` routes), so bumping drizzle-orm or `postgres` invalidates them and the gate fails on code nobody touched. It is not a false alarm — fix those four route files (they are next in the refactoring order anyway), or re-run `pnpm arch:baseline` and check `git diff --stat` on the baseline shows the old entries replaced, never a net gain. Related CLI trap: this repo pins dependency-cruiser 17, where the baseline is written by the separate `depcruise-baseline` binary; from 18.3 it is `depcruise --baseline` and the `arch:baseline` script must change with the upgrade.
  Where: `.dependency-cruiser-known-violations.json:1` (the versioned `to` paths), `package.json:14` (`arch:baseline` → `depcruise-baseline`), `.claude/skills/backend-onion-architecture/references/enforcement.md` (the baseline section)

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · A failed background job can crash the API** — `JobRunner.enqueue` returns a `done` promise that rejects when the job fails, every caller drops it, and `src/` has no `unhandledRejection` handler, so Node's default (crash) applies. A timed-out job is also marked `failed` while its handler keeps running. Checked: `test/repo-intel-symbol-clamp.it.test.ts:6` records a past crash of this kind. Open: `.catch` at call sites, or a process-level handler?
  Where: `src/platform/jobs.ts:96` (`done` rejects), `src/modules/repos/service.ts:98` / `src/modules/repo-intel/routes.ts:53` (dropped promises), `src/platform/resilience.ts:20` (timeout doesn't cancel)

- **2026-09-19 · The API listens on all interfaces with no auth** — `app.listen({ host: '0.0.0.0' })` plus `LocalNoAuthProvider` means any host that can reach the port can call every route, e.g. write provider keys via `POST /settings/test-connection`; CORS only restricts browsers. Open: bind `127.0.0.1` by default for local use?
  Where: `src/server.ts:29` (`host: '0.0.0.0'`), `src/app.ts:90` (CORS)

- **2026-09-19 · `RunBus` never frees memory** — `complete()` deletes only the emitter; `buffers`, `seq` and `completed` grow for the process lifetime (its doc comment says it releases buffers).
  Where: `src/platform/sse.ts:82` (`complete`), `src/platform/sse.ts:75` (the doc claim)
