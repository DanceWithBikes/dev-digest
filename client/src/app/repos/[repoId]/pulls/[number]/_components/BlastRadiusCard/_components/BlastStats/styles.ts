import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  item: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  icon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  count: {
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
} as const;
