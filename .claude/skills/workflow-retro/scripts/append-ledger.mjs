#!/usr/bin/env node
// Step 3 of workflow-retro: append one row per retro to docs/retros/ledger.md so runs can be
// compared over time. Append-only - existing rows are never rewritten.
//
//   node append-ledger.mjs <retro.json> --action "<top action>" [--ledger <path>] [--force]
//
// <retro.json> is the stdout of retro.mjs (use "-" for stdin). The same session + mode + label
// is not appended twice unless --force.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fmtMs, fmtTokens, parseArgs, repoRoot } from "./lib.mjs";

export const HEADER = `# Workflow retro ledger

One row per \`workflow-retro\` run, appended by \`.claude/skills/workflow-retro/scripts/append-ledger.mjs\`.
Compare rows of the same kind of run (same label) to see whether the last action paid off.

- **mode** - \`quick\` counts the parent only (child spend missing); \`deep\` reads every subagent log. Only compare deep with deep.
- **tokens** - input + output + cache read + cache write, all agents. **cache** - cache read / all prompt tokens.
- **agents / depth** - subagents spawned / deepest nesting. **peak** - most agents alive at once.
- **par.** - agent-time / time any agent was alive (1.0 = sequential).

| date | session | label | mode | agents / depth | tokens | cache | tool calls | wall | peak | par. | top action |
|---|---|---|---|---|---|---|---|---|---|---|---|
`;

const cell = (v) => String(v ?? "-").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim() || "-";

export function ledgerRow(r, action) {
  const t = r.totals;
  const p = r.parallelism;
  return `| ${[
    (r.startedAt ?? new Date().toISOString()).slice(0, 10),
    r.sessionId.slice(0, 8),
    r.label,
    r.mode,
    `${t.agents} / ${t.maxDepth}`,
    fmtTokens(t.totalTokens),
    t.cacheHit == null ? null : `${t.cacheHit}%`,
    t.toolCalls,
    fmtMs(r.wallMs),
    p?.peakConcurrency,
    p ? `${p.factor}×` : null,
    action,
  ]
    .map(cell)
    .join(" | ")} |`;
}

export function appendLedger(ledger, r, action, { force = false } = {}) {
  if (!existsSync(ledger)) {
    mkdirSync(dirname(ledger), { recursive: true });
    writeFileSync(ledger, HEADER);
  }
  const existing = readFileSync(ledger, "utf8");
  const key = `| ${r.sessionId.slice(0, 8)} | ${cell(r.label)} | ${r.mode} |`;
  if (!force && existing.includes(key)) return { appended: false, reason: `row for ${key} already exists (use --force)` };
  const row = ledgerRow(r, action);
  appendFileSync(ledger, `${existing.endsWith("\n") ? "" : "\n"}${row}\n`);
  return { appended: true, row };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const src = args._[0];
  if (!src) {
    console.error("usage: append-ledger.mjs <retro.json|-> --action <text> [--ledger <path>] [--force]");
    process.exit(2);
  }
  const r = JSON.parse(readFileSync(src === "-" ? 0 : src, "utf8"));
  const ledger = typeof args.ledger === "string" ? args.ledger : join(repoRoot(), "docs", "retros", "ledger.md");
  const res = appendLedger(ledger, r, typeof args.action === "string" ? args.action : null, { force: !!args.force });
  console.log(JSON.stringify({ ledger, ...res }));
}
