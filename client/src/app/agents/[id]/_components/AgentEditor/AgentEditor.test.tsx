import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import contextMessages from "../../../../../../messages/en/context.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// Project Context tab: real panel + helpers, hook modules mocked at the boundary.
const ctx = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("../../../../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "r1", full_name: "acme/shop" }] }),
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/shop" } }),
}));
vi.mock("../../../../../lib/hooks/context", () => {
  const doc = (path: string, tokens: number) => ({ path, type: "doc", chars: 1, tokens, agents_count: 0, skills_count: 0 });
  return {
    useContextFiles: () => ({
      data: { documents: [doc("docs/own.md", 100), doc("docs/shared.md", 50), doc("docs/skill-only.md", 20)] },
      isError: false,
    }),
    useAgentContext: () => ({
      data: {
        repo_id: "r1",
        // own: own + shared + a file that no longer exists; skills add shared + skill-only
        attachments: [
          { path: "docs/own.md", missing: false },
          { path: "docs/shared.md", missing: false },
          { path: "docs/gone.md", missing: true },
        ],
        linked_skill_paths: ["docs/shared.md", "docs/skill-only.md"],
      },
      isError: false,
    }),
    useSkillContext: () => ({ data: undefined, isError: false }),
    useSaveAgentContext: () => ({ mutate: ctx.save, isPending: false, isError: false }),
    useSaveSkillContext: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
    useContextPreview: () => ({ data: undefined, isLoading: true, isError: false }),
  };
});

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages, context: contextMessages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });
});

describe("Agent Editor — Context tab (SPEC-01 AC-51..59)", () => {
  it("defaults the picker to the active repo and flags a missing attachment at 0 tokens", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(screen.getByLabelText("Repository")).toHaveValue("r1");
    expect(screen.getByText("missing")).toBeInTheDocument();
    // own.md (100) + shared.md (50) + gone.md (missing = 0)
    expect(screen.getByText("Selected: 3 documents · ~150 tokens")).toBeInTheDocument();
  });

  it("counts a path shared by the agent and its skills once in the prompt estimate", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    // union {own, shared, gone, skill-only} = 100 + 50 + 0 + 20; double-counting shared would give 220.
    expect(screen.getByText("Prompt will carry ~170 tokens of project context for this repo")).toBeInTheDocument();

    // Unchecking shared.md drops it from the selection, but a linked skill still
    // supplies it, so the prompt estimate must not change.
    fireEvent.click(screen.getByLabelText("Attach docs/shared.md"));
    expect(screen.getByText("Selected: 2 documents · ~100 tokens")).toBeInTheDocument();
    expect(screen.getByText("Prompt will carry ~170 tokens of project context for this repo")).toBeInTheDocument();

    // Unchecking own.md (not linked anywhere) does lower it.
    fireEvent.click(screen.getByLabelText("Attach docs/own.md"));
    expect(screen.getByText("Prompt will carry ~70 tokens of project context for this repo")).toBeInTheDocument();
  });

  it("saves the checked paths for the agent", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    fireEvent.click(screen.getByLabelText("Attach docs/skill-only.md"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(ctx.save.mock.calls[0]![0]).toEqual(["docs/own.md", "docs/shared.md", "docs/gone.md", "docs/skill-only.md"]);
  });
});
