import type { CSSProperties } from "react";

export const s = {
  /** Intent | Blast Radius: two equal columns that stack once the page column is too
      narrow for two 440px cards (the mockup's side-by-side layout, below-lg stacked). */
  twoCol: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))",
    gap: 20,
    alignItems: "start",
  } satisfies CSSProperties,
  col: { minWidth: 0 } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
