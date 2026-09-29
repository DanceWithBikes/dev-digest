# Blast Radius — server module

> Introduced in: L04. Overview: [`docs/specs/blast-radius.md`](../../../../../../docs/specs/blast-radius.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal

Map repo-intel's precomputed facade result into the `BlastRadius`/`PrHistory` contracts and serve
them over two routes — `GET /pulls/:id/blast` (the map) and `GET /pulls/:id/prior-prs` (GitHub
history) — with no analysis of its own: `repoIntel.getBlastRadius` has already computed everything.
This module's whole job is the FLAT → GROUPED reshape, the index-state degradation refinement, and
the Prior-PRs GitHub aggregation.

## Acceptance criteria

- [x] `GET /pulls/:id/blast` resolves the PR workspace-scoped, reads the index exactly once (`getBlastRadius` + `getIndexState` in one `Promise.all`), and maps the result — `routes.ts:21`, `service.ts:28` (`forPull`) · test: `../../../../../test/blast-service.test.ts:53` ("calls getBlastRadius exactly once and logs the precomputed-read line"), `../../../../../test/blast.it.test.ts:145`
- [x] `GET /pulls/:id/prior-prs` is rate-limited (`10/min`), chases each of the first `PRIOR_PRS_MAX_FILES` (10) changed files' recent commits (`PRIOR_PRS_COMMITS_PER_FILE` = 5 per file) on GitHub, dedupes shas, and asks GitHub which merged PR(s) each belongs to — `routes.ts:32`, `service.ts:48` (`priorPrs`), `constants.ts:1` · test: `../../../../../test/blast-service.test.ts:77`, `:100`
- [x] `BlastRepository.getPullContext` resolves `pull_requests` joined to `repos`, workspace-scoped, plus `pr_files.path` rows, returning `null` for an unknown/foreign PR — `repository.ts:14` (`getPullContext`) · test: `../../../../../test/blast.it.test.ts:169` ("404s for an unknown PR id")
- [x] `toBlastRadius` groups the facade's flat `callers[]` by `viaSymbol` in rank order, drops a caller whose file also DECLARES the symbol it supposedly calls (the persistent repo-intel path does not do this itself — see `docs/insights.md`), appends caller-less changed symbols as empty groups (deduped by name), and attributes per-caller `endpoints`/`crons` from `factsByFile` — `helpers.ts:22` (`toBlastRadius`) · test: `../../../../../test/blast-mapping.test.ts:11`, `:34`, `:53`, `:71`
- [x] `buildSummary` returns `"N symbols · N callers · N endpoints · N crons"`, with endpoint/cron counts deduplicated unions across groups — `helpers.ts:76` (`buildSummary`) · test: `../../../../../test/blast-mapping.test.ts:116` ("counts symbols, total callers, and the deduplicated endpoint/cron unions")
- [x] `refineDegradation` overrides the facade's own `degraded`/`reason` when the SEPARATELY-read index state is `partial` (→ `index_partial`) or `failed` (→ `index_failed`); a `full` state leaves the result untouched — `helpers.ts:96` (`refineDegradation`) · test: `../../../../../test/blast-mapping.test.ts:141`, `:147`, `:153`, `:158`
- [x] `aggregatePriorPrs` keeps merged PRs only, excludes the current PR number, dedupes by PR number (unioning `files_overlap`), sorts by `merged_at` desc, caps at `PRIOR_PRS_LIMIT` (10), and sets `notes = "touched N of these files"` — `helpers.ts:113` (`aggregatePriorPrs`) · test: `../../../../../test/blast-prior-prs.test.ts:18`, `:30`, `:40`, `:54`
- [x] A GitHub failure inside `priorPrs` is logged (`log.warn`) and re-thrown as `ExternalServiceError`, never surfaced as a silent partial list — `service.ts:73` (`catch` block) · test: `../../../../../test/blast-service.test.ts:100` ("a GitHub failure logs a warning and throws ExternalServiceError")
- [x] `makeBlastService` wires `BlastRepository`, `container.repoIntel` (satisfies `BlastRadiusReader` structurally) and `() => container.github()` (satisfies `PriorPrsGitHub` structurally) — `blast/` never imports `repo-intel/` or `adapters/` by name — `compose.ts:12` (`makeBlastService`) · untested directly (exercised end-to-end by `blast.it.test.ts` and by the route/MCP integration tests)

## Touched packages / modules

Project overview and the full cross-package table: [`docs/specs/blast-radius.md`](../../../../../../docs/specs/blast-radius.md).

## Open questions

- **`compose.ts#makeBlastService`'s structural wiring has no dedicated unit test** — it's exercised only indirectly through `blast.it.test.ts` (route) and `server/test/mcp-tools.test.ts` (MCP), never asserted in isolation (e.g. that `container.repoIntel`/`container.github()` really satisfy the narrow ports without a compile-time-only check).
- See `docs/insights.md` for the non-obvious facts behind these criteria: the persistent path's missing self-file filter, `factsByFile` being keyed by the CALLER's file, and `flag_off`/`repo_too_large` being declared but currently unreachable.
