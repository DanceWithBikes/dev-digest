/* DisagreementSection — "Where agents disagree": location groups with one
   take per agent, filtered to the conflicts by default. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, Toggle } from "@devdigest/ui";
import type { AgentColumn, ConflictTake, LocationGroup } from "@devdigest/shared";
import { takeLabel, visibleGroups } from "../../../../helpers";
import { s } from "./styles";

export function DisagreementSection({
  groups,
  columns,
}: {
  groups: LocationGroup[];
  columns: AgentColumn[];
}) {
  const t = useTranslations("runs");
  const [onlyConflicts, setOnlyConflicts] = React.useState(true);
  const rows = visibleGroups(groups, onlyConflicts);
  const label = t("conflicts.onlyConflicts");

  return (
    <section style={s.section} aria-label={t("conflicts.title")}>
      <div style={s.header}>
        <h2 style={s.title}>{t("conflicts.title")}</h2>
        <label style={s.toggleLabel}>
          {label}
          <Toggle on={onlyConflicts} onChange={setOnlyConflicts} />
        </label>
      </div>
      {rows.length === 0 && onlyConflicts ? (
        <div style={s.empty}>{t("conflicts.empty")}</div>
      ) : (
        rows.map((g) => (
          <div
            key={`${g.file}:${g.start_line}:${g.title}`}
            data-conflict-row={g.conflict ? "" : undefined}
            style={s.row(g.conflict)}
          >
            <div style={s.where}>
              <span className="mono" style={{ fontSize: 12 }}>
                {g.file}:{g.start_line}
              </span>
              <span style={s.title2}>{g.title}</span>
            </div>
            <div style={s.takes}>
              {/* The server returns exactly one take per column, in column order. */}
              {columns.map((c, i) => (
                <Take key={c.run_id} name={c.agent_name ?? t("page.deletedAgent")} take={g.takes[i]} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

function Take({ name, take }: { name: string; take: ConflictTake | undefined }) {
  const t = useTranslations("runs");
  const key = takeLabel(take?.verdict ?? "no_result");
  return (
    <span style={s.take}>
      <span>{name}</span>
      {key === "didNotFlag" || key === "noResult" ? (
        <span style={s.missing}>{t(`conflicts.${key}`)}</span>
      ) : (
        <SeverityBadge severity={key} />
      )}
    </span>
  );
}
