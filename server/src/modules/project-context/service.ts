import type {
  AgentContextSelection,
  ContextListing,
  ContextPreview,
  ContextSelection,
} from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  DEFAULT_SEARCH_ROOTS,
  MAX_ROOTS,
  MAX_SELECTED_PATHS,
  SCAN_READ_CONCURRENCY,
} from './constants.js';
import {
  compileRoots,
  estimateTokens,
  flagMissing,
  isExcluded,
  isMarkdown,
  matchesCompiled,
  matchesRoots,
  toListing,
  uniqueSorted,
  validateRelativePath,
  validateRoot,
  type ScannedFile,
} from './helpers.js';
import type { ContextFileSource, ContextRepository, RepoCoords } from './ports.js';

export interface ProjectContextServiceDeps {
  repo: ContextRepository;
  files: ContextFileSource;
  now: () => Date;
}

/**
 * Project Context use cases. Nothing is cached or indexed: every listing scans
 * the clone live. Roots govern what is listed and previewed, never what an
 * attachment may name or what a run reads.
 */
export class ProjectContextService {
  constructor(private deps: ProjectContextServiceDeps) {}

  /** Listing and re-index are the same live scan; the studio calls them from different buttons. */
  list(workspaceId: string, repoId: string): Promise<ContextListing> {
    return this.scan(workspaceId, repoId);
  }

  reindex(workspaceId: string, repoId: string): Promise<ContextListing> {
    return this.scan(workspaceId, repoId);
  }

  async preview(workspaceId: string, repoId: string, path: string): Promise<ContextPreview> {
    const problem = validateRelativePath(path);
    if (problem) throw new ValidationError(problem);
    const ref = await this.requireRepo(workspaceId, repoId);
    const { roots } = await this.rootsFor(workspaceId, repoId);
    if (isExcluded(path) || !isMarkdown(path) || !matchesRoots(path, roots)) {
      throw new ValidationError('path is outside the repo search roots');
    }
    const present = await this.presentPaths(ref);
    if (!present || !present.has(path)) throw new NotFoundError('Document not found');
    let text: string;
    try {
      text = await this.deps.files.readFile(ref, path);
    } catch {
      throw new NotFoundError('Document not found');
    }
    return { path, text, chars: text.length, tokens: estimateTokens(text.length) };
  }

  async saveRoots(workspaceId: string, repoId: string, roots: string[]): Promise<ContextListing> {
    if (roots.length > MAX_ROOTS) {
      throw new ValidationError(`at most ${MAX_ROOTS} search roots are allowed`);
    }
    for (const root of roots) {
      const problem = validateRoot(root);
      if (problem) throw new ValidationError(problem);
    }
    await this.requireRepo(workspaceId, repoId);
    await this.deps.repo.saveRoots(workspaceId, repoId, roots);
    return this.scan(workspaceId, repoId);
  }

  async getAgentSelection(
    workspaceId: string,
    repoId: string,
    agentId: string,
  ): Promise<AgentContextSelection> {
    const ref = await this.requireRepo(workspaceId, repoId);
    await this.requireAgent(workspaceId, agentId);
    return this.agentSelection(workspaceId, repoId, agentId, ref);
  }

  async saveAgentSelection(
    workspaceId: string,
    repoId: string,
    agentId: string,
    paths: string[],
  ): Promise<AgentContextSelection> {
    const clean = this.validatedPaths(paths);
    const ref = await this.requireRepo(workspaceId, repoId);
    await this.requireAgent(workspaceId, agentId);
    await this.deps.repo.replaceAgentPaths(workspaceId, repoId, agentId, clean);
    return this.agentSelection(workspaceId, repoId, agentId, ref);
  }

  async getSkillSelection(
    workspaceId: string,
    repoId: string,
    skillId: string,
  ): Promise<ContextSelection> {
    const ref = await this.requireRepo(workspaceId, repoId);
    await this.requireSkill(workspaceId, skillId);
    return this.skillSelection(workspaceId, repoId, skillId, ref);
  }

  async saveSkillSelection(
    workspaceId: string,
    repoId: string,
    skillId: string,
    paths: string[],
  ): Promise<ContextSelection> {
    const clean = this.validatedPaths(paths);
    const ref = await this.requireRepo(workspaceId, repoId);
    await this.requireSkill(workspaceId, skillId);
    await this.deps.repo.replaceSkillPaths(workspaceId, repoId, skillId, clean);
    return this.skillSelection(workspaceId, repoId, skillId, ref);
  }

