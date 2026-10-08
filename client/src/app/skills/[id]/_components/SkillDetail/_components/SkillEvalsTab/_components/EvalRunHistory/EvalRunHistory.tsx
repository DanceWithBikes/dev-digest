/* EvalRunHistory — every imported run (candidate and baseline), newest first,
   with a small trend of the candidate runs' average score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LineChart } from "@devdigest/ui";
import type { SkillEvalRunSummary } from "@devdigest/shared";
import { TREND_COLOR } from "../../constants";
import { formatRunDate, formatScore, scoreTrend, shortSha } from "../../helpers";
import { s } from "./styles";

const COLUMNS = ["ranAt", "config", "passed", "avgScore", "gitSha"] as const;

export function EvalRunHistory({ runs }: { runs: SkillEvalRunSummary[] }) {
  const t = useTranslations("skills");
  const trend = scoreTrend(runs);

  return (
    <section style={s.section}>
      <h3 style={s.h3}>{t("evals.history.title")}</h3>

      {trend.data.length > 1 && (
        <>
          <span style={s.trendTitle}>{t("evals.history.trendTitle")}</span>
          <LineChart
            series={[{ name: t("evals.history.trendSeries"), color: TREND_COLOR, data: trend.data }]}
            xLabels={trend.xLabels}
            yMin={0}
            yMax={1}
          />
        </>
      )}

      <table style={s.table}>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} style={s.th}>
                {t(`evals.history.columns.${c}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={`${r.run_id}:${r.config}`}>
              <td style={s.td}>{formatRunDate(r.ran_at)}</td>
              <td style={s.td}>{t(`evals.history.config.${r.config}`)}</td>
              <td style={s.td}>
                {r.passed} / {r.total}
              </td>
              <td style={s.td}>{formatScore(r.avg_score)}</td>
              <td style={s.td} className="mono">
                {shortSha(r.git_sha)}
                {r.dirty && (
                  <span style={s.dirty} title={t("evals.history.dirty")}>
                    {t("evals.history.dirtyMark")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
