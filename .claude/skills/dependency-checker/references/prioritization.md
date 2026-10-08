# Prioritization rubric

Score every finding by **impact** (what breaks or costs if ignored) and **effort** (how hard the fix is). Priority follows the table; do not invent other levels.

| Priority | Meaning | Typical findings |
|---|---|---|
| **P0 - fix now** | Breaks a repo rule or builds, or is a trap for the next change | Vendored `@devdigest/shared` copies differ; a package declared but not installed; a runtime import resolved only from a devDependency; a runtime package in `devDependencies` of the server |
| **P1 - this sprint** | Real cost to every install, CI run or deploy, with a clear fix | Verified-unused package ≥ 1 MB with transitive tree; test/build tool in `dependencies`; major-version drift between packages (e.g. `zod` 3.24 vs 3.25 range, `vitest`); two heavy packages doing the same job |
| **P2 - plan it** | Worth doing, no urgency | Minor-version drift; a heavy dependency with a lighter alternative; unpinned range on a package that has broken before; outdated by one major |
| **P3 - nice to have** | Cosmetic or very small | Patch-level drift, sub-100 KB unused types, ordering and pinning style |

## Effort

- **S** - one-line edit in one `package.json` plus a lockfile refresh.
- **M** - several files change or code must be adapted (a replacement library, a major upgrade with a changelog).
- **L** - cross-package or architectural (removing a heavy dependency from a core flow).

## Tie-breakers

1. Higher P first; inside a priority, smaller effort first.
2. A finding that appears in several packages counts once, listed with all affected packages.
3. A heavy package that is clearly the product (e.g. `next`, `mermaid` in the client, the agent SDK in `evals`) is not a finding by itself. Report it under "Where the weight is", and raise a finding only if there is a concrete lever (lazy loading, a lighter import path, moving it to `devDependencies`).
4. Anything touching `server/src/db/migrations/**` or `docker compose down -v` is out of scope for advice.

## Advice patterns

| Situation | Advice |
|---|---|
| Verified unused | `cd <pkg> && pnpm remove <name>` (or `npm uninstall <name>` in reviewer-core / e2e) and run `pnpm typecheck && pnpm test` |
| Wrong type | Move it between `dependencies` and `devDependencies` in that package's `package.json`, then reinstall to refresh the lockfile |
| Version drift | Pick the highest range in use, align each package's `package.json`, reinstall each package separately |
| Heavy, client | Lazy-load with `next/dynamic`, import a subpath instead of the barrel, check it is not pulled into a Server Component bundle (see `next-best-practices`) |
| Heavy, server | Check it is needed at runtime and not only in scripts; move scripts-only tools to `devDependencies` |
| Duplicate purpose | Name both packages, say which one the code mostly uses, estimate the saved MB from the table |
| Vendored drift | Copy the newer files to the other copy (both must stay identical), run typecheck in server and client |
