"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, FormField, SelectInput } from "@devdigest/ui";
import { s } from "../../styles";

/** Step 1: the GitHub Actions card (the only target) and the repository picker. */
export function TargetStep({ repos, repo, onRepo }: { repos: string[]; repo: string; onRepo: (r: string) => void }) {
  const t = useTranslations("ci.exportWizard");
  const options = repos.includes(repo) || repo === "" ? repos : [repo, ...repos];
  return (
    <>
      <div style={s.card(true)} aria-current="true" data-testid="ci-target-gha">
        <div>
          <div style={s.cardTitle}>
            {t("targets.gha")}
            <Badge color="var(--ok)" bg="var(--ok-bg)">
              {t("recommended")}
            </Badge>
          </div>
          <div style={s.cardBody}>{t("targets.ghaDesc")}</div>
        </div>
      </div>
      <FormField label={t("repoLabel")} hint={options.length === 0 ? t("noRepos") : t("repoHint")}>
        <SelectInput value={repo} onChange={onRepo} options={options} />
      </FormField>
    </>
  );
}
