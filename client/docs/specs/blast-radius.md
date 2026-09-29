# Blast Radius — client part

> Introduced in: L04. Overview: [`docs/specs/blast-radius.md`](../../docs/specs/blast-radius.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal

Render the PR detail page's Overview tab with a `BlastRadiusCard`: a Tree/Graph toggle over the
server's `downstream` map, a degraded notice with a Resync affordance whenever the map is
incomplete, and a lazily-fetched Prior PRs panel — all through hooks, never a raw `fetch`, with
every string routed through the `blast` i18n namespace.

## Acceptance criteria

### Hooks (`src/lib/hooks/blast.ts`)
- [x] `useBlastRadius(prId)`: `GET /pulls/:id/blast`, `queryKey: ["blast", prId]`, `enabled: !!prId` — `client/src/lib/hooks/blast.ts:17` (`useBlastRadius`) · test: exercised indirectly via the mocked hook, `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/BlastRadiusCard.test.tsx:20`; no dedicated hook test
- [x] `usePriorPrs(prId, enabled)`: `GET /pulls/:id/prior-prs`, `queryKey: ["prior-prs", prId]`, gated by the caller's `enabled` flag (only fetches once the Prior PRs row is opened), `staleTime` 5 minutes — `client/src/lib/hooks/blast.ts:28` (`usePriorPrs`) · test: `client/src/app/repos/[repoId]/pulls/[number]/_components/BlastRadiusCard/_components/PriorPrs/PriorPrs.test.tsx:38` ("stays lazy until opened, then lists the merged PRs that touched these files")
- [x] `useBlastResync(repoId, prId)`: snapshots `lastIndexedSha`/`updatedAt`, fires the resync mutation, polls `useRepoIntelStatus(repoId, true)` until the snapshot changes, invalidates `["blast", prId]`, and reports `timedOut` after `RESYNC_POLL_TIMEOUT_MS` (90s) — `client/src/lib/hooks/blast.ts:50` (`useBlastResync`) · untested directly — the `BlastRadiusCard` test mocks this hook wholesale (`BlastRadiusCard.test.tsx:22`), so only its `start()` call is proven, not the polling/timeout state machine (see project-level Open questions)

### `blast.json` i18n (`messages/en/blast.json`)
- [x] `title`, `loading`, `error`, `reason.{flag_off,index_failed,index_partial,repo_too_large,no_data}`, `degradedBadge`, `resync.{button,running,timeout}`, `legend.{changed,callers,endpoints}`, `priorPrs.{title,empty,error,mergedBy}` and the chip/aria-label keys are all present — `client/messages/en/blast.json:1` · test: `BlastRadiusCard.test.tsx` and the `_components/*` tests all render through `NextIntlClientProvider` with this exact file, so a missing key would fail those tests

### `BlastRadiusCard`
- [x] `Skeleton` while loading, `ErrorState` with a working Retry on error, `noDownstream` message when every changed symbol has zero callers — `BlastRadiusCard.tsx:36`-`:53`, `:89` (`hasDownstream` gate) · test: `BlastRadiusCard.test.tsx:74` ("shows a retriable error state instead of the map"), `:82` ("...the no-callers message when the map is empty")
- [x] The Tree/Graph toggle is a `role="group"` with `aria-pressed` buttons over `VIEWS = ["tree", "graph"]`; switching hides the Tree caller text and shows the graph's `role="img"` — `BlastRadiusCard.tsx:64`-`:76`, `constants.ts:5` (`VIEWS`) · test: `BlastRadiusCard.test.tsx:50` ("renders the stats row over the Tree view by default, and switches to the Graph view on toggle")
- [x] `DegradedNotice` renders ALONGSIDE the map (never instead of it) whenever `radius.degraded` is set, with `canResync` gated to every reason except `flag_off` (`RESYNC_REASONS`) — `BlastRadiusCard.tsx:56` (`canResync`), `:79`-`:87`, `constants.ts:10` (`RESYNC_REASONS`) · test: `BlastRadiusCard.test.tsx:82`
- [x] `blastStats` sums callers across groups and deduplicates endpoint/cron UNIONS (the same endpoint reachable through two changed symbols counts once) — `helpers.ts:16` (`blastStats`) · test: `helpers.test.ts:10` ("sums callers across groups and deduplicates endpoints/crons reachable through more than one group")
- [x] `hasDownstream` is false when every group's caller list is empty, even if groups themselves exist — `helpers.ts:35` (`hasDownstream`) · test: `helpers.test.ts:43`, `:51`

### `BlastTree` / `SymbolNode`
- [x] One collapsible `SymbolNode` per changed symbol in the server's rank order (never re-sorted); the first symbol is open by default — `_components/BlastTree/BlastTree.tsx:17` · test: `_components/BlastTree/BlastTree.test.tsx:30`
- [x] Each caller renders as a monospace `file:line`, linked to `githubBlobUrl(repoFullName, headSha, file, line)` (`target="_blank" rel="noreferrer"`) when both `repoFullName` and `headSha` are known, otherwise plain text — `_components/BlastTree/_components/SymbolNode/SymbolNode.tsx:60`-`:75` (`canLink`) · test: `_components/BlastTree/BlastTree.test.tsx:30` (exact href), `:55` ("renders callers as plain text, not a link, when repoFullName or headSha is missing")
- [x] Endpoint chips (blue, `Globe` icon) and cron chips (amber, `Clock` icon) render as two distinct, separate groups — `_components/SymbolNode/SymbolNode.tsx:82`-`:104` · test: `_components/BlastTree/BlastTree.test.tsx:49` ("renders endpoint and cron chips as distinct, separate groups")

### `BlastGraph`
- [x] Hand-written SVG, no charting dependency: `layoutGraph` lays out three columns (changed symbols → distinct callers, deduped by `file:name` → per-caller endpoints/crons) and cubic-Bézier edges via `edgePath` — `_components/BlastGraph/helpers.ts:42` (`layoutGraph`), `:108` (`edgePath`) · test: `_components/BlastGraph/helpers.test.ts:10` ("dedupes a caller shared by two changed symbols into one node with two edges, and only draws endpoint/cron edges from the specific caller that reaches them"), `:51`, `:61`
- [x] Node labels are truncated to `LABEL_MAX` (22 chars) with the full text in `title`; a legend and an `aria-label`'d `role="img"` container are always rendered when there are edges, `graph.empty` otherwise — `_components/BlastGraph/helpers.ts:4` (`LABEL_MAX`), `BlastGraph.tsx:16`-`:22` · untested directly for the empty/legend branches (no `BlastGraph.test.tsx`; covered only via `BlastRadiusCard.test.tsx:71`'s graph-toggle assertion)

