import type { CSSProperties } from "react";

/** Co-located styles for SkillConfigTab. */
export const s = {
  wrap: { maxWidth: 720 } satisfies CSSProperties,
  agentsSection: { marginBottom: 20 } satisfies CSSProperties,
  agentsTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  agentsList: { display: "flex", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  agentsEmpty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  agentChip: {
    fontSize: 12.5,
    color: "var(--text-primary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    padding: "3px 10px",
    borderRadius: 6,
    textDecoration: "none",
  } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, marginTop: 8 } satisfies CSSProperties,
  contextSection: { marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  contextTitle: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  contextHint: { fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 14px" } satisfies CSSProperties,
} as const;
