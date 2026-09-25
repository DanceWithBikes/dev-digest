import { createHash } from 'node:crypto';
import type {
  PrCommit,
  PrDetail,
  PrFile,
  PrMeta,
  SmartDiff,
  SmartDiffFile,
  SmartDiffGroup,
  SmartDiffRole,
} from '@devdigest/shared';
import type {
  FileSummaryRecord,
  FindingAnchor,
  LatestReview,
  PullRecord,
  ReviewFinding,
  StoredCommit,
  StoredFile,
} from './domain.js';
import { deriveReviewStatus, rollupSeverities, toFindingPreviews } from './status.js';
import { ROLE_ORDER, SMART_DIFF_LARGE_LINES } from './constants.js';

/** Pure domain → DTO mapping for the pulls endpoints. No DB, no HTTP. */

/** What the list knows about a PR beyond the PR row itself. */
export interface PrRollup {
  /** The PR's latest `kind: 'review'` run, or undefined when never reviewed. */
  review: LatestReview | undefined;
  /** That review's findings; empty when there is no review. */
  findings: ReviewFinding[];
  /** Total spend across all the PR's runs; null when no run reported one. */
  costUsd: number | null;
  /** Evaluation instant for the staleness check — passed in so a list is consistent. */
  now: number;
}

export function toPrMetaDto(pr: PullRecord, rollup: PrRollup): PrMeta {
  const { review, findings, costUsd, now } = rollup;
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: deriveReviewStatus({
      ghStatus: pr.status,
      lastReviewedSha: pr.lastReviewedSha,
      headSha: pr.headSha,
      updatedAt: pr.updatedAt,
      now,
    }),
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    score: review ? review.score : null,
    cost_usd: costUsd,
    severity_counts: review ? rollupSeverities(findings) : null,
    finding_previews: review ? toFindingPreviews(findings) : null,
  };
}

export function toPrFileDto(file: StoredFile): PrFile {
  return {
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch,
  };
}

export function toPrCommitDto(commit: StoredCommit): PrCommit {
  return {
    sha: commit.sha,
    message: commit.message,
    author: commit.author,
    committed_at: commit.committedAt?.toISOString() ?? null,
  };
}

/**
 * The offline view of a PR: everything a previous import (or the seed) left
 * behind. `status` passes through as GitHub's merge state — the detail page
 * shows the PR itself, not review freshness.
 */
export function toPersistedPrDetail(
  pr: PullRecord,
  files: StoredFile[],
  commits: StoredCommit[],
): PrDetail {
  return {
    id: pr.id,
    number: pr.number,
    title: pr.title,
    author: pr.author,
    branch: pr.branch,
    base: pr.base,
    head_sha: pr.headSha,
    additions: pr.additions,
    deletions: pr.deletions,
    files_count: pr.filesCount,
    status: pr.status as PrDetail['status'],
    opened_at: pr.openedAt?.toISOString() ?? null,
    updated_at: pr.updatedAt?.toISOString() ?? null,
    body: pr.body ?? null,
    files: files.map(toPrFileDto),
    commits: commits.map(toPrCommitDto),
  };
}

/**
 * The newest review per PR. `rows` must be ordered newest-first, which is what
 * the repository guarantees — so the first row seen for a PR is its latest.
 */
export function pickLatestReviews(rows: LatestReview[]): Map<string, LatestReview> {
  const out = new Map<string, LatestReview>();
  for (const rv of rows) if (!out.has(rv.prId)) out.set(rv.prId, rv);
  return out;
}

/** Findings bucketed by the review they belong to. */
export function groupFindingsByReview(rows: ReviewFinding[]): Map<string, ReviewFinding[]> {
  const out = new Map<string, ReviewFinding[]>();
  for (const f of rows) {
    const bucket = out.get(f.reviewId);
    if (bucket) bucket.push(f);
    else out.set(f.reviewId, [f]);
  }
  return out;
}

// ---- Smart Diff (Rule 1: role classifier, Rule 2: finding anchors) ----

/** A path's `/`-separated segments, ignoring an empty one from a leading/trailing slash. */
function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean);
}

/** Whether any WHOLE segment of `path` equals `name` (case-insensitive) — never a substring match. */
function hasSegment(path: string, name: string): boolean {
  return pathSegments(path).some((s) => s.toLowerCase() === name);
}

const BOILERPLATE_FILENAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'npm-shrinkwrap.json']);
const TEST_DIR_SEGMENTS = new Set(['test', 'tests', '__tests__', 'e2e']);
const TEST_FILE_RE = /\.(test|spec)\.[^./]+$/i;
const WIRING_DIR_SEGMENTS = new Set(['.claude', '.github']);
const WIRING_FILENAMES = new Set(['package.json', 'dockerfile', 'index.ts', 'index.js', 'routes.ts', 'compose.ts', 'container.ts']);
/**
 * `*.config.*` — requires a segment BEFORE `.config.`, so `config.ts` (no
 * leading dot-prefixed name) does not match: `src/config.ts` must stay `core`
 * (`server/docs/insights.md`, 2026-09-24). Matches `vitest.config.ts`,
 * `next.config.mjs`, `tailwind.config.js`, etc.
 */
const WIRING_CONFIG_FILE_RE = /^.+\.config\..+$/i;
/** `tsconfig*.json` — covers the plain `tsconfig.json` too. */
const WIRING_TSCONFIG_RE = /^tsconfig.*\.json$/i;
/** `.eslintrc*` */
const WIRING_ESLINTRC_RE = /^\.eslintrc/i;
/** `.env*` */
const WIRING_ENV_RE = /^\.env/i;
/** `docker-compose*.yml` — covers the plain `docker-compose.yml` too. */
const WIRING_COMPOSE_RE = /^docker-compose.*\.yml$/i;
const DOCS_FILE_RE = /\.(md|mdx)$/i;

