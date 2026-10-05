/* AttachedDocs — the "Project context · attached specs" entry of Prompt
   assembly: one row per collected document with path, origin, version read and
   the server's token count. A sent document opens its exact recorded text as
   plain, unrendered text; a not_found one has nothing to open. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal } from "@devdigest/ui";
import type { AttachedContextDoc } from "@devdigest/shared";
import { PROMPT_COLORS } from "../../constants";
import { s } from "../../styles";
import { PromptModalBody } from "../PromptModalBody";

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "7px 12px",
  borderTop: "1px solid var(--border)",
  fontSize: 12.5,
};
const metaStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" };
const notFoundStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 4,
  color: "var(--crit)",
  background: "var(--crit-bg)",
};
const openStyle: React.CSSProperties = {
  marginLeft: "auto",
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text-secondary)",
  borderRadius: 5,
  padding: "2px 8px",
  fontSize: 12,
  cursor: "pointer",
};

export function AttachedDocs({ docs }: { docs: AttachedContextDoc[] }) {
  const t = useTranslations("runs");
  const [open, setOpen] = React.useState<AttachedContextDoc | null>(null);
  return (
    <div style={s.promptRow}>
      <div style={{ ...s.promptHead, cursor: "default" }}>
        <span style={s.promptDot(PROMPT_COLORS.specs)} />
        <span style={s.promptLabel}>{t("trace.prompt.contextDocs")}</span>
      </div>
      {docs.map((d, i) => (
        <div key={`${d.path}-${i}`} style={rowStyle}>
          <span className="mono" style={{ minWidth: 0, wordBreak: "break-all" }}>
            {d.path}
          </span>
          <span style={metaStyle}>
            {t("trace.prompt.docOrigin")}: {d.origin}
          </span>
          {d.status === "sent" ? (
            <>
              <span style={metaStyle}>
                {t("trace.prompt.docVersion")}: {d.version}
              </span>
              <span style={s.promptTokens}>{t("trace.prompt.docTokens", { count: d.tokens })}</span>
              <button type="button" style={openStyle} onClick={() => setOpen(d)}>
                {t("trace.prompt.docOpen", { path: d.path })}
              </button>
            </>
          ) : (
            <span style={notFoundStyle}>{t("trace.prompt.docNotFound")}</span>
          )}
        </div>
      ))}
      {open && (
        <Modal width={1200} title={open.path} onClose={() => setOpen(null)}>
          <PromptModalBody text={open.text ?? ""} />
        </Modal>
      )}
    </div>
  );
}
