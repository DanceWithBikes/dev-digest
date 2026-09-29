/* PriorPrs — bordered, collapsible "Prior PRs touching these files [N]" row at
   the bottom of the card. Fetched lazily: `usePriorPrs` only fires once this
   row is opened, so a PR nobody expands never costs the GitHub calls behind it
   (server/src/modules/blast/AGENTS.md — Prior PRs fans out to GitHub per file). */
import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Skeleton, Badge } from "@devdigest/ui";
import { usePriorPrs } from "../../../../../../../../../lib/hooks/blast";
import { githubPrUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function PriorPrs({
  prId,
  repoFullName,
}: {
  prId: string | null;
  repoFullName?: string | null;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError } = usePriorPrs(prId, open);
  const history = data?.history ?? [];

  return (
    <div style={s.wrap}>
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
        <Icon.History size={15} style={s.headerIcon} />
        <span style={s.title}>{t("priorPrs.title")}</span>
        {open && history.length > 0 && <Badge mono>{history.length}</Badge>}
        <span style={s.spacer} />
        {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
      </div>

      {open && (
        <div style={s.body}>
          {isLoading && <Skeleton height={40} />}
          {isError && <p style={s.error}>{t("priorPrs.error")}</p>}
          {!isLoading && !isError && history.length === 0 && <p style={s.empty}>{t("priorPrs.empty")}</p>}
          {!isLoading && !isError && history.length > 0 && (
            <ul style={s.list}>
              {history.map((item) => (
                <li key={item.pr_number} style={s.row}>
                  {repoFullName ? (
                    <a
                      className="mono"
                      href={githubPrUrl(repoFullName, item.pr_number)}
                      target="_blank"
                      rel="noreferrer"
                      style={s.prNumber}
                    >
                      #{item.pr_number}
                    </a>
                  ) : (
                    <span className="mono" style={s.prNumber}>
                      #{item.pr_number}
                    </span>
                  )}
                  <span style={s.prTitle}>{item.title}</span>
                  <span style={s.prMeta}>
                    {t("priorPrs.mergedBy", { author: item.author })} · {item.merged_at.slice(0, 10)}
                  </span>
                  {item.notes && <span style={s.prNotes}>{item.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
