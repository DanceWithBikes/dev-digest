"use client";

import { useFormatter, useNow } from "next-intl";

const TICK_MS = 30_000;

/** The reference "now" for a relative time: never earlier than `at`, so a past clock never renders "in …". */
export function clampedNow(now: Date, at: Date): Date {
  return at.getTime() > now.getTime() ? at : now;
}

/**
 * Returns a formatter `(at) => "5 minutes ago"` that ticks every 30s.
 * The root-layout provider hands down the server render's `now` (which can predate
 * a fresh record after client navigation), so a live `now` is read and clamped.
 */
export function useRelativeTime(): (at: Date | string) => string {
  const format = useFormatter();
  const now = useNow({ updateInterval: TICK_MS });
  return (at) => {
    const date = typeof at === "string" ? new Date(at) : at;
    return format.relativeTime(date, clampedNow(now, date));
  };
}
