/* OverviewTab composition (SPEC-03): PR Brief section above the Intent/Blast row,
   Risk areas inside the Intent card — or a card of their own when intent is null
   (AC-69, replacing the Intent card) — and Review focus below the row. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import brief from "../../../../../../../../messages/en/brief.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import blast from "../../../../../../../../messages/en/blast.json";
import type { PrBrief, PrFile, PrIntentRecord } from "@devdigest/shared";

const state = vi.hoisted(() => ({
  brief: undefined as unknown,
  loading: false,
  intent: null as unknown,
  mutate: vi.fn(),
}));

vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: state.brief, isLoading: state.loading }),
  useGeneratePrBrief: () => ({ mutate: state.mutate, isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [] }),
  usePrIntent: () => ({ data: state.intent, isLoading: false }),
  useDetectPrIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useBlastResync: () => ({ start: vi.fn(), running: false, ready: true, timedOut: false, failed: false }),
  usePriorPrs: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { OverviewTab } from "./OverviewTab";

beforeEach(() => {
  state.brief = undefined;
  state.loading = false;
  state.intent = null;
  state.mutate.mockReset();
});
afterEach(cleanup);

function makeBrief(over: Partial<PrBrief> = {}): PrBrief {
  return {
    summary: "Summary text",
    intent: { intent: "Do X", in_scope: [], out_of_scope: [] },
    blast: null,
    risks: { risks: [{ kind: "k", title: "Risky thing", explanation: "why", severity: "medium", file_refs: ["src/a.ts"] }] },
    history: { history: [] },
    review_focus: [{ file: "src/a.ts", line: 3, reason: "look here" }],
    missing: [],
    head_sha: "abc1234",
    generated_at: new Date().toISOString(),
    model: "m",
    cost_usd: null,
    tokens_in: null,
    tokens_out: null,
    ...over,
  };
}

const files: PrFile[] = [{ path: "src/a.ts", additions: 1, deletions: 0 }];

function renderTab(onOpenFile = vi.fn(), theme: "dark" | "light" = "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  render(
    <NextIntlClientProvider locale="en" messages={{ brief, prReview, blast }}>
      <OverviewTab
        prBody="PR body"
        prId="pr1"
        headSha="abc1234"
        repoId="repo1"
        repoFullName="acme/app"
        files={files}
        onOpenFile={onOpenFile}
      />
    </NextIntlClientProvider>,
  );
  return { onOpenFile };
}

const intentRecord: PrIntentRecord = {
  pr_id: "pr1",
  intent: "Add a toggle",
  in_scope: ["Toggle UI"],
  out_of_scope: [],
  sources: [],
  missing_context: [],
  head_sha: "abc1234",
};

describe("OverviewTab (no brief)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`${theme}: PR Brief title sits above the Intent card with a Generate button; no risks or focus (AC-50, AC-51, AC-52)`, () => {
      state.intent = intentRecord;
      renderTab(vi.fn(), theme);
      const title = screen.getByText("PR Brief");
      const intentText = screen.getByText(/Add a toggle/);
      expect(title.compareDocumentPosition(intentText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole("button", { name: "Generate brief" })).toBeInTheDocument();
      expect(screen.getByText("Toggle UI")).toBeInTheDocument();
      expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
      expect(screen.queryByText(/Review focus/)).not.toBeInTheDocument();
      expect(state.mutate).not.toHaveBeenCalled();
    });
  });
});

describe("OverviewTab (with brief)", () => {
  it("orders PR Brief, Intent with Risk areas inside, then Review focus, then Description (AC-50, AC-68, AC-74)", () => {
    state.brief = makeBrief();
    state.intent = intentRecord;
    renderTab();
    const order = [
      screen.getByText("PR Brief"),
      screen.getByText(/Add a toggle/),
      screen.getByText("Risk areas"),
      screen.getByText("Review focus — read these first (1)"),
      screen.getByText("Description"),
    ];
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i]!.compareDocumentPosition(order[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // Risk areas share the Intent card's column (AC-68)
    const intentCol = screen.getByText(/Add a toggle/).closest("section")!;
    expect(within(intentCol).getByText("Risk areas")).toBeInTheDocument();
    // Review focus is outside both columns (full width below)
    expect(intentCol.contains(screen.getByText(/Review focus/))).toBe(false);
  });

  it("with null intent the Risk areas card replaces the Intent card (AC-69)", () => {
    state.brief = makeBrief({ intent: null });
    state.intent = intentRecord;
    renderTab();
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Risky thing")).toBeInTheDocument();
    expect(screen.queryByText(/Add a toggle/)).not.toBeInTheDocument();
    expect(screen.queryByText("Toggle UI")).not.toBeInTheDocument();
  });

  it("activating a focus item on a changed file calls onOpenFile with that path (AC-76)", () => {
    state.brief = makeBrief();
    const { onOpenFile } = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "src/a.ts:3" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts");
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });
});
