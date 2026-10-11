import { isMap, isSeq, parseDocument, visit } from 'yaml';
import type { Document, Scalar } from 'yaml';
import type { CiResultArtifact, CiRunStatus } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  AGENTS_DIR,
  BASE_SHA_REF,
  CI_BRANCH,
  MEMORY_PATH,
  RUNNER_COMMAND,
  RUNNER_PACKAGE_PATH,
  RUNNER_PATH,
  SAME_REPO_GUARD,
  SKILLS_DIR,
  WORKFLOW_PATH,
} from './constants.js';

/** One file of the CI bundle. */
export interface BundleFile {
  path: string;
  contents: string;
  editable: boolean;
}

export type PostAs = 'github_review' | 'pr_comment' | 'none';
export type Trigger = 'opened' | 'synchronize' | 'reopened';
export type InstallState = 'pr_open' | 'active' | 'pr_closed';

export interface RepoRecord {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export interface InstallationRecord {
  id: string;
  agentId: string;
  agentName: string;
  /** The agent's current version (for `behind`). */
  currentAgentVersion: number;
  repo: string;
  githubRepoId: number;
  state: InstallState;
  agentVersion: number;
  runnerVersion: string;
  prUrl: string | null;
  prNumber: number | null;
  installedAt: Date;
  updatedAt: Date;
  latestRun: { status: CiRunStatus; ranAt: Date } | null;
}

export interface UpsertInstallation {
  workspaceId: string;
  /** Pre-computed so preview and install agree on the AC-29 id for a new row. */
  id: string;
  agentId: string;
  repoId: string;
  repo: string;
  githubRepoId: number;
  agentVersion: number;
  runnerVersion: string;
  prUrl: string;
  prNumber: number | null;
}

export interface CiRunInsert {
  workspaceId: string;
  installationId: string;
  agentId: string;
  repo: string;
  /** Linked studio PR, or null when the PR is not imported (AC-55, AC-56). */
  prNumber: number | null;
  headSha: string | null;
  githubRunId: number;
  runAttempt: number;
  artifactId: number | null;
  jobUrl: string;
  ranAt: Date;
  status: CiRunStatus;
  model: string | null;
  durationMs: number | null;
  costUsd: number | null;
  findingsCount: number | null;
  blockers: number | null;
}

export interface CiRunRow {
  id: string;
  repository: string;
  prNumber: number | null;
  agent: string | null;
  findingsCount: number | null;
  blockers: number | null;
  costUsd: number | null;
  durationMs: number | null;
  headSha: string | null;
  jobUrl: string | null;
  status: CiRunStatus;
  ranAt: Date;
}

export interface RunVerification {
  field: string;
}

/** The slice of GitHub's run metadata that verification compares against. */
export interface VerifiableRun {
  head_sha: string;
  head_branch: string | null;
  repository: { id: number; full_name: string };
  pull_numbers: number[];
}

/** The installation identity an artifact must match (AC-51). */
export interface VerifiableInstallation {
  id: string;
  repo: string;
  githubRepoId: number;
}

/** The slice of a fetched PR used to tie an artifact to a run whose `pull_numbers` GitHub emptied. */
export interface VerifiablePull {
  head_ref: string;
  head_sha: string;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** `owner/repo[/path]@<40-hex sha>`: local (`./`) and `docker://` uses never match. */
const PINNED_USES = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[^@\s]+)?@[0-9a-f]{40}$/;

/** Job keys an edited workflow may carry (no `uses`, `container`, `services`, `needs`, `strategy`...). */
const ALLOWED_JOB_KEYS = new Set([
  'name',
  'runs-on',
  'if',
  'steps',
  'timeout-minutes',
  'env',
  'defaults',
  'concurrency',
  'continue-on-error',
  'permissions',
]);

/**
 * The only `${{ }}` expressions the generator emits (see `buildWorkflowYaml`);
 * anything else (PR title, body, head sha...) in an edited workflow could be
 * injected into a shell step or the checkout ref.
 */
const ALLOWED_EXPRESSIONS = new Set([
  SAME_REPO_GUARD,
  BASE_SHA_REF.replace(/^\$\{\{\s*|\s*\}\}$/g, ''),
  'secrets.OPENROUTER_API_KEY',
  'github.token',
  'secrets.GITHUB_TOKEN',
  'always()',
]);

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function runsRunner(step: Json): boolean {
  return typeof step.run === 'string' && step.run.includes(RUNNER_COMMAND);
}

function samePerms(p: unknown): boolean {
  if (!isObj(p)) return false;
  const keys = Object.keys(p);
  return keys.length === 2 && p['contents'] === 'read' && p['pull-requests'] === 'write';
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** `${{ expr }}` or bare `expr` → normalised `expr`. */
function unwrapExpression(s: string): string {
  const m = /^\$\{\{([\s\S]*)\}\}$/.exec(s.trim());
  return norm(m ? m[1]! : s);
}

/** Every string (keys and values) anywhere in a parsed YAML value. */
function* strings(v: unknown): Generator<string> {
  if (typeof v === 'string') yield v;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x);
  else if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      yield k;
      yield* strings(x);
    }
  }
}

