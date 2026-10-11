/* ci.test.tsx — pins the CI hooks' contract: a successful export invalidates the
   agent's installations (AC-105), a zip result is downloaded exactly once
   (AC-106), and the runs query never polls (AC-115). `api` is mocked at the
   boundary; the hooks run for real against a real QueryClient. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock("../api", () => ({
  api: {
    get: (path: string) => apiGet(path),
    post: (path: string, body?: unknown) => apiPost(path, body),
  },
}));

import { useCiRuns, useExportCi, useCiPreview } from "./ci";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiGet.mockReset();
  apiPost.mockReset();
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const INSTALLATION = {
  id: "i1",
  agent_id: "a1",
  repo: "acme/shop",
  target_type: "gha",
  state: "pr_open",
  agent_version: 1,
  runner_version: "0.1.0",
  pr_url: "https://github.com/acme/shop/pull/1",
  behind: false,
  installed_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  latest_run: null,
};

describe("useExportCi", () => {
  it("invalidates the agent's installations after a PR export", async () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    apiPost.mockResolvedValue({ mode: "open_pr", installation: INSTALLATION, pr_url: INSTALLATION.pr_url });
    const { result } = renderHook(() => useExportCi("a1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ repo: "acme/shop", mode: "open_pr" });
    });

    expect(apiPost).toHaveBeenCalledWith("/agents/a1/export-ci", { repo: "acme/shop", mode: "open_pr" });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["ci-installations", "a1"] });
  });

  it("downloads a zip result exactly once", async () => {
    const { wrapper } = setup();
    const create = vi.fn(() => "blob:zip");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    apiPost.mockResolvedValue({ mode: "zip", filename: "devdigest-ci.zip", zip_base64: btoa("PK") });
    const { result } = renderHook(() => useExportCi("a1"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ repo: "acme/shop", mode: "zip" });
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:zip");
  });
});

describe("useCiPreview", () => {
  it("sends repeated triggers keys and waits for enabled", async () => {
    const { wrapper } = setup();
    apiGet.mockResolvedValue({ files: [], installation_id: "i", agent_version: 1, runner_version: "0" });
    const input = { repo: "acme/shop", triggers: ["opened", "synchronize"] as ("opened" | "synchronize")[], post_as: "github_review" as const };
    const off = renderHook(() => useCiPreview("a1", input, false), { wrapper });
    expect(apiGet).not.toHaveBeenCalled();
    off.unmount();

    renderHook(() => useCiPreview("a1", input, true), { wrapper });
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    expect(apiGet).toHaveBeenCalledWith(
      "/agents/a1/export-ci/preview?repo=acme%2Fshop&post_as=github_review&triggers=opened&triggers=synchronize",
    );
  });
});

describe("useCiRuns", () => {
  it("requests /ci-runs with only the set filters and does not poll", async () => {
    const { wrapper } = setup();
    apiGet.mockResolvedValue({ runs: [], warnings: [], page: 1, has_more: false });
    const { result } = renderHook(() => useCiRuns({ window: "all", agent_id: "a1", repo: undefined, page: 2 }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiGet).toHaveBeenCalledWith("/ci-runs?window=all&agent_id=a1&page=2");
    expect(result.current.refetch).toBeTypeOf("function");
  });
});
