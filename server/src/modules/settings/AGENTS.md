# modules/settings — settings and keys

Routes: `GET|PUT /settings` · `GET /settings/secrets-status` · `POST /settings/test-connection`

- Keys are written to `~/.devdigest/secrets.json` (mode 0600) via `SecretsProvider`, NOT the DB; the API never returns key values, only their status.
- `feature-models.ts`: system LLM features read provider/model from workspace settings; when unset, they fall back to `FEATURE_MODELS` (`@devdigest/shared`). It reads through `SettingsRepository`, not the db handle.
- `GET|PUT /settings` go through `service.ts`; `secrets-status` and `test-connection` stay in `routes.ts` — they touch `SecretsProvider` and the provider clients, never the `settings` table.

Docs: docs/specs/ · docs/insights.md
