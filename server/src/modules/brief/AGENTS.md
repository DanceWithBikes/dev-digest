# modules/brief — PR Brief generator

Generates and stores the per-PR brief (SPEC-03, `docs/specs/pr-brief.md`).

Routes: `GET /pulls/:id/brief` (stored brief or null) · `POST /pulls/:id/brief` (generates synchronously, returns the brief).

Layers: `routes.ts` → `service.ts` (ports only) → `repository.ts` · `domain.ts` · `helpers.ts` (pure input selection and grounding) · `prompt.ts` · `ports.ts` · `gate.ts` (in-memory rate window and per-PR tokens) · `compose.ts` (the only file that sees the `Container`).

- Blast comes only through `container.blastReader(log)`; documents through `modules/_shared/context-doc-reader`. Never import `blast/`, `reviews/` or `settings/`.
- Intent and attachments are read by this module's own repository (cross-module data = a query in your own repository).
- Exactly one structured call per generation (feature model `risk_brief` via `container.featureModel`), no `singleAttempt`: the adapter re-ask stays.
- The 90 s deadline runs from request start. A lost race answers an error, releases the in-flight slot, and a per-PR token blocks the late store; a save already under way is awaited and the POST returns the committed brief, not a timeout.
- The document read has its own 15 s sub-deadline (`DOC_READ_TIMEOUT_MS`); losing it counts as no documents, so every path reports "not found".
- 409 per PR (in flight); 5 POSTs per minute per workspace across all PRs, checked before the in-flight flag. Both live in `gate.ts`; it holds at most 6 timestamps per workspace and sweeps expired ones.
- Storage is JSON only in `pr_brief` (`pr_id` + `json`); no migration. A stored body that fails `PrBrief.safeParse` reads as null.
- Exactly one log line per generation; never log body, patch, document or error text.

Docs: docs/specs/ · docs/insights.md
