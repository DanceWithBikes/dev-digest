/* CollapsibleBody — caps the Blast Radius Tree/Graph at a fixed height with a
   fade and a "Show all" / "Show less" toggle. The toggle only appears when the
   content actually overflows; height is re-measured on resize because Tree
   nodes open and close in place. Remount it (`key`) to collapse it again. */
import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

/** A big PR's graph is one 56px row per node — without a cap it takes over the
   whole Overview tab. */
const COLLAPSED_MAX_HEIGHT = 420;

export function CollapsibleBody({
  children,
  maxHeight = COLLAPSED_MAX_HEIGHT,
}: {
  children: React.ReactNode;
  maxHeight?: number;
}) {
  const t = useTranslations("blast");
  const id = React.useId();
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflowing, setOverflowing] = React.useState(false);

  React.useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const measure = () => setOverflowing(content.scrollHeight > maxHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [maxHeight]);

  const collapse = () => {
    setExpanded(false);
    viewportRef.current?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div>
      <div id={id} ref={viewportRef} style={s.viewport(expanded ? undefined : maxHeight)}>
        <div ref={contentRef}>{children}</div>
        {overflowing && !expanded && <div style={s.fade} />}
      </div>

      {(overflowing || expanded) && (
        <div style={s.toggleRow}>
          <Button
            kind="ghost"
            size="sm"
            iconRight={expanded ? undefined : "ChevronDown"}
            aria-expanded={expanded}
            aria-controls={id}
            onClick={expanded ? collapse : () => setExpanded(true)}
          >
            {expanded ? t("showLess") : t("showAll")}
          </Button>
        </div>
      )}
    </div>
  );
}
