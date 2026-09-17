/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { SeverityPills, countBySeverity, COUNT_KEY } from "@/components/findings-summary";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [sevFilter, setSevFilter] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Everything the run contributes, before the severity filter — the pills count
  // THIS, so a pill's number always equals the cards rendered under it.
  const base = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => countBySeverity(base), [base]);
  // Derived, not stored: the filter clears itself when its severity disappears
  // (e.g. "hide low confidence" removed the last WARNING), so the list can never
  // get stuck on an empty state with no pill left to click.
  const activeSev = sevFilter && counts[COUNT_KEY[sevFilter]] > 0 ? sevFilter : null;
  const shown = React.useMemo(
    () => (activeSev ? base.filter((f) => f.severity === activeSev) : base),
    [base, activeSev],
  );
  // Filtering shrinks the list under the keyboard cursor — clamp on render.
  const focus = Math.min(focusIdx, Math.max(shown.length - 1, 0));

  const toggleSeverity = (sev: Severity) => {
    setSevFilter((prev) => (prev === sev ? null : sev));
    setFocusIdx(0);
  };

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx(Math.min(focus + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx(Math.max(focus - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focus]) {
        action.mutate({ findingId: shown[focus]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focus, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <SeverityPills counts={counts} active={activeSev} onToggle={toggleSeverity} />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focus}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
