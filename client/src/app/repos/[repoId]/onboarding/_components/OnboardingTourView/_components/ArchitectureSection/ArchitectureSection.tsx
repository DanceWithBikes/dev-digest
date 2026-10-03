import React from "react";
import { useTranslations } from "next-intl";
import type { ArchitectureSection as ArchitectureData } from "@devdigest/shared";
import { s } from "../../styles";
import { ArchitectureDiagram } from "../ArchitectureDiagram";
import { TourMarkdown } from "../TourMarkdown";
import { TourSection } from "../TourSection";

/** Prose, diagram, then the indexed directories — the list is shown for both origins (AC-91, AC-107). */
export function ArchitectureSection({ section, fullName }: { section: ArchitectureData; fullName: string }) {
  const t = useTranslations("onboarding");
  return (
    <TourSection id="architecture" origin={section.origin}>
      <TourMarkdown fullName={fullName}>{section.prose}</TourMarkdown>
      <ArchitectureDiagram diagram={section.diagram} />
      {section.directories.length > 0 && (
        <div style={s.dirs}>
          <div style={s.dirsTitle}>{t("architecture.directories")}</div>
          <ul style={{ ...s.list, gap: 4 }}>
            {section.directories.map((d) => (
              <li key={d.path} style={s.dirRow}>
                <code className="mono" style={s.path}>
                  {d.path}
                </code>
                <span style={s.dirCount}>{t("architecture.fileCount", { count: d.files })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TourSection>
  );
}
