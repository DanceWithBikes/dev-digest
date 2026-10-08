/* SkillEvalsTab — results of the skill's eval suite (evals/skills/<name>/), imported
   into the DB by "Sync results": latest result per case with the judge's evidence,
   then the run history. Data comes from the skill-evals hooks only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillEvals, useSyncSkillEvals } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { EvalCaseRow } from "./_components/EvalCaseRow";
import { EvalRunHistory } from "./_components/EvalRunHistory";
import { formatRunDate } from "./helpers";
import { s } from "./styles";

export function SkillEvalsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useSkillEvals(skill.id);
  const sync = useSyncSkillEvals();

  const onSync = () =>
    sync.mutate(skill.id, {
      onSuccess: (res) =>
        res.imported > 0
          ? toast.success(t("evals.syncedToast", { imported: res.imported }))
          : toast.info(t("evals.syncedNothingToast")),
      onError: () => toast.error(t("evals.syncFailed")),
    });

  if (isError) return <ErrorState body={t("evals.loadError")} onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton height={160} />;

  const { summary, latest, runs } = data;

  return (
    <div style={s.wrap}>
      <section>
        <div style={s.header}>
          <div style={s.titleBlock}>
            <h3 style={s.h3}>
              {t("evals.heading")}
              {summary.total > 0 && (
                <span style={s.count}>
                  {t("evals.passing", { passing: summary.passing, total: summary.total })}
                </span>
              )}
            </h3>
            {summary.latest_ran_at && (
              <p style={s.meta}>{t("evals.latestRun", { when: formatRunDate(summary.latest_ran_at) })}</p>
            )}
          </div>
          <Button size="sm" onClick={onSync} loading={sync.isPending}>
            {sync.isPending ? t("evals.syncing") : t("evals.sync")}
          </Button>
        </div>

        {latest.length === 0 ? (
          <div style={{ ...s.empty, marginTop: 12 }}>
            <p style={s.emptyTitle}>{t("evals.emptyTitle")}</p>
            <p style={s.emptyBody}>{t("evals.emptyBody")}</p>
            <code className="mono" style={s.command}>
              {t("evals.emptyCommand", { name: skill.name })}
            </code>
          </div>
        ) : (
          <ul style={{ ...s.list, marginTop: 12 }}>
            {latest.map((r) => (
              <li key={r.id}>
                <EvalCaseRow result={r} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {runs.length > 0 && <EvalRunHistory runs={runs} />}
    </div>
  );
}
