"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, SectionLabel } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { useEvalOverview, useRunEvals } from "@/lib/hooks/evals";
import { notify } from "@/lib/toast";
import { AGENT_GRID } from "./constants";
import { canRunAgent, errorMessage, runnableAgents } from "./helpers";
import { s } from "./styles";
import { AgentEvalRow } from "./_components/AgentEvalRow";
import { RecentRunsTable } from "./_components/RecentRunsTable";

const HEAD = ["agentColumn", "modelColumn", "latestColumn"] as const;

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const { data, isLoading } = useEvalOverview();
  const runEvals = useRunEvals();
  const [starting, setStarting] = React.useState<ReadonlySet<string>>(new Set());

  const agents = data?.agents ?? [];
  const names = new Map(agents.map((a) => [a.agent_id, a.name]));

  async function start(agentId: string) {
    setStarting((p) => new Set(p).add(agentId));
    try {
      await runEvals.mutateAsync(agentId);
    } catch (err) {
      notify.error(t("dashboard.runFailed", { agent: names.get(agentId) ?? agentId, message: errorMessage(err) }));
    } finally {
      setStarting((p) => {
        const n = new Set(p);
        n.delete(agentId);
        return n;
      });
    }
  }

  const toRun = runnableAgents(agents, starting);

  return (
    <AppShell crumb={[{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }]}>
      <PageContainer
        title={t("dashboard.defaultTitle")}
        actions={
          <Button kind="primary" size="sm" icon="Play" disabled={toRun.length === 0} onClick={() => toRun.forEach((a) => void start(a.agent_id))}>
            {t("dashboard.runAll")}
          </Button>
        }
      >
        {isLoading && <div style={{ ...s.muted, ...s.hint }}>{t("dashboard.loading")}</div>}
        {!isLoading && agents.length === 0 && <EmptyState icon="Cpu" title={t("dashboard.empty")} />}
        {agents.length > 0 && (
          <section style={s.section}>
            <div style={s.list} role="table">
              <div style={s.headRow(AGENT_GRID)} role="row">
                {HEAD.map((k) => (
                  <span key={k} role="columnheader">{t(`dashboard.${k}`)}</span>
                ))}
                <span />
                <span>{t("dashboard.metrics.recall")}</span>
                <span>{t("dashboard.metrics.precision")}</span>
                <span>{t("dashboard.metrics.citationAccuracy")}</span>
                <span />
                <span />
              </div>
              {agents.map((a) => (
                <AgentEvalRow
                  key={a.agent_id}
                  agent={a}
                  runnable={canRunAgent(a, starting)}
                  starting={starting.has(a.agent_id)}
                  onRun={(id) => void start(id)}
                />
              ))}
            </div>
          </section>
        )}
        {data && (
          <section style={s.section}>
            <div style={s.sectionHead}>
              <SectionLabel>{t("dashboard.recentRuns")}</SectionLabel>
            </div>
            <RecentRunsTable batches={data.recent_batches} agentNames={names} />
          </section>
        )}
      </PageContainer>
    </AppShell>
  );
}
