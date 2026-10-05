/* SearchRootsEditor — edit and save the repo's document search roots (globs).
   A rejected root shows the server's own message from the 422 envelope. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useSaveContextRoots } from "@/lib/hooks/context";
import { parseRoots, rootsErrorMessage } from "../../helpers";
import { s } from "./styles";

export function SearchRootsEditor({
  repoId,
  roots,
  onClose,
}: {
  repoId: string;
  roots: string[];
  onClose: () => void;
}) {
  const t = useTranslations("context");
  const [text, setText] = React.useState(roots.join("\n"));
  const save = useSaveContextRoots(repoId);
  const message = save.isError ? (rootsErrorMessage(save.error) ?? t("roots.saveError")) : null;
  return (
    <div style={s.box}>
      <label htmlFor="ctx-roots" style={s.label}>
        {t("roots.label")}
      </label>
      <span style={s.hint}>{t("roots.hint")}</span>
      <textarea
        id="ctx-roots"
        className="mono"
        style={s.textarea}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-invalid={message ? true : undefined}
      />
      {message && (
        <div role="alert" style={s.error}>
          {message}
        </div>
      )}
      <div style={s.actions}>
        <Button
          kind="primary"
          size="sm"
          loading={save.isPending}
          disabled={save.isPending}
          onClick={() => save.mutate(parseRoots(text), { onSuccess: onClose })}
        >
          {save.isPending ? t("roots.saving") : t("roots.save")}
        </Button>
        <Button kind="secondary" size="sm" onClick={onClose}>
          {t("roots.cancel")}
        </Button>
      </div>
    </div>
  );
}
