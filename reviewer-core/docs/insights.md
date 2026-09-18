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
  Where: `src/grounding.ts#groundFindings`
