import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 28px 48px", maxWidth: 980 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
};
