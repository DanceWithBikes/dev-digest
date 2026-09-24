# Insights — reviewer-core

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-09-24 · This package's purity is enforced by the SERVER's `arch:check`, not by anything in here — `npm run typecheck && npm test` proves nothing about I/O** — `reviewer-core` has no `arch:check` script and no `.dependency-cruiser.cjs` of its own (`package.json` scripts are exactly `typecheck`, `build`, `test`). The two rules that make the "no I/O, index-only" invariants real — `reviewer-core-has-no-io` and `reviewer-core-only-through-its-index` — live in `server/.dependency-cruiser.cjs:165` and `:157`, and they see this package only because the server's cruise follows its tsconfig `paths` alias into `../reviewer-core/src/**`. Two consequences: (a) a green `npm test` here is NOT evidence that a new file is pure — you must run `cd server && pnpm arch:check`; (b) a `reviewer-core` file that nothing in the server's import graph reaches is **silently unchecked**, so a new engine module should be exported from `index.ts` and reached by the server (directly or transitively) before you trust the gate on it. Verified for L03's `src/intent/filter.ts`: it appears in the server's cruised module set, so the rules actually evaluated it.
  Where: `package.json:5` (scripts — no `arch:check`), `../server/.dependency-cruiser.cjs:165` (`reviewer-core-has-no-io`), `../server/.dependency-cruiser.cjs:157` (`reviewer-core-only-through-its-index`), `src/intent/filter.ts` (confirmed inside the cruised set)

- **2026-09-24 · There are TWO prompts in this feature and only one of them lives here — don't look for the classifier prompt in `reviewer-core`** — The Intent Layer has a *classifier* prompt (builds the intent) and a *reviewer* prompt (consumes it). Only the reviewer prompt is in this package (`src/prompt.ts`'s `## PR intent (derived)` slot + `SCOPE_INSTRUCTION`); the classifier prompt is assembled server-side in `server/src/modules/reviews/intent-prompt.ts`, because gathering its sources needs GitHub and the filesystem, which this package may never touch. So any test asserting something about the **classifier** prompt — e.g. "`UnifiedDiff.raw` never reaches it" — cannot live in `test/prompt.test.ts`: `reviewer-core` may not import the server. That assertion correctly lives in `server/test/reviews-intent-sources.test.ts`. The two packages share only `wrapUntrusted`, which the server imports from this package's index.
  Where: `src/prompt.ts:36` (`SCOPE_INSTRUCTION` — the reviewer side), `src/prompt.ts:44` (`wrapUntrusted`, the shared piece), `../server/src/modules/reviews/intent-prompt.ts` (the classifier side), `../server/test/reviews-intent-sources.test.ts` (where the `raw` assertion lives)

- **2026-09-24 · `scoreFromFindings` is the one reviewer-core function tests must deep-import — `index.ts` deliberately doesn't re-export it** — `AGENTS.md` says "consumers import only from `src/index.ts`", and for every other helper that holds. But `index.ts:40` re-exports only `reduceReviews` and `sliceDiff` from `review/reduce.ts`; `scoreFromFindings` stays internal because the score is recomputed *inside* the engine and the model's self-reported score is ignored — exposing it would invite a caller to compute a rival score. A test that needs to assert the recomputed score therefore imports `../src/review/reduce.js` directly, which looks like a boundary violation and is not: the index-only rule binds *consumers* (server, CI runner), not this package's own tests. Don't "fix" it by adding the export.
  Where: `src/index.ts:40` (`export { reduceReviews, sliceDiff }` — no `scoreFromFindings`), `src/review/reduce.ts:27` (`scoreFromFindings`), `src/review/run.ts:229` (the only production caller), `test/intent-filter.test.ts:4` (the deep import)

## Tool & Library Notes

