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

  it("says so when the skill reaches no agent at all", () => {
    renderCard(<SkillCard skill={{ ...SKILL, agent_count: 0 }} />);
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
