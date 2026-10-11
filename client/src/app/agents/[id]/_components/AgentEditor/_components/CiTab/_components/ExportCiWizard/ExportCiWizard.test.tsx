/* ExportCiWizard — the 4-step Export to CI modal (SPEC-05 AC-88 to AC-108,
   plus the 409/422 message shown on Install). The CI hooks are mocked at the
   module boundary (no global fetch stub exists); the wizard, its steps, its
   helpers and the real English copy run for real. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiFile } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/ci.json";
import { ApiError } from "../../../../../../../../../lib/api";

const h = vi.hoisted(() => ({
  files: [] as unknown[],
  previewArgs: [] as unknown[],
  payloads: [] as unknown[],
  outcome: {} as { data?: unknown; error?: Error },
  preview: {} as { isSuccess?: boolean; isFetching?: boolean; error?: Error | null },
}));
vi.mock("../../../../../../../../../lib/hooks/ci", async () => {
  const React = await import("react");
  return {
    useCiPreview: (_id: string, input: unknown) => {
      h.previewArgs.push(input);
      return { data: { files: h.files }, isLoading: false, isSuccess: true, isFetching: false, error: null, ...h.preview };
    },
    useExportCi: () => {
      const [settled, setSettled] = React.useState<{ data?: unknown; error?: Error }>({});
      return {
        mutate: (payload: unknown) => {
          h.payloads.push(payload);
          setSettled(h.outcome);
        },
        data: settled.data,
        error: settled.error ?? null,
        isPending: false,
      };
    },
  };
});
vi.mock("../../../../../../../../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ full_name: "acme/shop" }, { full_name: "acme/api" }] }),
}));
vi.mock("../../../../../../../../../lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: null }) }));

import { ExportCiWizard } from "./ExportCiWizard";

const AGENT = { id: "a1", name: "Security Reviewer" } as Agent;
const WORKFLOW = ".github/workflows/devdigest-review.yml";
const RUNNER = ".devdigest/runner/index.js";
const SKILL = ".devdigest/skills/no-secrets.md";

const file = (path: string, contents: string, editable: boolean): CiFile => ({ path, contents, editable });

beforeEach(() => {
  h.files = [
    file(WORKFLOW, "name: devdigest\n", true),
    file(RUNNER, "console.log('runner')", false),
    file(SKILL, "# no secrets", true),
  ];
  h.previewArgs = [];
  h.payloads = [];
  h.outcome = {};
  h.preview = {};
});
afterEach(cleanup);

const mount = (onClose = vi.fn()) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <ExportCiWizard agent={AGENT} presetRepo={null} onClose={onClose} />
    </NextIntlClientProvider>,
  );

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const toStep = (n: 1 | 2 | 3) => {
  for (let i = 0; i < n; i++) click("Continue");
};
const pane = () => screen.getByTestId("ci-file-pane");

describe("ExportCiWizard steps", () => {
  it("offers only GitHub Actions on Target and walks Target, Preview, Configure, Install", () => {
    mount();
    for (const label of ["Target", "Preview", "Configure", "Install"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByTestId("ci-wizard-step-target")).toBeInTheDocument();
    expect(within(screen.getByTestId("ci-target-gha")).getByText("GitHub Actions")).toBeInTheDocument();
    expect(screen.queryByText(/circleci|jenkins/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bCLI\b/)).not.toBeInTheDocument();

    click("Continue");
    expect(screen.getByTestId("ci-wizard-step-preview")).toBeInTheDocument();
    click("Continue");
    expect(screen.getByTestId("ci-wizard-step-configure")).toBeInTheDocument();
    click("Continue");
    expect(screen.getByTestId("ci-wizard-step-install")).toBeInTheDocument();
    expect(screen.getByText("Open a PR with these files")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    click("Back");
    expect(screen.getByTestId("ci-wizard-step-configure")).toBeInTheDocument();
  });
});

describe("ExportCiWizard preview", () => {
  it("lists every bundle file and gives a textarea only to editable files (AC-93)", () => {
    mount();
    toStep(1);
    for (const p of [WORKFLOW, RUNNER, SKILL]) expect(screen.getByRole("button", { name: new RegExp(p.replace(/\./g, "\\.")) })).toBeInTheDocument();

    expect(within(pane()).getByRole("textbox")).toHaveValue("name: devdigest\n");

    fireEvent.click(screen.getByRole("button", { name: new RegExp("index\\.js") }));
    expect(within(pane()).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(pane()).getByText("console.log('runner')")).toBeInTheDocument();
  });

  it("keeps an edit across steps, sends only changed editable files, and discards edits when reopened (AC-94, AC-95)", () => {
    const { unmount } = mount();
    toStep(1);
    fireEvent.change(within(pane()).getByRole("textbox"), { target: { value: "name: edited\n" } });
    toStep(1);
    click("Back");
    expect(within(pane()).getByRole("textbox")).toHaveValue("name: edited\n");

    toStep(2);
    click("Install");
    expect(h.payloads).toEqual([
      {
        repo: "acme/shop",
        target: "gha",
        mode: "open_pr",
        post_as: "github_review",
        triggers: ["opened", "synchronize"],
        edits: [{ path: WORKFLOW, contents: "name: edited\n" }],
      },
    ]);

    unmount();
    mount();
    toStep(1);
    expect(within(pane()).getByRole("textbox")).toHaveValue("name: devdigest\n");
  });
});

describe("ExportCiWizard configure", () => {
  it("defaults the trigger chips, blocks Continue with none selected, and never asks for a secret (AC-96, AC-97, AC-108)", () => {
    mount();
    toStep(2);
    expect(h.previewArgs[h.previewArgs.length - 1]).toMatchObject({ triggers: ["opened", "synchronize"], post_as: "github_review" });

    const continueBtn = screen.getByRole("button", { name: "Continue" });
    expect(continueBtn).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:opened" }));
    fireEvent.click(screen.getByRole("button", { name: "pull_request:synchronize" }));
    expect(screen.getByText("Turn on at least one trigger.")).toBeInTheDocument();
    expect(continueBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    expect(continueBtn).toBeEnabled();

    expect(screen.getByText("OPENROUTER_API_KEY")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("ExportCiWizard install", () => {
  it("shows the pull request link opening in a new tab after a PR install (AC-104)", () => {
    h.outcome = {
      data: { mode: "open_pr", pr_url: "https://github.com/acme/shop/pull/7", installation: {} },
    };
    mount();
    toStep(3);
    click("Install");
    const done = screen.getByTestId("ci-install-done");
    const link = within(done).getByRole("link", { name: "View pull request" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/shop/pull/7");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("button", { name: "Install" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" }).length).toBeGreaterThan(0);
  });

  it("does not turn a non-http pr_url into a link", () => {
    h.outcome = { data: { mode: "open_pr", pr_url: "javascript:alert(1)", installation: {} } };
    mount();
    toStep(3);
    click("Install");
    expect(within(screen.getByTestId("ci-install-done")).queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the wizard on Install and shows the server's 409 message (AC-107)", () => {
    h.outcome = {
      error: new ApiError("acme/shop already has the DevDigest CI installation of another agent", 409, "ci_repo_has_other_agent"),
    };
    mount();
    toStep(3);
    fireEvent.click(screen.getByLabelText(/Copy files as a zip/));
    click("Install");
    expect(h.payloads[0]).toMatchObject({ mode: "zip" });
    const alert = screen.getByTestId("ci-install-error");
    expect(alert).toHaveTextContent("acme/shop already has the DevDigest CI installation of another agent");
    expect(screen.getByTestId("ci-wizard-step-install")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled();
    expect(screen.queryByTestId("ci-install-done")).not.toBeInTheDocument();
  });
});

describe("ExportCiWizard edits vs. repo and preview state", () => {
  it("discards Preview edits when the target repo changes", () => {
    mount();
    toStep(1);
    fireEvent.change(within(pane()).getByRole("textbox"), { target: { value: "name: edited\n" } });
    click("Back");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "acme/api" } });
    toStep(1);
    expect(within(pane()).getByRole("textbox")).toHaveValue("name: devdigest\n");
  });

  it("disables Install while the preview reloads and shows the preview error when it failed", () => {
    h.preview = { isFetching: true };
    mount();
    toStep(3);
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
    cleanup();
    h.preview = { isSuccess: false, error: new Error("boom") };
    mount();
    toStep(3);
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
    expect(screen.getByTestId("ci-install-error")).toHaveTextContent("boom");
  });
});

describe("ExportCiWizard keyboard", () => {
  it("Enter continues unless focus is on a control, and Escape closes once (NFR-6)", () => {
    const onClose = vi.fn();
    mount(onClose);
    expect(screen.getByTestId("ci-wizard-step-target")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Enter" });
    expect(screen.getByTestId("ci-wizard-step-preview")).toBeInTheDocument();

    // Enter typed inside the editable textarea belongs to the textarea and must not advance.
    fireEvent.keyDown(within(pane()).getByRole("textbox"), { key: "Enter" });
    expect(screen.getByTestId("ci-wizard-step-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("ci-wizard-step-configure")).not.toBeInTheDocument();

    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
