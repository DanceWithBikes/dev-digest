/* EvalTrendChart — recall / precision / citation across the done batches,
   labelled by agent version, with a version + cost tooltip. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart } from "@devdigest/ui";
import type { EvalBatch } from "@devdigest/shared";
import { formatCost, trendSeries } from "@/lib/eval-metrics";
import { TREND_SERIES } from "../../constants";
import { dot, s } from "./styles";

export function EvalTrendChart({ batches }: { batches: EvalBatch[] }) {
  const t = useTranslations("eval");
  const trend = trendSeries(batches);
  if (trend.batches.length === 0) return null;

  const series = TREND_SERIES.map((x) => ({ name: t(x.labelKey), color: x.color, data: trend[x.key] }));

  return (
    <div style={s.section}>
      <h3 style={s.h3}>{t("evalsTab.trendTitle")}</h3>
      <div style={s.legend}>
        {series.map((x) => (
          <span key={x.name} style={s.legendItem}>
            <span style={dot(x.color)} />
            {x.name}
          </span>
        ))}
      </div>
      <LineChart
        series={series}
        xLabels={trend.xLabels}
        yMin={0}
        yMax={1}
        renderTooltip={(i) => {
          const b = trend.batches[i];
          if (!b) return null;
          return (
            <div style={s.tooltip}>
              {t("evalsTab.trendTooltip", { version: b.agent_version, cost: formatCost(b.cost_usd) })}
            </div>
          );
        }}
      />
    </div>
  );
}