### `PriorPrs`
- [x] A bordered, collapsible row (`role="button"`, `aria-expanded`) fetches lazily via `usePriorPrs(prId, open)`; rows link to `githubPrUrl(repoFullName, pr_number)` and show title/author/merged-date/notes — `_components/PriorPrs/PriorPrs.tsx:12` · test: `_components/PriorPrs/PriorPrs.test.tsx:38`
- [x] An error renders inline (`priorPrs.error`) without a link and without affecting the Tree/Graph above it — `_components/PriorPrs/PriorPrs.tsx:46` · test: `_components/PriorPrs/PriorPrs.test.tsx:68` ("shows an inline error without a link, and an empty state when there's nothing to show")

### Wiring
- [x] `OverviewTab` renders `BlastRadiusCard` after `IntentCard`, inside a full-width grid row (`s.briefFull`, `gridColumn: "1 / -1"`) — `_components/OverviewTab/OverviewTab.tsx:32`, `_components/OverviewTab/styles.ts:11` (`briefFull`) · untested directly (no `OverviewTab.test.tsx`; covered by the e2e flow)
- [x] `page.tsx` passes `repoId` and `repoFullName` (resolved from `useActiveRepo()`) into `OverviewTab` — `page.tsx:148` · untested directly, same as above

## Touched packages / modules

Project overview and the full cross-package table: [`docs/specs/blast-radius.md`](../../docs/specs/blast-radius.md).

## Open questions

- **`useBlastResync`'s polling/timeout state machine has no dedicated hook test** — `client/src/lib/hooks/blast.ts:50`. `BlastRadiusCard.test.tsx` mocks the whole hook, so the `React.useEffect` timeout, the `status` change detection, and the `qc.invalidateQueries` call are unverified by an automated test.
- **`BlastGraph`'s empty state (`graph.empty`) and legend have no dedicated component test** — no `BlastGraph.test.tsx` exists; only `helpers.test.ts` (pure `layoutGraph`/`edgePath`) and the toggle assertion in `BlastRadiusCard.test.tsx:71` touch this component, and neither renders a `downstream` with zero edges.
- **`client/AGENTS.md` says "fetch is mocked" in its `pnpm test` command comment — this is stale**, already recorded in `client/docs/insights.md` (2026-09-19 entry) and re-noted in this feature's own test file (`BlastRadiusCard.test.tsx:18`-`19`): there is no global fetch mock, so every hook consumer under test mocks the hook module itself rather than the network.
