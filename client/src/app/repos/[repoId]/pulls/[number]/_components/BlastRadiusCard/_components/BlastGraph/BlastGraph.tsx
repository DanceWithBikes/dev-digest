/* BlastGraph — hand-written SVG node-link diagram (no charting dependency):
   changed symbols -> their callers -> the endpoints/crons those callers reach,
   as three columns of absolutely positioned HTML nodes joined by grey cubic
   Bézier curves. Changed-symbol and endpoint/cron nodes get a blue border. */
import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadius } from "@devdigest/shared";
import { edgePath, layoutGraph } from "./helpers";
import { s } from "./styles";

export function BlastGraph({ radius }: { radius: Pick<BlastRadius, "downstream"> }) {
  const t = useTranslations("blast");
  const layout = React.useMemo(() => layoutGraph(radius), [radius]);
  const nodesById = React.useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout.nodes]);

  if (layout.edges.length === 0) {
    return <p style={s.empty}>{t("graph.empty")}</p>;
  }

  return (
    <div>
      <div style={s.canvas(layout.width, layout.height)} role="img" aria-label={t("graph.ariaLabel")}>
        <svg width={layout.width} height={layout.height} style={s.svg}>
          {layout.edges.map((edge) => {
            const d = edgePath(nodesById, edge);
            if (!d) return null;
            return <path key={edge.id} d={d} stroke="var(--border-strong)" strokeWidth={1.5} fill="none" />;
          })}
        </svg>
        {layout.nodes.map((node) => (
          <div
            key={node.id}
            title={node.fullLabel}
            style={s.node(node.x, node.y, node.kind === "caller" ? "var(--border-strong)" : "var(--accent)")}
          >
            <span className="mono" style={s.nodeLabel}>
              {node.label}
            </span>
          </div>
        ))}
      </div>

      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent)")} />
          {t("legend.changed")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--border-strong)")} />
          {t("legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={s.legendDot("var(--accent)")} />
          {t("legend.endpoints")}
        </span>
      </div>
    </div>
  );
}
