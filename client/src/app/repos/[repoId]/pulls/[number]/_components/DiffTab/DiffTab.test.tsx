/* DiffTab — the Files-changed tab: Smart Diff grouping (Rule 1), the
   Smart/Original order toggle, the never-block-on-the-endpoint fallback, the
   split-suggestion banner, and inline findings (Rule 2). All four data hooks
   (`useSmartDiff`, `usePrComments`, `useCreatePrComment`, `usePrReviews`,
   `useFindingAction`) are mocked at the module boundary — client/AGENTS.md's
   "fetch is mocked" claim is false (see client/docs/insights.md), so an
   un-mocked hook here would try the real network. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiff, SmartDiffGroup } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const state = vi.hoisted(() => ({
  smartDiff: undefined as SmartDiff | undefined,
  smartDiffLoading: false,
  smartDiffError: false,
  reviews: [] as ReviewRecord[],
  findingActionMutate: vi.fn(),
  generateSummariesMutate: vi.fn(),
  generateSummariesPending: false,
}));

vi.mock("../../../../../../../lib/hooks/core", () => ({
  useSmartDiff: () => ({
    data: state.smartDiff,
    isLoading: state.smartDiffLoading,
    isError: state.smartDiffError,
  }),
  useGenerateSummaries: () => ({
    mutate: state.generateSummariesMutate,
    isPending: state.generateSummariesPending,
  }),
}));

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePrReviews: () => ({ data: state.reviews }),
  useFindingAction: () => ({ mutate: state.findingActionMutate, isPending: false }),
}));

import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  state.smartDiff = undefined;
  state.smartDiffLoading = false;
  state.smartDiffError = false;
  state.reviews = [];
  state.findingActionMutate.mockClear();
  state.generateSummariesMutate.mockClear();
  state.generateSummariesPending = false;
});

/** One add + one del line on line 1 — a finding anchored at `start_line: 1` matches it. */
const PATCH = "@@ -1,1 +1,1 @@\n-old\n+new";

function prFile(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: PATCH };
}

function group(
  role: SmartDiffGroup["role"],
  paths: string[],
  summaries: Record<string, string> = {},
): SmartDiffGroup {
  return {
    role,
    files: paths.map((path) => ({
      path,
      additions: 1,
      deletions: 0,
      finding_lines: [],
      pseudocode_summary: summaries[path] ?? null,
    })),
  };
}

function smartDiff(groups: SmartDiffGroup[], overrides: Partial<SmartDiff["split_suggestion"]> = {}): SmartDiff {
  return {
    groups,
    split_suggestion: { too_big: false, total_lines: 10, proposed_splits: [], ...overrides },
  };
}

