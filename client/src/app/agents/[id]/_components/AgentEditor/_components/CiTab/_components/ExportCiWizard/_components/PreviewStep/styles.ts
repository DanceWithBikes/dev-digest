import type { CSSProperties } from "react";

export const s = {
  split: { display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, minHeight: 280 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  file: (active: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    textAlign: "left",
    padding: "6px 8px",
    borderRadius: 6,
    fontSize: 12.5,
    fontFamily: "var(--font-mono, monospace)",
    cursor: "pointer",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    background: active ? "var(--accent-bg)" : "transparent",
    border: "1px solid " + (active ? "var(--accent)" : "transparent"),
    wordBreak: "break-all",
  }),
  pane: {
    margin: 0,
    padding: 12,
    overflow: "auto",
    maxHeight: 320,
    fontSize: 12,
    fontFamily: "var(--font-mono, monospace)",
    background: "var(--code-bg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
