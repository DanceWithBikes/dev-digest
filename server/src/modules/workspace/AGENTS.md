# modules/workspace — current workspace

Route: `GET /workspace`

- No authentication: `LocalNoAuthProvider` always returns the default workspace + system user.
- Other modules get the workspace only via `getContext` from `_shared/context.ts`.

Docs: docs/specs/ · docs/insights.md
