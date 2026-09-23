/* ConventionCard — one candidate rule: what the scan claims, the file and line
   it claims it from, how sure it is, and the three decisions a reviewer can make.

   Edit is INLINE rather than a modal or a second page: the evidence snippet is
   the only thing that tells you whether a rewording is still true, so it has to
   stay on screen while you reword. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SelectInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { CATEGORIES, CATEGORY_COLORS } from "../../constants";
import { confidencePct } from "../../helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  busy,
  onAccept,
  onUnaccept,
  onReject,
  onEdit,
}: {
  candidate: ConventionCandidate;
  busy?: boolean;
  onAccept: () => void;
  /** Send an accepted rule back to the candidates queue. Only used there. */
  onUnaccept?: () => void;
  onReject: () => void;
  onEdit: (patch: { rule: string; category: ConventionCategory }) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);

  // A refetch after someone else's edit must not clobber what is being typed
  // here, so the draft only resyncs when the card switches out of edit mode.
  React.useEffect(() => {
    if (!editing) {
      setRule(candidate.rule);
      setCategory(candidate.category);
    }
  }, [candidate.rule, candidate.category, editing]);

  const accepted = candidate.status === "accepted";

  return (
    <div style={s.card(accepted)}>
      <div style={s.topRow}>
        <span style={s.categoryPill(CATEGORY_COLORS[candidate.category])}>
          {t(`category.${candidate.category}`)}
        </span>
        {accepted && (
          <Badge color="var(--ok)" icon="Check">
            {t("card.accepted")}
          </Badge>
        )}
        <span className="tnum" style={s.confidence}>
          {t("card.confidence", { pct: confidencePct(candidate.confidence) })}
        </span>
      </div>

      {editing ? (
        <div style={s.editFields}>
          <Textarea value={rule} onChange={setRule} rows={3} />
          <SelectInput
            value={category}
            onChange={(v) => setCategory(v as ConventionCategory)}
            options={CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))}
          />
        </div>
      ) : (
        <div style={s.rule}>{candidate.rule}</div>
      )}

      <div className="mono" style={s.evidence}>
        {candidate.evidence_path}:{candidate.evidence_line}
      </div>
      {candidate.evidence_snippet && (
        <pre className="mono" style={s.snippet}>
          {candidate.evidence_snippet}
        </pre>
      )}

      <div style={s.actions}>
        {editing ? (
          <>
            <Button
              kind="primary"
              size="sm"
              icon="Check"
              disabled={!rule.trim() || busy}
              onClick={() => {
                onEdit({ rule: rule.trim(), category });
                setEditing(false);
              }}
            >
              {t("card.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("card.cancelEdit")}
            </Button>
          </>
        ) : (
          <>
            {/* An accepted rule offers the way back instead of a dead Accept:
                un-accepting is not rejecting — the rule returns to the queue
                rather than being ruled out of every future scan. */}
            {accepted && onUnaccept ? (
              <Button
                kind="secondary"
                size="sm"
                icon="ArrowDown"
                disabled={busy}
                onClick={onUnaccept}
              >
                {t("card.unaccept")}
              </Button>
            ) : (
              <Button
                kind="primary"
                size="sm"
                icon="Check"
                disabled={busy || accepted}
                onClick={onAccept}
              >
                {t("card.accept")}
              </Button>
            )}
            <Button kind="secondary" size="sm" icon="Edit" disabled={busy} onClick={() => setEditing(true)}>
              {t("card.edit")}
            </Button>
            <div style={s.spacer} />
            <Button kind="danger" size="sm" icon="X" disabled={busy} onClick={onReject}>
              {t("card.reject")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
