/* RunReviewPopover — the PR header's "Run Review" button. Opens a popover with
   one checkbox per agent; the primary button launches one multi-agent review
   (POST /pulls/:id/review with agentIds) and opens its results page. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, Popover } from "@devdigest/ui";
import { useAgents } from "@/lib/hooks/agents";
import { useRunReview } from "@/lib/hooks/reviews";
import { MAX_AGENTS_PER_RUN, initialAgentSelection } from "@/lib/multi-agent";
import { POPOVER_WIDTH } from "./constants";
import { s } from "./styles";

export function RunReviewPopover({
  prId,
  warnMerged = false,
}: {
  prId: string;
  /** PR is already merged/closed: dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const all = agents ?? [];
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setSelected(initialAgentSelection(all));
      setError(null);
    }
    setOpen(next);
  };

  const atCap = selected.length >= MAX_AGENTS_PER_RUN;

  const toggle = (id: string, checked: boolean) =>
    setSelected((cur) =>
      checked
        ? cur.length >= MAX_AGENTS_PER_RUN || cur.includes(id)
          ? cur
          : [...cur, id]
        : cur.filter((x) => x !== id),
    );

  const launch = async () => {
    setError(null);
    try {
      const res = await run.mutateAsync({ prId, agentIds: selected });
      if (res.multi_agent_run_id) router.push(`/multi-agent-review/${res.multi_agent_run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      align="right"
      width={POPOVER_WIDTH}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind="primary" size="sm" iconRight="ChevronDown" icon="Sparkles">
            {t("runReview.runReview")}
          </Button>
        </span>
      }
    >
      <div style={s.headerRow}>
        <span style={s.heading}>{t("runReview.pickAgents")}</span>
        <Button kind="ghost" size="sm" onClick={() => setSelected([])}>
          {t("runReview.clear")}
        </Button>
      </div>
      {warnMerged && (
        <div style={s.warning}>
          <Icon.AlertTriangle size={13} />
          {t("runReview.mergedWarning")}
        </div>
      )}
      {atCap && (
        <div role="status" style={s.hint}>
          {t("runReview.maxAgents", { max: MAX_AGENTS_PER_RUN })}
        </div>
      )}
      <div style={s.list}>
        {all.map((a) => (
          <div
            key={a.id}
            aria-disabled={atCap && !selected.includes(a.id) ? true : undefined}
            style={{
              ...s.row(a.enabled),
              ...(atCap && !selected.includes(a.id) ? { opacity: 0.5, pointerEvents: "none" } : {}),
            }}
          >
            <Checkbox
              checked={selected.includes(a.id)}
              onChange={(v) => toggle(a.id, v)}
              label={a.name}
            />
            <span style={s.model}>{a.model}</span>
          </div>
        ))}
      </div>
      {error && (
        <div role="alert" style={s.error}>
          {error}
        </div>
      )}
      <div style={s.footer}>
        <Button
          kind="primary"
          size="md"
          disabled={selected.length === 0}
          loading={run.isPending}
          onClick={launch}
        >
          {t("runReview.runMulti", { count: selected.length })}
        </Button>
        <Button kind="ghost" size="sm" icon="Settings" onClick={() => router.push(`/multi-agent-review/new?pr=${prId}`)}>
          {t("runReview.configureAgents")}
        </Button>
      </div>
    </Popover>
  );
}
