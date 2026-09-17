/* SeverityCounts — read-only "icon N" groups per severity, worst-first.
   Used by the PR list's FINDINGS cell and the PR timeline's run tiles, where
   the counts are information, not a control. Renders nothing when empty. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, type Severity as UiSeverity } from "@devdigest/ui";
import type { PrSeverityCounts } from "@devdigest/shared";
import { COUNT_KEY, LABEL_KEY } from "./constants";
import { presentSeverities } from "./helpers";
import { s } from "./styles";

export function SeverityCounts({
  counts,
  size = 12,
}: {
  counts: PrSeverityCounts;
  size?: number;
}) {
  const t = useTranslations("prReview");
  const present = presentSeverities(counts);
  if (present.length === 0) return null;
  return (
    <span style={s.countsRow}>
      {present.map((sev) => {
        const meta = SEV[sev as UiSeverity];
        const I = Icon[meta.icon];
        const count = counts[COUNT_KEY[sev]];
        const label = t("findingsSummary.countLabel", {
          count,
          severity: t(`severity.${LABEL_KEY[sev]}`),
        });
        return (
          <span key={sev} style={s.countGroup(meta.c)} title={label} aria-label={label}>
            <I size={size} />
            <span className="tnum">{count}</span>
          </span>
        );
      })}
    </span>
  );
}
