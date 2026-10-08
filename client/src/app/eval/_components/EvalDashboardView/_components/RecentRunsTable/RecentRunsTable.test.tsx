import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBatch } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/eval.json";
import { RecentRunsTable } from "./RecentRunsTable";

afterEach(cleanup);

const batch = (over: Partial<EvalBatch>): EvalBatch =>
  ({
    id: "b1", agent_id: "a1", agent_version: 3, status: "done", error: null, ran_at: "2026-10-01T10:00:00Z",
    recall: 0.75, precision: 0.5, citation_accuracy: 1, cost_usd: 0.0123,
    ...over,
  }) as EvalBatch;

describe("RecentRunsTable", () => {
  it("renders agent name, version, status and metrics per row", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <RecentRunsTable
          batches={[batch({}), batch({ id: "b2", agent_id: "a2", agent_version: 1, status: "failed", recall: null, cost_usd: null })]}
          agentNames={new Map([["a1", "Security Reviewer"]])}
        />
      </NextIntlClientProvider>,
    );

    const rows = screen.getAllByRole("row");
    const first = within(rows[1]!);
    for (const text of ["Security Reviewer", "v3", "done", "75%", "50%", "100%", "$0.0123"]) {
      expect(first.getByText(text)).toBeInTheDocument();
    }
    const second = within(rows[2]!);
    expect(second.getByText("a2")).toBeInTheDocument(); // unknown agent falls back to its id
    expect(second.getByText("failed")).toBeInTheDocument();
    expect(second.getAllByText("—")).toHaveLength(2);
  });
});
