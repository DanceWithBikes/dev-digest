---
name: frontend-ui-architecture
description: "Frontend UI architecture and code organization for React + Next.js (App Router): where components, sub-components, hooks, constants, helpers, utils, types, API calls and business logic should live; how to split components; route/feature colocation vs shared layers; import direction, public APIs (index.ts) and barrel files; thin pages, private _components folders and where the server/client boundary goes. Use whenever creating, moving, renaming or splitting frontend files or folders, adding a new page, feature or component, deciding where a piece of code should go, extracting a hook, helper or constant, promoting code to a shared folder, refactoring a large component, or reviewing a PR for structure - even if the user never says 'architecture'. Does NOT cover React runtime patterns such as state, effects and memoization (use react-best-practices), Next.js API usage (use next-best-practices) or testing technique (use react-testing-library)."
metadata:
  version: "1.1.0"
  updated: "2026-09-21"
---

# Frontend UI Architecture

Decide **where code lives** and **how it is split** in a React + Next.js (App Router) codebase. This skill is about structure, boundaries and placement - not about how to write the code inside the files.

| Question | Skill |
|---|---|
| Where does this file/function/constant go? How do I split this component? What may import what? | **this skill** |
| State, effects, memoization, keys, composition mechanics | `react-best-practices` |
| Next.js APIs: metadata, route handlers, async APIs, image/font | `next-best-practices` |
| How to test it | `react-testing-library` |

## First: the project's convention wins

Next.js is deliberately unopinionated about organization; its docs say to *"choose a strategy that works for you and your team and be consistent across the project."* Consistency is worth more than any individual rule below.

Before placing anything, read the nearest `AGENTS.md` and look at two or three neighbouring folders. If the project already answers the question, follow it - even where it differs from this skill. Use the rules below to fill gaps, to resolve cases the convention doesn't cover, and to review structure. If a convention is actively causing harm, say so and propose the change; don't silently introduce a second style.

For this repository the conventions are in [`client/AGENTS.md`](../../../client/AGENTS.md); the mapping is at the end of this file.

## The five principles

**1. Colocate by default, share by promotion.** Place code as close as possible to where it is used; things that change together live together. A helper sitting next to its only consumer gets updated or deleted with it, while the same helper in a distant `utils/` rots unnoticed. Start local, and move code outward only when a real second consumer appears.

**2. Code lives at the lowest scope that covers all of its consumers.** The scope ladder, narrowest first:

```
component file  →  component folder  →  route segment  →  shared (app-wide)  →  design system / shared package
```

Used by one file: keep it in that file. By several files of one component: the component folder. By several components of one route: the route segment. By several routes: shared. Moving up a rung is a *move*, never a copy.

**3. Dependencies point one way: shared → features/routes → app composition.** Lower layers never import from higher ones, and siblings never reach into each other's internals. When two features need each other, compose them one level up or promote the common part down. This is what keeps a feature deletable: if removing a folder breaks distant code, the boundary has leaked.

**4. Separate by kind of logic, not only by folder.** React is the view layer, not the whole application:

| Kind | Lives in | Test |
|---|---|---|
| Rendering, wiring events | component (`.tsx`) | needs props only |
| Stateful UI logic, effects, subscriptions | custom hook (`use*.ts`) | calls other hooks |
| Domain / business rules, formatting, mapping | pure functions (`helpers.ts`, domain module) | runs in plain Node, no React import |
| I/O: HTTP, storage, third-party SDKs | API / data-access layer | the only place that knows URLs and transport |

If a function can run without React, it must not be trapped inside a component or a hook.

**5. Every folder has a public surface; the rest is private.** Consumers import a component folder through its entry point and never from files inside it. Refactoring internals then never breaks callers.

## Where does it go?

| You are adding | Put it | Notes |
|---|---|---|
| Component used by one route | that route's private `_components/<Name>/` | pages stay thin and only compose |
| Sub-component used by one parent | inside the parent's folder (file, or nested `_components/<Child>/` once it needs its own files) | not exported from the parent's entry point |
| Component used by 2+ routes | shared `components/<name>/` | promote when the second route needs it, not before |
| Generic, domain-free UI primitive (Button, Modal) | design system | knows nothing about the product's domain |
| Value used once, self-explanatory | inline | a named constant adds nothing |
| Named constant for one file | top of that file | |
| Constants shared across a component folder; lookup tables; option lists | `constants.ts` in that folder | `as const`, derive types from it |
| Constants shared across a route / the app | segment-level `constants.ts` / shared module named by domain | never one global dumping-ground file |
| User-facing copy | i18n messages | not a constant |
| Colours, spacing, breakpoints | design tokens / CSS variables | not a constant |
| Env and runtime config | one config module | no scattered `process.env` |
| Pure function specific to this product's domain (**helper**) | `helpers.ts` beside its consumer, or a shared domain module | no React imports |
| Pure function that would make sense in any project (**util**) | shared `lib/` (or `utils/`) | check the platform / an existing dependency first |
| Stateful logic used by one component | `use<Thing>.ts` in the component folder (or inline if tiny) | |
| Stateful logic used across the app | shared hooks folder | named after the use case, never `useMount` |
| Business rule / calculation / mapping | pure function, called from the hook or component | never inline in JSX, never inside `useEffect` |
| HTTP call | API layer + query hook; components consume the hook | components never call `fetch` |
| Props type | same file as the component | |
| Type shared inside a folder | `types.ts` in that folder | |
| Contract / domain type | the shared contracts package, inferred from schemas | one source of truth |
| Test | next to the file it tests | end-to-end tests are the exception: separate package |

Details, edge cases and examples: [references/placement-guide.md](references/placement-guide.md).

## Splitting components

