"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalAgentSummary } from "@devdigest/shared";
import { Badge, Button, Sparkline } from "@devdigest/ui";
import { formatRanAt, pct, recallSeries } from "@/lib/eval-metrics";
import { AGENT_GRID, MIN_SPARKLINE_POINTS, SPARKLINE_SIZE } from "../../constants";
import { s } from "../../styles";

export function AgentEvalRow({
  agent,
  runnable,
  starting,
  onRun,
}: {
  agent: EvalAgentSummary;
  runnable: boolean;
  /** A run was just requested from this page and has not been acknowledged yet. */
  starting: boolean;
  onRun: (agentId: string) => void;
}) {
  const t = useTranslations("eval.dashboard");
  const batch = agent.latest_batch;
  const running = starting || batch?.status === "running";
  const series = recallSeries(agent.trend);
  const done = batch?.status === "done";

  return (
    <div style={s.row(AGENT_GRID)} role="row">
      <span style={s.ellipsis} title={agent.name}>{agent.name}</span>
      <span style={s.modelCell} title={agent.model}>
        <Badge mono style={s.modelBadge}>{agent.model}</Badge>
      </span>
      <span style={s.muted}>
        {batch
          ? t("latest", {
              version: batch.agent_version,
              date: formatRanAt(batch.ran_at, false),
              passed: batch.cases_passed,
              total: batch.cases_total,
            })
          : t("noBatch")}
      </span>
      <span>
        {series.length >= MIN_SPARKLINE_POINTS && <Sparkline data={series} {...SPARKLINE_SIZE} />}
      </span>
      <span style={s.mono}>{done ? pct(batch.recall) : ""}</span>
      <span style={s.mono}>{done ? pct(batch.precision) : ""}</span>
      <span style={s.mono}>{done ? pct(batch.citation_accuracy) : ""}</span>
      <Link href={`/agents/${agent.agent_id}?tab=evals`} style={s.link}>
        {t("openEvals")}
      </Link>
      <Button size="sm" icon="Play" loading={running} disabled={!runnable} onClick={() => onRun(agent.agent_id)}>
        {t("run")}
      </Button>
    </div>
  );
}
