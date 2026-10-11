/* AgentTabs — Tabs mode: one tab per agent ("name · score"), a panel with the
   score ring, summary, trace link and the findings as FindingCard accordions. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Tabs } from "@devdigest/ui";
import type { AgentColumn, FindingActionKind } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { formatSecondsCost } from "../../../../helpers";
import { ScoreRing } from "../ScoreRing";
import { s } from "./styles";

export function AgentTabs({
  columns,
  pendingAction,
  onAction,
  onViewTrace,
}: {
  columns: AgentColumn[];
  pendingAction: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  onViewTrace: (column: AgentColumn) => void;
}) {
  const t = useTranslations("runs");
  const [active, setActive] = React.useState<string | null>(null);
  const nameOf = (c: AgentColumn) => c.agent_name ?? t("page.deletedAgent");
  // Derived: fall back to the first column until a tab is picked (or if the
  // picked one is gone).
  const current = columns.find((c) => c.run_id === active) ?? columns[0];
  if (!current) return null;

  return (
    <div style={s.wrap}>
      <Tabs
        value={current.run_id}
        onChange={setActive}
        pad="0 12px"
        tabs={columns.map((c) => ({
          key: c.run_id,
          label: `${nameOf(c)} · ${c.score ?? t("page.none")}`,
        }))}
      />
      {/* One marker per tab (the vendor Tabs renders plain buttons) so e2e can count them. */}
      <ul hidden aria-hidden style={s.markers}>
        {columns.map((c) => (
          <li key={c.run_id} data-agent-tab={c.run_id} />
        ))}
      </ul>
      <div data-agent-panel={current.run_id} style={s.panel}>
        <div style={s.head}>
          <ScoreRing score={current.score} size={44} />
          <span style={s.name}>{nameOf(current)}</span>
          <span style={s.spacer} />
          <span className="tnum" style={s.stat}>
            {formatSecondsCost(current.duration_ms, current.cost_usd, t("page.none"))}
          </span>
          <Button kind="secondary" size="sm" onClick={() => onViewTrace(current)}>
            {t("viewTrace")}
          </Button>
        </div>
        <p style={s.summary}>{current.summary ?? t("tabs.noSummary")}</p>
        {current.status === "failed" && <div style={s.error}>{current.error}</div>}
        {current.status === "queued" || current.status === "running" || current.status === "cancelled" ? (
          <div style={s.muted}>
            {t(`page.columnStatus.${current.status}`)}
          </div>
        ) : current.status === "done" && current.findings.length === 0 ? (
          <div style={s.muted}>{t("column.noFindings")}</div>
        ) : (
          current.findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              showLearn
              pending={pendingAction}
              onAction={(act) => onAction(f.id, act)}
            />
          ))
        )}
      </div>
    </div>
  );
}
