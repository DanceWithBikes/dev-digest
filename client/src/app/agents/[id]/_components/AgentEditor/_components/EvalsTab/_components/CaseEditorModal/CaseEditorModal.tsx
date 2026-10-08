/* CaseEditorModal — create or edit an eval case. The file select only offers the
   paths parsed from the pasted diff, so an expectation can never point at a
   file the case does not contain. Save stays disabled while the draft is invalid. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { EvalCaseRecord, EvalExpectationKind } from "@devdigest/shared";
import { DiffViewer } from "@/components/diff-viewer";
import { splitUnifiedDiff } from "@/lib/diff-text";
import { EVAL_INPUT_DIFF_MAX } from "@/lib/eval-metrics";
import { useCreateEvalCase, useUpdateEvalCase } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import { KIND_OPTIONS } from "./constants";
import {
  draftFromRecord,
  emptyDraft,
  errorMessage,
  newExpectation,
  toUpsert,
  validateDraft,
  type Draft,
  type ExpectationDraft,
} from "./helpers";
import { s } from "./styles";

export function CaseEditorModal({
  agentId,
  record,
  onClose,
}: {
  agentId: string;
  /** Present when editing; absent when creating. */
  record?: EvalCaseRecord;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const toast = useToast();
  const create = useCreateEvalCase(agentId);
  const update = useUpdateEvalCase(agentId);
  const [draft, setDraft] = React.useState<Draft>(() => (record ? draftFromRecord(record) : emptyDraft()));

  const mutation = record ? update : create;
  const files = React.useMemo(() => splitUnifiedDiff(draft.diff), [draft.diff]);
  const paths = files.map((f) => f.path);
  const issues = validateDraft(draft, paths);
  const tooLarge = issues.includes("tooLarge");
  const serverError = errorMessage(mutation.error);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const patchRow = (key: string, p: Partial<ExpectationDraft>) =>
    setDraft((d) => ({ ...d, expectations: d.expectations.map((e) => (e.key === key ? { ...e, ...p } : e)) }));
  const addRow = () => setDraft((d) => ({ ...d, expectations: [...d.expectations, newExpectation()] }));
  const removeRow = (key: string) =>
    setDraft((d) => ({ ...d, expectations: d.expectations.filter((e) => e.key !== key) }));

  const save = () => {
    if (issues.length > 0) return;
    const input = toUpsert(draft);
    const done = (msg: string) => ({
      onSuccess: () => {
        toast.success(msg);
        onClose();
      },
    });
    if (record) update.mutate({ id: record.id, input }, done(t("notifications.caseSaved")));
    else create.mutate(input, done(t("notifications.caseCreated")));
  };

  const fileOptions = [{ value: "", label: t("caseEditor.filePlaceholder") }, ...paths.map((p) => ({ value: p, label: p }))];
  const kindOptions = KIND_OPTIONS.map((k) => ({ value: k.value, label: t(`caseEditor.kinds.${k.labelKey}`) }));

  return (
    <Modal
      width={820}
      title={record ? t("caseEditor.caseTitle", { name: record.name }) : t("caseEditor.newCase")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <div style={s.footerMsg}>
            {issues.length > 0 && <span style={s.invalid}>{t("caseEditor.invalid")}</span>}
            {issues.length > 0 &&
              issues
                .filter((i) => i !== "tooLarge")
                .map((i) => (
                  <span key={i} style={s.invalid}>
                    {t(`caseEditor.invalidReasons.${i}`)}
                  </span>
                ))}
            {serverError && <span role="alert" style={s.error}>{t("caseEditor.saveFailed", { message: serverError })}</span>}
          </div>
          <Button onClick={onClose}>{t("caseEditor.cancel")}</Button>
          <Button kind="primary" disabled={issues.length > 0 || mutation.isPending} onClick={save}>
            {mutation.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("caseEditor.nameLabel")} required>
          <TextInput
            value={draft.name}
            onChange={(v) => patch({ name: v })}
            placeholder={t("caseEditor.namePlaceholder")}
            aria-label={t("caseEditor.nameLabel")}
          />
        </FormField>

        <FormField label={t("caseEditor.inputLabel")} required hint={t("caseEditor.diffHint")}>
          <Textarea
            value={draft.diff}
            onChange={(v) => patch({ diff: v })}
            placeholder={t("caseEditor.diffPlaceholder")}
            rows={8}
            mono
          />
          {tooLarge && <div style={s.error}>{t("caseEditor.diffTooLarge", { max: EVAL_INPUT_DIFF_MAX.toLocaleString("en-US") })}</div>}
        </FormField>

        {draft.diff !== "" && !tooLarge && (
          <div style={s.preview}>
            <div style={s.previewMeta}>
              {files.length === 0 ? t("caseEditor.previewEmpty") : t("caseEditor.previewFiles", { count: files.length })}
            </div>
            {files.length > 0 && <DiffViewer files={files} />}
          </div>
        )}

        <FormField label={t("caseEditor.notesLabel")}>
          <Textarea
            value={draft.notes}
            onChange={(v) => patch({ notes: v })}
            placeholder={t("caseEditor.notesPlaceholder")}
            rows={2}
          />
        </FormField>

        <div style={s.expHeader}>
          <span style={s.expTitle}>{t("caseEditor.expectationsLabel")}</span>
          <Button size="sm" icon="Plus" onClick={addRow}>
            {t("caseEditor.addExpectation")}
          </Button>
        </div>
        {draft.expectations.map((e) => (
          <div key={e.key} style={s.row}>
            <FormField label={t("caseEditor.kind")}>
              <SelectInput
                mono={false}
                value={e.kind}
                onChange={(v) => patchRow(e.key, { kind: v as EvalExpectationKind })}
                options={kindOptions}
              />
            </FormField>
            <FormField label={t("caseEditor.file")}>
              <SelectInput value={e.file} onChange={(v) => patchRow(e.key, { file: v })} options={fileOptions} />
            </FormField>
            <FormField label={t("caseEditor.startLine")}>
              <TextInput
                type="number"
                min={1}
                value={e.start}
                onChange={(v) => patchRow(e.key, { start: v })}
                aria-label={t("caseEditor.startLine")}
              />
            </FormField>
            <FormField label={t("caseEditor.endLine")}>
              <TextInput
                type="number"
                min={1}
                value={e.end}
                onChange={(v) => patchRow(e.key, { end: v })}
                aria-label={t("caseEditor.endLine")}
              />
            </FormField>
            <FormField label={t("caseEditor.expectationTitle")}>
              <TextInput
                value={e.title}
                onChange={(v) => patchRow(e.key, { title: v })}
                aria-label={t("caseEditor.expectationTitle")}
              />
            </FormField>
            <FormField>
              <Button size="sm" kind="danger" disabled={draft.expectations.length <= 1} onClick={() => removeRow(e.key)}>
                {t("caseEditor.removeExpectation")}
              </Button>
            </FormField>
          </div>
        ))}
      </div>
    </Modal>
  );
}
