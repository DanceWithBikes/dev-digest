import type { CSSProperties } from "react";

export const s = {
  tree: {
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
} as const;
