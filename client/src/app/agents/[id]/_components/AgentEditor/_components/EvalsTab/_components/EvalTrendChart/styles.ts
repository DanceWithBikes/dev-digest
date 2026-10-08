import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  h3: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  legend: { display: "flex", gap: 14, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  tooltip: {
    padding: "6px 10px",
    borderRadius: 7,
    fontSize: 12,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
  } satisfies CSSProperties,
} as const;

export const dot = (color: string): CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  background: color,
});
