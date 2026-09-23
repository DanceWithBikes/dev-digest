# server — `@devdigest/api` (Fastify 5, :3001)

## Commands
```sh
pnpm dev                                              # tsx, :3001
pnpm test                                             # unit + integration
pnpm exec vitest run --exclude '**/*.it.test.ts'      # unit, no Docker
pnpm exec vitest run .it.test                         # integration, needs Docker
pnpm db:generate / db:migrate / db:seed
pnpm typecheck
pnpm arch:check                                       # import-boundary gate (Onion rings), also in CI
```

## Map
- `src/modules/` — features (each is a Fastify plugin), see `src/modules/AGENTS.md`
- `src/adapters/` — the outside world (LLM, GitHub, git, ast-grep…) + `mocks.ts`
- `src/platform/` — DI container, config, SSE, jobs, errors, run logging
- `src/db/` — Drizzle schema, migrations, seed
- `src/vendor/shared/` — `@devdigest/shared` (Zod contracts, copy 1 of 2)
- `test/` — tests; `test/helpers/pg.ts` = testcontainers Postgres

## Conventions
- Validate only via the route's zod schema (`fastify-type-provider-zod`); no `Schema.parse(req.body)` in handlers.
- Throw classes from `platform/errors.ts` (`NotFoundError`…) instead of setting `reply.code()` by hand.
- A test that imports `test/helpers/pg.ts` MUST be named `*.it.test.ts`.
- `@devdigest/reviewer-core` is consumed as TS source via tsconfig `paths`.
- Imports use the `.js` extension (ESM), even for `.ts` files.

## Gotchas
- Secrets only via `container.secrets` (`~/.devdigest/secrets.json`, `process.env` fallback); `GITHUB_TOKEN` is canonical, `GITHUB_PAT` a fallback.
- Under `NODE_ENV=test` the global rate limit is off and logs are silent.
- `REPO_INTEL_ENABLED` defaults to `true`, but repo context only appears once the repo is indexed.

## Docs
README.md (API map, env vars, DI flow) · ../TESTING.md · docs/specs/ · docs/insights.md
