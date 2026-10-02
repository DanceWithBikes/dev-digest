import type {
  ContextAttachment,
  ContextDocType,
  ContextDocument,
  ContextListing,
} from '@devdigest/shared';
import {
  CHARS_PER_TOKEN,
  EXCLUDED_DIRS,
  MAX_GLOB_LENGTH,
  MAX_GLOB_WILDCARDS,
} from './constants.js';

/**
 * Pure rules of Project Context: glob matching, document type, token estimate,
 * path validation and assembling the listing. No I/O, no clock.
 */

const segmentsOf = (path: string): string[] => path.split(/[\\/]/);

/** `ceil(chars / 4)` — the only token formula of the feature (AC-11). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/**
 * Minimal glob → RegExp. Supports `**` (zero or more path segments), `*`
 * (within a segment), `?`, and one level of `{a,b}`; separators are `/`.
 */
export function globToRegExp(rawGlob: string): RegExp {
  // `**/**` matches exactly what `**` does; collapsing keeps the regex linear-ish.
  const glob = rawGlob.replace(/\*\*(?:\/\*\*)+/g, '**');
  let out = '';
  let i = 0;
  let inBrace = false;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        out += '(?:.*/)?';
        i += 3;
      } else {
        out += '.*';
        i += 2;
      }
    } else if (c === '*') {
      out += '[^/]*';
      i += 1;
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (c === '{' && !inBrace) {
      inBrace = true;
      out += '(?:';
      i += 1;
    } else if (c === '}' && inBrace) {
      inBrace = false;
      out += ')';
      i += 1;
    } else if (c === ',' && inBrace) {
      out += '|';
      i += 1;
    } else {
      out += c.replace(/[.+^$()|[\]\\{}]/g, '\\$&');
      i += 1;
    }
  }
  if (inBrace) throw new Error('unclosed "{" in glob');
  return new RegExp(`^${out}$`);
}

/** Compile every root once, so a scan does not rebuild a RegExp per path. */
export function compileRoots(roots: readonly string[]): RegExp[] {
  return roots.map(globToRegExp);
}

export function matchesCompiled(path: string, compiled: readonly RegExp[]): boolean {
  return compiled.some((re) => re.test(path));
}

export function matchesRoots(path: string, roots: readonly string[]): boolean {
  return matchesCompiled(path, compileRoots(roots));
}

/** True when any directory segment is `.git` or `node_modules`, any case (AC-8). */
export function isExcluded(path: string): boolean {
  return segmentsOf(path).some((s) => EXCLUDED_DIRS.includes(s.toLowerCase()));
}

/** The listing holds Markdown only, whatever the roots (AC-6). */
export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith('.md');
}

/** Document type; rules apply in order, first match wins (AC-2). */
export function docTypeFor(path: string): ContextDocType {
  const parts = segmentsOf(path);
  const dirs = parts.slice(0, -1);
  if (dirs.includes('specs')) return 'spec';
  if (dirs.includes('insights') || parts[parts.length - 1] === 'insights.md') return 'insights';
  return 'doc';
}

/** Why `value` is not an acceptable relative path/glob, or null when it is. */
function relativeProblem(value: string, label: string): string | null {
  if (value.trim() === '') return `${label} must not be empty`;
  if (value.includes('\0')) return `${label} must not contain NUL`;
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value)) {
    return `${label} must not be absolute`;
  }
  if (segmentsOf(value).includes('..')) return `${label} must not contain a ".." segment`;
  return null;
}

/** Rejects unsafe, oversized or uncompilable globs; null when the root is usable. */
export function validateRoot(root: string): string | null {
  const problem = relativeProblem(root, 'search root');
  if (problem) return problem;
  if (root.length > MAX_GLOB_LENGTH) {
    return `search root must be at most ${MAX_GLOB_LENGTH} characters`;
  }
  if ((root.match(/\*+/g) ?? []).length > MAX_GLOB_WILDCARDS) {
    return `search root must have at most ${MAX_GLOB_WILDCARDS} wildcards`;
  }
  try {
    globToRegExp(root);
  } catch {
    return 'search root is not a valid glob';
  }
  return null;
}

/** An attachment may name any tracked path except one inside `.git` (any case). */
export function validateRelativePath(path: string): string | null {
  const problem = relativeProblem(path, 'path');
  if (problem) return problem;
  if (segmentsOf(path).some((s) => s.toLowerCase() === '.git')) {
    return 'path must not contain a ".git" segment';
  }
  return null;
}

/** Sorted, de-duplicated copy: ascending by path keeps prompts deterministic. */
export function uniqueSorted(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort();
}

/** Flags each attached path absent from `present` as `missing` (AC-20). */
export function flagMissing(
  attached: readonly string[],
  present: ReadonlySet<string>,
): ContextAttachment[] {
  return attached.map((path) => ({ path, missing: !present.has(path) }));
}

export interface ScannedFile {
  path: string;
  chars: number;
}

export interface ListingInput {
  repoId: string;
  roots: string[];
  rootsDefault: boolean;
  cloned: boolean;
  scannedAt: string;
  files: ScannedFile[];
  agentCounts: ReadonlyMap<string, number>;
  skillCounts: ReadonlyMap<string, number>;
}

export function toListing(input: ListingInput): ContextListing {
  const documents: ContextDocument[] = [...input.files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => ({
      path: f.path,
      type: docTypeFor(f.path),
      chars: f.chars,
      tokens: estimateTokens(f.chars),
      agents_count: input.agentCounts.get(f.path) ?? 0,
      skills_count: input.skillCounts.get(f.path) ?? 0,
    }));
  return {
    repo_id: input.repoId,
    roots: input.roots,
    roots_default: input.rootsDefault,
    cloned: input.cloned,
    count: documents.length,
    scanned_at: input.scannedAt,
    documents,
  };
}
