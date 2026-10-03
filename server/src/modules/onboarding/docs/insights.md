# Insights — server/modules/onboarding

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-10-03 · A late `generate` cannot store: the deadline race is inside `runGeneration`, and storing happens after it** — `runGeneration` races `generate()` against `acceptedAt + 90 s`, builds the `timed_out` tour itself and only then stores, under a per-repo token (`gate.isCurrent`). The abandoned `generate()` keeps running but its result is dropped; do not move `persist` into `generate`. A run already past its deadline when dequeued throws `DeadlineError` before starting any work (a pure-microtask `generate` would otherwise beat a 0 ms timer).
  Where: `src/modules/onboarding/service.ts` (`runGeneration`, `persist`), `src/modules/onboarding/compose.ts` (`InMemoryGate`, `SerialRunner`)

- **2026-10-03 · Pre-L05 onboarding scaffolding does not match SPEC-02 — replace it, don't build on it** — The repo already had pieces for an older idea of onboarding:
  - a loose `Onboarding` contract (`kind: string`, free markdown sections)
  - an `onboarding` table keyed only by `repo_id`, with no `workspace_id`, SHA or status
  - a system prompt asking for a different section set
  - client copy listing different sections

  None of it is wired to a route or page. SPEC-02 replaces all of it with a typed five-section contract, so change both `@devdigest/shared` copies and add the new columns through a generated migration.
  Where: `server/src/vendor/shared/contracts/knowledge.ts:28` (`// ---- Onboarding ----`), `server/src/db/schema/context.ts:120` (`onboarding`), `server/src/prompts/onboarding.system.md:3`, `client/messages/en/onboarding.json:10`
  **Correction (2026-10-03):** the server side is replaced: the contract is `contracts/onboarding.ts`, the table gained `workspace_id`/`status`/`commit_sha`/`last_failed_*`, the stale prompt file is deleted and the module is wired (`routes.ts`, `service.ts`). Only the client copy `client/messages/en/onboarding.json` is still the old text until B4.
  **Correction (2026-10-03):** B4 replaced `client/messages/en/onboarding.json` too; no pre-L05 onboarding scaffolding remains.

## Tool & Library Notes

- **2026-10-03 · `onboarding-service.test.ts` harness: an omitted `write` REJECTS, and `acceptedAt` is taken at request time** — `makeHarness({})` gives a writer that throws `boom`, so a test that forgets `write: async () => GOOD` silently ends `llm_failed`. To simulate a run that waited in the queue, request first, then `setNow(...)`, then drain. With fake timers, set `h.deps.clock` to read `Date.now()`. The harness gate shares one POST window across repos; per-repo isolation is only covered in `onboarding.it.test.ts`.
  Where: `server/test/onboarding-service.test.ts:46` (`write` default → `Promise.reject(new Error('boom'))`), `server/test/onboarding-service.test.ts:17` (`makeHarness`)
