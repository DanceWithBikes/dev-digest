# Next.js App Router: structure

Organization only. For API usage (metadata, route handlers, async request APIs, caching) use the `next-best-practices` skill.

## Contents
- Choose one organization strategy
- Thin route files
- Private folders and route groups
- Two rendering models, two sets of placement rules
- Where the server/client boundary goes
- Providers
- Server-only code and the data access layer
- Server Actions
- Special files are part of the structure

## Choose one organization strategy

Next.js documents three and endorses none:

1. **Project files outside `app`** - `app/` purely for routing, everything else in top-level folders.
2. **Project files in top-level folders inside `app`**.
3. **Split by feature or route** - globally shared code at the top, route-specific code inside the route segment that uses it.

Strategy 3 is the one that matches the colocation principle, and it is the one this repository uses: shared code in `src/components` and `src/lib`, route-specific code in `src/app/**/_components`. Whichever the project uses, do not mix strategies.

Put application code under `src/` so it is separated from root-level configuration.

## Thin route files

`page.tsx` and `layout.tsx` are the routing layer. They should:
- read `params` / `searchParams`,
- in a server-rendered app, fetch through the data access layer,
- render one view component and pass it what it needs.

```tsx
import { AgentsListView } from "./_components/AgentsListView";

export default function AgentsPage() {
  return <AgentsListView />;
}
```

Why: route files have framework-imposed names and export shapes, cannot be imported elsewhere, and are awkward to test. A view component is an ordinary component with an ordinary test. Thin route files also make a future change of routing structure a matter of moving folders.

## Private folders and route groups

- A folder is only routable when it contains `page` or `route`, so colocating files in `app/` is safe by default.
- Prefix with `_` (`_components`, `_lib`) to opt a folder and its subtree out of routing explicitly. Benefits: separates UI logic from routing logic, gives a consistent place for internals, sorts together in editors, and avoids collisions with future Next.js file conventions.
- `(group)` folders organize routes by section or team, and scope a layout or a `loading.tsx` to a subset of routes, without affecting the URL.
- Dynamic segments (`[id]`) are user input. Code that handles them belongs where validation happens, not scattered through child components.

## Two rendering models, two sets of placement rules

Identify which one the app is before applying the rest of this file.

**A. Client-rendered app talking to an external API** - most components are `'use client'`, data comes from query hooks (TanStack Query) against a separate backend. *This repository is this kind.*
- The API layer is a client module (`api.ts` + query hooks).
- There is little or no server-only code; the data-access-layer section below mostly does not apply.
- Server Components are used for the shell: layouts, static structure, i18n setup.
- The separate backend owns authorization and business invariants; the frontend's "business logic" is presentation-level rules.

**B. RSC-first app that reads data on the server** - pages are async Server Components, the app talks to a database or privileged APIs itself.
- Data access lives in a server-only layer.
- Client components are interactive leaves receiving minimal, serializable props.
- The sections below apply in full.

Do not migrate an app from one model to the other as a side effect of a feature; that is an architectural decision to raise explicitly.

## Where the server/client boundary goes

`'use client'` declares a boundary in the module graph: the file, everything it imports, and every component it renders directly become part of the client bundle.

- Place the directive on the **smallest interactive unit** (the search box, the like button), not on the page or layout that contains it.
- A Server Component can be passed *through* a client component as `children` or another prop; it is rendered on the server and is not pulled into the client graph. Use this to keep a client-side shell (modal, tabs, accordion) around server-rendered content.
- Props crossing the boundary must be serializable, and should be minimal: pass the three fields the component renders, not the whole record.
- Third-party components that use client features but lack the directive: wrap them once in your own client module (`components/carousel.tsx` with `'use client'`) and import that wrapper everywhere. This is also the general "wrap third-party components" rule - one place to adapt or replace the dependency.
- Organizationally: do not mix a server component and a client component in one file, and keep a folder's client entry separate from its server entry.

## Providers

Context is client-only. Create each provider as a client component that accepts `children`, and compose them in one `providers.tsx` rendered by the root layout.

Render providers as deep as possible: around `{children}`, not around `<html>`, and if only one route subtree needs a provider, mount it in that segment's layout. The narrower the provider, the more of the tree stays static and the fewer components depend on it implicitly.

## Server-only code and the data access layer

For apps of kind B, Next.js recommends a dedicated **Data Access Layer** for new projects - an internal library that:
- runs only on the server (`import 'server-only'` at the top of each module; importing it from a client module becomes a build error),
- performs authorization checks,
- returns minimal **DTOs** shaped for the view, never raw records.

Placement: a top-level `data/` (or `lib/data/`, `server/`) folder outside `app/`, organized by domain (`data/user.ts`, `data/posts.ts`). Only this layer reads secrets from `process.env` and imports database packages. Pick one data-fetching approach for the project - external HTTP API, data access layer, or component-level queries (prototypes only) - and do not mix them.

This is the same "I/O in its own layer" principle as on the client, with a security motivation added: a single auditable place for who-can-see-what.

## Server Actions

- Keep `'use server'` files thin: validate input, call the data access layer, revalidate. Auth and authorization live in the data access layer so they cannot be forgotten per action.
- Colocate a route-specific action with its route (`app/posts/_lib/actions.ts` or `app/posts/actions.ts`); shared actions live beside the data access layer.
- Every exported action is a public endpoint. Treat its arguments as untrusted and its return value as public: return what the UI needs, not the database record.

## Special files are part of the structure

`loading.tsx`, `error.tsx`, `not-found.tsx`, `template.tsx` render in a fixed hierarchy (layout → template → error → loading → not-found → page). Placing one in a segment is an architectural statement about that subtree's boundaries - decide per segment rather than copying them everywhere, and use a route group when a loading or error UI should apply to only some sibling routes.
