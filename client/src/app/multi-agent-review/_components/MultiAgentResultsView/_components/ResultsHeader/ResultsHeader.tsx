/* ResultsHeader — title, meta line, "Configure run", the view toggle and the
   "#n title · N agents · parallel · Ts total · $C" subheader. */
import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { MultiAgentRun } from "@devdigest/shared";
import type { ResultsView } from "../../../../helpers";
import { ViewToggle } from "../ViewToggle";
import { s } from "./styles";

export function ResultsHeader({
  run,
  view,
  onViewChange,
  onConfigure,
}: {
  run: MultiAgentRun;
  view: ResultsView;
  onViewChange: (v: ResultsView) => void;
  onConfigure: () => void;
}) {
  const t = useTranslations("runs");
  const cost = run.total_cost_usd == null ? t("page.none") : `$${run.total_cost_usd.toFixed(2)}`;
  return (
    <>
      <div style={s.top}>
        <div>
          <h1 style={s.h1}>{t("page.title")}</h1>
          <div style={s.meta}>{t("page.meta", { count: run.columns.length })}</div>
        </div>
        <div style={s.actions}>
          <ViewToggle value={view} onChange={onViewChange} />
          <Button kind="secondary" icon="Settings" onClick={onConfigure}>
            {t("page.configureRun")}
          </Button>
        </div>
      </div>
      <div style={s.sub}>
        <span style={s.subTitle}>
          {run.pr_number != null ? `#${run.pr_number} ` : ""}
          {run.pr_title ?? ""}
        </span>
        <span className="tnum" style={s.subStats}>
          {t("page.summary", {
            count: run.agent_count,
            duration: (run.total_duration_ms / 1000).toFixed(1),
            cost,
          })}{" "}
          {run.cost_partial && <Badge color="var(--warn)">{t("page.partial")}</Badge>}
        </span>
      </div>
    </>
  );
}
