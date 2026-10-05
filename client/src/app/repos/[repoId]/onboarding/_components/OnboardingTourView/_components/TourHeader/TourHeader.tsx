import React from "react";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/lib/relative-time";
import { Button } from "@devdigest/ui";
import type { OnboardingTour } from "@devdigest/shared";
import { COPIED_MS } from "../../constants";
import { formatCost, isPartialIndex, modelCallMade } from "../../helpers";
import { s } from "../../styles";

/** Title, coverage line, model and cost, Regenerate and Share link (AC-72..74, AC-78, AC-79, AC-101). */
export function TourHeader({
  tour,
  busy,
  onRegenerate,
}: {
  tour: OnboardingTour;
  busy: boolean;
  onRegenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const relativeTime = useRelativeTime();
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const share = () => {
    // The anchor of the current section is whatever the URL fragment holds.
    const { origin, pathname, hash } = window.location;
    void navigator.clipboard?.writeText(`${origin}${pathname}${hash}`);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  const time = relativeTime(tour.generated_at);
  const coverage = isPartialIndex(tour)
    ? t("header.partial", { indexed: tour.indexed_files, candidates: tour.candidate_files, time })
    : t("header.generatedFrom", { count: tour.indexed_files, time });
  const provenance = modelCallMade(tour)
    ? [
        t("header.model", { model: tour.model }),
        t("header.cost", {
          cost: tour.cost_usd == null ? t("header.costUnknown") : formatCost(tour.cost_usd),
        }),
      ].join(" · ")
    : t("header.noModelCall");

  return (
    <div style={s.header}>
      <div style={s.headerText}>
        <h1 style={s.h1}>{t("pageTitle", { name: tour.repo_full_name })}</h1>
        <p style={s.meta}>{coverage}</p>
        <p style={s.meta}>{provenance}</p>
      </div>
      <div style={s.actions}>
        {copied && (
          <span role="status" style={s.copied}>
            {t("linkCopied")}
          </span>
        )}
        <Button kind="ghost" size="sm" icon="RefreshCw" loading={busy} disabled={busy} onClick={onRegenerate}>
          {busy ? t("generating") : t("regenerate")}
        </Button>
        <Button kind="secondary" size="sm" icon="Link" onClick={share}>
          {t("share")}
        </Button>
      </div>
    </div>
  );
}
