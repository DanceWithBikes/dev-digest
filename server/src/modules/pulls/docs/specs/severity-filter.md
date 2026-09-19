# Severity filter — pulls part

> Introduced in: L01. Overview: [`docs/specs/severity-filter.md`](../../../../../../docs/specs/severity-filter.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal
See findings broken down by severity — on the PR list, the run timeline and the findings panel — and filter the panel by severity.
This part: the PR list's `severity_counts` and `finding_previews`.

## Acceptance criteria
- [x] "Latest review" per PR = `reviews` rows with `kind = 'review'`, newest `createdAt` first, first seen per PR wins; computed on read, no denormalized column — `server/src/modules/pulls/routes.ts:123` (`latestReviewByPr` query), `server/src/modules/pulls/routes.ts:127` · test: `server/test/reviews.it.test.ts:215` ("PR list rolls up the latest review: severity counts + read-only previews")
- [x] `severity_counts` = `rollupSeverities` over that review's findings as `{critical, warning, suggestion}`; unknown severities are ignored — `server/src/modules/pulls/routes.ts:194`, `server/src/modules/pulls/status.ts:23` (`rollupSeverities`) · test: `server/test/pulls-status.test.ts:60` ("tallies findings into critical / warning / suggestion buckets (ignores unknown)"), `server/test/reviews.it.test.ts:215`
- [x] Dismissed (and accepted) findings are INCLUDED — the findings query has no state filter, so list counts match the PR page's per-run pills — `server/src/modules/pulls/routes.ts:142` (`inArray(t.findings.reviewId, latestReviewIds)`) · test: `server/test/reviews.it.test.ts:215`
- [x] Never reviewed → `severity_counts` and `finding_previews` are null; a review with 0 findings → all-zero counts and `[]` — `server/src/modules/pulls/routes.ts:194`, `server/src/modules/pulls/routes.ts:195` · test: `server/test/reviews.it.test.ts:215`, `server/test/pulls-status.test.ts:72` ("is all-zero for no findings")
- [x] `finding_previews` = `toFindingPreviews`: worst-first by severity rank (CRITICAL → WARNING → SUGGESTION, unknown last), then confidence descending; the input is not mutated — `server/src/modules/pulls/status.ts:37` (`byWorstFirst`), `server/src/modules/pulls/status.ts:66` (`[...rows]`) · test: `server/test/pulls-status.test.ts:107` ("orders worst-first (CRITICAL → WARNING → SUGGESTION), not alphabetically"), `server/test/pulls-status.test.ts:125` ("does not mutate the input array order")
- [x] Capped at `FINDING_PREVIEW_LIMIT` = 20; the counts stay exact — `server/src/modules/pulls/status.ts:46` (`FINDING_PREVIEW_LIMIT`), `server/src/modules/pulls/status.ts:68` · test: `server/test/pulls-status.test.ts:116` ("caps the list and truncates long rationales")
- [x] A rationale longer than `FINDING_PREVIEW_RATIONALE_MAX` = 240 chars → its first 240 chars, trailing whitespace trimmed, + `…` — `server/src/modules/pulls/status.ts:49`, `server/src/modules/pulls/status.ts:80` · test: `server/test/pulls-status.test.ts:116`
- [x] Preview fields are exactly id, severity, category, title, file, start_line, end_line, confidence, rationale — no `suggestion`, no accept/dismiss state — `server/src/modules/pulls/status.ts:69`, `server/src/vendor/shared/contracts/platform.ts:172` (`PrFindingPreview = Finding.pick`) · test: `server/test/pulls-status.test.ts:91` ("maps DB rows to the contract shape (snake_case line fields)"), `server/test/reviews.it.test.ts:215`
- [x] Contract: `PrSeverityCounts` (non-negative ints), `PrFindingPreview`, and `PrMeta.severity_counts` / `finding_previews` as `.nullish()`; the client copy is identical — `server/src/vendor/shared/contracts/platform.ts:159` (`PrSeverityCounts`), `server/src/vendor/shared/contracts/platform.ts:207`, `server/src/vendor/shared/contracts/platform.ts:210`, `client/src/vendor/shared/contracts/platform.ts:207` · test: `server/test/contracts.test.ts:219` ("PrMeta findings rollup is optional (only the list endpoint fills it)")
- [x] `.nullish()` is required: `GET /pulls/:id` builds `PrDetail` without rollups on both paths, and so does `MockGitHubClient.getPullRequest` — `server/src/modules/pulls/routes.ts:258`, `server/src/modules/pulls/routes.ts:263`, `server/src/adapters/mocks.ts:160` (`const base: PrDetail`) · test: `server/test/contracts.test.ts:219`

## Touched packages / modules
- `server/src/modules/pulls/routes.ts` — `GET /repos/:id/pulls` rollups.
- `server/src/modules/pulls/status.ts` — `rollupSeverities`, `toFindingPreviews`, preview limits.
- `server/src/vendor/shared/contracts/platform.ts` + `client/src/vendor/shared/contracts/platform.ts` — `PrSeverityCounts`, `PrFindingPreview`, `PrMeta` fields.
- Other part: [`client/docs/specs/severity-filter.md`](../../../../../../client/docs/specs/severity-filter.md).

## Open questions
- **"Latest review" is one agent's review** — the rollup keeps a single `reviews` row per PR (`server/src/modules/pulls/routes.ts:127`). After a multi-agent run, `severity_counts` and `score` reflect whichever agent finished last, while `cost_usd` sums all agents.
