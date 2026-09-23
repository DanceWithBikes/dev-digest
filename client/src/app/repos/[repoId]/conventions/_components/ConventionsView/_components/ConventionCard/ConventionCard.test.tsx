import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  category: "error-handling",
  rule: "Errors are thrown as classes from platform/errors.ts.",
  evidence_path: "src/modules/skills/routes.ts",
  evidence_line: 55,
  evidence_snippet: "throw new NotFoundError('Skill not found');",
  confidence: 0.87,
  status: "pending",
  created_at: "2026-09-21T00:00:00.000Z",
};

function renderCard(props: Partial<React.ComponentProps<typeof ConventionCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        candidate={CANDIDATE}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onEdit={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("shows the rule, its source file and line, and the confidence", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeTruthy();
    expect(screen.getByText(/src\/modules\/skills\/routes\.ts/)).toBeTruthy();
    expect(screen.getByText(/55/)).toBeTruthy();
    expect(screen.getByText("Confidence 87%")).toBeTruthy();
  });

  it("offers Accept, Reject and Edit", () => {
    renderCard();
    expect(screen.getByText("Accept")).toBeTruthy();
    expect(screen.getByText("Reject")).toBeTruthy();
    expect(screen.getByText("Edit")).toBeTruthy();
  });

  it("edits in place, keeping the evidence on screen while the rule is reworded", () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });

    fireEvent.click(screen.getByText("Edit"));
    const textarea = screen.getByDisplayValue(CANDIDATE.rule);
    // The snippet must still be visible — it is the only way to tell whether a
    // reworded rule is still true of the code it cites.
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "Reworded rule" } });
    fireEvent.click(screen.getByText("Save"));

    expect(onEdit).toHaveBeenCalledWith({ rule: "Reworded rule", category: "error-handling" });
  });

  it("does not save an emptied rule", () => {
    const onEdit = vi.fn();
    renderCard({ onEdit });
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByDisplayValue(CANDIDATE.rule), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("marks an accepted candidate and stops offering Accept again", () => {
    renderCard({ candidate: { ...CANDIDATE, status: "accepted" } });
    expect(screen.getByText("Accepted")).toBeTruthy();
    expect(screen.getByText("Accept").closest("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("sends an accepted rule back to the candidates instead of offering Accept", () => {
    const onUnaccept = vi.fn();
    const onReject = vi.fn();
    renderCard({ candidate: { ...CANDIDATE, status: "accepted" }, onUnaccept, onReject });

    expect(screen.queryByText("Accept")).toBeNull();
    fireEvent.click(screen.getByText("Back to candidates"));

    expect(onUnaccept).toHaveBeenCalledTimes(1);
    // Un-accepting must not reject: a rejected rule never comes back from a
    // re-scan, an un-accepted one is still up for a decision.
    expect(onReject).not.toHaveBeenCalled();
  });
});
