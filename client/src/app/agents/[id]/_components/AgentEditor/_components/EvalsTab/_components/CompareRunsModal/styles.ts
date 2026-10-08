import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "8px 10px",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "8px 10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 700, marginBottom: 8 } satisfies CSSProperties,
} as const;
