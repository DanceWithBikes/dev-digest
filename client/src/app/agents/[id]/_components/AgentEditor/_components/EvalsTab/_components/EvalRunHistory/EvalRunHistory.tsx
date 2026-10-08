/* EvalRunHistory — every batch, newest first. Tick exactly two and Compare opens
   the side-by-side view. Provider error text is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalBatch } from "@devdigest/shared";
import { formatCost, formatRanAt, newestFirst, pct } from "@/lib/eval-metrics";
import { CompareRunsModal } from "../CompareRunsModal";
import { s } from "./styles";

const COLUMNS = ["version", "ranAt", "status", "recall", "precision", "citation", "passed", "cost"] as const;

export function EvalRunHistory({ batches }: { batches: EvalBatch[] }) {
  const t = useTranslations("eval");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<[string, string] | null>(null);

  const rows = newestFirst(batches);
  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <div style={s.section}>
      <div style={s.header}>
        <h3 style={s.h3}>{t("evalsTab.runHistory.title")}</h3>
        <Button
          size="sm"
          disabled={selected.length !== 2}
          onClick={() => setComparing([selected[0]!, selected[1]!])}
        >
          {t("evalsTab.compare")}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p style={s.empty}>{t("evalsTab.runHistory.empty")}</p>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th} />
              {COLUMNS.map((c) => (
                <th key={c} style={s.th}>
                  {t(`evalsTab.runHistory.columns.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td style={s.td}>
                  <input
                    type="checkbox"
                    checked={selected.includes(b.id)}
                    onChange={() => toggle(b.id)}
                    aria-label={t("evalsTab.runHistory.select", { version: `v${b.agent_version}` })}
                  />
                </td>
                <td style={s.td}>v{b.agent_version}</td>
                <td style={s.td}>{formatRanAt(b.ran_at)}</td>
                <td style={s.td}>
                  {t(`evalsTab.runHistory.status.${b.status}`)}
                  {b.status === "failed" && b.error && <div style={s.error}>{b.error}</div>}
                </td>
                <td style={s.td}>{pct(b.recall)}</td>
                <td style={s.td}>{pct(b.precision)}</td>
                <td style={s.td}>{pct(b.citation_accuracy)}</td>
                <td style={s.td}>
                  {b.cases_passed}/{b.cases_total}
                </td>
                <td style={s.td}>{formatCost(b.cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {comparing && <CompareRunsModal ids={comparing} onClose={() => setComparing(null)} />}
    </div>
  );
}
