# multi-agent — read side of a multi-agent launch (parent run, location groups, disagreements, estimates)

A multi-agent launch is one `multi_agent_runs` parent with one `agent_runs` child per selected agent.
The parent is **written** by the `reviews` module (the `agentIds` trigger on `POST /pulls/:id/review`);
this module only **reads**: `GET /multi-agent-runs` (50 newest), `GET /multi-agent-runs/estimates`,
`GET /multi-agent-runs/:id` (columns, location groups, conflicts). Spec: `../../../../docs/specs/multi-agent-review.md`
(SPEC-05; this module's criteria AC-31…AC-60 are in `docs/specs/multi-agent-review.md`).

## Layers (flat module)
`routes.ts` → `service.ts` → `repository.ts` (the only file touching drizzle / `src/db`) + `ports.ts` +
`domain.ts`/`helpers.ts`/`constants.ts` (pure). `compose.ts` is the only file that sees the `Container`.

## Rules you can't infer from the code
- `workspaceId` only via `getContext`; every read is scoped by workspace in its SQL (unlike `/runs/:id/*`).
- Never import another module's folder: review / finding / agent rows are read by this module's own repository queries.
- Parent status and totals are derived on read, never stored. Location groups and conflicts are computed on read
  by the pure grouping in `domain.ts`/`helpers.ts`; originals keep their id and agent.
- "did not flag" carries no reason text and costs no model call.
- Pure code stays in `constants.ts`/`domain.ts`/`helpers.ts`/`ports.ts` (the purity rule matches exact filenames).

## Docs
`../AGENTS.md` (module rules) · `docs/insights.md` · `docs/specs/` · the `backend-onion-architecture` skill
