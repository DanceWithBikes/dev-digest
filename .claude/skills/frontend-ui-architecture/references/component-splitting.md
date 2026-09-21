# Splitting components

## Contents
- What a good split looks like
- Signals to split
- Signals not to split
- Workflow for breaking up a large component
- Reducing props with composition
- Container/presentational today
- Folder anatomy after a split

## What a good split looks like

Each component is concerned with one thing, and the tree mirrors the shape of the data: a list component per collection, a row component per item, a section component per sub-object. When data and UI share the same information architecture, props stay small and changes stay local.

Three lenses for finding the seams:
- **Programming** - the same judgement used to decide when to create a function: a nameable responsibility.
- **Design** - how the designer would name the layers ("header", "filter bar", "empty state").
- **State** - which part of the tree actually reads or writes each piece of state.

## Signals to split

| Signal | Extract |
|---|---|
| A part of the markup has its own state or effect | a child component owning that state - this also stops the rest from re-rendering |
| A part has its own data dependency (its own query) | a child component that calls its own hook |
| A `renderHeader()` / `renderRow()` function inside the component | a real component - nested render functions share the parent's scope, cannot hold state and grow without bound |
| A `.map()` body longer than a few lines | an item component |
| Distinct conditional branches (loading / empty / error / content) each with sizeable markup | one component per branch |
| Stateful logic (several `useState` + `useEffect`) obscures the markup | a custom hook |
| Calculations or mapping that never touch React | pure functions in `helpers.ts` |
| The props list keeps growing, or booleans toggle whole regions | composition (see below) or two components |
| Two people would describe the component with "and" | two components |

Size is a smell, not a rule. A long component that does one thing linearly can be fine; a short one that mixes fetching, rules and layout is not.

## Signals not to split

- The only motivation is line count.
- The extracted piece would need most of the parent's props and state passed back in - the seam is in the wrong place.
- The extracted piece wraps a single element and adds no meaning.
- You are creating a "reusable" abstraction for one caller. Prefer duplication over the wrong abstraction: write it twice, and abstract on the third occurrence, once the shared shape is actually visible. Optimize for ease of change first.
- A generic component is accumulating flags to serve diverging callers. That is the sign the abstraction was wrong - split it back into specific components.

## Workflow for breaking up a large component

1. **List responsibilities** in one line each (fetches X, filters by Y, renders table, handles modal...).
2. **Pull out pure logic first** into `helpers.ts` and add unit tests. This is the safest step and shrinks everything that follows.
3. **Pull stateful logic** into one or more use-case hooks. The component should now read as: call hooks → derive → render.
4. **Cut the markup** along the data shape and the state boundaries into child components. Move state down into the child that owns it.
5. **Place the children** by the scope ladder: used only here → inside this component's folder, not exported.
6. **Re-check the parent**: it should be composition plus wiring. Keep the public entry point unchanged so callers are unaffected.
7. Run the existing tests after each step, not once at the end.

## Reducing props with composition

Before adding a prop, ask whether the caller should pass *content* instead of *configuration*:

```tsx
// Configuration: every new need is a new prop
<Card title="Runs" showBadge badgeCount={3} footerText="See all" onFooterClick={...} />

// Composition: the card owns layout, the caller owns content
<Card>
  <Card.Header>Runs <Badge count={3} /></Card.Header>
  <Card.Footer><Link href="...">See all</Link></Card.Footer>
</Card>
```

Passing `children` (or named slots) also removes prop drilling, because the intermediate component no longer needs to know about the data, and in Next.js it is what lets server-rendered content sit inside a client component.

## Container/presentational today

The original idea - separate *how things look* from *how things work* - still holds. The implementation changed: custom hooks deliver the same separation without a wrapper component per view, and the pattern's own author stopped recommending the strict two-component division once hooks existed.

Practical reading:
- Do not create `XContainer` + `X` pairs by reflex.
- Do keep leaf and design-system components free of data fetching and domain knowledge: they take props and render.
- Do let one "view" component per route own the hooks and pass plain data down.

## Folder anatomy after a split

```
_components/
└── FindingsPanel/
    ├── FindingsPanel.tsx        # the view: hooks + composition
    ├── FindingsPanel.test.tsx
    ├── useFindingsFilter.ts     # stateful logic used only here
    ├── helpers.ts               # pure domain functions
    ├── helpers.test.ts
    ├── constants.ts
    ├── styles.ts
    ├── index.ts                 # exports FindingsPanel only
    └── _components/
        ├── FindingRow/
        └── EmptyState/
```

Create only the files that have content. Children under `_components/` are private: they are not exported from the parent's `index.ts`. If another route needs `FindingRow`, promote it; do not deep-import it.
