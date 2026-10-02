import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/context.json";

const state = vi.hoisted(() => ({ save: vi.fn() }));

const DOCS = [
  { path: "docs/Spec.md", type: "spec", chars: 400, tokens: 100, agents_count: 0, skills_count: 0 },
  { path: "docs/other.md", type: "doc", chars: 80, tokens: 20, agents_count: 0, skills_count: 0 },
];

vi.mock("../../lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "r1", full_name: "o/r" }] }),
}));
vi.mock("../../lib/hooks/context", () => ({
  useContextFiles: () => ({ data: { documents: DOCS }, isError: false }),
  useAgentContext: (id: string | null) => ({
    data: id
      ? {
          repo_id: "r1",
          attachments: [
            { path: "docs/Spec.md", missing: false },
            { path: "gone.md", missing: true },
          ],
          linked_skill_paths: ["docs/other.md"],
        }
      : undefined,
    isError: false,
  }),
  useSkillContext: () => ({ data: undefined, isError: false }),
  useSaveAgentContext: () => ({ mutate: state.save, isPending: false, isError: false }),
  useSaveSkillContext: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useContextPreview: () => ({
    data: { path: "docs/Spec.md", text: "# Hi\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>", chars: 1, tokens: 1 },
    isLoading: false,
    isError: false,
  }),
}));

import { ContextSelectionPanel } from "./ContextSelectionPanel";

afterEach(cleanup);

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextSelectionPanel ownerKind="agent" ownerId="a1" repoId="r1" onRepoChange={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("ContextSelectionPanel", () => {
  it("flags a missing attachment and counts it as 0 tokens", () => {
    renderPanel();
    expect(screen.getByText("missing")).toBeTruthy();
    expect(screen.getByText("Selected: 2 documents · ~100 tokens")).toBeTruthy();
  });

  it("estimates the prompt once per path across own and linked-skill documents", () => {
    renderPanel();
    expect(screen.getByText(/Prompt will carry ~120 tokens/)).toBeTruthy();
  });

  it("filters by path as you type, ignoring case", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Search documents…"), { target: { value: "OTHER" } });
    expect(screen.queryByLabelText("Attach docs/Spec.md")).toBeNull();
    expect(screen.getByLabelText("Attach docs/other.md")).toBeTruthy();
  });

  it("updates the total when checking and saves the checked paths", () => {
    renderPanel();
    fireEvent.click(screen.getByLabelText("Attach docs/other.md"));
    expect(screen.getByText("Selected: 3 documents · ~120 tokens")).toBeTruthy();
    fireEvent.click(screen.getByText("Save"));
    expect(state.save.mock.calls[0]![0]).toEqual(["docs/Spec.md", "gone.md", "docs/other.md"]);
  });

  it("renders preview Markdown without raw HTML elements", () => {
    const { container } = renderPanel();
    fireEvent.click(screen.getAllByText("Preview")[0]!);
    expect(screen.getByText("Hi")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
  // NFR-3. jsdom does no native key activation and user-event is not installed, so
  // Tab/Space/Enter operability is proven structurally: native, focusable, enabled
  // controls in DOM (= tab) order. A div or span with onClick fails every check.
  it("keeps the checkbox and the preview opener native, focusable and in tab order", () => {
    renderPanel();
    const box = screen.getByLabelText("Attach docs/Spec.md") as HTMLInputElement;
    const opener = screen.getAllByRole("button", { name: "Preview" })[0]!;

    expect(box.tagName).toBe("INPUT");
    expect(box.type).toBe("checkbox");
    expect(opener.tagName).toBe("BUTTON");
    for (const el of [box, opener]) {
      expect(el.tabIndex).toBeGreaterThanOrEqual(0);
      expect(el).toBeEnabled();
      el.focus();
      expect(el).toHaveFocus();
    }
    const tabbables = Array.from(document.querySelectorAll<HTMLElement>("input, button, select, textarea"));
    expect(tabbables.indexOf(box)).toBeLessThan(tabbables.indexOf(opener));

    // The click a browser dispatches for Space on a checkbox toggles the selection;
    // the checkbox is controlled, so this proves the toggle is wired to its change event.
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    fireEvent.click(opener);
    expect(screen.getByRole("button", { name: "Close preview" })).toBeInTheDocument();
  });
});
