/* ContextSelectionPanel — attach a repo's Project Context documents to one
   agent or one skill: repo picker, search, checkbox list, preview, totals and
   Save. Shared by the agent Context tab and the skill page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, TextInput } from "@devdigest/ui";
import { useRepos } from "@/lib/hooks/core";
import {
  useAgentContext,
  useContextFiles,
  useSaveAgentContext,
  useSaveSkillContext,
  useSkillContext,
} from "@/lib/hooks/context";
import { ContextDocPreview } from "./ContextDocPreview";
import { buildRows, filterByPath, promptEstimate, sumTokens } from "./helpers";
import { s } from "./styles";

export type ContextOwnerKind = "agent" | "skill";

export function ContextSelectionPanel({
  ownerKind,
  ownerId,
  repoId,
  onRepoChange,
}: {
  ownerKind: ContextOwnerKind;
  ownerId: string;
  repoId: string | null;
  onRepoChange: (repoId: string) => void;
}) {
  const t = useTranslations("context");
  const { data: repos } = useRepos();
  return (
    <div style={s.wrap}>
      <div style={s.repoRow}>
        <label htmlFor={`ctx-repo-${ownerId}`} style={s.label}>
          {t("picker.repo")}
        </label>
        <select
          id={`ctx-repo-${ownerId}`}
          style={s.select}
          value={repoId ?? ""}
          onChange={(e) => onRepoChange(e.target.value)}
        >
          {(repos ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name}
            </option>
          ))}
        </select>
      </div>
      {/* Keyed so the unsaved selection resets when the repo or owner changes. */}
      {repoId && <PanelBody key={`${ownerId}:${repoId}`} ownerKind={ownerKind} ownerId={ownerId} repoId={repoId} />}
    </div>
  );
}

function PanelBody({ ownerKind, ownerId, repoId }: { ownerKind: ContextOwnerKind; ownerId: string; repoId: string }) {
  const t = useTranslations("context");
  const listing = useContextFiles(repoId);
  const agentSel = useAgentContext(ownerKind === "agent" ? ownerId : null, repoId);
  const skillSel = useSkillContext(ownerKind === "skill" ? ownerId : null, repoId);
  const saveAgent = useSaveAgentContext(ownerId, repoId);
  const saveSkill = useSaveSkillContext(ownerId, repoId);
  const saving = saveAgent.isPending || saveSkill.isPending;
  const saveFailed = ownerKind === "agent" ? saveAgent.isError : saveSkill.isError;
  const selection = ownerKind === "agent" ? agentSel.data : skillSel.data;
  const selectionError = ownerKind === "agent" ? agentSel.isError : skillSel.isError;

  const [query, setQuery] = React.useState("");
  const [draft, setDraft] = React.useState<Set<string> | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  if (listing.isError || selectionError) return <div style={s.error}>{t("picker.loadError")}</div>;
  if (!listing.data || !selection) return <div style={s.muted}>{t("previewLoading")}</div>;

  const docs = listing.data.documents;
  // Derived, not stored: the saved paths until the user edits the checkboxes.
  const checked = draft ?? new Set(selection.attachments.map((a) => a.path));
  const rows = buildRows(docs, selection.attachments);
  const shown = filterByPath(rows, query);
  const linked = ownerKind === "agent" ? (agentSel.data?.linked_skill_paths ?? null) : null;

  const onSaved = () => setDraft(null);
  const save = () => {
    const paths = [...checked];
    if (ownerKind === "agent") saveAgent.mutate(paths, { onSuccess: onSaved });
    else saveSkill.mutate(paths, { onSuccess: onSaved });
  };

  const toggle = (path: string) => {
    const next = new Set(checked);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setDraft(next);
  };

  return (
    <>
      <TextInput value={query} onChange={setQuery} placeholder={t("picker.search")} aria-label={t("picker.search")} />
      <div style={s.list}>
        {rows.length === 0 && <div style={s.muted}>{t("picker.noDocs")}</div>}
        {rows.length > 0 && shown.length === 0 && <div style={s.muted}>{t("picker.noMatches", { q: query.trim() })}</div>}
        {shown.map((r) => (
          <div key={r.path} style={s.row}>
            <label style={s.rowLabel}>
              <input
                type="checkbox"
                checked={checked.has(r.path)}
                onChange={() => toggle(r.path)}
                aria-label={t("picker.check", { path: r.path })}
              />
              <span className="mono" style={s.path} title={r.path}>
                {r.path}
              </span>
            </label>
            {r.missing ? (
              <span style={s.missing}>{t("picker.missing")}</span>
            ) : (
              <>
                {r.type && <span style={s.meta}>{t(`type.${r.type}`)}</span>}
                <span style={s.meta}>{t("tokens", { count: r.tokens })}</span>
                <button type="button" style={s.linkBtn} onClick={() => setPreviewPath(previewPath === r.path ? null : r.path)}>
                  {previewPath === r.path ? t("picker.closePreview") : t("picker.preview")}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {previewPath && <ContextDocPreview repoId={repoId} path={previewPath} />}
      <div style={s.totals}>
        <span>{t("picker.selectionTotal", { count: checked.size, tokens: sumTokens(checked, docs) })}</span>
        {linked && <span>{t("picker.promptEstimate", { tokens: promptEstimate(checked, linked, docs) })}</span>}
      </div>
      <div style={s.footer}>
        <Button
          kind="primary"
          size="sm"
          loading={saving}
          disabled={saving || draft === null}
          onClick={save}
        >
          {saving ? t("picker.saving") : t("picker.save")}
        </Button>
        {saveFailed && <span style={s.error}>{t("picker.saveError")}</span>}
      </div>
    </>
  );
}
