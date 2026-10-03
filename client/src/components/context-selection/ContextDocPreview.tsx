/* ContextDocPreview — one document rendered as read-only Markdown. The
   `Markdown` primitive is react-markdown without rehype-raw, so raw HTML in an
   untrusted document is shown as text and no script or handler is created. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import { useContextPreview } from "@/lib/hooks/context";
import { s } from "./styles";

export function ContextDocPreview({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useContextPreview(repoId, path);
  if (isLoading) return <div style={s.muted}>{t("previewLoading")}</div>;
  if (isError || !data) return <div style={s.error}>{t("previewError")}</div>;
  return (
    <div style={s.preview} aria-label={t("picker.previewOf", { path })}>
      <Markdown>{data.text}</Markdown>
    </div>
  );
}
