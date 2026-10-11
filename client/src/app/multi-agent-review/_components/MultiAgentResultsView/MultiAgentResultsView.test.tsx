/* MultiAgentResultsView — /multi-agent-review/[id] (SPEC-06 AC-89..AC-110, AC-121, AC-122, NFR-7, NFR-9).

   Boundary mocks: the multi-agent / reviews / evals hooks, the router and the
   shell. The view, header, toggle, columns, tabs, score ring, disagreement
   section and the shared FindingCard run for real. The trace drawer is stubbed
   (it has its own suite) so the test only proves WHICH run it is opened for. */
import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentColumn, FindingRecord, MultiAgentRun } from "@devdigest/shared";
import runsMessages from "../../../../../messages/en/runs.json";
import prReviewMessages from "../../../../../messages/en/prReview.json";

const state = vi.hoisted(() => ({
  search: new URLSearchParams(),
  run: undefined as unknown,
  error: null as unknown,
  replace: vi.fn(),
  push: vi.fn(),
  refetch: vi.fn(),
  mutate: vi.fn(),
  eventRunIds: [] as string[][],
  drawerIds: [] as string[][],
  events: [] as { t: string; kind: string; msg: string }[],
  streaming: false,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: state.replace }),
  useSearchParams: () => state.search,
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentRun: () => ({
    data: state.run,
    isLoading: false,
    error: state.error,
    refetch: state.refetch,
  }),
  useMultiAgentFindingAction: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: (ids: string[]) => {
    state.eventRunIds.push(ids);
    return { events: ids.length ? state.events : [], running: ids.length ? state.streaming : false };
  },
}));
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCaseFromFinding: () => ({ data: undefined, isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb?: { label: string }[]; children: React.ReactNode }) => (
    <div>
      <div data-testid="crumb">{(crumb ?? []).map((c) => c.label).join(" › ")}</div>
      {children}
    </div>
  ),
}));
vi.mock("@/components/run-trace-drawer", async () => {
  const actual = await vi.importActual<typeof import("@/components/run-trace-drawer")>(
    "@/components/run-trace-drawer",
  );
  return {
    eventsToLog: actual.eventsToLog,
    // Mirrors the real drawer's contract: it opens its own stream only when it
    // is running and was not handed one.
    RunTraceDrawer: ({
      runId,
      agentName,
      running,
      stream,
    }: {
      runId: string;
      agentName: string | null;
      running?: boolean;
      stream?: unknown;
    }) => {
      const ids = running && !stream ? [runId] : [];
      state.drawerIds.push(ids);
      useRunEvents(ids);
      return <div data-testid="trace-drawer">{`${runId}|${agentName}`}</div>;
    },
  };
});

import { ApiError } from "@/lib/api";
import { useRunEvents } from "@/lib/hooks/reviews";
import { MultiAgentResultsView } from "./MultiAgentResultsView";

function finding(over: Partial<FindingRecord> & Pick<FindingRecord, "id" | "title">): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    file: "src/limiter.ts",
    start_line: 9,
    end_line: 9,
    rationale: "Because **reasons**.",
    suggestion: null,
    confidence: 0.82,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    learned_at: null,
    ...over,
  };
}
function column(over: Partial<AgentColumn> & Pick<AgentColumn, "run_id" | "agent_id" | "agent_name">): AgentColumn {
  return {
    provider: "openai", model: "gpt-4.1", status: "done", verdict: null, score: 82,
    summary: "Looks risky.", error: null, duration_ms: 8400, cost_usd: 0.012, findings: [],
    ...over,
  };
}
function makeRun(over: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: "ma1", pr_id: "p1", pr_number: 482, pr_title: "Add rate limiter", ran_at: "2026-10-01T10:00:00Z",
    status: "done", agent_count: 2, total_duration_ms: 9100, total_cost_usd: 0.05, cost_partial: false,
    columns: [
      column({
        run_id: "r1", agent_id: "a1", agent_name: "Security",
        findings: [
          finding({ id: "f1", title: "Missing **auth** check", suggestion: "Use `requireAuth`." }),
          finding({ id: "f2", title: "Second", severity: "WARNING", file: "src/other.ts", accepted_at: "2026-10-01T10:05:00Z" }),
        ],
      }),
      column({ run_id: "r2", agent_id: "a2", agent_name: "Style", score: null, findings: [] }),
    ],
    groups: [],
    ...over,
  };
}

