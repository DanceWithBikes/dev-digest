import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { RunLocallySection as RunLocallyData } from "@devdigest/shared";
import { COPIED_MS } from "../../constants";
import { s } from "../../styles";
import { TourSection } from "../TourSection";

/** Numbered plain-text commands with source path, Copy and the risky marker (AC-94, AC-95, AC-96). */
export function RunLocallySection({ section }: { section: RunLocallyData }) {
  const t = useTranslations("onboarding");
  const [copied, setCopied] = React.useState<number | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const copy = (i: number, command: string) => {
    void navigator.clipboard?.writeText(command);
    setCopied(i);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  };

  return (
    <TourSection id="run-locally" origin={section.origin}>
      {section.steps.length === 0 ? (
        <div style={s.notice}>{t("runLocally.empty")}</div>
      ) : (
        <ol style={s.list}>
          {section.steps.map((step, i) => (
            <li key={`${step.command}#${i}`} style={s.step}>
              <span className="tnum" style={s.stepNum}>
                {i + 1}
              </span>
              <div style={s.rowMain}>
                <code className="mono" style={s.command}>
                  {step.command}
                </code>
                <div className="mono" style={s.source}>
                  {t("runLocally.source", { path: step.source_path })}
                </div>
              </div>
              {step.risky && <span style={s.risky}>{t("riskyMarker")}</span>}
              <Button
                kind="ghost"
                size="sm"
                icon={copied === i ? "Check" : "Copy"}
                aria-label={t("copyCommand", { n: i + 1 })}
                onClick={() => copy(i, step.command)}
              >
                {copied === i ? t("copied") : t("copy")}
              </Button>
            </li>
          ))}
        </ol>
      )}
    </TourSection>
  );
}
