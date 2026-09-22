/** Constants for the skills module. */

/** Version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Type assigned when the import can't determine one. */
export const DEFAULT_SKILL_TYPE = 'custom';

/** Source assigned when the caller doesn't say where the skill came from. */
export const DEFAULT_SKILL_SOURCE = 'manual';

/** Name used when a markdown file has no heading, no frontmatter and no filename. */
export const DEFAULT_SKILL_NAME = 'Untitled skill';

/**
 * A description is the skill's *interface* — one directive line an agent can act
 * on. The cap keeps it that, rather than a second body.
 */
export const MAX_DESCRIPTION_CHARS = 280;

/**
 * Bodies are concatenated into every prompt of every agent they're attached to,
 * so the cap is a cost guard, not a storage one.
 */
export const MAX_SKILL_BODY_CHARS = 20_000;

/**
 * Ceiling on the decompressed bytes of the one entry we unpack from an imported
 * `.zip`. A zip is a compression ratio away from being a memory bomb, so the
 * limit is enforced *while* inflating rather than on the result. Sized off the
 * body cap (the parser truncates to it anyway) with room for multi-byte UTF-8,
 * so a legitimate skill never hits it.
 */
export const MAX_SKILL_ARCHIVE_ENTRY_BYTES = MAX_SKILL_BODY_CHARS * 4;

/**
 * Ceiling on the archive itself, checked before anything is read out of it — a
 * malformed header is cheap to reject, a 200 MB buffer is not.
 */
export const MAX_SKILL_ARCHIVE_BYTES = 4 * 1024 * 1024;
