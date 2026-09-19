# Insights — client

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

- **2026-09-18 · A hover card inside the PR list can't be absolutely positioned** — Tried: rendering the FINDINGS popover as a `position: absolute` child of the row (what the design prototype does, with `overflow: visible` on the list container). Failed because: `s.tableCard` in `app/repos/[repoId]/pulls/styles.ts` sets `overflow: "hidden"` and *relies* on it to clip row backgrounds inside its `borderRadius: 10` — flipping it to `visible` makes the last row's hover background poke out of the rounded corners. Instead: `createPortal` to `document.body` + `position: fixed`, placed from `getBoundingClientRect()` in a `useLayoutEffect` (render hidden for one frame, then position), closing on `scroll`/`resize` since a fixed panel doesn't follow its trigger.
  Where: `src/components/findings-summary/FindingsPopover.tsx:148` (`createPortal`), `FindingsPopover.tsx:79` (`useLayoutEffect` → `getBoundingClientRect` at `:84`), `FindingsPopover.tsx:102` / `:103` (close on `scroll` / `resize`), `src/app/repos/[repoId]/pulls/styles.ts:91` (`s.tableCard` → `overflow: "hidden"`, `borderRadius: 10` at `:90`)

- **2026-09-18 · Stripping `_` to plain-text a finding's rationale corrupts it** — Tried: `md.replace(/[`*_>#]/g, "")` to flatten markdown for the popover's 2-line clamp. Failed because: findings are full of `snake_case` identifiers and literals like `sk_live_` — the result read "sklive". Instead: strip emphasis only as PAIRS (`\*\*|__`), plus backticks and line-leading `#`/`>`. A unit test pins this.
  Where: `src/components/findings-summary/helpers.ts:43` (pair-only emphasis regex in `plainText`, declared at `:37`), `src/components/findings-summary/helpers.test.ts:61` (the pinning test)

## Codebase Patterns

- **2026-09-18 · Portal content still bubbles events into the React parent** — React re-dispatches synthetic events from a portal through the REACT tree, not the DOM tree. A popover portaled to `<body>` from inside a PR row therefore triggers that row's `onClick` (navigate to the PR) unless it calls `stopPropagation` on `onClick` AND `onMouseDown`. The upside of the same rule: the row's `onMouseLeave` does NOT fire while the pointer sits in the portaled panel, which is exactly the hover behaviour you want.
  Where: `src/components/findings-summary/FindingsPopover.tsx:159` (`onClick` stopPropagation) / `:160` (`onMouseDown`), `src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:26` (row `onClick` → navigate), `PRRow.tsx:25` (row `onMouseLeave`)

- **2026-09-18 · A filter's selection belongs in derived state, not stored state** — The severity filter in `FindingsPanel` is stored as `sevFilter` but consumed as `activeSev = sevFilter && counts[...] > 0 ? sevFilter : null`. Without that derivation, turning on "hide low confidence" while filtering by a severity that only low-confidence findings had left the list empty with no pill on screen to click — an unrecoverable dead end. Same idea for the j/k cursor: `focus = Math.min(focusIdx, shown.length - 1)` on render instead of a clamping effect.
  Where: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:40` (`activeSev`), `FindingsPanel.tsx:30` (`sevFilter`), `FindingsPanel.tsx:46` (`focus`)
  **Correction (2026-09-19):** the real clamp is `Math.min(focusIdx, Math.max(shown.length - 1, 0))` — the inner `Math.max` keeps `focus` at 0 instead of -1 when the filter leaves nothing to show.

## Tool & Library Notes

- **2026-09-18 · `borderColor` is itself a shorthand — React warns when it meets `borderLeftColor`** — `FindingCard` styled its focus ring with `borderColor` + a severity `borderLeftColor` and logged "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" on every re-render (j/k navigation, and now severity filtering). The existing all-longhand comment there was not enough: `borderColor` sets all four sides. Fix: set `borderTopColor`/`borderRightColor`/`borderBottomColor` individually.
  Where: `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts:12` (`borderTopColor`; Right/Bottom at `:13`/`:14`, `borderLeftColor` at `:17`)

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-19 · `client/CLAUDE.md` says "fetch is mocked" — it isn't** — there is no global fetch mock (`src/test/setup.ts` only polyfills `ResizeObserver`); component tests `vi.mock` the hook modules instead (e.g. `FindingsPanel.test.tsx`). A test that renders a component using an un-mocked hook will try the real network. Open: fix the CLAUDE.md line, or add a global fetch stub?
  Where: `CLAUDE.md:8`, `src/test/setup.ts:3`

- **2026-09-19 · The Run Trace drawer never streams live** — the PR page never passes `running`, so the drawer's SSE/live-log branch is unreachable; "Open run trace" on a live run shows the persisted (or missing) trace.
  Where: `src/app/repos/[repoId]/pulls/[number]/page.tsx:182` (no `running` prop), `src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.tsx:46`

- **2026-09-19 · Copy rules are not followed everywhere** — several screens hardcode English despite "copy only via `useTranslations`" (e.g. `src/app/page.tsx:23`, `src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:124`), and 12 of 18 `messages/en/*.json` namespaces are never read yet all ship to the browser. e2e flows 04/05 match some of the hardcoded literals — translate them and those flows break.
  Where: `CLAUDE.md:24` (the rule), `src/i18n/request.ts:19` (all namespaces loaded)
