"use client";

import React from "react";
import { useOnboardingTour } from "@/lib/hooks/onboarding";
import { POLL_MAX_REFETCHES, POLL_TIMEOUT_MS } from "./constants";

/**
 * The tour query plus the generation clock (AC-84, AC-85).
 *
 * Polling starts when a generation is requested (`begin`) or the first time a
 * response reports `generating`. It stops after 120 s or 40 refetches and
 * reports `timedOut`; it ends cleanly once a response newer than the start says
 * the generation is over.
 */
export function useGenerationPolling(repoId: string | null | undefined) {
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [refetches, setRefetches] = React.useState(0);
  const [clockExpired, setClockExpired] = React.useState(false);
  const expired = clockExpired || refetches >= POLL_MAX_REFETCHES;

  const query = useOnboardingTour(repoId, { poll: startedAt !== null && !expired });
  const generating = query.data?.generating ?? false;
  const updatedAt = query.dataUpdatedAt;
  const lastUpdate = React.useRef(updatedAt);

  const begin = React.useCallback(() => {
    setStartedAt(Date.now());
    setRefetches(0);
    setClockExpired(false);
  }, []);

  // First sight of an in-flight generation (e.g. a reload mid-run).
  React.useEffect(() => {
    if (generating && startedAt === null) begin();
  }, [generating, startedAt, begin]);

  // The 120 s clock.
  React.useEffect(() => {
    if (startedAt === null) return;
    const id = setTimeout(
      () => setClockExpired(true),
      Math.max(0, POLL_TIMEOUT_MS - (Date.now() - startedAt)),
    );
    return () => clearTimeout(id);
  }, [startedAt]);

  // Count refetches while a run is being watched.
  React.useEffect(() => {
    if (updatedAt === lastUpdate.current) return;
    lastUpdate.current = updatedAt;
    if (startedAt !== null) setRefetches((c) => c + 1);
  }, [updatedAt, startedAt]);

  // Done: a response fetched after the start reports no generation in flight.
  React.useEffect(() => {
    if (startedAt !== null && !generating && updatedAt > startedAt) {
      setStartedAt(null);
      setRefetches(0);
      setClockExpired(false);
    }
  }, [startedAt, generating, updatedAt]);

  return { query, generating, begin, timedOut: startedAt !== null && expired && generating };
}
