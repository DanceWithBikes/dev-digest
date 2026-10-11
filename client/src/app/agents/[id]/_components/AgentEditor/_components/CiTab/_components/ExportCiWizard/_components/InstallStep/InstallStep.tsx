"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiExportResult } from "@devdigest/shared";
import { safeHttpUrl } from "@/lib/github-urls";
import type { InstallMode } from "../../constants";
import { s } from "../../styles";

/** Step 4: pick PR or zip; shows the PR link, the download note or the server's error. */
export function InstallStep({
  mode,
  onMode,
  repo,
  fileCount,
  result,
  errorMessage,
}: {
  mode: InstallMode;
  onMode: (m: InstallMode) => void;
  repo: string;
  fileCount: number;
  result: CiExportResult | undefined;
  errorMessage: string | null;
}) {
  const t = useTranslations("ci.exportWizard");

  if (result?.mode === "open_pr") {
    const href = safeHttpUrl(result.pr_url);
    return (
      <div data-testid="ci-install-done">
        <div style={s.cardTitle}>{t("prOpened")}</div>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontSize: 13 }}>
            {t("prLink")}
          </a>
        ) : (
          <span style={s.muted}>{result.pr_url}</span>
        )}
      </div>
    );
  }
  if (result?.mode === "zip") {
    return (
      <div data-testid="ci-install-done">
        <div style={s.cardTitle}>{t("zipDownloaded")}</div>
        <div style={s.muted}>{result.filename}</div>
      </div>
    );
  }

  const options: { value: InstallMode; title: string; body: string; recommended: boolean }[] = [
    { value: "open_pr", title: t("installCardTitle"), body: t("installCardBody", { repo, count: fileCount }), recommended: true },
    { value: "zip", title: t("installZip"), body: t("installZipBody", { repo }), recommended: false },
  ];

  return (
    <>
      <div role="radiogroup" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map((o) => (
          <label key={o.value} style={s.card(mode === o.value)}>
            <input
              type="radio"
              name="ci-install-mode"
              value={o.value}
              checked={mode === o.value}
              onChange={() => onMode(o.value)}
            />
            <div>
              <div style={s.cardTitle}>
                {o.title}
                {o.recommended && (
                  <Badge color="var(--ok)" bg="var(--ok-bg)">
                    {t("recommended")}
                  </Badge>
                )}
              </div>
              <div style={s.cardBody}>{o.body}</div>
            </div>
          </label>
        ))}
      </div>
      {errorMessage && (
        <div style={s.error} role="alert" data-testid="ci-install-error">
          {errorMessage}
        </div>
      )}
    </>
  );
}
