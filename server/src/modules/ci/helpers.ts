import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { stringify } from 'yaml';
import { AgentManifest, type CiInstallation, type CiRun, type Verdict } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import {
  ACTION_CHECKOUT,
  ACTION_SETUP_NODE,
  ACTION_UPLOAD_ARTIFACT,
  AGENTS_DIR,
  ARTIFACT_FILE,
  ARTIFACT_NAME,
  BASE_SHA_REF,
  MEMORY_PATH,
  RUNNER_COMMAND,
  RUNNER_PACKAGE_JSON,
  RUNNER_PACKAGE_PATH,
  RUNNER_PATH,
  SAME_REPO_GUARD,
  SKILLS_DIR,
  WORKFLOW_PATH,
} from './constants.js';
import { isBehind } from './domain.js';
import type {
  BundleFile,
  CiRunRow,
  InstallationRecord,
  PostAs,
  Trigger,
} from './domain.js';
import type { AgentForCi } from './ports.js';

// ---------------------------------------------------------------------------
// Slugs (AC-16, AC-133, AC-134)
// ---------------------------------------------------------------------------

/** NFKD → lowercase → each run outside `[a-z0-9._-]` → one `-` → trim `-`. */
export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const unsafeSlug = (slug: string) =>
  slug === '.' || slug.includes('..') || slug.includes('/') || slug.includes('\\');

export interface SlugSet {
  agentSlug: string;
  skills: { slug: string; name: string; body: string }[];
}

/** Derive and check the agent slug and every enabled skill slug; throws a 422 naming the culprit. */
export function assertSafeSlugs(agentName: string, skills: { name: string; body: string }[]): SlugSet {
  const agentSlug = slugify(agentName);
  if (agentSlug === '' || unsafeSlug(agentSlug)) {
    throw new ValidationError(`Agent name "${agentName}" does not give a usable file name`);
  }
  const seen = new Map<string, string>();
  const out: SlugSet['skills'] = [];
  for (const s of skills) {
    const slug = slugify(s.name);
    if (slug === '' || unsafeSlug(slug)) {
      throw new ValidationError(`Skill "${s.name}" does not give a usable file name`);
    }
    const other = seen.get(slug);
    if (other !== undefined) {
      throw new ValidationError(`Skills "${other}" and "${s.name}" give the same file name "${slug}"`);
    }
    seen.set(slug, s.name);
    out.push({ slug, name: s.name, body: s.body });
  }
  return { agentSlug, skills: out };
}

// ---------------------------------------------------------------------------
// Bundle generation (AC-8 to AC-13, AC-19, AC-21 to AC-31)
// ---------------------------------------------------------------------------

export function buildManifestYaml(agent: AgentForCi, skillSlugs: string[]): string {
  const manifest = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
  AgentManifest.parse(manifest); // the runner reads this exact shape (AC-9)
  return stringify(manifest);
}

export function buildMemoryJsonl(entries: { content: string; kind: string }[]): string {
  return entries.map((e) => JSON.stringify({ content: e.content, kind: e.kind })).join('\n') +
    (entries.length > 0 ? '\n' : '');
}

export function buildWorkflowYaml(opts: {
  triggers: Trigger[];
  postAs: PostAs;
  installationId: string;
}): string {
  const workflow = {
    name: 'DevDigest Review',
    on: { pull_request: { types: opts.triggers } },
    permissions: { contents: 'read', 'pull-requests': 'write' },
    jobs: {
      review: {
        'runs-on': 'ubuntu-latest',
        if: SAME_REPO_GUARD,
        steps: [
          {
            uses: ACTION_CHECKOUT,
            with: { ref: BASE_SHA_REF, 'persist-credentials': false },
          },
          { uses: ACTION_SETUP_NODE, with: { 'node-version': '22' } },
          {
            name: 'DevDigest review',
            run: RUNNER_COMMAND,
            env: {
              OPENROUTER_API_KEY: '${{ secrets.OPENROUTER_API_KEY }}',
              GITHUB_TOKEN: '${{ github.token }}',
              DEVDIGEST_POST_AS: opts.postAs,
              DEVDIGEST_INSTALLATION_ID: opts.installationId,
            },
          },
          {
            uses: ACTION_UPLOAD_ARTIFACT,
            if: '${{ always() }}',
            with: { name: ARTIFACT_NAME, path: ARTIFACT_FILE, 'if-no-files-found': 'ignore' },
          },
        ],
      },
    },
  };
  return stringify(workflow);
}

