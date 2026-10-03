---
name: workflow-retro
description: "Retrospective of a multi-agent Claude Code run: measures tokens, cache read/write, tool calls, duration and parallelism per agent - nested subagents included - from the session logs on disk, turns them into concrete actions (remove duplicated context, preload a shared file, split an overloaded role, reduce concurrency) and appends a one-line summary to docs/retros/ledger.md to track the trend between runs. Use it after a workflow, a pr-self-review fan-out, an SDD pipeline run or any session that spawned subagents, and whenever the user asks for a retro, a cost breakdown, 'how much did that run cost', 'why so many tokens', 'which agent was the most expensive', 'was the parallelism worth it' or wants to compare runs - even if they do not name this skill. Not a code review and not a review of the agents' output quality."
metadata:
  version: "1.0.0"
---

# Workflow retro

Measure a finished run, name what to change, and record it in the ledger.

**Why `--deep` exists:** in the parent transcript, an `Agent` tool result reports `totalTokens`. That number is the child's **last-turn context**, not what the child spent. Background children report it only in a later `<task-notification>`, and grandchildren (depth ≥ 2) never show up in the parent at all. On a real 10-reviewer pr-self-review run, the parent saw 0.6M of the 2.9M tokens its children spent. Deep mode reads every `subagents/agent-*.jsonl` log.

## Steps

Scripts live in `.claude/skills/workflow-retro/scripts/`. Run them from the repo root.

1. **Pick the session.** The default `latest` is the newest transcript of this project, other than the session running the retro. If the user named a run ("the review an hour ago"), list the candidates with `ls -t ~/.claude/projects/<slug>/*.jsonl | head` and pick one by id. For a session started in a git worktree, pass `--cwd <worktree path>`.

2. **Measure.** Deep is the default for a retro; quick (no `--deep`) is only for a fast look at the parent:
   ```sh
   node .claude/skills/workflow-retro/scripts/retro.mjs <sessionId|latest> --deep --label "<kind of run>" > /tmp/retro.json
   node .claude/skills/workflow-retro/scripts/retro.mjs <same> --deep --md          # readable table + signals
   ```
   Choose a `--label` that is stable across runs of the same kind (`pr-self-review`, `sdd-pipeline`, `skill-eval`) so the ledger rows can be compared.

3. **Turn signals into actions.** Read `references/heuristics.md` and `/tmp/retro.json` (`signals`, `agents`, `parallelism`, `totals`). Write 1–5 actions, highest saving first. Each action has:
   - **what** to change and **where**: the agent definition, skill, or script that spawned the agents;
   - **evidence**: agent id/description, file path, numbers from the JSON;
   - **expected saving**, estimated from those numbers.

   Don't invent actions to fill the list. A legitimately bigger agent is not an outlier, and "no action" is a valid result.

4. **Append to the ledger.** Pass the single top action as one short line:
   ```sh
   node .claude/skills/workflow-retro/scripts/append-ledger.mjs /tmp/retro.json --action "<top action, ≤ 80 chars>"
   ```
   The script creates `docs/retros/ledger.md` with a header if it's missing, and refuses to add the same session + mode + label twice (`--force` overrides). It never rewrites existing rows. Before writing the conclusion, read the previous rows with the same label and say whether the trend improved.

5. **Report in chat, briefly:** totals line, top agents by `subtreeTokens` (≤ 5 rows), the actions, the trend versus the previous row with the same label, and the ledger row that was appended.

## Gotchas

- Only compare **deep with deep**. A quick row is missing the child spend.
- Cost is in tokens. The logs carry no prices; add USD only if the user asks, using the current pricing for the model in `agents[].model`.
- A session that is still running gives partial numbers. Say so if its last record is recent.
- `filesRead` covers `Read` plus plain `cat|head|tail|sed -n` in Bash. Reads hidden inside scripts or pipelines are missed.
- Tests: `node --test .claude/skills/workflow-retro/scripts/retro.test.mjs`.
