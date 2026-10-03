import type {
  ArchitectureSection,
  CriticalPathsSection,
  FirstTasksSection,
  OnboardingDirectory,
  OnboardingDiagramEdge,
  OnboardingDiagramNode,
  OnboardingStatus,
  OnboardingTour,
  OnboardingTask,
  OnboardingRunStep,
  ReadingPathSection,
  RunLocallySection,
} from '@devdigest/shared';
import { MAX_FIRST_TASKS, MAX_RUN_STEPS } from './constants.js';

/**
 * The rules of the Onboarding Tour: statuses, skeletons and grounding of the
 * model's output. Pure — no I/O, no clock.
 */

export type TourSections = OnboardingTour['sections'];

// ---- Facts -----------------------------------------------------------------

export interface FileFact {
  path: string;
  rank: number;
  endpoints: string[];
}

export interface RunCommand {
  command: string;
  sourcePath: string;
  risky: boolean;
}

/** Everything the tour is built from, collected without a model (AC-15, AC-17). */
export interface Facts {
  repoFullName: string;
  commitSha: string;
  indexedFiles: number;
  candidateFiles: number;
  /** Highest-ranked first. */
  fileFacts: FileFact[];
  endpoints: Array<{ file: string; endpoint: string }>;
  runCommands: RunCommand[];
  stack: string[];
  tree: string[];
  readme: { path: string; excerpt: string } | null;
  /** AC-29: at most 8 distinct files, in chain order. */
  criticalPaths: string[];
  /** AC-27/AC-28: computed order. */
  readingPath: string[];
  directories: OnboardingDirectory[];
  diagram: { nodes: OnboardingDiagramNode[]; edges: OnboardingDiagramEdge[] };
}

/** Structural twin of the model-output schema in `prompt.ts`. */
export interface ModelOutput {
  architecture: string;
  critical_paths: Array<{ path: string; reason: string }>;
  reading_path: Array<{ path: string; reason: string }>;
  run_steps: string[];
  first_tasks: Array<{ title: string; description: string; paths: string[] }>;
}

// ---- Status (AC-51) --------------------------------------------------------

export interface StatusSignals {
  cloneMissing: boolean;
  indexStateMissing: boolean;
  indexReadFailed: boolean;
  indexStatus?: 'full' | 'partial' | 'degraded' | 'failed';
  candidateFiles: number;
  rankedFiles: number;
  boundedFiles: number;
  llmConfigured: boolean;
  timedOut: boolean;
  llmFailed: boolean;
  allSkeleton: boolean;
}

/** The first status that applies, in the AC-51 order. */
export function resolveStatus(s: StatusSignals): OnboardingStatus {
  if (s.cloneMissing || s.indexStateMissing) return 'no_data';
  if (s.indexReadFailed || s.indexStatus === 'failed') return 'index_failed';
  if (!s.llmConfigured) return 'llm_not_configured';
  if (s.timedOut) return 'timed_out';
  if (s.llmFailed || s.allSkeleton) return 'llm_failed';
  if (s.candidateFiles === 0) return 'unsupported_language';
  if (
    s.indexStatus === 'partial' ||
    s.indexStatus === 'degraded' ||
    s.boundedFiles > 0 ||
    (s.candidateFiles > 0 && s.rankedFiles === 0)
  ) {
    return 'index_partial';
  }
  return 'ready';
}

const FAILED_STATUSES: readonly OnboardingStatus[] = [
  'no_data',
  'index_failed',
  'llm_not_configured',
  'llm_failed',
  'timed_out',
];
const KEPT_STATUSES: readonly OnboardingStatus[] = ['ready', 'index_partial', 'unsupported_language'];

/** AC-53: a failed generation never replaces a usable stored tour. */
export function keepsStoredTour(
  newStatus: OnboardingStatus,
  storedStatus: OnboardingStatus | null,
): boolean {
  return FAILED_STATUSES.includes(newStatus) && storedStatus !== null && KEPT_STATUSES.includes(storedStatus);
}

// ---- Skeletons (AC-55..AC-59) ---------------------------------------------

const skeletonArchitecture = (facts: Facts | null): ArchitectureSection => ({
  id: 'architecture',
  origin: 'skeleton',
  prose: '',
  directories: facts?.directories ?? [],
  diagram: facts?.diagram ?? { nodes: [], edges: [] },
});

const skeletonPaths = <T extends 'critical-paths' | 'reading-path'>(
  id: T,
  paths: string[],
): { id: T; origin: 'skeleton'; entries: Array<{ path: string; reason: string }> } => ({
  id,
  origin: 'skeleton',
  entries: paths.map((path) => ({ path, reason: '' })),
});

const toRunSteps = (commands: RunCommand[]): OnboardingRunStep[] =>
  commands.slice(0, MAX_RUN_STEPS).map((c) => ({
    command: c.command,
    source_path: c.sourcePath,
    risky: c.risky,
  }));

/**
 * The deterministic form of all five sections. `facts` null means nothing was
 * collected (empty sections). `unsupported` blanks the two path sections (AC-49).
 */