function assertExpressionsAllowed(doc: unknown): void {
  for (const s of strings(doc)) {
    const opened = s.split('${{').length - 1;
    let closed = 0;
    for (const m of s.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
      closed += 1;
      if (!ALLOWED_EXPRESSIONS.has(norm(m[1]!))) {
        throw new ValidationError(`Expression "\${{ ${norm(m[1]!)} }}" is not allowed in the workflow`);
      }
    }
    if (opened !== closed) throw new ValidationError('Workflow contains a malformed ${{ }} expression');
  }
}

function parseStrict(text: string): Document.Parsed {
  let doc: Document.Parsed;
  try {
    doc = parseDocument(text);
  } catch (err) {
    throw new ValidationError(`Workflow is not valid YAML: ${(err as Error).message.split('\n')[0]}`);
  }
  if (doc.errors.length > 0) {
    throw new ValidationError(`Workflow is not valid YAML: ${doc.errors[0]!.message.split('\n')[0]}`);
  }
  return doc;
}

/**
 * Validate a (possibly user-edited) workflow as an allowlist of what the
 * generator itself emits. Throws a 422 `ValidationError` for the first
 * violation (AC-30 to AC-34, AC-131).
 */
export function validateEditedWorkflow(text: string): void {
  const parsed = parseStrict(text);
  visit(parsed, {
    Alias() {
      throw new ValidationError('YAML aliases and anchors are not allowed in the workflow');
    },
  });
  const doc: unknown = parsed.toJS();
  if (!isObj(doc)) throw new ValidationError('Workflow must be a YAML mapping');

  if (!samePerms(doc.permissions)) {
    throw new ValidationError(
      'Workflow permissions must be exactly { contents: read, pull-requests: write }',
    );
  }

  const on = doc.on;
  if (!isObj(on) || Object.keys(on).length !== 1 || !('pull_request' in on)) {
    throw new ValidationError('Workflow must be triggered by pull_request only');
  }

  assertExpressionsAllowed(doc);

  const jobs = isObj(doc.jobs) ? Object.values(doc.jobs) : [];
  if (jobs.length === 0) throw new ValidationError('Workflow must define a job');

  let runnerJobOk = false;
  for (const job of jobs) {
    if (!isObj(job)) throw new ValidationError('Workflow job is malformed');
    for (const key of Object.keys(job)) {
      if (!ALLOWED_JOB_KEYS.has(key)) throw new ValidationError(`Job key "${key}" is not allowed`);
    }
    if (job.permissions !== undefined && !samePerms(job.permissions)) {
      throw new ValidationError('A job grants more permissions than contents: read, pull-requests: write');
    }
    if (typeof job.if !== 'string' || unwrapExpression(job.if) !== SAME_REPO_GUARD) {
      throw new ValidationError('Every job must keep the same-repo guard (fork PRs must not run)');
    }
    if (!Array.isArray(job.steps)) throw new ValidationError('Every job must define steps');

    let sawBaseCheckout = false;
    let sawRunner = false;
    for (const step of job.steps) {
      if (!isObj(step)) throw new ValidationError('Workflow step is malformed');
      if (typeof step.uses === 'string') {
        if (!PINNED_USES.test(step.uses)) {
          throw new ValidationError(`Action "${step.uses}" must be pinned to a full commit SHA`);
        }
        if (step.uses.split('@')[0]!.toLowerCase() === 'actions/checkout') {
          const w = isObj(step.with) ? step.with : {};
          if (typeof w.ref !== 'string' || norm(w.ref) !== BASE_SHA_REF || w.repository !== undefined) {
            throw new ValidationError('The checkout step must check out the base commit, never the PR head or merge');
          }
          if (!sawRunner) sawBaseCheckout = true;
        }
      } else if (step.uses !== undefined) {
        throw new ValidationError('Step "uses" must be a string');
      }
      if (runsRunner(step)) sawRunner = true;
    }
    if (sawRunner && sawBaseCheckout) runnerJobOk = true;
  }
  if (!runnerJobOk) {
    throw new ValidationError(
      `One job must check out the base commit (actions/checkout with the base sha) and then run the review step (${RUNNER_COMMAND})`,
    );
  }
}

/**
 * Re-apply the Configure choices to a workflow text (AC-135 to AC-137): only
 * `on.pull_request.types` and the runner step's `DEVDIGEST_POST_AS` /
 * `DEVDIGEST_INSTALLATION_ID` change; everything else, comments included, is
 * preserved. Default YAML 1.2 core schema (never 1.1, where `on` parses to
 * boolean true).
 */
