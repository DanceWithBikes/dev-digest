# Insights — reviewer-core

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions

- **2026-09-18 · Grounding can't catch a wrong line number inside a brand-new file** — `groundFindings` keeps a finding when its line range intersects a diff hunk. In a newly added file the whole file IS one hunk, so any line from 1 to EOF passes. Observed: a `deepseek-v4-flash` run on a 67-line new file cited `start_line = 1` for all three findings — one naming a function that doesn't exist (`isOverQuota`) — and still scored `3/3 passed`. Open: should the gate also check that the cited range overlaps a line containing an identifier from the finding's title/rationale, or at least reject line 1 when line 1 is a comment? Checked: nothing in `grounding.ts` looks at content, only ranges. Owner: whoever next touches the citation gate.
  Where: `src/grounding.ts:52` (`groundFindings`), `src/grounding.ts:73` (the only check — `rangeIntersects`, declared at `:41`, compares line numbers, never content)

- **2026-09-19 · `sliceDiff` matches file sections by substring** — `line.includes(\`b/${path}\`)` also captures a longer path with that prefix, so slicing `src/a.ts` pulls in the `src/a.tsx` section and another file's hunks leak into a map-reduce chunk. Untested — no test runs map-reduce at all (the server test titled "map-reduce" uses a one-file diff, which `selectMode` always sends single-pass).
  Where: `src/review/reduce.ts:64` (`includes`), `src/review/run.ts:117` (`selectMode`), `server/test/reviews.it.test.ts:160`

- **2026-09-19 · The Live Log's "Reduced to … score=" is not the persisted score** — the reduce event prints the merged model/mean score, but the returned score is recomputed from the grounded findings, so the log and the saved score can disagree.
  Where: `src/review/run.ts:193` (event), `src/review/run.ts:208` (`scoreFromFindings(ground.kept)`)

- **2026-09-19 · README drift** — the README names a "`run` entrypoint and `reduce`" and a `toReview()` helper; the real exports are `reviewPullRequest`, `reduceReviews`, `toReviewPayload`. Tests also import server source by relative path (`../../server/src/adapters/mocks.js`), against the "cross-package imports only via tsconfig `paths`" rule.
  Where: `README.md:41`, `src/index.ts:39` (`reviewPullRequest`), `test/run.test.ts:3`
