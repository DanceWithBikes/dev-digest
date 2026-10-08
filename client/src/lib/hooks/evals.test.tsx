/* evals.test.tsx — pins the polling contract of the eval hooks (NFR-6, AC-85):
   re-request every 4 s while a batch runs, never otherwise; and that a case
   created from a finding refreshes its owner agent's case list.
   `api` is mocked at the boundary; the hooks run against a real QueryClient. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("../api", () => ({
  api: {
    get: (path: string) => apiGet(path),
    post: (path: string, body?: unknown) => apiPost(path, body),
    put: vi.fn(),
    del: vi.fn(),
  },
}));

import { useCreateEvalCaseFromFinding, useEvalBatches, useEvalOverview } from "./evals";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  apiGet.mockReset();
  apiPost.mockReset();
});

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { qc, Wrapper };
}

const batch = (status: "running" | "done") => ({ id: "b1", status });

describe("useEvalBatches", () => {
  it("refetches every 4 s while a batch is running and stops once none is", async () => {
    apiGet
      .mockResolvedValueOnce([batch("running")])
      .mockResolvedValue([batch("done")]);
    const { Wrapper } = createWrapper();
    renderHook(() => useEvalBatches("a1"), { wrapper: Wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(apiGet).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3900);
    });
    expect(apiGet).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
    expect(apiGet).toHaveBeenLastCalledWith("/agents/a1/eval-runs");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });

  it("invalidates the case list and overview once when the running batch finishes", async () => {
    apiGet.mockResolvedValueOnce([batch("running")]).mockResolvedValue([batch("done")]);
    const { qc, Wrapper } = createWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useEvalBatches("a1"), { wrapper: Wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(spy).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-cases", "a1"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-overview"] });
    expect(spy).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("never refetches when no batch is running", async () => {
    apiGet.mockResolvedValue([batch("done")]);
    const { Wrapper } = createWrapper();
    renderHook(() => useEvalBatches("a1"), { wrapper: Wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(apiGet).toHaveBeenCalledTimes(1);
  });
});

describe("useEvalOverview", () => {
  it("polls only while an agent's latest batch is running", async () => {
    const overview = (status: string) => ({
      agents: [{ agent_id: "a1", latest_batch: { status } }],
      recent_batches: [],
    });
    apiGet.mockResolvedValueOnce(overview("running")).mockResolvedValue(overview("done"));
    const { Wrapper } = createWrapper();
    renderHook(() => useEvalOverview(), { wrapper: Wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4100);
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(apiGet).toHaveBeenCalledTimes(2);
  });
});

describe("useCreateEvalCaseFromFinding", () => {
  it("posts an object body and invalidates the owner agent's case list", async () => {
    apiPost.mockResolvedValue({ id: "c1", owner_id: "agent-9" });
    const { qc, Wrapper } = createWrapper();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCaseFromFinding(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ findingId: "f1" });
    });

    expect(apiPost).toHaveBeenCalledWith("/findings/f1/eval-case", {});
    expect(spy).toHaveBeenCalledWith({ queryKey: ["eval-cases", "agent-9"] });
  });
});
