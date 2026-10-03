/* PR detail page — URL carries the Files changed target file (SPEC-03 AC-78):
   a Review focus click writes tab=diff&file=<path> in ONE router.replace, a reload
   (?tab=diff&file=…) opens that same file, and a manual tab switch drops `file`.
   next/navigation and every data hook are mocked at the module boundary (client has
   no global fetch stub — see client/docs/insights.md); child components are real. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief, PrFile } from "@devdigest/shared";
import brief from "../../../../../../messages/en/brief.json";
import prReview from "../../../../../../messages/en/prReview.json";
import blast from "../../../../../../messages/en/blast.json";
import shell from "../../../../../../messages/en/shell.json";

const state = vi.hoisted(() => ({
  query: "",
  replace: vi.fn(),
  brief: undefined as unknown,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo1", number: "7" }),
  useSearchParams: () => new URLSearchParams(state.query),
  useRouter: () => ({ replace: state.replace, push: vi.fn() }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/app" } }),
  useRepoNotFound: () => false,
}));

const prDetail = {
  id: "pr-uuid",
  number: 7,
  title: "Add toggle",
  author: "ann",
  branch: "feat",
  base: "main",
  additions: 2,
  deletions: 0,
  status: "open",
  body: null,
  head_sha: "abc1234",
  files_count: 2,
  commits: [],
  files: [
    { path: "src/a.ts", additions: 500, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+a" },
    { path: "src/b dir/b.ts", additions: 500, deletions: 0, patch: "@@ -0,0 +1,1 @@\n+b" },
  ] as PrFile[],
};

vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr-uuid", number: 7 }], isLoading: false }),
  usePullDetail: () => ({ data: prDetail, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({ mutate: vi.fn() }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
  usePrIntent: () => ({ data: null, isLoading: false }),
  useDetectPrIntent: () => ({ mutate: vi.fn(), isPending: false }),
  useRunReview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({ useAgents: () => ({ data: [] }) }));
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: state.brief, isLoading: false }),
  useGeneratePrBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useBlastResync: () => ({ start: vi.fn(), running: false, ready: true, timedOut: false, failed: false }),
  usePriorPrs: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/lib/hooks/core", () => ({
  useSmartDiff: () => ({ data: undefined, isLoading: false, isError: true }),
  useGenerateSummaries: () => ({ mutate: vi.fn(), isPending: false }),
}));

import PRDetailPage from "./page";

function makeBrief(): PrBrief {
  return {
    summary: "Summary text",
    intent: null,
    blast: null,
    risks: { risks: [] },
    history: { history: [] },
    review_focus: [{ file: "src/b dir/b.ts", line: 1, reason: "look here" }],
    missing: [],
    head_sha: "abc1234",
    generated_at: new Date().toISOString(),
    model: "m",
    cost_usd: null,
    tokens_in: null,
    tokens_out: null,
  } as PrBrief;
}

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={{ brief, prReview, blast, shell }}>
        <PRDetailPage />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.query = "";
  state.brief = makeBrief();
  state.replace.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("PR detail page (Files changed target in the URL, AC-78)", () => {
  it("clicking a Review focus item writes tab=diff and the encoded file path in a single router.replace", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "src/b dir/b.ts:1" }));

    expect(state.replace).toHaveBeenCalledTimes(1);
    const url = new URL(state.replace.mock.calls[0]![0] as string, "http://x");
    expect(url.pathname).toBe("/repos/repo1/pulls/7");
    expect(url.searchParams.get("tab")).toBe("diff");
    expect(url.searchParams.get("file")).toBe("src/b dir/b.ts");
    expect(url.search).toContain("file=src%2Fb+dir%2Fb.ts");
  });

  it("mounting with ?tab=diff&file=<path> opens that file's card in Files changed (reload keeps the target)", () => {
    state.query = "tab=diff&file=src%2Fb%20dir%2Fb.ts";
    renderPage();

    // Both files exceed the auto-expand threshold, so only the target can be open.
    const card = (path: string) => document.querySelector(`[data-file-path="${path}"]`);
    expect(card("src/b dir/b.ts")).toHaveAttribute("data-open", "true");
    expect(card("src/a.ts")).toHaveAttribute("data-open", "false");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("without a file param no large file is opened (control for the target test)", () => {
    state.query = "tab=diff";
    renderPage();
    expect(document.querySelector('[data-file-path="src/b dir/b.ts"]')).toHaveAttribute("data-open", "false");
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("switching tabs manually drops the file param from the URL", () => {
    state.query = "tab=diff&file=src%2Fa.ts";
    renderPage();
    fireEvent.click(screen.getByText("Overview"));

    expect(state.replace).toHaveBeenCalledTimes(1);
    const url = new URL(state.replace.mock.calls[0]![0] as string, "http://x");
    expect(url.searchParams.get("tab")).toBe("overview");
    expect(url.searchParams.has("file")).toBe(false);
  });
});
