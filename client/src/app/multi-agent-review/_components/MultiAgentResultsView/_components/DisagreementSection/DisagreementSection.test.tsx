/* DisagreementSection — "Where agents disagree" (SPEC-06 AC-111..AC-116). */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, LocationGroup } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/runs.json";
import { DisagreementSection } from "./DisagreementSection";

afterEach(cleanup);

function col(run_id: string, agent_id: string, agent_name: string): AgentColumn {
  return {
    run_id, agent_id, agent_name, provider: null, model: null, status: "done", verdict: null,
    score: 80, summary: null, error: null, duration_ms: 1000, cost_usd: 0.01, findings: [],
  };
}
const COLUMNS = [col("r1", "a1", "Security"), col("r2", "a2", "Style")];

function group(over: Partial<LocationGroup>): LocationGroup {
  return {
    file: "src/a.ts", start_line: 10, end_line: 12, title: "T", conflict: true, members: [],
    takes: [], ...over,
  };
}
const CONFLICT = group({
  file: "src/limiter.ts", start_line: 9, title: "Magic number **x**", conflict: true,
  takes: [
    { agent_id: "a1", persona: null, verdict: "CRITICAL", note: null },
    { agent_id: "a2", persona: null, verdict: "ignored", note: null },
  ],
});
const AGREE = group({
  file: "src/same.ts", start_line: 3, title: "Both flagged", conflict: false,
  takes: [
    { agent_id: "a1", persona: null, verdict: "WARNING", note: null },
    { agent_id: "a2", persona: null, verdict: "WARNING", note: null },
  ],
});

function renderIt(groups: LocationGroup[], columns = COLUMNS) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <DisagreementSection groups={groups} columns={columns} />
    </NextIntlClientProvider>,
  );
}

describe("DisagreementSection — filter toggle", () => {
  it("is on by default (conflicts only) and lists every group once switched off", () => {
    renderIt([CONFLICT, AGREE]);
    expect(screen.getByRole("heading", { name: "Where agents disagree" })).toBeInTheDocument();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true"); // AC-111
    expect(screen.getByText("src/limiter.ts:9")).toBeInTheDocument();
    expect(screen.queryByText("src/same.ts:3")).not.toBeInTheDocument(); // AC-112

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("src/same.ts:3")).toBeInTheDocument(); // AC-113
    expect(screen.getByText("src/limiter.ts:9")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-conflict-row]")).toHaveLength(1); // the agreeing group is not flagged as a conflict
  });

  it("shows the agreement text when only-conflicts is on and nothing conflicts, but not when it is off", () => {
    renderIt([AGREE]);
    expect(
      screen.getByText("No conflicts — the agents agree on every flagged location."),
    ).toBeInTheDocument(); // AC-116
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText(/No conflicts/)).not.toBeInTheDocument();
    expect(screen.getByText("src/same.ts:3")).toBeInTheDocument();
  });
});

describe("DisagreementSection — takes", () => {
  it("renders one take per selected agent in selection order with severity, 'did not flag' or 'no result'", () => {
    const g = group({
      title: "Plain **title**",
      takes: [
        { agent_id: "a1", persona: null, verdict: "WARNING", note: null },
        // a2 has no take at all -> 'no result'
      ],
    });
    const { container } = renderIt([g], [...COLUMNS, col("r3", "a3", "Docs")]);
    const row = container.querySelector("[data-conflict-row]") as HTMLElement;
    expect(within(row).getByText("src/a.ts:10")).toBeInTheDocument(); // AC-114
    expect(within(row).getByText("Plain **title**")).toBeInTheDocument(); // AC-122: literal
    const names = ["Security", "Style", "Docs"].map((n) => row.textContent!.indexOf(n));
    expect(names.every((i) => i >= 0)).toBe(true);
    expect([...names].sort((a, b) => a - b)).toEqual(names); // selection order
    expect(within(row).getAllByText("no result")).toHaveLength(2); // AC-115
    expect(within(row).queryByText("did not flag")).not.toBeInTheDocument();
    // The severity badge renders icon + text label.
    expect(within(row).getByText("Warning")).toBeInTheDocument();
    const takeOf = (name: string) => within(row).getByText(name).parentElement as HTMLElement;
    expect(takeOf("Security").querySelector("svg.lucide-triangle-alert, svg.lucide-alert-triangle")).not.toBeNull();
    expect(takeOf("Style").querySelector("svg")).toBeNull();
  });

  it("labels an ignored take 'did not flag' and a no_result take 'no result', and only lists selected agents", () => {
    const g = group({
      takes: [
        { agent_id: "a1", persona: null, verdict: "ignored", note: null },
        { agent_id: "a2", persona: null, verdict: "no_result", note: null },
        { agent_id: "zz", persona: null, verdict: "CRITICAL", note: null }, // not selected
      ],
    });
    const { container } = renderIt([g]);
    const row = container.querySelector("[data-conflict-row]") as HTMLElement;
    expect(within(row).getByText("did not flag")).toBeInTheDocument();
    expect(within(row).getByText("no result")).toBeInTheDocument();
    expect(row).not.toHaveTextContent(/critical/i);
  });
});

describe("DisagreementSection — keyboard operability (structural, NFR-9)", () => {
  it("exposes the filter as a native button with role=switch", () => {
    renderIt([CONFLICT]);
    const sw = screen.getByRole("switch");
    expect(sw.tagName).toBe("BUTTON");
    expect(sw.tabIndex).toBeGreaterThanOrEqual(0);
  });
});

describe("DisagreementSection — positional takes", () => {
  it("matches takes to columns by position, even when agent ids are null", () => {
    const g = group({
      takes: [
        { agent_id: null, persona: null, verdict: "CRITICAL", note: null },
        { agent_id: null, persona: null, verdict: "ignored", note: null },
      ],
    });
    const { container } = renderIt([g]);
    const row = container.querySelector("[data-conflict-row]") as HTMLElement;
    expect(within(row).getByText("Critical")).toBeInTheDocument();
    expect(within(row).getByText("did not flag")).toBeInTheDocument();
  });
});
