"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Icon, SectionLabel } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { SEVERITY_META } from "./constants";
import { s } from "./styles";

/** Model text (titles, explanations, refs) is rendered as plain text nodes only. */
function RiskItem({ risk }: { risk: Risk }) {
  const [open, setOpen] = React.useState(false);
  const meta = SEVERITY_META[risk.severity];
  const SevIcon = Icon[meta.icon];
  return (
    <div style={s.item(meta.color)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={s.chip}
      >
        <SevIcon size={14} style={{ color: meta.color, flexShrink: 0 }} />
        <span style={s.chipText}>
          <span style={s.title}>{risk.title}</span>
          {risk.file_refs[0] && (
            <span className="mono" style={s.ref}>
              {risk.file_refs[0]}
            </span>
          )}
        </span>
        <Icon.ChevronDown
          size={14}
          style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      {open && (
        <div style={s.detail}>
          <p>{risk.explanation}</p>
          {risk.file_refs.length > 0 && (
            <div style={s.refList}>
              {risk.file_refs.map((ref) => (
                <span key={ref} className="mono" style={s.ref}>
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Risk areas list. Bare it sits in the Intent card's footer; with `card` it fills the Intent card's place. */
export function RiskAreas({ risks, card }: { risks: Risk[]; card?: boolean }) {
  const t = useTranslations("brief");
  const body = (
    <>
      <SectionLabel icon="AlertTriangle">{t("risksTitle")}</SectionLabel>
      {risks.length === 0 ? (
        <p style={s.empty}>{t("noRisks")}</p>
      ) : (
        <div style={s.list}>
          {risks.map((risk, i) => (
            <RiskItem key={`${i}-${risk.title}`} risk={risk} />
          ))}
        </div>
      )}
    </>
  );
  return card ? <Card>{body}</Card> : <div style={s.wrap}>{body}</div>;
}
