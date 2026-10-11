/* CiTab — an agent's CI deployment tab (SPEC-05 AC-75 to AC-87): the active
   count counts only `active` installations, the shared "Fail CI on" gate sends
   `ci_fail_on` through the agent update, the history link carries the agent id,
   and "+ Add to CI" / "Update CI config" open the wizard (preset repo for the
   latter). CI hooks are mocked at the module boundary. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";
import agentsMessages from "../../../../../../../../messages/en/agents.json";

const h = vi.hoisted(() => ({
  installations: [] as unknown[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  update: vi.fn(),
  previewArgs: [] as unknown[],
}));
vi.mock("../../../../../../../lib/hooks/ci", () => ({
  useCiInstallations: () => ({
    data: h.isError ? undefined : h.installations,
    isLoading: h.isLoading,
    isError: h.isError,
    error: h.isError ? new Error("boom") : null,
    refetch: h.refetch,
  }),
  useCiPreview: (_id: string, input: unknown) => {
    h.previewArgs.push(input);
    return { data: { files: [] }, isLoading: false, error: null };
  },
  useExportCi: () => ({ mutate: vi.fn(), data: undefined, error: null, isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: h.update }),
}));
vi.mock("../../../../../../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ full_name: "acme/shop" }, { full_name: "acme/api" }] }),
}));
vi.mock("../../../../../../../lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: null }) }));

import { CiTab } from "./CiTab";

beforeEach(() => {
  h.installations = [];
  h.isLoading = false;
  h.update.mockReset();
  h.isError = false;
  h.refetch.mockReset();
  h.previewArgs = [];
});
afterEach(cleanup);

const AGENT = { id: "a 1", name: "Security Reviewer", ci_fail_on: "critical" } as Agent;

const inst = (over: Partial<CiInstallation>): CiInstallation => ({
  id: "i1",
  agent_id: "a 1",
  repo: "acme/shop",
  target_type: "gha",
  state: "active",
  agent_version: 1,
  runner_version: "0.1.0",
  pr_url: null,
  behind: false,
  installed_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  latest_run: null,
  ...over,
});

const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages, agents: agentsMessages }}>
      <CiTab agent={AGENT} />
    </NextIntlClientProvider>,
  );

describe("CiTab", () => {
  it("shows the empty hint and zero active when nothing is installed", () => {
    mount();
    expect(screen.getByText("CI deployment")).toBeInTheDocument();
    expect(screen.getByTestId("ci-active-badge")).toHaveTextContent("Active in 0 repos");
    expect(screen.getByText(/Not deployed to CI yet/)).toBeInTheDocument();
    expect(screen.queryByTestId("ci-installation-row")).not.toBeInTheDocument();
  });

  it("counts only active installations in the badge and renders one row per repo", () => {
    h.installations = [
      inst({ id: "i1", repo: "acme/shop", state: "active" }),
      inst({ id: "i2", repo: "acme/api", state: "pr_open" }),
      inst({ id: "i3", repo: "acme/old", state: "pr_closed" }),
    ];
    mount();
    expect(screen.getByTestId("ci-active-badge")).toHaveTextContent("Active in 1 repos");
    expect(screen.getAllByTestId("ci-installation-row")).toHaveLength(3);
  });

  it("saves the shared Fail CI on gate through the agent update and links to this agent's run history", () => {
    mount();
    const select = screen.getByRole("option", { name: /Block on critical/ }).closest("select")!;
    expect(select).toHaveValue("critical");
    fireEvent.change(select, { target: { value: "any" } });
    expect(h.update).toHaveBeenCalledWith({ id: "a 1", patch: { ci_fail_on: "any" } });

    expect(screen.getByRole("link", { name: "CI run history" })).toHaveAttribute("href", "/ci-runs?agent=a%201");
  });

  it("opens the wizard from + Add to CI and from Update CI config with that repo preselected", () => {
    h.installations = [inst({ repo: "acme/api" })];
    mount();
    expect(screen.queryByTestId("ci-wizard-step-target")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "+ Add to CI" }));
    expect(screen.getByTestId("ci-wizard-step-target")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(screen.queryByTestId("ci-wizard-step-target")).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByTestId("ci-installation-row")).getByRole("button", { name: "Update CI config" }));
    expect(screen.getByTestId("ci-wizard-step-target")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(h.previewArgs[h.previewArgs.length - 1]).toMatchObject({ repo: "acme/api" });
  });

  it("shows an inline error with retry instead of the empty hint when installations fail to load", () => {
    h.isError = true;
    mount();
    expect(screen.getByText("Couldn’t load CI installations")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.queryByText(/Not deployed to CI yet/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("ci-active-badge")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(h.refetch).toHaveBeenCalled();
  });

  it("links + Add repository to onboarding", () => {
    mount();
    expect(screen.getByRole("link", { name: "+ Add repository" })).toHaveAttribute("href", "/onboarding");
  });
});
