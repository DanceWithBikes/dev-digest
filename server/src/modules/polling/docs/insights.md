# Insights — server/modules/polling

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · Two PR-sync paths drift — should poll reuse the list GET's upsert?** — `GET /repos/:id/pulls` has its own copy of the upsert that sets `openedAt` and backfills diff stats; poll's insert omits `opened_at`, so a PR first imported by a poll keeps `opened_at = null` forever (neither conflict `set` touches it), and poll never refreshes author/branch/base/stats on conflict.
  Where: `routes.ts:34` (poll insert, no `openedAt`), `routes.ts:51` (poll conflict `set`), `server/src/modules/pulls/routes.ts:62` (list GET sets `openedAt`), `server/src/modules/pulls/routes.ts:67` (its `set`)

- **2026-09-19 · Nothing calls poll, and it only sees 50 PRs** — no code in `client/src` or `e2e/` calls `POST /repos/:id/poll`, and the `polling_interval_min` / `automatic_reviews` settings are read nowhere, so there is no scheduled polling. The adapter fetches one page of the 50 most recently updated PRs (no pagination). Open: is the module a stub for a later lesson?
  Where: `server/src/adapters/github/octokit.ts:48` (single page), `server/src/vendor/shared/contracts/platform.ts:89` (`polling_interval_min`)
