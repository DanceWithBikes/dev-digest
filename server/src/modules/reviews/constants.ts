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
