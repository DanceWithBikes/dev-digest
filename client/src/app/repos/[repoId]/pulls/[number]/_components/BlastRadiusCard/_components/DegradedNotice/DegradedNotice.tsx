/* DegradedNotice — shown whenever the map is incomplete (`radius.degraded`).
   States it renders alongside the map, never instead of it (server insight: the
   ripgrep fallback returns callers AND `degraded:true` together). Purely
   presentational — the resync flow itself is `useBlastResync` in the parent. */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Button } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";
import { s } from "./styles";

export function DegradedNotice({
  reason,
  canResync,
  running,
  ready,
  timedOut,
  failed,
  onResync,
}: {
  reason: BlastDegradedReason;
  /** false for `flag_off` (nothing a resync can fix) or when the repo id is unknown. */
  canResync: boolean;
  running: boolean;
  /** false until the repo's index-state snapshot has loaded — the button stays
      disabled until then (`useBlastResync` needs that snapshot to detect completion). */
  ready: boolean;
  timedOut: boolean;
  failed: boolean;
  onResync: () => void;
}) {
  const t = useTranslations("blast");
  return (
    <div style={s.wrap} role="status">
      <Icon.AlertTriangle size={14} style={s.icon} />
      <span style={s.text}>{t(`reason.${reason}`)}</span>
      {canResync && (
        <Button kind="ghost" size="sm" icon="RefreshCw" loading={running} disabled={!ready} onClick={onResync}>
          {running ? t("resync.running") : t("resync.button")}
        </Button>
      )}
      {timedOut && <span style={s.timeout}>{t("resync.timeout")}</span>}
      {failed && <span style={s.timeout}>{t("resync.failed")}</span>}
    </div>
  );
}
