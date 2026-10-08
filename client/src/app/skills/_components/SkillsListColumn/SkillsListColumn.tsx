/* SkillsListColumn — the left-hand master list shared by /skills and
   /skills/[id], like the agents list: search, Add (create / from file) and one
   card per skill. The active card follows the route; picking a card navigates,
   so the URL is the selection. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useDeleteSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsListColumn({
  activeId,
  onSelect,
  onDeleted,
}: {
  activeId?: string | undefined;
  onSelect: (id: string) => void;
  /** Called after the ACTIVE skill is deleted, so the page can leave its URL. */
  onDeleted?: () => void;
}) {
  const t = useTranslations("skills");
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const list = filterSkills(skills ?? [], search);

  const remove = (id: string) =>
    del.mutate(id, {
      onSuccess: () => {
        if (id === activeId) onDeleted?.();
      },
    });

  return (
    <div style={s.column}>
      {importing && (
        <ImportSkillDrawer onClose={() => setImporting(false)} onImported={onSelect} />
      )}
      {creating && <CreateSkillModal onClose={() => setCreating(false)} onCreated={onSelect} />}

      <div style={s.header}>
        <h1 style={s.h1}>{t("page.heading")}</h1>
        <Dropdown
          width={220}
          align="right"
          trigger={
            <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
              {t("page.addSkill")}
            </Button>
          }
          items={[
            { label: t("page.menu.create"), icon: "Edit", onClick: () => setCreating(true) },
            { divider: true },
            { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
          ]}
        />
      </div>
      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("page.searchPlaceholder")}
          style={s.searchInput}
        />
      </div>

      {isLoading && (
        <div style={s.list}>
          <Skeleton height={96} />
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      )}
      {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
      {!isLoading && !isError && list.length === 0 && (
        <EmptyState
          icon="Sparkles"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={() => setCreating(true)}
        />
      )}
      {list.length > 0 && (
        <div style={s.list}>
          {list.map((sk) => (
            <SkillCard
              key={sk.id}
              skill={sk}
              active={sk.id === activeId}
              onClick={() => onSelect(sk.id)}
              onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              onDelete={() => remove(sk.id)}
              deleting={del.isPending && del.variables === sk.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
