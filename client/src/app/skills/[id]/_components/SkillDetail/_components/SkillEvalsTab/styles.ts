import type { CSSProperties } from "react";

/** Co-located styles for SkillEvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, maxWidth: 860 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  titleBlock: { flex: 1, minWidth: 200 } satisfies CSSProperties,
  h3: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)", marginLeft: 8, fontWeight: 400 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 } satisfies CSSProperties,
  empty: {
    border: "1px dashed var(--border-strong)",
    borderRadius: 8,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  emptyTitle: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  emptyBody: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  command: {
    fontSize: 12.5,
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "8px 10px",
    overflowX: "auto",
  } satisfies CSSProperties,
} as const;
