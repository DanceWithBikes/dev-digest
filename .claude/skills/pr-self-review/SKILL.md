---
name: pr-self-review
description: "Pre-PR quality gate: reviews ALL local changes on the current branch (commits since the base + staged + unstaged + untracked) before a pull request is opened, by matching the diff against the project's own skills - UI skills (frontend-ui-architecture, react-best-practices, next-best-practices, react-testing-library) on client files, backend skills (backend-onion-architecture, fastify-best-practices, drizzle-orm-patterns, postgresql-table-design) on server and reviewer-core files, zod/security/typescript where they apply - plus `pnpm arch:check` and `pnpm typecheck`. Records a PASS or BLOCKED verdict; a single critical finding blocks the PR. Use it EVERY time before opening, creating, publishing or merging a pull request (`gh pr create`, 'open a PR', 'create PR', 'ship this', 'push and make a PR', 'ready for review', 'is this branch ready?'), whenever the PR gate hook denies `gh pr create`, and whenever the user asks for a self-review, a pre-PR check or a review of their local changes against the project skills - even if they do not name this skill. Not for reviewing someone else's already-open GitHub PR by number, and not a bug hunt on a single file (use code-review)."
metadata:
  version: "1.0.0"
  updated: "2026-09-21"
---

# PR Self Review

Review your own branch the way a strict teammate would, *before* anyone else has to: every local change is checked against the skills this project already wrote down, and the PR is opened only if nothing critical is found.

The project's rules live in `.claude/skills/`. They are only worth having if they are applied to real diffs, and the cheapest moment to apply them is before the PR exists. This skill is the routing layer: it does not contain review rules of its own - it decides **which skill reads which file**, keeps the severity bar consistent across skills, and turns the result into a verdict a hook can enforce.

## How the block works

`record-verdict.mjs` writes a verdict into the git dir (never committed), tied to a content fingerprint of the changed files. The PreToolUse hook `.claude/hooks/pr-self-review-gate.mjs` denies `gh pr create` and `gh pr merge` unless that verdict is `PASS` **and** the files have not changed since. Committing or staging reviewed changes keeps the fingerprint; editing a file makes the verdict stale.

So the rule of the game: the only way to open the PR is to get to an honest PASS. Do not write the verdict file by hand, do not route around the hook (another tool, the API, asking the user to paste the command) and do not downgrade a finding to get green - a gate that bends is worse than none, because people keep trusting it. If a finding is wrong, drop it in verification with a reason; if the user disagrees with a correct one, that is their call to make (see *Dismissals*).

## Workflow

### 1. Build the review plan

```sh
node .claude/skills/pr-self-review/scripts/collect-changes.mjs            # JSON plan
node .claude/skills/pr-self-review/scripts/collect-changes.mjs --summary  # quick look
```

Run the scripts from the checkout under review; from a git worktree that does not contain this skill, call them by absolute path - they review the current directory's repository either way. Pass `--base <ref>` when the PR does not target the default branch (the script remembers it, so `record-verdict.mjs` reviews against the same base). The plan contains:

| Field | Meaning |
|---|---|
| `bySkill` | skill → files it must review (+ `skillFile`, the SKILL.md to load). This is the diff-to-skill mapping; trust it rather than re-deriving it. |
| `reviewers`, `fanOut` | how to split the work: `by-scope` (small diff: one reviewer each for frontend / backend / full-stack, running every pass of that scope) or `by-skill` (large diff: one reviewer per skill) |
| `workingTree` | `commitsAhead`, `uncommitted`, `untracked` - what a PR opened right now would *not* contain |
| `gates` | machine checks to run (`arch:check`, `typecheck`) for the touched packages; `setup` lists installs a gate needs first |
| `invariants` | repo rules the script already saw broken (secret file, hand-edited migration, one-sided `@devdigest/shared` change, `CLAUDE.md` not a symlink) with a suggested severity |
| `unmappedSkills` | skills in `.claude/skills/` that the routing table does not know yet |
| `unroutedFiles`, `docsFiles`, `generatedFiles` | changed files no skill claimed (configs, scripts), prose, and lockfiles/binaries - yours to look at in step 3 |
| `previousReview` | last verdict, `changedSince`, `openCriticals` - for re-runs |
| `files` | every changed file with status, area and the skills assigned to it |
| `diffCommand` | how to get the diff for a set of paths; untracked files have no diff - read them whole |

