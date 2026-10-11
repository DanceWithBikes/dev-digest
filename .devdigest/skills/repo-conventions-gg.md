# Repository conventions

These rules were extracted from this repository’s own code and confirmed by a
reviewer. Apply them to the diff under review. Each rule cites the file and
line it was observed in — cite that evidence when you report a violation.


## Naming

- Database schema tables use the shared `now()` helper for `created_at` columns, never inline `timestamp(...)`.
  - Evidence: `server/src/db/schema/core.ts:10`

## Structure

- Barrel files re-export all domain modules and also import them to build a combined object for client typing.
  - Evidence: `server/src/db/schema.ts:15`