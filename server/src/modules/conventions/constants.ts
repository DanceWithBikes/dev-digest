/** Constants for the conventions module. */

/**
 * How many ranked source files a scan reads. Twelve is a budget, not a
 * guess: the sample is sent verbatim in one prompt, and beyond roughly this
 * many files the model starts reporting the same rule from several places
 * instead of finding new ones.
 */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Config files read before any source file. A linter/formatter config states a
 * convention the project already agreed on, which is stronger evidence than the
 * same pattern inferred from source — and it costs one file read to get.
 *
 * Missing files are skipped silently: every project has a different subset.
 */
export const CONFIG_FILES: readonly string[] = [
  'eslint.config.mjs',
  'eslint.config.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
  '.editorconfig',
];

/**
 * Per-file character cap for the sample. Truncating one long file is better
 * than dropping it: the head of a file carries its imports, naming and error
 * handling, which is what a convention scan is looking for.
 */
export const MAX_SAMPLE_FILE_CHARS = 6_000;

/**
 * Candidates below this confidence are discarded before they are ever stored.
 * The page exists to be triaged by a human, and a list padded with guesses the
 * model itself doubts trains people to click Accept without reading.
 */
export const MIN_CONFIDENCE = 0.5;

/** Upper bound on candidates kept from one scan, highest confidence first. */
export const MAX_CANDIDATES = 24;

/**
 * The single skill accepted candidates are assembled into. Fixed by name, and
 * upserted rather than inserted: a repo has one conventions skill, and a second
 * scan must update it instead of leaving two rival copies attached to agents.
 */
export const REPO_CONVENTIONS_SKILL_NAME = 'repo-conventions';

/** Default description for that skill when the caller doesn't supply one. */
export const REPO_CONVENTIONS_SKILL_DESCRIPTION =
  'Apply this repository’s own house rules — naming, structure, error handling and testing — as observed in its code.';

/** Temperature for the extraction call: this is evidence gathering, not prose. */
export const EXTRACTION_TEMPERATURE = 0.2;

/** Cap on the model's reply; 24 candidates with evidence fit comfortably. */
export const EXTRACTION_MAX_TOKENS = 4_000;
