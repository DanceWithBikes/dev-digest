/* SymbolNode — one collapsible changed-symbol row in the Tree view: chevron,
   the symbol name, and its caller count right-aligned. Open, it lists every
   caller as a monospace `file:line` GitHub link behind a vertical guide line,
   then that group's endpoint (blue) and cron (amber) chips, kept separate. */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function SymbolNode({
  group,
  defaultOpen,
  repoFullName,
  headSha,
}: {
  group: DownstreamImpact;
  defaultOpen: boolean;
  /** Deep-links need both; missing either falls back to plain `file:line` text. */
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen);
  const canLink = !!repoFullName && !!headSha;

  return (
    <div style={s.node}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          // Space also scrolls the page by default on a non-native "button" — stop that.
          if (e.key === " ") e.preventDefault();
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.header}
      >
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        <Icon.Code size={14} style={s.symbolIcon} />
        <span className="mono" style={s.symbolName}>
          {group.symbol}()
        </span>
        <span style={s.spacer} />
        <span style={s.callerCount}>{t("callerCount", { count: group.callers.length })}</span>
      </div>

      {open && (
        <div style={s.body}>
          {group.callers.length === 0 ? (
            <p style={s.empty}>{t("noCallers")}</p>
          ) : (
            <ul style={s.callerList}>
              {group.callers.map((caller) => {
                const label = `${caller.file}:${caller.line}`;
                return (
                  <li key={label} style={s.callerRow}>
                    <Icon.CornerDownRight size={13} style={s.guideIcon} />
                    {canLink ? (
                      <a
                        className="mono"
                        href={githubBlobUrl(repoFullName as string, headSha as string, caller.file, caller.line)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("openInGithub", { file: caller.file, line: caller.line })}
                        style={s.callerLink}
                      >
                        {label}
                      </a>
                    ) : (
                      <span className="mono" style={s.callerText}>
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {group.endpoints_affected.length > 0 && (
            <div style={s.chipRow}>
              {group.endpoints_affected.map((endpoint) => (
                <span key={endpoint} aria-label={t("chip.endpoint", { endpoint })}>
                  <Badge icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)" mono>
                    {endpoint}
                  </Badge>
                </span>
              ))}
            </div>
          )}

          {group.crons_affected.length > 0 && (
            <div style={s.chipRow}>
              {group.crons_affected.map((cron) => (
                <span key={cron} aria-label={t("chip.cron", { cron })}>
                  <Badge icon="Clock" color="var(--warn)" bg="var(--warn-bg)" mono>
                    {cron}
                  </Badge>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
