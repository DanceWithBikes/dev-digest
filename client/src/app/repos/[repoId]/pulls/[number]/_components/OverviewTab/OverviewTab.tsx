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
      {/* Intent and Blast Radius are separate sections under a hairline, so the
          two cards never read as one block; each card carries its own title. */}
      <section>
        <IntentCard prId={prId} headSha={headSha} />
      </section>

      <hr style={s.sectionDivider} />

      <section>
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </section>

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
