import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24 } satisfies CSSProperties,
  preview: { marginBottom: 20 } satisfies CSSProperties,
  previewMeta: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", overflowWrap: "anywhere" } satisfies CSSProperties,
  expHeader: { display: "flex", alignItems: "center", marginBottom: 8 } satisfies CSSProperties,
  expTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", flex: 1 } satisfies CSSProperties,
  row: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    alignItems: "end",
    padding: 12,
    marginBottom: 10,
    borderRadius: 9,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerMsg: { flex: 1, display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  invalid: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
