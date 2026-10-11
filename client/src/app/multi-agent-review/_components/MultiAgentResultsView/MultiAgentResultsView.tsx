/* MultiAgentResultsView — /multi-agent-review/[id]: one parent run, one result
   per agent side by side (Columns) or one at a time (Tabs, `?view=`), the
   shared run trace drawer, and the disagreement table underneath. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { AgentColumn as AgentColumnData, FindingActionKind } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RunTraceDrawer } from "@/components/run-trace-drawer";
import { ApiError } from "@/lib/api";
import { useMultiAgentFindingAction, useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { parseResultsView, type ResultsView } from "../../helpers";
import { AgentColumns } from "./_components/AgentColumns";
import { AgentTabs } from "./_components/AgentTabs";
import { DisagreementSection } from "./_components/DisagreementSection";
import { ResultsHeader } from "./_components/ResultsHeader";
import { s } from "./styles";

export function MultiAgentResultsView({ id }: { id: string }) {
  const t = useTranslations("runs");
  const router = useRouter();
  const search = useSearchParams();
  const { data: run, isLoading, error, refetch } = useMultiAgentRun(id);
  const action = useMultiAgentFindingAction(id, run?.pr_id);
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);
  const view = parseResultsView(search.get("view"));

  const setView = (next: ResultsView) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("view", next);
    router.replace(`/multi-agent-review/${id}?${sp.toString()}`, { scroll: false });
  };

  const onAction = (findingId: string, act: FindingActionKind) => {
    if (act === "accept" || act === "dismiss" || act === "learn") {
      action.mutate({ findingId, action: act });
    }
  };
  const onStreamEnd = React.useCallback(() => {
    void refetch();
  }, [refetch]);

  const crumb = [
    { label: t("page.crumb"), href: "/multi-agent-review" },
    ...(run?.pr_number != null ? [{ label: `#${run.pr_number}` }] : []),
  ];

  if (error instanceof ApiError && error.status === 404) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Layers"
          title={t("page.notFound.title")}
          body={t("page.notFound.body")}
          cta={t("page.notFound.cta")}
          onCta={() => router.push("/multi-agent-review")}
        />
      </AppShell>
    );
  }
  if (error) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        </div>
      </AppShell>
    );
  }
  if (isLoading || !run) {
    return (
      <AppShell crumb={crumb}>
        <div style={{ ...s.page, ...s.loading }}>
          <Skeleton height={28} width={260} />
          <Skeleton height={240} />
        </div>
      </AppShell>
    );
  }

  const traceColumn = run.columns.find((c: AgentColumnData) => c.run_id === traceRunId);
  const onViewTrace = (c: AgentColumnData) => setTraceRunId(c.run_id);

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <ResultsHeader
          run={run}
          view={view}
          onViewChange={setView}
          onConfigure={() => router.push(`/multi-agent-review/new?pr=${run.pr_id}`)}
        />
        {view === "tabs" ? (
          <AgentTabs
            columns={run.columns}
            pendingAction={action.isPending}
            onAction={onAction}
            onViewTrace={onViewTrace}
          />
        ) : (
          <AgentColumns
            columns={run.columns}
            pendingAction={action.isPending}
            onAction={onAction}
            onViewTrace={onViewTrace}
            onStreamEnd={onStreamEnd}
            traceRunId={traceRunId}
            prNumber={run.pr_number}
            onCloseTrace={() => setTraceRunId(null)}
          />
        )}
        <DisagreementSection groups={run.groups} columns={run.columns} />
      </div>
      {/* In Columns mode a running column owns the drawer (it shares its stream). */}
      {traceColumn && !(view === "columns" && traceColumn.status === "running") && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          agentName={traceColumn.agent_name}
          prNumber={run.pr_number}
          findings={traceColumn.findings}
          running={traceColumn.status === "queued" || traceColumn.status === "running"}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </AppShell>
  );
}
