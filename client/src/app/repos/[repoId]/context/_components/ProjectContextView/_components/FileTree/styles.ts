import type { CSSProperties } from "react";

/** Co-located styles for FileTree. */
export const s = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 10,
    minWidth: 0,
    maxHeight: 560,
    overflow: "auto",
  } satisfies CSSProperties,
  dir: { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", margin: "8px 4px 4px", wordBreak: "break-all" } satisfies CSSProperties,
  file: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    textAlign: "left",
    padding: "5px 8px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    color: active ? "var(--accent-text)" : "var(--text-primary)",
    background: active ? "var(--bg-hover)" : "transparent",
  }),
  name: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  tokens: { fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-muted)", padding: 6 } satisfies CSSProperties,
} as const;
