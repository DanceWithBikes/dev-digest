/** Constants for the Run Trace + Live Log drawer (A5). */

/** Drawer width (px). */
export const DRAWER_WIDTH = 720;

/** Live-log stream viewport height (px). */
export const LOG_HEIGHT = 420;

/** Tab keys (Trace / Live log). */
export const TABS = ["trace", "log"] as const;
export type TraceTab = (typeof TABS)[number];

/**
 * Characters per token for the approximate per-block token counts shown next to
 * a prompt-assembly label. Mirrors `CHARS_PER_TOKEN` in
 * server/src/modules/reviews/constants.ts, which the server uses for the same
 * estimate in the run log — keep both in sync so the two numbers agree.
 */
export const CHARS_PER_TOKEN = 4;

/** Prompt-assembly block accent colours (by leg). */
export const PROMPT_COLORS = {
  system: "var(--text-muted)",
  skills: "var(--accent)",
  memory: "var(--warn)",
  repoMap: "var(--accent)",
  specs: "var(--text-secondary)",
  callers: "var(--warn)",
  user: "var(--ok)",
} as const;
