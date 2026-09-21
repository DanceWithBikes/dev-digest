# Placement guide

Detailed rules for where each kind of code lives. Read the section you need.

## Contents
- The scope ladder in practice
- Constants
- Helpers vs utils
- Hooks
- Business logic
- API and data access
- Types and schemas
- Styles, copy, config
- Tests
- Anti-patterns

## The scope ladder in practice

```
component file → component folder → route segment → shared (app-wide) → design system / shared package
```

Ask "who imports this today?" and pick the lowest rung that contains every importer.

- Imagined future consumers do not count. Promotion is cheap (a move plus import updates); premature sharing is expensive, because shared code must stay generic, is harder to change, and nobody knows when it is safe to delete.
- Promotion is triggered by a **second real consumer outside the current scope**. It is a move: the original disappears.
- Demotion is equally valid. Shared code that ended up with one consumer goes back down next to it.
- Keep nesting shallow. Two levels of nested component folders is a practical ceiling; deeper than that, either the inner component deserves promotion to the segment level or the feature should be divided.

## Constants

Decide by how far the value travels:

| Situation | Placement |
|---|---|
| Used once, meaning obvious from context (`gap: 8`, `slice(0, 3)` beside a clear name) | inline |
| Used once but the meaning is not obvious (a timeout, a threshold) | named constant at the top of the same file, with a comment explaining *why this value* |
| Used by several files of one component; any lookup table, option list or enum-like map | `constants.ts` in the component folder |
| Used across the components of one route | `constants.ts` at the route-segment level |
| Used across routes | shared module named after its domain (`github-urls.ts`, `feature-models.ts`), not a generic `constants.ts` |

Rules:
- Declare with `as const` (or `satisfies`) and derive union types from the value, so the constant and its type cannot drift:
  ```ts
  export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
  export type Severity = (typeof SEVERITIES)[number];
  ```
- `SCREAMING_SNAKE_CASE` for true constants; module-level, never recreated inside a component body.
- A global `constants/` folder or one app-wide `constants.ts` becomes a dumping ground where unrelated values accumulate and nothing can be deleted. Group by domain instead.

These are **not** constants and have their own homes:
- User-facing text → i18n message files.
- Colours, spacing, radii, breakpoints → design tokens / CSS variables.
- Environment and runtime configuration → a single config module that reads `process.env` once and exports typed values.
- Values that are part of the client-server contract (statuses, enums) → the shared contracts package, ideally inferred from the schema.

## Helpers vs utils

Two different things that are often mixed up:

- **Helper** - a pure function specific to this product's domain. It would make no sense in another project: `countBySeverity(findings)`, `modelColor(model)`, `prStatusLabel(pr)`.
- **Util** - a generic function that accomplishes an abstract task and could be copied into any project: `clamp`, `groupBy`, `formatBytes`.

Placement:
- Helper with one consumer → `helpers.ts` in that component folder.
- Helper shared within a route → segment-level `helpers.ts`.
- Helper shared across routes → a shared **domain-named** module. The name says what it is about (`model-label.ts`), not that it is "helpers".
- Util → shared `lib/` or `utils/`. Before writing one, check the platform (`Intl`, `structuredClone`, `Array.prototype.*`) and existing dependencies.

Rules:
- Helpers and utils are pure: no React imports, no hooks, no I/O, no module-level mutable state. That is what makes them trivially testable and callable from anywhere, including conditions and loops.
- Do not name a function `use*` unless it calls hooks. `useSorted(items)` that only sorts should be `getSorted(items)`; the `use` prefix removes the freedom to call it conditionally and misleads readers.
- A `helpers.ts` that grows past a screen or mixes unrelated concerns should be divided by topic (`comments.ts`, `formatting.ts`), not left as a grab bag.
- Functions defined inside a component body that do not close over props or state belong outside it (file level or `helpers.ts`).

## Hooks

