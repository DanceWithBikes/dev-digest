/* BlastStats — the read-only "N symbols · N callers · N endpoints · N cron/jobs"
   row. Purely presentational: the parent already tallied the numbers. */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { BlastStatsResult } from "../../helpers";
import { s } from "./styles";

export function BlastStats({ stats }: { stats: BlastStatsResult }) {
  const t = useTranslations("blast");
  const items: { icon: keyof typeof Icon; count: number; label: string }[] = [
    { icon: "Code", count: stats.symbols, label: t("stat.symbols") },
    { icon: "CornerDownRight", count: stats.totalCallers, label: t("stat.callers") },
    { icon: "Globe", count: stats.endpoints, label: t("stat.endpoints") },
    { icon: "Clock", count: stats.crons, label: t("stat.crons") },
  ];
  return (
    <div style={s.row}>
      {items.map((item) => {
        const I = Icon[item.icon];
        return (
          <span key={item.label} style={s.item}>
            <I size={14} style={s.icon} />
            <span className="tnum" style={s.count}>
              {item.count}
            </span>
            <span>{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}
