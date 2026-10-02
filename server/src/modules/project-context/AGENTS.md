# project-context — browse a repo's Markdown, attach it to agents and skills

Serves the Project Context page and both attachment stores. Spec: `docs/specs/project-context.md` (SPEC-01).

## Routes (`routes.ts`)
- `GET /repos/:id/context` — live listing; `POST /repos/:id/context/reindex` — same scan
- `GET /repos/:id/context/file?path=` — one document's full text
- `PUT /repos/:id/context/roots` — save the repo's search roots (an empty list is valid)
- `GET`/`PUT /repos/:id/context/agents/:agentId` and `/skills/:skillId` — attached paths

## Layers
`routes.ts` → `service.ts` (deps `{ repo, files, now }`) → `repository.ts` (SQL) + `ports.ts` +
`helpers.ts`/`constants.ts` (pure). `compose.ts` is the only file that sees the `Container`.
Files are read only through the `GitClient` port (`listFiles`, `readFile`) — never `node:fs`.

## Rules you can't infer from the code
- **Nothing is indexed.** Every GET and re-index scans the clone live and reads each match for its size.
- **Roots govern listing and preview, not attachments or runs.** An attachment may name any tracked
  path; `missing` is checked against the whole tracked tree, not the roots.
- **Invalid roots or paths are 422**, via the route's zod refine and again in the service
  (`ValidationError`); a rejected selection stores nothing.
- **Attachments are paths only**, ordered by path; counts include every stored row, enabled or not.
- **Doc type rules run in order, first wins** (`spec` before `insights`).
- **Reviews does not import this module.** It reads the attachment tables through its own repository.
- Saving a selection does not touch agent versions; rows cascade-delete with the agent, skill or repo.
