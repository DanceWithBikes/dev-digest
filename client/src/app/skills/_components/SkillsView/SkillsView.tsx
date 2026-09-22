/* /skills — the Skills Lab (L02). A grid of skill cards on the left, a
   persistent preview/edit pane on the right. Selection lives in `?skill=` so it
   survives a reload and is addressable. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useDeleteSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "./_components/SkillCard";
import { SkillPreviewPane } from "./_components/SkillPreviewPane";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("skill");

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const [search, setSearch] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const select = (id: string | null) =>
    router.replace(id ? `/skills?skill=${id}` : "/skills", { scroll: false });

  const list = filterSkills(skills ?? [], search);
  const current = skills?.find((sk) => sk.id === selected);

  // Deleting the skill the pane is showing must also clear `?skill=`, or the
  // URL keeps pointing at a row that no longer exists.
  const remove = (id: string) =>
    del.mutate(id, {
      onSuccess: () => {
        if (id === selected) select(null);
      },
    });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {importing && (
        <ImportSkillDrawer
          onClose={() => setImporting(false)}
          onImported={(id) => select(id)}
        />
      )}
      {creating && (
        <CreateSkillModal onClose={() => setCreating(false)} onCreated={(id) => select(id)} />
      )}
      <div style={s.split}>
        <div style={s.left}>
          <div style={s.header}>
            <div style={s.headerText}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <p style={s.subtitle}>{t("page.subtitle")}</p>
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

          {isLoading && (
            <div style={s.grid}>
              <Skeleton height={110} />
              <Skeleton height={110} />
              <Skeleton height={110} />
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
            <div style={s.grid}>
              {list.map((sk) => (
                <SkillCard
                  key={sk.id}
                  skill={sk}
                  active={sk.id === selected}
                  onClick={() => select(sk.id)}
                  onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                  onDelete={() => remove(sk.id)}
                  deleting={del.isPending && del.variables === sk.id}
                />
              ))}
            </div>
          )}
        </div>

        <div style={s.right}>
          {current ? (
            <SkillPreviewPane skill={current} onDeleted={() => select(null)} />
          ) : (
            <div style={s.placeholder}>
              <div style={s.placeholderTitle}>{t("page.selectPrompt.title")}</div>
              <div style={s.placeholderBody}>{t("page.selectPrompt.body")}</div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
