import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Flag tests that only cover the happy path.",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 3,
  agent_count: 2,
  agents: [
    { id: "a1", name: "security-reviewer" },
    { id: "a2", name: "style-reviewer" },
  ],
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("shows the current version and how many agents the skill reaches", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("names the agents that use the skill, linking to each", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("security-reviewer").closest("a")).toHaveAttribute("href", "/agents/a1");
    expect(screen.getByText("style-reviewer").closest("a")).toHaveAttribute("href", "/agents/a2");
  });

  it("collapses names past the limit into '+N more'", () => {
    const agents = ["a", "b", "c", "d", "e"].map((n) => ({ id: n, name: `agent-${n}` }));
    renderCard(<SkillCard skill={{ ...SKILL, agent_count: 5, agents }} />);
    expect(screen.queryByText("agent-d")).not.toBeInTheDocument();
    expect(screen.getByText("+2 more")).toBeInTheDocument();
  });

  it("says so when the skill reaches no agent at all", () => {
    renderCard(<SkillCard skill={{ ...SKILL, agent_count: 0, agents: [] }} />);
    expect(screen.getByText("No agents")).toBeInTheDocument();
  });

  it("asks for confirmation in a dialog before deleting — never straight away", () => {
    const onDelete = vi.fn();
    renderCard(<SkillCard skill={SKILL} onDelete={onDelete} />);

    fireEvent.click(screen.getByLabelText("Delete pr-quality-rubric"));
    expect(onDelete).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("attached to 2 agents");

    fireEvent.click(screen.getByText("Delete skill"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("closes the dialog without deleting when cancelled", () => {
    const onDelete = vi.fn();
    renderCard(<SkillCard skill={SKILL} onDelete={onDelete} />);

    fireEvent.click(screen.getByLabelText("Delete pr-quality-rubric"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("does not select the card when the delete dialog is used", () => {
    const onClick = vi.fn();
    renderCard(<SkillCard skill={SKILL} onClick={onClick} onDelete={() => {}} />);

    fireEvent.click(screen.getByLabelText("Delete pr-quality-rubric"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(onClick).not.toHaveBeenCalled();
  });
});
