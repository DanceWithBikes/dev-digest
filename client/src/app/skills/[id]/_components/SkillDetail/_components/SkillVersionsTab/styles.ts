import type { CSSProperties } from "react";

/** Co-located styles for SkillVersionsTab. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (current ? "var(--border-strong)" : "var(--border)"),
    background: current ? "var(--bg-hover)" : "var(--bg-elevated)",
  }),
  version: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  date: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
