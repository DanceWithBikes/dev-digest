import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import type { ReviewFocusItem } from "@devdigest/shared";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

const items: ReviewFocusItem[] = [
  { file: "src/changed.ts", line: 4, reason: "Core change" },
  { file: "src/other.ts", line: 9, reason: "Callers **may** break" },
];

function renderFocus(over: Partial<React.ComponentProps<typeof ReviewFocus>> = {}, theme: "dark" | "light" = "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  const onOpenFile = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <ReviewFocus
        items={items}
        changedPaths={new Set(["src/changed.ts"])}
        repoFullName="acme/app"
        briefHeadSha="deadbeefcafe"
        onOpenFile={onOpenFile}
        {...over}
      />
    </NextIntlClientProvider>,
  );
  return { onOpenFile };
}

describe("ReviewFocus (list lens)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`${theme}: titled with the count; each item reads file:line — reason (AC-74, AC-75)`, () => {
      renderFocus({}, theme);
      expect(screen.getByText("Review focus — read these first (2)")).toBeInTheDocument();
      const first = screen.getByText("src/changed.ts:4").closest("li");
      expect(first).toHaveTextContent("src/changed.ts:4 — Core change");
    });
  });

  it("changed file is a native button that opens it; other file is a GitHub link at the brief SHA (AC-76, AC-79)", () => {
    const { onOpenFile } = renderFocus();
    const btn = screen.getByRole("button", { name: "src/changed.ts:4" });
    expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
    fireEvent.click(btn);
    expect(onOpenFile).toHaveBeenCalledWith("src/changed.ts");
    expect(onOpenFile).toHaveBeenCalledTimes(1);

    const link = screen.getByRole("link", { name: "src/other.ts:9" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/blob/deadbeefcafe/src/other.ts#L9");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(onOpenFile).toHaveBeenCalledTimes(1);
  });

  it("falls back to plain text when the repo is unknown, rendered literally (AC-79, AC-80)", () => {
    renderFocus({ repoFullName: null });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/other.ts:9").closest("li")).toHaveTextContent("Callers **may** break");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows the empty copy and a zero count for no items", () => {
    renderFocus({ items: [] });
    expect(screen.getByText("Review focus — read these first (0)")).toBeInTheDocument();
    expect(screen.getByText("Nothing flagged for a first read.")).toBeInTheDocument();
  });
});
