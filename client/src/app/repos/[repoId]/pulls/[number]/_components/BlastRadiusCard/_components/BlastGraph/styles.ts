import type { CSSProperties } from "react";
import { COLUMN_WIDTH, NODE_HEIGHT } from "./constants";

export const s = {
  canvas: (width: number, height: number): CSSProperties => ({
    position: "relative",
    width,
    height,
    // Centred in the card; a canvas wider than the card scrolls in `scroller`.
    margin: "0 auto",
  }),
  scroller: {
    width: "100%",
    overflowX: "auto",
  } satisfies CSSProperties,
  svg: {
    position: "absolute",
    top: 0,
    left: 0,
    pointerEvents: "none",
  } satisfies CSSProperties,
  node: (x: number, y: number, borderColor: string): CSSProperties => ({
    position: "absolute",
    left: x,
    top: y,
    width: COLUMN_WIDTH,
    height: NODE_HEIGHT,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 10px",
    borderRadius: 6,
    border: `1.5px solid ${borderColor}`,
    background: "var(--bg-elevated)",
    boxSizing: "border-box",
  }),
  nodeLabel: {
    fontSize: 12.5,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  empty: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "24px 0",
    textAlign: "center",
  } satisfies CSSProperties,
  legend: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
    marginBottom: 16,
    paddingBottom: 14,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  legendItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  legendDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 99,
    background: color,
  }),
} as const;
