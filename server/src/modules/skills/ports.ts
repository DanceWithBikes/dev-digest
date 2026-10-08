import type {
  SkillEvalResult,
  SkillEvalRunSummary,
} from '@devdigest/shared';
import type { SkillEvalRecord } from './eval-records.js';

/**
 * Interfaces the skill-evals use cases need, so `SkillEvalsService` can be unit
 * tested without a database or a records file. `compose.ts` wires the real ones.
 */

/** Where the eval records come from. */
export interface EvalRecordsSource {
  /** The whole records file as text, or null when it does not exist yet. */
  read(): Promise<string | null>;
}

/** Persistence for imported eval results. */
export interface SkillEvalStore {
  /** Idempotent upsert keyed by (skill, run, config, case); returns rows written. */
  upsertMany(workspaceId: string, skillId: string, records: SkillEvalRecord[]): Promise<number>;
  /** Newest candidate result per case. */
  latestPerCase(workspaceId: string, skillId: string): Promise<SkillEvalResult[]>;
  /** Per run and config, newest first. */
  runs(workspaceId: string, skillId: string, limit: number): Promise<SkillEvalRunSummary[]>;
}

/** The slice of the skills repository the evals use cases need. */
export interface SkillLookup {
  getById(workspaceId: string, id: string): Promise<{ id: string; name: string } | undefined>;
}
