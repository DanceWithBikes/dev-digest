import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const push = vi.fn();
const mutateAsync = vi.fn();
const agentList = vi.hoisted(() => ({ extra: 0 }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({
    data: [
      { id: "a1", name: "Security", model: "gpt-4.1", enabled: true },
      { id: "a2", name: "Style", model: "gpt-4.1", enabled: false },
      ...Array.from({ length: agentList.extra }, (_, i) => ({
        id: `x${i}`,
        name: `Extra ${i}`,
        model: "gpt-4.1",
        enabled: true,
      })),
    ],
  }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync, isPending: false }),
}));

import { RunReviewPopover } from "./RunReviewPopover";

beforeEach(() => {
  vi.clearAllMocks();
  agentList.extra = 0;
});
afterEach(cleanup);

function renderPopover() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunReviewPopover prId="pr1" />
    </NextIntlClientProvider>,
  );
}

describe("RunReviewPopover", () => {
  it("checks enabled agents, launches a multi-agent run and opens its results", async () => {
    mutateAsync.mockResolvedValue({ runs: [], multi_agent_run_id: "ma1" });
    renderPopover();

    fireEvent.click(screen.getByRole("button", { name: /run review/i }));
    expect(screen.getByText("PICK AGENTS TO RUN")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /security/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /style/i })).not.toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: /style/i }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(mutateAsync).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a1", "a2"] });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent-review/ma1"));
  });

  it("clears the selection, disables the run button and shows a launch error without navigating", async () => {
    mutateAsync.mockRejectedValue(new Error("boom"));
    renderPopover();

    fireEvent.click(screen.getByRole("button", { name: /run review/i }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByRole("button", { name: "Run multi-agent review (0)" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /security/i }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (1)" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
    expect(push).not.toHaveBeenCalled();
  });

  it("pre-checks at most 6 agents and shows the cap hint once 6 are checked", () => {
    agentList.extra = 7; // 8 enabled agents in total
    renderPopover();
    fireEvent.click(screen.getByRole("button", { name: /run review/i }));
    expect(screen.getByRole("button", { name: "Run multi-agent review (6)" })).toBeInTheDocument();
    expect(screen.getByText("Up to 6 agents per run")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /style/i })); // blocked at the cap
    expect(screen.getByRole("button", { name: "Run multi-agent review (6)" })).toBeInTheDocument();
  });
});
