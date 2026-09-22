/* SkillPreviewPane — the right-hand pane of the Skills Lab. Renders the selected
   skill's body and flips to a quick edit form. It is a persistent pane rather
   than a Drawer so you can keep clicking through cards; anything that needs more
   room (versions, diffs) lives on /skills/[id], one click away. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useToast } from "../../../../../../lib/toast";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../lib/hooks/skills";
import {
  SkillForm,
  isSkillFormComplete,
  toSkillFormValue,
  type SkillFormValue,
} from "../../../SkillForm";
import { ConfirmDialog } from "../ConfirmDialog";
import { TYPE_COLORS } from "../../../../constants";
import { s } from "./styles";

export function SkillPreviewPane({
  skill,
  onDeleted,
}: {
  skill: Skill;
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [draft, setDraft] = React.useState<SkillFormValue>(() => toSkillFormValue(skill));

  // Switching the selected skill discards any half-finished edit — the pane is
  // a preview first, so a stale draft must never bleed onto another skill.
  React.useEffect(() => {
    setEditing(false);
    setConfirming(false);
    setDraft(toSkillFormValue(skill));
  }, [skill?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = isSkillFormComplete(draft);

  return (
    <div style={s.pane}>
      <div style={s.headerRow}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <Badge color="var(--text-muted)">{t("preview.version", { version: skill.version })}</Badge>
      </div>

      <div style={s.metaRow}>
        <span style={s.typePill(TYPE_COLORS[skill.type])}>{t(`type.${skill.type}`)}</span>
        <Badge color="var(--text-muted)">{t(`source.${skill.source}`)}</Badge>
        <Badge color={skill.enabled ? "var(--ok)" : "var(--text-muted)"} dot>
          {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
        </Badge>
      </div>

      {editing ? (
        <>
          <SkillForm value={draft} onChange={setDraft} bodyRows={16} />
          <div style={s.actions}>
            <Button
              kind="primary"
              size="sm"
              icon="Check"
              disabled={!valid || update.isPending}
              onClick={() =>
                update.mutate(
                  { id: skill.id, patch: draft },
                  {
                    onSuccess: (saved) => {
                      toast.success(t("form.savedToast", { name: saved.name, version: saved.version }));
                      setEditing(false);
                    },
                  },
                )
              }
            >
              {update.isPending ? t("preview.saving") : t("preview.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("preview.cancel")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div style={s.description}>{skill.description}</div>
          <div style={s.bodyLabel}>{t("preview.bodyLabel")}</div>
          <div style={s.body}>
            <Markdown>{skill.body}</Markdown>
          </div>
          <div style={s.actions}>
            <Button kind="secondary" size="sm" icon="Edit" onClick={() => setEditing(true)}>
              {t("preview.edit")}
            </Button>
            {/* A real anchor, not a router.push button: the detail page is an
                address a user should be able to open in a new tab. */}
            <Link href={`/skills/${skill.id}`} style={s.openLink}>
              <Icon.ExternalLink size={13} />
              {t("preview.openFullPage")}
            </Link>
            <div style={s.spacer} />
            <Button
              kind="danger"
              size="sm"
              icon="Trash"
              disabled={del.isPending}
              onClick={() => setConfirming(true)}
            >
              {t("preview.delete")}
            </Button>
          </div>
          <div style={s.attachHint}>{t("preview.attachHint")}</div>
        </>
      )}

      {confirming && (
        <ConfirmDialog
          title={t("delete.title")}
          body={t("delete.body", { name: skill.name, count: skill.agent_count })}
          confirmLabel={del.isPending ? t("delete.confirming") : t("delete.confirm")}
          cancelLabel={t("delete.cancel")}
          pending={del.isPending}
          onCancel={() => setConfirming(false)}
          onConfirm={() =>
            del.mutate(skill.id, {
              onSuccess: () => {
                setConfirming(false);
                onDeleted?.();
              },
            })
          }
        />
      )}
    </div>
  );
}