beforeEach(() => {
  state.search = new URLSearchParams();
  state.run = makeRun();
  state.error = null;
  state.events = [];
  state.streaming = false;
  state.eventRunIds = [];
  state.drawerIds = [];
  for (const m of [state.replace, state.push, state.refetch, state.mutate]) m.mockReset();
});
afterEach(cleanup);

function renderView() {
  // A fresh element per call: re-rendering the identical element object would bail out.
  const ui = () => (
    <NextIntlClientProvider locale="en" messages={{ runs: runsMessages, prReview: prReviewMessages }}>
      <MultiAgentResultsView id="ma1" />
    </NextIntlClientProvider>
  );
  const r = render(ui());
  return { ...r, again: () => r.rerender(ui()) };
}
const columns = () => Array.from(document.querySelectorAll<HTMLElement>("[data-agent-column]"));
const expand = (title: string) => fireEvent.click(screen.getByText(title));

describe("MultiAgentResultsView — header, subheader, not-found", () => {
  it("shows the breadcrumb, title, meta, subheader totals, 'partial' only when cost_partial, and Configure run", () => {
    renderView();
    expect(screen.getByTestId("crumb")).toHaveTextContent("Multi-Agent Review › #482"); // AC-89
    expect(screen.getByRole("heading", { name: "Multi-Agent Review" })).toBeInTheDocument();
    expect(screen.getByText("2 selected agents · parallel")).toBeInTheDocument();
    expect(screen.getByText("#482 Add rate limiter")).toBeInTheDocument(); // AC-91
    expect(screen.getByText(/2 agents · parallel · 9\.1s total · \$0\.05/)).toBeInTheDocument();
    expect(screen.queryByText("partial")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure run" })); // AC-90
    expect(state.push).toHaveBeenCalledWith("/multi-agent-review/new?pr=p1");

    cleanup();
    state.run = makeRun({ cost_partial: true });
    renderView();
    expect(screen.getByText("partial")).toBeInTheDocument(); // AC-92
  });

  it("shows a not-found state with a link back to the index on a 404", () => {
    state.run = undefined;
    state.error = new ApiError("nope", 404);
    renderView();
    expect(screen.getByText("Multi-agent run not found")).toBeInTheDocument(); // AC-94
    fireEvent.click(screen.getByRole("button", { name: "Back to Multi-Agent Review" }));
    expect(state.push).toHaveBeenCalledWith("/multi-agent-review");
  });
});

describe("MultiAgentResultsView — Columns / Tabs toggle (AC-93)", () => {
  it("defaults to Columns, writes ?view=tabs on click, and treats any other value as Columns", () => {
    renderView();
    expect(columns()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(state.replace).toHaveBeenCalledWith("/multi-agent-review/ma1?view=tabs", { scroll: false });
    cleanup();

    state.search = new URLSearchParams("view=bogus");
    renderView();
    expect(columns()).toHaveLength(2);
    expect(document.querySelector("[data-agent-tab]")).toBeNull();
    cleanup();

    state.search = new URLSearchParams("view=tabs");
    renderView();
    expect(columns()).toHaveLength(0);
    expect(document.querySelector("[data-agent-tab]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("MultiAgentResultsView — Columns mode", () => {
  it("renders one column per agent in selection order with time/cost, score ('—' when null), status, findings and footer", () => {
    renderView();
    const [sec, style] = columns() as [HTMLElement, HTMLElement];
    expect(columns().map((c) => c.textContent)).toEqual([
      expect.stringContaining("Security"),
      expect.stringContaining("Style"),
    ]); // AC-95
    expect(within(sec).getByText("8.4s · $0.01")).toBeInTheDocument(); // AC-96
    expect(within(sec).getByText("done")).toBeInTheDocument();
    expect(within(sec).getByText("Missing **auth** check")).toBeInTheDocument(); // AC-100/AC-122 literal
    expect(within(sec).getByText("src/limiter.ts:9")).toBeInTheDocument();
    expect(within(sec).getByText("2 findings")).toBeInTheDocument(); // AC-102
    expect(within(sec).queryByLabelText("—")).not.toBeInTheDocument();
    expect(within(style).getByLabelText("—")).toBeInTheDocument(); // AC-97
    expect(within(style).getByText("0 findings")).toBeInTheDocument();
    expect(within(style).getByText("No findings.")).toBeInTheDocument();
  });

  it("subscribes to the live log only for running columns (a queued one waits without a stream), and swaps in findings after the run settles", () => {
    state.events = [{ t: "00.10", kind: "info", msg: "Reading diff" }];
    state.streaming = true;
    state.run = makeRun({
      columns: [
        column({ run_id: "r1", agent_id: "a1", agent_name: "Security", status: "running", findings: [] }),
        column({ run_id: "r2", agent_id: "a2", agent_name: "Style", status: "queued", findings: [] }),
        column({ run_id: "r3", agent_id: "a3", agent_name: "Docs", status: "done", findings: [finding({ id: "f9", title: "Doc gap" })] }),
      ],
    });
    const { again } = renderView();
    const subscribed = new Set(state.eventRunIds.filter((ids) => ids.length).map((ids) => ids.join(",")));
    expect([...subscribed].sort()).toEqual(["r1"]); // NFR-7 / AC-98
    expect(screen.getAllByText("Reading diff")).toHaveLength(1);
    expect(screen.getByText("Waiting for a free slot…")).toBeInTheDocument();
    expect(screen.queryByText("Doc gap")).toBeInTheDocument();
    expect(within(columns()[2]!).queryByPlaceholderText("Filter log…")).not.toBeInTheDocument();

    // r1 settles: stream closes -> parent refetched (AC-99), then findings replace the log.
    state.streaming = false;
    again();
    expect(state.refetch).toHaveBeenCalled();
    state.run = makeRun({
      columns: [
        column({ run_id: "r1", agent_id: "a1", agent_name: "Security", status: "done", findings: [finding({ id: "f1", title: "Fresh finding" })] }),
        column({ run_id: "r2", agent_id: "a2", agent_name: "Style", status: "done", findings: [] }),
      ],
    });
    again();
    expect(screen.getByText("Fresh finding")).toBeInTheDocument();
    expect(screen.queryByText("Reading diff")).not.toBeInTheDocument();
  });

  it("shows the run's error text for a failed column and no live subscription", () => {
    state.run = makeRun({
      columns: [column({ run_id: "r1", agent_id: "a1", agent_name: "Security", status: "failed", error: "Provider timed out", score: null })],
    });
    renderView();
    expect(screen.getByText("Provider timed out")).toBeInTheDocument(); // AC-101
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(state.eventRunIds.every((ids) => ids.length === 0)).toBe(true);
  });

  it("keeps ONE stream per unsettled run when the drawer is open on a running column (NFR-7)", () => {
    state.streaming = true;
    state.run = makeRun({
      columns: [column({ run_id: "r1", agent_id: "a1", agent_name: "Security", status: "running" })],
    });
    renderView();
    fireEvent.click(within(columns()[0]!).getByRole("button", { name: "View trace" }));
    expect(screen.getByTestId("trace-drawer")).toHaveTextContent("r1|Security");
    // The column streams r1; the drawer (also rendered for r1) opens nothing of its own.
    expect(state.eventRunIds.some((ids) => ids.includes("r1"))).toBe(true);
    expect(state.drawerIds.length).toBeGreaterThan(0);
    expect(state.drawerIds.every((ids) => ids.length === 0)).toBe(true);
  });

  it("opens the trace drawer for the run of the clicked column", () => {
    renderView();
    expect(screen.queryByTestId("trace-drawer")).not.toBeInTheDocument();
    fireEvent.click(within(columns()[1]!).getByRole("button", { name: "View trace" }));
    expect(screen.getByTestId("trace-drawer")).toHaveTextContent("r2|Style"); // AC-103
  });
});

describe("MultiAgentResultsView — Tabs mode", () => {
  beforeEach(() => {
    state.search = new URLSearchParams("view=tabs");
  });

  it("labels tabs 'name · score', shows the panel for the selected agent and opens that run's trace", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Security · 82" })).toBeInTheDocument(); // AC-104
    expect(screen.getByRole("button", { name: "Style · —" })).toBeInTheDocument();
    const panel = () => document.querySelector("[data-agent-panel]") as HTMLElement;
    expect(document.querySelectorAll("[data-agent-tab]")).toHaveLength(2); // one marker per tab
    expect(panel()).toHaveAttribute("data-agent-panel", "r1");
    expect(within(panel()).getByText("Security")).toBeInTheDocument(); // AC-105
    expect(within(panel()).getByText("Looks risky.")).toBeInTheDocument();
    expect(within(panel()).getByText("8.4s · $0.01")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Style · —" }));
    expect(panel()).toHaveAttribute("data-agent-panel", "r2");
    fireEvent.click(within(panel()).getByRole("button", { name: "View trace" }));
    expect(screen.getByTestId("trace-drawer")).toHaveTextContent("r2|Style");
  });

  it("expands a finding to category, location, confidence, rationale and suggested fix", () => {
    renderView();
    expand("Missing **auth** check");
    const card = document.querySelector("[data-finding-id='f1']") as HTMLElement;
    expect(within(card).getByText("82% conf")).toBeInTheDocument(); // AC-106
    expect(within(card).getByText("src/limiter.ts:9")).toBeInTheDocument();
    expect(within(card).getByText("security")).toBeInTheDocument();
    expect(within(card).getByText("Suggested fix")).toBeInTheDocument();
    expect(within(card).getByText("reasons")).toBeInTheDocument(); // rationale rendered via Markdown (AC-122)
    expect(within(card).getByText("requireAuth")).toBeInTheDocument();
  });
});

describe("MultiAgentResultsView — finding actions", () => {
  it("offers Accept / Dismiss / Learn / Turn into eval case but no Reply, and sends the original finding id", () => {
    renderView();
    expand("Missing **auth** check");
    expect(screen.queryByRole("button", { name: /reply/i })).not.toBeInTheDocument(); // AC-107
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled(); // AC-110: undecided

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(state.mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "accept" }); // AC-108
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(state.mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "dismiss" });
    fireEvent.click(screen.getByRole("button", { name: "Learn" }));
    expect(state.mutate).toHaveBeenLastCalledWith({ findingId: "f1", action: "learn" });
  });

  it("shows the new decision from refreshed data and enables Turn into eval case once decided", () => {
    const { again } = renderView();
    expect(screen.queryByText("learned")).not.toBeInTheDocument();
    state.run = makeRun({
      columns: [
        column({
          run_id: "r1", agent_id: "a1", agent_name: "Security",
          findings: [finding({ id: "f1", title: "Missing **auth** check", accepted_at: "2026-10-01T10:06:00Z", learned_at: "2026-10-01T10:06:01Z" })],
        }),
      ],
    });
    again();
    expect(screen.getByText("accepted")).toBeInTheDocument(); // AC-109
    expect(screen.getByText("learned")).toBeInTheDocument();
    expand("Missing **auth** check");
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });
});

describe("MultiAgentResultsView — disagreement section placement", () => {
  it("renders 'Where agents disagree' below the results in both modes", () => {
    state.run = makeRun({
      groups: [{
        file: "src/limiter.ts", start_line: 9, end_line: 9, title: "Magic number", conflict: true, members: [],
        takes: [
          { agent_id: "a1", persona: null, verdict: "CRITICAL", note: null },
          { agent_id: "a2", persona: null, verdict: "ignored", note: null },
        ],
      }],
    });
    renderView();
    expect(screen.getByText("Where agents disagree")).toBeInTheDocument(); // AC-111
    expect(screen.getByText("did not flag")).toBeInTheDocument();
    cleanup();
    state.search = new URLSearchParams("view=tabs");
    renderView();
    expect(screen.getByText("Where agents disagree")).toBeInTheDocument();
  });
});

describe("MultiAgentResultsView — keyboard operability (structural, NFR-9)", () => {
  it("uses native, focusable buttons for the toggle, tab headers and View trace", () => {
    renderView();
    for (const name of ["Columns", "Tabs"]) {
      const b = screen.getByRole("button", { name });
      expect(b.tagName).toBe("BUTTON");
      expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    }
    expect(screen.getAllByRole("button", { name: "View trace" })[0]!.tagName).toBe("BUTTON");
  });
});

describe("Multi-Agent Review copy (AC-121)", () => {
  it("never mentions p-queue or worktrees in any English message file", () => {
    const dir = path.resolve(__dirname, "../../../../../messages/en");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      expect(text, f).not.toMatch(/p-queue|worktrees/i);
    }
  });
});
