"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  /** the PR's current head sha — passed through so IntentCard can flag a stale intent
      and BlastRadiusCard can deep-link callers to GitHub. */
  headSha?: string | null;
  /** BlastRadiusCard's Resync affordance and its "owner/repo" GitHub links. */
  repoId: string | null;
  repoFullName?: string | null;
}

export function OverviewTab({ prBody, prId, headSha, repoId, repoFullName }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      {/* PR Brief grid — IntentCard + BlastRadiusCard today; L05 PR Brief
          drops in beside them later. */}
      <section>
        <SectionLabel icon="Layers">{t("overview.prBrief")}</SectionLabel>
        <div style={s.briefGrid}>
          <IntentCard prId={prId} headSha={headSha} />
          <div style={s.briefFull}>
            <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
          </div>
        </div>
      </section>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
