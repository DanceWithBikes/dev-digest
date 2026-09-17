# modules/repo-intel — codebase indexer

Routes: `GET /repos/:id/index-state` (Indexed badge) · `POST /repos/:id/resync`

- Starter infrastructure: course features (Blast Radius, Conventions, Onboarding, Phantom gate) call the `repoIntel.*` facade from `container`, never the pipeline.
- Consumers import only `types.ts` / the facade; never `@ast-grep/napi`, dependency-cruiser or graphology directly.
- Degraded contract: array methods return `[]`, object methods return `degraded: true` + `reason`. The facade never throws; status comes from `getIndexState()`.
- Indexing is a background job after clone; incremental indexing is keyed by file content hash (`pipeline/incremental.ts`).
- During a review the index is only read.

Docs: README.md (pipeline, facade) · docs/specs/ · docs/insights.md
