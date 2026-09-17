/* FindingsPopover — the PR list's FINDINGS cell: severity counts that reveal a
   read-only preview card on hover/focus. Previews are text only (no Accept /
   Reject) — acting on a finding belongs to the PR detail page.

   The panel is portaled to <body> with fixed positioning: the list's table card
   sets `overflow: hidden` (it clips row backgrounds inside its rounded corners),
   so an absolutely-positioned panel inside a row would be cut off. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, type Severity as UiSeverity } from "@devdigest/ui";
import type { PrFindingPreview, PrSeverityCounts } from "@devdigest/shared";
import {
  CLOSE_DELAY_MS,
  OPEN_DELAY_MS,
  POPOVER_GAP,
  POPOVER_VIEWPORT_MARGIN,
  POPOVER_WIDTH,
} from "./constants";
import { lineLabel, plainText, totalFindings } from "./helpers";
import { SeverityCounts } from "./SeverityCounts";
import { s } from "./styles";

interface Position {
  top: number;
  left: number;
}

export function FindingsPopover({
  counts,
  items,
  openDelayMs = OPEN_DELAY_MS,
  closeDelayMs = CLOSE_DELAY_MS,
}: {
  /** Null when the PR has never been reviewed — the cell then reads "—". */
  counts: PrSeverityCounts | null | undefined;
  items: PrFindingPreview[];
  openDelayMs?: number;
  closeDelayMs?: number;
}) {
  const t = useTranslations("prReview");
  const panelId = React.useId();
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<Position | null>(null);

  const clearTimers = React.useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const closeNow = React.useCallback(() => {
    clearTimers();
    setOpen(false);
    setPos(null);
  }, [clearTimers]);

  const scheduleOpen = React.useCallback(() => {
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), openDelayMs);
  }, [clearTimers, openDelayMs]);

  const scheduleClose = React.useCallback(() => {
    clearTimers();
    closeTimer.current = setTimeout(closeNow, closeDelayMs);
  }, [clearTimers, closeDelayMs, closeNow]);

  React.useEffect(() => clearTimers, [clearTimers]);

  // Place the panel once it's measurable: below the cell, flipped above when it
  // wouldn't fit, and clamped to the viewport on the right.
  React.useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const height = panel.offsetHeight;
    const fitsBelow =
      rect.bottom + POPOVER_GAP + height <= window.innerHeight - POPOVER_VIEWPORT_MARGIN;
    setPos({
      top: fitsBelow
        ? rect.bottom + POPOVER_GAP
        : Math.max(POPOVER_VIEWPORT_MARGIN, rect.top - POPOVER_GAP - height),
      left: Math.max(
        POPOVER_VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - POPOVER_VIEWPORT_MARGIN),
      ),
    });
  }, [open, items.length]);

  // A fixed panel doesn't follow its trigger — close instead of drifting.
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", closeNow, true);
    window.addEventListener("resize", closeNow);
    return () => {
      window.removeEventListener("scroll", closeNow, true);
      window.removeEventListener("resize", closeNow);
    };
  }, [open, closeNow]);

  if (counts == null) return <span style={s.muted}>—</span>;

  const total = totalFindings(counts);
  if (total === 0) {
    return (
      <span className="tnum" style={s.muted}>
        0
      </span>
    );
  }

  const title = t("findingsSummary.popoverTitle", { count: total });

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={() => {
          clearTimers();
          setOpen(true);
        }}
        onBlur={scheduleClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") closeNow();
        }}
        style={s.trigger}
      >
        <SeverityCounts counts={counts} />
      </span>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={title}
            style={s.panel(pos?.top ?? 0, pos?.left ?? 0, pos != null)}
            onMouseEnter={clearTimers}
            onMouseLeave={scheduleClose}
            // React re-dispatches portal events through the React tree, so
            // without this a click inside the card would open the PR row.
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={s.panelTitle}>
              <Icon.AlertOctagon size={12} />
              {title}
            </div>
            {items.map((f, i) => (
              <div key={f.id} style={s.item(i === 0)}>
                <div style={s.itemHead}>
                  <SeverityBadge severity={f.severity as UiSeverity} compact />
                  <span style={s.itemTitle}>{f.title}</span>
                  <CategoryTag category={f.category} />
                </div>
                <div style={s.itemMeta}>
                  <span className="mono" style={s.itemFile}>
                    {f.file}:{lineLabel(f)}
                  </span>
                  <ConfidenceNum value={f.confidence} />
                </div>
                <div style={s.itemBody}>{plainText(f.rationale)}</div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
