import type { CSSProperties } from "react";

/** Co-located styles for the Onboarding Tour page and its sections. */
export const s = {
  page: { display: "flex", gap: 28, padding: "24px 28px 40px", maxWidth: 1080, margin: "0 auto" } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,

  // Header
  header: { display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repoName: { color: "var(--accent-text)" } satisfies CSSProperties,
  meta: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 5 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } satisfies CSSProperties,
  copied: { fontSize: 12, color: "var(--ok)" } satisfies CSSProperties,

  // Banners
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    fontSize: 13,
    color: "var(--text-secondary)",
    marginBottom: 10,
  } satisfies CSSProperties,
  bannerWarn: { borderColor: "var(--warn)" } satisfies CSSProperties,
  bannerLink: { color: "var(--accent-text)", textDecoration: "underline", marginLeft: 4 } satisfies CSSProperties,

  // TOC
  tocWrap: { width: 180, flexShrink: 0 } satisfies CSSProperties,
  toc: { position: "sticky", top: 16 } satisfies CSSProperties,
  tocTitle: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 10 } satisfies CSSProperties,
  tocLink: (active: boolean) =>
    ({
      display: "block",
      fontSize: 12.5,
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
      fontWeight: active ? 600 : 500,
      padding: "5px 0 5px 11px",
      marginLeft: -2,
      borderLeft: `2px solid ${active ? "var(--accent)" : "transparent"}`,
    }) satisfies CSSProperties,

  // Section card
  section: { border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", marginBottom: 14, overflow: "hidden", scrollMarginTop: 16 } satisfies CSSProperties,
  sectionHead: { display: "flex", alignItems: "center", gap: 10, padding: "13px 16px" } satisfies CSSProperties,
  sectionIcon: { width: 28, height: 28, borderRadius: 7, background: "var(--accent-bg)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 } satisfies CSSProperties,
  sectionTitle: { fontSize: 14.5, fontWeight: 600 } satisfies CSSProperties,
  sectionBody: { padding: "0 16px 16px", fontSize: 13.5, lineHeight: 1.6, color: "var(--text-secondary)" } satisfies CSSProperties,
  notice: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  // Lists
  list: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", gap: 11 } satisfies CSSProperties,
  num: { width: 20, height: 20, borderRadius: 99, background: "var(--accent-bg)", color: "var(--accent)", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  rowMain: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  path: { fontSize: 12.5, color: "var(--text-primary)", wordBreak: "break-all" } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  openLink: { fontSize: 12.5, color: "var(--accent-text)", textDecoration: "underline", flexShrink: 0 } satisfies CSSProperties,

  // Directories
  dirs: { marginTop: 14 } satisfies CSSProperties,
  dirsTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 } satisfies CSSProperties,
  dirRow: { display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 } satisfies CSSProperties,
  dirCount: { color: "var(--text-muted)" } satisfies CSSProperties,

  // Run steps
  step: { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 7, background: "var(--code-bg)", border: "1px solid var(--border)" } satisfies CSSProperties,
  stepNum: { fontSize: 11, color: "var(--text-muted)", width: 14 } satisfies CSSProperties,
  command: { fontSize: 12, color: "var(--text-primary)", wordBreak: "break-all" } satisfies CSSProperties,
  source: { fontSize: 11, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  risky: { fontSize: 11, fontWeight: 600, color: "var(--warn)", border: "1px solid var(--warn)", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" } satisfies CSSProperties,

  // Tasks
  tasks: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 } satisfies CSSProperties,
  task: { padding: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  taskTitle: { fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: "var(--text-primary)" } satisfies CSSProperties,
  taskDesc: { fontSize: 12.5, lineHeight: 1.5 } satisfies CSSProperties,

  // Diagram
  diagramScroll: { overflowX: "auto", marginTop: 12 } satisfies CSSProperties,
  diagram: { display: "block", width: "100%", height: "auto", background: "var(--bg-primary)", borderRadius: 8, border: "1px solid var(--border)" } satisfies CSSProperties,
  diagramBox: { fill: "var(--bg-surface)", stroke: "var(--border-strong)", strokeWidth: 1.25 } satisfies CSSProperties,
  diagramLabel: { fontSize: 13, fill: "var(--text-primary)" } satisfies CSSProperties,
  diagramEdge: { stroke: "var(--text-muted)", strokeWidth: 1.25 } satisfies CSSProperties,
  diagramWeight: { fontSize: 11, fill: "var(--text-muted)" } satisfies CSSProperties,
} as const;
