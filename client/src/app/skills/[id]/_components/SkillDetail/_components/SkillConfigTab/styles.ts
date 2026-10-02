import type { CSSProperties } from "react";

/** Co-located styles for SkillConfigTab. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 } satisfies CSSProperties,
  contextSection: { marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  contextTitle: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  contextHint: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 14px" } satisfies CSSProperties,
} as const;
