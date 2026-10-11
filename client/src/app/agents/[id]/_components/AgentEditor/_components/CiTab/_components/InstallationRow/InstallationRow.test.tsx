/* InstallationRow — one installed repo in the agent's CI tab (SPEC-05 AC-77
   to AC-84): repo, target, latest run or "no runs yet", versions, the
   "behind" badge, the state label and the Update CI config action. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiInstallation } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/ci.json";
import { InstallationRow } from "./InstallationRow";

afterEach(cleanup);

const installation = (over: Partial<CiInstallation> = {}): CiInstallation => ({
  id: "i1",
  agent_id: "a1",
  repo: "acme/shop",
  target_type: "gha",
  state: "active",
  agent_version: 3,
  runner_version: "0.1.0",
  pr_url: null,
  behind: false,
  installed_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
  latest_run: null,
  ...over,
});

const mount = (inst: CiInstallation, onUpdate = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <InstallationRow installation={inst} onUpdate={onUpdate} />
    </NextIntlClientProvider>,
  );

describe("InstallationRow", () => {
  it("shows repo, target, versions, state and no-runs text, and Update CI config calls back", () => {
    const onUpdate = vi.fn();
    mount(installation(), onUpdate);
    expect(screen.getByText("acme/shop")).toBeInTheDocument();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
    expect(screen.getByText("agent v3 · runner 0.1.0")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("no runs yet")).toBeInTheDocument();
    expect(screen.queryByText("behind")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Update CI config" }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows the latest run status, the behind badge and the PR open label", () => {
    mount(
      installation({
        state: "pr_open",
        behind: true,
        latest_run: { status: "failed", ran_at: new Date().toISOString() },
      }),
    );
    expect(screen.getByText("PR open")).toBeInTheDocument();
    expect(screen.getByText("behind")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.queryByText("no runs yet")).not.toBeInTheDocument();
  });
});
