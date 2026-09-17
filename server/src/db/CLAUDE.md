# server/db — Drizzle schema, migrations, seed

- `schema.ts` is a barrel; tables are split by domain in `schema/*.ts`.
- The schema already contains the tables of ALL course lessons; empty tables (ci, eval, knowledge, skills, context) are expected.
- Every domain table has `workspace_id`; every query scopes by it.
- New column/table: edit `schema/<domain>.ts` → `pnpm db:generate` → `pnpm db:migrate`. Don't rename or drop existing tables.
- `seed.ts` must stay idempotent (it runs on every `dev.sh`). Built-in agent prompts: `seed-prompts.ts`.
- pgvector is enabled by migration `0000`.

Do-not-touch: `migrations/**` and `migrations/meta/**` — drizzle-kit output, never hand-edit.

Docs: ../../README.md (Environment) · ../../docs/insights.md
