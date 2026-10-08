import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "top" } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 12, marginTop: 4, overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
