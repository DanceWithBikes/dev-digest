# Insights — e2e

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · The L01 features have no e2e flow, though the seed already supports one** — the seeded PR #482 review has one CRITICAL + one WARNING finding and no run row, so without any LLM call the stack shows severity counts in the PR list, pills in the findings panel and "—" as cost. Flow 04 stops at the finding title. Open: add assertions for the FINDINGS column, the pills filter and the COST "—"?
  Where: `server/src/db/seed.ts:136` (seeded review), `specs/04-pr-findings.flow.json:14` (last step)

- **2026-09-19 · CI can miss e2e-breaking changes** — the API under test runs reviewer-core's raw source, yet `reviewer-core/**` and `scripts/e2e.sh` are not in `e2e-web.yml`'s path filter; and `npm run typecheck` (defined here) never runs in CI — tsx doesn't type-check.
  Where: `.github/workflows/e2e-web.yml:20` (`pull_request` paths), `.github/workflows/e2e-web.yml:120` (`npm test` only), `package.json:10` (`typecheck`)
