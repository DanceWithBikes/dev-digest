import type { CSSProperties } from "react";

export const s = {
  /** Hairline between the Intent and Blast Radius sections — the page column's
      own `gap` supplies the vertical spacing around it. */
  sectionDivider: {
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: 0,
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
