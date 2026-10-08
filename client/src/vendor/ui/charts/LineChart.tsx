/* LineChart — multi-series line chart on Recharts. */
import React from "react";
import {
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export interface ChartSeries {
  name: string;
  color: string;
  data: number[];
}

export function LineChart({
  series,
  w = 620,
  h = 200,
  yMin = 0.6,
  yMax = 1.0,
  xLabels,
  renderTooltip,
}: {
  series: ChartSeries[];
  w?: number;
  h?: number;
  yMin?: number;
  yMax?: number;
  /** One label per point; when given, the X axis is shown with these ticks. */
  xLabels?: string[];
  /** Custom hover tooltip for the point at `index`; no tooltip when omitted. */
  renderTooltip?: (index: number) => React.ReactNode;
}) {
  const n = series[0]?.data.length ?? 0;
  const rows = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number> = { i };
    series.forEach((s) => {
      row[s.name] = s.data[i] ?? 0;
    });
    return row;
  });
  return (
    <div style={{ width: "100%", maxWidth: w, height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={rows} margin={{ top: 14, right: 14, bottom: 8, left: -10 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          {xLabels ? (
            <XAxis
              dataKey="i"
              tickFormatter={(i: number) => xLabels[i] ?? ""}
              tick={{ fontSize: 12, fill: "var(--text-muted)" }}
              axisLine={false}
              tickLine={false}
            />
          ) : (
            <XAxis dataKey="i" hide />
          )}
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 12, fill: "var(--text-muted)" }}
            tickFormatter={(v: number) => v.toFixed(1)}
            axisLine={false}
            tickLine={false}
            width={38}
          />
          {renderTooltip && (
            <Tooltip
              content={({ active, payload }) => {
                const index = payload?.[0]?.payload?.i;
                return active && typeof index === "number" ? <>{renderTooltip(index)}</> : null;
              }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
