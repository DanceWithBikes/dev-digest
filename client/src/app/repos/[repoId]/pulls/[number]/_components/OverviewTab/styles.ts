import type { CSSProperties } from "react";

export const s = {
  briefGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  /** A brief-grid card that spans the full row (BlastRadiusCard — its Tree/Graph
      content wants more width than a half-column). */
  briefFull: {
    gridColumn: "1 / -1",
    marginTop: 18,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
