import type {
  OnboardingDiagramEdge,
  OnboardingDiagramNode,
  OnboardingDirectory,
  OnboardingStatus,
  OnboardingTour,
  OnboardingTourResponse,
} from '@devdigest/shared';
import {
  CHARS_PER_TOKEN,
  COMPOSE_NAMES,
  MANIFEST_MAX_CHARS,
  MANIFEST_NAMES,
  MAX_COMMAND_CHARS,
  MAX_CRITICAL_FILES,
  MAX_DIAGRAM_EDGES,
  MAX_DIAGRAM_NODES,
  MAX_ENDPOINTS,
  MAX_FILE_FACTS,
  MAX_READING_PATH,
  MAX_RUN_COMMANDS,
  MAX_STACK,
  README_MAX_CHARS,
  ROOT_NODE,
  TREE_DEPTH,
  TREE_MAX_ENTRIES,
} from './constants.js';
import type { Facts, FileFact, RunCommand } from './domain.js';

/**
 * Pure, deterministic functions behind the tour's facts (SPEC-02). No I/O, no
 * clock: the same inputs always give the same facts (AC-16).
 */

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `ceil(chars / 4)` — the same formula as Project Context (copied, not imported). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

// ---- Path kinds (AC-18) ----------------------------------------------------

const EXCLUDED_DIR = /(^|\/)(__tests__|tests?|e2e|specs?|__mocks__|mocks?|__fixtures__|fixtures?|migrations?)\//i;
const EXCLUDED_FILE =
  /(\.(test|spec|mock)\.[^/]+$)|(\.d\.[cm]?ts$)|(\.sql$)|(\.config\.[^/]+$)|((^|\/)tsconfig[^/]*\.json$)|((^|\/)\.(eslintrc|prettierrc|babelrc)[^/]*$)/i;

/** Test, mock, fixture, configuration, type-declaration and migration files. */
export function isExcludedKind(path: string): boolean {
  return EXCLUDED_DIR.test(path) || EXCLUDED_FILE.test(path);
}

// ---- Manifest selection (AC-21, AC-25, AC-26) ------------------------------

const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
const dirName = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/** Secret-looking names the facts must never read (AC-25). */
export function isSecretName(name: string): boolean {
  return (
    name === '.env' ||
    name.startsWith('.env.') ||
    name.endsWith('.pem') ||
    name.endsWith('.key') ||
    name.startsWith('secrets')
  );
}

/** True for absolute paths and paths with a `..` segment (AC-26). */
export function isUnsafePath(path: string): boolean {
  if (path === '' || path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:/.test(path)) {
    return true;
  }
  return path.split(/[\\/]/).some((seg) => seg === '..');
}

const README_NAME = /^readme(\.(md|markdown|txt))?$/i;

export interface ProjectFileSelection {
  /** Allow-listed manifests at depth <= 1, by depth then path. */
  manifests: string[];
  /** The root README, or null. */
  readme: string | null;
}

/**
 * Chooses which tracked files the facts may read. Only allow-listed manifest
 * names at the root or one directory below, plus the root README. Anything
 * secret-looking, absolute or escaping is refused outright.
 */
export function selectProjectFiles(trackedPaths: string[]): ProjectFileSelection {
  const manifests: string[] = [];
  const readmes: string[] = [];
  for (const path of trackedPaths) {
    if (isUnsafePath(path)) continue;
    const segs = path.split('/');
    const name = segs[segs.length - 1] ?? '';
    if (segs.length > 2 || isSecretName(name)) continue;
    if (segs.some((s) => s === 'node_modules' || s === '.git')) continue;
    if ((MANIFEST_NAMES as readonly string[]).includes(name)) manifests.push(path);
    else if (segs.length === 1 && README_NAME.test(name)) readmes.push(path);
  }
  manifests.sort((a, b) => a.split('/').length - b.split('/').length || cmp(a, b));
  readmes.sort((a, b) => cmp(/\.md$/i.test(a) ? '0' + a : '1' + a, /\.md$/i.test(b) ? '0' + b : '1' + b));
  return { manifests, readme: readmes[0] ?? null };
}

