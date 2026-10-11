/* AgentCard — one selectable agent on Configure run: accent + icon, name,
   description and the median time · cost estimate (or "—" / "no history"). */
import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Icon } from "@devdigest/ui";
import type { Agent, RunEstimate } from "@devdigest/shared";
import { formatSecondsCost, paletteAt } from "../../../../helpers";
import { s } from "./styles";

export function AgentCard({
  agent,
  index,
  checked,
  estimate,
  disabled = false,
  onChange,
}: {
  agent: Agent;
  index: number;
  checked: boolean;
  estimate: RunEstimate | undefined;
  /** The per-run agent cap is reached and this card is unchecked. */
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslations("runs");
  const { color, icon } = paletteAt(index);
  const I = Icon[icon];
  const hasEstimate =
    !!estimate && estimate.median_duration_ms != null && estimate.median_cost_usd != null;

  return (
    <div data-agent-card style={s.card(color, agent.enabled)}>
      <span style={s.icon(color)}>
        <I size={16} />
      </span>
      <div style={s.main}>
        {/* The vendor Checkbox has no `disabled`: block pointer input here, the view ignores the toggle. */}
        <div aria-disabled={disabled || undefined} style={disabled ? { opacity: 0.5, pointerEvents: "none" } : undefined}>
          <Checkbox checked={checked} onChange={onChange} label={<strong>{agent.name}</strong>} />
        </div>
        <div style={s.description}>{agent.description}</div>
      </div>
      <div className="tnum" style={s.estimate}>
        {hasEstimate ? (
          formatSecondsCost(estimate.median_duration_ms, estimate.median_cost_usd, t("page.none"))
        ) : (
          <>
            <span>{t("configure.noEstimate")}</span>
            <span style={s.hint}>{t("configure.noHistory")}</span>
          </>
        )}
      </div>
    </div>
  );
}
