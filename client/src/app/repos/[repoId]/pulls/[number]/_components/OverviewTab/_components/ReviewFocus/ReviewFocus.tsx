"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Card, SectionLabel } from "@devdigest/ui";
import type { ReviewFocusItem } from "@devdigest/shared";
import { focusTarget } from "../../helpers";
import { s } from "./styles";

interface ReviewFocusProps {
  items: ReviewFocusItem[];
  /** Paths of the PR's changed files. */
  changedPaths: ReadonlySet<string>;
  repoFullName?: string | null;
  /** The brief's head SHA — pins GitHub links to the revision the model saw. */
  briefHeadSha: string;
  onOpenFile: (path: string) => void;
}

/** Full-width "read these first" list. Every item is `<file>:<line> — <reason>`, as plain text. */
export function ReviewFocus({ items, changedPaths, repoFullName, briefHeadSha, onOpenFile }: ReviewFocusProps) {
  const t = useTranslations("brief");
  return (
    <Card>
      <SectionLabel icon="ListChecks" right={<Badge color="var(--accent-text)" bg="var(--accent-bg)">{items.length}</Badge>}>
        {t("focus.title", { count: items.length })}
      </SectionLabel>
      {items.length === 0 ? (
        <p style={s.empty}>{t("focus.empty")}</p>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => {
            const target = focusTarget(item, changedPaths, repoFullName, briefHeadSha);
            const ref = `${item.file}:${item.line}`;
            return (
              <li key={`${i}-${ref}`} style={s.item}>
                {target.kind === "tab" ? (
                  <button type="button" className="mono" style={s.ref} onClick={() => onOpenFile(target.path)}>
                    {ref}
                  </button>
                ) : target.kind === "github" ? (
                  <a className="mono" style={s.link} href={target.url} target="_blank" rel="noopener noreferrer">
                    {ref}
                  </a>
                ) : (
                  <span className="mono" style={s.text}>
                    {ref}
                  </span>
                )}
                {` — ${item.reason}`}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
