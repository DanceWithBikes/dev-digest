/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { anchorFindings, findingsForLine, fs, type DiffFindingAnchor, type DiffFindingApi } from "../findings";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Keys every rendered line can host a thread/finding on — shared by both
  // partitions below so it's computed once, not once per anchor kind.
  const renderedKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) keys.add(k);
    return keys;
  }, [lines]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, renderedKeys]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // Same split as comments: findings anchored to a rendered line vs.
  // "unanchored" ones (their line isn't in this patch) — surfaced up top so
  // none are silently dropped (the Findings tab still shows them either way).
  // Step 8: only set when this file has a still-valid cached summary — with
  // no cache entries at all (feature never triggered / dropped) this is
  // always undefined and the badge/line simply never render.
  const summary = findings?.summaryByPath?.get(file.path);

  const fileFindings = findings?.byPath.get(file.path);
  const { matched: findingsMatched, unanchored: unanchoredFindings } = React.useMemo(() => {
    if (!fileFindings || fileFindings.length === 0)
      return { matched: new Map<string, DiffFindingAnchor[]>(), unanchored: [] };
    return anchorFindings(fileFindings, renderedKeys);
  }, [fileFindings, renderedKeys]);

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {!!fileFindings?.length && (
          <span title={t("diffViewer.hasFindings")} aria-label={t("diffViewer.hasFindings")} style={fs.dot} />
        )}
        {summary && <Badge>{t("diffViewer.summaryBadge")}</Badge>}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {summary && <div style={fs.summaryLine}>{t("diffViewer.whatThisDoes", { summary })}</div>}
          {findings && unanchoredFindings.length > 0 && (
            <div style={fs.unanchoredWrap}>
              {unanchoredFindings.map((a) => (
                <React.Fragment key={a.id}>{findings.renderFinding(a.id)}</React.Fragment>
              ))}
            </div>
          )}
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findingAnchors={findingsForLine(ln, findingsMatched)}
                renderFinding={findings?.renderFinding}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
