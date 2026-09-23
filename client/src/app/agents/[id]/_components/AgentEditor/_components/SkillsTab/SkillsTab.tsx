/* SkillsTab — attach, detach, order and globally enable/disable skills.

   Two different controls per row, deliberately:
   - the checkbox attaches the skill to THIS agent — an attached skill goes into
     this agent's prompt, detaching removes it from this agent only;
   - the toggle flips the skill's GLOBAL `enabled` flag (PUT /skills/:id), which
     is shared by every agent and vetoes the skill everywhere.
   A globally disabled skill is therefore never sent even while attached, which
   is why such a row is additionally marked here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Badge, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useAgentSkills,
  useSetAgentSkills,
  useSkills,
  useUpdateSkill,
} from "../../../../../../../lib/hooks/skills";
import { SortableSkillRow } from "./_components/SortableSkillRow";
import { attach, detach, reorder } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const save = useSetAgentSkills();
  const update = useUpdateSkill();
  const [filter, setFilter] = React.useState("");

  const attachedIds = React.useMemo(() => (links ?? []).map((l) => l.skill_id), [links]);

  const commit = (ids: string[]) => save.mutate({ agentId: agent.id, skillIds: ids });

  /** Global flag — touches the skill itself, never this agent's links. */
  const setEnabled = (id: string, enabled: boolean) => update.mutate({ id, patch: { enabled } });

  const byId = React.useMemo(
    () => new Map((skills ?? []).map((sk) => [sk.id, sk])),
    [skills],
  );

  // Attached first, in link order; then everything else alphabetically.
  const attachedSkills = attachedIds.map((id) => byId.get(id)).filter((x) => x != null);
  const detachedSkills = (skills ?? []).filter((sk) => !attachedIds.includes(sk.id));

  const matches = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase());

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = attachedIds.indexOf(String(active.id));
    const to = attachedIds.indexOf(String(over.id));
    const next = reorder(attachedIds, from, to);
    if (next !== attachedIds) commit(next);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isLoading) return <Skeleton height={160} />;
  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.attachedCount", { linked: attachedIds.length, total: skills?.length ?? 0 })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>

      <p style={s.orderHint}>{t("skills.orderHint")}</p>

      {(skills?.length ?? 0) === 0 ? (
        <p style={s.empty}>{t("skills.empty")}</p>
      ) : (
        <div style={s.list}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={attachedIds} strategy={verticalListSortingStrategy}>
              {attachedSkills
                .filter((sk) => matches(sk.name))
                .map((sk) => (
                  <SortableSkillRow
                    key={sk.id}
                    skill={sk}
                    attached
                    index={attachedIds.indexOf(sk.id)}
                    total={attachedIds.length}
                    onToggleAttach={() => commit(detach(attachedIds, sk.id))}
                    onToggleEnabled={(enabled) => setEnabled(sk.id, enabled)}
                    onMove={(delta) => {
                      const i = attachedIds.indexOf(sk.id);
                      const next = reorder(attachedIds, i, i + delta);
                      if (next !== attachedIds) commit(next);
                    }}
                  />
                ))}
            </SortableContext>
          </DndContext>

          {detachedSkills
            .filter((sk) => matches(sk.name))
            .map((sk) => (
              <SortableSkillRow
                key={sk.id}
                skill={sk}
                attached={false}
                onToggleAttach={() => commit(attach(attachedIds, sk.id))}
                onToggleEnabled={(enabled) => setEnabled(sk.id, enabled)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
