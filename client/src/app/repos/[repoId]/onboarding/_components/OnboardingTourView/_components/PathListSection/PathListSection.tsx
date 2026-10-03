import React from "react";
import { useTranslations } from "next-intl";
import type { OnboardingPathEntry, OnboardingSectionId, SectionOrigin } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "../../styles";
import { TourSection } from "../TourSection";

/** Critical paths and the reading path: numbered path, reason and an "Open" link (AC-92, AC-93, AC-97). */
export function PathListSection({
  id,
  origin,
  entries,
  fullName,
  commitSha,
  unavailable,
}: {
  id: Extract<OnboardingSectionId, "critical-paths" | "reading-path">;
  origin: SectionOrigin;
  entries: OnboardingPathEntry[];
  fullName: string;
  commitSha: string;
  /** The repo's language is not indexed (AC-102). */
  unavailable: boolean;
}) {
  const t = useTranslations("onboarding");
  return (
    <TourSection id={id} origin={origin}>
      {unavailable ? (
        <div style={s.notice}>{t("notice.unsupportedLanguage")}</div>
      ) : (
        <ol style={s.list}>
          {entries.map((e, i) => (
            <li key={`${e.path}#${i}`} style={s.row}>
              <span className="tnum" style={s.num}>
                {i + 1}
              </span>
              <div style={s.rowMain}>
                <code className="mono" style={s.path}>
                  {e.path}
                </code>
                {e.reason && <div style={s.reason}>{e.reason}</div>}
              </div>
              <a
                href={githubBlobUrl(fullName, commitSha, e.path)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("openFile", { path: e.path })}
                style={s.openLink}
              >
                {t("open")}
              </a>
            </li>
          ))}
        </ol>
      )}
    </TourSection>
  );
}
