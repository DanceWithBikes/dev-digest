/* SkillConfigTab — the editable skill. Same four fields as everywhere else
   (SkillForm), so the create modal, the import preview and this page cannot
   drift apart. Save is explicit: an agent's instructions are not something to
   change on every keystroke. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useToast } from "../../../../../../../lib/toast";
import { useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import {
  SkillForm,
  isSkillFormComplete,
  toSkillFormValue,
  type SkillFormValue,
} from "../../../../../_components/SkillForm";
import { s } from "./styles";

export function SkillConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [draft, setDraft] = React.useState<SkillFormValue>(() => toSkillFormValue(skill));

  // A restore (Versioning tab) rewrites the body under this form, so the draft
  // has to follow the saved version rather than keep the text it was opened on.
  React.useEffect(() => {
    setDraft(toSkillFormValue(skill));
  }, [skill.id, skill.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = isSkillFormComplete(draft);

  return (
    <div style={s.wrap}>
      <SkillForm value={draft} onChange={setDraft} bodyRows={20} />
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
                onSuccess: (saved) =>
                  toast.success(t("form.savedToast", { name: saved.name, version: saved.version })),
              },
            )
          }
        >
          {update.isPending ? t("preview.saving") : t("preview.save")}
        </Button>
      </div>
    </div>
  );
}
