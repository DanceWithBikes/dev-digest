# Insights — whole project

Knowledge you can't see in the code. Newest entry on top of each section.
Cross-package insights live here; module-specific ones go to the nearest `docs/insights.md`.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.
When an insight becomes a permanent rule, move it as one line into the relevant `CLAUDE.md` and keep the "why" here.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-17 · The two shared-contract copies have drifted** — `adapters.ts` and `contracts/{trace,eval-ci,knowledge,productionize}.ts` differ between copies (in `trace.ts` only comments). Run `diff -rq server/src/vendor/shared client/src/vendor/shared` before changing a contract.
  Where: `server/src/vendor/shared/`, `client/src/vendor/shared/`

- **2026-09-17 · costUsd is lost between the engine and the DB (L01)** — `reviewer-core` returns `costUsd`, but `run-executor` never persists it: `agent_runs` has no `cost_usd` column and the run-row contract has no field. Cost badge path: migration → executor → run.repo → contract (both copies) → UI. `null` means "model price unknown", not `$0`.
  Where: `reviewer-core/src/review/run.ts`, `server/src/modules/reviews/run-executor.ts`, `server/src/modules/reviews/repository/run.repo.ts`

## Tool & Library Notes

- **2026-09-17 · Bulk shell overwrites of docs are denied in auto mode** — a `for … sed > "$f"` loop rewriting all `docs/insights.md` files was blocked by the auto-mode classifier as "irreversible local destruction". Instead: `Read` each file, then `Edit` it (parallel calls are fine).
  Where: `**/docs/insights.md`

## Recurring Errors & Fixes

## Session Notes

## Open Questions
