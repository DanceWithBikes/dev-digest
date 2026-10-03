import React from "react";
import { useTranslations } from "next-intl";
import { MonoLink } from "@devdigest/ui";
import type { FirstTasksSection as FirstTasksData } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "../../styles";
import { TourMarkdown } from "../TourMarkdown";
import { TourSection } from "../TourSection";

/** First tasks: title, description and every cited path as a link (AC-98, AC-103). */
export function FirstTasksSection({
  section,
  fullName,
  commitSha,
}: {
  section: FirstTasksData;
  fullName: string;
  commitSha: string;
}) {
  const t = useTranslations("onboarding");
  return (
    <TourSection id="first-tasks" origin={section.origin}>
      {section.tasks.length === 0 ? (
        <div style={s.notice}>{t("notice.noTasks")}</div>
      ) : (
        <div style={s.tasks}>
          {section.tasks.map((task, i) => (
            <div key={`${task.title}#${i}`} style={s.task}>
              <div style={s.taskTitle}>{task.title}</div>
              <div style={s.taskDesc}>
                <TourMarkdown fullName={fullName}>{task.description}</TourMarkdown>
              </div>
              {task.paths.map((p) => (
                <MonoLink key={p} href={githubBlobUrl(fullName, commitSha, p)}>
                  {p}
                </MonoLink>
              ))}
            </div>
          ))}
        </div>
      )}
    </TourSection>
  );
}
