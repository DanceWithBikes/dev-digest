/* CompareRunsModal — two batches side by side: the three metrics with the
   newer − older delta, and the system-prompt diff between them. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { DiffViewer } from "@/components/diff-viewer";
import { toDiffFile } from "@/lib/diff-text";
import { batchDelta, formatDeltaPp, orderPair, pct } from "@/lib/eval-metrics";
import { useEvalBatch } from "@/lib/hooks";
import { PROMPT_DIFF_PATH } from "./constants";
import { s } from "./styles";

export function CompareRunsModal({ ids, onClose }: { ids: [string, string]; onClose: () => void }) {
  const t = useTranslations("eval");
  const first = useEvalBatch(ids[0]);
  const second = useEvalBatch(ids[1]);

  const a = first.data;
  const b = second.data;
  const failed = first.isError || second.isError;

  let body: React.ReactNode;
  if (failed) {
    body = <p style={s.muted}>{t("compare.failed")}</p>;
  } else if (!a || !b) {
    body = <p style={s.muted}>{t("compare.loading")}</p>;
  } else {
    const [older, newer] = orderPair(a.batch, b.batch);
    const delta = batchDelta(older, newer);
    const rows = [
      { key: "recall", label: t("compare.recall"), o: older.recall, n: newer.recall, d: delta.recall },
      { key: "precision", label: t("compare.precision"), o: older.precision, n: newer.precision, d: delta.precision },
      {
        key: "citation",
        label: t("compare.citation"),
        o: older.citation_accuracy,
        n: newer.citation_accuracy,
        d: delta.citation_accuracy,
      },
    ];
    const samePrompt = older.system_prompt === newer.system_prompt;
    body = (
      <>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("compare.metric")}</th>
              <th style={s.th}>
                {t("compare.older")} · v{older.agent_version}
              </th>
              <th style={s.th}>
                {t("compare.newer")} · v{newer.agent_version}
              </th>
              <th style={s.th}>{t("compare.delta")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td style={s.td}>{r.label}</td>
                <td style={s.td}>{pct(r.o)}</td>
                <td style={s.td}>{pct(r.n)}</td>
                <td style={s.td}>{formatDeltaPp(r.d)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <h3 style={s.h3}>{t("compare.promptDiff")}</h3>
          {samePrompt ? (
            <p style={s.muted}>{t("compare.noPromptChange")}</p>
          ) : (
            <DiffViewer files={[toDiffFile(PROMPT_DIFF_PATH, older.system_prompt, newer.system_prompt)]} />
          )}
        </div>
      </>
    );
  }

  return (
    <Modal
      width={860}
      title={t("compare.title")}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={onClose}>{t("compare.close")}</Button>
        </div>
      }
    >
      <div style={s.body}>{body}</div>
    </Modal>
  );
}
