import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { OnboardingSectionId, SectionOrigin } from "@devdigest/shared";
import { SECTION_ICONS } from "../../constants";
import { s } from "../../styles";

/** One tour section: anchor, heading, and the "Outline · no AI" label for a skeleton (AC-90). */
export function TourSection({
  id,
  origin,
  children,
}: {
  id: OnboardingSectionId;
  origin: SectionOrigin;
  children: React.ReactNode;
}) {
  const t = useTranslations("onboarding");
  const I = Icon[SECTION_ICONS[id]];
  return (
    <section id={id} aria-labelledby={`${id}-title`} style={s.section}>
      <div style={s.sectionHead}>
        <div style={s.sectionIcon}>
          <I size={15} />
        </div>
        <h2 id={`${id}-title`} style={s.sectionTitle}>
          {t(`sections.${id}`)}
        </h2>
        {origin === "skeleton" && <Badge>{t("outline")}</Badge>}
      </div>
      <div style={s.sectionBody}>{children}</div>
    </section>
  );
}
