"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  /** the PR's current head sha — passed through so IntentCard can flag a stale intent. */
  headSha?: string | null;
}

export function OverviewTab({ prBody, prId, headSha }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <>
      {/* PR Brief grid — IntentCard today; L04 Blast Radius and L05 PR Brief
          drop in beside it later. */}
      <section>
        <SectionLabel icon="Layers">{t("overview.prBrief")}</SectionLabel>
        <div style={s.briefGrid}>
          <IntentCard prId={prId} headSha={headSha} />
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
