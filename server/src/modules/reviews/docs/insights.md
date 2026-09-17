# Insights — server/modules/reviews

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

- **2026-09-18 · `agent_runs.grounding` tells "model found nothing" apart from "we dropped it"** — When a review lands with 0 findings, read the run's `grounding` string before blaming the pipeline: `0/0 passed` = the model returned an empty `findings` array (nothing to ground), `0/1 passed` = it proposed one finding and the citation gate dropped it for not intersecting a real diff hunk. Same query gives the prompt size: `SELECT grounding, findings_count, tokens_in||'->'||tokens_out FROM agent_runs WHERE status='done' ORDER BY ran_at DESC`.
  Where: `run-executor.ts`, `agent_runs.grounding`, `reviewer-core/src/grounding.ts`

## What Doesn't Work

- **2026-09-18 · `deepseek/deepseek-v4-flash` yields no grounded findings — don't demo findings features on it** — Tried: showing the severity-counter feature with the built-in agents (all three seed agents use this model via OpenRouter). Failed because: 7/7 runs across both seeded and real PRs produced `findings_count = 0` — mostly `0/0 passed`, and on the 4465-line PR the model answered with 165 output tokens against a 25K-token prompt (it effectively gave up). Instead: for any demo/verification that needs real findings, point one agent at a stronger model (e.g. `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-5` — both on OpenRouter) and run it on the SEEDED PR #482, whose diff carries a planted `stripeKey: "sk_live_xxx"` on a real diff line, so the finding can cite it and survive grounding. Cost is ~$0.01 per run at that prompt size.
  Where: `db/seed.ts` (agents + PR #482 patch), `agents.model`

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
