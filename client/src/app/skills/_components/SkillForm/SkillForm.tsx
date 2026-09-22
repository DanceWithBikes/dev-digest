/* SkillForm — the four editable fields of a skill. Shared by the create form
   and the import-confirm step so both teach the same thing about a description. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPES } from "../../constants";

export interface SkillFormValue {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

export function SkillForm({
  value,
  onChange,
  bodyRows = 12,
  showBody = true,
}: {
  value: SkillFormValue;
  onChange: (next: SkillFormValue) => void;
  bodyRows?: number;
  showBody?: boolean;
}) {
  const t = useTranslations("skills");
  const set = <K extends keyof SkillFormValue>(key: K, v: SkillFormValue[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <>
      <FormField label={t("form.nameLabel")} required>
        <TextInput
          value={value.name}
          onChange={(v) => set("name", v)}
          placeholder={t("form.namePlaceholder")}
          mono
        />
      </FormField>

      {/* The description is what an agent reads to decide whether the skill
          applies, so the hint teaches the directive phrasing. */}
      <FormField label={t("form.descriptionLabel")} hint={t("form.descriptionHint")} required>
        <TextInput
          value={value.description}
          onChange={(v) => set("description", v)}
          placeholder={t("form.descriptionPlaceholder")}
        />
      </FormField>

      <FormField label={t("form.typeLabel")}>
        <SelectInput
          value={value.type}
          onChange={(v) => set("type", v as SkillType)}
          options={SKILL_TYPES.map((k) => ({ value: k, label: t(`type.${k}`) }))}
        />
      </FormField>

      {showBody && (
        <FormField label={t("form.bodyLabel")} hint={t("form.bodyHint")} required>
          <Textarea
            value={value.body}
            onChange={(v) => set("body", v)}
            placeholder={t("form.bodyPlaceholder")}
            rows={bodyRows}
            mono
          />
        </FormField>
      )}
    </>
  );
}
