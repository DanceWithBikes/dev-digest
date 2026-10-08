import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBatch } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";

const chart = vi.hoisted(() => ({ props: null as null | { xLabels?: string[]; renderTooltip?: (i: number) => React.ReactNode } }));

// Recharts measures its container, which jsdom cannot; keep the real design-system
// exports and replace only the chart so its props (labels, tooltip) can be driven.
vi.mock("@devdigest/ui", async (orig) => ({
  ...(await orig<typeof import("@devdigest/ui")>()),
  LineChart: (props: NonNullable<typeof chart.props>) => {
    chart.props = props;
    return <div data-testid="line-chart">{props.renderTooltip?.(0)}</div>;
  },
}));

import { EvalTrendChart } from "./EvalTrendChart";

afterEach(() => {
  cleanup();
  chart.props = null;
});

const batch = (over: Partial<EvalBatch>): EvalBatch =>
  ({ id: "b", status: "done", agent_version: 1, ran_at: "2026-10-01T00:00:00Z", recall: 0.5, precision: 0.5, citation_accuracy: 0.5, cost_usd: null, ...over }) as EvalBatch;

function renderChart(batches: EvalBatch[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalTrendChart batches={batches} />
    </NextIntlClientProvider>,
  );
}

describe("EvalTrendChart", () => {
  it("labels the X axis by version and shows a dash in the tooltip for a null cost", () => {
    renderChart([
      batch({ id: "2", agent_version: 2, ran_at: "2026-10-02T00:00:00Z" }),
      batch({ id: "1", agent_version: 1 }),
    ]);
    expect(chart.props?.xLabels).toEqual(["v1", "v2"]);
    expect(screen.getByText(/v1/, { selector: "div div" })).toHaveTextContent("—");
  });

  it("renders nothing without a done batch", () => {
    renderChart([batch({ status: "failed" })]);
    expect(screen.queryByTestId("line-chart")).not.toBeInTheDocument();
  });
});
