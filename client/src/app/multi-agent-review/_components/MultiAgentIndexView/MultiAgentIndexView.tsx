/* MultiAgentIndexView — /multi-agent-review: parallel runs, newest first. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useMultiAgentRuns } from "@/lib/hooks/multi-agent";
import { formatSecondsCost } from "../../helpers";
import { s } from "./styles";

const STATUS_COLOR = {
  running: "var(--warn)",
  done: "var(--ok)",
  failed: "var(--crit)",
  partial: "var(--warn)",
} as const;

export function MultiAgentIndexView() {
  const t = useTranslations("runs");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useMultiAgentRuns();
  const goConfigure = () => router.push("/multi-agent-review/new");

  let body: React.ReactNode;
  if (isError) {
    body = <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  } else if (isLoading || !data) {
    body = (
      <div style={s.loading}>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  } else if (data.length === 0) {
    body = (
      <EmptyState
        icon="Layers"
        title={t("page.empty.title")}
        body={t("page.empty.body")}
        cta={t("page.empty.cta")}
        onCta={goConfigure}
      />
    );
  } else {
    body = (
      <div style={s.list}>
        {data.map((r) => (
          <Link key={r.id} href={`/multi-agent-review/${r.id}`} data-run-row style={s.row}>
            <span style={s.title}>
              {r.pr_number != null ? `#${r.pr_number} ` : ""}
              {r.pr_title ?? ""}
            </span>
            <span style={s.meta}>{t("page.index.agents", { count: r.agent_count })}</span>
            <Badge color={STATUS_COLOR[r.status]} dot>
              {t(`page.index.status.${r.status}`)}
            </Badge>
            <span className="tnum" style={s.meta}>
              {formatSecondsCost(r.total_duration_ms, r.total_cost_usd, t("page.none"))}
              {r.cost_partial ? ` · ${t("page.partial")}` : ""}
            </span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <p style={s.subtitle}>{t("page.index.subtitle")}</p>
          </div>
          {data && data.length > 0 && (
            <Button kind="primary" icon="Plus" onClick={goConfigure}>
              {t("page.configureRun")}
            </Button>
          )}
        </div>
        {body}
      </div>
    </AppShell>
  );
}
