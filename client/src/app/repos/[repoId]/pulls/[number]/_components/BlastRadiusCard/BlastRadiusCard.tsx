/* BlastRadiusCard — L04: which callers, HTTP endpoints and crons a PR's
   changed symbols can affect, read from repo-intel's precomputed index (no
   model call). Tree/Graph toggle over the same `downstream` map; a
   DegradedNotice + Resync affordance whenever the map is incomplete. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Skeleton, ErrorState } from "@devdigest/ui";
import { useBlastRadius, useBlastResync } from "../../../../../../../lib/hooks/blast";
import { blastStats, hasDownstream } from "./helpers";
import { VIEWS, RESYNC_REASONS, type BlastView } from "./constants";
import { BlastStats } from "./_components/BlastStats";
import { DegradedNotice } from "./_components/DegradedNotice";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { PriorPrs } from "./_components/PriorPrs";
import { s } from "./styles";

export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
  headSha,
}: {
  prId: string | null;
  repoId: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const { data: radius, isLoading, isError, refetch } = useBlastRadius(prId);
  const [view, setView] = React.useState<BlastView>("tree");
  // Index-state is only worth reading while the map is actually degraded.
  const resync = useBlastResync(repoId, prId, !!radius?.degraded);

  if (isLoading) {
    return (
      <Card>
        <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
        <Skeleton height={16} style={{ marginBottom: 12 }} />
        <Skeleton height={120} />
      </Card>
    );
  }

  if (isError || !radius) {
    return (
      <Card>
        <SectionLabel icon="Workflow">{t("title")}</SectionLabel>
        <ErrorState body={t("error")} onRetry={() => refetch()} />
      </Card>
    );
  }

  const stats = blastStats(radius);
  const canResync = !!repoId && !!radius.reason && RESYNC_REASONS.includes(radius.reason);

  return (
    <Card>
      <SectionLabel icon="Workflow">{t("title")}</SectionLabel>

      <div style={s.statsRow}>
        <BlastStats stats={stats} />
        <div role="group" aria-label={t("toggleLabel")} style={s.toggleGroup}>
          {VIEWS.map((v, i) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              style={{ ...s.toggleBtn(view === v), ...(i === 0 ? { borderLeft: "none" } : {}) }}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {radius.degraded && (
        <DegradedNotice
          reason={radius.reason ?? "no_data"}
          canResync={canResync}
          running={resync.running}
          ready={resync.ready}
          timedOut={resync.timedOut}
          failed={resync.failed}
          onResync={resync.start}
        />
      )}

      {!hasDownstream(radius) ? (
        <p style={s.noCallers}>{t("noDownstream", { count: stats.symbols })}</p>
      ) : view === "tree" ? (
        <BlastTree downstream={radius.downstream} repoFullName={repoFullName} headSha={headSha} />
      ) : (
        <BlastGraph radius={radius} />
      )}

      <div style={s.divider}>
        <PriorPrs prId={prId} repoFullName={repoFullName} />
      </div>
    </Card>
  );
}
