# modules/repo-intel — codebase indexer

Routes: `GET /repos/:id/index-state` (Indexed badge) · `POST /repos/:id/resync`

- Starter infrastructure: course features (Blast Radius, Conventions, Onboarding, Phantom gate) call the `repoIntel.*` facade from `container`, never the pipeline.
- Consumers import only `types.ts` / the facade; never `@ast-grep/napi`, dependency-cruiser or graphology directly.
- Rank = PageRank x (1 + hotness); hotness counts commits over the newest 50 in the clone (`pipeline/hotness.ts`). `INDEXER_VERSION` is 3, so older repos fully reindex on their next refresh.
- Strict readers for Onboarding (`readIndexState`, `getRankedFiles`, `getImportEdges`, `getEndpoints`) let DB errors propagate, unlike the rest of the facade.
- Degraded contract: array methods return `[]`, object methods return `degraded: true` + `reason`. The facade never throws (except the strict readers above); status comes from `getIndexState()`.
- Indexing is a background job after clone; incremental indexing is keyed by file content hash (`pipeline/incremental.ts`).
- During a review the index is only read.

Docs: README.md (pipeline, facade) · docs/specs/ · docs/insights.md
