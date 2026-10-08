import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalBatch } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";

const m = vi.hoisted(() => ({ batches: {} as Record<string, unknown>, seen: [] as string[] }));

vi.mock("@/lib/hooks", () => ({
  useEvalBatch: (id: string) => {
    m.seen.push(id);
    const batch = m.batches[id];
    return { data: batch ? { batch, runs: [] } : undefined, isError: false };
  },
}));

import { CompareRunsModal } from "./CompareRunsModal";

afterEach(() => {
  cleanup();
  m.batches = {};
  m.seen = [];
});

const batch = (over: Partial<EvalBatch>): EvalBatch =>
  ({
    id: "b",
    agent_version: 1,
    system_prompt: "Be strict.",
    ran_at: "2026-10-01T10:00:00Z",
    recall: 0.5,
    precision: 0.5,
    citation_accuracy: 0.5,
    ...over,
  }) as EvalBatch;

function renderModal(ids: [string, string]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, shell: shellMessages }}>
      <CompareRunsModal ids={ids} onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("CompareRunsModal", () => {
  it("shows newer minus older in pp, orders columns by ran_at and diffs the prompts", () => {
    // ids are passed newest-first on purpose: the modal must order by ran_at itself.
    m.batches = {
      new: batch({ id: "new", agent_version: 2, ran_at: "2026-10-02T10:00:00Z", recall: 0.75, precision: 0.4, citation_accuracy: null, system_prompt: "Be lenient." }),
      old: batch({ id: "old", agent_version: 1, recall: 0.5, precision: 0.5, citation_accuracy: 0.5, system_prompt: "Be strict." }),
    };
    renderModal(["new", "old"]);

    expect(m.seen.every((id) => id === "new" || id === "old")).toBe(true);
    expect(screen.getByText(/Older · v1/)).toBeInTheDocument();
    expect(screen.getByText(/Newer · v2/)).toBeInTheDocument();

    const recall = screen.getByRole("row", { name: /^Recall/ });
    expect(within(recall).getByText("+25 pp")).toBeInTheDocument();
    const precision = screen.getByRole("row", { name: /^Precision/ });
    expect(within(precision).getByText("-10 pp")).toBeInTheDocument();
    const citation = screen.getByRole("row", { name: /^Citation accuracy/ });
    expect(within(citation).getAllByText("—").length).toBeGreaterThan(0);

    expect(screen.getByText("Be strict.")).toBeInTheDocument();
    expect(screen.getByText("Be lenient.")).toBeInTheDocument();
  });

  it("says the prompts are identical instead of rendering a diff", () => {
    m.batches = { a: batch({ id: "a" }), b: batch({ id: "b", ran_at: "2026-10-02T10:00:00Z" }) };
    renderModal(["a", "b"]);
    expect(screen.getByText("The system prompts are identical.")).toBeInTheDocument();
  });
});
