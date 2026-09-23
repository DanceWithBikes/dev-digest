import type {
  ConventionCandidate,
  ConventionCandidatePatch,
  ConventionScan,
  ConventionSkillRequest,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { ConventionsRepository } from './repository.js';
import type { ConventionAnalyst, ConventionSampler, ConventionSkillWriter } from './ports.js';
import { assembleSkillBody, dropKnownRules, groundDrafts, toCandidateDto } from './helpers.js';
import {
  REPO_CONVENTIONS_SKILL_DESCRIPTION,
  REPO_CONVENTIONS_SKILL_NAME,
} from './constants.js';

/**
 * Conventions service — scan a repo for house rules, triage the candidates, and
 * assemble the accepted ones into a single skill.
 *
 * The scan is two steps on purpose, and only the second one calls a model:
 * choosing what to read is deterministic code (`ConventionSampler`), so the same
 * repo at the same commit always shows the model the same evidence. A scan that
 * picked its own sample with an LLM would not be reproducible, and its
 * confidence numbers would mean nothing.
 */

export interface ConventionsDeps {
  repo: ConventionsRepository;
  sampler: ConventionSampler;
  analyst: ConventionAnalyst;
  skills: ConventionSkillWriter;
}

export class ConventionsService {
  constructor(private deps: ConventionsDeps) {}

  /** Every candidate for a repo, in whatever state triage left it. */
  async list(workspaceId: string, repoId: string): Promise<ConventionCandidate[]> {
    const rows = await this.deps.repo.listForRepo(workspaceId, repoId);
    return rows.map(toCandidateDto);
  }

  /**
   * Run (or re-run) extraction. Re-running is additive: rules already on record
   * for this repo — accepted or rejected — are dropped before insert, so a second
   * scan proposes only what the first one missed and a rejection stays rejected.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScan> {
    const samples = await this.deps.sampler.collect(workspaceId, repoId);
    if (samples.length === 0) {
      throw new ValidationError(
        'Nothing to scan: the repository has no readable config or source files yet. Index or re-sync it first.',
      );
    }

    const { drafts, model } = await this.deps.analyst.propose(workspaceId, samples);

    const sampledPaths = samples.map((s) => s.path);
    const grounded = groundDrafts(drafts, sampledPaths);

    const existing = await this.deps.repo.listForRepo(workspaceId, repoId);
    const fresh = dropKnownRules(grounded, existing.map((r) => r.rule));

    const inserted = await this.deps.repo.insertMany(workspaceId, repoId, fresh);

    // Return the whole board, not just this scan's rows: the page shows one list
    // and re-fetching it separately would race with the insert above.
    const all = [...inserted, ...existing];
    return {
      candidates: all.map(toCandidateDto),
      sampled_files: sampledPaths,
      model,
    };
  }

  /** Accept, reject, or edit one candidate. */
  async patch(
    workspaceId: string,
    id: string,
    patch: ConventionCandidatePatch,
  ): Promise<ConventionCandidate | undefined> {
    const row = await this.deps.repo.update(workspaceId, id, patch);
    return row ? toCandidateDto(row) : undefined;
  }

  /**
   * Assemble the accepted candidates into the repo's conventions skill.
   *
   * The body the caller sends wins over the one this module would generate:
   * the modal shows the assembled markdown for editing, and silently discarding
   * those edits at save time would make the editor a lie. `previewBody` is how a
   * caller gets the generated starting point in the first place.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    req: ConventionSkillRequest,
  ): Promise<{ id: string; name: string; version: number }> {
    const accepted = await this.deps.repo.listAccepted(workspaceId, repoId);
    if (accepted.length === 0) {
      throw new ValidationError('Accept at least one candidate before creating a skill.');
    }
    return this.deps.skills.upsertByName({
      workspaceId,
      name: req.name,
      description: req.description,
      body: req.body,
      ...(req.agent_id !== undefined ? { agentId: req.agent_id } : {}),
    });
  }

  /** The skill the accepted candidates would produce right now, unsaved. */
  async previewBody(
    workspaceId: string,
    repoId: string,
  ): Promise<{ name: string; description: string; body: string; accepted: number }> {
    const accepted = await this.deps.repo.listAccepted(workspaceId, repoId);
    return {
      name: REPO_CONVENTIONS_SKILL_NAME,
      description: REPO_CONVENTIONS_SKILL_DESCRIPTION,
      body: assembleSkillBody(accepted.map(toCandidateDto)),
      accepted: accepted.length,
    };
  }
}
