/* CiRunsView — the CI Runs page (SPEC-05 AC-109 to AC-119, AC-142). The CI
   hooks are mocked at the module boundary (there is no global fetch stub); the
   view, its helpers and the real English copy run for real. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRun, CiRunsPage } from "@devdigest/shared";
import messages from "../../../../../messages/en/ci.json";

const h = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  filters: [] as unknown[],
  refetch: vi.fn(),
}));
vi.mock("../../../../lib/hooks/ci", () => ({
  useCiRuns: (filters: unknown) => {
    h.filters.push(filters);
    return { ...h.state, refetch: h.refetch };
  },
}));
vi.mock("../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security Reviewer" }] }),
}));
vi.mock("../../../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ full_name: "acme/shop" }] }),
}));
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

beforeEach(() => {
  h.filters = [];
  h.refetch.mockReset();
});
afterEach(cleanup);

const run = (over: Partial<CiRun> = {}): CiRun => ({
  id: "r1",
  repository: "acme/shop",
  pr_number: 42,
  agent: "Security Reviewer",
  verdict: "comment",
  findings_count: 3,
  blockers: 0,
  cost_usd: 0.0123,
  duration_ms: 75_000,
  head_sha: "abc",
  job_url: "https://github.com/acme/shop/actions/runs/1",
  status: "succeeded",
  ran_at: "2026-10-01T10:00:00Z",
  ...over,
});

function setup(
  page: Partial<CiRunsPage> = {},
  flags: Record<string, unknown> = {},
  initialAgentId = "",
) {
  const data: CiRunsPage = { runs: [run()], warnings: [], page: 1, has_more: false, ...page };
  h.state = { data, isLoading: false, isError: false, isSuccess: true, isFetching: false, ...flags };
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsView initialAgentId={initialAgentId} />
    </NextIntlClientProvider>,
  );
}

const lastFilters = () => h.filters[h.filters.length - 1];

describe("CiRunsView rows and columns", () => {
  it("shows the eight columns and one row per run with formatted cost, duration and a new-tab job link", () => {
    setup();
    const headers = screen.getAllByRole("columnheader").map((e) => e.textContent);
    expect(headers).toEqual(["Repository", "Pull request", "Agent", "Verdict", "Findings", "Cost", "Duration", "Job"]);

    const row = screen.getByTestId("ci-run-row");
    expect(within(row).getByText("acme/shop")).toBeInTheDocument();
    expect(within(row).getByText("#42")).toBeInTheDocument();
    expect(within(row).getByText("$0.0123")).toBeInTheDocument();
    expect(within(row).getByText("1m 15s")).toBeInTheDocument();
    const link = within(row).getByRole("link", { name: "View" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/shop/actions/runs/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("renders an em dash for a null cost and no job link without a safe job url", () => {
    setup({ runs: [run({ cost_usd: null, job_url: "javascript:alert(1)" })] });
    const row = screen.getByTestId("ci-run-row");
    expect(within(row).getByTestId("ci-run-cost")).toHaveTextContent(/^—$/);
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
  });

  it("labels a failed run differently from a succeeded one and shows blockers only on succeeded runs", () => {
    setup({
      runs: [
        run({ id: "ok", status: "succeeded", blockers: 2 }),
        run({ id: "bad", status: "failed", blockers: 2, verdict: null, findings_count: null }),
      ],
    });
    const [ok, bad] = screen.getAllByTestId("ci-run-row") as [HTMLElement, HTMLElement];
    expect(within(ok).getByTestId("ci-run-status")).toHaveTextContent("Succeeded");
    expect(within(ok).getByText("2 blockers")).toBeInTheDocument();
    expect(within(bad).getByTestId("ci-run-status")).toHaveTextContent("Failed");
    expect(within(bad).queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("renders agent-controlled strings as literal text, never as HTML or markdown", () => {
    const payload = "<script>window.__pwned=1</script> **bold** <b>x</b>";
    setup({ runs: [run({ agent: payload, repository: "acme/<b>shop</b>" })] });
    const row = screen.getByTestId("ci-run-row");
    expect(within(row).getByText(payload)).toBeInTheDocument();
    expect(within(row).getByText("acme/<b>shop</b>")).toBeInTheDocument();
    expect(row.querySelector("script")).toBeNull();
    expect(row.querySelector("b")).toBeNull();
    expect(row.querySelector("strong")).toBeNull();
  });
});

describe("CiRunsView page states", () => {
  it("Refresh refetches once, and there is no auto-refresh indicator", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/auto-refresh/i)).not.toBeInTheDocument();
  });

  it("disables Refresh while a fetch is in flight", () => {
    setup({}, { isFetching: true });
    expect(screen.getByRole("button", { name: "Refreshing…" })).toBeDisabled();
  });

  it("shows per-repo refresh warnings next to the rows that did load", () => {
    setup({ warnings: [{ repo: "acme/api", message: "rate limited" }] });
    const banner = screen.getByTestId("ci-run-warnings");
    expect(banner).toHaveTextContent("Some repositories could not be refreshed");
    expect(banner).toHaveTextContent("acme/api: rate limited");
    expect(screen.getByTestId("ci-run-row")).toBeInTheDocument();
  });

  it("shows the loading text while the first page loads, without rows or empty state", () => {
    setup({}, { data: undefined, isLoading: true, isSuccess: false });
    expect(screen.getByText("Loading CI runs…")).toBeInTheDocument();
    expect(screen.queryByTestId("ci-run-row")).not.toBeInTheDocument();
    expect(screen.queryByText("No CI runs yet")).not.toBeInTheDocument();
  });

  it("shows the load error with its message and Retry refetches once", () => {
    setup({}, { data: undefined, isError: true, isSuccess: false, error: new Error("gateway down") });
    expect(screen.getByText("Couldn’t load CI runs")).toBeInTheDocument();
    expect(screen.getByText("gateway down")).toBeInTheDocument();
    expect(screen.queryByText("No CI runs yet")).not.toBeInTheDocument();
    expect(h.refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state and no table when there are no runs", () => {
    setup({ runs: [] });
    expect(screen.getByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("CiRunsView filters", () => {
  it("starts on Last 7 days, offers All time, and a changed filter resets to page 1", () => {
    setup({ has_more: true }, {}, "a1");
    const windowSelect = screen.getByRole("option", { name: "Last 7 days" }).closest("select")!;
    expect(windowSelect).toHaveValue("7d");
    expect(within(windowSelect).getByRole("option", { name: "All time" })).toBeInTheDocument();
    expect(lastFilters()).toMatchObject({ window: "7d", agent_id: "a1", page: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(lastFilters()).toMatchObject({ page: 2 });

    fireEvent.change(windowSelect, { target: { value: "all" } });
    expect(lastFilters()).toMatchObject({ window: "all", page: 1 });

    const statusSelect = screen.getByRole("option", { name: "All statuses" }).closest("select")!;
    fireEvent.change(statusSelect, { target: { value: "failed" } });
    expect(lastFilters()).toMatchObject({ window: "all", status: "failed", page: 1 });

    const repoSelect = screen.getByRole("option", { name: "All repos" }).closest("select")!;
    fireEvent.change(repoSelect, { target: { value: "acme/shop" } });
    expect(lastFilters()).toMatchObject({ repo: "acme/shop" });
  });
});
