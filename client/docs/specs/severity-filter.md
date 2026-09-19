# Severity filter — client part

> Introduced in: L01. Overview: [`docs/specs/severity-filter.md`](../../../docs/specs/severity-filter.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal
See findings broken down by severity — on the PR list, the run timeline and the findings panel — and filter the panel by severity.
This part: the shared `findings-summary` components and every surface that uses them.

## Acceptance criteria
### Shared (`client/src/components/findings-summary/`)
- [x] Display order worst-first `CRITICAL, WARNING, SUGGESTION` (no INFO) — `client/src/components/findings-summary/constants.ts:4` (`SEVERITIES`) · test: `client/src/components/findings-summary/helpers.test.ts:30` ("keeps worst-first order and drops empty buckets")
- [x] `countBySeverity` tallies the three severities, ignores others, counts dismissed findings too — client mirror of `rollupSeverities` (`server/src/modules/pulls/status.ts:23`) — `client/src/components/findings-summary/helpers.ts:9` · test: `client/src/components/findings-summary/helpers.test.ts:5`, `client/src/components/findings-summary/helpers.test.ts:16` ("counts dismissed findings too — pills must match the cards rendered below")
- [x] `presentSeverities` keeps order, drops empty buckets — `client/src/components/findings-summary/helpers.ts:24` · test: `client/src/components/findings-summary/helpers.test.ts:30`, `client/src/components/findings-summary/helpers.test.ts:42`
- [x] `plainText` flattens links to text, drops backticks, strips `**`/`__` only as pairs (so `snake_case`, `sk_live_` survive), strips leading `#`/`>`, collapses whitespace — `client/src/components/findings-summary/helpers.ts:37` (`plainText`) · test: `client/src/components/findings-summary/helpers.test.ts:61` ("strips markdown so the 2-line clamp measures real text")
- [x] `lineLabel` → `"12"` or `"12-18"` — `client/src/components/findings-summary/helpers.ts:29` · test: `client/src/components/findings-summary/helpers.test.ts:54`
- [x] `SeverityCounts`: read-only icon + count per present severity with an "N Critical" label; renders nothing when all zero — `client/src/components/findings-summary/SeverityCounts.tsx:23`, `client/src/components/findings-summary/SeverityCounts.tsx:30` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:82` (indirect)
- [x] `SeverityPills`: `role="group"`, one button per present severity with `aria-pressed`; title "Show only X findings", or "Show all findings" on the active one — `client/src/components/findings-summary/SeverityPills.tsx:27`, `client/src/components/findings-summary/SeverityPills.tsx:42`, `client/src/components/findings-summary/SeverityPills.tsx:48` · test: `client/src/components/findings-summary/SeverityPills.test.tsx:23`, `client/src/components/findings-summary/SeverityPills.test.tsx:51`

### PR list FINDINGS column
- [x] Cell = `FindingsPopover` over `pr.severity_counts` + `pr.finding_previews` — `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:59` · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:51` ("shows per-severity counts and reveals read-only previews on hover")
- [x] Never reviewed (null counts) → `"—"`; reviewed with zero findings → `"0"`, no popover — `client/src/components/findings-summary/FindingsPopover.tsx:110`, `client/src/components/findings-summary/FindingsPopover.tsx:113` · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:39` ("reads — when the PR was never reviewed"), `client/src/components/findings-summary/FindingsPopover.test.tsx:44` ("reads 0 for a reviewed PR with no findings, and opens no card")
- [x] Hover opens after `OPEN_DELAY_MS` 120, leaving closes after `CLOSE_DELAY_MS` 150; entering the panel cancels the close — `client/src/components/findings-summary/FindingsPopover.tsx:65`, `client/src/components/findings-summary/FindingsPopover.tsx:70`, `client/src/components/findings-summary/constants.ts:29` · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:51` (delays forced to 0; defaults untested)
- [x] Keyboard: the trigger is focusable, focus opens at once, Escape closes — `client/src/components/findings-summary/FindingsPopover.tsx:127`, `client/src/components/findings-summary/FindingsPopover.tsx:133` · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:81` ("opens on keyboard focus and closes on Escape")
- [x] Title "N findings in this run" sums all severities, not just the previews shown — `client/src/components/findings-summary/FindingsPopover.tsx:121` · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:68` ("counts every severity in the title, not just the previews shown")
- [x] Previews are read-only (severity, title, category, `file:line`, confidence, plain-text rationale; no buttons) — `client/src/components/findings-summary/FindingsPopover.tsx:166` · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:51`
- [x] The panel is portaled to `document.body`, `position: fixed` below the trigger (flipped above if it doesn't fit), hidden until measured; any scroll or resize closes it — `client/src/components/findings-summary/FindingsPopover.tsx:148` (`createPortal`), `client/src/components/findings-summary/FindingsPopover.tsx:79`, `client/src/components/findings-summary/FindingsPopover.tsx:102`, `client/src/components/findings-summary/styles.ts:51` · untested
- [x] The panel stops `click` + `mousedown` propagation so the row doesn't open the PR (the counts trigger itself does not — clicking it opens the PR) — `client/src/components/findings-summary/FindingsPopover.tsx:159` · test: `client/src/components/findings-summary/FindingsPopover.test.tsx:74` ("does not navigate when the card itself is clicked")

### Timeline tiles
- [x] `severityByRunId` = `countBySeverity(review.findings)` per loaded review, keyed by `run_id` — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:93` · untested
- [x] A `done` run whose review is loaded and has ≥ 1 finding shows `SeverityCounts`; otherwise the flat "{count} finding(s)" — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:208`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.tsx:213` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:82`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx:94`

### Findings panel filter
- [x] Pipeline `base = visibleFindings(findings, hideLow)` → `counts = countBySeverity(base)` → `activeSev` → `shown`; pills count `base`, so a pill's number equals the cards under it (rejected cards included) — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:35`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:36`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:41` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx:70` ("counts each severity, and the count equals the cards rendered below"), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx:80` ("shows no pill for a severity the run didn't produce")
- [x] Single-select: clicking the active pill clears, another pill replaces — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:48` (`toggleSeverity`) · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx:85` ("filters to one severity, and the same click again restores the full list"), `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx:101` ("switching pills replaces the filter rather than stacking it")
- [x] The filter is derived, not stored: it lets go when its severity leaves `base` (e.g. "hide low confidence" removed the last one) — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:40` (`activeSev`) · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx:109` ("clears a filter whose severity disappears, instead of stranding an empty list")
- [x] Picking a pill resets the j/k cursor to the first card; the cursor is clamped to `shown` on render — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:50`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:46` (`focus`) · untested
- [x] Empty `shown` → "No findings match" EmptyState — `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:79` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.test.tsx:63` ("shows the empty state when nothing matches")

### Run Trace drawer
- [x] Findings = the review whose `run_id` equals `?trace` — `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:185` · untested
- [x] No persisted trace → "No trace available yet." **and** the run's findings (`FindingsSection`) — `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx:104` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx:102`

### Copy
- [x] Button "Dismiss" → "Reject" (`finding.dismiss`), tag "dismissed" → "rejected" (`finding.dismissed`); the API action is still `dismiss` — `client/messages/en/prReview.json:19`, `client/messages/en/prReview.json:16`, `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.tsx:108` · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/FindingCard.test.tsx:52`
- [x] New keys `prReview.severity.*`, `prReview.findingsSummary.*`, `prReview.list.columns.findings` — `client/messages/en/prReview.json:2`, `client/messages/en/prReview.json:7`, `client/messages/en/prReview.json:106` · test: `client/src/components/findings-summary/SeverityPills.test.tsx:51`

## Touched packages / modules
- `client/src/components/findings-summary/` — `SeverityCounts`, `SeverityPills`, `FindingsPopover`, helpers, constants, styles (new).
- PR list: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`, `client/src/app/repos/[repoId]/pulls/{constants,styles}.ts`.
- PR page (`client/src/app/repos/[repoId]/pulls/[number]/_components/`): `FindingsPanel`, `FindingsTab`, `RunHistory`, `RunTraceDrawer` (+ `FindingsSection`), `FindingCard` (styles).
- `client/messages/en/prReview.json`; `client/src/vendor/shared/contracts/platform.ts`.
- Other part: [`server/src/modules/pulls/docs/specs/severity-filter.md`](../../../server/src/modules/pulls/docs/specs/severity-filter.md).

## Open questions
- **Shortcuts act in every open run** — each mounted `FindingsPanel` adds its own window `keydown` (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:64`); a panel mounts per open accordion and several can be open (`client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:140`), so one `a`/`d` accepts/rejects the focused card in each.
- **`a`/`d` ignore modifiers and the `g` chord** — the handler checks only the target tag (`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:56`), so Ctrl/Cmd+A, Ctrl/Cmd+D and `g a` ("Go to Agents", `client/src/vendor/ui/nav.ts:26`) also act on the focused finding.
- **Shortcut help still says "Dismiss finding"** — `client/src/vendor/ui/nav.ts:58` vs the "Reject" button (`client/messages/en/prReview.json:19`).
