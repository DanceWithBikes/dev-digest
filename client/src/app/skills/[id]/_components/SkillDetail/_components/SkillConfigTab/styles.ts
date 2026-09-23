import type { CSSProperties } from "react";

/** Co-located styles for SkillConfigTab. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 } satisfies CSSProperties,
} as const;
