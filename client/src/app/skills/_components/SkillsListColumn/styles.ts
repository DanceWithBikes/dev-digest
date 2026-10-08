import type { CSSProperties } from "react";
import { LIST_WIDTH } from "./constants";

/** Co-located styles for SkillsListColumn. */
export const s = {
  column: {
    width: LIST_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    overflowY: "auto",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  h1: { fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em", flex: 1 } satisfies CSSProperties,
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
