import { z } from 'zod';

/**
 * Onboarding Tour: a five-section, stored tour of an imported repo (SPEC-02).
 * Index facts come from the repo index; the model only writes prose. Every
 * section carries its origin so the studio can tell a model write-up from a
 * deterministic skeleton.
 */

/** Section anchors, in the fixed display order (AC-2). */
export const ONBOARDING_SECTION_IDS = [
  'architecture',
  'critical-paths',
  'run-locally',
  'reading-path',
  'first-tasks',
] as const;
export const OnboardingSectionId = z.enum(ONBOARDING_SECTION_IDS);
export type OnboardingSectionId = z.infer<typeof OnboardingSectionId>;

export const SectionOrigin = z.enum(['model', 'skeleton']);
export type SectionOrigin = z.infer<typeof SectionOrigin>;

export const ONBOARDING_STATUSES = [
  'ready',
  'index_partial',
  'unsupported_language',
  'no_data',
  'index_failed',
  'llm_not_configured',
  'llm_failed',
  'timed_out',
] as const;
export const OnboardingStatus = z.enum(ONBOARDING_STATUSES);
export type OnboardingStatus = z.infer<typeof OnboardingStatus>;

export const OnboardingDirectory = z.object({
  path: z.string(),
  files: z.number().int(),
});
export type OnboardingDirectory = z.infer<typeof OnboardingDirectory>;

export const OnboardingDiagramNode = z.object({
  id: z.string(),
  label: z.string(),
});
export type OnboardingDiagramNode = z.infer<typeof OnboardingDiagramNode>;

export const OnboardingDiagramEdge = z.object({
  from: z.string(),
  to: z.string(),
  weight: z.number(),
});
export type OnboardingDiagramEdge = z.infer<typeof OnboardingDiagramEdge>;

export const ArchitectureSection = z.object({
  id: z.literal('architecture'),
  origin: SectionOrigin,
  /** Markdown; empty for a skeleton. */
  prose: z.string(),
  directories: z.array(OnboardingDirectory),
  diagram: z.object({
    nodes: z.array(OnboardingDiagramNode).max(12),
    edges: z.array(OnboardingDiagramEdge).max(20),
  }),
});
export type ArchitectureSection = z.infer<typeof ArchitectureSection>;

export const OnboardingPathEntry = z.object({
  path: z.string(),
  /** One line; may be empty. */
  reason: z.string(),
});
export type OnboardingPathEntry = z.infer<typeof OnboardingPathEntry>;

export const CriticalPathsSection = z.object({
  id: z.literal('critical-paths'),
  origin: SectionOrigin,
  entries: z.array(OnboardingPathEntry),
});
export type CriticalPathsSection = z.infer<typeof CriticalPathsSection>;

export const ReadingPathSection = z.object({
  id: z.literal('reading-path'),
  origin: SectionOrigin,
  entries: z.array(OnboardingPathEntry),
});
export type ReadingPathSection = z.infer<typeof ReadingPathSection>;

export const OnboardingRunStep = z.object({
  command: z.string(),
  source_path: z.string(),
  risky: z.boolean(),
});
export type OnboardingRunStep = z.infer<typeof OnboardingRunStep>;

export const RunLocallySection = z.object({
  id: z.literal('run-locally'),
  origin: SectionOrigin,
  steps: z.array(OnboardingRunStep),
});
export type RunLocallySection = z.infer<typeof RunLocallySection>;

export const OnboardingTask = z.object({
  title: z.string(),
  description: z.string(),
  paths: z.array(z.string()).min(1),
});
export type OnboardingTask = z.infer<typeof OnboardingTask>;

export const FirstTasksSection = z.object({
  id: z.literal('first-tasks'),
  origin: SectionOrigin,
  tasks: z.array(OnboardingTask),
});
export type FirstTasksSection = z.infer<typeof FirstTasksSection>;

export const OnboardingSection = z.discriminatedUnion('id', [
  ArchitectureSection,
  CriticalPathsSection,
  RunLocallySection,
  ReadingPathSection,
  FirstTasksSection,
]);
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const OnboardingTour = z.object({
  repo_full_name: z.string(),
  /** The indexed commit SHA the facts were collected from. */
  commit_sha: z.string(),
  generated_at: z.string(),
  status: OnboardingStatus,
  indexed_files: z.number().int(),
  candidate_files: z.number().int(),
  /** File facts dropped to fit the prompt budget. */
  dropped_file_facts: z.number().int(),
  /** The configured `onboarding` feature model, read at generation start. */
  provider: z.string(),
  model: z.string(),
  /** True once a model call was started (set just before the write). */
  model_call_made: z.boolean(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /** Null when unknown. */
  cost_usd: z.number().nullable(),
  /** Exactly five sections, in the AC-2 order. */
  sections: z.tuple([
    ArchitectureSection,
    CriticalPathsSection,
    RunLocallySection,
    ReadingPathSection,
    FirstTasksSection,
  ]),
});
export type OnboardingTour = z.infer<typeof OnboardingTour>;

export const OnboardingLastFailed = z.object({
  status: OnboardingStatus,
  at: z.string(),
});
export type OnboardingLastFailed = z.infer<typeof OnboardingLastFailed>;

export const OnboardingTourResponse = z.object({
  tour: OnboardingTour.nullable(),
  stale: z.boolean(),
  generating: z.boolean(),
  last_failed: OnboardingLastFailed.nullable(),
});
export type OnboardingTourResponse = z.infer<typeof OnboardingTourResponse>;

export const OnboardingGenerateAccepted = z.object({ generating: z.literal(true) });
export type OnboardingGenerateAccepted = z.infer<typeof OnboardingGenerateAccepted>;
