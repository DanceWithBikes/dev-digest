import type { CSSProperties } from "react";
import { CARD_GRID_COLS } from "./constants";

/** Co-located styles for ConventionsView. */
export const s = {
  wrap: { padding: "24px 28px 44px" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  sectionLabel: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
    margin: "26px 0 10px",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: CARD_GRID_COLS, gap: 14 } satisfies CSSProperties,
  scanError: {
    marginBottom: 16,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--danger)",
    background: "var(--danger-bg)",
    color: "var(--danger)",
    fontSize: 13,
  } satisfies CSSProperties,
  sampled: { fontSize: 12, color: "var(--text-muted)", marginTop: 10 } satisfies CSSProperties,
  acceptedNote: { fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 } satisfies CSSProperties,
} as const;
