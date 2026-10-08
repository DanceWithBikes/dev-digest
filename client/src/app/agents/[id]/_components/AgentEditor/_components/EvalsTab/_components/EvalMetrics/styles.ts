import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
