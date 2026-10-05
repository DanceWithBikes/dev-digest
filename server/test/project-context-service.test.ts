import { describe, it, expect, vi } from 'vitest';
import { ProjectContextService } from '../src/modules/project-context/service.js';
import type { ContextRepository } from '../src/modules/project-context/ports.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';
import { MAX_SELECTED_PATHS } from '../src/modules/project-context/constants.js';

function setup(opts: { files?: Record<string, string>; noClone?: boolean; roots?: string[] } = {}) {
  const files = opts.files ?? {};
  const agentPaths: string[] = ['gone.md'];
  const repo = {
    getRepoRef: async () => ({ owner: 'o', name: 'r' }),
    getRoots: async () => opts.roots ?? null,
    saveRoots: vi.fn(async () => {}),
    attachmentCounts: async () => ({
      agents: new Map([['docs/a.md', 2]]),
      skills: new Map<string, number>(),
    }),
    agentInWorkspace: async () => true,
    skillInWorkspace: async () => true,
    getAgentPaths: async () => agentPaths,
    getSkillPaths: async () => [],
    replaceAgentPaths: vi.fn(async () => {}),
    replaceSkillPaths: vi.fn(async () => {}),
    enabledLinkedSkillPaths: async () => [],
  } satisfies ContextRepository;
  const readFile = vi.fn(async (_r: unknown, p: string) => files[p] ?? '');
  const source = {
    listFiles: async () => {
      if (opts.noClone) throw new Error('no clone');
      return Object.keys(files);
    },
    readFile,
  };
  const service = new ProjectContextService({
    repo,
    files: source,
    now: () => new Date('2026-01-01T00:00:00Z'),
  });
  return { service, repo, readFile };
}

describe('ProjectContextService', () => {
  it('applies the default roots and counts attachments', async () => {
    const { service } = setup({
      files: { 'docs/a.md': 'abcde', 'README.md': 'x', 'node_modules/p/docs/z.md': 'z' },
    });
    const l = await service.list('w', 'r');
    expect(l.roots_default).toBe(true);
    expect(l.documents.map((d) => d.path)).toEqual(['docs/a.md']);
    expect(l.documents[0]).toMatchObject({ tokens: 2, agents_count: 2, type: 'doc' });
  });

  it('returns an empty listing when there is no clone', async () => {
    const { service } = setup({ noClone: true });
    const l = await service.list('w', 'r');
    expect(l).toMatchObject({ cloned: false, documents: [], count: 0 });
  });

  it('accepts and stores an empty roots list', async () => {
    const { service, repo } = setup({ files: { 'docs/a.md': 'a' }, roots: [] });
    const l = await service.saveRoots('w', 'r', []);
    expect(repo.saveRoots).toHaveBeenCalledWith('w', 'r', []);
    expect(l.documents).toEqual([]);
  });

  it('rejects bad roots without storing', async () => {
    const { service, repo } = setup();
    await expect(service.saveRoots('w', 'r', ['ok/*.md', '../x'])).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.saveRoots).not.toHaveBeenCalled();
  });

  it('rejects unclosed-brace roots and too many roots without storing', async () => {
    const { service, repo } = setup();
    await expect(service.saveRoots('w', 'r', ['{a,b'])).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.saveRoots('w', 'r', Array.from({ length: 21 }, (_, i) => `d${i}/*.md`)),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.saveRoots).not.toHaveBeenCalled();
  });

  it('lists and previews only .md files, whatever the roots', async () => {
    const { service } = setup({
      files: { 'docs/a.md': 'a', 'docs/readme.txt': 'x', 'docs/B.MD': 'b' },
      roots: ['docs/**'],
    });
    const l = await service.list('w', 'r');
    expect(l.documents.map((d) => d.path)).toEqual(['docs/B.MD', 'docs/a.md']);
    await expect(service.preview('w', 'r', 'docs/readme.txt')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('refuses unsafe or out-of-roots previews before reading', async () => {
    const { service, readFile } = setup({ files: { 'README.md': 'x', 'docs/a.md': 'a' } });
    await expect(service.preview('w', 'r', '../x')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.preview('w', 'r', 'README.md')).rejects.toBeInstanceOf(ValidationError);
    expect(readFile).not.toHaveBeenCalled();
    await expect(service.preview('w', 'r', 'docs/none.md')).rejects.toBeInstanceOf(NotFoundError);
    expect((await service.preview('w', 'r', 'docs/a.md')).text).toBe('a');
  });

  it('rejects a whole selection holding one bad path', async () => {
    const { service, repo } = setup();
    await expect(service.saveAgentSelection('w', 'r', 'a', ['docs/a.md', '/etc/x'])).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.saveSkillSelection('w', 'r', 's', ['a/../b'])).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.replaceAgentPaths).not.toHaveBeenCalled();
    expect(repo.replaceSkillPaths).not.toHaveBeenCalled();
  });

  it('rejects a selection above MAX_SELECTED_PATHS', async () => {
    const { service, repo } = setup();
    const tooMany = Array.from({ length: MAX_SELECTED_PATHS + 1 }, (_, i) => `docs/${i}.md`);
    await expect(service.saveAgentSelection('w', 'r', 'a', tooMany)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.replaceAgentPaths).not.toHaveBeenCalled();
  });

  it('flags a deleted file as missing and keeps it stored', async () => {
    const { service, repo } = setup({ files: { 'docs/a.md': 'a' } });
    const sel = await service.getAgentSelection('w', 'r', 'a');
    expect(sel.attachments).toEqual([{ path: 'gone.md', missing: true }]);
    expect(repo.replaceAgentPaths).not.toHaveBeenCalled();
  });

  it('dedupes saved paths', async () => {
    const { service, repo } = setup({ files: { 'docs/a.md': 'a' } });
    await service.saveAgentSelection('w', 'r', 'a', ['docs/b.md', 'docs/a.md', 'docs/b.md']);
    expect(repo.replaceAgentPaths).toHaveBeenCalledWith('w', 'r', 'a', ['docs/a.md', 'docs/b.md']);
  });
});
