# client — `@devdigest/web` (Next.js 15, :3000)

Stack on top of the root: Tailwind 4 · recharts · mermaid · react-markdown · RTL + jsdom.

## Commands
```sh
pnpm dev          # :3000; API from NEXT_PUBLIC_API_BASE (default http://localhost:3001)
pnpm test         # vitest + jsdom, fetch is mocked — no API needed
pnpm typecheck
pnpm arch:check   # import boundaries (.dependency-cruiser.cjs); also runs in CI
```

## Map
- `src/app/` — App Router routes; pages stay thin
- `src/app/**/_components/<Name>/` — feature logic
- `src/lib/api.ts` — `apiFetch` + `ApiError`; `src/lib/hooks/*` — all TanStack Query hooks
- `src/components/` — shared components (app-shell, diff-viewer…)
- `src/vendor/ui/` — `@devdigest/ui`, the design system
- `src/vendor/shared/` — `@devdigest/shared` (copy 2 of 2)
- `messages/en/<namespace>.json` — all UI copy

## Conventions
- Component layout: `_components/<Name>/{<Name>.tsx, <Name>.test.tsx, helpers.ts, constants.ts, styles.ts, index.ts}`.
- Feature styles are objects in `styles.ts` (`satisfies CSSProperties`) + theme CSS variables (`var(--border)`…). Tailwind v4 is loaded via `@devdigest/ui/styles.css`, but `_components` mostly use `styles.ts` — stick to that.
- Copy only via `useTranslations("<namespace>")`; a new feature = a new `messages/en/<feature>.json`.
- Components never call `fetch` directly — only hooks from `src/lib/hooks`.
- Import UI primitives only from the `@devdigest/ui` barrel, never from files inside it.
- Import a component folder through its `index.ts`; routes never import from another route, and `src/components` / `src/lib` never import from `src/app` — enforced by `pnpm arch:check`. Where things go: the `frontend-ui-architecture` skill.
- Components must render in both themes (`data-theme="dark" | "light"`).

## Gotchas
- Changed a contract in `src/vendor/shared` → change `server/src/vendor/shared` too.
- `apiFetch` sets `content-type: application/json` only when a body is sent (Fastify rejects an empty JSON POST).

## Do-not-touch
- `src/vendor/ui/**` — extend with new files; don't rewrite existing components without a reason.

## Docs
README.md (route & API map) · src/vendor/ui/README.md · ../TESTING.md · docs/specs/ · docs/insights.md
