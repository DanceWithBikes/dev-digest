/* SortableSkillRow — one skill row in the agent's Skills tab.

   Attached rows are draggable AND carry explicit move up/down buttons: the
   handle is the fast path, the buttons are the keyboard- and
   screen-reader-accessible one (and the only one a jsdom test can drive). */
"use client";

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { TYPE_COLORS, ENABLED_TOGGLE_SIZE } from "../../constants";
import { s } from "./styles";

export function SortableSkillRow({
  skill,
  attached,
  index,
  total,
  onToggleAttach,
  onToggleEnabled,
  onMove,
}: {
  skill: Skill;
  /** Linked to THIS agent — i.e. in this agent's assembled prompt. */
  attached: boolean;
  index?: number;
  total?: number;
  onToggleAttach: () => void;
  /** Flips the skill's GLOBAL enabled flag (PUT /skills/:id), not the link. */
  onToggleEnabled: (enabled: boolean) => void;
  onMove?: (delta: number) => void;
}) {
  const t = useTranslations("agents");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.id,
    disabled: !attached,
  });

  return (
    <div
      ref={setNodeRef}
      style={s.row(attached, isDragging, {
        transform: CSS.Transform.toString(transform),
        transition,
      })}
    >
      {attached ? (
        <button
          {...attributes}
          {...listeners}
          aria-label={t("skills.dragHandle", { name: skill.name })}
          style={s.handle}
        >
          <Icon.Menu size={14} />
        </button>
      ) : (
        <span style={s.handlePlaceholder} />
      )}

      <button
        role="checkbox"
        aria-checked={attached}
        aria-label={t("skills.attach", { name: skill.name })}
        onClick={onToggleAttach}
        style={s.checkbox(attached)}
      >
        {attached && <Icon.Check size={11} style={s.checkIcon} />}
      </button>

      <span className="mono" style={s.name}>
        {skill.name}
      </span>

      {/* Attached AND globally off is the one contradictory state — flag it. */}
      {attached && !skill.enabled && <span style={s.disabledChip}>{t("skills.disabledGlobally")}</span>}

      <span style={s.typePill(TYPE_COLORS[skill.type])}>{skill.type}</span>

      {/* The global enabled flag, not the attachment: the checkbox decides
          whether THIS agent uses the skill, this toggle whether the skill may
          be used at all (it is shared by every agent). stopPropagation keeps a
          click here from reaching any row-level attach handling. */}
      {/* `Toggle` takes no aria-label and lives in the untouchable design
          system, so the name is carried by a labelled group around it. */}
      <span
        role="group"
        aria-label={t("skills.enabledToggle", { name: skill.name })}
        onClick={(e) => e.stopPropagation()}
        style={s.enabledToggle}
      >
        <Toggle on={skill.enabled} onChange={onToggleEnabled} size={ENABLED_TOGGLE_SIZE} />
      </span>

      {attached && onMove && (
        <span style={s.moveGroup}>
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={t("skills.moveUp", { name: skill.name })}
            style={s.moveBtn(index === 0)}
          >
            <Icon.ArrowUp size={13} />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index != null && total != null && index >= total - 1}
            aria-label={t("skills.moveDown", { name: skill.name })}
            style={s.moveBtn(index != null && total != null && index >= total - 1)}
          >
            <Icon.ArrowDown size={13} />
          </button>
        </span>
      )}
    </div>
  );
}
