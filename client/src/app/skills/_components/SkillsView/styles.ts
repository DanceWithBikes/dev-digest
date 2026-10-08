import type { CSSProperties } from "react";

/** Co-located styles for SkillsView. */
export const s = {
  split: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  right: {
    flex: 1,
    minWidth: 0,
    padding: "40px 24px",
    textAlign: "center",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  placeholderTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 6,
  } satisfies CSSProperties,
  placeholderBody: { fontSize: 13, lineHeight: 1.5 } satisfies CSSProperties,
} as const;
