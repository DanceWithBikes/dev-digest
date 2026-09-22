/** Constants for the Versioning tab. */

/**
 * Combined line budget for the LCS diff. Beyond it the diff degrades to a
 * whole-body replacement instead of filling an O(n·m) table.
 */
export const DIFF_MAX_LINES = 4000;

/** Path shown in the diff header — a skill body has no file of its own. */
export const DIFF_PATH_SUFFIX = ".md";
