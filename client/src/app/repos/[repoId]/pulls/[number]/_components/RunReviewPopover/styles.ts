import type { CSSProperties } from "react";

/** Co-located styles for RunReviewPopover. */
export const s = {
  heading: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  } satisfies CSSProperties,
  warning: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--warn)",
    marginBottom: 8,
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 280,
    overflowY: "auto",
  } satisfies CSSProperties,
  row: (enabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 4px",
    opacity: enabled ? 1 : 0.55,
  }),
  model: {
    fontSize: 12,
    color: "var(--text-muted)",
    fontFamily: "var(--font-mono)",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", padding: "0 0 6px" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
};
