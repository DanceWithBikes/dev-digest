"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/lib/relative-time";
import { Badge, Button, Card, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { useGeneratePrBrief } from "@/lib/hooks/brief";
import { VerdictBanner } from "../../../VerdictBanner";
import { isBriefStale, shortSha, type ReviewSummary } from "../../helpers";
import { s } from "./styles";

interface PrBriefSectionProps {
  prId: string | null;
  brief: PrBrief | null | undefined;
  isLoading: boolean;
  /** Newest completed review, or null when the PR has none. */
  review: ReviewSummary | null;
  /** The PR's current head sha — a different brief head marks the brief stale. */
  headSha?: string | null;
}

type Clicked = "generate" | "regenerate" | "retry";

export function PrBriefSection({ prId, brief, isLoading, review, headSha }: PrBriefSectionProps) {
  const t = useTranslations("brief");
  const tp = useTranslations("prReview");
  const relativeTime = useRelativeTime();
  const generate = useGeneratePrBrief(prId);
  // Which button the user pressed — only that one shows the spinner, both stay disabled.
  const [clicked, setClicked] = React.useState<Clicked | null>(null);
  const run = (from: Clicked) => {
    if (!prId) return;
    setClicked(from);
    generate.mutate();
  };
  const pending = generate.isPending;
  // Retry vanishes while its request is pending (the error resets), so its spinner moves to the main button.
  const spinning: Clicked | null = clicked === "retry" ? (brief ? "regenerate" : "generate") : clicked;

  let body: React.ReactNode;
  if (isLoading) {
    body = <Skeleton height={96} />;
  } else if (!brief) {
    body = (
      <Card>
        <p style={s.hint}>{t("generateHint")}</p>
        <div style={s.stack}>
          <div>
            <Button kind="primary" icon="Sparkles" loading={pending && spinning === "generate"} disabled={pending || !prId} onClick={() => run("generate")}>
              {t("generate")}
            </Button>
          </div>
          {generate.isError && (
            <div role="alert" style={s.error}>
              <span>{t("generateError")}</span>
              <Button size="sm" disabled={pending} onClick={() => run("retry")}>
                {t("retry")}
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  } else {
    const time = relativeTime(brief.generated_at);
    body = (
      <div style={s.stack}>
        <VerdictBanner
          verdict={review?.verdict ?? null}
          summary={brief.summary}
          score={review?.score ?? null}
          findingsCount={review?.findingsCount ?? 0}
          blockers={review?.blockers ?? 0}
          run={{ cost_usd: brief.cost_usd, tokens_in: brief.tokens_in, tokens_out: brief.tokens_out }}
          meta={
            <>
              <span>{t("generatedAt", { time, model: brief.model })}</span>
              {isBriefStale(brief, headSha) && (
                <Badge color="var(--warn)" bg="var(--warn-bg)">
                  {t("stale", { sha: shortSha(brief.head_sha) })}
                </Badge>
              )}
            </>
          }
          actions={
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              aria-label={t("regenerate")}
              title={t("regenerate")}
              loading={pending && spinning === "regenerate"}
              disabled={pending}
              onClick={() => run("regenerate")}
            />
          }
        />
        {generate.isError && (
          <div role="alert" style={s.error}>
            <span>{t("generateError")}</span>
            <Button size="sm" disabled={pending} onClick={() => run("retry")}>
              {t("retry")}
            </Button>
          </div>
        )}
        {brief.missing.length > 0 && (
          <div style={s.missing}>
            <div style={s.missingTitle}>{t("missing.title")}</div>
            <ul style={s.missingList}>
              {brief.missing.map((m, i) => (
                <li key={`${i}-${m.source}`}>
                  <span style={s.missingSource}>{t(`missing.source.${m.source}`)}</span>
                  {` — ${m.reason}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <section>
      <SectionLabel icon="FileText">{tp("overview.prBrief")}</SectionLabel>
      {body}
    </section>
  );
}
