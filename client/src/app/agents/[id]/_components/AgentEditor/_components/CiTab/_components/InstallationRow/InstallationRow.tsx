"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { CiInstallation } from "@devdigest/shared";
import { useRelativeTime } from "@/lib/relative-time";
import { RUN_STATUS_COLOR, STATE_COLOR } from "../../constants";
import { s } from "./styles";

export function InstallationRow({ installation, onUpdate }: { installation: CiInstallation; onUpdate: () => void }) {
  const t = useTranslations("ci");
  const relative = useRelativeTime();
  const run = installation.latest_run;

  return (
    <div style={s.row} data-testid="ci-installation-row">
      <span style={s.repo}>{installation.repo}</span>
      <span style={s.muted}>{t("ciTab.githubActions")}</span>
      <span style={s.muted}>
        {run ? (
          <>
            <span style={{ color: RUN_STATUS_COLOR[run.status] }}>{t(`runs.status.${run.status}`)}</span>
            {" · "}
            {relative(run.ran_at)}
          </>
        ) : (
          t("ciTab.noRunsYet")
        )}
      </span>
      <span style={s.muted}>
        {t("ciTab.version", { agent: installation.agent_version, runner: installation.runner_version })}
      </span>
      {installation.behind && (
        <Badge color="var(--warn)" bg="var(--warn-bg)">
          {t("ciTab.behind")}
        </Badge>
      )}
      <Badge color={STATE_COLOR[installation.state]}>{t(`ciTab.state.${installation.state}`)}</Badge>
      <span style={s.spacer} />
      <Button kind="secondary" size="sm" onClick={onUpdate}>
        {t("ciTab.updateCiConfig")}
      </Button>
    </div>
  );
}
