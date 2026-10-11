/* ViewToggle — Columns | Tabs segmented control (native buttons). */
import React from "react";
import { useTranslations } from "next-intl";
import type { ResultsView } from "../../../../helpers";

const VIEWS: readonly ResultsView[] = ["columns", "tabs"];

export function ViewToggle({
  value,
  onChange,
}: {
  value: ResultsView;
  onChange: (v: ResultsView) => void;
}) {
  const t = useTranslations("runs");
  return (
    <div
      role="group"
      aria-label={t("page.view.label")}
      style={{
        display: "inline-flex",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          style={{
            padding: "6px 14px",
            border: "none",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            color: value === v ? "var(--text-primary)" : "var(--text-secondary)",
            background: value === v ? "var(--bg-hover)" : "transparent",
          }}
        >
          {t(`page.view.${v}`)}
        </button>
      ))}
    </div>
  );
}
