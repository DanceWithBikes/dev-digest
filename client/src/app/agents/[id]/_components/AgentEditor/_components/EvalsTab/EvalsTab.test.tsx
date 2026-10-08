import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalBatch, EvalCaseRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import { ToastProvider } from "@/lib/toast";

const m = vi.hoisted(() => ({
  cases: [] as unknown[],
  batches: [] as unknown[],
  run: vi.fn(),
}));

vi.mock("@/lib/hooks", () => ({
  useEvalCases: () => ({ data: m.cases, isLoading: false, isError: false, refetch: vi.fn() }),
  useEvalBatches: () => ({ data: m.batches, isLoading: false, isError: false, refetch: vi.fn() }),
  useRunEvals: () => ({ mutate: m.run, isPending: false }),
  useDeleteEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateEvalCase: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useUpdateEvalCase: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useEvalBatch: () => ({ data: undefined, isError: false }),
}));

import { EvalsTab } from "./EvalsTab";

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function evalCase(id: string, name: string, pass: boolean | null): EvalCaseRecord {
  return {
    id,
    name,
    owner_id: "ag1",
    expected_output: {
      expectations: [
        { kind: "must_find", file: "src/a.ts", start_line: 3, end_line: 5 },
        { kind: "must_not_flag", file: "src/b.ts", start_line: 1, end_line: 1 },
      ],
    },
    last_run: pass == null ? null : { pass, batch_id: "b1" },
  } as unknown as EvalCaseRecord;
}

function batch(id: string, ranAt: string, version: number, recall: number, status: EvalBatch["status"] = "done"): EvalBatch {
  return {
    id,
    agent_id: "ag1",
    status,
    error: null,
    ran_at: ranAt,
    agent_version: version,
    cases_total: 4,
    cases_passed: 3,
    recall,
    precision: 0.5,
    citation_accuracy: 1,
    cost_usd: 0.0123,
  } as unknown as EvalBatch;
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages }}>
      <ToastProvider>
        <EvalsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  m.cases = [];
  m.batches = [];
});
afterEach(() => {
  cleanup();
  m.run.mockClear();
});

describe("EvalsTab", () => {
  it("disables Run at 0 cases and shows the empty copy", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Run evals (0)" })).toBeDisabled();
    expect(screen.getByText(/No eval cases yet/)).toBeInTheDocument();
    expect(screen.getByText("No runs yet. Create an eval case and run it.")).toBeInTheDocument();
  });

  it("lists cases with kinds, ranges and statuses, and runs the batch", () => {
    m.cases = [evalCase("c1", "leaky-key", true), evalCase("c2", "sql-inj", false), evalCase("c3", "fresh", null)];
    renderTab();
    expect(screen.getByText("leaky-key")).toBeInTheDocument();
    expect(screen.getAllByText("must find")).toHaveLength(3);
    expect(screen.getAllByText("must not flag")).toHaveLength(3);
    expect(screen.getAllByText("src/a.ts:3-5")).toHaveLength(3);
    expect(screen.getByText("passed")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText("never run")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run evals (3)" }));
    expect(m.run.mock.calls[0]![0]).toBe("ag1");
  });

  it("disables Run while a batch is running", () => {
    m.cases = [evalCase("c1", "leaky-key", null)];
    m.batches = [batch("b1", "2026-10-01T10:00:00Z", 1, 0.5, "running")];
    renderTab();
    expect(screen.getByRole("button", { name: "Running…" })).toBeDisabled();
  });

  it("shows the newest done batch with deltas, and enables Compare only with exactly two ticked", () => {
    m.cases = [evalCase("c1", "leaky-key", true)];
    m.batches = [
      batch("b1", "2026-10-01T10:00:00Z", 1, 0.5),
      batch("b2", "2026-10-02T10:00:00Z", 2, 0.75),
      batch("b3", "2026-10-03T10:00:00Z", 3, 0.75, "failed"),
    ];
    renderTab();
    // newest DONE is v2 (the failed v3 is ignored): recall 75%, +25 pp vs v1.
    const card = screen.getByText("RECALL").parentElement!.parentElement!;
    expect(within(card).getByText("75%")).toBeInTheDocument();
    expect(within(card).getByText("25 pp")).toBeInTheDocument();
    expect(within(screen.getByText("CASES PASSED").parentElement!.parentElement!).getByText("3/4")).toBeInTheDocument();

    const compare = screen.getByRole("button", { name: "Compare" });
    expect(compare).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Select batch v1 for compare"));
    expect(compare).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Select batch v2 for compare"));
    expect(compare).toBeEnabled();
    fireEvent.click(screen.getByLabelText("Select batch v3 for compare"));
    expect(compare).toBeDisabled();

    // History is newest first.
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("v3")).toBeInTheDocument();
  });
});
