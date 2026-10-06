# What the collector measures, and where it can be wrong

`scripts/collect-deps.mjs` is read-only and has no dependencies. Its numbers are facts about **disk**, not about bundles.

| Field | How it is computed | Caveat |
|---|---|---|
| `ownKb` | Sum of file sizes of the package's real directory (symlinks resolved, nested `node_modules` skipped) | Includes docs, maps and `.d.ts`; says nothing about what ships to a browser |
| `withTransitiveKb` | `ownKb` plus every transitive `dependencies` / `optionalDependencies` resolved Node-style from disk, each counted once | Shared transitive packages are counted in every parent, so rows do not sum to the package total. Platform-specific optional binaries that are installed are included |
| `transitiveCount` | Number of distinct packages in that tree | - |
| `type` | Which block of `package.json` declares it | A package declared in two blocks appears twice |
| `pinned` | Range starts with a digit | - |
| `usedInSource` | A quoted import/require/`from` of the name or a subpath found in the package's source, config and CSS files, or a CLI call in its `scripts`. `typescript` counts as used when a `tsconfig` exists; `@types/x` when `x` is used | **Heuristic.** False negatives: plugins loaded by directory scan (`@fastify/autoload`), CLI tools invoked indirectly (`tsx`, `testcontainers` through a test setup), peer packages required by another package. Always verify with grep before calling a package unused |
| `internalDeps` | tsconfig `paths` entries whose target is in another top-level directory | Only TypeScript path aliases; there is no workspace linking |
| `versionDrift` | Same dependency name in several packages with different range strings | Compares range strings, not resolved versions |
| `vendorDrift` | Hash of all files in the two `vendor/shared` copies | Says "differ", not which side is newer: use `diff -rq` |
| `latest` / `wanted` | `pnpm outdated --format json` / `npm outdated --json` per package, only with `--outdated` | Needs network; absent when the registry is unreachable |

## Not covered

- Bundle size (use `next build` output or a bundle analyzer for the client).
- Vulnerabilities and licences beyond the raw `license` field (use `pnpm audit` / `npm audit`).
- Import-boundary rules between modules (that is `pnpm arch:check`).
