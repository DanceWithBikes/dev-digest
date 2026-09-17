# PR page — `/repos/:repoId/pulls/:number`

Tabs: Overview · Diff · Findings; plus run-review controls, run history, Run Trace drawer.

- `page.tsx` is thin; logic lives in `_components/<Name>/`.
- Hooks: `src/lib/hooks/reviews.ts` (reviews, findings, accept/dismiss), `trace.ts` (SSE / Live Log).
- `FindingsPanel`: filtering + sorting live in the pure `helpers.ts#visibleFindings`; j/k navigate the FILTERED list (keep `focusIdx` in range when the filter changes), a/d = accept/dismiss.
- Severities: `CRITICAL` / `WARNING` / `SUGGESTION` (order in `FindingsPanel/constants.ts`).
- Copy lives in the `prReview` namespace (`messages/en/prReview.json`).
- The diff viewer is shared: `src/components/diff-viewer`.

Docs: ../../../../../../README.md (route map) · ../../../../../../docs/specs/ · ../../../../../../docs/insights.md
