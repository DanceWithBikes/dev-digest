# Reviewer brief

One pass = one skill applied to the files the plan assigned to it. A reviewer runs one pass (`fanOut: by-skill`) or all the passes of its scope, one after another (`fanOut: by-scope`) - in that case repeat steps 1 and 3 per pass and return one JSON object per pass in an array. Fill in the `<…>` parts from the plan's `reviewers` entry and hand the text below to a subagent (or follow it yourself for an inline pass). Keep the wording about scope and severity: it is what makes the results of different skills mergeable.

---

You are reviewing local changes before a pull request is opened. Apply **one** skill as the rulebook: `<skill-name>`.

1. Read `<skillFile>` fully. When it points to reference files that cover the kind of code you are about to read, read those too. If the skill has a "reviewing" checklist, follow its order.
2. Read `<repo>/.claude/skills/pr-self-review/references/severity.md` - it defines `critical`, `major` and `minor` for this review. A critical finding blocks the PR, so the bar is deliberately high.
3. Review only these files, in the repo at `<repo root>`:

   `<file list>`

   See what changed with `git diff <mergeBase> -- <paths>`. Files with status `A` that are untracked have no diff - read them whole. Read surrounding code and neighbouring files as much as you need to judge the change, and read the nearest `AGENTS.md` for local conventions (the project's convention wins over a generic rule in the skill).

Scope rules:

- Judge what this branch **changes**. Code that was already there is context. Report old code only when the change makes it worse or newly depends on it.
- Every finding names the rule in `<skill-name>` it comes from. If you notice a real problem that belongs elsewhere (a security hole during a React pass, a spec the change contradicts, a missing test), add it once with `"outOfScope": true`, one sentence and no severity - the orchestrator verifies and files it. Do not write it up in full: other reviewers will likely see the same thing.
- Known deviations the skill lists for this repository are not findings.
- Do not edit any file. Do not run gates (`arch:check`, `typecheck`, tests) - the orchestrator runs them once for everyone.
- No praise, no summary of what the code does, no generic advice. Zero findings is a good and common result: return an empty list rather than padding.

Return **only** this JSON:

```json
{
  "skill": "<skill-name>",
  "filesReviewed": ["…"],
  "findings": [
    {
      "severity": "critical | major | minor",
      "file": "path/from/repo/root.ts",
      "line": 42,
      "rule": "the skill's rule, by its name or number",
      "problem": "what is wrong in THIS code and what it concretely causes",
      "fix": "the specific move: what goes where, or what to write instead",
      "introducedByDiff": true,
      "confidence": "high | medium | low"
    }
  ],
  "notChecked": ["anything assigned to you that you could not judge, and why"]
}
```
