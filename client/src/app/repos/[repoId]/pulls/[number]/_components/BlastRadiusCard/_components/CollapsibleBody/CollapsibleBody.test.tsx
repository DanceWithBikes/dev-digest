import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/blast.json";
import { CollapsibleBody } from "./CollapsibleBody";

// jsdom does no layout, so scrollHeight is always 0 — stub it per test.
function stubScrollHeight(height: number) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(height);
}

function body(key = "tree") {
  return (
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <CollapsibleBody key={key} maxHeight={100}>
        <p>content</p>
      </CollapsibleBody>
    </NextIntlClientProvider>
  );
}

const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  // jsdom lacks scrollIntoView, which "Show less" calls.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

describe("CollapsibleBody", () => {
  it("shows no toggle when the content fits", () => {
    stubScrollHeight(80);
    render(body());
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("expands and collapses overflowing content", () => {
    stubScrollHeight(500);
    render(body());

    const showAll = screen.getByRole("button", { name: "Show all" });
    expect(showAll).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(showAll);
    const showLess = screen.getByRole("button", { name: "Show less" });
    expect(showLess).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(showLess);
    expect(screen.getByRole("button", { name: "Show all" })).toBeInTheDocument();
  });

  it("collapses again when remounted with a new key", () => {
    stubScrollHeight(500);
    const { rerender } = render(body("tree"));
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));

    rerender(body("graph"));
    expect(screen.getByRole("button", { name: "Show all" })).toBeInTheDocument();
  });
});