/** Package manager named by the lockfile in `dir`; `npm` when there is none. Existence only. */
export function lockfilePackageManager(dir: string, trackedPaths: string[]): 'pnpm' | 'yarn' | 'bun' | 'npm' {
  const has = (name: string): boolean => trackedPaths.includes(dir ? `${dir}/${name}` : name);
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb') || has('bun.lock')) return 'bun';
  return 'npm';
}

// ---- Run commands (AC-21..AC-24) -------------------------------------------

/** `curl|wget … | sh` and `sudo` (AC-24). */
export function isRisky(command: string): boolean {
  return (
    /\bsudo\b/.test(command) ||
    /\b(curl|wget)\b[^\n]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/.test(command) ||
    /\b(ba|z|da|k)?sh\b[^\n]*<\(\s*(curl|wget)\b/.test(command)
  );
}

export interface ManifestFile {
  path: string;
  text: string;
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9:_.\-/@]*$/;
const SAFE_DIR = /^[A-Za-z0-9_.\-/@]*$/;
const SHELL_LANGS = new Set(['', 'sh', 'bash', 'shell', 'zsh', 'console']);

interface Candidate {
  command: string;
  sourcePath: string;
  depth: number;
  dir: string;
  rank: number;
  /** Checked as well as the command text (a script body can hide a `curl | sh`). */
  body?: string;
}

function fromPackageJson(file: ManifestFile, pm: string): Candidate[] {
  let json: unknown;
  try {
    json = JSON.parse(file.text);
  } catch {
    return [];
  }
  if (typeof json !== 'object' || json === null) return [];
  const dir = dirName(file.path);
  const base = { sourcePath: file.path, depth: dir ? 1 : 0, dir };
  const out: Candidate[] = [];
  const scripts = (json as { scripts?: unknown }).scripts;
  if (typeof scripts === 'object' && scripts !== null) {
    for (const [name, body] of Object.entries(scripts)) {
      if (!SAFE_NAME.test(name)) continue;
      out.push({ ...base, rank: 0, command: `${pm} run ${name}`, body: typeof body === 'string' ? body : undefined });
    }
  }
  const node = (json as { engines?: { node?: unknown } }).engines?.node;
  if (typeof node === 'string') {
    const major = /\d+/.exec(node)?.[0];
    if (major) out.push({ ...base, rank: 4, command: `nvm install ${major}` });
  }
  return out;
}

function fromMakefile(file: ManifestFile): Candidate[] {
  const dir = dirName(file.path);
  const out: Candidate[] = [];
  for (const line of file.text.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9][A-Za-z0-9_.\-/]*)\s*:(?![=:])/.exec(line);
    if (m?.[1]) {
      out.push({ command: `make ${m[1]}`, sourcePath: file.path, depth: dir ? 1 : 0, dir, rank: 1 });
    }
  }
  return out;
}

