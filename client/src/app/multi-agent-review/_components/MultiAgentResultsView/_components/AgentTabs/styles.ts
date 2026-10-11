import type { CSSProperties } from "react";

export const s = {
  wrap: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-surface)" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  panel: { padding: 16, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)", margin: 0, whiteSpace: "pre-wrap" } satisfies CSSProperties,
  stat: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 600 } satisfies CSSProperties,
  markers: { margin: 0, padding: 0 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)", whiteSpace: "pre-wrap" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
};
