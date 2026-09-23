/* hooks/conventions.ts — React Query hooks for the Conventions page. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCandidatePatch,
  ConventionScan,
} from "@devdigest/shared";

/** The skill the accepted candidates would produce right now — nothing saved. */
export interface ConventionSkillPreview {
  name: string;
  description: string;
  body: string;
  accepted: number;
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Run (or re-run) the scan. Not a query: it costs a model call, so it must only
 * ever happen because someone pressed the button — never as a refetch.
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    // No body on purpose: `apiFetch` only sets a JSON content-type when one is
    // sent, and Fastify rejects an empty JSON body.
    mutationFn: () => api.post<ConventionScan>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (scan) => {
      qc.setQueryData(["conventions", repoId], scan.candidates);
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
    },
  });
}

/** Accept, reject or edit one candidate. */
export function usePatchConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionCandidatePatch }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      qc.invalidateQueries({ queryKey: ["conventions-preview", repoId] });
    },
  });
}

/**
 * The assembled skill body, fetched so the create modal can open on an editable
 * draft. Refetched whenever the accepted set changes.
 */
export function useConventionSkillPreview(repoId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["conventions-preview", repoId],
    queryFn: () => api.get<ConventionSkillPreview>(`/repos/${repoId}/conventions/preview`),
    enabled: !!repoId && enabled,
  });
}

export interface CreateConventionSkillInput {
  name: string;
  description: string;
  body: string;
  agent_id?: string;
}

export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<{ id: string; name: string; version: number }>(
        `/repos/${repoId}/conventions/skill`,
        input,
      ),
    onSuccess: () => {
      // The new skill has to appear on the Skills page and in every agent's
      // skill list, both of which are cached under their own keys.
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}
