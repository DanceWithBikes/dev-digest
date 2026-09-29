import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/blast.json";
import type { BlastRadius } from "@devdigest/shared";

const state = vi.hoisted(() => ({
  radius: undefined as BlastRadius | undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  resyncStart: vi.fn(),
  resyncRunning: false,
  resyncReady: true,
  resyncTimedOut: false,
  resyncFailed: false,
}));

// Mocked at BlastRadiusCard's own import specifier (IntentCard.test.tsx's
// pattern) — client/AGENTS.md's "fetch is mocked" claim is false, so an
// un-mocked hook here would try the real network.
vi.mock("../../../../../../../lib/hooks/blast", () => ({
  useBlastRadius: () => ({ data: state.radius, isLoading: state.isLoading, isError: state.isError, refetch: state.refetch }),
  useBlastResync: () => ({
    start: state.resyncStart,
    running: state.resyncRunning,
    ready: state.resyncReady,
    timedOut: state.resyncTimedOut,
    failed: state.resyncFailed,
  }),
  // BlastRadiusCard also renders PriorPrs, which reads this hook — closed by
  // default (`open=false`), so it never fetches during these tests.
  usePriorPrs: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  state.radius = undefined;
  state.isLoading = false;
  state.isError = false;
  state.refetch.mockClear();
  state.resyncStart.mockClear();
  state.resyncRunning = false;
  state.resyncReady = true;
  state.resyncTimedOut = false;
  state.resyncFailed = false;
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ blast: messages }}>{ui}</NextIntlClientProvider>);
}

function radius(o: Partial<BlastRadius>): BlastRadius {
  return { changed_symbols: [], downstream: [], summary: "", ...o };
}

describe("BlastRadiusCard", () => {
  it("renders the stats row over the Tree view by default, and switches to the Graph view on toggle", () => {
    state.radius = radius({
      changed_symbols: [{ name: "rateLimit", file: "src/rate.ts", kind: "function" }],
      downstream: [
        {
          symbol: "rateLimit",
          callers: [{ name: "publicRouter", file: "src/a.ts", line: 23, endpoints: ["GET /api/public/items"] }],
          endpoints_affected: ["GET /api/public/items"],
          crons_affected: [],
        },
      ],
    });
    renderWithIntl(<BlastRadiusCard prId="pr1" repoId="repo1" repoFullName="acme/x" headSha="sha1" />);

    expect(screen.getByText("Blast Radius")).toBeInTheDocument();
    expect(screen.getByText("symbols")).toBeInTheDocument();
    expect(screen.getByText("callers")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:23")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(screen.queryByText("src/a.ts:23")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
  });

  it("shows a retriable error state instead of the map", () => {
    state.isError = true;
    renderWithIntl(<BlastRadiusCard prId="pr1" repoId="repo1" />);
    expect(screen.getByText("Couldn't load the blast radius.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.refetch).toHaveBeenCalled();
  });

  it("shows the degraded notice with a working Resync button, and the no-callers message when the map is empty", () => {
    state.radius = radius({
      changed_symbols: [{ name: "a", file: "src/a.ts", kind: "function" }],
      downstream: [{ symbol: "a", callers: [], endpoints_affected: [], crons_affected: [] }],
      degraded: true,
      reason: "no_data",
    });
    renderWithIntl(<BlastRadiusCard prId="pr1" repoId="repo1" />);

    expect(screen.getByText("No code index yet — resync to build the blast radius map.")).toBeInTheDocument();
    expect(screen.getByText("1 changed symbol(s), no downstream callers found.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resync" }));
    expect(state.resyncStart).toHaveBeenCalled();
  });
});
