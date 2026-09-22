/* CreateSkillModal — "Add → Create from scratch". Creation used to take over the
   right-hand preview pane, which meant starting a skill silently replaced
   whatever you were reading. A modal keeps the library visible behind it and
   makes cancelling an explicit act instead of a navigation. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useToast } from "../../../../../../lib/toast";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import {
  EMPTY_SKILL_FORM,
  SkillForm,
  isSkillFormComplete,
  type SkillFormValue,
} from "../../../SkillForm";
import { s } from "./styles";

export function CreateSkillModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const create = useCreateSkill();
  const [draft, setDraft] = React.useState<SkillFormValue>(EMPTY_SKILL_FORM);

  const valid = isSkillFormComplete(draft);

  const submit = () =>
    create.mutate(
      { ...draft, name: draft.name.trim(), description: draft.description.trim() },
      {
        onSuccess: (created) => {
          toast.success(t("form.createdToast", { name: created.name }));
          onCreated?.(created.id);
          onClose();
        },
      },
    );

  return (
    <Modal
      width={640}
      title={t("page.menu.create")}
      subtitle={t("form.createSubtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button
            kind="primary"
            size="sm"
            icon="Check"
            disabled={!valid || create.isPending}
            onClick={submit}
          >
            {create.isPending ? t("form.creating") : t("form.create")}
          </Button>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("form.cancel")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillForm value={draft} onChange={setDraft} />
      </div>
    </Modal>
  );
}
