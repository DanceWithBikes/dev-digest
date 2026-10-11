/* ScoreRing — the 0-100 score as a ring; a missing score renders the localized placeholder. */
import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@devdigest/ui";

export function ScoreRing({ score, size = 36 }: { score: number | null; size?: number }) {
  const t = useTranslations("runs");
  if (score == null) {
    return (
      <span
        aria-label={t("page.none")}
        style={{
          display: "grid",
          placeItems: "center",
          width: size,
          height: size,
          borderRadius: "50%",
          border: "3px solid var(--bg-hover)",
          color: "var(--text-muted)",
          fontSize: size * 0.3,
          flexShrink: 0,
        }}
      >
        {t("page.none")}
      </span>
    );
  }
  return <CircularScore score={score} size={size} stroke={3} />;
}
