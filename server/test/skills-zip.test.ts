import { describe, it, expect } from 'vitest';
import { deflateRawSync } from 'node:zlib';
import { extractSkillMarkdownFromZip, isBodyChange } from '../src/modules/skills/helpers.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { SkillsRepository } from '../src/modules/skills/repository.js';
import { ValidationError, NotFoundError } from '../src/platform/errors.js';
import { MAX_SKILL_ARCHIVE_ENTRY_BYTES } from '../src/modules/skills/constants.js';

/**
 * The `.zip` half of skill import, plus the restore rule.
 *
 * Both are unit tests on purpose: the unzipper is a pure buffer → string
 * function and the restore rule is a property of the service, so neither needs
 * Postgres. The zips below are built here byte by byte — a fixture file would
 * hide exactly the fields (sizes, offsets, method) the reader is being tested on.
 */

// ---- a minimal zip writer, just enough to feed the reader -----------------

interface TestEntry {
  path: string;
  content: string;
  /** 0 = stored, 8 = deflate. */
  method?: number;
}

/** CRC is left at 0: the reader never verifies it, and neither does unzip -p. */
function buildZip(entries: TestEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 8;
    const raw = Buffer.from(entry.content, 'utf8');
    const data = method === 0 ? raw : deflateRawSync(raw);
    const name = Buffer.from(entry.path, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralDirectory, eocd]);
}

// ---- the unzipper ---------------------------------------------------------

describe('extractSkillMarkdownFromZip', () => {
  it('reads a deflated entry back out', () => {
    const zip = buildZip([{ path: 'SKILL.md', content: '# Rubric\n\nFlag X.\n' }]);
    expect(extractSkillMarkdownFromZip(zip)).toEqual({
      path: 'SKILL.md',
      content: '# Rubric\n\nFlag X.\n',
    });
  });

  it('reads a stored (uncompressed) entry too', () => {
    const zip = buildZip([{ path: 'SKILL.md', content: '# Stored\n', method: 0 }]);
    expect(extractSkillMarkdownFromZip(zip).content).toBe('# Stored\n');
  });

  it('prefers SKILL.md over any other markdown, however deep it sits', () => {
    const zip = buildZip([
      { path: 'readme.md', content: '# Readme\n' },
      { path: 'pack/skill/SKILL.md', content: '# The skill\n' },
      { path: 'notes.md', content: '# Notes\n' },
    ]);
    expect(extractSkillMarkdownFromZip(zip).path).toBe('pack/skill/SKILL.md');
  });

  it('falls back to a root-level file, then to the shallowest one', () => {
    const rooted = buildZip([
      { path: 'deep/nested/a.md', content: '# Deep\n' },
      { path: 'top.md', content: '# Top\n' },
    ]);
    expect(extractSkillMarkdownFromZip(rooted).path).toBe('top.md');

    const nestedOnly = buildZip([
      { path: 'a/b/c/deep.md', content: '# Deep\n' },
      { path: 'a/shallow.md', content: '# Shallow\n' },
    ]);
    expect(extractSkillMarkdownFromZip(nestedOnly).path).toBe('a/shallow.md');
  });

  it('picks the same entry every time when two rank equally', () => {
    const paths = buildZip([
      { path: 'b.md', content: '# B\n' },
      { path: 'a.md', content: '# A\n' },
    ]);
    expect(extractSkillMarkdownFromZip(paths).path).toBe('a.md');
  });

  it('ignores non-markdown entries', () => {
    const zip = buildZip([
      { path: 'script.sh', content: 'rm -rf /\n' },
      { path: 'SKILL.md', content: '# Safe\n' },
    ]);
    expect(extractSkillMarkdownFromZip(zip).content).toBe('# Safe\n');
  });

  it('rejects the whole archive when ANY entry escapes the root', () => {
    // The valid SKILL.md must not buy the hostile entry a pass.
    const traversal = buildZip([
      { path: 'SKILL.md', content: '# Fine\n' },
      { path: '../../.ssh/authorized_keys', content: 'ssh-rsa AAA\n' },
    ]);
    expect(() => extractSkillMarkdownFromZip(traversal)).toThrow(ValidationError);
    expect(() => extractSkillMarkdownFromZip(traversal)).toThrow(/Unsafe path/);

    const absolute = buildZip([{ path: '/etc/passwd.md', content: '# nope\n' }]);
    expect(() => extractSkillMarkdownFromZip(absolute)).toThrow(/Unsafe path/);
  });

  it('errors when the archive holds no markdown at all', () => {
    const zip = buildZip([
      { path: 'index.html', content: '<h1>hi</h1>' },
      { path: 'style.css', content: 'body{}' },
    ]);
    expect(() => extractSkillMarkdownFromZip(zip)).toThrow(ValidationError);
    expect(() => extractSkillMarkdownFromZip(zip)).toThrow(/No markdown file/);
  });

  it('refuses an entry that decompresses past the cap', () => {
    // Highly compressible: small in the archive, far over the limit unpacked.
    const bomb = buildZip([
      { path: 'SKILL.md', content: 'a'.repeat(MAX_SKILL_ARCHIVE_ENTRY_BYTES + 1) },
    ]);
    expect(() => extractSkillMarkdownFromZip(bomb)).toThrow(ValidationError);
  });

  it('rejects bytes that are not a zip at all', () => {
    expect(() => extractSkillMarkdownFromZip(Buffer.from('# just markdown\n'))).toThrow(
      ValidationError,
    );
  });
});

