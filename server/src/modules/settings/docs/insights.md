# Insights — server/modules/settings

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · A bad key is saved before it is tested** — `POST /settings/test-connection` with a `key` persists it first, so on `ok:false` the bad key stays and has already replaced any previously working one. Open: test first, persist on success?
  Where: `routes.ts:83` (`secrets.set` before the check)

- **2026-09-19 · The `GITHUB_PAT` fallback never works with the shipped `.env`** — `.env.example` ships `GITHUB_TOKEN=` (dotenv sets `''`), and the lookup uses `??`, so the empty string wins and `GITHUB_PAT` is never read — contradicting `server/CLAUDE.md` ("`GITHUB_PAT` a fallback").
  Where: `server/.env.example:13` (`GITHUB_TOKEN=`), `server/src/adapters/secrets/local.ts:40` (`??`)

- **2026-09-19 · Feature-model resolution has no consumer** — `resolveFeatureModel` / `getFeatureModelOverride` are referenced only by the settings test, although this module's `CLAUDE.md` and the file header say system LLM features read their model from settings. Open: wired up in a later lesson, or dead?
  Where: `feature-models.ts:14` (header claim), `server/test/settings-models.it.test.ts:31` (the only caller)
