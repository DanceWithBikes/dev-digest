/**
 * Literals of the Onboarding Tour (SPEC-02). Pure data; no logic.
 */

// ---- Facts (AC-18, AC-19, AC-20) ----
export const MAX_FILE_FACTS = 30;
export const MAX_ENDPOINTS = 50;
export const MAX_RUN_COMMANDS = 20;
export const TREE_MAX_ENTRIES = 200;
export const TREE_DEPTH = 2;
export const README_MAX_CHARS = 8_000;
/** A manifest longer than this (in characters) is skipped, not truncated. */
export const MANIFEST_MAX_CHARS = 64 * 1024;
export const MAX_STACK = 40;
export const MAX_COMMAND_CHARS = 500;
/** Prompt-input budget, estimated as `ceil(chars / CHARS_PER_TOKEN)` (AC-20). */
export const MAX_INPUT_TOKENS = 24_000;
export const CHARS_PER_TOKEN = 4;
export const MAX_OUTPUT_TOKENS = 4_000;

// ---- Sections (AC-27..AC-30, AC-45, AC-46) ----
export const MAX_READING_PATH = 12;
export const MAX_CRITICAL_FILES = 8;
export const MAX_DIAGRAM_NODES = 12;
export const MAX_DIAGRAM_EDGES = 20;
export const MAX_FIRST_TASKS = 5;
export const MAX_RUN_STEPS = 10;
/** Label of the diagram node that holds repo-root files (AC-30). */
export const ROOT_NODE = '(root)';

// ---- Time and rate limits (AC-34, AC-41, AC-42) ----
export const LLM_TIMEOUT_MS = 60_000;
export const GENERATION_TIMEOUT_MS = 90_000;
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;

// ---- Manifest selection (AC-21, AC-25) ----
export const MANIFEST_NAMES = [
  'package.json',
  'Makefile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  '.nvmrc',
] as const;
export const COMPOSE_NAMES: readonly string[] = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

// ---- Logging (AC-68) ----
export const LOG_MESSAGE = 'onboarding generation finished';
