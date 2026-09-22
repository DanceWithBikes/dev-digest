import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';
import type {
  AnalysisResult,
  ConventionAnalyst,
  ConventionSampler,
  ConventionSkillInput,
  ConventionSkillWriter,
  SampleFile,
} from './ports.js';
import { CandidatesEnvelope, SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import {
  CONFIG_FILES,
  EXTRACTION_MAX_TOKENS,
  EXTRACTION_TEMPERATURE,
  MAX_SAMPLE_FILE_CHARS,
  SAMPLE_FILE_COUNT,
} from './constants.js';

/**
 * Module composition root: the one place that knows both the container and the
 * concrete implementations of this module's ports, so `service.ts` can be
 * unit-tested with three small fakes and no repo, key or database.
 */

/**
 * Selects and reads the scan's sample. Pure selection logic — config files by
 * name, then the top-ranked source files from repo-intel. No model is consulted
 * about what to read, which is what makes two scans of the same commit
 * comparable.
 */
class RepoIntelSampler implements ConventionSampler {
  constructor(private container: Container, private repo: ConventionsRepository) {}

  async collect(workspaceId: string, repoId: string): Promise<SampleFile[]> {
    const ref = await this.repo.getRepoRef(workspaceId, repoId);
    if (!ref) throw new NotFoundError('Repository not found');

    const samples: SampleFile[] = [];
    for (const path of CONFIG_FILES) {
      const text = await this.read(ref, path);
      if (text) samples.push({ path, text, isConfig: true });
    }

    // Degrades to configs alone when the repo has not been indexed yet:
    // getConventionSamples returns [] rather than throwing.
    const ranked = await this.container.repoIntel.getConventionSamples(repoId, SAMPLE_FILE_COUNT);
    for (const path of ranked) {
      const text = await this.read(ref, path);
      if (text) samples.push({ path, text, isConfig: false });
    }
    return samples;
  }

  /** Read one file, or null when it is absent/binary/unreadable. */
  private async read(ref: { owner: string; name: string }, path: string): Promise<string | null> {
    try {
      const text = await this.container.git.readFile(ref, path);
      if (!text.trim()) return null;
      return text.slice(0, MAX_SAMPLE_FILE_CHARS);
    } catch {
      // A missing config file is the normal case, not an error: the list covers
      // several ecosystems and no project has all of them.
      return null;
    }
  }
}

/** The one step that calls a model. Its provider+model come from Settings. */
class LlmConventionAnalyst implements ConventionAnalyst {
  constructor(private container: Container) {}

  async propose(workspaceId: string, samples: SampleFile[]): Promise<AnalysisResult> {
    const choice = await this.container.featureModel(workspaceId, 'conventions');
    const llm = await this.container.llm(choice.provider);
    const result = await llm.completeStructured({
      model: choice.model,
      schema: CandidatesEnvelope,
      schemaName: 'convention_candidates',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(samples) },
      ],
      temperature: EXTRACTION_TEMPERATURE,
      maxTokens: EXTRACTION_MAX_TOKENS,
    });
    return { drafts: result.data.candidates, model: result.model };
  }
}

/**
 * Writes the assembled skill through the skills repository the container owns,
 * and links it to an agent through the agents repository — never by reaching
 * into either module's folder.
 */
class SkillsRepoWriter implements ConventionSkillWriter {
  constructor(private container: Container) {}

  async upsertByName(
    input: ConventionSkillInput,
  ): Promise<{ id: string; name: string; version: number }> {
    const { skillsRepo, agentsRepo } = this.container;

    const existing = (await skillsRepo.list(input.workspaceId)).find((s) => s.name === input.name);
    const row = existing
      ? await skillsRepo.update(input.workspaceId, existing.id, {
          description: input.description,
          body: input.body,
        })
      : await skillsRepo.insert({
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description,
          // `extracted` is the honest provenance: nobody typed this body, and a
          // reader of the Skills page should be able to tell it from a hand-written one.
          type: 'convention',
          source: 'extracted',
          body: input.body,
        });
    if (!row) throw new NotFoundError('Skill not found');

    if (input.agentId) {
      // Append rather than replace: the agent's existing skills keep their order,
      // and the conventions skill lands last, where the most specific rules belong.
      const linked = await agentsRepo.skillIdsForAgent(input.agentId);
      if (!linked.includes(row.id)) {
        await agentsRepo.linkSkill(input.agentId, row.id, linked.length);
      }
    }

    return { id: row.id, name: row.name, version: row.version };
  }
}

export function makeConventionsService(container: Container): ConventionsService {
  const repo = new ConventionsRepository(container.db);
  return new ConventionsService({
    repo,
    sampler: new RepoIntelSampler(container, repo),
    analyst: new LlmConventionAnalyst(container),
    skills: new SkillsRepoWriter(container),
  });
}
