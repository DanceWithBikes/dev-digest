# Boundaries and imports

## Contents
- Dependency direction
- Cross-feature imports
- Public API of a folder
- Barrel files: the trade-off
- Import style
- Enforcement
- The deletion test

## Dependency direction

```
design system / shared package
        ↓
shared (components, hooks, lib)
        ↓
routes / features (route-private _components, segment helpers)
        ↓
app composition (layouts, pages, providers)
```

Read the arrows as "is used by". A module may import from its own folder and from the layers **above it in this diagram** (more shared). It never imports from the layers below it (more specific). Concretely:

- `src/components/**`, `src/lib/**` never import from `src/app/**`.
- The design system never imports from the application at all - it has no knowledge of the product's domain.
- A route's `_components` may import shared code and the design system, never another route's `_components`.
- A child component may import its parent folder's `constants.ts`, `helpers.ts` and `styles.ts`, but never the parent component itself.

Why: one-way flow makes the impact of a change predictable (only more specific code can break), prevents cycles, and keeps each feature removable.

## Cross-feature imports

Two routes/features need the same thing. Options, in order of preference:

1. **Promote the common part** to the shared layer, stripped of feature specifics.
2. **Compose one level up**: the parent (page/layout) renders both and passes data or slots between them.
3. Keep two copies if the similarity is superficial and the two are likely to diverge.

Do not import `app/agents/_components/AgentCard` from `app/repos/...`. It works today and silently couples two features: changing the agents page now breaks the repos page.

## Public API of a folder

A folder's entry point is a contract with the rest of the app. A good one:

1. **Protects consumers from structural change** - files inside can be renamed, merged or split without touching callers.
2. **Changes when behaviour changes** - a breaking change in the module shows up as a change to the entry point.
3. **Exposes only what is needed** - everything else stays private.

```ts
// index.ts - good: explicit, minimal
export { FindingsPanel } from "./FindingsPanel";
export type { FindingsPanelProps } from "./FindingsPanel";

// avoid: leaks internals, hides what the surface is, invites accidental coupling
export * from "./FindingsPanel";
export * from "./helpers";
export * from "./_components/FindingRow";
```

Export helpers or constants from an entry point only when an outside consumer genuinely needs them. If outsiders mostly want the helpers rather than the component, that is a sign those helpers belong in a shared domain module.

## Barrel files: the trade-off

Sources disagree, so be precise about which kind of index file is meant.

**Harmful - directory-wide barrels** (`components/index.ts`, `hooks/index.ts`, `utils/index.ts` re-exporting everything):
- Importing one symbol loads every module the barrel references; in a Next.js app this has been measured as thousands of extra modules per page and multi-second dev start-up.
- Any statement other than a re-export makes the barrel "impure" and defeats bundler optimizations such as `optimizePackageImports`.
- They manufacture circular imports: a file inside the directory imports a sibling *via the barrel*, which imports the file back.
- In a Next.js app one barrel mixing server-only and client modules can drag server code into the client graph and break the build.

**Acceptable - a narrow entry point per component or feature folder**, with a handful of explicit named exports and no logic. The cost is bounded by the folder, and it buys the public-API benefits above.

**Legitimate - a package entry point** for something consumed like a library (a design system, a shared contracts package).

Rules that keep the acceptable kind safe:
- Inside a folder, import siblings by relative path, never through the folder's own `index.ts`.
- No `export *`.
- No code in entry points - re-exports only.
- Keep server-only exports in a separate entry point (for example `index.server.ts`) from anything client components import.
- If a shared folder's entry point starts pulling heavy dependencies into unrelated pages, give each component its own entry point and drop the aggregate.

## Import style

- Across scopes: path aliases (`@/components/diff-viewer`, `@devdigest/ui`) - stable under file moves and readable.
- Within a folder: relative (`./helpers`, `../constants`) - the folder stays movable as a unit.
- Never `../../../` across scopes; that is an alias waiting to be used, or a boundary being crossed.
- Group imports: external packages, aliased app modules, relative modules.

## Enforcement

Conventions that are not checked decay, so encode the boundaries in whatever tool the project already runs.

**This repository uses dependency-cruiser**, not ESLint: `client/.dependency-cruiser.cjs`, run with `cd client && pnpm arch:check`, also a CI step. It fails on: shared code importing routes, the design system importing the app, one route area importing another, entering a component folder past its `index.ts`, importing design-system internals, and runtime import cycles. After moving or adding files, run it. When a new boundary rule is agreed, add it there with a `comment` that says what to do instead. Not covered mechanically: `export *` in entry points and `fetch` inside components (dependency-cruiser sees modules, not named imports) - those stay review items.

Writing rules for it: `$1` captured in `from.path` is substituted into `to.path` / `to.pathNot` **unescaped**, so a captured `[repoId]` becomes a character class - capture only bracket-free parts of a path. Patterns with nested quantifiers are rejected as unsafe.

Where a project has ESLint instead, the equivalents are:

- `import/no-restricted-paths` - zones forbidding shared → app, and feature → other feature.
- `import/no-cycle` - catches barrel-induced cycles.
- `eslint-plugin-boundaries` - declare element types (shared, feature, app) and the allowed dependencies between them; can also forbid deep imports past an entry point.
- `no-restricted-imports` with patterns - forbid importing design-system internals instead of its entry point.
- For codebases following Feature-Sliced Design strictly, the `steiger` linter checks the methodology's rules.

Example zone configuration:

```js
'import/no-restricted-paths': ['error', { zones: [
  // shared code must not know about routes
  { target: ['./src/components', './src/lib'], from: './src/app' },
  // a route must not reach into another route
  { target: './src/app/agents', from: './src/app', except: ['./agents'] },
]}]
```

When a project has no tool for this (check before assuming), enforce the rules in review and say so; do not add tooling unasked.

## The deletion test

To judge a boundary, imagine deleting the folder. What should break is only the place that composes it (a page, a parent). If distant, unrelated code breaks, something imported past the boundary - find that import and fix its direction.
