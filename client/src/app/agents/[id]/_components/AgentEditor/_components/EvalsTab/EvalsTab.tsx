/* EvalsTab — an agent's eval cases, the metrics of its latest scored batch, the
   trend across batches and the run history with a two-batch compare. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCaseRecord } from "@devdigest/shared";
import {
  useDeleteEvalCase,
  useEvalBatches,
  useEvalCases,
  useRunEvals,
} from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { CaseEditorModal } from "./_components/CaseEditorModal";
import { EvalCaseList } from "./_components/EvalCaseList";
import { EvalMetrics } from "./_components/EvalMetrics";
import { EvalRunHistory } from "./_components/EvalRunHistory";
import { EvalTrendChart } from "./_components/EvalTrendChart";
import { hasRunningBatch } from "./helpers";
import { s } from "./styles";

/** `null` = closed, `"new"` = create, a record = edit. */
type EditorTarget = null | "new" | EvalCaseRecord;

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const toast = useToast();
  const cases = useEvalCases(agent.id);
  const batches = useEvalBatches(agent.id);
  const run = useRunEvals();
  const remove = useDeleteEvalCase(agent.id);
  const [editor, setEditor] = React.useState<EditorTarget>(null);

  const caseList = cases.data ?? [];
  const batchList = batches.data ?? [];
  const running = run.isPending || hasRunningBatch(batchList);

  const startRun = () => run.mutate(agent.id, { onSuccess: () => toast.success(t("notifications.runStarted")) });
  const deleteCase = (id: string) =>
    remove.mutate(id, { onSuccess: () => toast.success(t("notifications.caseDeleted")) });

  if (cases.isLoading || batches.isLoading) return <Skeleton height={200} />;
  if (cases.isError || batches.isError) {
    return (
      <ErrorState
        body={(cases.error ?? batches.error)?.message}
        onRetry={() => {
          cases.refetch();
          batches.refetch();
        }}
      />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
        <Button
          kind="primary"
          size="sm"
          icon="Play"
          disabled={caseList.length === 0 || running}
          onClick={startRun}
        >
          {running ? t("evalsTab.runEvalsRunning") : t("evalsTab.runEvals", { count: caseList.length })}
        </Button>
        <Button size="sm" icon="Plus" onClick={() => setEditor("new")}>
          {t("evalsTab.newCase")}
        </Button>
      </div>

      <EvalMetrics batches={batchList} />
      <EvalTrendChart batches={batchList} />
      <EvalCaseList
        cases={caseList}
        onEdit={(c) => setEditor(c)}
        onDelete={deleteCase}
        deleting={remove.isPending}
      />
      <EvalRunHistory batches={batchList} />

      {editor && (
        <CaseEditorModal
          agentId={agent.id}
          record={editor === "new" ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
