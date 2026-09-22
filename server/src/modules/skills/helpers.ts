import { inflateRawSync } from 'node:zlib';
import type { Skill, SkillDraft, SkillSource, SkillType, SkillVersion, SkillWarning } from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  DEFAULT_SKILL_NAME,
  DEFAULT_SKILL_TYPE,
  MAX_DESCRIPTION_CHARS,
  MAX_SKILL_ARCHIVE_BYTES,
  MAX_SKILL_ARCHIVE_ENTRY_BYTES,
  MAX_SKILL_BODY_CHARS,
} from './constants.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, the version-bump rule,
 * the markdown import parser and the `.zip` unpacker. No I/O.
 *
 * The persisted shapes are declared structurally here rather than imported from
 * `repository.ts`: the module's centre may not depend on its data layer
 * (`domain-files-are-pure`). The repository's Drizzle rows satisfy them.
 *
 * `node:zlib` is the one node builtin imported here. It is a CPU primitive, not
 * a channel to the outside world: nothing is read, written or fetched, so the
 * unpacker stays a pure buffer → string function and is unit-testable with a zip
 * the test builds in memory.
 */

/** The persisted skill shape this module maps from. */
export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

/** The persisted body-snapshot shape this module maps from. */
export interface SkillVersionRecord {
  skillId: string;
  version: number;
  body: string;
  createdAt: Date;
}

/**
 * Map a persisted skill row to the public `Skill` DTO.
 *
 * `agentCount` arrives as an argument because it lives in `agent_skills`, a
 * table this module only reads: passing it in keeps the mapper pure and free of
 * the data layer (`domain-files-are-pure`), and keeps the count a derived
 * number rather than a column that could disagree with the link table.
 */
export function toSkillDto(row: SkillRecord, agentCount: number): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    agent_count: agentCount,
  };
}

/** Map a persisted `skill_versions` row to the public `SkillVersion` DTO. */
export function toSkillVersionDto(row: SkillVersionRecord): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * True when a patch changes the body. `skill_versions` stores only the body, so
 * snapshotting a name/description/type edit would write a duplicate row with no
 * diff — unlike agents, where the whole config is snapshotted.
 */
export function isBodyChange(
  existing: Pick<SkillRecord, 'body'>,
  patch: { body?: string },
): boolean {
  return patch.body !== undefined && patch.body !== existing.body;
}

// ---- markdown import ------------------------------------------------------

/** Recognised frontmatter keys. Anything else in the block is ignored. */
type Frontmatter = { name?: string; description?: string; type?: string };

const FRONTMATTER_KEYS = ['name', 'description', 'type'] as const;

/**
 * Split an optional `---`-delimited frontmatter block off the top of the file.
 * Parsed with a line scanner rather than a yaml dependency: only three scalar
 * keys are honoured, so a full yaml parser would buy nothing and accept a lot.
 */
function splitFrontmatter(content: string): { meta: Frontmatter; body: string } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { meta: {}, body: content };
  }
  const lines = content.split(/\r?\n/);
  const end = lines.indexOf('---', 1);
  if (end === -1) return { meta: {}, body: content };

  const meta: Frontmatter = {};
  for (const line of lines.slice(1, end)) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    if (!(FRONTMATTER_KEYS as readonly string[]).includes(key)) continue;
    const value = line
      .slice(sep + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
    if (value) meta[key as keyof Frontmatter] = value;
  }
  return { meta, body: lines.slice(end + 1).join('\n') };
}

/** First `# ` ATX heading, or undefined. */
function firstHeading(body: string): string | undefined {
  for (const line of body.split(/\r?\n/)) {
    const m = /^#\s+(.+?)\s*$/.exec(line);
    if (m) return m[1];
  }
  return undefined;
}

/**
 * First line that reads as prose: not a heading, not a list item, not inside a
 * fenced block. That is the closest thing a plain markdown file has to a
 * one-line interface description.
 */
function firstParagraph(body: string): string | undefined {
  let inFence = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('```') || line.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || !line) continue;
    if (line.startsWith('#') || /^[-*+]\s/.test(line) || /^\d+[.)]\s/.test(line)) continue;
    return line;
  }
  return undefined;
}

/**
 * Filename without its directory or extension, e.g. `a/b/no-mocks.md` →
 * `no-mocks`. `.zip` is stripped too: an archive import passes the name of the
 * file the user actually picked, and `my-rules.zip` is a worse skill name than
 * `my-rules`.
 */
