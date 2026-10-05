import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/lib/relative-time";
import type { OnboardingLastFailed, OnboardingStatus } from "@devdigest/shared";
import { s } from "../../styles";

/** The stale, status, last-failed and timeout banners (AC-85..89). */
export function StatusBanner({
  status,
  stale,
  lastFailed,
  timedOut,
}: {
  status: OnboardingStatus;
  stale: boolean;
  lastFailed: OnboardingLastFailed | null;
  timedOut: boolean;
}) {
  const t = useTranslations("onboarding");
  const relativeTime = useRelativeTime();
  const modelsLink = (st: OnboardingStatus) =>
    st === "llm_not_configured" ? (
      <Link href="/settings/models" style={s.bannerLink}>
        {t("banner.modelsLink")}
      </Link>
    ) : null;

  return (
    <>
      {timedOut && (
        <div role="status" style={{ ...s.banner, ...s.bannerWarn }}>
          {t("banner.timeout")}
        </div>
      )}
      {stale && (
        <div role="status" style={{ ...s.banner, ...s.bannerWarn }}>
          {t("banner.stale")}
        </div>
      )}
      {status !== "ready" && (
        <div role="status" style={s.banner}>
          <span>
            {t(`banner.status.${status}`)}
            {modelsLink(status)}
          </span>
        </div>
      )}
      {lastFailed && (
        <div role="status" style={{ ...s.banner, ...s.bannerWarn }}>
          <span>
            {t("banner.lastFailed", { time: relativeTime(lastFailed.at) })}{" "}
            {t(`banner.status.${lastFailed.status}`)}
            {modelsLink(lastFailed.status)}
          </span>
        </div>
      )}
    </>
  );
}
