import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  repo: { fontWeight: 600, fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)", fontSize: 12.5 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
