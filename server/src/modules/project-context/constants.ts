/** Search roots of a repo that never saved its own (AC-7). */
export const DEFAULT_SEARCH_ROOTS: readonly string[] = ['**/{specs,docs,insights}/**/*.md'];

/** Directories never listed, whatever the roots (AC-8). */
export const EXCLUDED_DIRS: readonly string[] = ['.git', 'node_modules'];

/** Bounds on user search roots: keep glob compilation and matching cheap. */
export const MAX_ROOTS = 20;
export const MAX_GLOB_LENGTH = 256;
export const MAX_GLOB_WILDCARDS = 4;

/** Token estimate: ceil(chars / CHARS_PER_TOKEN) (AC-11). */
export const CHARS_PER_TOKEN = 4;

/** How many files a scan reads at once to count characters. */
export const SCAN_READ_CONCURRENCY = 16;
