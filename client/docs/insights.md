# Insights — client

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

- **2026-09-18 · A hover card inside the PR list can't be absolutely positioned** — Tried: rendering the FINDINGS popover as a `position: absolute` child of the row (what the design prototype does, with `overflow: visible` on the list container). Failed because: `s.tableCard` in `app/repos/[repoId]/pulls/styles.ts` sets `overflow: "hidden"` and *relies* on it to clip row backgrounds inside its `borderRadius: 10` — flipping it to `visible` makes the last row's hover background poke out of the rounded corners. Instead: `createPortal` to `document.body` + `position: fixed`, placed from `getBoundingClientRect()` in a `useLayoutEffect` (render hidden for one frame, then position), closing on `scroll`/`resize` since a fixed panel doesn't follow its trigger.
  Where: `src/components/findings-summary/FindingsPopover.tsx`, `src/app/repos/[repoId]/pulls/styles.ts`

- **2026-09-18 · Stripping `_` to plain-text a finding's rationale corrupts it** — Tried: `md.replace(/[`*_>#]/g, "")` to flatten markdown for the popover's 2-line clamp. Failed because: findings are full of `snake_case` identifiers and literals like `sk_live_` — the result read "sklive". Instead: strip emphasis only as PAIRS (`\*\*|__`), plus backticks and line-leading `#`/`>`. A unit test pins this.
  Where: `src/components/findings-summary/helpers.ts#plainText`

## Codebase Patterns

- **2026-09-18 · Portal content still bubbles events into the React parent** — React re-dispatches synthetic events from a portal through the REACT tree, not the DOM tree. A popover portaled to `<body>` from inside a PR row therefore triggers that row's `onClick` (navigate to the PR) unless it calls `stopPropagation` on `onClick` AND `onMouseDown`. The upside of the same rule: the row's `onMouseLeave` does NOT fire while the pointer sits in the portaled panel, which is exactly the hover behaviour you want.
  Where: `src/components/findings-summary/FindingsPopover.tsx`, `src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`

- **2026-09-18 · A filter's selection belongs in derived state, not stored state** — The severity filter in `FindingsPanel` is stored as `sevFilter` but consumed as `activeSev = sevFilter && counts[...] > 0 ? sevFilter : null`. Without that derivation, turning on "hide low confidence" while filtering by a severity that only low-confidence findings had left the list empty with no pill on screen to click — an unrecoverable dead end. Same idea for the j/k cursor: `focus = Math.min(focusIdx, shown.length - 1)` on render instead of a clamping effect.
  Where: `src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx`

## Tool & Library Notes

- **2026-09-18 · `borderColor` is itself a shorthand — React warns when it meets `borderLeftColor`** — `FindingCard` styled its focus ring with `borderColor` + a severity `borderLeftColor` and logged "Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)" on every re-render (j/k navigation, and now severity filtering). The existing all-longhand comment there was not enough: `borderColor` sets all four sides. Fix: set `borderTopColor`/`borderRightColor`/`borderBottomColor` individually.
  Where: `src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/styles.ts`

## Recurring Errors & Fixes

## Session Notes

## Open Questions
