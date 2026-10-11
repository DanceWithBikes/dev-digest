"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Textarea } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { s as shared } from "../../styles";
import { currentContents } from "../../helpers";
import { s } from "./styles";

/**
 * Step 2: the files the bundle will create and the selected file's contents.
 * Contents are always rendered as text (never markdown or HTML); only files the
 * server marks `editable` get a Textarea (AC-92, AC-93).
 */
export function PreviewStep({
  files,
  loading,
  error,
  selectedPath,
  onSelect,
  edits,
  onEdit,
}: {
  files: CiFile[];
  loading: boolean;
  error: Error | null;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  edits: Record<string, string>;
  onEdit: (path: string, contents: string) => void;
}) {
  const t = useTranslations("ci.exportWizard");
  if (loading) return <div style={shared.muted}>{t("generating")}</div>;
  if (error) {
    return (
      <div style={shared.error} role="alert">
        {t("previewFailed")}: {error.message}
      </div>
    );
  }
  const selected = files.find((f) => f.path === selectedPath) ?? files[0];

  return (
    <div style={s.split}>
      <div style={s.list}>
        <div style={shared.sectionLabel}>{t("filesToCreate")}</div>
        {files.map((f) => (
          <button key={f.path} type="button" style={s.file(f.path === selected?.path)} onClick={() => onSelect(f.path)}>
            <span>{f.path}</span>
            {f.editable && <Badge>{t("editable")}</Badge>}
          </button>
        ))}
      </div>
      {selected && (
        <div aria-label={t("fileContents", { path: selected.path })} role="group" data-testid="ci-file-pane">
          {selected.editable ? (
            <Textarea
              value={currentContents(selected, edits)}
              onChange={(v) => onEdit(selected.path, v)}
              rows={16}
              mono
            />
          ) : (
            <pre style={s.pane}>{selected.contents}</pre>
          )}
        </div>
      )}
    </div>
  );
}
