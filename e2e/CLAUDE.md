# e2e — `@devdigest/e2e` (browser flows)

## Commands
```sh
npm i -g agent-browser && agent-browser install   # once
npm run e2e:hermetic   # recommended: isolated stack (PG :5433, API :3101, web :3100)
npm test               # against an already running stack (E2E_BASE_URL, default :3000)
```

## Map
- `specs/NN-name.flow.json` — a flow: ordered list of agent-browser commands
- `run.ts` — runner; `lib/assert.ts` — stdout checks

## Conventions
- Assertions = `wait --text` / `wait --url` (non-zero exit fails the step).
- Deterministic locators only (`--url`, `--text`, `find role|text|label`). Never use the AI `chat` command.
- Flows use seeded data only (`acme/payments-api`, PR #482, built-in agents) and never call an LLM.

## Gotchas
- `npm test` against a dev DB with other repos breaks flows 02/04/05 (home redirects to the first repo). Use `e2e:hermetic`.
- NEVER "reset" the dev DB with `docker compose down -v` — it deletes all imported data.

## Docs
README.md · ../TESTING.md · docs/specs/ · docs/insights.md
