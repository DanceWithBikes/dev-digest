/* SPEC-02 hooks (AC-63, AC-81, AC-84): the tour is read with a GET only; a
   generation is a POST that happens only because `mutate` was called (never as
   a refetch); while polling is on the tour is refetched every 3 s. */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({ api }));

import { useGenerateOnboardingTour, useOnboardingTour, ONBOARDING_POLL_MS } from "./onboarding";

const RESPONSE = { tour: null, stale: false, generating: true, last_failed: null };

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  api.get.mockReset().mockResolvedValue(RESPONSE);
  api.post.mockReset().mockResolvedValue({ generating: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useOnboardingTour", () => {
  it("AC-84: the poll interval is 3 seconds", () => {
    expect(ONBOARDING_POLL_MS).toBe(3000);
  });

  it("AC-63/AC-81: reading the tour is a GET of /repos/:id/onboarding and never a POST", async () => {
    const { result } = renderHook(() => useOnboardingTour("r1"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.get).toHaveBeenCalledWith("/repos/r1/onboarding");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("AC-63: without a repo id nothing is requested", () => {
    renderHook(() => useOnboardingTour(null), { wrapper: wrapper() });
    expect(api.get).not.toHaveBeenCalled();
  });

  it("AC-84: with polling on, the tour is refetched every 3 s; with polling off it is not", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const polling = renderHook(() => useOnboardingTour("r1", { poll: true }), { wrapper: wrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_900);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(api.get).toHaveBeenCalledTimes(3);
    polling.unmount();

    api.get.mockClear();
    renderHook(() => useOnboardingTour("r2"), { wrapper: wrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});

describe("useGenerateOnboardingTour", () => {
  it("AC-81/AC-82: nothing is posted until mutate is called, then exactly one POST to /generate with no body", async () => {
    const { result } = renderHook(() => useGenerateOnboardingTour("r1"), { wrapper: wrapper() });
    expect(api.post).not.toHaveBeenCalled();
    await act(async () => {
      result.current.mutate();
    });
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenCalledWith("/repos/r1/onboarding/generate");
  });
});
