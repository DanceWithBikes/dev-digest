---
name: engineering-insights
description: Record non-obvious engineering knowledge into the nearest module's docs/insights.md during ANY session. Use this skill whenever you hit something a future agent could not learn by reading the code — surprising behavior, a dead end or abandoned approach, an error you had to debug (especially one seen before), a library/tool quirk, an implicit convention or architectural decision, or a question you could not resolve. Also use it at the end of a task to leave a short session note. Do NOT use it for things already stated in AGENTS.md, specs, or obvious from the code.
---

# Engineering Insights

Capture knowledge that is invisible in the code, in the module where it applies, so the next agent reads it **cold** and knows exactly what to do — without re-investigating.

## When to write

Write an entry the moment one of these happens (don't wait for the end of the session — details fade):

| Trigger | Section |
|---|---|
| An approach worked after something else didn't / a non-obvious solution | What Works |
| A dead end, a reverted attempt, an anti-pattern you almost used | **What Doesn't Work** |
| An implicit convention or architectural decision you had to infer | Codebase Patterns |
| A dependency / CLI / framework quirk (version-specific behavior, gotcha) | Tool & Library Notes |
| An error you debugged — especially one that already happened before | Recurring Errors & Fixes |
| Finishing a meaningful task | Session Notes |
| Something you couldn't resolve or verify | Open Questions |

**What Doesn't Work is the most valuable and the most often skipped section.** Every time you abandon an approach, ask yourself whether it deserves an entry.

## The quality bar

An entry must be **actionable cold**: a reader with no context knows what to do.

**Test before writing:** *"Would this be obvious to anyone reading the code?" → if yes, don't write it.*

❌ Bad — noise, not a lesson:
- "Promises can be tricky"
- "Be careful with async"
- "The reviews module is complex"

✅ Good — specific, located, prescriptive:
- "`Promise.all()` in the ingest pipeline times out after ~30 items — in this module use `Promise.allSettled()` with batches of 10." → `Where: \`pipeline/ingest.ts:42\` (\`ingestAll\`)`
- "`costUsd` is returned by `reviewer-core` but never persisted: `agent_runs` has no column. `null` means 'model price unknown', not `$0`." → `Where: \`reviewer-core/src/review/run.ts:184\` (\`costUsd\`), \`server/src/db/schema/runs.ts:8\` (\`agentRuns\`)`
- "Changing a contract in `server/src/vendor/shared` without the `client/` copy compiles fine and breaks only at runtime — always `diff -r` both copies." → `Where: \`server/src/vendor/shared/contracts/platform.ts:185\` (\`PrMeta\`)`

Every entry names **what**, **where** (`file:line` + symbol), and **what to do instead**.

Never write: secrets or API keys, temporary task state, anything already in `AGENTS.md` / `docs/specs/` / git history, guesses presented as facts.

## Where to write

1. Take the file(s) you were working on. Walk up the directory tree and use the **nearest** `docs/insights.md`:
   `server/src/modules/<m>/docs/insights.md` → `server/docs/insights.md` → `docs/insights.md` (root).
2. Insight spans several packages (server + client, shared contracts, tooling) → root `docs/insights.md`.
3. The module has an `AGENTS.md` but no `docs/insights.md` → create it from `references/template.md`.

## How to write

**Append-only.** Never rewrite the file with the Write tool (except creating a new one from the template) and never delete or reword other entries. Add new entries with Edit by anchoring on the section heading. The only allowed changes to existing entries are the ones in step 2.

1. **Read** the target file first.
2. **Dedupe:** if an entry on the same topic exists, update it instead of adding a new one.
   - Recurring Errors: bump the counter (`×2`, `×3`). At `×3`, propose to the user promoting the fix into that module's `AGENTS.md` as a one-line rule (keep the "why" here).
   - Open Questions: once answered, remove it and write the answer into the proper section.
   - A claim turned out wrong: append `**Correction (YYYY-MM-DD):** <what is actually true + evidence>` inside that entry. Keep the original text — the mistake is part of the lesson.
   - A cited line moved (you touched that file): refresh the number in its `Where:`.
3. **Verify** that the paths and symbols you cite actually exist, and take each line number from `grep -n` right before writing.
4. **Insert** at the top of the right section (newest first) with the Edit tool, using the format below.
5. Tell the user in one line: `Insight recorded → <path> (<section>)`.

### Entry format

```md
- **YYYY-MM-DD · <short title>** — <what happens and what to do>.
  Where: `path/to/file.ts:123` (`symbol()`), `path/to/other.ts:45` (`CONSTANT`)
```

`Where:` rules — every entry has one:
- **`file:line` + symbol, always both.** The line is for navigation; the symbol is the anchor that survives edits — when the number drifts, search for the symbol.
- **Point at the exact statement** the entry is about (the `if`, the declaration, the style key, the SQL), not the top of the file.
- **Paths:** relative to the insights file's module/package root (as the file already does); repo-root paths for anything outside it.
- **No code anchor** (CLI behaviour, git history, an external file): say so and give the closest real thing — `Where: no code anchor — \`gh auth status\`; remote \`origin\``.

Section-specific requirements:
- **What Doesn't Work:** `Tried: … → Failed because: … → Instead: …`
- **Recurring Errors & Fixes:** the exact error text in backticks, root cause, fix, counter `(×N)`.
- **Open Questions:** the question, what was already checked, who/what could answer it.
- **Session Notes:** 1–3 lines — goal, outcome, follow-ups. Keep only the ~10 most recent; drop older ones once their lessons live in other sections.

Always use absolute dates (today's date), and write entries in English.
