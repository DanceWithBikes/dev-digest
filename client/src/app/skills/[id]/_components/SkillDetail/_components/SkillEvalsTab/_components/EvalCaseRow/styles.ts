import type { CSSProperties } from "react";

export const s = {
  card: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-surface)" } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "10px 12px",
    background: "transparent",
    border: 0,
    color: "inherit",
    textAlign: "left",
    cursor: "pointer",
    font: "inherit",
  } satisfies CSSProperties,
  name: { flex: 1, fontSize: 13.5, fontWeight: 500, overflowWrap: "anywhere" } satisfies CSSProperties,
  score: { fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  chevron: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    padding: "4px 12px 12px",
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)", paddingTop: 8 } satisfies CSSProperties,
  practice: { display: "flex", flexDirection: "column", gap: 4, paddingTop: 8 } satisfies CSSProperties,
  practiceHead: { display: "flex", gap: 8, fontSize: 13 } satisfies CSSProperties,
  evidenceLabel: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  evidence: {
    margin: 0,
    padding: "6px 10px",
    borderLeft: "3px solid var(--border-strong)",
    background: "var(--bg-hover)",
    fontSize: 12.5,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;

export const verdictMark = (ok: boolean): CSSProperties => ({
  color: ok ? "var(--ok)" : "var(--crit)",
  fontWeight: 700,
  width: 14,
  flexShrink: 0,
});