Split along **responsibilities and data**, not along line counts. *"A component should ideally only be concerned with one thing"*, and a well-shaped data model usually maps onto the component tree.

Split when a part has its own state or effect, its own data dependency, a nameable role ("filter bar", "row", "empty state"), a repeated structure, or when a `renderX()` function appears inside a component (that is a component asking to exist). Extract a hook when stateful logic obscures the markup; extract pure functions when logic does not need React at all.

Do **not** split merely to shorten a file, to wrap a single element, or to create an abstraction for one caller. A wrong abstraction costs more than duplication: tolerate two copies, abstract on the third, and only once the shared shape is clear.

Signals, the splitting workflow and composition alternatives to prop-heavy components: [references/component-splitting.md](references/component-splitting.md).

## Boundaries and imports

- Import a component folder only through its entry point (`index.ts`); inside the folder use relative imports and never import your own `index.ts` (that creates a cycle).
- An entry point lists **explicit named exports** of what outsiders need. No `export *`, no logic, no re-exporting internals "just in case".
- No directory-wide barrels such as `components/index.ts` re-exporting every component: they pull entire module graphs into every page and hide cycles. A package-style entry point for a real library (the design system) is the legitimate exception.
- A route never imports from another route's `_components`. Need it in two places? Promote it.
- Shared code never imports from routes or features.
- Use path aliases for cross-scope imports and relative paths within a folder.

Rationale, the barrel-file trade-off and lint enforcement: [references/boundaries-and-imports.md](references/boundaries-and-imports.md).

## Next.js App Router

- `app/` is for routing. `page.tsx` / `layout.tsx` stay thin: read params, compose, hand off to a view component.
- Colocate route-specific code in private folders (`_components`, `_lib`): the `_` prefix opts the folder out of routing and signals "implementation detail of this segment".
- Use route groups `(name)` to organize or to scope layouts without changing URLs.
- Put `'use client'` on the smallest interactive leaf, not on a page or layout; pass server-rendered content into client components via `children`.
- Providers are client components rendered as deep as possible, wrapping `children`.
- Server-only code (secrets, DB, privileged fetches) lives in a data-access layer marked `import 'server-only'`, never in a module that client components import. Keep server and client entry points of a folder separate.

Full guidance including how the rules change between a client-rendered app and an RSC-first app: [references/nextjs-app-router.md](references/nextjs-app-router.md).

## Workflow

**Adding code**
1. Read the nearest `AGENTS.md`; open two neighbouring folders to see the live convention.
2. Classify what you are adding by kind (view / stateful / pure / I/O) - principle 4.
3. Find the lowest scope covering all current consumers - principle 2. Future, imagined consumers don't count.
4. Search for an existing constant, helper, hook or component before creating one.
5. Create it following the folder anatomy of the neighbours; export only what outsiders need.
6. If the project has a boundary check, run it (here: `cd client && pnpm arch:check`).

**Promoting code** (a second consumer outside the current scope appeared)
1. Move the code up exactly as many rungs as needed, no further.
2. Strip anything specific to the original consumer; if that is hard, the two uses may not be the same thing - keep them separate.
3. Update imports to the new entry point, move the tests with the code, delete the original.
4. Run the boundary check.

**Reviewing structure** - check in this order:
1. Does any import point the wrong way (shared → feature, route → other route, deep import past an entry point)?
2. Is anything shared that has one consumer, or duplicated that has three?
3. Is logic trapped in the wrong kind of file (business rules in JSX, `fetch` in a component, pure function named `use*`)?
4. Do pages/layouts contain more than composition?
5. Does every new folder match its neighbours' anatomy and naming?

Report findings as: location, which principle it violates, the concrete move that fixes it.

## In this repository (`client/`)

`client/AGENTS.md` is the source of truth; this is the mapping from the ladder above.

| Scope | Location |
|---|---|
| Route entry | `src/app/**/page.tsx` - thin, renders one view |
| Route-scoped component | `src/app/**/_components/<Name>/{<Name>.tsx, <Name>.test.tsx, helpers.ts, constants.ts, styles.ts, index.ts}` - create only the files you need |
| Sub-component of one view | `<Name>/_components/<Child>/` |
| Shared across a route segment | `helpers.ts` / `constants.ts` / `styles.ts` at the segment level (see `src/app/repos/[repoId]/pulls/`) |
| Shared component | `src/components/<kebab-name>/` with `index.ts` |
| Design system | `src/vendor/ui` via the `@devdigest/ui` entry point only; extend with new files |
| Shared domain modules, providers | `src/lib/*.ts(x)` |
| All TanStack Query hooks | `src/lib/hooks/*` - components never call `fetch`; the transport is `src/lib/api.ts` |
| Contract types | `@devdigest/shared` - exists in two copies (client + server), change both |
| Copy | `messages/en/<namespace>.json` via `useTranslations` |
| Styles | `styles.ts` objects + theme CSS variables |
| Boundary check | `pnpm arch:check` - `client/.dependency-cruiser.cjs`, also in CI; see [references/boundaries-and-imports.md](references/boundaries-and-imports.md) |

Existing deviations - leave them alone, and do not use them as precedent for new code:
- `src/lib/hooks/index.ts` is a documented `export *` barrel over the query-hook files. Importing from `@/lib/hooks` or from a domain file (`@/lib/hooks/reviews`) are both accepted.
- A few shared entry points (`app-shell`, `page-shell`, `showcase`) use `export *`. New entry points list explicit named exports.
- `src/app/repos/[repoId]/pulls/[number]/page.tsx` is not thin. The model to copy for a new route is `src/app/agents/page.tsx`.

## Sources

Every rule here traces to a source listed with its rationale in [README.md](README.md).
