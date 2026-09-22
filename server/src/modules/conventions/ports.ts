import type { ConventionDraft } from '@devdigest/shared';

/**
 * The outward-facing capabilities the conventions service needs, named as
 * interfaces so the service can be unit-tested without a repo on disk, an LLM
 * key or a Postgres. `compose.ts` is the only file that knows which adapters
 * satisfy them.
 */

/** One file handed to the model, already read and truncated. */
export interface SampleFile {
  path: string;
  text: string;
  /** True for linter/formatter/tsconfig files — stated rules, not inferred ones. */
  isConfig: boolean;
}

/**
 * Chooses and reads the files a scan looks at. Deliberately a port of its own:
 * selection is the half of extraction that must stay model-free, and giving it
 * an interface is what keeps that boundary visible instead of conventional.
 */
export interface ConventionSampler {
  collect(workspaceId: string, repoId: string): Promise<SampleFile[]>;
}

/** What the model returned for one sample, plus which model said it. */
export interface AnalysisResult {
  drafts: ConventionDraft[];
  model: string;
}

/** Turns a sample into candidate rules. The only step that calls an LLM. */
export interface ConventionAnalyst {
  propose(workspaceId: string, samples: SampleFile[]): Promise<AnalysisResult>;
}

/** Identity of the skill a set of accepted candidates is written into. */
export interface ConventionSkillInput {
  workspaceId: string;
  name: string;
  description: string;
  body: string;
  /** Agent to attach the skill to; omitted = leave it unattached. */
  agentId?: string;
}

/**
 * Writes the assembled skill. The `skills` table belongs to the skills module,
 * so this module reaches it through a port rather than a second repository —
 * one owner per table, even when two features write to it.
 */
export interface ConventionSkillWriter {
  upsertByName(input: ConventionSkillInput): Promise<{ id: string; name: string; version: number }>;
}
