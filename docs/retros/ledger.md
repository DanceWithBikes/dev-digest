# Workflow retro ledger

One row per `workflow-retro` run, appended by `.claude/skills/workflow-retro/scripts/append-ledger.mjs`.
Compare rows of the same kind of run (same label) to see whether the last action paid off.

- **mode** - `quick` counts the parent only (child spend missing); `deep` reads every subagent log. Only compare deep with deep.
- **tokens** - input + output + cache read + cache write, all agents. **cache** - cache read / all prompt tokens.
- **agents / depth** - subagents spawned / deepest nesting. **peak** - most agents alive at once.
- **par.** - agent-time / time any agent was alive (1.0 = sequential).

| date | session | label | mode | agents / depth | tokens | cache | tool calls | wall | peak | par. | top action |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-10-02 | 42ac7622 | pr-self-review | deep | 10 / 1 | 6.09M | 89.5% | 112 | 8m47s | 8 | 4.3× | inline severity.md into the reviewer prompt prefix (10 reads) |
| 2026-10-02 | 48f4a869 | pr-self-review | deep | 10 / 1 | 2.47M | 82.3% | 100 | 3m41s | 10 | 9.5× | interrupted at 1m41s: 1.80M lost; fan-out in background/batches |
| 2026-10-06 | 97a9bf04 | evals-ci-deploy | deep | 3 / 1 | 25.29M | 97.6% | 185 | 13h43m | 2 | 1.2× | Lint workflows with actionlint pre-push: 3 CI-debug loops cost ~3M cache reads |
| 2026-10-07 | 6b151460 | sdd-pipeline | deep | 18 / 1 | 35.87M | 93.2% | 448 | 5h01m | 9 | 2.3× | Batch the by-skill reviewer fan-out (4-5 at a time): 9 at once hit the 429 session limit, 4.75M lost + re-run |
