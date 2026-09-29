import type { CSSProperties } from "react";

export const s = {
  node: {
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 4px",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  symbolIcon: {
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  symbolName: {
    fontSize: 14,
    fontWeight: 700,
  } satisfies CSSProperties,
  spacer: {
    flex: 1,
  } satisfies CSSProperties,
  callerCount: {
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  body: {
    padding: "2px 4px 14px 26px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  empty: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  callerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    borderLeft: "1px solid var(--border)",
    paddingLeft: 12,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  guideIcon: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  callerLink: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  callerText: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
} as const;
