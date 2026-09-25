/* DiffGroup — one Smart Diff role group: starts open (its children — the
   grouped diff — visible immediately), and the files/findings summary is
   deliberately COLLAPSED-ONLY (matches the design mockups), never shown
   alongside the open children. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiffGroup } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import { DiffGroup } from "./DiffGroup";

afterEach(cleanup);

function group(role: SmartDiffGroup["role"], paths: string[]): SmartDiffGroup {
  return {
    role,
    files: paths.map((path) => ({ path, additions: 1, deletions: 0, finding_lines: [], pseudocode_summary: null })),
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DiffGroup (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`starts open, showing its children and the role label in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <DiffGroup group={group("core", ["a.ts"])} pathsWithFindings={new Set()}>
            <div>child diff content</div>
          </DiffGroup>
        </div>,
      );
      expect(screen.getByText("Core")).toBeInTheDocument();
      expect(screen.getByText("child diff content")).toBeInTheDocument();
    });
  });
});

describe("DiffGroup — collapse reveals the files/findings summary", () => {
  it("hides the summary while expanded, and shows both counts only once collapsed", () => {
    const g = group("core", ["a.ts", "b.ts", "c.ts"]);
    renderWithIntl(
      <DiffGroup group={g} pathsWithFindings={new Set(["a.ts", "b.ts"])}>
        <div>child diff content</div>
      </DiffGroup>,
    );

    // Expanded by default: children visible, no summary rendered at all.
    expect(screen.getByText("child diff content")).toBeInTheDocument();
    expect(screen.queryByText(/files/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Core"));

    // Collapsed: children hidden, summary shows both the file count and the
    // findings count (2 of the 3 files are in `pathsWithFindings`).
    expect(screen.queryByText("child diff content")).not.toBeInTheDocument();
    expect(screen.getByText(/3 files/)).toBeInTheDocument();
    expect(screen.getByText(/2 files with findings/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Core"));

    // Re-expanded: back to the children, summary gone again.
    expect(screen.getByText("child diff content")).toBeInTheDocument();
    expect(screen.queryByText(/files/)).not.toBeInTheDocument();
  });

  it("omits the findings-count fragment when nothing in the group has a finding", () => {
    const g = group("docs", ["README.md"]);
    renderWithIntl(
      <DiffGroup group={g} pathsWithFindings={new Set()}>
        <div>child diff content</div>
      </DiffGroup>,
    );
    fireEvent.click(screen.getByText("Docs"));
    expect(screen.getByText(/1 files/)).toBeInTheDocument();
    expect(screen.queryByText(/files with findings/)).not.toBeInTheDocument();
  });
});
