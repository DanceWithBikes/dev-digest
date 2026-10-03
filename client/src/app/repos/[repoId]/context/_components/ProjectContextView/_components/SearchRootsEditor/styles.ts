import type { CSSProperties } from "react";

/** Co-located styles for SearchRootsEditor. */
export const s = {
  box: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 14,
  } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  textarea: {
    minHeight: 90,
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontSize: 13,
    resize: "vertical",
  } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
