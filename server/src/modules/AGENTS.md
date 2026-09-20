# server/modules — API features

## Adding a module
1. `modules/<name>/routes.ts` with a default-exported Fastify plugin.
2. One import + one entry in `modules/index.ts` (static registration, no autoload).
3. Don't edit shared schema tables — only add your own columns/tables via a migration.

## Layers inside a module
`routes.ts` (HTTP, zod schemas) → `service.ts` (business logic) → `repository.ts` (SQL) + `helpers.ts` (pure functions) + `constants.ts` (literals).
Tiny modules (`polling`, `workspace`) may live in a single `routes.ts`.

## Rules
- Routes use `appBase.withTypeProvider<ZodTypeProvider>()` with `params`/`body` schemas in route options.
- Get `workspaceId` only via `getContext(container, req)` from `_shared/context.ts`.
- uuid `/:id` params → `IdParams` from `_shared/schemas.ts`.
- Never import another module's folder — shared pieces come from `container` (`agentsRepo`, `reviewRepo`, `repoIntel`).

## Docs
../../README.md (API map) · each module: `AGENTS.md`, `docs/specs/`, `docs/insights.md`
