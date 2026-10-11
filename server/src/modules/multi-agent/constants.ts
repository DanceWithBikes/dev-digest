/**
 * Multi-agent review constants (SPEC-05).
 */
import type { Severity } from '@devdigest/shared';

/** Two findings are "near" when their line ranges overlap or sit this far apart. */
export const LINE_GAP = 3;

/** Minimum token similarity of two normalised titles for the same location. */
export const TITLE_SIMILARITY_MIN = 0.5;

/** How many of an agent's most recent finished runs feed its estimate. */
export const ESTIMATE_SAMPLE = 10;

/** How many parent runs `GET /multi-agent-runs` returns, newest first. */
export const LIST_LIMIT = 50;

/** Higher = more severe. */
export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};
