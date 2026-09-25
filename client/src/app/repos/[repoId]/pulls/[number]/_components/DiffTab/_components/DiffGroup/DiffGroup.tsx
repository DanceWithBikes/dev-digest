/* DiffGroup — one Smart Diff role group (Rule 1): collapsible header with the
   role label, plus a files/findings summary while collapsed. Owns its own
   open state, independent of the individual FileCards inside it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffGroup } from "@devdigest/shared";
import { roleLabelKey } from "../../helpers";
import { s, chevronFor } from "./styles";

export function DiffGroup({
  group,
  pathsWithFindings,
  children,
}: {
  group: SmartDiffGroup;
  /**
   * Paths that have at least one finding, derived client-side from
   * `usePrReviews` (the same source `DiffTab` hands the viewer for anchoring)
   * — not from `group.files[].finding_lines`, so the collapsed count and the
   * per-file dot always agree (they read the one source).
   */
  pathsWithFindings: Set<string>;
  children: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(true);
  const withFindingsCount = group.files.filter((f) => pathsWithFindings.has(f.path)).length;

  return (
    <div style={s.group}>
      <div onClick={() => setOpen((o) => !o)} style={s.header}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={s.label}>{t(`smartDiff.${roleLabelKey(group.role)}`)}</span>
        {!open && (
          <span style={s.summary}>
            {t("smartDiff.filesCount", { count: group.files.length })}
            {withFindingsCount > 0 && (
              <> · {t("smartDiff.filesWithFindings", { count: withFindingsCount })}</>
            )}
          </span>
        )}
      </div>
      {open && <div style={s.body}>{children}</div>}
    </div>
  );
}
