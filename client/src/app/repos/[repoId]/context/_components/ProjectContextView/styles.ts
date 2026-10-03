import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView. */
export const s = {
  wrap: { padding: "24px 28px 44px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", flex: 1 } satisfies CSSProperties,
  rootsLine: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  body: { display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 16, minHeight: 420 } satisfies CSSProperties,
  previewPane: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 16,
    minWidth: 0,
  } satisfies CSSProperties,
  previewHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 } satisfies CSSProperties,
  previewPath: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  usedBy: { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  footer: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  chip: { fontSize: 12, padding: "1px 7px", borderRadius: 4, background: "var(--bg-hover)", color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