export function patchWorkflow(
  text: string,
  choices: { triggers: Trigger[]; postAs: PostAs; installationId: string },
): string {
  const doc = parseStrict(text);
  try {
    doc.setIn(['on', 'pull_request', 'types'], choices.triggers);
    const jobs = doc.get('jobs');
    if (isMap(jobs)) {
      for (const pair of jobs.items) {
        const steps = isMap(pair.value) ? pair.value.get('steps') : undefined;
        if (!isSeq(steps)) continue;
        steps.items.forEach((step, i) => {
          if (!isMap(step)) return;
          const run = step.get('run');
          if (typeof run !== 'string' || !run.includes(RUNNER_COMMAND)) return;
          const path = ['jobs', (pair.key as Scalar).value, 'steps', i, 'env'];
          doc.setIn([...path, 'DEVDIGEST_POST_AS'], choices.postAs);
          doc.setIn([...path, 'DEVDIGEST_INSTALLATION_ID'], choices.installationId);
        });
      }
    }
    return doc.toString();
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(`Workflow could not be patched: ${(err as Error).message.split('\n')[0]}`);
  }
}

/** Generated paths the wizard may never edit: everything except workflow and skills (AC-35). */
export function validateEdits(
  edits: { path: string; contents: string }[],
  files: BundleFile[],
): void {
  const editable = new Set(files.filter((f) => f.editable).map((f) => f.path));
  const seen = new Set<string>();
  for (const e of edits) {
    if (seen.has(e.path)) throw new ValidationError(`Duplicate edit for ${e.path}`);
    seen.add(e.path);
    if (!editable.has(e.path)) {
      const generated = files.some((f) => f.path === e.path);
      throw new ValidationError(
        generated ? `${e.path} is not editable` : `${e.path} is not part of the bundle`,
      );
    }
  }
}

export function statusFor(artifact: Pick<CiResultArtifact, 'findings_count'>): CiRunStatus {
  return artifact.findings_count === 0 ? 'no_findings' : 'succeeded';
}

export function isBehind(currentAgentVersion: number, installedVersion: number): boolean {
  return currentAgentVersion > installedVersion;
}

/**
 * Existing generated-kind files that the new bundle no longer contains (AC-139).
 * Only agent manifests and skill files — never workflow, runner or anything else.
 */
export function stalePaths(existing: string[], generated: string[]): string[] {
  const keep = new Set(generated);
  return existing.filter(
    (p) =>
      !keep.has(p) &&
      ((p.startsWith(AGENTS_DIR) && /^\.devdigest\/agents\/[^/]+\.yaml$/.test(p)) ||
        (p.startsWith(SKILLS_DIR) && /^\.devdigest\/skills\/[^/]+\.md$/.test(p))),
  );
}

/** Ingest filter: the export PR's own run and fork-skipped runs are not CI reviews (AC-140, AC-141). */
export function shouldIngest(run: { head_branch: string | null; conclusion: string | null }): boolean {
  return run.head_branch !== CI_BRANCH && run.conclusion !== 'skipped';
}

/** True when the PR is the one the run was triggered by (same head branch or head sha). */
export function pullMatchesRun(pull: VerifiablePull, run: Pick<VerifiableRun, 'head_sha' | 'head_branch'>): boolean {
  return (run.head_branch !== null && pull.head_ref === run.head_branch) || pull.head_sha === run.head_sha;
}

/**
 * Compare the artifact's identity fields with GitHub's own metadata and the
 * installation (AC-51). Returns the first mismatching field, or null. Missing =
 * mismatch. When GitHub emptied the run's `pull_numbers` (merged PR, deleted
 * branch), the caller passes `pullVerified` = the PR was fetched from the
 * installation's repo and matches the run.
 */
export function verifyArtifact(
  artifact: CiResultArtifact,
  run: VerifiableRun,
  inst: VerifiableInstallation,
  pullVerified = false,
): RunVerification | null {
  if (artifact.repository !== run.repository.full_name) return { field: 'repository' };
  if (artifact.repository_id !== run.repository.id) return { field: 'repository_id' };
  if (artifact.repository !== inst.repo) return { field: 'repository' };
  if (artifact.repository_id !== inst.githubRepoId) return { field: 'repository_id' };
  if (artifact.head_sha !== run.head_sha) return { field: 'head_sha' };
  if (artifact.pr_number == null) return { field: 'pr_number' };
  const listed = run.pull_numbers.length > 0 && run.pull_numbers.includes(artifact.pr_number);
  if (!listed && !(run.pull_numbers.length === 0 && pullVerified)) return { field: 'pr_number' };
  if (artifact.installation_id !== inst.id) return { field: 'installation_id' };
  return null;
}

/** The unchangeable paths, for reference by tests and the service. */
export const GENERATED_FIXED_PATHS = [MEMORY_PATH, RUNNER_PATH, RUNNER_PACKAGE_PATH, WORKFLOW_PATH];
