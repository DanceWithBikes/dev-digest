import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../../../messages/en/prReview.json";
import type { PrBrief } from "@devdigest/shared";

const gen = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false }));
// client/AGENTS.md claims fetch is mocked; it is not — mock the hook module.
vi.mock("@/lib/hooks/brief", () => ({
  useGeneratePrBrief: () => gen,
}));

import { PrBriefSection } from "./PrBriefSection";

beforeEach(() => {
  gen.mutate.mockReset();
  gen.isPending = false;
  gen.isError = false;
});
afterEach(cleanup);

function makeBrief(over: Partial<PrBrief> = {}): PrBrief {
  return {
    summary: "Adds a **rate limiter** <b>now</b>.",
    intent: null,
    blast: null,
    risks: { risks: [] },
    history: { history: [] },
    review_focus: [],
    missing: [],
    head_sha: "abcdef1234567",
    generated_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    model: "test-model",
    cost_usd: 0.014,
    tokens_in: 8200,
    tokens_out: 1300,
    ...over,
  };
}

function renderSection(props: Partial<React.ComponentProps<typeof PrBriefSection>> = {}, theme: "dark" | "light" = "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
      <PrBriefSection prId="pr1" brief={null} isLoading={false} review={null} headSha="abcdef1234567" {...props} />
    </NextIntlClientProvider>,
  );
}

const spinning = (btn: HTMLElement) => (btn.querySelector("svg") as SVGElement | null)?.style.animation.includes("ddspin") ?? false;

describe("PrBriefSection (no brief)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`${theme}: titled PR Brief with a Generate button, no POST on mount (AC-50, AC-51, AC-56)`, () => {
      renderSection({}, theme);
      expect(screen.getByText("PR Brief")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Generate brief" })).toBeEnabled();
      expect(gen.mutate).not.toHaveBeenCalled();
    });
  });

  it("clicking Generate requests the mutation, disables the button and spins it (AC-53, AC-54)", () => {
    const { rerender } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(gen.mutate).toHaveBeenCalledTimes(1);

    gen.isPending = true;
    rerender(
      <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
        <PrBriefSection prId="pr1" brief={null} isLoading={false} review={null} headSha="x" />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByRole("button", { name: "Generate brief" });
    expect(btn).toBeDisabled();
    expect(spinning(btn)).toBe(true);
  });

  it("shows a skeleton and no Generate button while loading", () => {
    renderSection({ isLoading: true });
    expect(screen.queryByRole("button", { name: "Generate brief" })).not.toBeInTheDocument();
  });

  it("failure shows an alert with Retry that re-requests (AC-65)", () => {
    gen.isError = true;
    renderSection();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't generate the brief. Try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(gen.mutate).toHaveBeenCalledTimes(1);
  });
});

describe("PrBriefSection (with brief)", () => {
  it("header shows summary as plain text, verdict, counts, score, cost, time and model (AC-57 to AC-61, AC-80)", () => {
    renderSection({
      brief: makeBrief(),
      review: { verdict: "request_changes", findingsCount: 3, blockers: 1, score: 42 },
    });
    expect(screen.getByText("Adds a **rate limiter** <b>now</b>.")).toBeInTheDocument();
    expect(document.querySelector("b")).toBeNull();
    expect(screen.getByText("Request changes")).toBeInTheDocument();
    expect(screen.getByText(/3 findings · 1 blockers/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
    expect(screen.getByText("Generated 2 hours ago · test-model")).toBeInTheDocument();
    expect(screen.queryByText(/Stale/)).not.toBeInTheDocument();
  });

  it("header omits the blockers count when the newest completed review has 0 blockers (AC-58, AC-86)", () => {
    renderSection({
      brief: makeBrief(),
      review: { verdict: "approve", findingsCount: 3, blockers: 0, score: 88 },
    });
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("3 findings")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.queryByText(/blocker/i)).not.toBeInTheDocument();
  });

  it("without a completed review no verdict, counts or score show (AC-59)", () => {
    renderSection({ brief: makeBrief(), review: null });
    expect(screen.queryByText("Request changes")).not.toBeInTheDocument();
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
    expect(screen.queryByText("PR SCORE")).not.toBeInTheDocument();
  });

  it("flags a stale brief with the first 7 SHA characters (AC-62)", () => {
    renderSection({ brief: makeBrief({ head_sha: "0123456789abc" }), headSha: "ffffffffff" });
    expect(screen.getByText("Stale — generated for 0123456")).toBeInTheDocument();
  });

  it("refresh button is named Regenerate brief, requests the mutation and spins only itself (AC-63, AC-64, AC-54)", () => {
    const { rerender } = renderSection({ brief: makeBrief() });
    fireEvent.click(screen.getByRole("button", { name: "Regenerate brief" }));
    expect(gen.mutate).toHaveBeenCalledTimes(1);
    gen.isPending = true;
    rerender(
      <NextIntlClientProvider locale="en" messages={{ brief, prReview }}>
        <PrBriefSection prId="pr1" brief={makeBrief()} isLoading={false} review={null} headSha="abcdef1234567" />
      </NextIntlClientProvider>,
    );
    const btn = screen.getByRole("button", { name: "Regenerate brief" });
    expect(btn).toBeDisabled();
    expect(spinning(btn)).toBe(true);
  });

  it("a failed regenerate shows Retry while the previous brief stays (AC-65, AC-66)", () => {
    gen.isError = true;
    renderSection({ brief: makeBrief({ summary: "Previous summary" }) });
    expect(screen.getByText("Previous summary")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(gen.mutate).toHaveBeenCalledTimes(1);
  });

  it("lists each missing entry's source and reason under Missing data, literally (AC-67, AC-80)", () => {
    renderSection({
      brief: makeBrief({
        missing: [
          { source: "blast", reason: "Index not built" },
          { source: "specs", reason: "<i>none</i> linked" },
        ],
      }),
    });
    expect(screen.getByText("Missing data")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Blast radius — Index not built");
    expect(items[1]).toHaveTextContent("Specs — <i>none</i> linked");
  });

  it("omits the Missing data block when nothing is missing", () => {
    renderSection({ brief: makeBrief() });
    expect(screen.queryByText("Missing data")).not.toBeInTheDocument();
  });

  it("every control is a native button (NFR-6)", () => {
    renderSection({ brief: makeBrief() });
    for (const b of screen.getAllByRole("button")) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
