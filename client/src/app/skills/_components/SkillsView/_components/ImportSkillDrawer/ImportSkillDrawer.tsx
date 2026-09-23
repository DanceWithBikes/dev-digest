/* ImportSkillDrawer — pick a .md file, read it in the browser, parse it on the
   server (which writes nothing), review the result, and only then save.

   The trust notice is the point of the whole flow: a skill body becomes literal
   instructions in an agent's prompt, so importing someone else's skill means
   running their instructions. Imported skills are therefore saved DISABLED. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Icon, Markdown } from "@devdigest/ui";
import type { SkillDraft } from "@devdigest/shared";
import { useToast } from "../../../../../../lib/toast";
import { useCreateSkill, useParseSkill } from "../../../../../../lib/hooks/skills";
import { SkillForm, type SkillFormValue } from "../../../SkillForm";
import { s } from "./styles";

const ACCEPT = ".md,.markdown";

export function ImportSkillDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const parse = useParseSkill();
  const create = useCreateSkill();

  const [filename, setFilename] = React.useState<string | null>(null);
  const [warnings, setWarnings] = React.useState<SkillDraft["warnings"]>([]);
  const [draft, setDraft] = React.useState<SkillFormValue | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    // Read in the browser: the server never receives a file, only text.
    const content = await file.text();
    parse.mutate(
      { filename: file.name, content },
      {
        onSuccess: (d) => {
          setDraft({ name: d.name, description: d.description, type: d.type, body: d.body });
          setWarnings(d.warnings);
        },
      },
    );
  }

  const valid = draft && draft.name.trim() && draft.description.trim() && draft.body.trim();

  return (
    <Drawer
      width={640}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        draft ? (
          <div style={s.footer}>
            <Button
              kind="primary"
              size="sm"
              icon="Check"
              disabled={!valid || create.isPending}
              onClick={() =>
                create.mutate(
                  {
                    name: draft.name.trim(),
                    description: draft.description.trim(),
                    type: draft.type,
                    body: draft.body,
                    source: "imported_file",
                    // Consciously off: the user must read it before an agent does.
                    enabled: false,
                  },
                  {
                    onSuccess: (created) => {
                      toast.success(t("import.success", { name: created.name }));
                      onImported?.(created.id);
                      onClose();
                    },
                  },
                )
              }
            >
              {create.isPending ? t("import.confirming") : t("import.confirm")}
            </Button>
            <Button kind="ghost" size="sm" onClick={onClose}>
              {t("import.cancel")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div style={s.notice}>
        <Icon.AlertTriangle size={15} style={s.noticeIcon} />
        <span>{t("import.trustNotice")}</span>
      </div>

      <label style={s.picker}>
        <Icon.Upload size={15} />
        <span>{filename ?? t("import.pick")}</span>
        <input type="file" accept={ACCEPT} onChange={onPick} style={s.fileInput} />
      </label>

      {parse.isPending && <div style={s.status}>{t("import.parsing")}</div>}
      {parse.isError && <div style={s.error}>{t("import.parseFailed")}</div>}

      {draft && (
        <div style={s.result}>
          {warnings.includes("code-blocks-kept-as-text") && (
            <div style={s.warning}>{t("import.codeNotice")}</div>
          )}
          {warnings.includes("truncated") && <div style={s.warning}>{t("import.truncatedNotice")}</div>}
          {warnings.includes("no-heading") && <div style={s.warning}>{t("import.noHeadingNotice")}</div>}
          {warnings.includes("no-description") && (
            <div style={s.warning}>{t("import.noDescriptionNotice")}</div>
          )}

          <SkillForm value={draft} onChange={setDraft} showBody={false} />

          <div style={s.bodyLabel}>{t("import.bodyPreview")}</div>
          <div style={s.body}>
            <Markdown>{draft.body}</Markdown>
          </div>

          <div style={s.disabledHint}>{t("import.disabledHint")}</div>
        </div>
      )}
    </Drawer>
  );
}
