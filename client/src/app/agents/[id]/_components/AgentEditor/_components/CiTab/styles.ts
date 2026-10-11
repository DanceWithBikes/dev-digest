import type { CSSProperties } from "react";

/** Co-located styles for the CI tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: -12 } satisfies CSSProperties,
  list: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  muted: { padding: 14, fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  addRepo: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--accent)",
    background: "transparent",
    border: "none",
    borderTop: "1px solid var(--border)",
    cursor: "pointer",
    textDecoration: "none",
    boxSizing: "border-box",
  } satisfies CSSProperties,
  failOnNote: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
  failOnBox: { maxWidth: 360 } satisfies CSSProperties,
  link: { color: "var(--accent)", fontSize: 13, textDecoration: "none" } satisfies CSSProperties,
} as const;
