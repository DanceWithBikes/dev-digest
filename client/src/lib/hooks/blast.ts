/* hooks/blast.ts — React Query hooks for the L04 Blast Radius feature.
     GET  /pulls/:id/blast       → BlastRadius (downstream callers/endpoints/crons)
     GET  /pulls/:id/prior-prs   → PrHistory (merged PRs that touched the same files)
   `useBlastResync` also lives here (not co-located under BlastRadiusCard/) — it
   composes `useResyncRepoIntel`/`useRepoIntelStatus` from hooks/repo-intel.ts,
   and client/AGENTS.md keeps every stateful hook that reaches the API in
   src/lib/hooks, one file per domain, like the rest of this folder. */
"use client";

import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useRepoIntelStatus, useResyncRepoIntel } from "./repo-intel";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

/** GET /pulls/:id/blast → downstream callers/endpoints/crons for the PR's changed symbols. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** GET /pulls/:id/prior-prs → merged PRs that previously touched the same files.
   Fetched lazily — only once the "Prior PRs" row is opened — and kept a while:
   the answer barely changes between one PR-detail visit and the next. */
export function usePriorPrs(prId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["prior-prs", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/prior-prs`),
    enabled: !!prId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** How long `useBlastResync` polls repo-intel before giving up and showing
   `resync.timeout` — a resync clones/parses a whole repo, so this is generous. */
const RESYNC_POLL_TIMEOUT_MS = 90_000;

/**
 * DegradedNotice's "Resync" affordance, scoped to one PR's repo. `enabled`
 * gates the index-state read (`useRepoIntelStatus`) — pass the card's own
 * `radius.degraded`, so a healthy map never fetches index-state at all:
 *  1. snapshot the repo's current `lastIndexedSha`/`updatedAt` (`start` is a
 *     no-op, via `ready`, until that snapshot has actually loaded — an empty
 *     snapshot would "change" on the very first poll response);
 *  2. fire the resync mutation; start polling only once it succeeds, and
 *     report `failed` instead if it rejects (never leaves `running` stuck);
 *  3. poll `useRepoIntelStatus(repoId, true, enabled)` until that snapshot changes;
 *  4. invalidate `["blast", prId]` so the card refetches the fresh map;
 *  5. give up after `RESYNC_POLL_TIMEOUT_MS` and report a timeout instead of
 *     polling forever (a resync can also just hang server-side).
 */
export function useBlastResync(repoId: string | null | undefined, prId: string | null | undefined, enabled: boolean) {
  const qc = useQueryClient();
  const resync = useResyncRepoIntel(repoId);
  const [polling, setPolling] = React.useState(false);
  const [timedOut, setTimedOut] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const snapshotRef = React.useRef<{ sha: string; updatedAt: string } | null>(null);
  const { data: status } = useRepoIntelStatus(repoId, polling, enabled);

  React.useEffect(() => {
    if (!polling) return;
    const timer = window.setTimeout(() => {
      setPolling(false);
      setTimedOut(true);
    }, RESYNC_POLL_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [polling]);

  React.useEffect(() => {
    if (!polling || !status || !snapshotRef.current) return;
    const changed =
      status.lastIndexedSha !== snapshotRef.current.sha || status.updatedAt !== snapshotRef.current.updatedAt;
    if (!changed) return;
    setPolling(false);
    qc.invalidateQueries({ queryKey: ["blast", prId] });
  }, [status, polling, prId, qc]);

  const start = () => {
    // No snapshot yet (index-state hasn't loaded) — starting now would poll
    // against an empty `{ sha: "", updatedAt: "" }` snapshot that trivially
    // "changes" on the first real response.
    if (!repoId || !status) return;
    setTimedOut(false);
    setFailed(false);
    snapshotRef.current = { sha: status.lastIndexedSha, updatedAt: status.updatedAt };
    resync.mutate(undefined, {
      onSuccess: () => setPolling(true),
      onError: () => setFailed(true),
    });
  };

  return { start, running: resync.isPending || polling, timedOut, failed, ready: !!status };
}