  // ---- internals ----

  private async agentSelection(
    workspaceId: string,
    repoId: string,
    agentId: string,
    ref: RepoCoords,
  ): Promise<AgentContextSelection> {
    const [paths, linked, present] = await Promise.all([
      this.deps.repo.getAgentPaths(workspaceId, repoId, agentId),
      this.deps.repo.enabledLinkedSkillPaths(workspaceId, repoId, agentId),
      this.presentPaths(ref),
    ]);
    return {
      repo_id: repoId,
      attachments: flagMissing(paths, present ?? new Set()),
      linked_skill_paths: linked,
    };
  }

  private async skillSelection(
    workspaceId: string,
    repoId: string,
    skillId: string,
    ref: RepoCoords,
  ): Promise<ContextSelection> {
    const [paths, present] = await Promise.all([
      this.deps.repo.getSkillPaths(workspaceId, repoId, skillId),
      this.presentPaths(ref),
    ]);
    return { repo_id: repoId, attachments: flagMissing(paths, present ?? new Set()) };
  }

  /** Validates every path before anything is stored, then dedupes and sorts. */
  private validatedPaths(paths: string[]): string[] {
    if (paths.length > MAX_SELECTED_PATHS) {
      throw new ValidationError(`at most ${MAX_SELECTED_PATHS} paths can be attached`);
    }
    for (const p of paths) {
      const problem = validateRelativePath(p);
      if (problem) throw new ValidationError(problem);
    }
    return uniqueSorted(paths);
  }

  private async scan(workspaceId: string, repoId: string): Promise<ContextListing> {
    const ref = await this.requireRepo(workspaceId, repoId);
    const { roots, isDefault } = await this.rootsFor(workspaceId, repoId);
    const counts = await this.deps.repo.attachmentCounts(workspaceId, repoId);
    const scannedAt = this.deps.now().toISOString();

    const base = {
      repoId,
      roots,
      rootsDefault: isDefault,
      scannedAt,
      agentCounts: counts.agents,
      skillCounts: counts.skills,
    };

    let listed: string[];
    try {
      listed = await this.deps.files.listFiles(ref);
    } catch {
      return toListing({ ...base, cloned: false, files: [] });
    }

    const compiled = compileRoots(roots);
    const wanted = listed.filter(
      (p) => !isExcluded(p) && isMarkdown(p) && matchesCompiled(p, compiled),
    );
    const files: ScannedFile[] = [];
    for (let i = 0; i < wanted.length; i += SCAN_READ_CONCURRENCY) {
      const chunk = wanted.slice(i, i + SCAN_READ_CONCURRENCY);
      const sized = await Promise.all(
        chunk.map(async (path): Promise<ScannedFile | null> => {
          try {
            return { path, chars: (await this.deps.files.readFile(ref, path)).length };
          } catch {
            return null; // unreadable file: leave it out rather than fail the listing
          }
        }),
      );
      for (const f of sized) if (f) files.push(f);
    }
    return toListing({ ...base, cloned: true, files });
  }

  private async rootsFor(
    workspaceId: string,
    repoId: string,
  ): Promise<{ roots: string[]; isDefault: boolean }> {
    const saved = await this.deps.repo.getRoots(workspaceId, repoId);
    return saved
      ? { roots: saved, isDefault: false }
      : { roots: [...DEFAULT_SEARCH_ROOTS], isDefault: true };
  }

  /** Every tracked path (roots ignored), or null when the clone cannot be listed. */
  private async presentPaths(ref: RepoCoords): Promise<Set<string> | null> {
    try {
      return new Set(await this.deps.files.listFiles(ref));
    } catch {
      return null;
    }
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoCoords> {
    const ref = await this.deps.repo.getRepoRef(workspaceId, repoId);
    if (!ref) throw new NotFoundError('Repository not found');
    return ref;
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<void> {
    if (!(await this.deps.repo.agentInWorkspace(workspaceId, agentId))) {
      throw new NotFoundError('Agent not found');
    }
  }

  private async requireSkill(workspaceId: string, skillId: string): Promise<void> {
    if (!(await this.deps.repo.skillInWorkspace(workspaceId, skillId))) {
      throw new NotFoundError('Skill not found');
    }
  }
}
