/* hooks/multi-agent.ts — React Query hooks for the multi-agent review screens
   (index, configure, results). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  FindingActionKind,
  FindingRecord,
  MultiAgentRun,
  MultiAgentRunSummary,
  RunEstimate,
} from "@devdigest/shared";

/** Newest-first list of the workspace's multi-agent runs. */
export function useMultiAgentRuns() {
  return useQuery({
    queryKey: ["multi-agent-runs"],
    queryFn: () => api.get<MultiAgentRunSummary[]>("/multi-agent-runs"),
  });
}

/** One parent run; polls every 4 s while it is still running. */
export function useMultiAgentRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-agent-run", id],
    queryFn: () => api.get<MultiAgentRun>(`/multi-agent-runs/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "running" ? 4000 : false),
  });
}

/** Per-agent median duration / cost, for the Configure run estimate. */
export function useRunEstimates() {
  return useQuery({
    queryKey: ["multi-agent-run-estimates"],
    queryFn: () => api.get<RunEstimate[]>("/multi-agent-runs/estimates"),
  });
}

/** Accept / dismiss / learn a finding from the results screen, then refetch the parent run and the PR's reviews. */
export function useMultiAgentFindingAction(
  parentId: string | null | undefined,
  prId: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      action,
    }: {
      findingId: string;
      action: Extract<FindingActionKind, "accept" | "dismiss" | "learn">;
    }) => api.post<{ finding: FindingRecord }>(`/findings/${findingId}/${action}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multi-agent-run", parentId] });
      if (prId) qc.invalidateQueries({ queryKey: ["reviews", prId] });
    },
  });
}
