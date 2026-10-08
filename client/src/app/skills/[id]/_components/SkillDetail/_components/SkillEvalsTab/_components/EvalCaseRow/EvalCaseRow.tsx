/* EvalCaseRow — one case's latest result: pass/fail, name, score vs threshold.
   Expands to the per-practice verdicts with the judge's verbatim evidence. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillEvalResult } from "@devdigest/shared";
import { formatScore } from "../../helpers";
import { s, verdictMark } from "./styles";

export function EvalCaseRow({ result }: { result: SkillEvalResult }) {
  const t = useTranslations("skills");
  const [open, setOpen] = React.useState(false);
  const panelId = React.useId();

  const scoreText =
    result.score == null
      ? t("evals.noScore")
      : result.threshold == null
        ? t("evals.scoreNoThreshold", { score: formatScore(result.score) })
        : t("evals.score", { score: formatScore(result.score), threshold: formatScore(result.threshold) });

  return (
    <div style={s.card}>
      <button
        type="button"
        style={s.head}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t(open ? "evals.collapse" : "evals.expand", { name: result.case_name })}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={verdictMark(result.outcome)} title={t(result.outcome ? "evals.pass" : "evals.fail")}>
          {result.outcome ? "✓" : "✗"}
        </span>
        <span style={s.name}>{result.case_name}</span>
        <span style={s.score}>{scoreText}</span>
        {result.grounded != null && (
          <span style={s.score}>{t("evals.grounded", { value: formatScore(result.grounded) })}</span>
        )}
        <span style={s.chevron} aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div id={panelId} style={s.body}>
          {result.practices.length === 0 && <p style={s.none}>{t("evals.noPractices")}</p>}
          {result.practices.map((p, i) => (
            <div key={i} style={s.practice}>
              <div style={s.practiceHead}>
                <span style={verdictMark(p.passed)} title={t(p.passed ? "evals.practicePassed" : "evals.practiceFailed")}>
                  {p.passed ? "✓" : "✗"}
                </span>
                <span>{p.practice}</span>
              </div>
              <span style={s.evidenceLabel}>{t("evals.evidenceLabel")}</span>
              {p.evidence ? (
                <blockquote style={s.evidence}>{p.evidence}</blockquote>
              ) : (
                <p style={s.none}>{t("evals.noEvidence")}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
