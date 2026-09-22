import type { CSSProperties } from "react";

/** Co-located styles for SkillDetail. */
export const s = {
  loading: {
    padding: 28,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "20px 28px 14px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  typePill: (color: string): CSSProperties => ({
    fontSize: 10.5,
    fontWeight: 600,
    color,
    background: color + "1a",
    padding: "1px 7px",
    borderRadius: 4,
  }),
  backLink: {
    marginLeft: "auto",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    textDecoration: "none",
  } satisfies CSSProperties,
  tabBody: { padding: "20px 28px 48px", maxWidth: 940 } satisfies CSSProperties,
  markdown: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 13.5,
    lineHeight: 1.6,
    overflowX: "auto",
  } satisfies CSSProperties,
} as const;
