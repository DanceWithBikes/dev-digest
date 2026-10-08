import type { CSSProperties } from "react";

/** Shared grid-row styles for the agent list and the recent-runs table. */
export const s = {
  section: { marginBottom: 28 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 } satisfies CSSProperties,
  list: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflowX: "auto",
  } satisfies CSSProperties,
  headRow: (grid: string): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: grid,
    gap: 12,
    alignItems: "center",
    padding: "8px 14px",
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  }),
  row: (grid: string): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: grid,
    gap: 12,
    alignItems: "center",
    padding: "10px 14px",
    fontSize: 13,
    borderBottom: "1px solid var(--border)",
  }),
  muted: { color: "var(--text-muted)", fontSize: 12.5 } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)", fontSize: 12.5 } satisfies CSSProperties,
  ellipsis: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 } satisfies CSSProperties,
  /** Grid cell that may shrink below its content so a long model slug truncates instead of overlapping. */
  modelCell: { minWidth: 0 } satisfies CSSProperties,
  modelBadge: { display: "block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  link: { color: "var(--accent)", fontSize: 12.5, textDecoration: "none" } satisfies CSSProperties,
  runAllRow: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
  hint: { padding: 14 } satisfies CSSProperties,
};
