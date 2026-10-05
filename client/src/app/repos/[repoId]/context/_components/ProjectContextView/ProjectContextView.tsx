/* /repos/:repoId/context — the Project Context page.

   Browse, search and preview a repo's Markdown documents and edit the search
   roots they are found under. The listing is live from the server; documents
   are never stored. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/lib/relative-time";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ContextDocPreview } from "@/components/context-selection";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles, useReindexContext } from "@/lib/hooks/context";
import { FileTree } from "./_components/FileTree";
import { SearchRootsEditor } from "./_components/SearchRootsEditor";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const relativeTime = useRelativeTime();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useContextFiles(repoId);
  const reindex = useReindexContext();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);

  const doc = data?.documents.find((d) => d.path === selected) ?? null;
  const crumb = [{ label: activeRepo?.full_name ?? "" }, { label: t("crumb") }];

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.header}>
          <h1 style={s.h1}>{t("title")}</h1>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={reindex.isPending}
            disabled={reindex.isPending}
            onClick={() => reindex.mutate(repoId)}
          >
            {reindex.isPending ? t("indexing") : t("reindex")}
          </Button>
        </div>

        {isLoading && <Skeleton height={240} />}
        {isError && <ErrorState body={t("loadError")} onRetry={() => refetch()} />}

        {data && (
          <>
            <div style={s.rootsLine}>
              <span>{t("roots.title")}:</span>
              {data.roots.map((r) => (
                <code key={r} className="mono" style={s.chip}>
                  {r}
                </code>
              ))}
              {data.roots_default && <span style={s.note}>({t("roots.default")})</span>}
              {!editing && (
                <Button kind="secondary" size="sm" onClick={() => setEditing(true)}>
                  {t("roots.edit")}
                </Button>
              )}
            </div>
            {editing && (
              <SearchRootsEditor repoId={repoId} roots={data.roots} onClose={() => setEditing(false)} />
            )}
            {!data.cloned && <div style={s.note}>{t("notCloned")}</div>}

            {data.documents.length === 0 ? (
              <EmptyState
                icon="FileText"
                title={t("empty.title")}
                body={t("empty.body")}
                cta={t("empty.cta")}
                onCta={() => setEditing(true)}
              />
            ) : (
              <div style={s.body}>
                <FileTree documents={data.documents} selected={selected} onSelect={setSelected} />
                <section style={s.previewPane}>
                  {doc ? (
                    <>
                      <div style={s.previewHead}>
                        <span className="mono" style={s.previewPath} title={doc.path}>
                          {doc.path}
                        </span>
                        <span style={s.usedBy}>
                          {t("usedBy", { agents: doc.agents_count, skills: doc.skills_count })}
                        </span>
                      </div>
                      <ContextDocPreview repoId={repoId} path={doc.path} />
                    </>
                  ) : (
                    <div style={s.note}>
                      <strong>{t("selectPrompt.title")}</strong> — {t("selectPrompt.body")}
                    </div>
                  )}
                </section>
              </div>
            )}

            <div style={s.footer}>
              {t("footer", {
                count: data.count,
                time: relativeTime(data.scanned_at),
              })}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
