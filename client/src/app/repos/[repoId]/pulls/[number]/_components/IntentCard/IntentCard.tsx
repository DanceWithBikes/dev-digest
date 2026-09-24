/* IntentCard — the PR's derived motivation and scope (L03 Intent Layer).
   Markup ported from the design bundle's `IntentBlock`; the re-run affordance
   is new (the design lacks it) — built from primitives verified to exist in
   @devdigest/ui. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Button, EmptyState, Skeleton, Icon } from "@devdigest/ui";
import { usePrIntent, useDetectPrIntent } from "../../../../../../../lib/hooks/reviews";
import { s } from "./styles";

export function IntentCard({
  prId,
  headSha,
}: {
  prId: string | null;
  /** The PR's current head sha — compared to the stored intent's to flag it stale. */
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const { data: intent, isLoading } = usePrIntent(prId);
  const detect = useDetectPrIntent(prId);
  // prId is expected non-null whenever this card is on screen (the PR is
  // already loaded); guard anyway so a stray render never fires a broken call.
  const handleDetect = () => {
    if (prId) detect.mutate();
  };

  if (isLoading) {
    return (
      <Card>
        <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
        <Skeleton height={16} style={{ marginBottom: 10 }} />
        <Skeleton height={60} />
      </Card>
    );
  }

  if (!intent) {
    return (
      <Card>
        <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
        <EmptyState
          icon="Target"
          title={t("intent.empty")}
          cta={t("intent.detect")}
          onCta={handleDetect}
          ctaLoading={detect.isPending}
        />
      </Card>
    );
  }

  // Stale intent — the "out of date" affordance next to the re-run button.
  // The server derives this (head sha moved OR the PR description changed since
  // classification; a description edit moves no commit, so the sha comparison
  // below cannot see it). The local comparison stays as the fallback for a
  // server that predates the `stale` field.
  const outOfDate = intent.stale ?? (!!intent.head_sha && !!headSha && intent.head_sha !== headSha);

  // `missing_context[]` is the server's human-readable rendering of exactly the
  // sources that failed, one entry per `ok: false` attempt — so rendering both
  // lists stated every gap twice ("body could not be read" above "PR
  // description is empty"). Prefer the readable one; the generic per-source
  // line is only a fallback for a record stored before missing_context existed.
  const failedSources = (intent.sources ?? []).filter((source) => !source.ok);
  const missingContext = intent.missing_context ?? [];
  // A spec attempt with no ref means the PR referenced no spec or plan at all.
  // That is an absence, not a failure to read something — it gets its own muted
  // line and is kept out of the amber warnings, which most PRs would otherwise
  // carry just for not linking a spec.
  const noSpecLinked = failedSources.some(
    (source) => source.kind === "spec" && source.ref === null,
  );
  const warnings =
    missingContext.length > 0
      ? missingContext
      : failedSources
          .filter((source) => !(source.kind === "spec" && source.ref === null))
          .map((source) => t("intent.sourceUnavailable", { kind: source.kind }));

  return (
    <Card>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.rerunWrap}>
            {outOfDate && <span style={s.outOfDate}>{t("intent.outOfDate")}</span>}
            <Button kind="ghost" size="sm" icon="RefreshCw" loading={detect.isPending} onClick={handleDetect}>
              {t("intent.rerun")}
            </Button>
          </div>
        }
      >
        {t("intent.title")}
      </SectionLabel>

      <p style={s.summary}>”{intent.intent}”</p>

      <div style={s.grid}>
        <div>
          <div style={s.inScopeHeader}>
            <Icon.Check size={13} />
            {t("intent.inScope")}
          </div>
          <ul style={s.list}>
            {intent.in_scope.map((item, i) => (
              <li key={i} style={s.inScopeItem}>
                <span style={s.inScopeBullet}>·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div style={s.outOfScopeHeader}>
            <Icon.X size={13} />
            {t("intent.outOfScope")}
          </div>
          {intent.out_of_scope.length > 0 ? (
            <ul style={s.list}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i} style={s.outOfScopeItem}>
                  <span style={s.outOfScopeBullet}>·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={s.outOfScopeEmpty}>{t("intent.outOfScopeEmpty")}</p>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={s.warningsWrap}>
          {warnings.map((msg, i) => (
            <div key={`warning-${i}`} style={s.warnLine}>
              {msg}
            </div>
          ))}
        </div>
      )}

      {noSpecLinked && (
        <div style={s.noteRow}>
          <Icon.FileText size={13} />
          <span>{t("intent.noSpecLinked")}</span>
        </div>
      )}
    </Card>
  );
}
