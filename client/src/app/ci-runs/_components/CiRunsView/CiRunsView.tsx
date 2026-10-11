"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SelectInput } from "@devdigest/ui";
import type { CiRun, CiRunStatus, CiRunsQuery } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { useAgents } from "@/lib/hooks/agents";
import { useCiRuns } from "@/lib/hooks/ci";
import { useRepos } from "@/lib/hooks/core";
import { safeHttpUrl } from "@/lib/github-urls";
import { HEAD_KEYS, RUN_GRID, STATUS_COLOR, STATUS_VALUES, WINDOW_LABEL_KEY, WINDOW_VALUES } from "./constants";
import { NO_VALUE, blockersToShow, formatCost, formatDuration, prLabel } from "./helpers";
import { s } from "./styles";

function RunRow({ run }: { run: CiRun }) {
  const t = useTranslations("ci.runs");
  const blockers = blockersToShow(run);
  const job = safeHttpUrl(run.job_url);
  // Every value below is a plain text node — never markdown or HTML (AC-113).
  return (
    <div style={s.row(RUN_GRID)} role="row" data-testid="ci-run-row">
      <span style={s.mono} role="cell">{run.repository}</span>
      <span role="cell">{prLabel(run.pr_number)}</span>
      <span role="cell">{run.agent ?? NO_VALUE}</span>
      <span style={s.verdictCell} role="cell">
        <span style={s.status(STATUS_COLOR[run.status])} data-testid="ci-run-status">{t(`status.${run.status}`)}</span>
        <span style={s.muted}>{run.verdict ? t(`verdict.${run.verdict}`) : NO_VALUE}</span>
        {blockers !== null && <span style={s.muted}>{t("blockers", { count: blockers })}</span>}
      </span>
      <span role="cell">{run.findings_count ?? NO_VALUE}</span>
      <span role="cell" data-testid="ci-run-cost">{formatCost(run.cost_usd)}</span>
      <span role="cell">{formatDuration(run.duration_ms)}</span>
      <span role="cell">
        {job ? (
          <a href={job} target="_blank" rel="noopener noreferrer" style={s.link}>
            {t("view")}
          </a>
        ) : (
          NO_VALUE
        )}
      </span>
    </div>
  );
}

export function CiRunsView({ initialAgentId }: { initialAgentId: string }) {
  const t = useTranslations("ci.runs");
  const [timeWindow, setTimeWindow] = React.useState<CiRunsQuery["window"]>("7d");
  const [agentId, setAgentId] = React.useState(initialAgentId);
  const [repo, setRepo] = React.useState("");
  const [status, setStatus] = React.useState<CiRunStatus | "">("");
  const [page, setPage] = React.useState(1);

  const { data: agents } = useAgents();
  const { data: repos } = useRepos();
  const runs = useCiRuns({
    window: timeWindow,
    agent_id: agentId || undefined,
    repo: repo || undefined,
    status: status || undefined,
    page,
  });

  // A changed filter always starts again from page 1.
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const list = runs.data?.runs ?? [];
  const warnings = runs.data?.warnings ?? [];

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <PageContainer
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button kind="secondary" size="sm" icon="RefreshCw" disabled={runs.isFetching} onClick={() => void runs.refetch()}>
            {runs.isFetching ? t("refreshing") : t("refresh")}
          </Button>
        }
      >
        <div style={s.filters} role="group" aria-label={t("title")}>
          <div style={s.filter}>
            <SelectInput
              mono={false}
              value={timeWindow}
              onChange={filter((v: string) => setTimeWindow(v as CiRunsQuery["window"]))}
              options={WINDOW_VALUES.map((v) => ({ value: v, label: t(`filters.${WINDOW_LABEL_KEY[v]}`) }))}
            />
          </div>
          <div style={s.filter}>
            <SelectInput
              mono={false}
              value={agentId}
              onChange={filter(setAgentId)}
              options={[{ value: "", label: t("filters.allAgents") }, ...(agents ?? []).map((a) => ({ value: a.id, label: a.name }))]}
            />
          </div>
          <div style={s.filter}>
            <SelectInput
              mono={false}
              value={repo}
              onChange={filter(setRepo)}
              options={[{ value: "", label: t("filters.allRepos") }, ...(repos ?? []).map((r) => ({ value: r.full_name, label: r.full_name }))]}
            />
          </div>
          <div style={s.filter}>
            <SelectInput
              mono={false}
              value={status}
              onChange={filter((v: string) => setStatus(v as CiRunStatus | ""))}
              options={[{ value: "", label: t("filters.allStatuses") }, ...STATUS_VALUES.map((v) => ({ value: v, label: t(`status.${v}`) }))]}
            />
          </div>
        </div>

        {warnings.length > 0 && (
          <div style={s.warnings} role="status" data-testid="ci-run-warnings">
            <strong>{t("warningTitle")}</strong>
            {warnings.map((w) => (
              <span key={`${w.repo}:${w.message}`}>{t("warning", { repo: w.repo, message: w.message })}</span>
            ))}
          </div>
        )}

        {runs.isLoading && <div style={{ ...s.muted, ...s.hint }}>{t("loading")}</div>}
        {runs.isError && <ErrorState title={t("loadFailed")} body={runs.error.message} onRetry={() => void runs.refetch()} />}
        {runs.isSuccess && list.length === 0 && <EmptyState icon="Workflow" title={t("emptyTitle")} body={t("emptyBody")} />}
        {list.length > 0 && (
          <>
            <div style={s.list} role="table">
              <div style={s.headRow(RUN_GRID)} role="row">
                {HEAD_KEYS.map((k) => (
                  <span key={k} role="columnheader">{t(`table.${k}`)}</span>
                ))}
              </div>
              {list.map((run) => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
            <div style={s.pager}>
              <span style={s.muted}>{t("pager.page", { page })}</span>
              <Button kind="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {t("pager.previous")}
              </Button>
              <Button kind="secondary" size="sm" disabled={!runs.data?.has_more} onClick={() => setPage((p) => p + 1)}>
                {t("pager.next")}
              </Button>
            </div>
          </>
        )}
      </PageContainer>
    </AppShell>
  );
}
