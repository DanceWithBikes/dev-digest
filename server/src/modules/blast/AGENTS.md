# modules/blast — Blast Radius

Routes: `GET /pulls/:id/blast` · `GET /pulls/:id/prior-prs`

Which callers, HTTP endpoints and crons a PR's changed symbols can affect — the
studio's Overview-tab card and the `get_blast_radius` MCP tool both read this
route's response (MCP calls `BlastService.forPull` directly, so the payload is
identical by construction).

- **No analysis happens here.** `repoIntel.getBlastRadius(repoId, changedFiles)`
  (`modules/repo-intel/`) has already computed everything from the precomputed
  index; this module's whole job is mapping the facade's FLAT `callers[]` list
  (one row per caller, pointing at its `viaSymbol`) into the contract's GROUPED
  `downstream[]` shape (`helpers.ts#toBlastRadius`). No AST parsing, no model
  call, no re-reading the clone.
- **`blast/` may not import `repo-intel/types.ts`** — `no-cross-module-imports`
  forbids one module folder reaching into another's. `ports.ts` declares a
  STRUCTURAL copy of the facade's result shape (`BlastFacadeResult`,
  `BlastChangedSymbol`, `BlastCallerRow`) instead; `container.repoIntel`
  satisfies it without either side importing the other. `BlastDegradedReason`
  is the one shared piece — exported from `@devdigest/shared/contracts/brief.ts`
  so both `repo-intel/types.ts#DegradedReason` and this module's contract field
  draw from the same enum values without a direct import.
- **The self-file filter is required, not defensive polish.** The persistent
  repo-intel path does NOT drop a caller whose file also declares the symbol
  it's calling (only the ripgrep fallback does) — `helpers.ts#toBlastRadius`
  is what guarantees a symbol never lists itself as its own caller. See
  `docs/insights.md`.
- **Index-state degradation is refined, not just passed through.** The facade's
  own `degraded`/`reason` never distinguish `index_partial` from a clean
  `full` index (both come back `degraded: false`), and a `failed` index state
  isn't surfaced at all. `helpers.ts#refineDegradation` reads
  `getIndexState()` separately and overrides `partial → index_partial`,
  `failed → index_failed` before the mapping runs.
- **Prior PRs is a second, independent read** (`priorPrs`) that DOES call
  GitHub — chases each changed file's recent commit history, dedupes shas
  across files, and asks GitHub which PR(s) each sha belongs to. A GitHub
  failure here throws `ExternalServiceError` (never a silent partial list);
  the Overview card's map itself never depends on this call succeeding.
- `service.ts` calls `getBlastRadius` **exactly once** per `forPull` — evidence
  is the `BLAST_READ_LOG` line (`blast: reading precomputed repo-intel index`),
  proving the hot path reads the index rather than re-parsing the repo.

Docs: docs/specs/ · docs/insights.md
