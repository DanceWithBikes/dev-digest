"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff, useGenerateSummaries } from "@/lib/hooks/core";
import { notify } from "@/lib/toast";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { DiffGroup } from "./_components/DiffGroup";
import { roleLabelKey, toPrFiles } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffError } = useSmartDiff(prId);
  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  // Never block the tab on the new endpoint: fall back to the flat, GitHub-ordered
  // list whenever Smart Diff hasn't resolved yet, failed, or the user toggled away.
  const smartAvailable = !smartDiffLoading && !smartDiffError && !!smartDiff;
  const useSmartOrder = order === "smart" && smartAvailable;

  // Step 8: button-triggered only — never called from useSmartDiff or on
  // mount. `summaryByPath` is derived straight off the Smart Diff response
  // (`pseudocode_summary`, already filled server-side only where the cached
  // summary's patch hash still matches), so a stale summary never shows.
  const generateSummaries = useGenerateSummaries(prId);
  const summaryByPath = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const group of smartDiff?.groups ?? []) {
      for (const f of group.files) {
        if (f.pseudocode_summary) m.set(f.path, f.pseudocode_summary);
      }
    }
    return m;
  }, [smartDiff]);

  // Every review run's findings (accepted + dismissed included) — the same
  // unfiltered set the server anchored `smart-diff`'s finding_lines against, so
  // a dot on a FileCard never disagrees with the card rendered beneath it.
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  const allFindings = React.useMemo(() => (reviews ?? []).flatMap((r) => r.findings), [reviews]);
  const findingsById = React.useMemo(() => {
    const m = new Map<string, FindingRecord>();
    for (const f of allFindings) m.set(f.id, f);
    return m;
  }, [allFindings]);
  const byPath = React.useMemo(() => {
    const m = new Map<string, { id: string; line: number }[]>();
    for (const f of allFindings) {
      const list = m.get(f.file) ?? [];
      list.push({ id: f.id, line: f.start_line });
      m.set(f.file, list);
    }
    return m;
  }, [allFindings]);
  // The one source for "which files have findings" — the group-header count
  // (DiffGroup) and the per-file dot (FileCard, via `findings.byPath` below)
  // both read this instead of each deriving their own from `finding_lines`.
  const pathsWithFindings = React.useMemo(() => new Set(byPath.keys()), [byPath]);

  const findings: DiffFindingApi | undefined = prId
    ? {
        byPath,
        summaryByPath,
        renderFinding: (findingId) => {
          const f = findingsById.get(findingId);
          if (!f) return null;
          return (
            <FindingCard
              f={f}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          );
        },
      }
    : undefined;

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.headerRight}>
            {smartAvailable && (
              <Button
                kind="ghost"
                size="sm"
                onClick={() => setOrder((o) => (o === "smart" ? "original" : "smart"))}
              >
                {useSmartOrder ? t("smartDiff.originalOrder") : t("smartDiff.smartOrder")}
              </Button>
            )}
            {smartAvailable && (
              <Button
                kind="ghost"
                size="sm"
                disabled={generateSummaries.isPending}
                onClick={() =>
                  generateSummaries.mutate(undefined, {
                    onError: (err) =>
                      notify.error(err instanceof Error ? err.message : "Couldn't generate summaries."),
                  })
                }
              >
                {generateSummaries.isPending
                  ? t("smartDiff.generatingSummaries")
                  : t("smartDiff.generateSummaries")}
              </Button>
            )}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      {useSmartOrder && smartDiff ? (
        <div style={s.groups}>
          {smartDiff.split_suggestion.too_big && (
            <div style={s.splitBanner}>
              <span style={s.splitTitle}>
                {t("smartDiff.largeTitle", { lines: smartDiff.split_suggestion.total_lines })}
              </span>
              <span style={s.splitBody}>{t("smartDiff.largeBody")}</span>
              <ul style={s.splitList}>
                {smartDiff.split_suggestion.proposed_splits.map((split) => (
                  <li key={split.name}>
                    {t(`smartDiff.${roleLabelKey(split.name)}`)} — {split.files.length} files
                  </li>
                ))}
              </ul>
            </div>
          )}
          {smartDiff.groups.map((group) => (
            <DiffGroup key={group.role} group={group} pathsWithFindings={pathsWithFindings}>
              <DiffViewer files={toPrFiles(group, files)} commenting={commenting} findings={findings} />
            </DiffGroup>
          ))}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findings} />
      )}
    </section>
  );
}
