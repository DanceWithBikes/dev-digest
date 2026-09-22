/* AgentCard — provider + model chips, skills count, enabled toggle. Stats are an
   A5 mount; we render the provider/model + skill count here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Badge, Modal, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { modelColor } from "./helpers";
import { DELETE_MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const [confirming, setConfirming] = React.useState(false);
  const color = modelColor(ag.model);

  const confirmDelete = () => {
    del.mutate(ag.id);
    setConfirming(false);
  };

  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title={t("card.delete.action")}
          aria-label={t("card.delete.action")}
          style={s.deleteBtn(del.isPending)}
        >
          <Icon.Trash size={14} style={del.isPending ? s.deleteSpinner : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        {/* Provider + model together: the same model name can be served by more
            than one provider, so the model alone doesn't identify the LLM. */}
        <span style={s.providerChip}>{ag.provider}</span>
        <span className="mono" style={s.modelChip(color)}>
          {ag.model}
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" icon="Sparkles">
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>

      {confirming && (
        // The card itself is clickable; keep modal clicks from selecting the agent.
        <div onClick={(e) => e.stopPropagation()}>
          <Modal
            width={DELETE_MODAL_WIDTH}
            title={t("card.delete.title")}
            onClose={() => setConfirming(false)}
            footer={
              <div style={s.deleteFooter}>
                <Button kind="ghost" onClick={() => setConfirming(false)}>
                  {t("card.delete.cancel")}
                </Button>
                <Button kind="danger" icon="Trash" onClick={confirmDelete} disabled={del.isPending}>
                  {del.isPending ? t("card.delete.deleting") : t("card.delete.confirm")}
                </Button>
              </div>
            }
          >
            <div style={s.deleteBody}>
              <div>{t("card.delete.body", { name: ag.name })}</div>
              <div style={s.deleteHint}>{t("card.delete.hint")}</div>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}
