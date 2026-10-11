/* CiTab — an agent's CI deployment: one row per installed repo, the "Fail CI on"
   gate, the Export to CI wizard and a link to the agent's CI run history. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, FormField, SelectInput } from "@devdigest/ui";
import type { Agent, CiFailOn } from "@devdigest/shared";
import { useCiInstallations } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { CI_FAIL_ON_VALUES } from "../../constants";
import { countActive } from "./helpers";
import { s } from "./styles";
import { InstallationRow } from "./_components/InstallationRow";
import { ExportCiWizard } from "./_components/ExportCiWizard";

/** `null` = wizard closed; `{ repo }` = open, with an optional preset repository. */
type WizardTarget = null | { repo: string | null };

export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const ta = useTranslations("agents");
  const update = useUpdateAgent();
  const { data, isLoading, isError, error, refetch } = useCiInstallations(agent.id);
  const [wizard, setWizard] = React.useState<WizardTarget>(null);

  const installations = data ?? [];
  const failOnOptions = CI_FAIL_ON_VALUES.map((v) => ({ value: v, label: ta(`config.ciFailOnOptions.${v}`) }));

  return (
    <div style={s.wrap} data-testid="ci-tab">
      <div style={s.header}>
        <h2 style={s.h2}>{t("ciTab.heading")}</h2>
        {!isError && (
          <Badge color="var(--ok)" bg="var(--ok-bg)">
            <span data-testid="ci-active-badge">{t("ciTab.activeIn", { count: countActive(installations) })}</span>
          </Badge>
        )}
        <span style={s.spacer} />
        <Button kind="primary" size="sm" onClick={() => setWizard({ repo: null })}>
          {t("ciTab.addToCi")}
        </Button>
      </div>
      <p style={s.subtitle}>{t("ciTab.subtitle")}</p>

      <div style={s.list} data-testid="ci-installations">
        {isLoading && <div style={s.muted}>{t("ciTab.loading")}</div>}
        {isError && (
          <ErrorState title={t("ciTab.loadFailed")} body={error?.message} onRetry={() => void refetch()} />
        )}
        {!isLoading && !isError && installations.length === 0 && <div style={s.muted}>{t("ciTab.empty")}</div>}
        {installations.map((inst) => (
          <InstallationRow key={inst.id} installation={inst} onUpdate={() => setWizard({ repo: inst.repo })} />
        ))}
        <Link href="/onboarding" style={s.addRepo}>
          {t("ciTab.addRepository")}
        </Link>
      </div>

      <div style={s.failOnBox}>
        <FormField label={t("ciTab.failOn")}>
          <SelectInput
            value={agent.ci_fail_on}
            onChange={(v) => update.mutate({ id: agent.id, patch: { ci_fail_on: v as CiFailOn } })}
            options={failOnOptions}
          />
        </FormField>
        <div style={s.failOnNote}>{t("ciTab.failOnNote")}</div>
      </div>

      <Link href={`/ci-runs?agent=${encodeURIComponent(agent.id)}`} style={s.link}>
        {t("ciTab.history")}
      </Link>

      {wizard && <ExportCiWizard agent={agent} presetRepo={wizard.repo} onClose={() => setWizard(null)} />}
    </div>
  );
}
