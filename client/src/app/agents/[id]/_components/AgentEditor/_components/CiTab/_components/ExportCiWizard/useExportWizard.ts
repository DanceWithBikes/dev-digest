"use client";

import React from "react";
import type { Agent } from "@devdigest/shared";
import { useCiPreview, useExportCi } from "@/lib/hooks/ci";
import { useRepos } from "@/lib/hooks/core";
import { useActiveRepo } from "@/lib/repo-context";
import {
  CONFIGURE_STEP,
  DEFAULT_POST_AS,
  DEFAULT_TRIGGERS,
  LAST_STEP,
  type InstallMode,
  type PostAs,
  type Trigger,
} from "./constants";
import { changedEdits, ownsEnter, toggleTrigger } from "./helpers";

/**
 * State and actions of the Export to CI wizard. The wizard is mounted only
 * while open, so closing unmounts it and discards every edit (AC-94, AC-95).
 */
export function useExportWizard(agent: Agent, presetRepo: string | null, onClose: () => void) {
  const { data: repoList } = useRepos();
  const { activeRepo } = useActiveRepo();
  const repos = React.useMemo(() => (repoList ?? []).map((r) => r.full_name), [repoList]);

  const [step, setStep] = React.useState(0);
  const [chosenRepo, setChosenRepo] = React.useState<string | null>(null);
  const [triggers, setTriggers] = React.useState<Trigger[]>([...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<PostAs>(DEFAULT_POST_AS);
  const [mode, setMode] = React.useState<InstallMode>("open_pr");
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  // Derived, not stored: the picked repo, else the preset, else the current repo, else the first one.
  const repo = chosenRepo ?? presetRepo ?? activeRepo?.full_name ?? repos[0] ?? "";

  const preview = useCiPreview(agent.id, { repo, triggers, post_as: postAs }, step >= 1);
  const exportCi = useExportCi(agent.id);

  const files = preview.data?.files ?? [];
  // Install is allowed only on a settled, successful preview of the current inputs, so a
  // reloading or failed preview can never silently drop the user's edits.
  const previewReady = preview.isSuccess && !preview.isFetching;
  const canContinue = step === 0 ? repo !== "" : step === 1 ? files.length > 0 : step === CONFIGURE_STEP ? triggers.length > 0 : false;

  const next = React.useCallback(() => {
    if (canContinue) setStep((n) => Math.min(n + 1, LAST_STEP));
  }, [canContinue]);
  const back = () => setStep((n) => Math.max(n - 1, 0));

  // Escape closes, Enter continues (the Modal has no key handling of its own).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter" && !ownsEnter(e.target)) next();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, next]);

  // Edits belong to the previewed repo's bundle; a different repo discards them.
  const setRepo = (next: string) => {
    if (next === repo) return;
    setChosenRepo(next);
    setEdits({});
    setSelectedPath(null);
  };

  const install = () => {
    if (!previewReady) return;
    exportCi.mutate({ repo, target: "gha", mode, post_as: postAs, triggers, edits: changedEdits(files, edits) });
  };

  return {
    step,
    repos,
    repo,
    setRepo,
    triggers,
    toggle: (t: Trigger) => setTriggers((cur) => toggleTrigger(cur, t)),
    postAs,
    setPostAs,
    mode,
    setMode,
    edits,
    editFile: (path: string, contents: string) => setEdits((cur) => ({ ...cur, [path]: contents })),
    selectedPath: selectedPath ?? files[0]?.path ?? null,
    selectPath: setSelectedPath,
    preview,
    files,
    previewReady,
    canContinue,
    next,
    back,
    install,
    exportCi,
  };
}
