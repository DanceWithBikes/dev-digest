import type { CSSProperties } from "react";

export const s = {
  section: { marginTop: 28 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 } satisfies CSSProperties,
  title: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" } satisfies CSSProperties,
  toggleLabel: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "16px 0" } satisfies CSSProperties,
  row: (conflict: boolean): CSSProperties => ({
    padding: "12px 14px",
    marginBottom: 8,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${conflict ? "var(--warn)" : "var(--border-strong)"}`,
    borderRadius: 8,
    background: "var(--bg-surface)",
  }),
  where: { display: "flex", gap: 10, alignItems: "baseline", marginBottom: 8 } satisfies CSSProperties,
  title2: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  takes: { display: "flex", flexWrap: "wrap", gap: 16 } satisfies CSSProperties,
  take: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  missing: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
};
