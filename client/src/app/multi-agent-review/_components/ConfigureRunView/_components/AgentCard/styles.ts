import type { CSSProperties } from "react";

export const s = {
  card: (color: string, enabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${color}`,
    borderRadius: 8,
    background: "var(--bg-surface)",
    opacity: enabled ? 1 : 0.55,
  }),
  icon: (color: string): CSSProperties => ({
    display: "grid",
    placeItems: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    color,
    background: "var(--bg-elevated)",
    flexShrink: 0,
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", paddingLeft: 26 } satisfies CSSProperties,
  estimate: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    fontSize: 13,
    color: "var(--text-secondary)",
    textAlign: "right",
  } satisfies CSSProperties,
  hint: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
};