Routing lives in [skill-routing.json](skill-routing.json). If `unmappedSkills` is not empty, read that skill's description, decide whether it is a review lens, and add it to `skills` or `notForReview` in the routing file before continuing - otherwise new skills silently never run. If the plan is empty, say so, record a PASS and stop.

### 2. Run the gates

Run every gate in `gates` from its `cwd`. They are independent of each other and of the reviews: start them as one background shell command (each gate writing its output and exit code to a temp file) in the same message that launches the reviewers, and read the results when the reviewers are back. A failing gate is a blocking result by definition: it is the machine-checked half of the architecture skills and CI runs the same command. `arch:check` on the server ignores the recorded baseline, so a failure is always a *new* violation.

A gate that fails for a reason unrelated to the diff is not a finding. When a gate lists `setup` commands, run them first (they only install dependencies: `client`/`server` use pnpm, `reviewer-core`/`e2e` use npm - and `server typecheck` needs `reviewer-core/node_modules`, because the server imports that package's source). If the output is all "Cannot find module", that is a missing install, not a type error. If a gate still cannot run (`available: false`, no network), report it as `not-run` with the reason. That does not block, but it goes at the top of the report: the user should know a check was skipped.

### 3. Review with each matched skill

Every pass in `bySkill` applies **that skill to those files only**. `reviewers` says how to staff the passes: for a small diff one reviewer per scope runs all the passes of that scope, one skill after another (loading six agents to read 25 lines costs more than the review is worth); for a large diff it is one reviewer per skill. Use subagents when the Agent tool is available - launch them all in a single message and **run them in the foreground** (`run_in_background: false`), so you hold their results before you move on. Without the Agent tool, or for a diff of a file or two, do the passes yourself, loading each skill before its pass. Give each reviewer the brief in [references/reviewer-brief.md](references/reviewer-brief.md) - it fixes the scope, the severity bar and the output format so results can be merged.

Do not record anything until every pass has reported. If a reviewer fails or does not come back, do that pass yourself rather than leaving it out: the script records an unfinished review as `INCOMPLETE`, which blocks the PR exactly like a finding would, and tells the user nothing about their code.

Two things make or break this step:

- **The skill is the rulebook.** A reviewer reads the skill's SKILL.md (and the reference files it points to for the code at hand) before reading the diff, and every finding names the rule it comes from. A finding no skill rule backs does not belong in a skill pass.
- **The diff is the scope.** Review what this branch changes. Code that was already there is context, not a finding - unless the change makes it worse or depends on it. The architecture skills list known deviations; those are not findings either.

Then do the pass no skill owns - yours, recorded with `"skill": "repo-rules"`:

- **`invariants`**: confirm or reject each one (the script only sees file names).
- **`unroutedFiles`, `docsFiles`, `generatedFiles`**: read the first two; glance at the third for files that should not be there at all (a stray lockfile, a build artefact).
- **What the diff should have touched but did not.** Reviewers only see changed files, so they cannot notice an absence: the test next to a changed source file that does not cover the new behaviour, the module's `docs/specs/*.md` or a doc comment that now contradicts the code, the route list in the module's `AGENTS.md` after a new endpoint, the second copy of `@devdigest/shared`.
- **`outOfScope` findings from reviewers.** A reviewer flags what it notices outside its skill. Verify each; record it under the skill that owns the rule, or under `repo-rules` when the rule lives in an `AGENTS.md`.
- **`workingTree`.** A tracked file that imports an untracked one (or a CI step that needs an untracked config) breaks the build for everyone else if only half of it is committed. Say which files must go in together.

On a re-run (`previousReview` present): review only `changedSince` with their matched skills, re-check each of `openCriticals` against the current code, and carry over the still-valid non-critical findings. Re-run all gates regardless - they are cheap and a fix can break another package.

### 4. Verify what would block

Before anything is called critical, check it yourself against the actual code: open the file at the line, confirm the rule really says this, confirm the change introduced it, and confirm the consequence is real. Apply the bar in [references/severity.md](references/severity.md). Reviewers over-report; a false critical costs the user a blocked PR and costs this gate its credibility, so drop or downgrade anything you cannot stand behind, and merge duplicates that different skills reported for the same line: the finding belongs to the skill whose rule names the *consequence* (an unscoped query is `security`'s even though the architecture skill also forbids SQL in a route; the misplaced import stays with the architecture skill), and the other skill is mentioned in passing.

### 5. Record the verdict

Pipe the merged result to the script - it validates the shape, re-derives the plan to make sure every matched skill and gate was covered, and writes the verdict:

```sh
node .claude/skills/pr-self-review/scripts/record-verdict.mjs - <<'JSON'
{
  "skillsRun": ["frontend-ui-architecture", "react-best-practices"],
  "gates": [
    { "name": "client arch:check", "status": "pass" },
    { "name": "client typecheck", "status": "fail", "detail": "FindingsTab.tsx(41,9): TS2322 ..." }
  ],
  "findings": [
    {
      "id": "F1",
      "severity": "critical",
      "skill": "backend-onion-architecture",
      "file": "server/src/modules/pulls/routes.ts",
      "line": 88,
      "gate": "server arch:check",
      "rule": "Rule 2: routes call services and nothing else",
      "problem": "New handler builds a Drizzle query inline; the workspaceId scope is missing, so any workspace can read these rows.",
      "fix": "Move the query to repository.ts (scoped by workspaceId) and call it through PullsService."
    }
  ]
}
JSON
```

`severity` is `critical`, `major` or `minor`. `skill` is the skill that owns the rule, or `repo-rules`. `gate` is optional: name the failed gate a critical finding explains, so one problem is not counted twice. Gate `status` is `pass`, `fail` or `not-run` (`detail` required unless `pass`). To avoid shell-quoting trouble with long findings, write the JSON to a file outside the repo (a file inside it would change the fingerprint) and pass the path instead of `-`.

The script answers `PASS` (exit 0), `BLOCKED` (a critical finding or a failed gate) or `INCOMPLETE` (a matched skill or gate is missing from `skillsRun` / `gates` - finish the review, do not report this as a verdict on the code). `--check` shows the current state without writing anything.

### 6. Report

Answer in the user's language, in this shape:

```markdown
## PR self-review: BLOCKED | PASS

<branch> → <base> · <n> files (<k> uncommitted, <m> untracked) · skills run: <list> · gates: <pass/fail/not-run summary>

### Blocking            ← omit when empty
1. **[critical] <rule>** - `path:line` (<skill>) - gate failed: <name>   ← when this finding is why a gate fails
   <what is wrong and what it causes> → **Fix:** <the concrete move>
2. **[gate failed] <name>** - <first relevant lines of output>          ← only for a failure no finding explains

### Should fix          ← major
### Nits                ← minor, one line each
### Not checked         ← gates not run, files no skill covers, anything you could not verify
### Next step           ← what happens now: the fixes you offer, or the exact commit / push / PR commands
```

Then act on the verdict:

- **BLOCKED** - do not open the PR. If `workingTree.commitsAhead` is 0, say so in the header: there is nothing to open a PR from yet, whatever the verdict. Offer to fix the blocking items; after the fixes, run the skill again (the re-run is incremental) until it records PASS.
- **PASS** - if the user asked for a PR, continue with it now. The review covered the working tree, but a PR only contains commits: when `workingTree` shows uncommitted or untracked files, commit them first (committing reviewed content keeps the verdict valid; editing it does not), push, then `gh pr create` - the hook will let it through. List unfixed major findings in the PR description as known follow-ups. If the review was invoked manually, stop after the report.

## Dismissals

The user owns the merge decision; the reviewer does not. When the user explicitly says a specific critical finding should not block (a deliberate trade-off, a false positive you could not see), record it on that finding and re-run `record-verdict.mjs`:

```json
"dismissed": { "by": "user", "reason": "<their reason, in their words>" }
```

Never add this on your own initiative or because the user said something general like "just ship it" - ask which finding and why. Dismissed findings stay in the report under their own heading, so the trade-off is visible in the PR description.

## Limits worth stating to the user

- The hook stops the agent. It cannot stop a human typing `gh pr create` in their own terminal or clicking Merge on GitHub; a hard guarantee needs a required status check in branch protection.
- The review is only as good as the skills. A problem no skill describes is out of scope here - `/code-review` hunts for bugs, this gate checks the project's written rules.
