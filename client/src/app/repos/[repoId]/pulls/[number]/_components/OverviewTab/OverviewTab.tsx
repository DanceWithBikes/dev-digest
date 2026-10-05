"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { usePrBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefSection } from "./_components/PrBriefSection";
import { RiskAreas } from "./_components/RiskAreas";
import { ReviewFocus } from "./_components/ReviewFocus";
import { newestReviewSummary } from "./helpers";
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
  /** The PR's changed files — decides where a review-focus item leads. */
  files: PrFile[];
  /** Opens a changed file on the Files changed tab. */
  onOpenFile: (path: string) => void;
}

export function OverviewTab({ prBody, prId, headSha, repoId, repoFullName, files, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("prReview");
  const { data: brief, isLoading: briefLoading } = usePrBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const changedPaths = React.useMemo(() => new Set(files.map((f) => f.path)), [files]);

  // Risk areas live inside the Intent card; a brief without intent swaps the card for a Risk areas card.
  const riskAreas = brief ? <RiskAreas risks={brief.risks.risks} card={!brief.intent} /> : null;
  const intent = brief && !brief.intent ? riskAreas : <IntentCard prId={prId} headSha={headSha} footer={brief ? riskAreas : undefined} />;

  return (
    <>
      <PrBriefSection
        prId={prId}
        brief={brief}
        isLoading={briefLoading}
        review={newestReviewSummary(reviews)}
        headSha={headSha}
      />

      {/* Intent and Blast Radius sit side by side (two columns) and stack on a narrow column. */}
      <div style={s.twoCol}>
        <section style={s.col}>{intent}</section>
        <section style={s.col}>
          <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
        </section>
      </div>

      {brief && (
        <ReviewFocus
          items={brief.review_focus}
          changedPaths={changedPaths}
          repoFullName={repoFullName}
          briefHeadSha={brief.head_sha}
          onOpenFile={onOpenFile}
        />
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