- **2026-09-24 · There is no `openrouter` npm package here — `OpenRouterProvider` is the official `openai` SDK pointed at a different `baseURL`** — Searching `package.json` for an OpenRouter dependency (to answer "where does the LLM client get created?") finds nothing named `openrouter`; the only LLM-shaped dependency is `"openai": "^4.77.0"`. `OpenRouterProvider` (`src/llm/openrouter.ts:38`) imports `OpenAI` from that package and constructs `new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1', ... })` — OpenRouter is OpenAI-compatible, so the same SDK just gets redirected. The actual network call is `this.client.chat.completions.create(...)` inside `completeStructured` (`src/llm/openrouter.ts:66`), i.e. deep inside a method that looks provider-agnostic from its name. Anyone tracing "where do we call the AI" from `server/src/platform/container.ts#llm()` (a plain method name, not a package) needs to follow it here, not grep for "openrouter" in `node_modules` or `package.json`.
  Where: `src/llm/openrouter.ts:1` (`import OpenAI from 'openai'`), `src/llm/openrouter.ts:47` (`new OpenAI({ baseURL: ... })`), `src/llm/openrouter.ts:66` (`this.client.chat.completions.create`), `../server/src/platform/container.ts:187` (`llm()` — the method name that isn't a package), `../server/src/platform/container.ts:209` (`new OpenRouterProvider(key, ...)` — the one construction site)

- **2026-09-24 · Chaining a second `{ kept, dropped }` gate needs an explicit type annotation or TS infers `never[]`** — When a gate is conditional — `hasIntent ? filterByIntent(ground.kept) : { kept: ground.kept, dropped: [] }` — TypeScript narrows the literal `[]` in the else-branch to `never[]`, the two branches fail to unify, and the error surfaces later at the `dropped` consumer rather than at the ternary, which makes it read like a bug in the gate. Annotate the result explicitly (`GroundingResult`, or `{ kept: Finding[]; dropped: { finding: Finding; reason: string }[] }`). Relevant because the grounding/scope gates are designed to chain, so any future third gate hits the same thing.
  Where: `src/review/run.ts:229` (the chained gates feeding `scoreFromFindings`), `src/intent/filter.ts:22` (`filterByIntent` returning `GroundingResult`), `src/grounding.ts` (`GroundingResult` — the shape both gates share)

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-18 · Grounding can't catch a wrong line number inside a brand-new file** — `groundFindings` keeps a finding when its line range intersects a diff hunk. In a newly added file the whole file IS one hunk, so any line from 1 to EOF passes. Observed: a `deepseek-v4-flash` run on a 67-line new file cited `start_line = 1` for all three findings — one naming a function that doesn't exist (`isOverQuota`) — and still scored `3/3 passed`. Open: should the gate also check that the cited range overlaps a line containing an identifier from the finding's title/rationale, or at least reject line 1 when line 1 is a comment? Checked: nothing in `grounding.ts` looks at content, only ranges. Owner: whoever next touches the citation gate.
  Where: `src/grounding.ts:52` (`groundFindings`), `src/grounding.ts:73` (the only check — `rangeIntersects`, declared at `:41`, compares line numbers, never content)

- **2026-09-19 · `sliceDiff` matches file sections by substring** — `line.includes(\`b/${path}\`)` also captures a longer path with that prefix, so slicing `src/a.ts` pulls in the `src/a.tsx` section and another file's hunks leak into a map-reduce chunk. Untested — no test runs map-reduce at all (the server test titled "map-reduce" uses a one-file diff, which `selectMode` always sends single-pass).
  Where: `src/review/reduce.ts:64` (`includes`), `src/review/run.ts:117` (`selectMode`), `server/test/reviews.it.test.ts:160`

- **2026-09-19 · The Live Log's "Reduced to … score=" is not the persisted score** — the reduce event prints the merged model/mean score, but the returned score is recomputed from the grounded findings, so the log and the saved score can disagree.
  Where: `src/review/run.ts:193` (event), `src/review/run.ts:208` (`scoreFromFindings(ground.kept)`)

- **2026-09-19 · README drift** — the README names a "`run` entrypoint and `reduce`" and a `toReview()` helper; the real exports are `reviewPullRequest`, `reduceReviews`, `toReviewPayload`. Tests also import server source by relative path (`../../server/src/adapters/mocks.js`), against the "cross-package imports only via tsconfig `paths`" rule.
  Where: `README.md:41`, `src/index.ts:39` (`reviewPullRequest`), `test/run.test.ts:3`
