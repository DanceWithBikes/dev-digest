/* ExportCiWizard — the 4-step Export to CI modal: Target · Preview · Configure · Install. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { LAST_STEP, STEP_KEYS } from "./constants";
import { s } from "./styles";
import { useExportWizard } from "./useExportWizard";
import { TargetStep } from "./_components/TargetStep";
import { PreviewStep } from "./_components/PreviewStep";
import { ConfigureStep } from "./_components/ConfigureStep";
import { InstallStep } from "./_components/InstallStep";

export function ExportCiWizard({
  agent,
  presetRepo,
  onClose,
}: {
  agent: Agent;
  presetRepo: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("ci.exportWizard");
  const w = useExportWizard(agent, presetRepo, onClose);
  const labels = STEP_KEYS.map((k) => t(`steps.${k}`));
  const result = w.exportCi.data;
  const done = result !== undefined;
  const error = w.exportCi.error;
  const previewError = w.preview.error;
  const errorMessage = error
    ? error instanceof ApiError
      ? error.message
      : String(error.message)
    : previewError
      ? `${t("previewFailed")}: ${previewError.message}`
      : null;

  return (
    <Modal
      width={760}
      title={t("title")}
      subtitle={t("subtitle", { agentName: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {w.step > 0 && !done && (
            <Button kind="secondary" onClick={w.back} disabled={w.exportCi.isPending}>
              {t("back")}
            </Button>
          )}
          <span style={s.spacer} />
          {done && (
            <Button kind="primary" onClick={onClose}>
              {t("close")}
            </Button>
          )}
          {!done && w.step < LAST_STEP && (
            <Button kind="primary" onClick={w.next} disabled={!w.canContinue}>
              {t("continue")}
            </Button>
          )}
          {!done && w.step === LAST_STEP && (
            <Button kind="primary" onClick={w.install} disabled={w.exportCi.isPending || !w.previewReady}>
              {w.exportCi.isPending ? t("installing") : t("install")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.stepper}>
        <ExportWizardSteps step={w.step} labels={labels} />
      </div>
      <div style={s.body} data-testid={`ci-wizard-step-${STEP_KEYS[w.step]}`}>
        {w.step === 0 && <TargetStep repos={w.repos} repo={w.repo} onRepo={w.setRepo} />}
        {w.step === 1 && (
          <PreviewStep
            files={w.files}
            loading={w.preview.isLoading}
            error={w.preview.error}
            selectedPath={w.selectedPath}
            onSelect={w.selectPath}
            edits={w.edits}
            onEdit={w.editFile}
          />
        )}
        {w.step === 2 && (
          <ConfigureStep triggers={w.triggers} onToggle={w.toggle} postAs={w.postAs} onPostAs={w.setPostAs} />
        )}
        {w.step === 3 && (
          <InstallStep
            mode={w.mode}
            onMode={w.setMode}
            repo={w.repo}
            fileCount={w.files.length}
            result={result}
            errorMessage={errorMessage}
          />
        )}
      </div>
    </Modal>
  );
}
