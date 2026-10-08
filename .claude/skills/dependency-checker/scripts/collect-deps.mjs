#!/usr/bin/env node
// Collects dependency facts for every package in the repo. No dependencies, no network unless --outdated.
//
//   node .claude/skills/dependency-checker/scripts/collect-deps.mjs            # JSON on stdout
//   node .claude/skills/dependency-checker/scripts/collect-deps.mjs --md       # facts as markdown (graph + tables)
//   node .claude/skills/dependency-checker/scripts/collect-deps.mjs --package server --outdated
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const ROOT = repoRoot();
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", ".claude", ".cursor"]);
const SRC_EXT = /\.(?:[cm]?[jt]sx?|json|css)$/;

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    a[key] = i + 1 < argv.length && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return a;
}

function repoRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  }
}

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const kb = (bytes) => Math.round(bytes / 102.4) / 10;

// ---------- sizes ----------
// Size of one package's own files on disk, not counting a nested node_modules.
function dirSize(dir) {
  let total = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    if (e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else if (e.isFile()) { try { total += lstatSync(p).size; } catch { /* broken link */ } }
  }
  return total;
}

// Node-style lookup of `name` starting from the real directory of the requiring package.
function findInstalled(name, fromRealDir) {
  let dir = fromRealDir;
  for (;;) {
    const candidate = join(dir, "node_modules", name);
    if (existsSync(candidate)) return realpathSync(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function packageCost(name, pkgRoot) {
  const real = findInstalled(name, pkgRoot);
  if (!real) return { installed: false };
  const own = dirSize(real);
  const seen = new Set([real]);
  const queue = [real];
  let total = own;
  while (queue.length) {
    const cur = queue.pop();
    let manifest;
    try { manifest = readJson(join(cur, "package.json")); } catch { continue; }
    for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      const depReal = findInstalled(dep, cur);
      if (!depReal || seen.has(depReal)) continue;
      seen.add(depReal);
      total += dirSize(depReal);
      queue.push(depReal);
    }
  }
  let manifest = {};
  try { manifest = readJson(join(real, "package.json")); } catch { /* ignore */ }
  return {
    installed: true,
    installedVersion: manifest.version ?? null,
    license: typeof manifest.license === "string" ? manifest.license : null,
    hasBin: Boolean(manifest.bin),
    ownKb: kb(own),
    withTransitiveKb: kb(total),
    transitiveCount: seen.size - 1,
  };
}

// ---------- usage ----------
function sourceFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sourceFiles(p, out);
    else if (SRC_EXT.test(e.name) && e.name !== "package.json" && !/lock/.test(e.name)) out.push(p);
  }
  return out;
}

function importedNames(files, names, scripts) {
  const used = new Set();
  const corpus = files.map((f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } }).join("\n") + "\n" + scripts;
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    // import/require/dynamic import of the name or a subpath, or a CLI call in package scripts
    if (new RegExp(`['"\`]${esc}(?:/[^'"\`]*)?['"\`]`).test(corpus)) used.add(name);
    else if (new RegExp(`(?:^|[\\s&|;"'])${esc.replace(/^@[^/]+\\\//, "")}(?:\\s|$)`).test(scripts)) used.add(name);
  }
  // Types and the compiler are used implicitly, not imported.
  for (const name of names) {
    if (name === "typescript" && files.some((f) => /tsconfig/.test(f))) used.add(name);
    if (name.startsWith("@types/")) {
      const base = name.slice(7).replace("__", "/");
      if (used.has(base) || used.has(`@${base}`) || base === "node") used.add(name);
    }
  }
  return used;
}

// ---------- packages ----------
function discoverPackages() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && existsSync(join(ROOT, e.name, "package.json")))
    .map((e) => e.name)
    .filter((n) => !args.package || n === args.package);
}

function lockfileOf(dir) {
  for (const [file, pm] of [["pnpm-lock.yaml", "pnpm"], ["package-lock.json", "npm"], ["yarn.lock", "yarn"]]) {
    if (existsSync(join(dir, file))) return pm;
  }
  return null;
}

function outdated(dir, pm) {
  try {
    const cmd = pm === "pnpm" ? ["pnpm", ["outdated", "--format", "json"]] : ["npm", ["outdated", "--json"]];
    const out = execFileSync(cmd[0], cmd[1], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out || "{}");
  } catch (err) {
    // pnpm/npm exit 1 when something is outdated and still print the JSON
    try { return JSON.parse(err.stdout || "{}"); } catch { return null; }
  }
}