function nameFromFilename(filename: string): string | undefined {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const stem = base.replace(/\.(md|markdown|zip)$/i, '').trim();
  return stem || undefined;
}

function hasCodeFence(body: string): boolean {
  return /^(```|~~~)/m.test(body);
}

/**
 * Parse a markdown file into an unsaved `SkillDraft` for the import preview.
 *
 * Nothing here executes, resolves or fetches anything: a fenced code block is
 * text like any other line, which is what makes "executable parts are not
 * processed" structurally true rather than a promise in the UI. The
 * `code-blocks-kept-as-text` warning exists to say that out loud in the preview.
 */
export function parseSkillMarkdown(content: string, filename?: string): SkillDraft {
  const warnings: SkillWarning[] = [];
  const { meta, body: rawBody } = splitFrontmatter(content);

  const heading = firstHeading(rawBody);
  const name =
    meta.name ??
    heading ??
    (filename ? nameFromFilename(filename) : undefined) ??
    DEFAULT_SKILL_NAME;
  if (!meta.name && !heading) warnings.push('no-heading');

  const description = (meta.description ?? firstParagraph(rawBody) ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION_CHARS);
  if (!description) warnings.push('no-description');

  let type: SkillType = DEFAULT_SKILL_TYPE;
  if (meta.type !== undefined) {
    const parsed = SkillTypeSchema.safeParse(meta.type);
    if (parsed.success) type = parsed.data;
    else warnings.push('unknown-type');
  }

  let body = rawBody.trim();
  if (body.length > MAX_SKILL_BODY_CHARS) {
    body = body.slice(0, MAX_SKILL_BODY_CHARS);
    warnings.push('truncated');
  }
  if (hasCodeFence(body)) warnings.push('code-blocks-kept-as-text');

  return { name, description, type, body, warnings };
}

// ---- .zip import ----------------------------------------------------------

/**
 * Minimal zip reader — central directory only, no dependency.
 *
 * Skills ship as `SKILL.md` plus assets, so the import has to accept a folder,
 * and a folder in a browser upload is a zip. Adding an unzip library for that
 * would be a new third-party parser on attacker-controlled bytes, in a package
 * with its own lockfile; ~80 lines of header reading is the smaller risk and the
 * only format feature we need is "give me one text file".
 *
 * What is deliberately NOT supported: zip64, encryption, and every compression
 * method but stored/deflate. Each is rejected loudly rather than guessed at.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const EOCD_SIZE = 22;
const CENTRAL_HEADER_SIZE = 46;
const LOCAL_HEADER_SIZE = 30;
/** A zip comment is 16-bit-length, so the EOCD can be at most this far from the end. */
const MAX_EOCD_SEARCH = EOCD_SIZE + 0xffff;
/** The sentinel a field carries when its real value lives in a zip64 record. */
const ZIP64_SENTINEL = 0xffffffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** One central-directory record, before any of its content is touched. */
interface ZipEntry {
  path: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

/** The markdown file lifted out of an archive. */
export interface ZipMarkdownEntry {
  path: string;
  content: string;
}

/**
 * An entry path that escapes the archive root. Nothing here is written to disk,
 * so this cannot become a traversal *today* — it is refused because an archive
 * that contains `../../.ssh/authorized_keys` is hostile whatever we do with it,
 * and because the day someone adds "extract the assets too" the guard must
 * already be in place rather than be remembered.
 */
function isUnsafeEntryPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  if (normalized.startsWith('/')) return true;
  if (/^[a-z]:/i.test(normalized)) return true;
  return normalized.split('/').includes('..');
}

function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

/**
 * Lower is better: the conventional `SKILL.md`, then a markdown file at the
 * archive root, then the shallowest one. A skill folder puts its instructions at
 * the top and its examples underneath, so depth is a good proxy for "the file
 * the user meant".
 */
function markdownRank(path: string): number {
  const segments = path.split('/');
  if (segments[segments.length - 1]!.toLowerCase() === 'skill.md') return 0;
  return segments.length;
}

/** Offset of the end-of-central-directory record, scanning back from the tail. */
function findEndOfCentralDirectory(zip: Buffer): number {
  const lowest = Math.max(0, zip.length - MAX_EOCD_SEARCH);
  for (let i = zip.length - EOCD_SIZE; i >= lowest; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) return i;
  }
  throw new ValidationError('Not a .zip archive (no end-of-central-directory record)');
}

/** Read every central-directory record. Content is not decompressed here. */
function readCentralDirectory(zip: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocd + 10);
  let cursor = zip.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || cursor === ZIP64_SENTINEL) {
    throw new ValidationError('zip64 archives are not supported');
  }

  const entries: ZipEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    if (cursor + CENTRAL_HEADER_SIZE > zip.length) {
      throw new ValidationError('Malformed .zip central directory');
    }
    if (zip.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ValidationError('Malformed .zip central directory');
    }
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const pathLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeaderOffset = zip.readUInt32LE(cursor + 42);
    const path = zip.toString('utf8', cursor + CENTRAL_HEADER_SIZE, cursor + CENTRAL_HEADER_SIZE + pathLength);

    if (
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      localHeaderOffset === ZIP64_SENTINEL
    ) {
      throw new ValidationError('zip64 archives are not supported');
    }
    // Checked for EVERY entry, not just the one we unpack: a single hostile path
    // condemns the archive, so a traversal entry cannot hide behind a valid one.
    if (isUnsafeEntryPath(path)) {
      throw new ValidationError(`Unsafe path in archive: ${path}`);
    }
    // A trailing slash is the directory marker; it has no content to read.
    if (!path.endsWith('/')) {
      entries.push({ path, method, compressedSize, uncompressedSize, localHeaderOffset });
    }
    cursor += CENTRAL_HEADER_SIZE + pathLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * Decompress one entry. The local header is re-read because its extra field can
 * differ in length from the central one — trusting the central directory's copy
 * is the classic way to land a few bytes into the payload.
 */
function readEntryContent(zip: Buffer, entry: ZipEntry): string {
  if (entry.uncompressedSize > MAX_SKILL_ARCHIVE_ENTRY_BYTES) {
    throw new ValidationError(`${entry.path} is too large to import`);
  }
  const header = entry.localHeaderOffset;
  if (header + LOCAL_HEADER_SIZE > zip.length || zip.readUInt32LE(header) !== LOCAL_HEADER_SIGNATURE) {
    throw new ValidationError('Malformed .zip local file header');
  }
  const start =
    header + LOCAL_HEADER_SIZE + zip.readUInt16LE(header + 26) + zip.readUInt16LE(header + 28);
  const end = start + entry.compressedSize;
  if (end > zip.length) throw new ValidationError('Truncated .zip archive');
  const compressed = zip.subarray(start, end);

  if (entry.method === METHOD_STORED) {
    if (compressed.length > MAX_SKILL_ARCHIVE_ENTRY_BYTES) {
      throw new ValidationError(`${entry.path} is too large to import`);
    }
    return compressed.toString('utf8');
  }
  if (entry.method !== METHOD_DEFLATE) {
    throw new ValidationError(`Unsupported compression in archive: ${entry.path}`);
  }
  try {
    // maxOutputLength aborts mid-inflate, so a zip bomb never gets allocated.
    return inflateRawSync(compressed, { maxOutputLength: MAX_SKILL_ARCHIVE_ENTRY_BYTES }).toString('utf8');
  } catch {
    throw new ValidationError(`Could not decompress ${entry.path}`);
  }
}

/**
 * Pull the one markdown file worth importing out of a `.zip`.
 *
 * Pure: takes bytes, returns text or throws. Everything that can go wrong with
 * an uploaded archive is decided here — which is why it is a helper the tests
 * can drive directly rather than a step buried in the service.
 */
export function extractSkillMarkdownFromZip(zip: Buffer): ZipMarkdownEntry {
  if (zip.length > MAX_SKILL_ARCHIVE_BYTES) {
    throw new ValidationError('Archive is too large to import');
  }
  if (zip.length < EOCD_SIZE) throw new ValidationError('Not a .zip archive');

  const markdown = readCentralDirectory(zip)
    .filter((e) => isMarkdownPath(e.path))
    // Path is the tie-breaker so the same archive always yields the same skill.
    .sort((a, b) => markdownRank(a.path) - markdownRank(b.path) || a.path.localeCompare(b.path));

  const best = markdown[0];
  if (!best) throw new ValidationError('No markdown file found in the archive');
  return { path: best.path, content: readEntryContent(zip, best) };
}
