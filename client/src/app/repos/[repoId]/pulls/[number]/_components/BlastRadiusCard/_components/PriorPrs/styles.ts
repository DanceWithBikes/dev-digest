import type { CSSProperties } from "react";

export const s = {
  wrap: {
    marginTop: 18,
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "11px 14px",
    cursor: "pointer",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  headerIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  title: {
    fontSize: 13.5,
    fontWeight: 600,
  } satisfies CSSProperties,
  spacer: {
    flex: 1,
  } satisfies CSSProperties,
  body: {
    padding: "0 14px 14px",
  } satisfies CSSProperties,
  error: {
    fontSize: 12.5,
    color: "var(--crit)",
    margin: "12px 0 0",
  } satisfies CSSProperties,
  empty: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: "12px 0 0",
  } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  row: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    padding: "10px 0",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  prNumber: {
    fontSize: 12.5,
    color: "var(--accent-text)",
    textDecoration: "none",
  } satisfies CSSProperties,
  prTitle: {
    fontSize: 13,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  prMeta: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  prNotes: {
    flexBasis: "100%",
    fontSize: 12,
    color: "var(--text-secondary)",
    fontStyle: "italic",
  } satisfies CSSProperties,
} as const;
