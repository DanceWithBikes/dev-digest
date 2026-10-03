/* SPEC-02 architecture section (AC-91, AC-107): the prose, a diagram of labelled
   nodes joined by DIRECTED edges, and below it the directories with their
   indexed file count, whatever the section's origin. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ArchitectureSection as Data } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/onboarding.json";
import { ArchitectureSection } from "./ArchitectureSection";

afterEach(cleanup);

const section = (over: Partial<Data> = {}): Data => ({
  id: "architecture",
  origin: "model",
  prose: "Routes call **services**.",
  directories: [{ path: "src", files: 9 }, { path: "lib", files: 1 }],
  diagram: {
    nodes: [{ id: "src", label: "src" }, { id: "lib", label: "lib" }, { id: "(root)", label: "(root)" }],
    edges: [{ from: "src", to: "lib", weight: 3 }, { from: "(root)", to: "src", weight: 1 }],
  },
  ...over,
});

function renderSection(data: Data) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ArchitectureSection section={data} fullName="acme/payments-api" />
    </NextIntlClientProvider>,
  );
}

describe("ArchitectureSection", () => {
  it("AC-91: shows the prose and renders the diagram as labelled nodes joined by directed edges with their weight", () => {
    renderSection(section());
    expect(screen.getByText("services").tagName).toBe("STRONG");
    const diagram = screen.getByRole("img", { name: "Architecture diagram" });
    for (const label of ["src", "lib", "(root)"]) expect(within(diagram).getAllByText(label).length).toBeGreaterThan(0);
    // one directed edge per entry: an arrow head on the line, the weight beside it
    const edge = within(diagram).getByText("src depends on lib (3)").parentElement!;
    const line = edge.querySelector("line")!;
    expect(line.getAttribute("marker-end")).toBe("url(#onboarding-arrow)");
    expect(edge.textContent).toContain("3");
    expect(diagram.querySelectorAll("line")).toHaveLength(2);
    expect(within(diagram).getByText("(root) depends on src (1)")).toBeTruthy();
    // direction: the tail is on the importer's side (x1 < x2 for src -> lib)
    expect(Number(line.getAttribute("x1"))).toBeLessThan(Number(line.getAttribute("x2")));
  });

  it("AC-91: an opposite pair of edges stays two distinct arrows", () => {
    renderSection(
      section({
        diagram: {
          nodes: [{ id: "a", label: "a" }, { id: "b", label: "b" }],
          edges: [{ from: "a", to: "b", weight: 1 }, { from: "b", to: "a", weight: 2 }],
        },
      }),
    );
    const diagram = screen.getByRole("img", { name: "Architecture diagram" });
    expect(diagram.querySelectorAll("line")).toHaveLength(2);
    expect(within(diagram).getByText("a depends on b (1)")).toBeTruthy();
    for (const line of Array.from(diagram.querySelectorAll("line"))) {
      for (const attr of ["x1", "y1", "x2", "y2"]) expect(Number.isFinite(Number(line.getAttribute(attr)))).toBe(true);
    }
    expect(diagram.getAttribute("viewBox")).not.toMatch(/NaN/);
    expect(within(diagram).getByText("b depends on a (2)")).toBeTruthy();
  });

  it("AC-107: lists each directory path with its indexed file count below the diagram (model origin)", () => {
    renderSection(section());
    const dirs = screen.getByText("Directories").parentElement!;
    const rows = within(dirs).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["src9 files", "lib1 file"]);
    const diagram = screen.getByRole("img", { name: "Architecture diagram" });
    expect(diagram.compareDocumentPosition(dirs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-107/AC-91: a skeleton section (no prose) still shows the diagram and the directories list", () => {
    renderSection(section({ origin: "skeleton", prose: "" }));
    expect(screen.getByText("Outline · no AI")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Architecture diagram" })).toBeTruthy();
    const rows = within(screen.getByText("Directories").parentElement!).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual(["src9 files", "lib1 file"]);
  });

  it("AC-91: an empty diagram says so instead of drawing an empty box", () => {
    renderSection(section({ diagram: { nodes: [], edges: [] }, directories: [] }));
    expect(screen.queryByRole("img", { name: "Architecture diagram" })).toBeNull();
    expect(screen.getByText("No diagram is available for this tour.")).toBeTruthy();
    expect(screen.queryByText("Directories")).toBeNull();
  });
});
