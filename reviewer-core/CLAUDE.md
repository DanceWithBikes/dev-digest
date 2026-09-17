# reviewer-core — `@devdigest/reviewer-core` (review engine)

## Commands
```sh
npm test            # vitest, LLMProvider is stubbed — no keys, no network
npm run typecheck   # this IS the build: the package emits no JS
```

## Map
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — `groundFindings` (citation check against the diff)
- `src/llm/` — OpenRouter provider, structured output (Zod → JSON Schema, parse-with-repair)
- `src/review/` — `run.ts` (`reviewPullRequest`), `reduce.ts` (map-reduce)
- `src/index.ts` — public API; consumers import only from here

## Invariants
- No I/O: DB, GitHub and filesystem are forbidden. The only external call goes through the injected `LLMProvider`.
- A finding that doesn't cite a real diff line is dropped; the score is recomputed from the survivors. The model's self-reported score is ignored.
- Prompt-injection defense is ONE trusted rule, `INJECTION_GUARD`. Do NOT add keyword filters for untrusted text.
- Optional prompt slots (`skills`, `memory`, `specs`, `callers`, `repoMap`) are omitted when empty.

## Gotchas
- The server imports TS source directly: a public API change can break `server` typecheck — check both packages.
- Contracts (`Review`, `Finding`…) come from `@devdigest/shared`, not defined here.

## Docs
README.md (pipeline, public API) · ../TESTING.md · docs/specs/ · docs/insights.md