export function skeletonSections(facts: Facts | null, unsupported = false): TourSections {
  const paths = facts && !unsupported ? facts : null;
  return [
    skeletonArchitecture(facts),
    skeletonPaths('critical-paths', paths?.criticalPaths ?? []) as CriticalPathsSection,
    { id: 'run-locally', origin: 'skeleton', steps: toRunSteps(facts?.runCommands ?? []) },
    skeletonPaths('reading-path', paths?.readingPath ?? []) as ReadingPathSection,
    { id: 'first-tasks', origin: 'skeleton', tasks: [] },
  ];
}

// ---- Grounding (AC-31, AC-43..AC-47) --------------------------------------

/** One line: collapse whitespace, so a reason cannot add Markdown blocks. */
const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** Every path a first task may cite (AC-44). */
export function citablePaths(facts: Facts): Set<string> {
  const out = new Set<string>();
  for (const f of facts.fileFacts) out.add(f.path);
  for (const p of facts.criticalPaths) out.add(p);
  for (const p of facts.readingPath) out.add(p);
  for (const e of facts.endpoints) out.add(e.file);
  for (const c of facts.runCommands) out.add(c.sourcePath);
  if (facts.readme) out.add(facts.readme.path);
  return out;
}

function groundPaths<T extends 'critical-paths' | 'reading-path'>(
  id: T,
  computed: string[],
  model: Array<{ path: string; reason: string }>,
): { id: T; origin: 'model' | 'skeleton'; entries: Array<{ path: string; reason: string }> } {
  const reasons = new Map<string, string>();
  for (const m of model) {
    if (computed.includes(m.path) && !reasons.has(m.path)) reasons.set(m.path, oneLine(m.reason));
  }
  if (reasons.size === 0) return skeletonPaths(id, computed);
  return {
    id,
    origin: 'model',
    entries: computed.map((path) => ({ path, reason: reasons.get(path) ?? '' })),
  };
}

export interface GroundedTour {
  sections: TourSections;
  /** AC-48: every section the model was permitted to fill fell back to a skeleton. */
  allSkeleton: boolean;
}

/**
 * Keeps the computed files and order, and takes only prose and reasons from
 * the model. A section with nothing to ground is vacuous: it is stored as a
 * skeleton and does not count towards `allSkeleton`.
 */
export function groundModelSections(
  facts: Facts,
  model: ModelOutput,
  opts: { unsupported: boolean },
): GroundedTour {
  const permitted: Array<'model' | 'skeleton'> = [];

  const prose = model.architecture.trim();
  const architecture: ArchitectureSection =
    prose.length > 0
      ? { ...skeletonArchitecture(facts), origin: 'model', prose }
      : skeletonArchitecture(facts);
  permitted.push(architecture.origin);

  let critical = skeletonPaths('critical-paths', opts.unsupported ? [] : facts.criticalPaths) as CriticalPathsSection;
  let reading = skeletonPaths('reading-path', opts.unsupported ? [] : facts.readingPath) as ReadingPathSection;
  if (!opts.unsupported) {
    if (facts.criticalPaths.length > 0) {
      critical = groundPaths('critical-paths', facts.criticalPaths, model.critical_paths);
      permitted.push(critical.origin);
    }
    if (facts.readingPath.length > 0) {
      reading = groundPaths('reading-path', facts.readingPath, model.reading_path);
      permitted.push(reading.origin);
    }
  }

  let run: RunLocallySection = { id: 'run-locally', origin: 'skeleton', steps: toRunSteps(facts.runCommands) };
  if (facts.runCommands.length > 0) {
    const byCommand = new Map(facts.runCommands.map((c) => [c.command, c]));
    const seen = new Set<string>();
    const steps: OnboardingRunStep[] = [];
    for (const raw of model.run_steps) {
      const fact = byCommand.get(raw);
      if (!fact || seen.has(raw)) continue;
      seen.add(raw);
      steps.push({ command: fact.command, source_path: fact.sourcePath, risky: fact.risky });
      if (steps.length >= MAX_RUN_STEPS) break;
    }
    if (steps.length > 0) run = { id: 'run-locally', origin: 'model', steps };
    permitted.push(run.origin);
  }

  let tasksSection: FirstTasksSection = { id: 'first-tasks', origin: 'skeleton', tasks: [] };
  const citable = citablePaths(facts);
  if (citable.size > 0) {
    const tasks: OnboardingTask[] = [];
    for (const t of model.first_tasks) {
      const paths = [...new Set(t.paths.filter((p) => citable.has(p)))];
      if (paths.length === 0) continue;
      tasks.push({ title: oneLine(t.title), description: t.description.trim(), paths });
      if (tasks.length >= MAX_FIRST_TASKS) break;
    }
    if (tasks.length > 0) tasksSection = { id: 'first-tasks', origin: 'model', tasks };
    permitted.push(tasksSection.origin);
  }

  return {
    sections: [architecture, critical, run, reading, tasksSection],
    allSkeleton: permitted.every((o) => o === 'skeleton'),
  };
}
