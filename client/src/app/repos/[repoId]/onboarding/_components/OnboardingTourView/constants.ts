import type { IconName, OnboardingSectionId } from "./types";

/** Give up waiting for a generation after this long (AC-85). */
export const POLL_TIMEOUT_MS = 120_000;
/** ...or after this many refetches, whichever comes first (AC-85). */
export const POLL_MAX_REFETCHES = 40;
/** How long "Link copied" / "Copied" stay visible. */
export const COPIED_MS = 1500;

/**
 * Section anchors in tour order (AC-2). Kept here as a type-checked copy: a
 * value import from `@devdigest/shared` pulls its `.js`-suffixed barrel into the
 * webpack bundle, which cannot resolve it — the client imports only types from it.
 */
export const SECTION_IDS: readonly OnboardingSectionId[] = [
  "architecture",
  "critical-paths",
  "run-locally",
  "reading-path",
  "first-tasks",
];

export const SECTION_ICONS: Record<OnboardingSectionId, IconName> = {
  architecture: "Boxes",
  "critical-paths": "Activity",
  "run-locally": "Command",
  "reading-path": "ListChecks",
  "first-tasks": "Target",
};

/** Diagram box geometry, in SVG user units. */
export const DIAGRAM = {
  nodeWidth: 184,
  nodeHeight: 38,
  gapX: 64,
  gapY: 26,
  pad: 16,
  labelMax: 22,
  /** Perpendicular shift that keeps a pair of opposite edges apart. */
  pairOffset: 6,
  /** Largest enlargement of the SVG over its natural size. */
  maxScale: 1.4,
} as const;
