import type { CSSProperties } from "react";

export const s = {
  statsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  } satisfies CSSProperties,
  toggleGroup: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
  } satisfies CSSProperties,
  toggleBtn: (active: boolean): CSSProperties => ({
    padding: "5px 13px",
    fontSize: 13,
    fontWeight: 600,
    // The `view.tree`/`view.graph` copy is lowercase (client/messages/en/blast.json);
    // capitalize here rather than in the string, to match the design's "Tree"/"Graph".
    textTransform: "capitalize",
    border: "none",
    borderLeft: "1px solid var(--border)",
    background: active ? "var(--bg-hover)" : "transparent",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    cursor: "pointer",
  }),
  noCallers: {
    fontSize: 13,
    color: "var(--text-muted)",
    padding: "12px 0",
  } satisfies CSSProperties,
  divider: {
    marginTop: 18,
  } satisfies CSSProperties,
} as const;
