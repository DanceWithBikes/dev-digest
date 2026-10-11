import type { CSSProperties } from "react";

export const s = {
  top: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  meta: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  sub: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: "10px 0",
    marginBottom: 16,
    borderTop: "1px solid var(--border)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  subTitle: { fontSize: 14, fontWeight: 600, minWidth: 0 } satisfies CSSProperties,
  subStats: { fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
};
