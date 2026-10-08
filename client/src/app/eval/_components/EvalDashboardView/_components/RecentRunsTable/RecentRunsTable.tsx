"use client";

import { useTranslations } from "next-intl";
import type { EvalBatch } from "@devdigest/shared";
import { formatCost, formatRanAt, pct } from "@/lib/eval-metrics";
import { RECENT_GRID } from "../../constants";
import { s } from "../../styles";

const COLUMNS = ["agent", "version", "ranAt", "status", "recall", "precision", "citation", "cost"] as const;

export function RecentRunsTable({ batches, agentNames }: { batches: EvalBatch[]; agentNames: Map<string, string> }) {
  const t = useTranslations("eval.dashboard");

  if (batches.length === 0) return <div style={{ ...s.muted, ...s.hint }}>{t("noRuns")}</div>;

  return (
    <div style={s.list} role="table">
      <div style={s.headRow(RECENT_GRID)} role="row">
        {COLUMNS.map((c) => (
          <span key={c} role="columnheader">{t(`recentColumns.${c}`)}</span>
        ))}
      </div>
      {batches.map((b) => (
        <div key={b.id} style={s.row(RECENT_GRID)} role="row">
          <span style={s.ellipsis}>{agentNames.get(b.agent_id) ?? b.agent_id}</span>
          <span style={s.mono}>v{b.agent_version}</span>
          <span style={s.muted}>{formatRanAt(b.ran_at)}</span>
          <span style={s.muted} title={b.status === "failed" ? (b.error ?? undefined) : undefined}>{b.status}</span>
          <span style={s.mono}>{pct(b.recall)}</span>
          <span style={s.mono}>{pct(b.precision)}</span>
          <span style={s.mono}>{pct(b.citation_accuracy)}</span>
          <span style={s.mono}>{formatCost(b.cost_usd)}</span>
        </div>
      ))}
    </div>
  );
}
