import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { SeverityPills } from "./SeverityPills";

afterEach(cleanup);

function renderPills(
  counts: { critical: number; warning: number; suggestion: number },
  active: "CRITICAL" | "WARNING" | "SUGGESTION" | null = null,
  onToggle = vi.fn(),
) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SeverityPills counts={counts} active={active} onToggle={onToggle} />
    </NextIntlClientProvider>,
  );
  return onToggle;
}

describe("SeverityPills", () => {
  it("renders one pill per PRESENT severity, worst-first", () => {
    renderPills({ critical: 2, warning: 1, suggestion: 0 });
    const pills = screen.getAllByRole("button");
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveTextContent("2Critical");
    expect(pills[1]).toHaveTextContent("1Warning");
    expect(screen.queryByText("Suggestion")).not.toBeInTheDocument();
  });

  it("renders nothing when the run found nothing", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SeverityPills
          counts={{ critical: 0, warning: 0, suggestion: 0 }}
          active={null}
          onToggle={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("reports the clicked severity so the parent can toggle it", () => {
    const onToggle = renderPills({ critical: 1, warning: 1, suggestion: 0 });
    fireEvent.click(screen.getByRole("button", { name: /warning/i }));
    expect(onToggle).toHaveBeenCalledWith("WARNING");
  });

  it("marks the active pill pressed and offers to clear it", () => {
    renderPills({ critical: 1, warning: 1, suggestion: 0 }, "CRITICAL");
    const [critical, warning] = screen.getAllByRole("button");
    expect(critical).toHaveAttribute("aria-pressed", "true");
    expect(critical).toHaveAttribute("title", "Show all findings");
    expect(warning).toHaveAttribute("aria-pressed", "false");
    expect(warning).toHaveAttribute("title", "Show only Warning findings");
  });
});
