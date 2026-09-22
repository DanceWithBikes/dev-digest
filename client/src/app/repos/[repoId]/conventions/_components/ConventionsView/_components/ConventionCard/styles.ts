import type { CSSProperties } from "react";

/** Co-located styles for ConventionCard. */
export const s = {
  card: (accepted: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 16,
    borderRadius: 10,
    border: "1px solid " + (accepted ? "var(--ok)" : "var(--border)"),
    background: "var(--bg-surface)",
  }),
  topRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  categoryPill: (color: string): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    color,
    border: `1px solid ${color}`,
  }),
  confidence: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  rule: { fontSize: 14, lineHeight: 1.5, color: "var(--text-primary)" } satisfies CSSProperties,
  evidence: {
    fontSize: 12,
    color: "var(--text-secondary)",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  snippet: {
    fontSize: 12,
    padding: "8px 10px",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    overflowX: "auto",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 2 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  editFields: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
