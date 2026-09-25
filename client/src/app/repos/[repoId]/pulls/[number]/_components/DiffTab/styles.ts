import type { CSSProperties } from "react";

/** Co-located styles for DiffTab (extracted from inline styles). */
export const s = {
  headerRight: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  groups: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  splitBanner: {
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    borderRadius: 7,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  splitTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  splitBody: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  splitList: { margin: "4px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
