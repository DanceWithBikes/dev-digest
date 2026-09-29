import type { CSSProperties } from "react";

export const s = {
  viewport: (maxHeight: number | undefined): CSSProperties => ({
    position: "relative",
    maxHeight,
    overflow: maxHeight === undefined ? undefined : "hidden",
  }),
  /** Fades the clipped bottom edge into the card background, so the cut reads
      as "there is more" rather than as a rendering glitch. */
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    background: "linear-gradient(to bottom, transparent, var(--bg-elevated))",
    pointerEvents: "none",
  } satisfies CSSProperties,
  toggleRow: {
    display: "flex",
    justifyContent: "center",
    marginTop: 10,
  } satisfies CSSProperties,
} as const;
