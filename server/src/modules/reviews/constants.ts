/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/**
 * Rough chars-per-token ratio, used only to put an order-of-magnitude token
 * figure next to the skills line in the Live Log. The container's tokenizer
 * would be exact, but this is a log line, not a billing number.
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Intent Layer (L03) constants.
 *
 * Per-source character caps so one oversized source (a huge PR body, issue or
 * spec file) can't blow the classifier's prompt budget — the same idea as
 * reviewer-core's `MAX_PR_DESCRIPTION_CHARS`, applied per source here.
 */
export const MAX_PR_BODY_CHARS = 4_000;
export const MAX_ISSUE_BODY_CHARS = 4_000;
export const MAX_SPEC_CHARS = 6_000;

/** Temperature for the classifier call: this is extraction, not prose. */
export const INTENT_TEMPERATURE = 0.2;

/** Cap on the model's reply; an intent sentence plus a handful of scope
 *  bullets fits comfortably. */
export const INTENT_MAX_TOKENS = 1_000;
