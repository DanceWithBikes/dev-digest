# Insights — server/modules/reviews

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

- **2026-09-18 · Check a run's actual inputs before re-running** — The trace's `prompt_assembly` records exactly what the model saw: `system` (which agent prompt version), `user` (the diff), and `pr_description`. Three substring checks settle "did my change reach the model?" in seconds, e.g. `'duplicated magic constant' in system`, `'<new identifier>' in user`, `pr_description[:160]`. It caught that a run used the new prompt and the new file but a stale PR body.
  Where: `GET /runs/:id/trace` → `prompt_assembly.{system,user,pr_description}`

- **2026-09-18 · `agent_runs.grounding` tells "model found nothing" apart from "we dropped it"** — When a review lands with 0 findings, read the run's `grounding` string before blaming the pipeline: `0/0 passed` = the model returned an empty `findings` array (nothing to ground), `0/1 passed` = it proposed one finding and the citation gate dropped it for not intersecting a real diff hunk. Same query gives the prompt size: `SELECT grounding, findings_count, tokens_in||'->'||tokens_out FROM agent_runs WHERE status='done' ORDER BY ran_at DESC`.
  Where: `run-executor.ts`, `agent_runs.grounding`, `reviewer-core/src/grounding.ts`

## What Doesn't Work

- **2026-09-18 · Labelling code "demo / fixture / never imported" suppresses every lower-severity finding** — Tried: a reviewer fixture whose file header, PR title and PR body all said "intentionally flawed, never imported, do not ship", planted with 2 CRITICAL + 2 WARNING + 2 SUGGESTION issues. Failed because: the model (Sonnet 5, even after the SUGGESTION prompt fix below) reported only the real security defects. Its summary spelled out why — `INJECTION_GUARD` and the task line say such claims can't waive REAL defects, so it reported those, and treated maintainability issues in a declared-dead file as irrelevant ("dead code" means nothing when the whole module is announced as never imported). Instead: make fixtures read like ordinary production code — neutral header, neutral PR title/body — and make each low-severity issue provable from the diff alone. Also: an **exported** function is never "dead code" to the reviewer (it's public API that may be used elsewhere); plant a **non-exported** helper that nothing in the file calls. **The PR description alone is enough to suppress them:** a follow-up run had the fixed prompt AND a neutral file header, yet the stale PR body ("A deliberately flawed, never-imported module…") still yielded 2 CRITICAL + 1 WARNING + 0 SUGGESTION, and the model's summary cited the description by name. Fix the description BEFORE merging — once a PR is merged its text is frozen for this purpose, and a fresh PR is the only way to re-run cleanly.
  Where: `demo/findings-code-example.ts`, `reviewer-core/src/prompt.ts#INJECTION_GUARD`, `helpers.ts#taskLine`

- **2026-09-18 · "Every run returns exactly 3 findings" was not a cap** — Tried: explaining zero SUGGESTIONs by a findings limit, since three runs on two models each returned exactly 3. Failed because: nothing caps, thresholds or rewrites findings anywhere (`grounding.ts`, `reduce.ts`, `to-review.ts`, `run.ts:208`); the raw output simply contained 3. The count was a coincidence of the fixture. Instead: read the run trace's `raw_output` before theorising about the pipeline — it shows exactly what the model emitted, pre-grounding.
  Where: `GET /runs/:id/trace` → `raw_output`

- **2026-09-18 · `deepseek/deepseek-v4-flash` yields no grounded findings — don't demo findings features on it** — Tried: showing the severity-counter feature with the built-in agents (all three seed agents use this model via OpenRouter). Failed because: 7/7 runs across both seeded and real PRs produced `findings_count = 0` — mostly `0/0 passed`, and on the 4465-line PR the model answered with 165 output tokens against a 25K-token prompt (it effectively gave up). Instead: for any demo/verification that needs real findings, point one agent at a stronger model (e.g. `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-5` — both on OpenRouter) and run it on the SEEDED PR #482, whose diff carries a planted `stripeKey: "sk_live_xxx"` on a real diff line, so the finding can cite it and survive grounding. Cost is ~$0.01 per run at that prompt size.
  Where: `db/seed.ts` (agents + PR #482 patch), `agents.model`

## Codebase Patterns

- **2026-09-18 · The General Reviewer prompt made SUGGESTION unreachable (fixed)** — It defined SUGGESTION as "a minor improvement or nit" and then forbade nits twice ("No style nits" in Quality bar; "not a license to report style nits" under Clarity), so the model never emitted the level at all — yet `scoreFromFindings` penalises SUGGESTION (−3), `Review.score`'s description names "minor suggestions", and the UI renders a SUGGESTION pill. Fix: SUGGESTION now lists concrete in-bounds cases (duplicated magic constant, dead/unreachable code, misleading name or doc on correct code, redundant check) and the ban is narrowed to *formatting/naming-preference* nits. The prompt lives in THREE places that must stay identical — `server/src/db/seed-prompts.ts#GENERAL_REVIEWER_PROMPT`, `docs/agent-prompts/general-reviewer.md` (same text + a trailing newline), and the live `agents.system_prompt` row. `seed.ts` only inserts missing agents, so editing the seed never reaches an existing DB — update the running agent with `PUT /agents/:id` (bumps its version). Security/Performance prompts already had concrete, non-contradictory SUGGESTION definitions.
  Where: `server/src/db/seed-prompts.ts`, `docs/agent-prompts/general-reviewer.md`, `agents` table

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
