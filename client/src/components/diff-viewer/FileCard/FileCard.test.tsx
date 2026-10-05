/* FileCard deep-link target (SPEC-03 AC-77): the target file opens even when it is
   over the auto-expand limit, and is scrolled into view; other big files stay closed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import shell from "../../../../messages/en/shell.json";
import type { PrFile } from "@devdigest/shared";
import { FileCard } from "./FileCard";
import { AUTO_EXPAND_MAX_LINES } from "../constants";

const scrollIntoView = vi.fn();

beforeEach(() => {
  // jsdom has no scrollIntoView; stub the DOM boundary.
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  scrollIntoView.mockReset();
});

const bigFile: PrFile = { path: "src/big.ts", additions: AUTO_EXPAND_MAX_LINES + 50, deletions: 0, patch: null };
const smallFile: PrFile = { path: "src/small.ts", additions: 2, deletions: 1, patch: null };

function renderCard(file: PrFile, isTarget?: boolean, theme: "dark" | "light" = "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  const ui = (t?: boolean) => (
    <NextIntlClientProvider locale="en" messages={{ shell }}>
      <FileCard file={file} isTarget={t} />
    </NextIntlClientProvider>
  );
  const r = render(ui(isTarget));
  return { ...r, again: (t?: boolean) => r.rerender(ui(t)) };
}

const body = () => screen.queryByText(shell.diffViewer.noDiffText);

describe("FileCard (target expand + scroll)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`${theme}: a file over the limit starts collapsed and does not scroll when it is not the target`, () => {
      renderCard(bigFile, false, theme);
      expect(body()).not.toBeInTheDocument();
      expect(scrollIntoView).not.toHaveBeenCalled();
    });
  });

  it("a target file over 200 lines is forced open and scrolled into view (AC-77)", () => {
    renderCard(bigFile, true);
    expect(body()).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("a file that becomes the target while mounted opens and scrolls; the user can still collapse it", () => {
    const { again } = renderCard(bigFile, false);
    expect(body()).not.toBeInTheDocument();
    again(true);
    expect(body()).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("src/big.ts"));
    expect(body()).not.toBeInTheDocument();
  });

  it("a small non-target file is open by default and never scrolls", () => {
    renderCard(smallFile);
    expect(body()).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
