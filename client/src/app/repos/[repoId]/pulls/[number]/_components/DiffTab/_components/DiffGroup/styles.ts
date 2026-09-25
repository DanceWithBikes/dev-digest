import type { CSSProperties } from "react";

/** Co-located styles for DiffGroup (extracted from inline styles). */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    cursor: "pointer",
    padding: "4px 2px",
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  summary: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
