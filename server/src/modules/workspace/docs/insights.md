# Insights — server/modules/workspace

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · `GET /workspace` exposes absolute server paths, and `cloned` goes stale** — `cloneDir` and each `clone_path` go to any caller of an API with no auth (it binds `0.0.0.0`, see `server/docs/insights.md`). `cloned = Boolean(clonePath)` never checks the disk, and the comment "cleanup is handled by repos" is wrong: `DELETE /repos/:id` deletes only the DB row, so the clone dir stays on disk and silently drops out of this overview. Untested.
  Where: `routes.ts:24` (`cloneDir`), `routes.ts:30` (`cloned`), `routes.ts:10` (the cleanup comment), `server/src/modules/repos/repository.ts:80` (row-only delete)
