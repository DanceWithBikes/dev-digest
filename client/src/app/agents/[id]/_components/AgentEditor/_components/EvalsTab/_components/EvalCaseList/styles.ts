import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  expectations: { margin: "6px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  expectation: { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 } satisfies CSSProperties,
  actions: { display: "flex", gap: 6, alignItems: "center" } satisfies CSSProperties,
} as const;