export function buildBundle(input: {
  agent: AgentForCi;
  slugs: SlugSet;
  memory: { content: string; kind: string }[];
  runner: string;
  workflow: string;
}): BundleFile[] {
  return [
    { path: WORKFLOW_PATH, contents: input.workflow, editable: true },
    {
      path: `${AGENTS_DIR}${input.slugs.agentSlug}.yaml`,
      contents: buildManifestYaml(input.agent, input.slugs.skills.map((s) => s.slug)),
      editable: false,
    },
    ...input.slugs.skills.map((s) => ({
      path: `${SKILLS_DIR}${s.slug}.md`,
      contents: s.body,
      editable: true,
    })),
    { path: MEMORY_PATH, contents: buildMemoryJsonl(input.memory), editable: false },
    { path: RUNNER_PATH, contents: input.runner, editable: false },
    { path: RUNNER_PACKAGE_PATH, contents: RUNNER_PACKAGE_JSON, editable: false },
  ];
}

/** Deterministic UUID-shaped id so preview and install agree before the row exists (AC-29). */
export function installationIdFor(agentId: string, repoFullName: string): string {
  const h = createHash('sha1').update(`${agentId}:${repoFullName}`).digest('hex');
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ---------------------------------------------------------------------------
// Zip (stored-name UTF-8, deflate) — node:zlib only
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip the bundle files (fixed 1980-01-01 timestamp, so the output is reproducible). */
export function zipFiles(files: { path: string; contents: string }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.path, 'utf8');
    const raw = Buffer.from(f.contents, 'utf8');
    const data = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, data);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0x0021, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += local.length + name.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, end]);
}

export class ZipError extends Error {
  constructor(public readonly reason: 'oversized' | 'missing' | 'malformed') {
    super(`zip entry ${reason}`);
    this.name = 'ZipError';
  }
}

/**
 * Read one named entry, never inflating past `maxBytes` (AC-132). Sizes come from
 * the central directory, which also covers GitHub's data-descriptor entries.
 */
export function readSingleZipEntry(bytes: Uint8Array, name: string, maxBytes: number): string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('malformed');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ZipError('malformed');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (entryName !== name) continue;
    if (usize > maxBytes) throw new ZipError('oversized');
    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) {
      throw new ZipError('malformed');
    }
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const data = buf.subarray(start, start + csize);
    if (data.length !== csize) throw new ZipError('malformed');
    if (method === 0) {
      if (csize > maxBytes) throw new ZipError('oversized');
      return data.toString('utf8');
    }
    if (method !== 8) throw new ZipError('malformed');
    try {
      return inflateRawSync(data, { maxOutputLength: maxBytes }).toString('utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') throw new ZipError('oversized');
      throw new ZipError('malformed');
    }
  }
  throw new ZipError('missing');
}

// ---------------------------------------------------------------------------
// Misc pure helpers
// ---------------------------------------------------------------------------

/** A GitHub client error's HTTP status, read structurally (no octokit import). */
export function githubStatusOf(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : undefined;
}

export function prNumberFromUrl(url: string): number | null {
  const m = /\/pull\/(\d+)(?:[/?#].*)?$/.exec(url);
  return m ? Number(m[1]) : null;
}

/** Deterministic verdict of a stored run (mirrors the runner's gate mapping, AC-121). */
export function verdictFor(row: Pick<CiRunRow, 'status' | 'blockers' | 'findingsCount'>): Verdict | null {
  if (row.status === 'failed' || row.status === 'running') return null;
  if ((row.blockers ?? 0) > 0) return 'request_changes';
  return (row.findingsCount ?? 0) > 0 ? 'comment' : 'approve';
}

export function toInstallationDto(rec: InstallationRecord): CiInstallation {
  return {
    id: rec.id,
    agent_id: rec.agentId,
    repo: rec.repo,
    target_type: 'gha',
    state: rec.state,
    agent_version: rec.agentVersion,
    runner_version: rec.runnerVersion,
    pr_url: rec.prUrl,
    behind: isBehind(rec.currentAgentVersion, rec.agentVersion),
    installed_at: rec.installedAt.toISOString(),
    updated_at: rec.updatedAt.toISOString(),
    latest_run: rec.latestRun
      ? { status: rec.latestRun.status, ran_at: rec.latestRun.ranAt.toISOString() }
      : null,
  };
}

export function toCiRunDto(row: CiRunRow): CiRun {
  return {
    id: row.id,
    repository: row.repository,
    pr_number: row.prNumber,
    agent: row.agent,
    verdict: verdictFor(row),
    findings_count: row.findingsCount,
    blockers: row.blockers,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    head_sha: row.headSha,
    job_url: row.jobUrl,
    status: row.status,
    ran_at: row.ranAt.toISOString(),
  };
}
