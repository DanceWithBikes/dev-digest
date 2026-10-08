/* /skills — the Skills Lab. The shared list column on the left; the right side
   is a prompt until a skill is picked, which navigates to /skills/[id] (the same
   list-left / detail-right layout as Agents). */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "../../../../components/app-shell";
import { SkillsListColumn } from "../SkillsListColumn";
import { s } from "./styles";

export function SkillsView() {
  const t = useTranslations("skills");
  const router = useRouter();

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <div style={s.split}>
        <SkillsListColumn onSelect={(id) => router.push(`/skills/${id}`)} />
        <div style={s.right}>
          <div style={s.placeholderTitle}>{t("page.selectPrompt.title")}</div>
          <div style={s.placeholderBody}>{t("page.selectPrompt.body")}</div>
        </div>
      </div>
    </AppShell>
  );
}
