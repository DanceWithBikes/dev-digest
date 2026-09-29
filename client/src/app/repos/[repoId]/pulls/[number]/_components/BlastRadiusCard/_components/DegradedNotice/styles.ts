import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    padding: "8px 12px",
    marginBottom: 14,
    borderRadius: 6,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
  } satisfies CSSProperties,
  icon: {
    color: "var(--warn)",
    flexShrink: 0,
  } satisfies CSSProperties,
  text: {
    fontSize: 13,
    color: "var(--text-primary)",
    flex: 1,
  } satisfies CSSProperties,
  timeout: {
    fontSize: 12,
    color: "var(--warn)",
  } satisfies CSSProperties,
} as const;
