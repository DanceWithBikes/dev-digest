import type { CSSProperties } from "react";

/** Styles shared by the wizard shell and its steps. */
export const s = {
  stepper: { padding: "14px 24px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  body: { padding: 24, minHeight: 320, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  muted: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  error: {
    fontSize: 13,
    color: "var(--crit)",
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    borderRadius: 8,
    padding: "10px 12px",
  } satisfies CSSProperties,
  card: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 8,
    cursor: "pointer",
    background: selected ? "var(--accent-bg)" : "transparent",
    border: "1px solid " + (selected ? "var(--accent)" : "var(--border)"),
  }),
  cardTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  cardBody: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
  sectionLabel: { fontSize: 11, letterSpacing: 0.4, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
} as const;
