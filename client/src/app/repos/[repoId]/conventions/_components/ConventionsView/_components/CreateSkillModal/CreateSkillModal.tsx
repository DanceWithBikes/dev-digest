/* CreateSkillModal — turn the accepted candidates into one skill.

   The BODY is editable, not just the name and description. The assembled
   markdown is a proposal: it becomes literal instructions in an agent's prompt,
   so the person who signs off on it has to be able to change the wording before
   it ships, not merely name it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionSkillPreview, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { BODY_ROWS, CREATE_MODAL_WIDTH } from "../../constants";
import { s } from "./styles";

/** Sentinel for "do not attach this skill to any agent yet". */
const NO_AGENT = "";

export function CreateSkillModal({
  repoId,
  acceptedCount,
  onClose,
  onCreated,
}: {
  repoId: string;
  acceptedCount: number;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const t = useTranslations("conventions");
  const { data: preview, isLoading } = useConventionSkillPreview(repoId, true);
  const { data: agents } = useAgents();
  const create = useCreateConventionSkill(repoId);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [agentId, setAgentId] = React.useState<string>(NO_AGENT);

  // Seed the form from the server's assembly once it arrives. Keyed on the body
  // so a re-open after accepting more candidates picks up the new rules.
  React.useEffect(() => {
    if (!preview) return;
    setName(preview.name);
    setDescription(preview.description);
    setBody(preview.body);
  }, [preview?.body]); // eslint-disable-line react-hooks/exhaustive-deps

  // Default to attaching: a conventions skill that reaches no agent changes
  // nothing about any review, so leaving it unlinked is the one outcome nobody
  // wants by accident. "Don't attach it yet" stays available as a choice.
  React.useEffect(() => {
    if (agentId !== NO_AGENT) return;
    const firstEnabled = (agents ?? []).find((a) => a.enabled);
    if (firstEnabled) setAgentId(firstEnabled.id);
  }, [agents]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = name.trim() && description.trim() && body.trim();

  return (
    <Modal
      width={CREATE_MODAL_WIDTH}
      title={t("createModal.title")}
      subtitle={t("createModal.subtitle", { count: acceptedCount })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button
            kind="primary"
            size="sm"
            icon="Check"
            disabled={!valid || create.isPending}
            onClick={() =>
              create.mutate(
                {
                  name: name.trim(),
                  description: description.trim(),
                  body,
                  ...(agentId !== NO_AGENT ? { agent_id: agentId } : {}),
                },
                { onSuccess: (skill) => onCreated(skill.name) },
              )
            }
          >
            {create.isPending ? t("createModal.creating") : t("createModal.create")}
          </Button>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("createModal.cancel")}
          </Button>
          <div style={s.spacer} />
          {create.isError && <span style={s.error}>{t("createModal.failed")}</span>}
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.explainer}>{t("createModal.explainer")}</div>

        {isLoading ? (
          <div style={s.explainer}>{t("createModal.loading")}</div>
        ) : (
          <>
            <FormField label={t("createModal.nameLabel")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>

            <FormField label={t("createModal.descriptionLabel")} hint={t("createModal.descriptionHint")} required>
              <TextInput value={description} onChange={setDescription} />
            </FormField>

            <FormField label={t("createModal.agentLabel")} hint={t("createModal.agentHint")}>
              <SelectInput
                value={agentId}
                onChange={setAgentId}
                options={[
                  { value: NO_AGENT, label: t("createModal.noAgent") },
                  ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
                ]}
              />
            </FormField>

            <FormField label={t("createModal.bodyLabel")} hint={t("createModal.bodyHint")} required>
              <Textarea value={body} onChange={setBody} rows={BODY_ROWS} mono />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