function finding(o: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key",
    file: "src/config.ts",
    start_line: 1,
    end_line: 1,
    rationale: "A **live** Stripe key is committed in source.",
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

function review(o: { id: string; findings: FindingRecord[] }): ReviewRecord {
  return {
    id: o.id,
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    agent_name: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: o.findings,
  };
}

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DiffTab (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders the grouped Smart Diff order by default in ${theme}`, () => {
      state.smartDiff = smartDiff([group("core", ["src/core.ts"]), group("docs", ["README.md"])]);
      renderWithIntl(
        <div data-theme={theme}>
          <DiffTab prId="pr1" filesCount={2} files={[prFile("src/core.ts"), prFile("README.md")]} />
        </div>,
      );
      expect(screen.getByText("Core")).toBeInTheDocument();
      expect(screen.getByText("Docs")).toBeInTheDocument();
      expect(screen.getByText("src/core.ts")).toBeInTheDocument();
      expect(screen.getByText("README.md")).toBeInTheDocument();
    });
  });
});

describe("DiffTab — Smart / Original order toggle", () => {
  it("defaults to grouped Smart order and switches to the flat Original order on click", () => {
    state.smartDiff = smartDiff([group("core", ["src/core.ts"]), group("docs", ["README.md"])]);
    renderWithIntl(<DiffTab prId="pr1" filesCount={2} files={[prFile("src/core.ts"), prFile("README.md")]} />);

    // Smart order (default): role headers group the files.
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Original order" }));

    // Original order: today's flat, unmodified file list — no role headers.
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Smart order" })).toBeInTheDocument();
  });
});

describe("DiffTab — Smart Diff unavailable falls back to the flat list, with no toggle offered", () => {
  it("renders the flat diff and hides the toggle while the Smart Diff query has never resolved", () => {
    state.smartDiffLoading = true;
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/core.ts")]} />);
    expect(screen.queryByRole("button", { name: "Original order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Smart order" })).not.toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });

  it("renders the flat diff and hides the toggle when the Smart Diff query has never resolved with data, even after an error", () => {
    state.smartDiffError = true;
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/core.ts")]} />);
    expect(screen.queryByRole("button", { name: "Original order" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Smart order" })).not.toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });

  // TanStack Query keeps the previous page's `data` truthy while a background
  // refetch is `isLoading`/`isError` (e.g. reopening the tab after Smart Diff
  // started failing) — a `smartAvailable` that only checked `!!smartDiff`
  // would wrongly treat stale, unconfirmed data as available.
  it("still falls back to the flat list when stale Smart Diff data is loading again in the background", () => {
    state.smartDiff = smartDiff([group("core", ["src/core.ts"])]);
    state.smartDiffLoading = true;
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/core.ts")]} />);
    expect(screen.queryByRole("button", { name: "Original order" })).not.toBeInTheDocument();
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });

  it("still falls back to the flat list when stale Smart Diff data is present but the query is now erroring", () => {
    state.smartDiff = smartDiff([group("core", ["src/core.ts"])]);
    state.smartDiffError = true;
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/core.ts")]} />);
    expect(screen.queryByRole("button", { name: "Original order" })).not.toBeInTheDocument();
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
  });
});

describe("DiffTab — group order and role omission", () => {
  it("renders only the groups Smart Diff returned, in the order given, without reordering or backfilling missing roles", () => {
    // Deliberately NOT the canonical core→tests→wiring→docs→boilerplate order,
    // and wiring/boilerplate are omitted entirely — DiffTab must trust the
    // server's array as-is rather than re-sort it or synthesize empty groups.
    state.smartDiff = smartDiff([group("tests", ["e2e/README.md"]), group("core", ["src/core.ts"])]);
    renderWithIntl(
      <DiffTab prId="pr1" filesCount={2} files={[prFile("e2e/README.md"), prFile("src/core.ts")]} />,
    );

    const labels = screen.getAllByText(/^(Core|Tests|Wiring|Docs|Boilerplate)$/);
    expect(labels.map((el) => el.textContent)).toEqual(["Tests", "Core"]);
    expect(screen.queryByText("Wiring")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate")).not.toBeInTheDocument();
  });
});

describe("DiffTab — split-suggestion banner", () => {
  it("renders the large-PR banner with the proposed splits when the PR is flagged too big", () => {
    state.smartDiff = smartDiff([group("core", ["src/core.ts"]), group("tests", ["src/core.test.ts"])], {
      too_big: true,
      total_lines: 650,
      proposed_splits: [
        { name: "core", files: ["src/core.ts"] },
        { name: "tests", files: ["src/core.test.ts", "src/other.test.ts"] },
      ],
    });
    renderWithIntl(
      <DiffTab prId="pr1" filesCount={2} files={[prFile("src/core.ts"), prFile("src/core.test.ts")]} />,
    );

    expect(screen.getByText("This PR is large (650 changed lines)")).toBeInTheDocument();
    expect(
      screen.getByText("Consider splitting it into smaller, focused PRs for easier review:"),
    ).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Core — 1 files", "Tests — 2 files"]);
  });

  it("renders no banner when the PR isn't flagged too big", () => {
    state.smartDiff = smartDiff([group("core", ["src/core.ts"])], { too_big: false });
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/core.ts")]} />);
    expect(screen.queryByText(/This PR is large/)).not.toBeInTheDocument();
  });
});

describe("DiffTab — findings render inline with a working Accept action", () => {
  it("shows the has-findings dot on the file, the finding card under its line, and wires Accept through useFindingAction", () => {
    state.smartDiff = smartDiff([group("core", ["src/config.ts"])]);
    state.reviews = [review({ id: "rev1", findings: [finding({ id: "f1" })] })];
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/config.ts")]} />);

    expect(screen.getByTitle("Has findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();

    // The card starts collapsed (DiffTab doesn't pass defaultExpanded) — expand
    // it before its Accept action is reachable.
    fireEvent.click(screen.getByText("Hardcoded Stripe secret key"));
    fireEvent.click(screen.getByText("Accept"));

    expect(state.findingActionMutate).toHaveBeenCalledWith({
      findingId: "f1",
      action: "accept",
      prId: "pr1",
    });
  });
});

describe("DiffTab — Smart Diff summaries (step 8)", () => {
  // The non-negotiable invariant: with every pseudocode_summary null (step 8
  // never triggered, or nothing cached yet) the tab renders exactly as it did
  // before step 8 — no badge, no "What this does" line, fully usable.
  it("renders with no summary badge or line when every pseudocode_summary is null", () => {
    state.smartDiff = smartDiff([group("core", ["src/core.ts"])]);
    // A single-line file (prFile()'s fixture) auto-expands (AUTO_EXPAND_MAX_LINES),
    // so the file body — where the summary line would render — is already open.
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/core.ts")]} />);

    expect(screen.getByText("src/core.ts")).toBeInTheDocument();
    expect(screen.queryByText("✨ Summary")).not.toBeInTheDocument();
    expect(screen.queryByText(/What this does/)).not.toBeInTheDocument();
  });

  it("renders the summary badge and line for a file with a cached summary, and wires the Generate button", () => {
    state.smartDiff = smartDiff([
      group("core", ["src/core.ts"], { "src/core.ts": "Adds a rate-limit check." }),
    ]);
    renderWithIntl(<DiffTab prId="pr1" filesCount={1} files={[prFile("src/core.ts")]} />);

    expect(screen.getByText("✨ Summary")).toBeInTheDocument();
    expect(screen.getByText("What this does: Adds a rate-limit check.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Generate summaries" }));
    expect(state.generateSummariesMutate).toHaveBeenCalled();
  });
});
