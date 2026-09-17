import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

const FINDINGS: FindingRecord[] = [finding({ id: "f1" })];

/** 2 CRITICAL + 1 WARNING, the WARNING below the low-confidence threshold. */
const MIXED: FindingRecord[] = [
  finding({ id: "c1" }),
  finding({ id: "c2", title: "SSRF in webhook" }),
  finding({ id: "w1", severity: "WARNING", title: "N+1 query", confidence: 0.5 }),
];

/** The severity filter pills (the toolbar's only buttons). */
const pill = (name: RegExp) => screen.getByRole("button", { name });

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity pills", () => {
  it("counts each severity, and the count equals the cards rendered below", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(pill(/critical/i)).toHaveTextContent("2Critical");
    expect(pill(/warning/i)).toHaveTextContent("1Warning");
    // 2 CRITICAL cards + 1 WARNING card are all on screen.
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SSRF in webhook")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });

  it("shows no pill for a severity the run didn't produce", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.queryByRole("button", { name: /suggestion/i })).not.toBeInTheDocument();
  });

  it("filters to one severity, and the same click again restores the full list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);

    fireEvent.click(pill(/warning/i));
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByText("SSRF in webhook")).not.toBeInTheDocument();
    expect(pill(/warning/i)).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(pill(/warning/i));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SSRF in webhook")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(pill(/warning/i)).toHaveAttribute("aria-pressed", "false");
  });

  it("switching pills replaces the filter rather than stacking it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill(/warning/i));
    fireEvent.click(pill(/critical/i));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
  });

  it("clears a filter whose severity disappears, instead of stranding an empty list", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(pill(/warning/i));

    // Hiding low confidence removes the only WARNING — the filter must let go.
    const toolbar = screen.getByText("Hide low confidence").parentElement!;
    fireEvent.click(within(toolbar).getByRole("switch"));

    expect(screen.queryByText("No findings match")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SSRF in webhook")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /warning/i })).not.toBeInTheDocument();
    expect(pill(/critical/i)).toHaveTextContent("2Critical");
  });
});
