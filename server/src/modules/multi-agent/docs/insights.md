# Insights — multi-agent

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns
- **2026-10-11 · `GET /multi-agent-runs/:id` deliberately does NOT use `IdParams`** — SPEC-05 (AC-33) wants 404 for any id that names no run, but the uuid `IdParams` schema turns a non-uuid id into a 422 `ZodError`. The route takes `z.string().min(1)` and the service maps a non-uuid to `NotFoundError`. Don't "fix" it back to `IdParams`.
  Where: `routes.ts:41` (`params: z.object({ id: z.string().min(1) })`), `service.ts:23` (`isUuid(id)` from `../_shared/uuid.ts`)


## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
