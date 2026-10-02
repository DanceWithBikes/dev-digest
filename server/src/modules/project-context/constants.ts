/** Search roots of a repo that never saved its own (AC-7). */
export const DEFAULT_SEARCH_ROOTS: readonly string[] = ['**/{specs,docs,insights}/**/*.md'];

/** Directories never listed, whatever the roots (AC-8). */
export const EXCLUDED_DIRS: readonly string[] = ['.git', 'node_modules'];

/** Bounds on user search roots: keep glob compilation and matching cheap. */
export const MAX_ROOTS = 20;
export const MAX_GLOB_LENGTH = 256;
export const MAX_GLOB_WILDCARDS = 4;

/** Bounds on attached paths: one PUT stays far below Postgres' bind-parameter
 *  limit, and a run never queues thousands of git reads. */
export const MAX_SELECTED_PATHS = 200;
export const MAX_PATH_LENGTH = 1024;

/** Token estimate: ceil(chars / CHARS_PER_TOKEN) (AC-11). */
export const CHARS_PER_TOKEN = 4;

/** How many files a scan reads at once to count characters. */
export const SCAN_READ_CONCURRENCY = 16;
