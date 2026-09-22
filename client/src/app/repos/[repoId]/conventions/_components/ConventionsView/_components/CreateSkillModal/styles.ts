import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal. */
export const s = {
  body: { display: "flex", flexDirection: "column", gap: 14, padding: "18px 24px" } satisfies CSSProperties,
  explainer: {
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--danger)" } satisfies CSSProperties,
} as const;
