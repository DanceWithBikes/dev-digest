import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 } satisfies CSSProperties,
  item: { fontSize: 13.5, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  ref: {
    font: "inherit",
    padding: 0,
    background: "none",
    border: "none",
    color: "var(--accent-text)",
    cursor: "pointer",
    textAlign: "left",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  link: { color: "var(--accent-text)", overflowWrap: "anywhere" } satisfies CSSProperties,
  text: { color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
