/** Series colours for the trend chart; the legend reuses them. */
export const TREND_SERIES = [
  { key: "recall", labelKey: "dashboard.legend.recall", color: "var(--accent)" },
  { key: "precision", labelKey: "dashboard.legend.precision", color: "var(--ok)" },
  { key: "citation", labelKey: "dashboard.legend.citation", color: "var(--warn)" },
] as const;
