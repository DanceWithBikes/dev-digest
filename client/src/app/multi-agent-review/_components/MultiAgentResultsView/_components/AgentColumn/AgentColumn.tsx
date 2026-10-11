/* AgentColumn — one agent's column: header (icon, name, time · cost, score,
   status), a body that is the live log while the run is running, the error
   when it failed and the finding cards otherwise, and the trace/count footer.
   A running column holds its own SSE subscription (one per column) and shares
   it with the trace drawer while that is open on it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, LiveLogStream } from "@devdigest/ui";
import type { AgentColumn as AgentColumnData, FindingActionKind } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { RunTraceDrawer, eventsToLog } from "@/components/run-trace-drawer";
import { useRunEvents } from "@/lib/hooks/reviews";
import { formatSecondsCost, paletteAt } from "../../../../helpers";
import { ScoreRing } from "../ScoreRing";
import { s } from "./styles";

const STATUS_COLOR: Record<AgentColumnData["status"], string> = {
  queued: "var(--text-muted)",
  running: "var(--warn)",
  done: "var(--ok)",
  failed: "var(--crit)",
  cancelled: "var(--text-muted)",
};

export function AgentColumn({
  column,
  index,
  pendingAction,
  onAction,
  onViewTrace,
  onStreamEnd,
  traceOpen,
  prNumber,
  onCloseTrace,
}: {
  column: AgentColumnData;
  index: number;
  pendingAction: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  onViewTrace: (column: AgentColumnData) => void;
  /** Called when the live stream ends so the parent run is refetched. */
  onStreamEnd: () => void;
  /** The trace drawer is open for this column's run. */
  traceOpen: boolean;
  prNumber?: number | null;
  onCloseTrace: () => void;
}) {
  const t = useTranslations("runs");
  const { color, icon } = paletteAt(index);
  const I = Icon[icon];
  // Only a running column opens its stream (the server runs at most 4 at once);
  // a queued one just shows its status and opens it when it starts running.
  const { events, running: streaming } = useRunEvents(column.status === "running" ? [column.run_id] : []);

  // Stream closed (run settled): pull the persisted findings in.
  const wasStreaming = React.useRef(false);
  React.useEffect(() => {
    if (wasStreaming.current && !streaming) onStreamEnd();
    wasStreaming.current = streaming;
  }, [streaming, onStreamEnd]);

  let body: React.ReactNode;
  if (column.status === "running") {
    body = <LiveLogStream log={eventsToLog(events)} running height={220} />;
  } else if (column.status === "queued") {
    body = <div style={s.muted}>{t("column.queuedBody")}</div>;
  } else if (column.status === "cancelled") {
    body = <div style={s.muted}>{t("column.cancelledBody")}</div>;
  } else if (column.status === "failed") {
    body = <div style={s.error}>{column.error}</div>;
  } else if (column.findings.length === 0) {
    body = <div style={s.muted}>{t("column.noFindings")}</div>;
  } else {
    body = column.findings.map((f) => (
      <FindingCard
        key={f.id}
        f={f}
        showLearn
        pending={pendingAction}
        onAction={(act) => onAction(f.id, act)}
      />
    ));
  }

  return (
    <div data-agent-column style={s.column(color)}>
      <div style={s.header}>
        <span style={s.icon(color)}>
          <I size={18} />
        </span>
        <div style={s.headMain}>
          <div style={s.name}>{column.agent_name ?? t("page.deletedAgent")}</div>
          <div className="tnum" style={s.stat}>
            {formatSecondsCost(column.duration_ms, column.cost_usd, t("page.none"))}
          </div>
        </div>
        <ScoreRing score={column.score} />
      </div>
      <div style={{ ...s.body, paddingBottom: 0 }}>
        <Badge color={STATUS_COLOR[column.status]} dot>
          {t(`page.columnStatus.${column.status}`)}
        </Badge>
      </div>
      <div style={s.body}>{body}</div>
      <div style={s.footer}>
        <Button kind="ghost" size="sm" onClick={() => onViewTrace(column)}>
          {t("viewTrace")}
        </Button>
        <span>{t("column.findingsCount", { count: column.findings.length })}</span>
      </div>
      {/* A running column already holds the run's only connection: the drawer
          reads its stream instead of opening a second one (NFR-7). */}
      {traceOpen && column.status === "running" && (
        <RunTraceDrawer
          runId={column.run_id}
          agentName={column.agent_name}
          prNumber={prNumber}
          findings={column.findings}
          running
          stream={{ events, running: streaming }}
          onClose={onCloseTrace}
        />
      )}
    </div>
  );
}
