import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingSectionId } from "@devdigest/shared";
import { SECTION_IDS } from "../../constants";
import { s } from "../../styles";

/** "On this page": the five sections in tour order (AC-75, AC-76). */
export function TourToc({
  activeId,
  onSelect,
}: {
  activeId: OnboardingSectionId;
  onSelect: (id: OnboardingSectionId) => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <nav aria-label={t("toc.aria")} style={s.tocWrap}>
      <div style={s.toc}>
        <div style={s.tocTitle}>{t("toc.title")}</div>
        {SECTION_IDS.map((id) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={id === activeId ? "location" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onSelect(id);
            }}
            style={s.tocLink(id === activeId)}
          >
            {t(`sections.${id}`)}
          </a>
        ))}
      </div>
    </nav>
  );
}
