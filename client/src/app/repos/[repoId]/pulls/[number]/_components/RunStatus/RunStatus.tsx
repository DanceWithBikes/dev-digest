/* RunStatus — live SSE status for in-flight review runs. Subscribes to the
   run event streams and renders the shared LiveLogStream. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LiveLogStream, type LogLine } from "@devdigest/ui";
import { useRunEvents } from "../../../../../../../lib/hooks/reviews";
import { LOG_HEIGHT } from "./constants";
import { s } from "./styles";

export function RunStatus({
  runIds,
  queuedCount = 0,
  onDone,
}: {
  runIds: string[];
  /** Runs among `runIds` still waiting for the agents ahead of them. */
  queuedCount?: number;
  onDone?: () => void;
}) {
  const t = useTranslations("prReview");
  const { events, running } = useRunEvents(runIds);
  const wasRunning = React.useRef(false);

  React.useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && wasRunning.current) onDone?.();
  }, [running, onDone]);

  if (runIds.length === 0) return null;

  let elapsedLabel: string | undefined;
  if (running) {
    elapsedLabel =
      queuedCount > 0
        ? t("runStatus.elapsedQueued", { running: runIds.length - queuedCount, queued: queuedCount })
        : t("runStatus.elapsed", { count: runIds.length });
  }

  const log: LogLine[] = events.map((e) => ({
    t: e.t,
    k: e.kind as LogLine["k"],
    m: e.msg,
  }));

  return (
    <div style={s.wrap}>
      <LiveLogStream
        log={log}
        running={running}
        height={LOG_HEIGHT}
        elapsedLabel={elapsedLabel}
      />
    </div>
  );
}
