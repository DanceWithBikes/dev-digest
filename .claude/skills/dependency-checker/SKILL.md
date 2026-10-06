---
name: dependency-checker
description: "Audits every dependency of this repository and its packages (server, client, reviewer-core, e2e, evals): draws the package graph and the heaviest-dependency graph as mermaid, reports how much each dependency weighs on disk (own files and with its transitive tree), its type (prod/dev/peer), version drift between packages, vendored `shared` drift, unused-looking packages and, on request, outdated versions - then ends with a prioritized action list and concrete advice. Use whenever the user asks to check, audit, analyse, visualize or slim down dependencies, 'what is heavy in node_modules', 'which packages are unused/outdated/duplicated', 'dependency graph', 'dependency report', or before adding a large new dependency - even if they do not name this skill. Read-only: it never installs, removes or upgrades anything. Not a security or CVE audit (use security / pnpm audit) and not an import-boundary check (use architecture-reviewer / pnpm arch:check)."
metadata:
  version: "1.0.0"
---

# Dependency checker

Collect facts with a script, then turn them into one structured report: **graph → sizes → findings → priorities → advice**. The script is deterministic; the judgement (priorities, advice) is yours.

Read-only. Never run `pnpm add/remove/update`, never edit a `package.json` or lockfile. Propose commands; the user runs them.

## Scope

Default: every directory at the repo root that has a `package.json` (there is no workspace, each package has its own lockfile). If the user names a package ("check the server"), pass `--package <name>`.

## Steps

Run from the repo root. Scripts need no install.

1. **Collect.** Dependencies must be installed to be measured (a package without `node_modules` reports no sizes; say so in the report instead of guessing).
   ```sh
   node .claude/skills/dependency-checker/scripts/collect-deps.mjs > /tmp/deps.json   # full facts
   node .claude/skills/dependency-checker/scripts/collect-deps.mjs --md               # graph + tables, ready to paste
   ```
   Add `--outdated` only if the user wants version freshness or the answer needs it: it calls `pnpm|npm outdated` per package and needs network. Add `--package <name>` to narrow the scope.

2. **Verify the suspicious bits** before reporting them (the script is a heuristic, see [references/heuristics.md](references/heuristics.md)):
   - every `usedInSource: false` package: grep for dynamic use, config references and CLI use before calling it unused;
   - `vendorDrift.identical: false`: run `diff -rq server/src/vendor/shared client/src/vendor/shared` and list the files (CLAUDE.md requires both copies to be identical);
   - a large package: check that the code really needs it (`grep -rn "from \"<pkg>\"" <package>/src | head`).

3. **Write the report** in exactly the structure below. Use the facts from the JSON; do not invent sizes. Keep the language of the conversation for prose, but every file you write stays in English.

4. **Prioritize** with the rubric in [references/prioritization.md](references/prioritization.md) (P0-P3, impact × effort). Every finding gets a priority, a one-line reason and a concrete next command or edit.

5. **Save only if asked.** Print the report in chat by default. If the user wants a file, write it to `docs/dependency-reports/<YYYY-MM-DD>.md` (create the folder) and do not commit it.

## Report structure

Always these seven sections, in this order, with these headings. If a section has nothing to say, keep the heading and write "Nothing found." - a fixed shape is what lets developers diff two reports.

1. **Summary** - 4-6 lines: number of packages, prod/dev counts per package, total installed size per package, top-3 problems, overall health (🟢 / 🟡 / 🔴).
2. **Dependency graph** - two mermaid diagrams (follow the `mermaid-diagram` skill):
   - *Package graph*: packages as nodes, cross-package edges from tsconfig `paths` (labelled with the alias), vendored `shared` marked.
   - *Heaviest dependencies*: per package, the top 5 by `withTransitiveKb`, label = `name<br/>size`.
   The `--md` output already contains both; reuse and fix labels if needed.
3. **Size breakdown** - per package one table sorted by `withTransitiveKb` desc: `Package | Type | Range → Installed | Own | With transitive | Transitive deps | Used`. Show at most the top 15 rows per package and one line for the rest ("+N more, X MB"). Always state that sizes are disk sizes in `node_modules`, not bundle sizes. A short "Where the weight is" paragraph names the top 3 and what share of the package total they are.
4. **Type & hygiene** - `prod` vs `dev` placement problems (a test/build tool in `dependencies`, a runtime package in `devDependencies`), pinned vs ranged versions, unused-looking packages (verified in step 2), peer-dependency gaps.
5. **Cross-package findings** - version drift between packages (same dependency, different ranges), the same heavy package installed in several packages, vendored `shared` copies that differ (list files).
6. **Freshness** - only with `--outdated`: table of `Package | Current | Wanted | Latest | Gap (major/minor/patch)`. Without the flag write "Not checked (run with --outdated)."
7. **Priorities & recommendations** - the table from the rubric, sorted P0 → P3:
   `# | Priority | Finding | Why it matters | Action (exact command or edit) | Effort (S/M/L)`
   followed by **Quick wins** (≤3 items, effort S) and **Do not touch** (anything that looks removable but is not: dynamically loaded plugins, CLI tools used only by scripts, packages pinned on purpose with a reason in `docs/insights.md`).

## Rules

- **Facts vs opinion.** Sizes, versions and counts come from the script. Priorities and advice are labelled as recommendations.
- **Never claim "unused" without step 2.** Say "no static import found; verified by grep: <result>".
- **Respect repo rules.** Packages do not share a workspace, so the advice for drift is "align the ranges in each package's own `package.json` and lockfile", never "hoist to a root". `@devdigest/shared` changes go in both copies. Never advise editing `server/src/db/migrations/**`.
- **Check `docs/insights.md`** (root and the package's own) for recorded dead ends before recommending a removal or an upgrade, and cite the entry if it applies.
- **Non-obvious finding?** Record it with the `engineering-insights` skill (for example a package that looks unused but is loaded dynamically).
- **No security verdicts.** If the user asks about vulnerabilities, suggest `pnpm audit` / `npm audit` per package and stop there.

