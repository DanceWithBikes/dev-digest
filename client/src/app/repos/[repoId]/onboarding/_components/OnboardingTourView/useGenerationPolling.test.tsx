/* SPEC-02 polling budget (AC-84, AC-85, NFR-11): while a generation the studio
   started is in flight it polls; it gives up after 120 s OR 40 refetches,
   whichever comes first, and then reports `timedOut`. The query hook is mocked
   so the test controls what each "refetch" returns. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

const q = vi.hoisted(() => ({
  polls: [] as boolean[],
  data: { tour: null, stale: false, generating: true, last_failed: null } as Record<string, unknown>,
  updatedAt: 0,
}));
vi.mock("@/lib/hooks/onboarding", () => ({
  useOnboardingTour: (_id: string, opts: { poll?: boolean } = {}) => {
    q.polls.push(!!opts.poll);
    return { data: q.data, dataUpdatedAt: q.updatedAt };
  },
}));

import { useGenerationPolling } from "./useGenerationPolling";

const lastPoll = () => q.polls[q.polls.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T10:00:00Z"));
  q.polls.length = 0;
  q.data = { tour: null, stale: false, generating: true, last_failed: null };
  q.updatedAt = Date.now();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useGenerationPolling", () => {
  it("AC-84: does not poll before a generation was requested and none is in flight", () => {
    q.data = { tour: null, stale: false, generating: false, last_failed: null };
    const { result } = renderHook(() => useGenerationPolling("r1"));
    expect(lastPoll()).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it("AC-84: polls once a generation is requested", () => {
    q.data = { tour: null, stale: false, generating: false, last_failed: null };
    const { result } = renderHook(() => useGenerationPolling("r1"));
    act(() => result.current.begin());
    expect(lastPoll()).toBe(true);
  });

  it("AC-85/NFR-11: stops polling at 120 s and reports the timeout, not a second earlier", () => {
    const { result } = renderHook(() => useGenerationPolling("r1"));
    act(() => result.current.begin());
    act(() => void vi.advanceTimersByTime(119_000));
    expect(lastPoll()).toBe(true);
    expect(result.current.timedOut).toBe(false);
    act(() => void vi.advanceTimersByTime(1_500));
    expect(lastPoll()).toBe(false);
    expect(result.current.timedOut).toBe(true);
  });

  it("NFR-11: stops polling after 40 refetches even though 120 s have not passed", () => {
    const { result, rerender } = renderHook(() => useGenerationPolling("r1"));
    act(() => result.current.begin());
    for (let i = 1; i <= 39; i += 1) {
      q.updatedAt += 3_000;
      rerender();
    }
    expect(lastPoll()).toBe(true);
    expect(result.current.timedOut).toBe(false);
    q.updatedAt += 3_000;
    rerender();
    expect(lastPoll()).toBe(false);
    expect(result.current.timedOut).toBe(true);
  });

  it("AC-84/AC-85: when the server reports the generation finished, polling ends without a timeout", () => {
    const { result, rerender } = renderHook(() => useGenerationPolling("r1"));
    act(() => result.current.begin());
    act(() => void vi.advanceTimersByTime(6_000));
    q.data = { tour: {}, stale: false, generating: false, last_failed: null };
    q.updatedAt = Date.now() + 1;
    rerender();
    expect(lastPoll()).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it("AC-84: a page reloaded in the middle of a generation starts polling by itself", () => {
    renderHook(() => useGenerationPolling("r1"));
    expect(lastPoll()).toBe(true);
  });
});
