/* hooks/onboarding.ts — React Query hooks for the Onboarding Tour page (SPEC-02). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { OnboardingGenerateAccepted, OnboardingTourResponse } from "@devdigest/shared";

/** Refetch cadence while a generation is in flight (AC-84). */
export const ONBOARDING_POLL_MS = 3000;

const key = (repoId: string | null | undefined) => ["onboarding-tour", repoId] as const;

/** The stored tour plus its stale / generating / last-failed flags. */
export function useOnboardingTour(
  repoId: string | null | undefined,
  opts: { poll?: boolean } = {},
) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<OnboardingTourResponse>(`/repos/${repoId}/onboarding`),
    enabled: !!repoId,
    refetchInterval: opts.poll ? ONBOARDING_POLL_MS : false,
  });
}

/**
 * Request a generation. Not a query: it may cost a model call, so it happens
 * only because someone pressed a button (AC-81) — never as a refetch.
 */
export function useGenerateOnboardingTour(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    // No body on purpose: `apiFetch` only sets a JSON content-type when one is
    // sent, and Fastify rejects an empty JSON body.
    mutationFn: () => api.post<OnboardingGenerateAccepted>(`/repos/${repoId}/onboarding/generate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(repoId) }),
  });
}
