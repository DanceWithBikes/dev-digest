# server/modules — API features

## Adding a module
1. `modules/<name>/routes.ts` with a default-exported Fastify plugin.
2. One import + one entry in `modules/index.ts` (static registration, no autoload).
3. Don't edit shared schema tables — only add your own columns/tables via a migration.

## Layers inside a module (Onion rings — imports point inwards only)
`routes.ts` (HTTP, zod schemas) → `service.ts` (use cases) → `repository.ts` (SQL) + `ports.ts` (interfaces) + `domain.ts`/`helpers.ts` (pure) + `constants.ts` (literals) + `compose.ts` (wiring).
A module with no DB access and no rules may live in a single `routes.ts` — the first query means a `repository.ts` and a `service.ts`. Copy `conventions/` (the full set, incl. `ports.ts`/`compose.ts`) or `pulls/`; `repos/` is clean apart from its service still taking the `Container`.
Full ring map, ports, transactions, testing: the `backend-onion-architecture` skill.

## Rules
- Routes use `appBase.withTypeProvider<ZodTypeProvider>()` with `params`/`body`/`response` schemas in route options.
- Get `workspaceId` only via `getContext(container, req)` from `_shared/context.ts`.
- uuid `/:id` params → `IdParams` from `_shared/schemas.ts`.
- Never import another module's folder — shared pieces come from `container` (`agentsRepo`, `reviewRepo`, `repoIntel`).
- Only `repository.ts` imports `drizzle-orm`/`db/**` (`import type` counts); only `routes.ts` imports `fastify`; only `routes.ts`/`compose.ts` import `platform/container.ts`.
- Services take a narrow deps object of ports, not the `Container`; adapters are constructed only in `platform/container.ts`.
- Business failures throw a *class* from `platform/errors.ts` — never `reply.code()` or a numeric status outside that file.
- `cd server && pnpm arch:check` enforces the above (CI runs it). Existing violations are baselined; never baseline a new one.

## Docs
../../README.md (API map) · each module: `AGENTS.md`, `docs/specs/`, `docs/insights.md`
