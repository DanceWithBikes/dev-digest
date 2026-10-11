/* MultiAgentIndexView — /multi-agent-review (SPEC-06 AC-117, AC-118). */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiAgentRunSummary } from "@devdigest/shared";
import messages from "../../../../../messages/en/runs.json";

const state = vi.hoisted(() => ({ data: undefined as unknown, push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiAgentRuns: () => ({ data: state.data, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { MultiAgentIndexView } from "./MultiAgentIndexView";

function summary(over: Partial<MultiAgentRunSummary>): MultiAgentRunSummary {
  return {
    id: "m1",
    pr_id: "p1",
    pr_number: 482,
    pr_title: "Add rate limiter",
    ran_at: "2026-10-01T10:00:00Z",
    status: "done",
    agent_count: 3,
    total_duration_ms: 8400,
    total_cost_usd: 0.05,
    cost_partial: false,
    ...over,
  };
}

beforeEach(() => state.push.mockReset());
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <MultiAgentIndexView />
    </NextIntlClientProvider>,
  );
}

describe("MultiAgentIndexView", () => {
  it("lists runs in the order the API returns them (newest first) as links to their results page", () => {
    state.data = [
      summary({ id: "newer", pr_number: 490, pr_title: "Newest PR", agent_count: 1, status: "running" }),
      summary({ id: "old", pr_number: 482, pr_title: "Older PR", cost_partial: true }),
    ];
    renderView();
    const rows = document.querySelectorAll("[data-run-row]");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("#490 Newest PR");
    expect(rows[0]).toHaveTextContent("1 agent");
    expect(rows[0]).toHaveTextContent("running");
    expect(rows[0]).toHaveAttribute("href", "/multi-agent-review/newer");
    expect(rows[1]).toHaveTextContent("#482 Older PR");
    expect(rows[1]).toHaveTextContent("3 agents");
    expect(rows[1]).toHaveTextContent("done");
    expect(rows[1]).toHaveTextContent("8.4s · $0.05 · partial");
    expect(rows[1]).toHaveAttribute("href", "/multi-agent-review/old");
  });

  it("shows the empty state whose Configure run action opens /multi-agent-review/new", () => {
    state.data = [];
    renderView();
    expect(screen.getByText("No multi-agent runs yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configure run" }));
    expect(state.push).toHaveBeenCalledWith("/multi-agent-review/new");
  });
});
