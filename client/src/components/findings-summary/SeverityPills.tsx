/* SeverityPills — "N CRITICAL · N WARNING · N SUGGESTION" as a single-select
   filter. Only severities that are actually present get a pill, so the row
   doubles as the run's severity breakdown. Clicking the active pill clears it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, type Severity as UiSeverity } from "@devdigest/ui";
import type { Severity, PrSeverityCounts } from "@devdigest/shared";
import { COUNT_KEY, LABEL_KEY } from "./constants";
import { presentSeverities } from "./helpers";
import { s } from "./styles";

export function SeverityPills({
  counts,
  active,
  onToggle,
}: {
  counts: PrSeverityCounts;
  active: Severity | null;
  onToggle: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const present = presentSeverities(counts);
  if (present.length === 0) return null;
  return (
    <div style={s.pillRow} role="group" aria-label={t("findingsSummary.filterGroup")}>
      {present.map((sev, i) => {
        const meta = SEV[sev as UiSeverity];
        const I = Icon[meta.icon];
        const isActive = active === sev;
        const label = t(`severity.${LABEL_KEY[sev]}`);
        return (
          <React.Fragment key={sev}>
            {i > 0 && (
              <span aria-hidden style={s.pillSep}>
                ·
              </span>
            )}
            <button
              type="button"
              aria-pressed={isActive}
              title={
                isActive
                  ? t("findingsSummary.filterClear")
                  : t("findingsSummary.filterOnly", { severity: label })
              }
              onClick={() => onToggle(sev)}
              style={s.pill(meta.c, meta.bg, isActive)}
            >
              <I size={12} />
              <span className="tnum">{counts[COUNT_KEY[sev]]}</span>
              {label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
