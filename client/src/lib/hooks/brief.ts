/* hooks/brief.ts — React Query hooks for the PR Brief (SPEC-03).
     GET  /pulls/:id/brief  → PrBrief | null  (the stored brief; null = none yet)
     POST /pulls/:id/brief  → PrBrief         (generate or regenerate; no body) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBrief } from "@devdigest/shared";

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: () => api.get<PrBrief | null>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** An error never touches the cache, so a failed regenerate keeps the previous brief. */
export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBrief>(`/pulls/${prId}/brief`),
    onSuccess: async (data) => {
      // An older in-flight GET must not land after, and overwrite, the fresh brief.
      await qc.cancelQueries({ queryKey: ["pr-brief", prId] });
      qc.setQueryData(["pr-brief", prId], data);
    },
  });
}
