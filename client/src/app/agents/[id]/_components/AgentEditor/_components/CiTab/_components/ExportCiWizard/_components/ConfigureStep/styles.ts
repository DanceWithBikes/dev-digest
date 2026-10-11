import type { CSSProperties } from "react";

export const s = {
  chips: { display: "flex", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  secretRow: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 12px",
    border: "1px solid var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  secretName: { fontFamily: "var(--font-mono, monospace)", fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  radio: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } satisfies CSSProperties,
  info: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--info-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "10px 12px",
  } satisfies CSSProperties,
} as const;
