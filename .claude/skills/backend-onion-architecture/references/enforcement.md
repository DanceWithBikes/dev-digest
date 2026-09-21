# Enforcement: the architecture gate

Conventions that are only written down erode; this codebase had the layering documented in `modules/AGENTS.md` and still grew four modules that query the database from route handlers. The dependency rule is therefore checked mechanically.

## Contents
- Commands
- What the gate checks
- Reading a failure
- The baseline
- Adding or changing a rule
- What the gate cannot see
- Why dependency-cruiser

## Commands

```sh
cd server
pnpm arch:check      # new violations only - this is what CI runs
pnpm arch:all        # everything, including recorded debt
pnpm arch:baseline   # re-record .dependency-cruiser-known-violations.json
```

- Config: `server/.dependency-cruiser.cjs` (`.cjs` because the package is ESM).
- CI: the `typecheck` job of `.github/workflows/server-unit.yml`, which already triggers on `server/**` and `reviewer-core/**`.
- The cruise follows the tsconfig `paths` aliases, so `reviewer-core/src` and `src/vendor/shared` are covered from the server run. `reviewer-core`'s dependencies must be installed (`npm ci` there) for its imports to resolve - CI does this before the step.

Do not confuse this with `src/adapters/depgraph`: that uses dependency-cruiser as a *runtime library* to graph the repositories users index. The gate is the repo's own lint.

## What the gate checks

| Rule | Meaning |
|---|---|
| `routes-only-talk-to-services` | `routes.ts` never imports a repository or `src/adapters/**` |
| `only-repositories-touch-the-database` | inside a module only `repository.ts` / `repository/**` import `drizzle-orm`, `postgres`, `src/db/**` |
| `only-routes-know-fastify` | Fastify packages only in `routes.ts`, `modules/_shared/**`, `modules/index.ts` |
| `modules-depend-on-ports-not-adapters` | no module file imports `src/adapters/**` |
| `services-take-ports-not-the-container` | only `routes.ts` / `compose.ts` import `platform/container.ts` |
| `application-has-no-direct-io` | no `fs`, `child_process`, `net`, `http(s)` or I/O SDKs in module code outside repositories |
| `domain-files-are-pure` | `domain.ts`, `ports.ts`, `helpers.ts`, `constants.ts` import no outer ring and no sibling `routes` / `service` / `repository` |
| `no-cross-module-imports` | `modules/A/**` never imports `modules/B/**` (`_shared` excepted) |
| `adapters-do-not-know-modules`, `platform-does-not-know-modules` | infrastructure does not import features (`container.ts` excepted) |
| `shared-contracts-are-self-contained` | `src/vendor/shared/**` imports nothing else from the server |
| `reviewer-core-only-through-its-index` | no deep imports past `reviewer-core/src/index.ts` |
| `reviewer-core-has-no-io` | the engine (except `llm/`) imports no I/O builtins, no server code, no persistence or HTTP library |

`tsPreCompilationDeps: true` makes `import type` count. That is deliberate: a row type in a service signature is a real coupling even though it compiles to nothing.

## Reading a failure

```
error only-repositories-touch-the-database: src/modules/pulls/service.ts → src/db/schema.ts
  Drizzle, postgres and src/db/** … are infrastructure. Inside a module only repository.ts …
```

`from → to` is the offending import; the paragraph under it is the rule's `comment` explaining the move. The fix is always one of: move the code to the ring that is allowed to make that import, or invert the dependency with a port. It is never "add an exception for my file".

## The baseline

`.dependency-cruiser-known-violations.json` records the violations that existed when the gate was introduced (43, across seven rules - `only-repositories-touch-the-database` 15, `services-take-ports-not-the-container` 9, `modules-depend-on-ports-not-adapters` 8, `application-has-no-direct-io` 5, `domain-files-are-pure` 3, `adapters-do-not-know-modules` 2, `no-cross-module-imports` 1). `--ignore-known` downgrades exactly those `rule + from + to` triples, so:

- a **new** wrong-way import fails immediately, even in a file that already has recorded ones;
- removing a violation makes its baseline entry stale but harmless - run `pnpm arch:baseline` in the same change so the file only ever shrinks;
- **never regenerate the baseline to make a new violation pass.** Before committing a regenerated baseline, check `git diff --stat` on it: the change should be deletions only.

Reviewing a baseline change works differently depending on whether the file is tracked yet. Once it is, `git diff` is the check. On the branch that *introduces* the gate the file is untracked, so a diff shows nothing - verify by content instead: `jq length` is 43, and no entry may name a file the branch itself added or changed.

One gotcha: entries that point at an npm package store the resolved pnpm path, version included (`node_modules/.pnpm/drizzle-orm@0.38.4_…`). Upgrading `drizzle-orm` will surface the five route-level Drizzle imports as "new". That is the moment to either fix them or re-record; do not loosen the rule.

The repo pins dependency-cruiser 17, where the baseline is written by the `depcruise-baseline` binary. From 18.3 the same thing is `depcruise --baseline`; update the script if the package is upgraded.

## Adding or changing a rule

1. Add a `forbidden` entry: a `name` that reads as a sentence, a `comment` that says what to do instead, `from` / `to` as **regular expressions** (not globs) over paths relative to `server/`. `$1` in `to` refers to a capture group in `from`.
2. Run `pnpm arch:all` and read every hit. False positives mean the pattern is wrong - fix the pattern rather than baselining noise.
3. Prove the rule bites: add a throwaway file with the forbidden import, watch `pnpm arch:check` fail, delete it.
4. Re-record the baseline if the rule legitimately captures existing debt, and list that debt under "Existing deviations" in `SKILL.md`.

Rules encode decisions the team made; changing one is an architectural decision and needs the user's agreement, not a drive-by edit.

## What the gate cannot see

It sees imports, not behaviour. Review still has to catch:

- a service that reaches the database *through* `deps` typed as `Db`;
- `new SomeAdapter()` on a class obtained without a static import, or `process.env` reads;
- business logic in a handler that needs no forbidden import;
- a port shaped like the library behind it;
- a row travelling outwards under a structurally identical hand-written type.

The review checklist in `SKILL.md` covers these.

## Why dependency-cruiser

It was already a dependency, it resolves tsconfig `paths`, it supports `allowed`/`forbidden` rules with capture groups (needed for "no cross-module imports"), and it has a first-class baseline for adopting rules on a codebase with existing debt. The repo has no ESLint setup, so `eslint-plugin-boundaries` or `no-restricted-imports` would mean introducing a linter to get one rule family. If ESLint arrives for other reasons, `eslint-plugin-boundaries` gives the same rules with in-editor feedback and can run alongside.
