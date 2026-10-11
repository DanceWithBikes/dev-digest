/* ConfigureRunView — /multi-agent-review/new: step 1 picks a PR of the active
   repo, step 2 the agents to fan out, the footer launches the run. The PR and
   the selection are derived from what the user changed on top of the defaults
   (`?pr=`, every enabled agent), never copied into state. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, SearchableSelect } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useRunEstimates } from "@/lib/hooks/multi-agent";
import { useRunReview } from "@/lib/hooks/reviews";
import { useActiveRepo } from "@/lib/repo-context";
import { MAX_AGENTS_PER_RUN, initialAgentSelection } from "@/lib/multi-agent";
import { estimateTotals } from "../../helpers";
import { AgentCard } from "./_components/AgentCard";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("runs");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const { data: pulls } = usePulls(activeRepo?.id);
  const { data: agents } = useAgents();
  const { data: estimates } = useRunEstimates();
  const run = useRunReview();

  const [chosenPr, setChosenPr] = React.useState<string | null>(null);
  const [checkedOverride, setCheckedOverride] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const paramPr = search.get("pr");
  const listed = (pulls ?? []).filter((p) => !!p.id);
  // A `?pr=` that is not in the active repo's list is ignored (Step 1 stays
  // unselected): the URL must not make another repo's PR launchable.
  const prs = listed;
  const prId = chosenPr ?? (paramPr && prs.some((p) => p.id === paramPr) ? paramPr : null);

  const all = agents ?? [];
  const checkedSet = new Set(checkedOverride ?? initialAgentSelection(all));
  // Launch order = list order, whatever order the boxes were ticked in.
  const checkedIds = all.filter((a) => checkedSet.has(a.id)).map((a) => a.id);
  const totals = estimateTotals(checkedIds, estimates ?? []);

  const atCap = checkedIds.length >= MAX_AGENTS_PER_RUN;

  const toggle = (id: string, on: boolean) => {
    if (on && atCap) return;
    const next = new Set(checkedSet);
    if (on) next.add(id);
    else next.delete(id);
    setCheckedOverride([...next]);
  };

  const launch = async () => {
    if (!prId) return;
    setError(null);
    try {
      const res = await run.mutateAsync({ prId, agentIds: checkedIds });
      if (res.multi_agent_run_id) router.push(`/multi-agent-review/${res.multi_agent_run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const crumb = [
    { label: t("page.crumb"), href: "/multi-agent-review" },
    { label: t("configure.crumb") },
  ];

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("configure.title")}</h1>
        <p style={s.subtitle}>{t("configure.subtitle")}</p>

        <section style={s.step}>
          <div style={s.stepHeader}>
            <span style={s.stepTitle}>1 · {t("configure.step1")}</span>
          </div>
          <SearchableSelect
            mono={false}
            value={prId ?? ""}
            onChange={setChosenPr}
            placeholder={t("configure.selectPr")}
            options={prs.map((p) => ({
              value: p.id as string,
              label: t("configure.prItem", { number: p.number, title: p.title }),
            }))}
          />
        </section>

        <section style={s.step}>
          <div style={s.stepHeader}>
            <span style={s.stepTitle}>2 · {t("configure.step2")}</span>
            {prId && (
              <Button
                kind="ghost"
                size="sm"
                onClick={() => setCheckedOverride(all.slice(0, MAX_AGENTS_PER_RUN).map((a) => a.id))}
              >
                {t("configure.selectAll")}
              </Button>
            )}
          </div>
          {prId && atCap && (
            <div role="status" style={s.capHint}>
              {t("configure.maxAgents", { max: MAX_AGENTS_PER_RUN })}
            </div>
          )}
          {prId ? (
            <div style={s.cards}>
              {all.map((a, i) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  index={i}
                  checked={checkedSet.has(a.id)}
                  disabled={atCap && !checkedSet.has(a.id)}
                  estimate={estimates?.find((e) => e.agent_id === a.id)}
                  onChange={(on) => toggle(a.id, on)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="GitPullRequest"
              title={t("configure.pickPrFirst")}
              body={t("configure.pickPrFirstBody")}
            />
          )}
        </section>

        <div style={s.footer}>
          <Button
            kind="primary"
            size="lg"
            icon="Sparkles"
            disabled={!prId || checkedIds.length === 0}
            loading={run.isPending}
            onClick={launch}
          >
            {t("configure.run", { count: checkedIds.length })}
          </Button>
          {checkedIds.length > 0 && (
            <span className="tnum" style={s.total}>
              {t("configure.total", {
                seconds: totals.maxSeconds.toFixed(1),
                cost: `$${totals.sumCost.toFixed(2)}`,
              })}{" "}
              {totals.partial && <Badge color="var(--warn)">{t("configure.partial")}</Badge>}
            </span>
          )}
        </div>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}
      </div>
    </AppShell>
  );
}
