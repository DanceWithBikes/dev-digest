import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "SUGGESTION",
    category: "style",
    title: "Extract the magic number",
    file: "src/limiter.ts",
    start_line: 9,
    end_line: 9,
    rationale: "60_000 appears twice.",
    suggestion: null,
    confidence: 0.7,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

// Mutable so a test can drop the persisted trace document without re-mocking.
const state = vi.hoisted(() => ({ trace: null as RunTrace | null }));

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: state.trace, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";
import { approxTokens } from "./helpers";

afterEach(cleanup);
beforeEach(() => {
  state.trace = TRACE;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });
});

describe("approxTokens", () => {
  it("rounds up to whole tokens at 4 characters each", () => {
    expect(approxTokens("")).toBe(0);
    expect(approxTokens("abcd")).toBe(1);
    expect(approxTokens("abcde")).toBe(2);
    expect(approxTokens("### skill")).toBe(3);
  });
});

describe("A5 Run Trace drawer — prompt assembly token counts", () => {
  it("shows the skills block's OWN approximate token count", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // The section is collapsed by default.
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
    // "### skill" is 9 chars → ceil(9 / 4) = 3, not the run's 12k/1.5k totals.
    expect(screen.getByText("~3 tokens")).toBeInTheDocument();
  });

  it("renders no skills block at all when the run assembled no skills", () => {
    state.trace = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, skills: null } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Skills (dynamic)")).not.toBeInTheDocument();
    expect(screen.queryByText("~3 tokens")).not.toBeInTheDocument();
  });
});

describe("A5 Run Trace drawer — findings", () => {
  it("lists the run's findings alongside the stats", () => {
    renderWithIntl(
      <RunTraceDrawer
        runId="r1"
        agentName="Security"
        prNumber={482}
        findings={FINDINGS}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getByText("Extract the magic number")).toBeInTheDocument();
    expect(screen.getByText("src/limiter.ts:9")).toBeInTheDocument();
  });

  it("still lists them when the run has no persisted trace document", () => {
    state.trace = null;
    renderWithIntl(
      <RunTraceDrawer
        runId="r1"
        agentName="Security"
        prNumber={482}
        findings={FINDINGS}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("No trace available yet.")).toBeInTheDocument();
    expect(screen.getByText("Extract the magic number")).toBeInTheDocument();
  });
});

describe("Run Trace drawer — project context documents", () => {
  const SPEC_TEXT = "# Spec\n**bold** stays literal";
  const withDocs = (): RunTrace => ({
    ...TRACE,
    prompt_assembly: { ...TRACE.prompt_assembly, specs: "GENERIC SPECS BLOCK" },
    context_docs: [
      { path: "docs/spec.md", origin: "agent", version: "abc1234", status: "sent", tokens: 42, text: SPEC_TEXT },
      { path: "docs/gone.md", origin: "skill: Rubric", version: "", status: "not_found", tokens: 0, text: null },
    ],
  });

  it("renders without the entry when the trace has no context_docs", () => {
    state.trace = { ...TRACE, prompt_assembly: { ...TRACE.prompt_assembly, specs: "GENERIC" } };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.queryByText("Project context · attached specs")).not.toBeInTheDocument();
    expect(screen.getByText("Project context (dynamic)")).toBeInTheDocument();
  });

  it("shows sent and not-found documents and hides the generic specs block", () => {
    state.trace = withDocs();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    expect(screen.getByText("Project context · attached specs")).toBeInTheDocument();
    expect(screen.queryByText("Project context (dynamic)")).not.toBeInTheDocument();
    expect(screen.getByText("docs/spec.md")).toBeInTheDocument();
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
    expect(screen.getByText("~42 tokens")).toBeInTheDocument();
    expect(screen.getByText("not found")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open docs\// })).toHaveLength(1);
  });

  it("opens a sent document's recorded text as plain, unrendered text", () => {
    state.trace = withDocs();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    fireEvent.click(screen.getByRole("button", { name: "Open docs/spec.md" }));
    const pre = document.querySelector("pre");
    expect(pre?.textContent).toBe(SPEC_TEXT);
    expect(document.querySelector("strong")).toBeNull();
  });

  it("keeps the document opener a native, focusable button that opens the text (NFR-3)", () => {
    state.trace = withDocs();
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Prompt assembly"));
    const opener = screen.getByRole("button", { name: "Open docs/spec.md" });
    // jsdom does no native key activation: native <button> + tab order is the keyboard contract.
    expect(opener.tagName).toBe("BUTTON");
    expect(opener.tabIndex).toBeGreaterThanOrEqual(0);
    expect(opener).toBeEnabled();
    opener.focus();
    expect(opener).toHaveFocus();
    fireEvent.click(opener);
    expect(document.querySelector("pre")?.textContent).toBe(SPEC_TEXT);
  });

  it("lists the run's specs_read paths in the Configuration section (AC-66)", () => {
    state.trace = { ...TRACE, specs_read: ["docs/spec.md", "docs/adr-1.md"] };
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Specs read")).toBeInTheDocument();
    expect(screen.getByText("docs/spec.md")).toBeInTheDocument();
    expect(screen.getByText("docs/adr-1.md")).toBeInTheDocument();
  });
});
