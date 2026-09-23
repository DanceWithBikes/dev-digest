import type { CSSProperties } from "react";

/** Co-located styles for ConfirmDialog. */
export const s = {
  body: {
    padding: "18px 24px",
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  } satisfies CSSProperties,
} as const;
