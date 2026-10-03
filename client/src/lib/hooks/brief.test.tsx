/* hooks/brief.ts — usePrBrief reads the stored brief (null = none yet) and
   useGeneratePrBrief writes the POST result into the same cache entry, while a
   failed POST leaves the previous brief untouched (SPEC-03 AC-55, AC-56, AC-66). */
import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief } from "@devdigest/shared";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({ api }));

import { usePrBrief, useGeneratePrBrief } from "./brief";

afterEach(cleanup);
beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

function makeBrief(over: Partial<PrBrief> = {}): PrBrief {
  return {
    summary: "Adds a thing.",
    intent: null,
    blast: null,
    risks: { risks: [] },
    history: { history: [] },
    review_focus: [],
    missing: [],
    head_sha: "abcdef1234567",
    generated_at: "2026-01-01T00:00:00.000Z",
    model: "test-model",
    cost_usd: null,
    tokens_in: null,
    tokens_out: null,
    ...over,
  };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("usePrBrief (query lens)", () => {
  it("GETs /pulls/:id/brief and never POSTs on mount", async () => {
    api.get.mockResolvedValue(makeBrief());
    const { wrapper } = setup();
    const { result } = renderHook(() => usePrBrief("pr1"), { wrapper });
    await waitFor(() => expect(result.current.data?.summary).toBe("Adds a thing."));
    expect(api.get).toHaveBeenCalledWith("/pulls/pr1/brief");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("stays idle without a PR id", () => {
    const { wrapper } = setup();
    renderHook(() => usePrBrief(null), { wrapper });
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("useGeneratePrBrief (mutation lens)", () => {
  it("POSTs and replaces the cached brief with the response", async () => {
    api.get.mockResolvedValue(null);
    api.post.mockResolvedValue(makeBrief({ summary: "Fresh" }));
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ q: usePrBrief("pr1"), m: useGeneratePrBrief("pr1") }), { wrapper });
    await waitFor(() => expect(result.current.q.data).toBeNull());
    await act(async () => {
      result.current.m.mutate();
    });
    await waitFor(() => expect(result.current.q.data?.summary).toBe("Fresh"));
    expect(api.post).toHaveBeenCalledWith("/pulls/pr1/brief");
  });

  it("keeps the previous brief in the cache when the POST fails", async () => {
    api.get.mockResolvedValue(makeBrief({ summary: "Old" }));
    api.post.mockRejectedValue(new Error("boom"));
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ q: usePrBrief("pr1"), m: useGeneratePrBrief("pr1") }), { wrapper });
    await waitFor(() => expect(result.current.q.data?.summary).toBe("Old"));
    await act(async () => {
      result.current.m.mutate();
    });
    await waitFor(() => expect(result.current.m.isError).toBe(true));
    expect(result.current.q.data?.summary).toBe("Old");
  });

  it("cancels an older in-flight GET so it cannot overwrite the fresh brief", async () => {
    let resolveStale!: (b: PrBrief | null) => void;
    api.get.mockImplementation(() => new Promise((r) => (resolveStale = r)));
    api.post.mockResolvedValue(makeBrief({ summary: "Fresh" }));
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ q: usePrBrief("pr1"), m: useGeneratePrBrief("pr1") }), { wrapper });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    await act(async () => {
      result.current.m.mutate();
    });
    await waitFor(() => expect(result.current.q.data?.summary).toBe("Fresh"));
    await act(async () => {
      resolveStale(makeBrief({ summary: "Stale" }));
    });
    expect(result.current.q.data?.summary).toBe("Fresh");
  });
});
