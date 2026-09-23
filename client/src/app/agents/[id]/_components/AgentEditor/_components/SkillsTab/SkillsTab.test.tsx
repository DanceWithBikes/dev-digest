import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const SKILLS: Skill[] = [
  {
    id: "sk1",
    name: "no-secrets",
    type: "security",
    version: 1,
    body: "Never log secrets.",
    description: "Secret hygiene",
    source: "manual",
    enabled: true,
    agent_count: 1,
  },
  {
    id: "sk2",
    name: "naming",
    type: "convention",
    version: 1,
    body: "Use descriptive names.",
    description: "Naming rules",
    source: "manual",
    enabled: false,
    agent_count: 0,
  },
];

// Hoisted so the assertions can see the mutations the tab fires.
const m = vi.hoisted(() => ({ setSkills: vi.fn(), updateSkill: vi.fn() }));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: [{ skill_id: "sk1", position: 0 }] }),
  useSetAgentSkills: () => ({ mutate: m.setSkills }),
  useUpdateSkill: () => ({ mutate: m.updateSkill }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  m.setSkills.mockClear();
  m.updateSkill.mockClear();
});

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <div data-theme="dark">
        <SkillsTab agent={AGENT} />
      </div>
    </NextIntlClientProvider>,
  );
}

function toggleFor(name: string) {
  const group = screen.getByRole("group", { name: `Enable ${name} for every agent` });
  return within(group).getByRole("switch");
}

describe("SkillsTab — attach vs global enabled", () => {
  it("shows an attach control, an enabled toggle and a type label for every skill", () => {
    renderWithIntl();
    expect(screen.getByRole("checkbox", { name: "Attach no-secrets" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Attach naming" })).toBeInTheDocument();
    expect(toggleFor("no-secrets")).toHaveAttribute("aria-checked", "true");
    expect(toggleFor("naming")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("convention")).toBeInTheDocument();
  });

  it("flips only the global enabled flag, never the attachment", () => {
    renderWithIntl();
    fireEvent.click(toggleFor("no-secrets"));
    expect(m.updateSkill).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
    expect(m.setSkills).not.toHaveBeenCalled();
  });

  it("flips only the attachment, never the global enabled flag", () => {
    renderWithIntl();
    fireEvent.click(screen.getByRole("checkbox", { name: "Attach naming" }));
    expect(m.setSkills).toHaveBeenCalledWith({ agentId: "ag1", skillIds: ["sk1", "sk2"] });
    expect(m.updateSkill).not.toHaveBeenCalled();
  });

  it("offers reorder controls only on attached rows", () => {
    renderWithIntl();
    expect(screen.getByLabelText("Reorder no-secrets")).toBeInTheDocument();
    expect(screen.queryByLabelText("Reorder naming")).not.toBeInTheDocument();
  });
});