// Cross-package edges: tsconfig `paths` that leave the package directory.
function internalEdges(pkgName) {
  const dir = join(ROOT, pkgName);
  const edges = [];
  for (const file of ["tsconfig.json", "tsconfig.base.json"]) {
    if (!existsSync(join(dir, file))) continue;
    let paths;
    const text = readFileSync(join(dir, file), "utf8");
    try {
      // Plain JSON first: stripping comments blindly would eat `"@x/*"` globs inside strings.
      try { paths = JSON.parse(text).compilerOptions?.paths; }
      catch { paths = JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")).compilerOptions?.paths; }
    } catch { continue; }
    for (const [alias, targets] of Object.entries(paths ?? {})) {
      for (const t of targets) {
        const abs = resolve(dir, t);
        const rel = relative(ROOT, abs);
        if (rel.startsWith("..")) continue;
        const top = rel.split("/")[0];
        if (top !== pkgName) edges.push({ from: pkgName, to: top, alias });
      }
    }
  }
  return dedupe(edges, (e) => `${e.from}>${e.to}`);
}

const dedupe = (list, key) => [...new Map(list.map((x) => [key(x), x])).values()];

// Vendored copies of `shared` must stay identical (see CLAUDE.md).
function vendorDrift() {
  const copies = ["server/src/vendor/shared", "client/src/vendor/shared"].filter((d) => existsSync(join(ROOT, d)));
  if (copies.length < 2) return null;
  const hashes = copies.map((d) => {
    const h = createHash("sha1");
    for (const f of sourceFiles(join(ROOT, d)).sort()) h.update(relative(join(ROOT, d), f)).update(readFileSync(f));
    return h.digest("hex");
  });
  return { copies, identical: new Set(hashes).size === 1 };
}

function collect() {
  const packages = [];
  for (const name of discoverPackages()) {
    const dir = join(ROOT, name);
    const manifest = readJson(join(dir, "package.json"));
    const pm = lockfileOf(dir);
    const declared = [
      ...Object.entries(manifest.dependencies ?? {}).map(([n, r]) => [n, r, "prod"]),
      ...Object.entries(manifest.devDependencies ?? {}).map(([n, r]) => [n, r, "dev"]),
      ...Object.entries(manifest.peerDependencies ?? {}).map(([n, r]) => [n, r, "peer"]),
      ...Object.entries(manifest.optionalDependencies ?? {}).map(([n, r]) => [n, r, "optional"]),
    ];
    const scripts = Object.values(manifest.scripts ?? {}).join("\n");
    const used = importedNames(sourceFiles(dir), declared.map(([n]) => n), scripts);
    const outdatedMap = args.outdated ? outdated(dir, pm) : undefined;
    const dependencies = declared.map(([n, range, type]) => {
      const cost = packageCost(n, dir);
      const o = outdatedMap?.[n];
      return {
        name: n, type, range, ...cost,
        pinned: /^\d/.test(range),
        usedInSource: used.has(n),
        ...(o ? { latest: o.latest, wanted: o.wanted } : {}),
      };
    }).sort((a, b) => (b.withTransitiveKb ?? -1) - (a.withTransitiveKb ?? -1));
    packages.push({
      name, packageManager: pm, installed: existsSync(join(dir, "node_modules")),
      counts: { prod: dependencies.filter((d) => d.type === "prod").length, dev: dependencies.filter((d) => d.type === "dev").length },
      internalDeps: internalEdges(name),
      dependencies,
    });
  }
  // Same dependency declared in several packages with different ranges.
  const byName = new Map();
  for (const p of packages) for (const d of p.dependencies) {
    byName.set(d.name, [...(byName.get(d.name) ?? []), { package: p.name, range: d.range, type: d.type }]);
  }
  const versionDrift = [...byName].filter(([, v]) => v.length > 1 && new Set(v.map((x) => x.range)).size > 1)
    .map(([name, usages]) => ({ name, usages }));
  const sharedAcrossPackages = [...byName].filter(([, v]) => v.length > 1).map(([name, v]) => ({ name, packages: v.map((x) => x.package) }));
  return {
    generatedAt: new Date().toISOString(),
    root: ROOT,
    sizeNote: "withTransitiveKb = own files + every transitive dependency resolved from disk (shared transitive packages counted once). Disk size, not bundle size.",
    packages, versionDrift, sharedAcrossPackages, vendorDrift: vendorDrift(),
  };
}

// ---------- markdown facts ----------
function toMarkdown(r) {
  const L = [];
  L.push("## Dependency graph", "", "```mermaid", "graph LR");
  for (const p of r.packages) {
    L.push(`  ${id(p.name)}["${p.name}<br/>${p.counts.prod} prod · ${p.counts.dev} dev"]`);
  }
  for (const p of r.packages) for (const e of p.internalDeps) L.push(`  ${id(e.from)} -->|"${e.alias}"| ${id(e.to)}`);
  for (const p of r.packages) {
    L.push(`  subgraph ${id(p.name)}_heavy["${p.name}: heaviest"]`);
    p.dependencies.filter((d) => d.installed).slice(0, 5).forEach((d, i) => {
      L.push(`    ${id(p.name)}_h${i}["${d.name}<br/>${fmt(d.withTransitiveKb)}"]`);
    });
    L.push("  end", `  ${id(p.name)} --> ${id(p.name)}_heavy`);
  }
  L.push("```", "");
  for (const p of r.packages) {
    L.push(`## ${p.name} (${p.packageManager ?? "no lockfile"}${p.installed ? "" : ", NOT INSTALLED - sizes unavailable"})`, "");
    L.push("| Package | Type | Range | Installed | Own | With transitive | Deps | Used |", "|---|---|---|---|---|---|---|---|");
    for (const d of p.dependencies) {
      L.push(`| ${d.name} | ${d.type} | ${d.range} | ${d.installedVersion ?? "-"} | ${fmt(d.ownKb)} | ${fmt(d.withTransitiveKb)} | ${d.transitiveCount ?? "-"} | ${d.usedInSource ? "yes" : "**no?**"} |`);
    }
    L.push("");
  }
  if (r.versionDrift.length) {
    L.push("## Version drift between packages", "", "| Package | Usages |", "|---|---|");
    for (const v of r.versionDrift) L.push(`| ${v.name} | ${v.usages.map((u) => `${u.package}: ${u.range}`).join(", ")} |`);
    L.push("");
  }
  if (r.vendorDrift) L.push(`## Vendored shared copies`, "", `${r.vendorDrift.copies.join(" vs ")}: ${r.vendorDrift.identical ? "identical" : "**DIFFER**"}`, "");
  return L.join("\n");
}
const id = (s) => s.replace(/[^a-zA-Z0-9]/g, "_");
const fmt = (k) => (k == null ? "-" : k >= 1024 ? `${(k / 1024).toFixed(1)} MB` : `${k} KB`);

const result = collect();
process.stdout.write(args.md ? toMarkdown(result) + "\n" : JSON.stringify(result, null, 2) + "\n");
