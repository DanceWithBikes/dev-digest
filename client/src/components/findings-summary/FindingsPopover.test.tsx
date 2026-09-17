import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFindingPreview } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingsPopover } from "./FindingsPopover";

afterEach(cleanup);

const PREVIEW: PrFindingPreview = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 12,
  end_line: 12,
  confidence: 0.98,
  rationale: "Line 12 contains a literal `sk_live_` Stripe secret key.",
};

function renderCell(
  counts: { critical: number; warning: number; suggestion: number } | null,
  items: PrFindingPreview[] = [],
  onRowClick = vi.fn(),
) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {/* Mirrors the PR row, whose onClick navigates to the PR. */}
      <div onClick={onRowClick}>
        <FindingsPopover counts={counts} items={items} openDelayMs={0} closeDelayMs={0} />
      </div>
    </NextIntlClientProvider>,
  );
  return onRowClick;
}

describe("FindingsPopover", () => {
  it("reads — when the PR was never reviewed", () => {
    renderCell(null);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("reads 0 for a reviewed PR with no findings, and opens no card", () => {
    renderCell({ critical: 0, warning: 0, suggestion: 0 });
    expect(screen.getByText("0")).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByText("0"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows per-severity counts and reveals read-only previews on hover", async () => {
    renderCell({ critical: 1, warning: 1, suggestion: 0 }, [PREVIEW]);
    const trigger = screen.getByLabelText("1 Critical").parentElement!;
    fireEvent.mouseEnter(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("2 findings in this run");
    expect(dialog).toHaveTextContent("Hardcoded Stripe secret key");
    expect(dialog).toHaveTextContent("security");
    expect(dialog).toHaveTextContent("src/config.ts:12");
    expect(dialog).toHaveTextContent("98% conf");
    // Markdown is stripped so the 2-line clamp measures real text.
    expect(dialog).toHaveTextContent("Line 12 contains a literal sk_live_ Stripe secret key.");
    // Read-only: previews never carry actions (those live on the PR page).
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("counts every severity in the title, not just the previews shown", async () => {
    renderCell({ critical: 2, warning: 3, suggestion: 1 }, [PREVIEW]);
    fireEvent.mouseEnter(screen.getByLabelText("2 Critical").parentElement!);
    expect(await screen.findByRole("dialog")).toHaveTextContent("6 findings in this run");
  });

  it("does not navigate when the card itself is clicked", async () => {
    const onRowClick = renderCell({ critical: 1, warning: 0, suggestion: 0 }, [PREVIEW]);
    fireEvent.mouseEnter(screen.getByLabelText("1 Critical").parentElement!);
    fireEvent.click(await screen.findByRole("dialog"));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("opens on keyboard focus and closes on Escape", async () => {
    renderCell({ critical: 1, warning: 0, suggestion: 0 }, [PREVIEW]);
    const trigger = screen.getByLabelText("1 Critical").parentElement!;
    fireEvent.focus(trigger);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
