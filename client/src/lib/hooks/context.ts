/* hooks/context.ts — React Query hooks for Project Context: the repo's
   document listing, previews, search roots and per-agent / per-skill
   attachments. Token counts always come from the server. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentContextSelection,
  ContextListing,
  ContextPreview,
  ContextSelection,
} from "@devdigest/shared";

export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context", repoId],
    queryFn: () => api.get<ContextListing>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** Rescan the clone; the fresh listing is written straight into the cache. */
export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<ContextListing>(`/repos/${repoId}/context/reindex`),
    onSuccess: (listing, repoId) => qc.setQueryData(["context", repoId], listing),
  });
}

/** Full text of one document; only fetched once a path is chosen. */
export function useContextPreview(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["context-file", repoId, path],
    queryFn: () =>
      api.get<ContextPreview>(`/repos/${repoId}/context/file?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}

/** Save the repo's search roots; the response is the re-scanned listing. */
export function useSaveContextRoots(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roots: string[]) => api.put<ContextListing>(`/repos/${repoId}/context/roots`, { roots }),
    onSuccess: (listing) => qc.setQueryData(["context", repoId], listing),
  });
}

export function useAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-agent", agentId, repoId],
    queryFn: () => api.get<AgentContextSelection>(`/repos/${repoId}/context/agents/${agentId}`),
    enabled: !!agentId && !!repoId,
  });
}

export function useSaveAgentContext(agentId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<AgentContextSelection>(`/repos/${repoId}/context/agents/${agentId}`, { paths }),
    onSuccess: (sel) => {
      qc.setQueryData(["context-agent", agentId, repoId], sel);
      // "Used by N agents" counts live in the listing.
      qc.invalidateQueries({ queryKey: ["context", repoId] });
    },
  });
}

export function useSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-skill", skillId, repoId],
    queryFn: () => api.get<ContextSelection>(`/repos/${repoId}/context/skills/${skillId}`),
    enabled: !!skillId && !!repoId,
  });
}

export function useSaveSkillContext(skillId: string | null | undefined, repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<ContextSelection>(`/repos/${repoId}/context/skills/${skillId}`, { paths }),
    onSuccess: (sel) => {
      qc.setQueryData(["context-skill", skillId, repoId], sel);
      qc.invalidateQueries({ queryKey: ["context", repoId] });
      // An agent's linked-skill paths change with its skills' attachments.
      qc.invalidateQueries({ queryKey: ["context-agent"] });
    },
  });
}
