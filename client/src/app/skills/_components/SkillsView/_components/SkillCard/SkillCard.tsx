/* SkillCard — one skill in the library grid: name, current version, type pill,
   description, provenance, how many agents it reaches, the GLOBAL enable toggle
   (a disabled skill never reaches any agent's prompt, even where it is
   attached), and Delete.

   Delete is destructive and fans out — the card spells out how many agents lose
   the skill — so it asks through ConfirmDialog, never window.confirm. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, IconBtn, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TYPE_COLORS } from "../../../../constants";
import { isImported } from "../../helpers";
import { ConfirmDialog } from "../ConfirmDialog";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
  deleting,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations("skills");
  const [confirming, setConfirming] = React.useState(false);

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <Badge color="var(--text-muted)">{t("preview.version", { version: skill.version })}</Badge>
        {onToggle && (
          // Stop propagation so flipping the toggle doesn't also select the card.
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={13} />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <span style={s.typePill(TYPE_COLORS[skill.type])}>{t(`type.${skill.type}`)}</span>
        <Badge color="var(--text-muted)" icon="Cpu">
          {t("card.agentCount", { count: skill.agent_count })}
        </Badge>
        {isImported(skill) && (
          <Badge color="var(--text-muted)" icon="Upload">
            {t("card.importedBadge")}
          </Badge>
        )}
        {onDelete && (
          <div style={s.deleteSlot} onClick={(e) => e.stopPropagation()}>
            <IconBtn
              icon="Trash"
              size={26}
              danger
              label={t("card.deleteLabel", { name: skill.name })}
              onClick={() => setConfirming(true)}
            />
          </div>
        )}
      </div>

      {confirming && (
        // The dialog is a DOM descendant of the card, so without this its
        // clicks (backdrop included) would also select the card behind it.
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={t("delete.title")}
            body={t("delete.body", { name: skill.name, count: skill.agent_count })}
            confirmLabel={deleting ? t("delete.confirming") : t("delete.confirm")}
            cancelLabel={t("delete.cancel")}
            pending={deleting}
            onCancel={() => setConfirming(false)}
            onConfirm={() => {
              setConfirming(false);
              onDelete?.();
            }}
          />
        </div>
      )}
    </div>
  );
}
