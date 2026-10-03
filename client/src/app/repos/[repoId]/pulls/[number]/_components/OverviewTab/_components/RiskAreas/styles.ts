import type { CSSProperties } from "react";

export const s = {
  wrap: { marginTop: 18 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  item: (color: string): CSSProperties => ({
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${color}`,
    borderRadius: 6,
    background: "var(--bg-base)",
    maxWidth: "100%",
  }),
  chip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "6px 10px",
    textAlign: "left",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  chipText: { display: "flex", flexDirection: "column", minWidth: 0, flex: 1 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  ref: { fontSize: 11.5, color: "var(--accent-text)", overflowWrap: "anywhere" } satisfies CSSProperties,
  detail: { padding: "2px 12px 10px 12px", fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  refList: { display: "flex", flexDirection: "column", gap: 2, marginTop: 6 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
