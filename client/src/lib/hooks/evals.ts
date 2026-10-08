/* hooks/evals.ts — React Query hooks for the eval pipeline (SPEC-04):
   cases, scored batches, the compare view and the Eval Dashboard overview. */
"use client";

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalBatch,
  EvalBatchDetail,
  EvalCaseRecord,
  EvalCaseUpsert,
  EvalOverview,
} from "@devdigest/shared";

/** Re-poll cadence while a batch runs (NFR-6: at most once every 4 s). */
const POLL_MS = 4000;

// ---- Cases ----
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseRecord[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useCreateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseUpsert) => api.post<EvalCaseRecord>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useUpdateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: EvalCaseUpsert }) =>
      api.put<EvalCaseRecord>(`/eval-cases/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/eval-cases/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

/** One-click case from a finding. Always posts an object body (`{}` or `{ agent_id }`). */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, agentId }: { findingId: string; agentId?: string }) =>
      api.post<EvalCaseRecord>(`/findings/${findingId}/eval-case`, agentId ? { agent_id: agentId } : {}),
    onSuccess: (data) => qc.invalidateQueries({ queryKey: ["eval-cases", data.owner_id] }),
  });
}

// ---- Batches ----
/** An agent's batches, newest first. Polls while any is running. */
export function useEvalBatches(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["eval-batches", agentId],
    queryFn: () => api.get<EvalBatch[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
    refetchInterval: (query) => ((query.state.data ?? []).some((b) => b.status === "running") ? POLL_MS : false),
  });

  // A finished batch rewrites each case's last_run: refresh the case list (and the
  // dashboard) once, on the running -> idle transition.
  const running = (query.data ?? []).some((b) => b.status === "running");
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-overview"] });
    }
    wasRunning.current = running;
  }, [running, agentId, qc]);

  return query;
}

/** Start a batch for one agent; the id is passed per call so the dashboard can run several. */
export function useRunEvals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agentId: string) => api.post<EvalBatch>(`/agents/${agentId}/eval-runs`),
    onSuccess: (_batch, agentId) => {
      qc.invalidateQueries({ queryKey: ["eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-overview"] });
    },
  });
}

/** One batch with its per-case runs (compare view). */
export function useEvalBatch(id: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batch", id],
    queryFn: () => api.get<EvalBatchDetail>(`/eval-runs/${id}`),
    enabled: !!id,
  });
}

// ---- Dashboard ----
export function useEvalOverview() {
  return useQuery({
    queryKey: ["eval-overview"],
    queryFn: () => api.get<EvalOverview>("/eval/overview"),
    refetchInterval: (query) =>
      (query.state.data?.agents ?? []).some((a) => a.latest_batch?.status === "running") ? POLL_MS : false,
  });
}
