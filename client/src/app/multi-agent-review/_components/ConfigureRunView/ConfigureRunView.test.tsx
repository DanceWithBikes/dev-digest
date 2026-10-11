/* ConfigureRunView — /multi-agent-review/new (SPEC-06 AC-71..AC-88).

   Hooks and the router are the boundary (mocked by the exact specifiers the view
   imports); the view, AgentCard and the estimate maths run for real. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, PrMeta, RunEstimate } from "@devdigest/shared";
import messages from "../../../../../messages/en/runs.json";

const state = vi.hoisted(() => ({
  search: new URLSearchParams(),
  pulls: [] as unknown[],
  agents: [] as unknown[],
  estimates: [] as unknown[],
  push: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
  useSearchParams: () => state.search,
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: { id: "r1" } }) }));
vi.mock("@/lib/hooks/core", () => ({
  usePulls: () => ({ data: state.pulls }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: state.agents }) }));
vi.mock("@/lib/hooks/multi-agent", () => ({ useRunEstimates: () => ({ data: state.estimates }) }));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: state.mutateAsync, isPending: false }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ crumb, children }: { crumb?: { label: string }[]; children: React.ReactNode }) => (
    <div>
      <div data-testid="crumb">{(crumb ?? []).map((c) => c.label).join(" › ")}</div>
      {children}
    </div>
  ),
}));

import { ConfigureRunView } from "./ConfigureRunView";

function agent(over: Partial<Agent> & Pick<Agent, "id" | "name">): Agent {
  return {
    description: `${over.name} description`,
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "p",
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    ...over,
  } as Agent;
}
function pr(id: string, number: number, title: string): PrMeta {
  return { id, number, title } as PrMeta;
}
function est(agent_id: string, ms: number | null, usd: number | null): RunEstimate {
  return { agent_id, median_duration_ms: ms, median_cost_usd: usd, runs: ms == null ? 0 : 3 };
}

beforeEach(() => {
  state.search = new URLSearchParams();
  state.pulls = [pr("p1", 482, "Add rate limiter"), pr("p2", 483, "Fix typo")];
  state.agents = [
    agent({ id: "a1", name: "Security" }),
    agent({ id: "a2", name: "Style" }),
    agent({ id: "a3", name: "Docs", enabled: false }),
  ];
  state.estimates = [est("a1", 8400, 0.012), est("a2", 3000, 0.004)];
  state.push.mockReset();
  state.mutateAsync.mockReset();
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <ConfigureRunView />
    </NextIntlClientProvider>,
  );
}
const run = (n: number) => screen.getByRole("button", { name: `Run multi-agent review (${n})` });

describe("ConfigureRunView — copy and step 1/2 gating", () => {
  it("shows the heading copy and the empty Step 2 until a PR is picked, then lists PRs as '#n · title'", () => {
    renderView();
    expect(screen.getByTestId("crumb")).toHaveTextContent("Multi-Agent Review › Configure run");
    expect(screen.getByRole("heading", { name: "Run a Multi-Agent Review" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pick a pull request and choose which agents to fan out — they run in parallel and you compare their findings side by side.",
      ),
    ).toBeInTheDocument(); // AC-71
    expect(screen.getByText("Select a pull request…")).toBeInTheDocument(); // AC-72
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument(); // AC-75
    expect(
      screen.getByText("Choose which PR to review above, then select the agents to run on it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(run(2)).toBeDisabled(); // AC-84: no PR (agents default-checked, button still off)

    fireEvent.click(screen.getByText("Select a pull request…"));
    expect(screen.getByRole("button", { name: "#482 · Add rate limiter" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "#483 · Fix typo" }));
    expect(screen.queryByText("Pick a pull request first")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("preselects the PR named by ?pr= and leaves Step 1 empty when it is not in the list", () => {
    state.search = new URLSearchParams("pr=p2");
    renderView();
    expect(screen.getByText("#483 · Fix typo")).toBeInTheDocument(); // AC-73
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    cleanup();

    state.search = new URLSearchParams("pr=nope");
    renderView();
    expect(screen.getByText("Select a pull request…")).toBeInTheDocument(); // AC-74
    expect(screen.getByText("Pick a pull request first")).toBeInTheDocument();
  });
});

describe("ConfigureRunView — agent cards and footer totals", () => {
  beforeEach(() => {
    state.search = new URLSearchParams("pr=p1");
  });

  it("pre-checks enabled agents only, shows estimates / 'no history', and Select all checks every card", () => {
    renderView();
    expect(screen.getByRole("checkbox", { name: /security/i })).toBeChecked(); // AC-77
    expect(screen.getByRole("checkbox", { name: /style/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /docs/i })).not.toBeChecked(); // AC-78
    expect(screen.getByText("Security description")).toBeInTheDocument(); // AC-76
    expect(screen.getByText("8.4s · $0.01")).toBeInTheDocument(); // AC-80
    expect(screen.getByText("3.0s · $0.00")).toBeInTheDocument();
    const docsCard = screen.getByText("Docs description").closest("[data-agent-card]") as HTMLElement;
    expect(within(docsCard).getByText("—")).toBeInTheDocument(); // AC-81
    expect(within(docsCard).getByText("no history")).toBeInTheDocument();
    expect(run(2)).toBeEnabled(); // AC-83

    fireEvent.click(screen.getByRole("button", { name: "Select all" })); // AC-82
    expect(screen.getByRole("checkbox", { name: /docs/i })).toBeChecked();
    expect(run(3)).toBeInTheDocument();
  });

  it("footer total is max duration / summed cost, marks 'partial' when a checked agent lacks history, and disables at 0", () => {
    renderView();
    // Security 8.4s/$0.012 + Style 3.0s/$0.004 -> 8.4s, $0.016 -> "$0.02"
    expect(screen.getByText(/≈ 8\.4s · \$0\.02 · parallel/)).toBeInTheDocument(); // AC-85
    expect(screen.queryByText("partial")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /docs/i })); // no estimate
    expect(screen.getByText(/≈ 8\.4s · \$0\.02 · parallel/)).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument(); // AC-86

    fireEvent.click(screen.getByRole("checkbox", { name: /security/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /style/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /docs/i }));
    expect(run(0)).toBeDisabled(); // AC-84: no agent
  });
});

describe("ConfigureRunView — launch", () => {
  beforeEach(() => {
    state.search = new URLSearchParams("pr=p1");
  });

  it("posts the checked agent ids in list order and navigates to the parent run", async () => {
    state.mutateAsync.mockResolvedValue({ runs: [], multi_agent_run_id: "ma9" });
    renderView();
    fireEvent.click(screen.getByRole("checkbox", { name: /docs/i }));
    fireEvent.click(run(3));
    expect(state.mutateAsync).toHaveBeenCalledWith({ prId: "p1", agentIds: ["a1", "a2", "a3"] }); // AC-87
    await waitFor(() => expect(state.push).toHaveBeenCalledWith("/multi-agent-review/ma9"));
  });

  it("shows the API error, does not navigate, and keeps the PR and the selection", async () => {
    state.mutateAsync.mockRejectedValue(new Error("Too many runs"));
    renderView();
    fireEvent.click(screen.getByRole("checkbox", { name: /style/i })); // untick one
    fireEvent.click(run(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many runs"); // AC-88
    expect(state.push).not.toHaveBeenCalled();
    expect(screen.getByText("#482 · Add rate limiter")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /security/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /style/i })).not.toBeChecked();
  });
});

describe("ConfigureRunView — keyboard operability (structural, NFR-9)", () => {
  it("renders agent checkboxes and the launch button as native, focusable buttons", () => {
    state.search = new URLSearchParams("pr=p1");
    renderView();
    for (const cb of screen.getAllByRole("checkbox")) {
      expect(cb.tagName).toBe("BUTTON");
      expect(cb.tabIndex).toBeGreaterThanOrEqual(0);
    }
    expect(run(2).tagName).toBe("BUTTON");
  });
});

describe("ConfigureRunView — 6 agent cap and foreign ?pr=", () => {
  const many = () =>
    Array.from({ length: 8 }, (_, i) => agent({ id: `m${i}`, name: `Agent ${i}` }));

  it("pre-checks at most 6 agents, disables the rest with a hint, and Select all stops at 6", () => {
    state.search = new URLSearchParams("pr=p1");
    state.agents = many();
    renderView();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.filter((b) => b.getAttribute("aria-checked") === "true")).toHaveLength(6);
    expect(screen.getByText("Up to 6 agents per run")).toBeInTheDocument();
    expect(run(6)).toBeInTheDocument();

    // A blocked toggle does nothing.
    fireEvent.click(boxes[7]!);
    expect(run(6)).toBeInTheDocument();

    // Unchecking one frees a slot and removes the hint.
    fireEvent.click(boxes[0]!);
    expect(screen.queryByText("Up to 6 agents per run")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(run(6)).toBeInTheDocument();
  });
});
