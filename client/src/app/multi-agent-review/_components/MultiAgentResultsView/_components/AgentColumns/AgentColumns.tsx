/* AgentColumns — Columns mode: one column per agent, in `columns` order. */
import React from "react";
import type { AgentColumn as AgentColumnData, FindingActionKind } from "@devdigest/shared";
import { AgentColumn } from "../AgentColumn";

export function AgentColumns({
  columns,
  pendingAction,
  onAction,
  onViewTrace,
  onStreamEnd,
  traceRunId,
  prNumber,
  onCloseTrace,
}: {
  columns: AgentColumnData[];
  pendingAction: boolean;
  onAction: (findingId: string, action: FindingActionKind) => void;
  onViewTrace: (column: AgentColumnData) => void;
  onStreamEnd: () => void;
  traceRunId: string | null;
  prNumber?: number | null;
  onCloseTrace: () => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(280px, 1fr))`,
        gap: 14,
        alignItems: "start",
        overflowX: "auto",
      }}
    >
      {columns.map((col, i) => (
        <AgentColumn
          key={col.run_id}
          column={col}
          index={i}
          pendingAction={pendingAction}
          onAction={onAction}
          onViewTrace={onViewTrace}
          onStreamEnd={onStreamEnd}
          traceOpen={traceRunId === col.run_id}
          prNumber={prNumber}
          onCloseTrace={onCloseTrace}
        />
      ))}
    </div>
  );
}
