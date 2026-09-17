import type { CSSProperties } from "react";
import { POPOVER_MAX_HEIGHT, POPOVER_WIDTH, POPOVER_Z } from "./constants";

/** Co-located styles for the findings-summary components. */
export const s = {
  // ---- SeverityCounts (read-only icon + number groups) ----
  countsRow: { display: "inline-flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  countGroup: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 12,
    fontWeight: 600,
    color,
  }),

  // ---- SeverityPills (clickable filter) ----
  pillRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  pill: (color: string, bg: string, active: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "3px 9px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color,
    background: active ? bg : "transparent",
    border: `1px solid ${active ? color : "var(--border)"}`,
    cursor: "pointer",
    transition: "background .12s, border-color .12s",
  }),
  pillSep: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,

  // ---- FindingsPopover ----
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    width: "fit-content",
    cursor: "help",
  } satisfies CSSProperties,
  muted: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  panel: (top: number, left: number, visible: boolean): CSSProperties => ({
    position: "fixed",
    top,
    left,
    width: POPOVER_WIDTH,
    maxHeight: POPOVER_MAX_HEIGHT,
    overflowY: "auto",
    zIndex: POPOVER_Z,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: "10px 12px",
    textAlign: "left",
    cursor: "default",
    animation: "ddpop .12s ease",
    // Measured before it can be placed — render it hidden for that first frame.
    visibility: visible ? "visible" : "hidden",
  }),
  panelTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  item: (first: boolean): CSSProperties => ({
    padding: first ? "0 0 8px" : "8px 0",
    borderTop: first ? "none" : "1px solid var(--border)",
  }),
  itemHead: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: 5,
  } satisfies CSSProperties,
  itemFile: { fontSize: 11.5, color: "var(--accent-text)" } satisfies CSSProperties,
  itemBody: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
    marginTop: 5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
} as const;
