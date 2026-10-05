import React from "react";
import { useTranslations } from "next-intl";
import type { ArchitectureSection } from "@devdigest/shared";
import { DIAGRAM } from "../../constants";
import { layoutDiagram, truncateLabel } from "../../helpers";
import { s } from "../../styles";

/**
 * The architecture diagram as native SVG on theme tokens (no Mermaid).
 * Labels are React text, never HTML, so a model-written label cannot inject markup.
 */
export function ArchitectureDiagram({
  diagram,
}: {
  diagram: ArchitectureSection["diagram"];
}) {
  const t = useTranslations("onboarding");
  const layout = React.useMemo(() => layoutDiagram(diagram), [diagram]);
  if (layout.nodes.length === 0)
    return <div style={s.notice}>{t("architecture.diagramEmpty")}</div>;

  return (
    <div style={s.diagramScroll}>
      <svg
        role="img"
        aria-label={t("architecture.diagramLabel")}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        // Fills the container, never below natural size (labels stay readable;
        // a wider graph scrolls) and never beyond 1.4x (one column stays modest).
        style={{
          ...s.diagram,
          minWidth: layout.width,
          maxWidth: layout.width * DIAGRAM.maxScale,
        }}
      >
        <defs>
          <marker
            id="onboarding-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path
              d="M0,0 L6,3 L0,6"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="1.25"
            />
          </marker>
        </defs>
        {layout.edges.map((e) => (
          <g key={e.key}>
            <title>
              {t("architecture.edgeLabel", {
                from: e.from,
                to: e.to,
                weight: e.weight,
              })}
            </title>
            <line
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              style={s.diagramEdge}
              markerEnd="url(#onboarding-arrow)"
            />
            <text
              x={e.mx}
              y={e.my - 3}
              textAnchor="middle"
              style={s.diagramWeight}
            >
              {e.weight}
            </text>
          </g>
        ))}
        {layout.nodes.map((n) => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <title>{n.label}</title>
            <rect
              width={DIAGRAM.nodeWidth}
              height={DIAGRAM.nodeHeight}
              rx={7}
              style={s.diagramBox}
            />
            <text
              className="mono"
              x={DIAGRAM.nodeWidth / 2}
              y={DIAGRAM.nodeHeight / 2 + 5}
              textAnchor="middle"
              style={s.diagramLabel}
            >
              {truncateLabel(n.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
