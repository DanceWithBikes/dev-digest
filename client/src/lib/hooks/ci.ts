/* hooks/ci.ts — React Query hooks for Export to CI (SPEC-05): the bundle preview,
   the install mutation, an agent's installations and the CI Runs list. */
"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiExportInputBody,
  CiExportResult,
  CiInstallation,
  CiPreview,
  CiPreviewQuery,
  CiRunsPage,
  CiRunsQuery,
} from "@devdigest/shared";

/** Query key of an agent's installations (invalidated by a successful export). */
export const ciInstallationsKey = (agentId: string | null | undefined) => ["ci-installations", agentId] as const;

/** Decode a base64 string into bytes. */
function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Hand a base64-encoded zip to the browser as a file download (AC-106). */
export function downloadBase64Zip(filename: string, b64: string): void {
  const blob = new Blob([base64ToBytes(b64)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Freshly generated bundle for a repo + Configure choices. Repeated `triggers` keys carry the array. */
export function useCiPreview(
  agentId: string | null | undefined,
  input: Pick<CiPreviewQuery, "repo" | "triggers" | "post_as">,
  enabled = true,
) {
  const qs = new URLSearchParams({ repo: input.repo, post_as: input.post_as });
  for (const trig of input.triggers) qs.append("triggers", trig);
  return useQuery({
    queryKey: ["ci-preview", agentId, input.repo, [...input.triggers].sort(), input.post_as],
    queryFn: () => api.get<CiPreview>(`/agents/${agentId}/export-ci/preview?${qs.toString()}`),
    enabled: !!agentId && !!input.repo && input.triggers.length > 0 && enabled,
    // The bundle is generated, never cached by the user: always read it fresh.
    gcTime: 0,
  });
}

/** Install the bundle: open the PR or fetch the zip (which is downloaded here). */
export function useExportCi(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CiExportInputBody) => api.post<CiExportResult>(`/agents/${agentId}/export-ci`, input),
    onSuccess: (result) => {
      if (result.mode === "zip") downloadBase64Zip(result.filename, result.zip_base64);
      return qc.invalidateQueries({ queryKey: ciInstallationsKey(agentId) });
    },
  });
}

export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ciInstallationsKey(agentId),
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci-installations`),
    enabled: !!agentId,
  });
}

/** Filters of the CI Runs page; every field is optional (server defaults: 7d, page 1). */
export type CiRunsFilters = Partial<CiRunsQuery>;

/**
 * One page of CI runs. Each request makes the server ingest new Actions runs,
 * so there is deliberately no `refetchInterval` and no refetch on focus
 * (AC-115) — the Refresh button calls `refetch()` (AC-114).
 */
export function useCiRuns(filters: CiRunsFilters) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== "") qs.set(k, String(v));
  return useQuery({
    queryKey: ["ci-runs", filters],
    queryFn: () => api.get<CiRunsPage>(`/ci-runs?${qs.toString()}`),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}
