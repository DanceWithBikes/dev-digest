/** PR Brief constants (SPEC-03). Pure values only — no I/O. */

// ---- Time and rate limits (AC-47, AC-49, NFR-2, NFR-5) ----
export const BRIEF_TIMEOUT_MS = 90_000;
/** Sub-deadline for reading attached documents; losing it reads as "no documents". */
export const DOC_READ_TIMEOUT_MS = 15_000;
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;

// ---- Model input budgets (NFR-4) ----
export const DIFF_BUDGET_CHARS = 60_000;
export const DOC_BUDGET_TOKENS = 20_000;
export const CHARS_PER_TOKEN = 4;
export const BODY_CAP_CHARS = 8_000;

// ---- Output caps (AC-42) and model call ----
export const MAX_RISKS = 6;
export const MAX_FOCUS = 10;
export const MAX_OUTPUT_TOKENS = 4_000;
export const SCHEMA_NAME = 'pr_brief';

// ---- Missing-data reasons (AC-18, AC-21, AC-22, AC-28..AC-30, AC-32) ----
export const MISSING_NO_INTENT = 'no intent derived for this PR';
export const MISSING_BLAST_UNAVAILABLE = 'blast radius unavailable';
export const MISSING_NO_DOCS = 'no project context documents attached';

export const missingStaleIntent = (sha: string | null): string =>
  `intent is stale (derived for ${sha ? sha.slice(0, 7) : 'an unknown commit'})`;
export const missingDegradedBlast = (reason: string | undefined): string =>
  `blast radius degraded (${reason ?? 'unknown'})`;
export const missingDocBudget = (path: string): string =>
  `${path} exceeded the ${DOC_BUDGET_TOKENS.toLocaleString('en-US')}-token budget`;
export const missingDocNotFound = (path: string): string => `${path} not found`;
export const missingDiffTruncated = (count: number): string =>
  `diff truncated (${count} ${count === 1 ? 'file' : 'files'})`;

// ---- Logging (NFR-9) ----
export const LOG_MESSAGE = 'pr brief generation finished';
export const LOG_INVALID_STORED = 'stored pr brief failed validation; reading as none';

// ---- Errors (AC-46..AC-49) ----
export const ERR_FAILED = 'PR brief generation failed';
export const ERR_TIMEOUT = 'PR brief generation timed out';
export const ERR_IN_FLIGHT = 'A brief is already being generated for this PR';
export const ERR_RATE_LIMIT = 'Too many brief requests; try again in a minute';
