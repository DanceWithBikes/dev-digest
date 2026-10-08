import type { SkillEvalsResponse, SkillEvalSyncResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { EvalRecordsSource, SkillEvalStore, SkillLookup } from './ports.js';
import { recordsForSkill } from './eval-records.js';
import { EVAL_RUNS_LIMIT } from './constants.js';

export interface SkillEvalsDeps {
  skills: SkillLookup;
  store: SkillEvalStore;
  source: EvalRecordsSource;
}

/**
 * Skill eval results: import from the `evals/` package's records file, and read
 * them back for the Evals tab. Both operations are workspace-scoped through the
 * skill lookup, so one tenant can't read or write another's results.
 */
export class SkillEvalsService {
  constructor(private deps: SkillEvalsDeps) {}

  /**
   * Import the records that belong to this skill (matched by the `skill:<name>`
   * segment of the node id). A missing file is "nothing to import", not an error.
   * `skipped` counts malformed lines, not other suites' records.
   */
  async sync(workspaceId: string, skillId: string): Promise<SkillEvalSyncResponse> {
    const skill = await this.requireSkill(workspaceId, skillId);
    const text = await this.deps.source.read();
    if (text === null) return { imported: 0, skipped: 0 };

    const { records, skipped } = recordsForSkill(text, skill.name);
    const imported =
      records.length > 0 ? await this.deps.store.upsertMany(workspaceId, skill.id, records) : 0;
    return { imported, skipped };
  }

  async get(workspaceId: string, skillId: string): Promise<SkillEvalsResponse> {
    await this.requireSkill(workspaceId, skillId);
    const [latest, runs] = await Promise.all([
      this.deps.store.latestPerCase(workspaceId, skillId),
      this.deps.store.runs(workspaceId, skillId, EVAL_RUNS_LIMIT),
    ]);

    const newest = latest.reduce<(typeof latest)[number] | undefined>(
      (best, r) => (!best || r.ran_at > best.ran_at ? r : best),
      undefined,
    );
    return {
      summary: {
        total: latest.length,
        passing: latest.filter((r) => r.outcome).length,
        latest_run_id: newest?.run_id ?? null,
        latest_ran_at: newest?.ran_at ?? null,
      },
      latest,
      runs,
    };
  }

  private async requireSkill(workspaceId: string, skillId: string) {
    const skill = await this.deps.skills.getById(workspaceId, skillId);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  }
}
