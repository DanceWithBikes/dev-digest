/* EvalMetrics — recall / precision / citation / cases-passed of the newest done
   batch, each with its delta in percentage points versus the previous done batch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard } from "@devdigest/ui";
import type { EvalBatch } from "@devdigest/shared";
import { formatDeltaPp, latestTwoDone, pct } from "@/lib/eval-metrics";
import { metricDelta } from "../../helpers";
import { s } from "./styles";

export function EvalMetrics({ batches }: { batches: EvalBatch[] }) {
  const t = useTranslations("eval");
  const { newest, previous } = latestTwoDone(batches);

  if (!newest) return <p style={s.empty}>{t("evalsTab.noRuns")}</p>;

  const cards = [
    { label: t("evalsTab.cardRecall"), key: "recall" },
    { label: t("evalsTab.cardPrecision"), key: "precision" },
    { label: t("evalsTab.cardCitation"), key: "citation_accuracy" },
  ] as const;

  return (
    <div style={s.row}>
      {cards.map((c) => (
        <MetricCard
          key={c.key}
          label={c.label}
          value={pct(newest[c.key])}
          delta={metricDelta(newest, previous, c.key)}
          formatDelta={(abs) => formatDeltaPp(abs, { signed: false })}
        />
      ))}
      <MetricCard label={t("evalsTab.cardPassed")} value={`${newest.cases_passed}/${newest.cases_total}`} />
    </div>
  );
}
