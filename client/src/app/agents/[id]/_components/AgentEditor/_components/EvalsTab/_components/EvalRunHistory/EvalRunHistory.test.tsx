import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBatch } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";

vi.mock("@/lib/hooks", () => ({ useEvalBatch: () => ({ data: undefined, isError: false }) }));

import { EvalRunHistory } from "./EvalRunHistory";

afterEach(cleanup);

const batch = (over: Partial<EvalBatch>): EvalBatch =>
  ({
    id: "b", status: "done", error: null, agent_version: 1, ran_at: "2026-10-01T00:00:00Z",
    cases_total: 4, cases_passed: 3, recall: 0.5, precision: 0.5, citation_accuracy: 0.5, cost_usd: null,
    ...over,
  }) as EvalBatch;

describe("EvalRunHistory", () => {
  it("lists batches newest first and shows a failed batch's error as plain text", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages }}>
        <EvalRunHistory
          batches={[
            batch({ id: "1", agent_version: 1, ran_at: "2026-10-01T00:00:00Z" }),
            batch({ id: "3", agent_version: 3, ran_at: "2026-10-03T00:00:00Z", status: "failed", error: "Provider <b>down</b>" }),
            batch({ id: "2", agent_version: 2, ran_at: "2026-10-02T00:00:00Z" }),
          ]}
        />
      </NextIntlClientProvider>,
    );

    const boxes = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
    expect(boxes).toEqual([
      "Select batch v3 for compare",
      "Select batch v2 for compare",
      "Select batch v1 for compare",
    ]);
    expect(screen.getByText("Provider <b>down</b>")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });
});
