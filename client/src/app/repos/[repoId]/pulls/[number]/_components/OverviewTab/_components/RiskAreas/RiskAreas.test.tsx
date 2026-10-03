import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/brief.json";
import type { Risk } from "@devdigest/shared";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const risk = (over: Partial<Risk> = {}): Risk => ({
  kind: "security",
  title: "Unchecked input",
  explanation: "Body goes to eval.",
  severity: "high",
  file_refs: ["src/a.ts:10-20", "src/b.ts"],
  ...over,
});

function renderRisks(ui: React.ReactElement, theme: "dark" | "light" = "dark") {
  document.documentElement.setAttribute("data-theme", theme);
  return render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RiskAreas (chips lens)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`${theme}: chip shows title and first file ref; details stay hidden until expanded (AC-70, AC-72)`, () => {
      renderRisks(<RiskAreas risks={[risk()]} />, theme);
      expect(screen.getByText("Risk areas")).toBeInTheDocument();
      expect(screen.getByText("Unchecked input")).toBeInTheDocument();
      expect(screen.getByText("src/a.ts:10-20")).toBeInTheDocument();
      expect(screen.queryByText("Body goes to eval.")).not.toBeInTheDocument();
      expect(screen.queryByText("src/b.ts")).not.toBeInTheDocument();

      const chip = screen.getByRole("button", { expanded: false });
      fireEvent.click(chip);
      expect(chip).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("Body goes to eval.")).toBeInTheDocument();
      expect(screen.getByText("src/b.ts")).toBeInTheDocument();
      // all refs: first appears in chip and in the detail list
      expect(screen.getAllByText("src/a.ts:10-20")).toHaveLength(2);
    });
  });

  it("uses a distinct colour per severity (AC-71)", () => {
    renderRisks(
      <RiskAreas
        risks={[
          risk({ title: "High one", severity: "high" }),
          risk({ title: "Medium one", severity: "medium" }),
          risk({ title: "Low one", severity: "low" }),
        ]}
      />,
    );
    const accents = ["High one", "Medium one", "Low one"].map(
      (title) => screen.getByText(title).closest("button")!.parentElement!.style.borderLeft,
    );
    accents.forEach((a) => expect(a).toMatch(/3px solid .+/));
    expect(new Set(accents).size).toBe(3);
  });

  it("empty list shows the no-risks copy (AC-73)", () => {
    renderRisks(<RiskAreas risks={[]} />);
    expect(screen.getByText("No notable risks flagged.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders model text literally, no Markdown or HTML (AC-80)", () => {
    renderRisks(
      <RiskAreas risks={[risk({ title: "<script>alert(1)</script>", explanation: "**bold** <b>x</b>" })]} />,
    );
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("**bold** <b>x</b>")).toBeInTheDocument();
    expect(document.querySelector("script, b, strong")).toBeNull();
  });
});
