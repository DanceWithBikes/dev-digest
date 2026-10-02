/* SkillConfigTab — the "Project context to use" section (SPEC-01 AC-60, AC-61).
   The section must sit under the skill form with its own title and the same
   selection panel the agent tab uses; hook modules are mocked at the boundary. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import contextMessages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "@/lib/toast";

const state = vi.hoisted(() => ({ saveSkill: vi.fn() }));

vi.mock("@/lib/hooks/skills", () => ({
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "r1", full_name: "acme/shop" }] }),
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", full_name: "acme/shop" } }),
}));
vi.mock("@/lib/hooks/context", () => ({
  useContextFiles: () => ({
    data: {
      documents: [
        { path: "docs/rubric.md", type: "spec", chars: 1, tokens: 40, agents_count: 0, skills_count: 1 },
        { path: "docs/other.md", type: "doc", chars: 1, tokens: 5, agents_count: 0, skills_count: 0 },
      ],
    },
    isError: false,
  }),
  useSkillContext: () => ({
    data: {
      repo_id: "r1",
      attachments: [
        { path: "docs/rubric.md", missing: false },
        { path: "docs/removed.md", missing: true },
      ],
    },
    isError: false,
  }),
  useSaveSkillContext: () => ({ mutate: state.saveSkill, isPending: false, isError: false }),
  useAgentContext: () => ({ data: undefined, isError: false }),
  useSaveAgentContext: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useContextPreview: () => ({ data: undefined, isLoading: true, isError: false }),
}));

import { SkillConfigTab } from "./SkillConfigTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "Rubric",
  description: "Scoring rubric",
  type: "rubric",
  source: "manual",
  body: "Score from 1 to 5.",
  enabled: true,
  version: 1,
  agent_count: 0,
} as Skill;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages, context: contextMessages }}>
      <ToastProvider>
        <SkillConfigTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillConfigTab — Project context to use", () => {
  it("shows the section title and the same selection panel as the agent tab", () => {
    renderTab();
    expect(screen.getByRole("heading", { level: 2, name: "Project context to use" })).toBeInTheDocument();
    expect(screen.getByText(/Documents from a repo that are added to the prompt/)).toBeInTheDocument();

    // Repo picker, search, checkbox list, missing flag and selection total (AC-61).
    expect(screen.getByLabelText("Repository")).toHaveValue("r1");
    expect(screen.getByLabelText("Search documents…")).toBeInTheDocument();
    expect(screen.getByLabelText("Attach docs/rubric.md")).toBeChecked();
    expect(screen.getByLabelText("Attach docs/other.md")).not.toBeChecked();
    expect(screen.getByText("missing")).toBeInTheDocument();
    expect(screen.getByText("Selected: 2 documents · ~40 tokens")).toBeInTheDocument();
    // A skill has no prompt of its own, so no prompt estimate line.
    expect(screen.queryByText(/Prompt will carry/)).toBeNull();
  });

  it("saves the checked paths for the skill through the panel's own Save", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Attach docs/other.md"));
    // Two Save buttons: the skill form's and the panel's; the panel's is the last.
    const saves = screen.getAllByRole("button", { name: "Save" });
    fireEvent.click(saves[saves.length - 1]!);
    expect(state.saveSkill.mock.calls[0]![0]).toEqual(["docs/rubric.md", "docs/removed.md", "docs/other.md"]);
  });
});
