import type { CSSProperties } from "react";

export const s = {
  column: (color: string): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    border: "1px solid var(--border)",
    borderTop: `3px solid ${color}`,
    borderRadius: 8,
    background: "var(--bg-surface)",
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  icon: (color: string): CSSProperties => ({ color, display: "grid", placeItems: "center" }),
  headMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  stat: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 8, padding: 12 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", whiteSpace: "pre-wrap", wordBreak: "break-word" } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
};