/**
 * Reading-order rules (Rule 1), minus `core` which is the fallback below.
 * Order matters and is deliberate: boilerplate first so a generated snapshot
 * under `__tests__` classifies `boilerplate`, not `tests`; tests before
 * wiring/docs so `e2e/README.md` stays `tests` rather than reading as `docs`.
 * Every check matches a WHOLE segment or filename, never a substring — so
 * `.claude/skills/react-testing-library/SKILL.md` classifies `wiring` (its
 * `.claude` segment), not `tests`, even though the folder name contains "test".
 * The `*.config.*` wiring pattern requires a segment BEFORE `.config.`, so
 * `src/config.ts` stays `core` (`server/docs/insights.md`, 2026-09-24).
 */
const RULES: { role: SmartDiffRole; test: (path: string) => boolean }[] = [
  {
    role: 'boilerplate',
    test: (path) => {
      const name = pathSegments(path).at(-1) ?? path;
      return BOILERPLATE_FILENAMES.has(name) || name.endsWith('.snap') || hasSegment(path, '__snapshots__');
    },
  },
  {
    role: 'tests',
    test: (path) =>
      pathSegments(path).some((s) => TEST_DIR_SEGMENTS.has(s.toLowerCase())) || TEST_FILE_RE.test(path),
  },
  {
    role: 'wiring',
    test: (path) => {
      const name = (pathSegments(path).at(-1) ?? path).toLowerCase();
      return (
        pathSegments(path).some((s) => WIRING_DIR_SEGMENTS.has(s.toLowerCase())) ||
        WIRING_FILENAMES.has(name) ||
        WIRING_CONFIG_FILE_RE.test(name) ||
        WIRING_TSCONFIG_RE.test(name) ||
        WIRING_ESLINTRC_RE.test(name) ||
        WIRING_ENV_RE.test(name) ||
        WIRING_COMPOSE_RE.test(name)
      );
    },
  },
  {
    role: 'docs',
    test: (path) => DOCS_FILE_RE.test(path) || hasSegment(path, 'docs'),
  },
];

/** Classify one diff path into a Smart Diff role. First matching rule wins; `core` is the fallback. */
export function classifyFile(path: string): SmartDiffRole {
  for (const rule of RULES) {
    if (rule.test(path)) return rule.role;
  }
  return 'core';
}

/**
 * SHA-1 hex of a file's patch text — the cache-invalidation key for its
 * `pr_file_summary` row (step 8), same idea as `pr_intent.headSha`/`bodySha`
 * (`reviews/intent-helpers.ts#bodyFingerprint`). A `null` patch (no diff text
 * available) hashes the empty string, same as an empty PR body there.
 */
export function patchSha(patch: string | null): string {
  return createHash('sha1').update(patch ?? '').digest('hex');
}

/**
 * A file's cached summary, or `null` when there is none or it has gone stale
 * (the patch it described no longer matches). Step 8 is droppable: with no
 * cache entries at all this always returns `null` and the tab stays fully
 * usable (`docs/specs/smart-diff.md`).
 */
function resolveSummary(file: StoredFile, summaries: Map<string, FileSummaryRecord>): string | null {
  const cached = summaries.get(file.path);
  if (!cached || cached.patchSha !== patchSha(file.patch)) return null;
  return cached.summary;
}

/**
 * Group a PR's files by role (Rule 1) and attach finding-line anchors (Rule 2),
 * purely. An anchor naming a path absent from `files` is dropped — there is no
 * card in the diff for it to attach to (the Findings tab still shows it).
 * `summaries` is optional and LLM-free to compute against — the GET route
 * passes cached rows; the POST route passes them back in after writing fresh
 * ones. Omitting it (or passing an empty map) leaves every
 * `pseudocode_summary` `null`, which is what makes step 8 droppable.
 */
export function buildSmartDiff(
  files: StoredFile[],
  anchors: FindingAnchor[],
  summaries: Map<string, FileSummaryRecord> = new Map(),
): SmartDiff {
  const linesByPath = new Map<string, Set<number>>();
  for (const a of anchors) {
    const set = linesByPath.get(a.file);
    if (set) set.add(a.startLine);
    else linesByPath.set(a.file, new Set([a.startLine]));
  }

  const buckets = new Map<SmartDiffRole, SmartDiffFile[]>();
  for (const file of files) {
    const role = classifyFile(file.path);
    const dto: SmartDiffFile = {
      path: file.path,
      pseudocode_summary: resolveSummary(file, summaries),
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: [...(linesByPath.get(file.path) ?? [])].sort((a, b) => a - b),
    };
    const bucket = buckets.get(role);
    if (bucket) bucket.push(dto);
    else buckets.set(role, [dto]);
  }

  const groups: SmartDiffGroup[] = ROLE_ORDER.filter((role) => buckets.has(role)).map((role) => ({
    role,
    files: buckets.get(role) ?? [],
  }));

  const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const tooBig = totalLines > SMART_DIFF_LARGE_LINES;

  return {
    groups,
    split_suggestion: {
      too_big: tooBig,
      total_lines: totalLines,
      proposed_splits: tooBig ? groups.map((g) => ({ name: g.role, files: g.files.map((f) => f.path) })) : [],
    },
  };
}
