import type { Skill, SkillDraft, SkillSource, SkillType, SkillVersion } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import type { SkillsRepository } from './repository.js';
import {
  extractSkillMarkdownFromZip,
  parseSkillMarkdown,
  toSkillDto,
  toSkillVersionDto,
} from './helpers.js';
import { DEFAULT_SKILL_SOURCE } from './constants.js';

/**
 * Skills service. A skill is a named, reusable markdown instruction block; the
 * agents module attaches it to an agent, and the review run concatenates the
 * attached-and-enabled bodies into the prompt's `## Skills / rules` section.
 *
 * Takes the repository, not the `Container` (see AGENTS.md) — the module has no
 * adapters, so there is nothing else to resolve.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source?: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/** What POST /skills/parse accepts: a markdown file, or a base64 `.zip`. */
export interface ParseSkillInput {
  content?: string | undefined;
  archive_b64?: string | undefined;
  filename?: string | undefined;
}

export class SkillsService {
  constructor(private repo: SkillsRepository) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    const counts = await this.repo.countAgentsPerSkill(workspaceId);
    return rows.map((row) => toSkillDto(row, counts.get(row.id) ?? 0));
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const counts = await this.repo.countAgentsPerSkill(workspaceId, [id]);
    return toSkillDto(row, counts.get(id) ?? 0);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? DEFAULT_SKILL_SOURCE,
      body: input.body,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    // A skill that did not exist a moment ago cannot be attached to an agent yet.
    return toSkillDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    if (!row) return undefined;
    const counts = await this.repo.countAgentsPerSkill(workspaceId, [id]);
    return toSkillDto(row, counts.get(id) ?? 0);
  }

  /** Delete a skill; every agent_skills link to it cascades away. */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  /**
   * Body history for a skill, newest first. Workspace-scoped: undefined when the
   * skill isn't in this workspace (the route maps that to 404) so snapshots
   * can't be read across tenants.
   */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Roll a skill's body back to an earlier snapshot.
   *
   * Restoring goes through the normal update path, so it is an ordinary new
   * edit: restoring v1 while on v5 writes v6 carrying v1's body. History is
   * append-only — rewriting v5 back into v1 would destroy the very snapshot the
   * user might want to come back to, and would make the version number stop
   * meaning "the nth body this skill ever had".
   *
   * Restoring the body the skill already has is a no-op: `isBodyChange` sees no
   * diff, so no duplicate version is recorded.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const skill = await this.repo.getById(workspaceId, id);
    if (!skill) throw new NotFoundError('Skill not found');

    // Looked up only after the workspace check above, so a version cannot be
    // probed — let alone restored — across tenants.
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) throw new NotFoundError(`Skill has no version ${version}`);

    const row = await this.repo.update(workspaceId, id, { body: snapshot.body });
    if (!row) throw new NotFoundError('Skill not found');
    const counts = await this.repo.countAgentsPerSkill(workspaceId, [id]);
    return toSkillDto(row, counts.get(id) ?? 0);
  }

  /**
   * Parse an uploaded markdown file — or the markdown inside an uploaded `.zip`
   * — into an unsaved draft for the import preview. Deliberately writes nothing:
   * saving is a separate `create` call after the user confirms, so "saved only
   * after confirmation" is enforced by the API shape rather than by the UI.
   *
   * The contract guarantees exactly one of `content` / `archive_b64` is set, so
   * this branches rather than re-validates (parse at the edge, trust inside).
   */
  parse(input: ParseSkillInput): SkillDraft {
    if (input.archive_b64 !== undefined) {
      const entry = extractSkillMarkdownFromZip(Buffer.from(input.archive_b64, 'base64'));
      // The uploaded archive's own name beats the entry path as a name fallback:
      // `my-rules.zip` says more about the skill than `SKILL.md` does.
      return parseSkillMarkdown(entry.content, input.filename ?? entry.path);
    }
    return parseSkillMarkdown(input.content ?? '', input.filename);
  }
}
