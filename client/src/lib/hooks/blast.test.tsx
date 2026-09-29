/* blast.test.tsx — pins useBlastResync's poll/timeout/failure state machine,
   described step-by-step in blast.ts's own doc comment:
     1. start() is a no-op until the initial index-state snapshot has loaded
        (`ready`) — an empty snapshot would "change" on the first poll;
     2. the resync mutation only starts polling on success, and reports
        `failed` (not a stuck `running`) if the POST rejects;
     3/4. once lastIndexedSha/updatedAt advances, polling stops and
        ["blast", prId] is invalidated so the card refetches;
     5. an unchanged snapshot gives up after RESYNC_POLL_TIMEOUT_MS and
        reports `timedOut` instead of polling forever.
   `api` (src/lib/api.ts) is mocked at the boundary; useBlastResync and the
   repo-intel hooks it composes run for real against a real QueryClient. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RepoIntelState } from "./repo-intel";

// Mirrors blast.ts's own private RESYNC_POLL_TIMEOUT_MS (blast.ts:39) — kept
// here only to advance fake timers past it, not to assert its exact value.
const RESYNC_POLL_TIMEOUT_MS = 90_000;

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("../api", () => ({
  api: {
    get: (path: string) => apiGet(path),
    post: (path: string, body?: unknown) => apiPost(path, body),
  },
}));

import { useBlastResync } from "./blast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  apiGet.mockReset();
  apiPost.mockReset();
});

const STATE_1: RepoIntelState = {
  status: "partial",
  filesIndexed: 10,
  filesSkipped: 1,
  lastIndexedSha: "sha1",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const STATE_2: RepoIntelState = { ...STATE_1, lastIndexedSha: "sha2", updatedAt: "2026-01-01T00:05:00.000Z" };

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

describe("useBlastResync — resync lifecycle", () => {
  it("stops running and invalidates [\"blast\", prId] once the index-state snapshot advances", async () => {
    let call = 0;
    apiGet.mockImplementation(() => Promise.resolve(call++ === 0 ? STATE_1 : STATE_2));
    apiPost.mockResolvedValue({ status: "queued" });

    const { qc, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { result } = renderHook(() => useBlastResync("repo1", "pr1", true), { wrapper: Wrapper });

    await act(async () => {
      await vi.waitFor(() => expect(result.current.ready).toBe(true));
    });

    act(() => result.current.start());

    await act(async () => {
      await vi.waitFor(() => expect(result.current.running).toBe(true));
    });
    // useResyncRepoIntel's own onSuccess (repo-intel.ts) invalidates
    // ["repo-intel-state", repoId], so the second index-state fetch fires
    // right away — no need to wait out the 1500ms poll interval for real.
    await act(async () => {
      await vi.waitFor(() => expect(result.current.running).toBe(false), { timeout: 5000 });
    });

    expect(result.current.timedOut).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["blast", "pr1"] });
  });

  it("gives up and reports timedOut when the index-state snapshot never changes within the poll window", async () => {
    apiGet.mockResolvedValue(STATE_1);
    apiPost.mockResolvedValue({ status: "queued" });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBlastResync("repo1", "pr1", true), { wrapper: Wrapper });

    await act(async () => {
      await vi.waitFor(() => expect(result.current.ready).toBe(true));
    });

    // Fake timers only from here — the setTimeout(RESYNC_POLL_TIMEOUT_MS) is
    // scheduled by the effect that fires once polling starts, so timers must
    // already be faked before start() flips `polling` true. vi.waitFor polls
    // with a REAL setTimeout internally, so it can't observe a fake-timer
    // deadline — advance the fake clock explicitly instead.
    vi.useFakeTimers();

    act(() => result.current.start());

    // Flush the resolved resync POST's microtask chain (onSuccess →
    // setPolling(true) → the effect that schedules the fake setTimeout)
    // before jumping the clock past it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.running).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESYNC_POLL_TIMEOUT_MS);
    });

    expect(result.current.timedOut).toBe(true);
    expect(result.current.running).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it("reports failed (not a stuck running) when the resync POST rejects", async () => {
    apiGet.mockResolvedValue(STATE_1);
    apiPost.mockRejectedValue(new Error("resync failed"));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBlastResync("repo1", "pr1", true), { wrapper: Wrapper });

    await act(async () => {
      await vi.waitFor(() => expect(result.current.ready).toBe(true));
    });

    act(() => result.current.start());

    await act(async () => {
      await vi.waitFor(() => expect(result.current.failed).toBe(true));
    });

    expect(result.current.running).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it("never requests index-state when enabled is false", async () => {
    apiGet.mockResolvedValue(STATE_1);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useBlastResync("repo1", "pr1", false), { wrapper: Wrapper });

    // Give a (wrongly) enabled query a real chance to fire before asserting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(apiGet).not.toHaveBeenCalled();
    expect(result.current.ready).toBe(false);
  });

  it("start() is a no-op before the index-state snapshot has loaded", async () => {
    let resolveGet!: (value: RepoIntelState) => void;
    apiGet.mockImplementation(
      () =>
        new Promise<RepoIntelState>((resolve) => {
          resolveGet = resolve;
        }),
    );
    apiPost.mockResolvedValue({ status: "queued" });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBlastResync("repo1", "pr1", true), { wrapper: Wrapper });

    expect(result.current.ready).toBe(false);

    act(() => result.current.start());

    expect(result.current.running).toBe(false);
    expect(apiPost).not.toHaveBeenCalled();

    // Resolve the pending index-state fetch so it doesn't leak into the next test.
    await act(async () => {
      resolveGet(STATE_1);
      await Promise.resolve();
    });
  });
});
