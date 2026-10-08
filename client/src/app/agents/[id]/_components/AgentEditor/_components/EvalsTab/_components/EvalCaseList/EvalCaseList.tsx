/* EvalCaseList — the agent's cases with their expectations and last-run status.
   Names and notes are user text: rendered as plain text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { EvalCaseRecord } from "@devdigest/shared";
import { caseStatus, type CaseStatus } from "../../helpers";
import { s } from "./styles";

const STATUS_COLOR: Record<CaseStatus, { color: string; bg: string }> = {
  passed: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  neverRun: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

export function EvalCaseList({
  cases,
  onEdit,
  onDelete,
  deleting,
}: {
  cases: EvalCaseRecord[];
  onEdit: (c: EvalCaseRecord) => void;
  onDelete: (id: string) => void;
  deleting?: boolean;
}) {
  const t = useTranslations("eval");
  return (
    <div style={s.section}>
      <h3 style={s.h3}>{t("evalsTab.casesHeading")}</h3>
      {cases.length === 0 ? (
        <p style={s.empty}>{t("evalsTab.emptyCases")}</p>
      ) : (
        <ul style={s.list}>
          {cases.map((c) => {
            const status = caseStatus(c);
            return (
              <li key={c.id} style={s.item}>
                <div style={s.main}>
                  <div style={s.name}>{c.name}</div>
                  <ul style={s.expectations}>
                    {c.expected_output.expectations.map((e, i) => (
                      <li key={i} style={s.expectation}>
                        <Badge>{e.kind === "must_find" ? t("evalsTab.kinds.mustFind") : t("evalsTab.kinds.mustNotFlag")}</Badge>
                        <span className="mono">
                          {e.file}:{e.start_line}-{e.end_line}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Badge {...STATUS_COLOR[status]}>{t(`evalsTab.${status}`)}</Badge>
                <div style={s.actions}>
                  <Button size="sm" kind="secondary" onClick={() => onEdit(c)}>
                    {t("evalsTab.edit")}
                  </Button>
                  <Button size="sm" kind="danger" disabled={deleting} onClick={() => onDelete(c.id)}>
                    {t("evalsTab.delete")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
