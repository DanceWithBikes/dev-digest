# Domain types, Zod and errors

## Contents
- What goes in `domain.ts`
- Zod in the centre
- Parse, don't validate
- Three shapes, two mappers
- The two copies of `@devdigest/shared`
- Errors: classes inside, statuses at the edge
- Migrating `AppError.statusCode`

## What goes in `domain.ts`

The module's nouns and its rules, with no imports beyond the domain ring.

```ts
// modules/pulls/domain.ts
export type ReviewStatus = 'not_reviewed' | 'running' | 'passed' | 'blocked';

export interface PullListItem {
  id: string;
  number: number;
  title: string;
  reviewStatus: ReviewStatus;
  severityCounts: SeverityCounts;
  totalCostUsd: number | null;   // null = price unknown, never 0
}

/** Rule: a PR is blocked when any latest-review finding is at or above the gate. */
export function deriveReviewStatus(input: { … }): ReviewStatus { … }
```

Keep rules as functions over plain data. Classes with behaviour are fine where an invariant must be protected across several operations, but an anaemic class with getters adds nothing over a type plus functions - and plain data serializes, compares and fixtures more easily.

Put a rule here, rather than in the service, when it can be stated without the words "load", "save" or "call". "A run older than N minutes with status `running` is stale" is domain. "Find stale runs and mark them failed" is a use case that uses it.

## Zod in the centre

Zod is permitted in the domain ring and in `reviewer-core`. The dependency rule exists to keep *volatile details and I/O* out of the centre; Zod is neither - it is a pure library that describes data, and the `@devdigest/shared` contracts written with it are the project's shared vocabulary. Treating it like Fastify or Drizzle would force a parallel hand-written type for every schema, which is exactly the duplication that drifts.

What stays out of the centre is Zod used *as transport glue*: `fastify-type-provider-zod`, JSON-Schema conversion for an LLM SDK, anything that imports a framework.

## Parse, don't validate

Validation that returns `boolean` throws away what it learned; parsing returns a value whose type proves the check happened. Apply it at each place data enters:

| Entry point | Parsed by | Inner code receives |
|---|---|---|
| HTTP request | the route's `schema` (type provider) | typed `req.body` / `params` / `query` |
| Stored `jsonb` | the repository's row → domain mapping | a domain value |
| LLM output | `reviewer-core` structured parsing (`parseWithRepair`) | contract-typed findings |
| SDK / GitHub payload | the adapter | contract types |
| Env and secrets | `platform/config.ts`, `SecretsProvider` | plain values in `deps` |

Once inside, do not re-check. A service that begins with `RepoInput.parse(input)` either duplicates the route's work or admits that some caller bypasses the boundary - fix the caller.

Use `safeParse` where failure is an expected outcome the code branches on (LLM output, stored snapshots from older shapes); use the throwing form only at boundaries whose error handler understands `ZodError`.

## Three shapes, two mappers

```
row ($inferSelect) ──toRepo()──► domain type ──toRepoDto()──► DTO (Zod contract)
   repository.ts                  domain.ts                    helpers.ts → routes.ts
```

- `toX(row)` is private to the repository file.
- `toXDto(domain)` is a pure function in `helpers.ts`; it imports the contract type and the domain type, never the repository (the gate flags `helpers.ts → repository.ts`).
- Collapse the middle when it is empty: for a module with no rules, the contract type serves as the domain type and the repository maps row → contract.

`null` handling is decided at the mapper, once. Example already in the codebase: `costUsd: null` means "model price unknown" and is never coerced to `0`.

## The two copies of `@devdigest/shared`

`server/src/vendor/shared` and `client/src/vendor/shared` are separate copies; a contract change must land in both, and `diff -rq` them before editing because they have drifted before. The server copy may import nothing from the rest of the server - it is copied verbatim into a browser bundle.

## Errors: classes inside, statuses at the edge

An inner ring states *what went wrong in the product's terms*; only the edge knows that this means `404`.

- Services and repositories throw classes from `platform/errors.ts`: `NotFoundError`, `ValidationError`, `ExternalServiceError`, `ConfigError`.
- Pick a **class**, never a number. `throw new AppError('invalid_repo_url', msg, 400)` in a helper puts an HTTP decision in the domain ring. If no class fits, add a subclass in `platform/errors.ts` with a stable `code` - that file and the error handler in `app.ts` are the only places a status literal may appear.
- No `reply.code()` / `reply.status()` for error paths in routes; `app.setErrorHandler` builds the `{ error: { code, message, details } }` envelope for everything.
- Adapters translate SDK failures into `ExternalServiceError` (502), so a GitHub outage never surfaces as a 400.
- An error that is part of a protocol between two inner pieces and must not become an HTTP response (`RunCancelledError`) is a plain `Error` subclass declared next to its use, and is caught by the use case that owns the protocol.
- `reviewer-core` throws nothing HTTP-shaped and knows no `AppError`; cancellation is an injected `checkCancelled` callback for exactly that reason.

Expected business outcomes are not errors. "Repo already exists" is returned as `{ repo, created: false }`, and the route turns it into `200` versus `201`.

## Migrating `AppError.statusCode`

`AppError` currently carries `statusCode`, so the mapping is smeared across the class hierarchy. The target is a single table in the error handler:

```ts
// app.ts
const STATUS_BY_CODE: Record<string, number> = {
  not_found: 404,
  validation_error: 422,
  external_service_error: 502,
  config_error: 500,
};
reply.status(STATUS_BY_CODE[err.code] ?? 400).send(envelope(err));
```

Do not start this migration as a side effect of another task: it touches every `new AppError(code, msg, status)` call site and the error-envelope tests. Following "pick a class, never a number" in new code is what makes the eventual switch a mechanical change.
