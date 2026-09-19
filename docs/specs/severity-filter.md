# Severity filter

> Introduced in: L01. Refs are `path:line` (`symbol`) at the time of writing — if a line moved,
> search for the symbol.

## Goal
See findings broken down by severity — on the PR list, the run timeline and the findings panel — and filter the panel by severity.

## Acceptance criteria
User-visible:
- [x] PR list FINDINGS column: per-severity counts of the PR's latest review; hover reveals read-only previews (worst-first); never reviewed → "—" — `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:59` (`FindingsPopover`), `server/src/modules/pulls/routes.ts:194` (`severity_counts`) · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:51` ("shows per-severity counts and reveals read-only previews on hover"), `server/test/reviews.it.test.ts:215` ("PR list rolls up the latest review: severity counts + read-only previews")
- [x] Run timeline: a finished run shows its severity breakdown instead of a flat findings count — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:209` (`SeverityCounts`) · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:82`
- [x] Findings panel: one pill per present severity; clicking filters to it, clicking again clears; a pill's number equals the cards under it — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:71` (`SeverityPills`) · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx:85` ("filters to one severity, and the same click again restores the full list")
- [x] Dismissed findings are counted everywhere, so the list, the timeline and the pills agree — `server/src/modules/pulls/routes.ts:142`, `client/src/components/findings-summary/helpers.ts:9` (`countBySeverity`) · test: `client/src/components/findings-summary/helpers.test.ts:16` ("counts dismissed findings too — pills must match the cards rendered below")
- [x] The Run Trace drawer shows the run's findings even when no trace was persisted — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx:104` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:102`
- [x] Copy: "Dismiss" → "Reject" (the API action is still `dismiss`) — `client/messages/en/prReview.json:19` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx:52`

## Touched packages / modules
| Part | Code | Spec |
|---|---|---|
| List rollups (`severity_counts`, `finding_previews`) | `server/src/modules/pulls/routes.ts`, `server/src/modules/pulls/status.ts` | [`server/src/modules/pulls/docs/specs/severity-filter.md`](../../server/src/modules/pulls/docs/specs/severity-filter.md) |
| Contracts `PrSeverityCounts` / `PrFindingPreview` | `server/src/vendor/shared/contracts/platform.ts` + the `client/` copy | pulls part |
| UI (counts, popover, pills filter, timeline, trace drawer, copy) | `client/src/components/findings-summary/`, PR list + PR page components, `client/messages/en/prReview.json` | [`client/docs/specs/severity-filter.md`](../../client/docs/specs/severity-filter.md) |

## Open questions
- **"Latest review" is one agent's review** — the list keeps a single `reviews` row per PR (`server/src/modules/pulls/routes.ts:127`). After a multi-agent run, `severity_counts` (and `score`) reflect whichever agent finished last, while the COST column sums all agents.
- **Keyboard shortcuts act in every open run at once** — each mounted `FindingsPanel` adds its own window `keydown` (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:64`), and several run accordions can be open.
