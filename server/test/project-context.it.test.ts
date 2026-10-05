import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * Project Context API (SPEC-01, AC-6..AC-21, AC-68, AC-70, AC-72) against a real
 * Postgres. Invariants pinned: listing is a live scan filtered by per-repo roots
 * and the .git / node_modules exclusion; invalid roots or paths answer 422 and
 * store NOTHING; attachments are paths only, flagged `missing` but kept; deleting
 * an agent, skill or repo cascades its attachments.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const FILES: Record<string, string> = {
  'docs/guide.md': 'a'.repeat(9), // 9 chars -> 3 tokens
  'specs/auth.md': '# Auth spec',
  'packages/x/docs/insights/notes.md': 'notes',
  'insights.md': 'root insights',
  'README.md': 'readme outside the default roots',
  'docs/readme.txt': 'not markdown',
  'node_modules/pkg/docs/hidden.md': 'excluded',
  '.git/docs/hidden.md': 'excluded',
};

class CountingGit extends MockGitClient {
  public reads: string[] = [];
  override async readFile(repo: Parameters<MockGitClient['readFile']>[0], path: string) {
    this.reads.push(path);
    return super.readFile(repo, path);
  }
}

d('Project Context API (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let agentId: string;
  let skillId: string;
  let git: CountingGit;

  const app = (g: MockGitClient = git) =>
    buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { embedder: new MockEmbedder(), git: g },
    });

  const newRepo = async (name: string) => {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return repo!.id;
  };

  const storedAgentPaths = async (repoId: string) =>
    (
      await pg.handle.db
        .select()
        .from(t.agentContextAttachments)
        .where(eq(t.agentContextAttachments.repoId, repoId))
    )
      .map((r) => r.path)
      .sort();

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    git = new CountingGit({ files: FILES });

    const a = await app();
    const agent = await a.inject({
      method: 'POST',
      url: '/agents',
      payload: { name: 'Ctx Agent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x', repo_intel: false },
    });
    agentId = agent.json().id;
    const skill = await a.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'ctx-skill', description: 'd', type: 'rubric', body: 'b' },
    });
    skillId = skill.json().id;
    await a.close();
  });

  afterAll(async () => {
    await pg?.stop();
  });

  describe('listing and roots', () => {
    it('lists only default-root .md files, typed, sized, excluding .git and node_modules', async () => {
      const repoId = await newRepo('list-default');
      const a = await app();
      const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.roots).toEqual(['**/{specs,docs,insights}/**/*.md']);
      expect(body.roots_default).toBe(true);
      expect(body.cloned).toBe(true);
      expect(body.documents.map((x: { path: string }) => x.path)).toEqual([
        'docs/guide.md',
        'packages/x/docs/insights/notes.md',
        'specs/auth.md',
      ]);
      expect(body.count).toBe(3);
      const guide = body.documents.find((x: { path: string }) => x.path === 'docs/guide.md');
      expect(guide).toMatchObject({ type: 'doc', chars: 9, tokens: 3, agents_count: 0, skills_count: 0 });
      const byPath = Object.fromEntries(body.documents.map((x: { path: string; type: string }) => [x.path, x.type]));
      expect(byPath['specs/auth.md']).toBe('spec');
      expect(byPath['packages/x/docs/insights/notes.md']).toBe('insights');
      await a.close();
    });

    it('stores roots per repo only and keeps node_modules/.git out even for a catch-all root', async () => {
      const repoA = await newRepo('roots-a');
      const repoB = await newRepo('roots-b');
      const a = await app();
      const put = await a.inject({
        method: 'PUT',
        url: `/repos/${repoA}/context/roots`,
        payload: { roots: ['**/*.md'] },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().roots_default).toBe(false);
      const paths = put.json().documents.map((x: { path: string }) => x.path);
      expect(paths).toContain('README.md');
      expect(paths).not.toContain('node_modules/pkg/docs/hidden.md');
      expect(paths).not.toContain('.git/docs/hidden.md');

      const other = await a.inject({ method: 'GET', url: `/repos/${repoB}/context` });
      expect(other.json().roots_default).toBe(true);
      expect(other.json().roots).toEqual(['**/{specs,docs,insights}/**/*.md']);
      await a.close();
    });

    it.each([[''], ['/abs/**/*.md'], ['../up/*.md'], ['docs/../../x.md']])(
      'rejects invalid root %j with 422 and keeps the previous roots',
      async (bad) => {
        const repoId = await newRepo(`bad-root-${Math.random().toString(36).slice(2, 8)}`);
        const a = await app();
        await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/roots`, payload: { roots: ['specs/**/*.md'] } });
        const res = await a.inject({
          method: 'PUT',
          url: `/repos/${repoId}/context/roots`,
          payload: { roots: ['docs/*.md', bad] },
        });
        expect(res.statusCode).toBe(422);
        const after = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
        expect(after.json().roots).toEqual(['specs/**/*.md']);
        await a.close();
      },
    );

    it('accepts and stores an empty roots array and then lists nothing', async () => {
      const repoId = await newRepo('empty-roots');
      const a = await app();
      const res = await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/roots`, payload: { roots: [] } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ roots: [], roots_default: false, count: 0, documents: [] });
      const again = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(again.json()).toMatchObject({ roots: [], roots_default: false, count: 0 });
      await a.close();
    });

    it('reindex returns the document count and a scan time', async () => {
      const repoId = await newRepo('reindex');
      const a = await app();
      const res = await a.inject({ method: 'POST', url: `/repos/${repoId}/context/reindex` });
      expect(res.statusCode).toBe(200);
      expect(res.json().count).toBe(3);
      expect(Number.isNaN(Date.parse(res.json().scanned_at))).toBe(false);
      await a.close();
    });

    it('answers 200 with an empty, uncloned listing when the repo has no clone', async () => {
      const repoId = await newRepo('no-clone');
      const a = await app(new MockGitClient({ files: FILES, noClone: true }));
      const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ cloned: false, count: 0, documents: [] });
      await a.close();
    });

    it('returns 404 for an unknown repo', async () => {
      const a = await app();
      const res = await a.inject({ method: 'GET', url: '/repos/00000000-0000-4000-8000-000000000000/context' });
      expect(res.statusCode).toBe(404);
      await a.close();
    });
  });

  describe('preview', () => {
    it('returns the full text, chars and tokens of a listed document', async () => {
      const repoId = await newRepo('preview-ok');
      const a = await app();
      const res = await a.inject({ method: 'GET', url: `/repos/${repoId}/context/file?path=docs/guide.md` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ path: 'docs/guide.md', text: 'aaaaaaaaa', chars: 9, tokens: 3 });
      await a.close();
    });

    it.each([['/etc/passwd'], ['docs/../../secret.md'], ['README.md'], ['node_modules/pkg/docs/hidden.md']])(
      'refuses %j with a 4xx and reads no file',
      async (path) => {
        const repoId = await newRepo(`preview-bad-${Math.random().toString(36).slice(2, 8)}`);
        const g = new CountingGit({ files: FILES });
        const a = await app(g);
        const res = await a.inject({
          method: 'GET',
          url: `/repos/${repoId}/context/file?path=${encodeURIComponent(path)}`,
        });
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.statusCode).toBeLessThan(500);
        expect(g.reads).toEqual([]);
        await a.close();
      },
    );
  });

  describe('agent attachments', () => {
    it('stores sorted paths, flags a missing one but keeps it, and counts it in the listing', async () => {
      const repoId = await newRepo('agent-att');
      const a = await app();
      const put = await a.inject({
        method: 'PUT',
        url: `/repos/${repoId}/context/agents/${agentId}`,
        payload: { paths: ['specs/auth.md', 'docs/gone.md', 'docs/guide.md'] },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().attachments).toEqual([
        { path: 'docs/gone.md', missing: true },
        { path: 'docs/guide.md', missing: false },
        { path: 'specs/auth.md', missing: false },
      ]);
      // AC-21: the missing path stays stored on a later read.
      const got = await a.inject({ method: 'GET', url: `/repos/${repoId}/context/agents/${agentId}` });
      expect(got.json().attachments.map((x: { path: string }) => x.path)).toContain('docs/gone.md');
      expect(await storedAgentPaths(repoId)).toEqual(['docs/gone.md', 'docs/guide.md', 'specs/auth.md']);

      const list = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      const guide = list.json().documents.find((x: { path: string }) => x.path === 'docs/guide.md');
      expect(guide.agents_count).toBe(1);
      await a.close();
    });

    it('replaces the previous selection and does not create an agent version (AC-70)', async () => {
      const repoId = await newRepo('agent-replace');
      const a = await app();
      const versionsBefore = await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agentId));
      await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/agents/${agentId}`, payload: { paths: ['docs/guide.md'] } });
      await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/agents/${agentId}`, payload: { paths: ['specs/auth.md'] } });
      expect(await storedAgentPaths(repoId)).toEqual(['specs/auth.md']);
      const versionsAfter = await pg.handle.db.select().from(t.agentVersions).where(eq(t.agentVersions.agentId, agentId));
      expect(versionsAfter.length).toBe(versionsBefore.length);
      await a.close();
    });

    it.each([['/abs.md'], ['docs/../x.md'], ['']])(
      'rejects the whole selection with 422 when one path is %j, storing nothing',
      async (bad) => {
        const repoId = await newRepo(`agent-bad-${Math.random().toString(36).slice(2, 8)}`);
        const a = await app();
        const res = await a.inject({
          method: 'PUT',
          url: `/repos/${repoId}/context/agents/${agentId}`,
          payload: { paths: ['docs/guide.md', bad] },
        });
        expect(res.statusCode).toBe(422);
        expect(await storedAgentPaths(repoId)).toEqual([]);
        await a.close();
      },
    );

    it('cascades the attachments when the agent is deleted', async () => {
      const repoId = await newRepo('agent-cascade');
      const a = await app();
      const created = await a.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Doomed', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x', repo_intel: false },
      });
      const doomed = created.json().id;
      await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/agents/${doomed}`, payload: { paths: ['docs/guide.md'] } });
      const before = await pg.handle.db.select().from(t.agentContextAttachments).where(eq(t.agentContextAttachments.agentId, doomed));
      expect(before).toHaveLength(1);
      const del = await a.inject({ method: 'DELETE', url: `/agents/${doomed}` });
      expect(del.statusCode).toBe(200);
      const after = await pg.handle.db.select().from(t.agentContextAttachments).where(eq(t.agentContextAttachments.agentId, doomed));
      expect(after).toHaveLength(0);
      await a.close();
    });

    it('returns 404 for an unknown agent', async () => {
      const repoId = await newRepo('agent-404');
      const a = await app();
      const res = await a.inject({
        method: 'GET',
        url: `/repos/${repoId}/context/agents/00000000-0000-4000-8000-000000000000`,
      });
      expect(res.statusCode).toBe(404);
      await a.close();
    });
  });

  describe('skill attachments', () => {
    it('stores paths per skill and repo, flags missing, counts skills_count, and lists enabled linked-skill paths on the agent', async () => {
      const repoId = await newRepo('skill-att');
      const otherRepo = await newRepo('skill-att-other');
      const a = await app();
      const put = await a.inject({
        method: 'PUT',
        url: `/repos/${repoId}/context/skills/${skillId}`,
        payload: { paths: ['docs/guide.md', 'docs/gone.md'] },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json().attachments).toEqual([
        { path: 'docs/gone.md', missing: true },
        { path: 'docs/guide.md', missing: false },
      ]);
      const other = await a.inject({ method: 'GET', url: `/repos/${otherRepo}/context/skills/${skillId}` });
      expect(other.json().attachments).toEqual([]);

      const list = await a.inject({ method: 'GET', url: `/repos/${repoId}/context` });
      const guide = list.json().documents.find((x: { path: string }) => x.path === 'docs/guide.md');
      expect(guide.skills_count).toBe(1);

      await a.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [skillId] } });
      const agentSel = await a.inject({ method: 'GET', url: `/repos/${repoId}/context/agents/${agentId}` });
      expect(agentSel.json().linked_skill_paths).toEqual(expect.arrayContaining(['docs/guide.md']));
      await a.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: [] } });
      await a.close();
    });

    it('rejects an invalid path with 422 and stores nothing', async () => {
      const repoId = await newRepo('skill-bad');
      const a = await app();
      const res = await a.inject({
        method: 'PUT',
        url: `/repos/${repoId}/context/skills/${skillId}`,
        payload: { paths: ['docs/guide.md', '../x.md'] },
      });
      expect(res.statusCode).toBe(422);
      const rows = await pg.handle.db.select().from(t.skillContextAttachments).where(eq(t.skillContextAttachments.repoId, repoId));
      expect(rows).toHaveLength(0);
      await a.close();
    });

    it('cascades the attachments when the skill is deleted', async () => {
      const repoId = await newRepo('skill-cascade');
      const a = await app();
      const created = await a.inject({
        method: 'POST',
        url: '/skills',
        payload: { name: 'doomed-skill', description: 'd', type: 'rubric', body: 'b' },
      });
      const doomed = created.json().id;
      await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/skills/${doomed}`, payload: { paths: ['docs/guide.md'] } });
      await a.inject({ method: 'DELETE', url: `/skills/${doomed}` });
      const after = await pg.handle.db.select().from(t.skillContextAttachments).where(eq(t.skillContextAttachments.skillId, doomed));
      expect(after).toHaveLength(0);
      await a.close();
    });
  });

  it('cascades attachments and roots when the repo is deleted (AC-72)', async () => {
    const repoId = await newRepo('repo-cascade');
    const a = await app();
    await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/roots`, payload: { roots: ['docs/*.md'] } });
    await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/agents/${agentId}`, payload: { paths: ['docs/guide.md'] } });
    await a.inject({ method: 'PUT', url: `/repos/${repoId}/context/skills/${skillId}`, payload: { paths: ['docs/guide.md'] } });
    await pg.handle.db.delete(t.repos).where(eq(t.repos.id, repoId));
    expect(await pg.handle.db.select().from(t.repoContextSettings).where(eq(t.repoContextSettings.repoId, repoId))).toHaveLength(0);
    expect(await storedAgentPaths(repoId)).toEqual([]);
    expect(await pg.handle.db.select().from(t.skillContextAttachments).where(eq(t.skillContextAttachments.repoId, repoId))).toHaveLength(0);
    await a.close();
  });
});
