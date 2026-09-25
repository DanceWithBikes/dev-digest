import type { CSSProperties } from "react";

/** Co-located styles for IntentCard — markup lifted from the design bundle's
   `IntentBlock`, plus confidence/sources/re-run built from primitives. */
export const s = {
  rerunWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  outOfDate: {
    fontSize: 12,
    color: "var(--warn)",
  } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    lineHeight: 1.5,
    fontStyle: "italic",
    color: "var(--text-primary)",
    marginBottom: 14,
  } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 18,
  } satisfies CSSProperties,
  inScopeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--ok)",
    marginBottom: 7,
  } satisfies CSSProperties,
  outOfScopeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 7,
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 5,
    margin: 0,
    padding: 0,
  } satisfies CSSProperties,
  inScopeItem: {
    display: "flex",
    gap: 7,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  outOfScopeItem: {
    display: "flex",
    gap: 7,
    fontSize: 12.5,
    color: "var(--text-muted)",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  inScopeBullet: {
    color: "var(--ok)",
    marginTop: 1,
  } satisfies CSSProperties,
  outOfScopeBullet: {
    color: "var(--text-muted)",
    marginTop: 1,
  } satisfies CSSProperties,
  outOfScopeEmpty: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
  warningsWrap: {
    marginTop: 14,
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,
  warnLine: {
    fontSize: 12,
    color: "var(--warn)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
  /** An absence worth stating, not a failure: its own centred footer row under
      a hairline, icon + label — readable at a glance, but never the warn
      colour, because nothing went wrong. */
  noteRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    fontSize: 12.5,
    fontWeight: 500,
    color: "var(--text-secondary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,
} as const;
