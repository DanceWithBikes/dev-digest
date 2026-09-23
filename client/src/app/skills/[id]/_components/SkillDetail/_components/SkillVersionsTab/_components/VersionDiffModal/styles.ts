import type { CSSProperties } from "react";

/** Co-located styles for VersionDiffModal. */
export const s = {
  body: { padding: "16px 20px" } satisfies CSSProperties,
  identical: {
    padding: "24px 4px",
    textAlign: "center",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
