# Insights — conventions

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

- **2026-09-21 · A feature model has to be resolved through the container, not by importing the settings module** — This module picks its LLM from Settings (`feature_models.conventions`), and the obvious call is `resolveFeatureModel(container, workspaceId, 'conventions')` from `modules/settings/feature-models.ts`. That import fails `pnpm arch:check` under `no-cross-module-imports`, which allows only `_shared` across module folders. What works: put the delegation on the composition root — `Container.featureModel(workspaceId, id)` — since `platform-does-not-know-modules` explicitly exempts `container.ts`, which already imports `AgentsRepository` and `ReviewRepository` for the same reason. Same move for writing the assembled skill: `container.skillsRepo`, never `import … from '../skills/repository.js'`. Side effect worth knowing: this is the first real consumer of `resolveFeatureModel`, which `settings/docs/insights.md` had flagged as dead code.
  Where: `../compose.ts` (`LlmConventionAnalyst.propose`), `server/src/platform/container.ts:123` (`featureModel`), `server/src/platform/container.ts:113` (`skillsRepo`), `server/.dependency-cruiser.cjs` (rules `no-cross-module-imports`, `platform-does-not-know-modules`)

## What Doesn't Work

## Codebase Patterns

- **2026-09-21 · The create-skill modal must DEFAULT to attaching, because an unattached conventions skill is a no-op** — `ConventionSkillRequest.agent_id` is optional server-side (a skill with no link is a legitimate state), so the modal originally opened on "Don't attach it yet". That reads like a safe default and is not one: the whole point of the feature is that accepted rules reach a review, and a skill attached to nobody changes no prompt while still looking done on the Skills page. There is no "primary agent" concept in `schema/agents.ts` to consult, so the modal now preselects the first *enabled* agent and keeps "Don't attach it yet" as an explicit choice. If a default-reviewer concept ever lands, replace the `find(a => a.enabled)` with it rather than re-opening the question. Found by re-reading the code against the lesson's acceptance criteria, not by a failing test — nothing here is type-checkable.
  Where: `../../../../../client/src/app/repos/[repoId]/conventions/_components/ConventionsView/_components/CreateSkillModal/CreateSkillModal.tsx` (`NO_AGENT`, the preselect effect), `server/src/vendor/shared/contracts/knowledge.ts` (`ConventionSkillRequest.agent_id`), `../compose.ts` (`SkillsRepoWriter.upsertByName`, the `input.agentId` branch)

- **2026-09-21 · The scan persists candidates before anyone judges them, and that is what makes a rejection permanent** — It is tempting to hold a scan's output in memory and only write the accepted rules. Don't: `status` on the row IS the judgement, and `dropKnownRules` filters every re-scan against all rules already on record for the repo, whatever their status. Without stored `rejected` rows, the second scan re-proposes everything the user turned down, and the page becomes unusable after two runs. The same reasoning is why `ruleKey` normalises case, punctuation and whitespace before comparing — the model almost never re-words a rule byte-for-byte, so an exact-match dedupe silently fails.
  Where: `../helpers.ts` (`dropKnownRules`, `ruleKey`), `../service.ts` (`extract`), `server/src/db/schema/knowledge.ts:31` (`conventions.status`)

- **2026-09-21 · Sampling is model-free on purpose — never let an LLM choose what to read** — `ConventionSampler` picks config files by name plus the top-N ranked files from `container.repoIntel.getConventionSamples()`, all deterministic. Two scans of the same commit therefore show the model the same evidence, which is the only reason the per-candidate confidence numbers can be compared at all. A "smarter" selection step that asked a model which files look interesting would make every scan irreproducible and the confidences meaningless. The matching guard on the way back is `groundDrafts`, which drops any candidate citing a path that was not in the sample: the model will happily attribute a real rule to a plausible-sounding file it never saw, and such a card cannot be reviewed because its evidence link leads nowhere.
  Where: `../compose.ts` (`RepoIntelSampler.collect`), `../helpers.ts` (`groundDrafts`), `server/src/modules/repo-intel/service.ts:630` (`getConventionSamples`)

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-21 · First `Run Scan` fails with `OPENAI_API_KEY is not configured` on a dev box that only has an OpenRouter key** — The registry default for the `conventions` feature is `provider: 'openai', model: 'gpt-5.4'`, so `container.featureModel()` returns OpenAI until the workspace overrides it, and `container.llm('openai')` then throws `ConfigError`. Root cause is a mismatch, not a bug: `SettingsModels` always writes `provider: "openrouter"` when a model is picked, but the registry defaults were authored against OpenAI. Fix: pick a model for the **Conventions** row in Settings → Feature Models before the first scan (that also exercises the dynamic-model requirement). Verified on this machine: `~/.devdigest/secrets.json` has `OPENROUTER_API_KEY` only. The same trap applies to `onboarding`, whose default is already an OpenRouter model, and to `review_intent`/`risk_brief`/`conformance`, which are not.
  Where: `server/src/vendor/shared/contracts/platform.ts:74` (the `conventions` entry), `server/src/platform/container.ts` (`buildLlm`, the `ConfigError`), `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:32` (`setModel` hardcodes `provider: "openrouter"`)

## Session Notes

- **2026-09-21 · Module built from scratch for L02** — routes/service/repository/ports/compose + pure helpers and prompt, registered in `modules/index.ts`. `pnpm typecheck`, `pnpm arch:check` (no new violations) and the unit suite are green; `test/conventions-helpers.test.ts` covers grounding, dedupe and assembly. Follow-ups: no integration test against a real Postgres yet, and extraction runs inline in the request rather than as a background job — fine for one bounded model call, but it will need `container.jobs` if the sample ever grows.

## Open Questions
