# modules/workspace — current workspace

Route: `GET /workspace`

- No authentication: `LocalNoAuthProvider` always returns the default workspace + system user.
- Other modules get the workspace only via `getContext` from `_shared/context.ts`.
- Reads `repos` but never writes it — the repos module owns that table. `cloned` is derived from `clonePath` being set, which only happens once the clone job succeeds.

Docs: docs/specs/ · docs/insights.md