// ---- the service: archive import and restore ------------------------------

interface FakeSkill {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled: boolean;
  version: number;
  evidenceFiles: string[] | null;
}

/**
 * In-memory stand-in for `SkillsRepository`, reproducing the one behaviour the
 * restore rule rests on: only a body change bumps the version and snapshots it.
 * It reuses the real `isBodyChange`, so the rule itself is not re-implemented.
 */
function makeFakeRepo(skill: FakeSkill, versions: { version: number; body: string }[]) {
  const snapshots = versions.map((v) => ({
    skillId: skill.id,
    version: v.version,
    body: v.body,
    createdAt: new Date(),
  }));
  return {
    async getById(workspaceId: string, id: string) {
      return workspaceId === skill.workspaceId && id === skill.id ? skill : undefined;
    },
    async getVersion(skillId: string, version: number) {
      return snapshots.find((s) => s.skillId === skillId && s.version === version);
    },
    async update(workspaceId: string, id: string, patch: { body?: string }) {
      if (workspaceId !== skill.workspaceId || id !== skill.id) return undefined;
      if (isBodyChange(skill, patch)) {
        skill.body = patch.body!;
        skill.version += 1;
        snapshots.push({
          skillId: skill.id,
          version: skill.version,
          body: skill.body,
          createdAt: new Date(),
        });
      }
      return skill;
    },
    async countAgentsPerSkill() {
      return new Map([[skill.id, 3]]);
    },
    snapshots,
  };
}

function baseSkill(): FakeSkill {
  return {
    id: 'skill-1',
    workspaceId: 'ws-1',
    name: 'Rubric',
    description: 'Flag X.',
    type: 'custom',
    source: 'manual',
    body: 'v5 body',
    enabled: true,
    version: 5,
    evidenceFiles: null,
  };
}

describe('SkillsService.restore', () => {
  it('re-applies an old body as a NEW version instead of rewriting history', async () => {
    const repo = makeFakeRepo(baseSkill(), [
      { version: 1, body: 'v1 body' },
      { version: 5, body: 'v5 body' },
    ]);
    const service = new SkillsService(repo as unknown as SkillsRepository);

    const restored = await service.restore('ws-1', 'skill-1', 1);

    expect(restored.body).toBe('v1 body');
    expect(restored.version).toBe(6);
    // v1 and v5 are still readable — a restore must never cost you a snapshot.
    expect(repo.snapshots.map((s) => s.version)).toEqual([1, 5, 6]);
    expect(repo.snapshots.find((s) => s.version === 5)?.body).toBe('v5 body');
  });

  it('is a no-op when the snapshot matches the current body', async () => {
    const repo = makeFakeRepo(baseSkill(), [{ version: 5, body: 'v5 body' }]);
    const service = new SkillsService(repo as unknown as SkillsRepository);

    const restored = await service.restore('ws-1', 'skill-1', 5);

    expect(restored.version).toBe(5);
    expect(repo.snapshots).toHaveLength(1);
  });

  it('carries the derived agent_count like every other skill response', async () => {
    const repo = makeFakeRepo(baseSkill(), [{ version: 1, body: 'v1 body' }]);
    const service = new SkillsService(repo as unknown as SkillsRepository);

    expect((await service.restore('ws-1', 'skill-1', 1)).agent_count).toBe(3);
  });

  it('404s on an unknown skill, on another workspace, and on a missing version', async () => {
    const repo = makeFakeRepo(baseSkill(), [{ version: 1, body: 'v1 body' }]);
    const service = new SkillsService(repo as unknown as SkillsRepository);

    await expect(service.restore('ws-1', 'nope', 1)).rejects.toThrow(NotFoundError);
    await expect(service.restore('ws-2', 'skill-1', 1)).rejects.toThrow(NotFoundError);
    await expect(service.restore('ws-1', 'skill-1', 99)).rejects.toThrow(/no version 99/);
  });
});

describe('SkillsService.parse', () => {
  it('parses the markdown inside an archive', () => {
    const service = new SkillsService({} as unknown as SkillsRepository);
    const zip = buildZip([
      { path: 'pack/SKILL.md', content: '---\nname: From zip\n---\n# Heading\n\nProse.\n' },
    ]);

    const draft = service.parse({ archive_b64: zip.toString('base64'), filename: 'pack.zip' });

    expect(draft.name).toBe('From zip');
    expect(draft.body).toContain('Prose.');
  });

  it('falls back to the uploaded archive name when the markdown names nothing', () => {
    const service = new SkillsService({} as unknown as SkillsRepository);
    const zip = buildZip([{ path: 'SKILL.md', content: '- a bullet\n' }]);

    const draft = service.parse({ archive_b64: zip.toString('base64'), filename: 'my-rules.zip' });

    expect(draft.name).toBe('my-rules');
    expect(draft.warnings).toContain('no-heading');
  });

  it('still takes plain markdown content', () => {
    const service = new SkillsService({} as unknown as SkillsRepository);
    expect(service.parse({ content: '# Plain\n\nProse.\n' }).name).toBe('Plain');
  });
});