- Extract a custom hook when stateful logic (state + effects + subscriptions) obscures the markup, when the same stateful logic is needed twice, or whenever you write an Effect - wrapping it makes the data flow in and out explicit and lets the component express intent instead of mechanics.
- Name hooks after a **concrete, high-level use case**: `useOnlineStatus`, `useGlobalShortcuts`, `useShellCommands`. Avoid generic lifecycle wrappers such as `useMount` or `useEffectOnce`; an API that does not constrain its use cases causes more problems than it solves.
- Hooks share stateful *logic*, not state. Two components calling the same hook get independent state; shared state needs lifting or context.
- Placement follows the ladder: one consumer → `use<Thing>.ts` in the component folder (or a `hooks/` subfolder once there are several); app-wide → shared hooks folder.
- Data-fetching hooks are a special case: keep them together in the API/hooks layer so that query keys, fetchers and invalidation live side by side. A mutation that invalidates `["agents"]` must be able to see how `["agents"]` is defined.
- A hook orchestrates; it should *call* pure functions for business rules rather than contain them.

## Business logic

Treat React as the view layer. Business rules - calculations, eligibility checks, status derivation, sorting/grouping policy, mapping API data to view models - are plain TypeScript.

The test: **could this run in a Node test without React?** If yes, it must not live in a component body or inside a hook.

```tsx
// Avoid: rule trapped in JSX - untestable without rendering, invisible to reuse
{findings.filter(f => f.severity === "critical" || (f.severity === "high" && !f.dismissed)).length > 0 && <Banner />}

// Prefer: rule has a name, a home and a unit test
// helpers.ts
export function hasBlockingFindings(findings: Finding[]): boolean { ... }
// Component.tsx
{hasBlockingFindings(findings) && <Banner />}
```

Layering inside a feature, from the outside in:
1. **Component** - renders, wires events.
2. **Hook** - owns state, effects, queries; calls the rules.
3. **Pure domain functions** - the rules themselves.
4. **API layer** - talks to the outside world, maps transport shapes to domain shapes.

Shape data once, at the boundary (the query's `select`, a mapper in the API layer, or a helper called by the hook) - not repeatedly inside JSX in several components.

Payoff: bugs localize to one layer, rules get unit tests without rendering, and the domain logic survives UI rewrites.

## API and data access

- One pre-configured API client for the whole app; nothing else knows base URLs, headers or error normalization.
- Per resource, keep together: request/response types (or schemas), the fetcher, and the query/mutation hook.
- Components consume hooks; they never call `fetch` or the client directly. This keeps caching, invalidation and error handling uniform and makes components testable with a mocked network.
- Keep each query key next to its query function - the key *is* the function's dependency list. Defining keys in one file and fetchers in another invites drift.
- A custom hook per query is a project-level choice. Where the project mandates it (as this repository does), follow it; the important part is colocation of key + fetcher + options.

## Types and schemas

- Props type: in the component file, right above the component.
- Types shared by several files in one folder: `types.ts` there.
- Domain and contract types: the shared contracts package; prefer `z.infer` from the schema over a hand-written duplicate.
- Do not create a global `types/` folder of unrelated interfaces; a type lives with the code that owns the concept.

## Styles, copy, config

- Styles are colocated with the component (`styles.ts`, CSS module or utility classes, per the project convention). Shared visual decisions are tokens, not copy-pasted values.
- Copy lives in i18n message files, namespaced per feature.
- Config is read in one module and imported as typed values.

## Tests

- Unit and component tests sit next to the file they test (`Name.test.tsx`, `helpers.test.ts`). Whoever changes the code sees the test, and they move or die together.
- End-to-end tests are the exception: they span the system, do not map to a source file, and live in their own package.

## Anti-patterns

| Anti-pattern | Why it hurts | Instead |
|---|---|---|
| Top-level `utils.ts` / `helpers.ts` / `constants.ts` that everything imports | Unrelated code couples together; nothing can be deleted safely | Colocate; name shared modules by domain |
| Sharing "because we might need it" | Generic code is harder to change than local code | Promote on the second real consumer |
| Copying on promotion | Two diverging versions | Move, update imports, delete the original |
| Business rule inline in JSX or in `useEffect` | Untestable, duplicated, hidden | Named pure function |
| `use*` name on a pure function | Cannot be called conditionally; misleads | Plain function name |
| Component calling `fetch` | Bypasses caching, error handling, mocks | Query hook from the API layer |
| Mirror test tree (`__tests__/` mirroring `src/`) | Tests drift from code | Colocate |
| Hand-written duplicate of a contract type | Silent drift from the server | Infer from the shared schema |
