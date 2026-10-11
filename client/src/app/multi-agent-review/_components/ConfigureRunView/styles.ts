import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 28px 48px", maxWidth: 860 } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6, marginBottom: 24 } satisfies CSSProperties,
  step: { marginBottom: 24 } satisfies CSSProperties,
  stepHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  } satisfies CSSProperties,
  stepTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" } satisfies CSSProperties,
  cards: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    paddingTop: 16,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  total: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  capHint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", marginTop: 12 } satisfies CSSProperties,
};
