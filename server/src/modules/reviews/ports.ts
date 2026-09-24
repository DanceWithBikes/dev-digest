import type { Intent, IntentSource, RepoRef } from '@devdigest/shared';

/**
 * Ports for the Intent Layer (L03): what a source collector and a classifier
 * must do, named as interfaces so `service.ts` can be unit-tested with fakes
 * and no repo, key, GitHub token or Postgres. `compose.ts` is the only file
 * that knows which adapters satisfy them.
 *
 * Covered by `domain-files-are-pure` (`server/.dependency-cruiser.cjs:105`):
 * this file may import `@devdigest/shared` and `zod`, but never `Container`,
 * `src/platform/*` (except `errors.ts`) or `src/db/**`.
 */

/**
 * The minimal PR shape a collector needs — a structural subset of `PullRow`
 * (`db/rows.ts`), declared here rather than imported so this file stays free
 * of the data layer, the same way `helpers.ts`'s `LinkedSkill` does.
 */
export interface PrForIntent {
  id: string;
  number: number;
  title: string;
  body: string | null;
  /**
   * The PR's head commit. Needed because a linked spec is read at the PR's own
   * head, not off the clone's working tree — the clone only ever tracks the
   * default branch, so a spec the PR itself adds is not on disk yet
   * (`compose.ts#readSpecAtHead`).
   */
  headSha: string;
}

/**
 * One hunk header's numbers — never the diff body. Re-rendered as
 * `@@ -oldStart,oldLines +newStart,newLines @@` by `intent-sources.ts`
 * (`adapters/git/diff-parser.ts:46` discards the header text itself).
 */
export interface IntentHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface IntentDiffFile {
  path: string;
  hunks: IntentHunk[];
}

/**
 * The changed-file list the collector is allowed to see. Deliberately NOT
 * `UnifiedDiff` — that type's `.raw` holds the entire diff text
 * (`vendor/shared/adapters.ts:186`) and must never be reachable from the
 * classifier. A narrower shape makes that structural, not a discipline: a
 * `UnifiedDiff` is structurally assignable here (its `files[]` are a superset
 * of `IntentDiffFile[]`), but nothing in this module ever reads `.raw`.
 */
export interface IntentDiffFiles {
  files: IntentDiffFile[];
}

/** The linked issue, once resolved and capped for the prompt. */
export interface GatheredIssue {
  number: number;
  title: string;
  body: string | null;
}

/** The linked plan/spec, once resolved and capped for the prompt. */
export interface GatheredSpec {
  path: string;
  text: string;
}

/**
 * Everything a `classify()` call needs, plus the provenance of how it was
 * gathered. `attempts` becomes `sources[]` / `missing_context[]` on the
 * persisted record — derived by us, never model-reported (plan §1 decision).
 */
export interface GatheredIntentSources {
  pr: PrForIntent;
  issue: GatheredIssue | null;
  spec: GatheredSpec | null;
  files: IntentDiffFile[];
  commitMessages: string[];
  attempts: IntentSource[];
}

/**
 * Gathers evidence deterministically — no model decides what to read (plan
 * §1: "Sampling is model-free", the rule `conventions` already follows).
 * Every attempt (title/body/issue/spec/files/commits) is recorded in
 * `attempts`; `ok: false` becomes an entry in `missing_context[]`, never
 * invented. Every source is best-effort: `container.github()` and
 * `container.git` throw when unconfigured, and that must never fail the
 * caller.
 */
export interface IntentSourceCollector {
  collect(pr: PrForIntent, repo: RepoRef, diff: IntentDiffFiles): Promise<GatheredIntentSources>;
}

/** What the classifier returned, plus enough to bill the call to `pr_intent`. */
export interface ClassifyResult {
  intent: Intent;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
}

/** The one step that calls a model. */
export interface IntentClassifier {
  classify(workspaceId: string, sources: GatheredIntentSources): Promise<ClassifyResult>;
}