function fromReadme(file: ManifestFile): Candidate[] {
  const out: Candidate[] = [];
  let lang: string | null = null;
  for (const line of file.text.slice(0, MANIFEST_MAX_CHARS).split(/\r?\n/)) {
    const fence = /^\s{0,3}```\s*([A-Za-z]*)/.exec(line);
    if (fence) {
      lang = lang === null ? (fence[1] ?? '').toLowerCase() : null;
      continue;
    }
    if (lang === null || !SHELL_LANGS.has(lang)) continue;
    const text = line.trim().replace(/^\$\s+/, '');
    if (!text || text.startsWith('#')) continue;
    out.push({ command: text, sourcePath: file.path, depth: 99, dir: '', rank: 99 });
  }
  return out;
}

/**
 * Run commands from the selected manifests and the root README, in collection
 * order (depth, then directory; within one: package.json, Makefile, Compose,
 * `.nvmrc`/`engines`; the README last). First occurrence wins; at most 20.
 */
export function extractRunCommands(
  files: ManifestFile[],
  trackedPaths: string[],
  readmePath: string | null,
): RunCommand[] {
  const candidates: Candidate[] = [];
  for (const file of files) {
    if (file.path !== readmePath && file.text.length > MANIFEST_MAX_CHARS) continue;
    const name = baseName(file.path);
    const dir = dirName(file.path);
    if (file.path === readmePath) {
      candidates.push(...fromReadme(file));
    } else if (name === 'package.json') {
      candidates.push(...fromPackageJson(file, lockfilePackageManager(dir, trackedPaths)));
    } else if (name === 'Makefile') {
      candidates.push(...fromMakefile(file));
    } else if (COMPOSE_NAMES.includes(name) && SAFE_DIR.test(dir)) {
      candidates.push({
        command: `docker compose -f ${file.path} up`,
        sourcePath: file.path,
        depth: dir ? 1 : 0,
        dir,
        rank: 2,
      });
    } else if (name === '.nvmrc') {
      candidates.push({ command: 'nvm use', sourcePath: file.path, depth: dir ? 1 : 0, dir, rank: 3 });
    }
  }
  // Array#sort is stable, so equal keys keep their source order.
  candidates.sort((a, b) => a.depth - b.depth || cmp(a.dir, b.dir) || a.rank - b.rank);
  const seen = new Set<string>();
  const out: RunCommand[] = [];
  for (const c of candidates) {
    if (c.command.length > MAX_COMMAND_CHARS || seen.has(c.command)) continue;
    seen.add(c.command);
    out.push({ command: c.command, sourcePath: c.sourcePath, risky: isRisky(c.command) || (!!c.body && isRisky(c.body)) });
    if (out.length >= MAX_RUN_COMMANDS) break;
  }
  return out;
}

/** Dependency names of the selected `package.json` files: sorted, unique, at most 40. Untrusted text. */
export function extractStack(files: ManifestFile[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    if (baseName(file.path) !== 'package.json' || file.text.length > MANIFEST_MAX_CHARS) continue;
    let json: unknown;
    try {
      json = JSON.parse(file.text);
    } catch {
      continue;
    }
    if (typeof json !== 'object' || json === null) continue;
    for (const key of ['dependencies', 'devDependencies'] as const) {
      const deps = (json as Record<string, unknown>)[key];
      if (typeof deps !== 'object' || deps === null) continue;
      for (const name of Object.keys(deps)) {
        if (name.length <= 214 && /^[@A-Za-z0-9._\-/]+$/.test(name)) names.add(name);
      }
    }
  }
  return [...names].sort(cmp).slice(0, MAX_STACK);
}

// ---- Index-derived facts ---------------------------------------------------

export interface RankedFile {
  path: string;
  rank: number;
}

/** The top 30 non-excluded files with their endpoints (AC-18). */
export function selectFileFacts(
  ranked: RankedFile[],
  endpoints: Array<{ file: string; endpoint: string }>,
): FileFact[] {
  const byFile = new Map<string, string[]>();
  for (const e of endpoints) {
    const list = byFile.get(e.file);
    if (list) list.push(e.endpoint);
    else byFile.set(e.file, [e.endpoint]);
  }
  return ranked
    .filter((r) => !isExcludedKind(r.path))
    .slice(0, MAX_FILE_FACTS)
    .map((r) => ({ path: r.path, rank: r.rank, endpoints: byFile.get(r.path) ?? [] }));
}

/** At most 50 endpoints, by file then stored order, skipping excluded kinds. */
export function selectEndpoints(
  endpoints: Array<{ file: string; endpoint: string }>,
): Array<{ file: string; endpoint: string }> {
  return endpoints.filter((e) => !isExcludedKind(e.file)).slice(0, MAX_ENDPOINTS);
}

/** Directory tree down to depth 2, from the indexed paths; dirs end with `/`. */
export function buildTree(paths: string[]): string[] {
  const entries = new Set<string>();
  for (const p of paths) {
    const segs = p.split('/');
    for (let depth = 1; depth <= Math.min(TREE_DEPTH, segs.length); depth += 1) {
      const joined = segs.slice(0, depth).join('/');
      entries.add(depth < segs.length ? `${joined}/` : joined);
    }
  }
  return [...entries].sort(cmp).slice(0, TREE_MAX_ENTRIES);
}

export function readmeExcerpt(text: string): string {
  return text.slice(0, README_MAX_CHARS);
}

// ---- Reading path (AC-27, AC-28) ------------------------------------------

/** The 12 highest-ranked non-excluded files, in rank order. */
export function selectReadingPath(ranked: RankedFile[]): RankedFile[] {
  return ranked.filter((r) => !isExcludedKind(r.path)).slice(0, MAX_READING_PATH);
}

/**
 * Kahn's algorithm over the direct import edges among `files`: an imported
 * file comes before its importers. The ready queue is ordered rank DESC then
 * path ASC; when a cycle leaves no ready node, the highest-ranked remaining
 * node is taken.
 */
export function orderReadingPath(files: RankedFile[], edges: Array<{ from: string; to: string }>): string[] {
  const inSet = new Map(files.map((f) => [f.path, f]));
  const imports = new Map<string, Set<string>>(files.map((f) => [f.path, new Set<string>()]));
  const importers = new Map<string, Set<string>>(files.map((f) => [f.path, new Set<string>()]));
  for (const e of edges) {
    if (e.from === e.to || !inSet.has(e.from) || !inSet.has(e.to)) continue;
    imports.get(e.from)?.add(e.to);
    importers.get(e.to)?.add(e.from);
  }
  const better = (a: RankedFile, b: RankedFile): number => b.rank - a.rank || cmp(a.path, b.path);
  const remaining = new Set(files.map((f) => f.path));
  const order: string[] = [];
  while (remaining.size > 0) {
    const nodes = [...remaining].map((p) => inSet.get(p) as RankedFile).sort(better);
    const ready = nodes.filter((n) => [...(imports.get(n.path) ?? [])].every((d) => !remaining.has(d)));
    const next = (ready[0] ?? nodes[0]) as RankedFile;
    order.push(next.path);
    remaining.delete(next.path);
  }
  return order;
}

/** AC-29: distinct files of the chains in chain order, minus excluded kinds, at most 8. */
export function selectCriticalPaths(chains: string[][]): string[] {
  const out: string[] = [];
  for (const chain of chains) {
    for (const p of chain) {
      if (isExcludedKind(p) || out.includes(p)) continue;
      out.push(p);
      if (out.length >= MAX_CRITICAL_FILES) return out;
    }
  }
  return out;
}

// ---- Architecture (AC-30, AC-56) -------------------------------------------

const topDir = (path: string): string => (path.includes('/') ? (path.split('/')[0] as string) : ROOT_NODE);

export interface Architecture {
  directories: OnboardingDirectory[];
  diagram: { nodes: OnboardingDiagramNode[]; edges: OnboardingDiagramEdge[] };
}

const MAX_DIAGRAM_DEPTH = 4;

/**
 * Diagram group of a file at `depth` levels (AC-30): a `src` segment is not a
 * level, a shallower directory groups by itself, repo-root files form `(root)`.
 */
function groupAt(path: string, depth: number): string {
  const dir = path.split('/').slice(0, -1);
  if (dir.length === 0) return ROOT_NODE;
  const levels = dir.filter((seg) => seg !== 'src');
  // Only `src` segments: the whole directory is the group.
  if (levels.length === 0) return dir.join('/');
  return levels.slice(0, depth).join('/');
}

interface DiagramCandidate {
  nodes: Array<[string, number]>;
  edges: Array<{ from: string; to: string; weight: number }>;
  /** File-level import edges running between two different kept groups. */
  score: number;
}

function candidateAt(paths: string[], edges: Array<{ from: string; to: string }>, depth: number): DiagramCandidate {
  const counts = new Map<string, number>();
  for (const p of paths) {
    const g = groupAt(p, depth);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const nodes = [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0])).slice(0, MAX_DIAGRAM_NODES);
  const kept = new Set(nodes.map(([g]) => g));

  const weights = new Map<string, number>();
  let score = 0;
  for (const e of edges) {
    const from = groupAt(e.from, depth);
    const to = groupAt(e.to, depth);
    if (from === to || !kept.has(from) || !kept.has(to)) continue;
    score += 1;
    const key = `${from}\u0000${to}`;
    weights.set(key, (weights.get(key) ?? 0) + 1);
  }
  const heaviest = [...weights.entries()]
    .map(([key, weight]) => {
      const [from, to] = key.split('\u0000') as [string, string];
      return { from, to, weight };
    })
    .sort((a, b) => b.weight - a.weight || cmp(a.from, b.from) || cmp(a.to, b.to))
    .slice(0, MAX_DIAGRAM_EDGES);
  return { nodes, edges: heaviest, score };
}

/**
 * `directories`: one entry per top-level directory (AC-3). `diagram` (AC-30):
 * the grouping depth 1-4 whose kept groups have the most import edges between
 * two different groups (smaller depth wins a tie), AC-18 kinds left out as
 * nodes and as edge endpoints.
 */
export function buildArchitecture(paths: string[], edges: Array<{ from: string; to: string }>): Architecture {
  const counts = new Map<string, number>();
  for (const p of paths) counts.set(topDir(p), (counts.get(topDir(p)) ?? 0) + 1);
  const dirs = [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]));

  const eligible = paths.filter((p) => !isExcludedKind(p));
  const eligibleEdges = edges.filter((e) => !isExcludedKind(e.from) && !isExcludedKind(e.to));
  let best: DiagramCandidate | null = null;
  for (let depth = 1; depth <= MAX_DIAGRAM_DEPTH; depth++) {
    const cand = candidateAt(eligible, eligibleEdges, depth);
    if (best === null || cand.score > best.score) best = cand;
  }
  const chosen = best as DiagramCandidate;

  return {
    directories: dirs.filter(([d]) => d !== ROOT_NODE).map(([path, files]) => ({ path, files })),
    diagram: {
      nodes: chosen.nodes.map(([g]) => ({ id: g, label: g })),
      edges: chosen.edges,
    },
  };
}

// ---- Assembly --------------------------------------------------------------

export interface FactsInput {
  repoFullName: string;
  commitSha: string;
  indexedFiles: number;
  candidateFiles: number;
  ranked: RankedFile[];
  edges: Array<{ from: string; to: string }>;
  endpoints: Array<{ file: string; endpoint: string }>;
  chains: string[][];
  trackedPaths: string[];
  /** Files read from the selection (unreadable ones are simply absent). */
  files: ManifestFile[];
  readmePath: string | null;
}

/** Builds the facts. Pure and order-stable, so two runs on the same inputs are byte-identical (AC-16). */
export function assembleFacts(input: FactsInput): Facts {
  const readme = input.readmePath ? input.files.find((f) => f.path === input.readmePath) : undefined;
  const arch = buildArchitecture(
    input.ranked.map((r) => r.path),
    input.edges,
  );
  const reading = selectReadingPath(input.ranked);
  return {
    repoFullName: input.repoFullName,
    commitSha: input.commitSha,
    indexedFiles: input.indexedFiles,
    candidateFiles: input.candidateFiles,
    fileFacts: selectFileFacts(input.ranked, input.endpoints),
    endpoints: selectEndpoints(input.endpoints),
    runCommands: extractRunCommands(input.files, input.trackedPaths, input.readmePath),
    stack: extractStack(input.files),
    tree: buildTree(input.ranked.map((r) => r.path)),
    readme: readme ? { path: readme.path, excerpt: readmeExcerpt(readme.text) } : null,
    criticalPaths: selectCriticalPaths(input.chains),
    readingPath: orderReadingPath(reading, input.edges),
    directories: arch.directories,
    diagram: arch.diagram,
  };
}

// ---- Stored tour → response ------------------------------------------------

export interface StoredTour {
  tour: OnboardingTour | null;
  lastFailed: { status: OnboardingStatus; at: string } | null;
}

/** The columns (`status`, `commit_sha`) win over the JSON body (AC-52). */
export function overlayColumns(json: OnboardingTour, cols: { status: OnboardingStatus; commitSha: string }): OnboardingTour {
  return { ...json, status: cols.status, commit_sha: cols.commitSha };
}

export function toTourResponse(
  stored: StoredTour,
  flags: { stale: boolean; generating: boolean },
): OnboardingTourResponse {
  return {
    tour: stored.tour,
    stale: stored.tour ? flags.stale : false,
    generating: flags.generating,
    last_failed: stored.lastFailed,
  };
}
