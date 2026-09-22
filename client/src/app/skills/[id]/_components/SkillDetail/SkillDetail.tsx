/* SkillDetail — the full page for one skill: Config (edit + save), Preview
   (the body as rendered markdown, not the raw text you type in Config) and
   Versioning (every snapshot, with a diff against the current body and a
   restore). The side pane on /skills stays the quick look; this is the page you
   land on when a skill needs real room.

   The active tab lives in `?tab=` so a diff you are discussing is linkable. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Markdown, Skeleton, Tabs } from "@devdigest/ui";
import { AppShell } from "../../../../../components/app-shell";
import { useSkill } from "../../../../../lib/hooks/skills";
import { TYPE_COLORS } from "../../../constants";
import { SkillConfigTab } from "./_components/SkillConfigTab";
import { SkillVersionsTab } from "./_components/SkillVersionsTab";
import { SKILL_TABS } from "./constants";
import { parseTab } from "./helpers";
import { s } from "./styles";

export function SkillDetail({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();

  const { data: skill, isLoading, isError, refetch } = useSkill(id);
  const tab = parseTab(search.get("tab"));

  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`, { scroll: false });
  };

  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("detail.fallbackCrumb") },
  ];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen body={t("detail.loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  if (isLoading || !skill) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loading}>
          <Skeleton height={24} width={240} />
          <Skeleton height={240} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.header}>
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <span style={s.typePill(TYPE_COLORS[skill.type])}>{t(`type.${skill.type}`)}</span>
        <Badge color="var(--text-muted)">{t("preview.version", { version: skill.version })}</Badge>
        <Badge color={skill.enabled ? "var(--ok)" : "var(--text-muted)"} dot>
          {skill.enabled ? t("preview.enabled") : t("preview.disabled")}
        </Badge>
        <Link href="/skills" style={s.backLink}>
          {t("detail.backToLibrary")}
        </Link>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={SKILL_TABS.map((key) => ({ key, label: t(`detail.tabs.${key}`) }))}
      />

      <div style={s.tabBody}>
        {tab === "config" && <SkillConfigTab skill={skill} />}
        {tab === "preview" && (
          <div style={s.markdown}>
            <Markdown>{skill.body}</Markdown>
          </div>
        )}
        {tab === "versioning" && <SkillVersionsTab skill={skill} />}
      </div>
    </AppShell>
  );
}
