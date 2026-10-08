import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalAgentSummary, EvalBatch, EvalOverview } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";

const h = vi.hoisted(() => ({
  overview: { data: undefined as unknown, isLoading: false },
  mutateAsync: vi.fn(),
}));
vi.mock("../../../../lib/hooks/evals", () => ({
  useEvalOverview: () => h.overview,
  useRunEvals: () => ({ mutateAsync: h.mutateAsync }),
}));
vi.mock("../../../../lib/toast", () => ({ notify: { error: vi.fn() } }));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { notify } from "../../../../lib/toast";
import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  h.mutateAsync.mockReset();
});

const batch = (over: Partial<EvalBatch>): EvalBatch =>
  ({
    id: "b1",
    agent_id: "a1",
    agent_version: 3,
    status: "done",
    error: null,
    ran_at: "2026-10-01T10:00:00Z",
    cases_total: 4,
    cases_passed: 3,
    recall: 0.75,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: 0.0123,
    ...over,
  }) as EvalBatch;

const agent = (over: Partial<EvalAgentSummary>): EvalAgentSummary => ({
  agent_id: "a1",
  name: "Security Reviewer",
  model: "gpt-4.1",
  cases_total: 4,
  latest_batch: batch({}),
  trend: [batch({ recall: 0.5 }), batch({ recall: 0.75 })],
  ...over,
});

function setup(overview: EvalOverview) {
  h.overview = { data: overview, isLoading: false };
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

describe("EvalDashboardView", () => {
  it("renders agent rows with metrics and link, and runs a single agent", async () => {
    h.mutateAsync.mockResolvedValue({});
    setup({
      agents: [agent({}), agent({ agent_id: "a2", name: "Docs Bot", latest_batch: null, trend: [] })],
      recent_batches: [batch({})],
    });

    const rows = screen.getAllByRole("row");
    const row = rows.find((r) => within(r).queryByText("Security Reviewer"))!;
    expect(within(row).getByText("75%")).toBeInTheDocument();
    expect(within(row).getByText("50%")).toBeInTheDocument();
    expect(within(row).getByText("100%")).toBeInTheDocument();
    expect(within(row).getByText(/^v3 · .* · 3\/4 passed$/)).toBeInTheDocument();
    expect(within(row).getByRole("link")).toHaveAttribute("href", "/agents/a1?tab=evals");

    const empty = rows.find((r) => within(r).queryByText("Docs Bot"))!;
    expect(within(empty).getByText("No runs yet")).toBeInTheDocument();
    expect(within(empty).queryByText(/%/)).not.toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: /run/i }));
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalledWith("a1"));
    await waitFor(() => expect(within(row).getByRole("button", { name: /run/i })).toBeEnabled());
  });

  it("runs all agents with cases once each and toasts failures as plain text", async () => {
    h.mutateAsync.mockImplementation((id: string) =>
      id === "a2" ? Promise.reject(new Error("<b>no key</b>")) : Promise.resolve({}),
    );
    setup({
      agents: [
        agent({}),
        agent({ agent_id: "a2", name: "Perf" }),
        agent({ agent_id: "a3", name: "Empty", cases_total: 0 }),
      ],
      recent_batches: [],
    });

    fireEvent.click(screen.getByRole("button", { name: "Run all agents" }));
    expect(h.mutateAsync).toHaveBeenCalledTimes(2);
    expect(h.mutateAsync).toHaveBeenCalledWith("a1");
    expect(h.mutateAsync).toHaveBeenCalledWith("a2");
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith("Perf: <b>no key</b>"));
  });
});
