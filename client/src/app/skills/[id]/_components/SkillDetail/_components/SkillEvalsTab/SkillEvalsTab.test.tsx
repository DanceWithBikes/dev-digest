/* SkillEvalsTab — empty state with the run command, case list with expandable
   judge evidence, and the Sync button. Hook modules are mocked at the boundary. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillEvalsResponse } from "@devdigest/shared";
import skillsMessages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  sync: vi.fn(),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkillEvals: () => ({ data: state.data, isLoading: false, isError: false, refetch: vi.fn() }),
  useSyncSkillEvals: () => ({ mutate: state.sync, isPending: false }),
}));

import { SkillEvalsTab } from "./SkillEvalsTab";

afterEach(() => {
  cleanup();
  state.sync.mockReset();
});

const SKILL = { id: "sk1", name: "engineering-insights" } as Skill;

const RESULT = {
  id: "e1", run_id: "20261008T102455", config: "candidate", case_name: "refuses noise",
  outcome: false, score: 0.5, threshold: 0.7, grounded: null,
  practices: [{ practice: "declines generic noise", passed: false, evidence: "Do not record this." }],
  git_sha: "722b66c", dirty: true, duration_ms: 1, input_tokens: 1, output_tokens: 1, num_turns: 1,
  ran_at: "2026-10-08T10:24:55.000Z",
};

function renderTab(data: SkillEvalsResponse) {
  state.data = data;
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: skillsMessages }}>
      <ToastProvider>
        <SkillEvalsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const EMPTY: SkillEvalsResponse = {
  summary: { total: 0, passing: 0, latest_run_id: null, latest_ran_at: null },
  latest: [],
  runs: [],
};

describe("SkillEvalsTab", () => {
  it("explains how to produce results when there are none", () => {
    renderTab(EMPTY);
    expect(screen.getByText("No eval results yet")).toBeTruthy();
    expect(screen.getByText('cd evals && pnpm vitest run "skills/engineering-insights/"')).toBeTruthy();
  });

  it("syncs on button press", () => {
    renderTab(EMPTY);
    fireEvent.click(screen.getByRole("button", { name: "Sync results" }));
    expect(state.sync).toHaveBeenCalledWith("sk1", expect.any(Object));
  });

  it("lists cases and reveals the judge's evidence on expand", () => {
    renderTab({
      summary: { total: 1, passing: 0, latest_run_id: RESULT.run_id, latest_ran_at: RESULT.ran_at },
      latest: [RESULT as SkillEvalsResponse["latest"][number]],
      runs: [
        { run_id: RESULT.run_id, ran_at: RESULT.ran_at, config: "candidate", passed: 0, total: 1, avg_score: 0.5, git_sha: "722b66c", dirty: true },
      ],
    });
    expect(screen.getByText("0 / 1 passing")).toBeTruthy();
    expect(screen.getByText("Score 0.5 / threshold 0.7")).toBeTruthy();
    expect(screen.queryByText("Do not record this.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Show practices for refuses noise/ }));
    expect(screen.getByText("Do not record this.")).toBeTruthy();
    expect(screen.getByText("declines generic noise")).toBeTruthy();

    // run history row
    expect(screen.getByText("722b66c")).toBeTruthy();
    expect(screen.getByText("dirty")).toBeTruthy();
  });
});
