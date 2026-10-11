"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Chip } from "@devdigest/ui";
import { GITHUB_TOKEN_NAME, POST_AS_OPTIONS, SECRET_NAME, TRIGGER_VALUES, type PostAs, type Trigger } from "../../constants";
import { s as shared } from "../../styles";
import { s } from "./styles";

/** Step 3: triggers, the secrets the workflow needs (named, never collected) and how results are posted. */
export function ConfigureStep({
  triggers,
  onToggle,
  postAs,
  onPostAs,
}: {
  triggers: readonly Trigger[];
  onToggle: (t: Trigger) => void;
  postAs: PostAs;
  onPostAs: (p: PostAs) => void;
}) {
  const t = useTranslations("ci.exportWizard");
  return (
    <>
      <section>
        <div style={shared.sectionLabel}>{t("triggerLabel")}</div>
        <div style={s.chips} role="group" aria-label={t("triggerLabel")}>
          {TRIGGER_VALUES.map((v) => (
            <Chip key={v} active={triggers.includes(v)} onClick={() => onToggle(v)}>
              {t(`triggers.${v}`)}
            </Chip>
          ))}
        </div>
        {triggers.length === 0 && <div style={{ ...shared.muted, color: "var(--crit)" }}>{t("triggerNone")}</div>}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={shared.sectionLabel}>{t("secretsLabel")}</div>
        <div style={s.secretRow}>
          <span style={s.secretName}>{SECRET_NAME}</span>
          <span style={shared.muted}>{t("secretInstruction")}</span>
        </div>
        <div style={s.secretRow}>
          <span style={s.secretName}>{GITHUB_TOKEN_NAME}</span>
          <span style={shared.muted}>{t("githubTokenAuto")}</span>
        </div>
      </section>

      <section>
        <div style={shared.sectionLabel}>{t("postResultsLabel")}</div>
        <div role="radiogroup" aria-label={t("postResultsLabel")} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {POST_AS_OPTIONS.map((o, i) => (
            <label key={o.value} style={s.radio}>
              <input
                type="radio"
                name="ci-post-as"
                value={o.value}
                checked={postAs === o.value}
                onChange={() => onPostAs(o.value)}
              />
              {t(`postAs.${o.labelKey}`)}
              {i === 0 && (
                <Badge color="var(--ok)" bg="var(--ok-bg)">
                  {t("recommended")}
                </Badge>
              )}
            </label>
          ))}
        </div>
      </section>

      <div style={s.info}>
        <strong>{t("blockMergeTitle")}.</strong> {t("blockMergeInfo")}
      </div>
    </>
  );
}
