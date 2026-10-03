#!/usr/bin/env node
// Step 1 of workflow-retro: measure one Claude Code session (tokens, cache, tool calls,
// duration, parallelism - per agent, nested subagents included) and print JSON to stdout.
//
//   node retro.mjs [<sessionId>|latest] [--deep] [--md] [--label <text>] [--cwd <repo>]
//
// quick (default) reads only the parent transcript. The Agent tool result it sees reports
// `totalTokens` of the child's LAST turn, not its cumulative cost, and never mentions
// depth >= 2 agents - so quick mode understates cost. --deep reads every subagent log.
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import {
  addUsage,
  assistantMessages,
  cacheHit,
  emptyUsage,
  firstPrompt,
  fmtMs,
  fmtTokens,
  interval,
  median,
  parseArgs,
  projectLogDir,
  readJson,
  readJsonl,
  repoRoot,
  resolveSession,
  sumUsage,
  toolCalls,
  totalTokens,
} from "./lib.mjs";

export const THRESHOLDS = {
  sharedFileMinAgents: 3,
  outlierFactor: 2,
  outlierMinSiblings: 3,
  peakContext: 150_000,
  duplicatedPromptMinChars: 2000,
  sharedLineMinChars: 40,
  highConcurrency: 6,
  lowCacheHit: 50,
};

// Agent tool results, wherever they were returned (parent or a child that spawned a grandchild).
function agentResults(records) {
  const descByToolUse = new Map();
  for (const m of assistantMessages(records)) {
    for (const b of m.blocks) if (b.type === "tool_use" && b.name === "Agent") descByToolUse.set(b.id, b.input ?? {});
  }
  const done = notifications(records);
  const out = [];
  for (const r of records) {
    const res = r.toolUseResult;
    if (r.type !== "user" || !res || typeof res !== "object" || !res.agentId) continue;
    const toolUseId = (Array.isArray(r.message?.content) ? r.message.content : []).find((c) => c.type === "tool_result")?.tool_use_id;
    const input = descByToolUse.get(toolUseId) ?? {};
    const late = done.get(res.agentId);
    out.push({
      agentId: res.agentId,
      agentType: res.agentType ?? input.subagent_type ?? "general-purpose",
      description: input.description ?? null,
      shape: res.status === "async_launched" ? "background" : "foreground",
      status: late?.status ?? res.status ?? null,
      model: res.resolvedModel ?? null,
      durationMs: res.totalDurationMs ?? late?.durationMs ?? null,
      toolCalls: res.totalToolUseCount ?? late?.toolUses ?? null,
      lastTurnTokens: res.totalTokens ?? late?.tokens ?? null,
    });
  }
  return out;
}

// An Agent call the user rejected or interrupted has no agentId: its toolUseResult is the string
// "User rejected tool use" and the tool_result carries is_error. The subagent log still exists
// (its meta.toolUseId matches), so the spend is real but nothing came back. toolUseId -> description.
function rejectedAgentCalls(records) {
  const agentCalls = new Map();
  for (const m of assistantMessages(records)) {
    for (const b of m.blocks) if (b.type === "tool_use" && b.name === "Agent") agentCalls.set(b.id, b.input?.description ?? null);
  }
  const out = new Map();
  for (const r of records) {
    if (r.type !== "user" || !Array.isArray(r.message?.content)) continue;
    for (const c of r.message.content) {
      if (c.type === "tool_result" && c.is_error === true && agentCalls.has(c.tool_use_id)) out.set(c.tool_use_id, agentCalls.get(c.tool_use_id));
    }
  }
  return out;
}

// Background agents return `async_launched` at once; their outcome arrives later as a
// <task-notification> (status + subagent_tokens). The last notification per task wins.
const NOTIFICATION = /<task-notification>([\s\S]*?)<\/task-notification>/g;
const tag = (body, name) => body.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? null;

function textOf(r) {
  const c = r.message?.content ?? r.content;
  if (typeof c === "string") return c;
  return Array.isArray(c) ? c.map((b) => (typeof b.text === "string" ? b.text : typeof b.content === "string" ? b.content : "")).join("\n") : "";
}

function notifications(records) {
  const out = new Map();
  for (const r of records) {
    if (r.type !== "user" && r.type !== "queue-operation") continue;
    for (const [, body] of textOf(r).matchAll(NOTIFICATION)) {
      const id = tag(body, "task-id");
      if (!id) continue;
      const num = (n) => (tag(body, n) == null ? null : Number(tag(body, n)));
      out.set(id, { status: tag(body, "status"), tokens: num("subagent_tokens"), toolUses: num("tool_uses"), durationMs: num("duration_ms") });
    }
  }
  return out;
}

function errorsIn(records) {
  return records.filter((r) => r.isApiErrorMessage === true || (r.type === "system" && /error/i.test(r.subtype ?? ""))).length;
}

function measure(records) {
  const usage = sumUsage(records);
  const msgs = assistantMessages(records);
  const first = msgs[0]?.usage;
  return {
    usage,
    baseContext: first ? (first.input_tokens ?? 0) + (first.cache_read_input_tokens ?? 0) + (first.cache_creation_input_tokens ?? 0) : 0,
    model: msgs.find((m) => m.model && m.model !== "<synthetic>")?.model ?? null,
    tools: toolCalls(records),
    interval: interval(records),
    apiErrors: errorsIn(records),
  };
}

function loadSubagents(sessionDir) {
  const dir = join(sessionDir, "subagents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const id = basename(f, ".jsonl").replace(/^agent-/, "");
      const meta = readJson(join(dir, `agent-${id}.meta.json`)) ?? {};
      const records = readJsonl(join(dir, f));
      return { id, meta, records };
    });
}

// Peak number of agents alive at once, and the length of time at least one agent was alive.
export function sweep(intervals) {
  const events = [];
  for (const iv of intervals) {
    events.push([iv.start, 1], [iv.end, -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let live = 0;
  let peak = 0;
  let peakAt = null;
  let busySince = null;
  let busyMs = 0;
  for (const [t, d] of events) {
    if (live === 0 && d === 1) busySince = t;
    live += d;
    if (live > peak) {
      peak = live;
      peakAt = t;
    }
    if (live === 0 && busySince != null) {
      busyMs += t - busySince;
      busySince = null;
    }
  }
  return { peak, peakAt: peakAt == null ? null : new Date(peakAt).toISOString(), busyMs };
}

function commonPrefix(strings) {
  if (strings.length < 2) return 0;
  let n = 0;
  const first = strings[0];
  while (n < first.length && strings.every((s) => s[n] === first[n])) n++;
  return n;
}

// Prompt text siblings receive more than once: the shared prefix, plus every line (>= 40 chars)
// that recurs across siblings, counted once per extra copy. Returns repeated characters.
export function duplicatedChars(prompts) {
  const prefix = commonPrefix(prompts);
  const counts = new Map();
  for (const p of prompts) {
    for (const line of new Set(p.split("\n").map((l) => l.trim()))) {
      if (line.length >= THRESHOLDS.sharedLineMinChars) counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  let repeated = 0;
  for (const [line, n] of counts) if (n >= 2) repeated += (line.length + 1) * (n - 1);
  return Math.max(prefix * (prompts.length - 1), repeated);
}

function signals(agents) {
  const T = THRESHOLDS;
  const out = { sharedFiles: [], duplicatedPrompts: [], outliers: [], concurrency: [], failures: [] };

  const readers = new Map();
  for (const a of agents) for (const f of a.tools.readFiles) readers.set(f, [...(readers.get(f) ?? []), a.id]);
  for (const [file, ids] of readers) {
    if (ids.length >= T.sharedFileMinAgents) out.sharedFiles.push({ file, agents: ids.length, agentIds: ids });
  }
  out.sharedFiles.sort((a, b) => b.agents - a.agents);

  const groups = new Map();
  for (const a of agents) groups.set(a.parentId ?? "root", [...(groups.get(a.parentId ?? "root") ?? []), a]);
  for (const [parentId, sibs] of groups) {
    if (sibs.length >= 2) {
      const chars = duplicatedChars(sibs.map((s) => s.prompt));
      if (chars >= T.duplicatedPromptMinChars) {
        out.duplicatedPrompts.push({
          parentId,
          siblings: sibs.length,
          repeatedChars: chars,
          approxTokensRepeated: Math.round(chars / 4),
        });
      }
    }
    if (sibs.length >= T.outlierMinSiblings) {
      const medTok = median(sibs.map((s) => totalTokens(s.self)));
      const medTools = median(sibs.map((s) => s.tools.total));
      for (const s of sibs) {
        const why = [];
        if (medTok && totalTokens(s.self) > T.outlierFactor * medTok) why.push(`tokens ${fmtTokens(totalTokens(s.self))} vs sibling median ${fmtTokens(medTok)}`);
        if (medTools && s.tools.total > T.outlierFactor * medTools) why.push(`tool calls ${s.tools.total} vs sibling median ${medTools}`);
        if (why.length) out.outliers.push({ agentId: s.id, agentType: s.agentType, description: s.description, why });
      }
    }
  }
  for (const a of agents) {
    if (a.self.peakContext > T.peakContext && !out.outliers.some((o) => o.agentId === a.id)) {
      out.outliers.push({ agentId: a.id, agentType: a.agentType, description: a.description, why: [`peak context ${fmtTokens(a.self.peakContext)}`] });
    }
    if (a.stoppedByUser || (a.status && !["completed", "async_launched"].includes(a.status)) || a.apiErrors) {
      out.failures.push({ agentId: a.id, status: a.status, stoppedByUser: !!a.stoppedByUser, apiErrors: a.apiErrors });
    }
  }

  for (const [parentId, sibs] of groups) {
    const ivs = sibs.map((s) => s.interval).filter(Boolean);
    const { peak } = sweep(ivs);
    if (peak < T.highConcurrency) continue;
    const hits = sibs.map((s) => cacheHit(s.self)).filter((h) => h != null);
    out.concurrency.push({
      parentId,
      siblings: sibs.length,
      peak,
      medianCacheHit: median(hits),
      cacheWriteTokens: sibs.reduce((n, s) => n + s.self.cacheWrite, 0),
      medianBaseContext: median(sibs.map((s) => s.baseContext)),
      lowCacheHit: median(hits) < T.lowCacheHit,
    });
  }
  return out;
}

export function retro({ logDir, sessionId, deep = false, label = null }) {
  const sessionFile = join(logDir, `${sessionId}.jsonl`);
  const parentRecords = readJsonl(sessionFile);
  const parent = measure(parentRecords);
  const reported = agentResults(parentRecords);
  const rejected = rejectedAgentCalls(parentRecords);
  const warnings = [];
  if (rejected.size) {
    warnings.push(`${rejected.size} Agent call(s) were rejected/interrupted - their spend produced no result (${[...rejected.values()].filter(Boolean).slice(0, 5).join(", ")})`);
  }

  const result = {
    sessionId,
    label,
    mode: deep ? "deep" : "quick",
    branch: parentRecords.find((r) => r.gitBranch)?.gitBranch ?? null,
    startedAt: parent.interval ? new Date(parent.interval.start).toISOString() : null,
    wallMs: parent.interval?.ms ?? null,
    parent: { ...parent.usage, cacheHit: cacheHit(parent.usage), toolCalls: parent.tools.total, toolsByName: parent.tools.byName, model: parent.model },
  };

  if (!deep) {
    result.agents = reported;
    result.totals = {
      ...parent.usage,
      totalTokens: totalTokens(parent.usage),
      cacheHit: cacheHit(parent.usage),
      toolCalls: parent.tools.total + reported.reduce((n, a) => n + (a.toolCalls ?? 0), 0),
      agents: reported.length + rejected.size,
      maxDepth: reported.length + rejected.size ? 1 : 0,
      interruptedCalls: rejected.size,
    };
    if (reported.length || rejected.size) {
      warnings.push("quick mode: child token cost is NOT included (lastTurnTokens is the child's final context, not its spend) and depth>=2 agents are invisible - run with --deep");
    }
    result.warnings = warnings;
    return result;
  }

  const subs = loadSubagents(join(logDir, sessionId));
  const reportedById = new Map();
  for (const r of reported) reportedById.set(r.agentId, r);
  for (const s of subs) {
    for (const r of agentResults(s.records)) reportedById.set(r.agentId, r);
    for (const [id, desc] of rejectedAgentCalls(s.records)) rejected.set(id, desc);
  }

  const agents = subs.map((s) => {
    const m = measure(s.records);
    const rep = reportedById.get(s.id) ?? (rejected.has(s.meta.toolUseId) ? { status: "interrupted" } : {});
    return {
      id: s.id,
      parentId: s.meta.parentAgentId ?? null,
      depth: s.meta.spawnDepth ?? 1,
      agentType: s.meta.agentType ?? rep.agentType ?? "general-purpose",
      description: s.meta.description ?? rep.description ?? null,
      shape: s.meta.requestShape ?? null,
      status: rep.status ?? null,
      stoppedByUser: !!s.meta.stoppedByUser,
      model: m.model ?? rep.model,
      self: m.usage,
      baseContext: m.baseContext,
      tools: m.tools,
      interval: m.interval,
      apiErrors: m.apiErrors,
      reportedLastTurnTokens: rep.lastTurnTokens ?? null,
      prompt: firstPrompt(s.records),
    };
  });

  const byId = new Map(agents.map((a) => [a.id, a]));
  const subtree = (a, seen = new Set()) => {
    if (seen.has(a.id)) return emptyUsage();
    seen.add(a.id);
    return agents.filter((c) => c.parentId === a.id).reduce((u, c) => addUsage(u, subtree(c, seen)), a.self);
  };
  for (const a of agents) {
    if (a.parentId && !byId.has(a.parentId)) warnings.push(`agent ${a.id}: parent ${a.parentId} has no transcript`);
  }

  const sig = signals(agents);
  const all = sweep(agents.map((a) => a.interval).filter(Boolean));
  const depths = [...new Set(agents.map((a) => a.depth))].sort();
  const childUsage = agents.reduce((u, a) => addUsage(u, a.self), emptyUsage());
  const totals = addUsage(parent.usage, childUsage);
  const agentMs = agents.reduce((n, a) => n + (a.interval?.ms ?? 0), 0);
  const reportedSum = reported.reduce((n, a) => n + (a.lastTurnTokens ?? 0), 0);
  // Spend that produced nothing: every agent that failed, plus everything below it.
  const failedIds = new Set(sig.failures.map((f) => f.agentId));
  const lost = (a) => (failedIds.has(a.id) ? true : a.parentId && byId.has(a.parentId) ? lost(byId.get(a.parentId)) : false);
  const lostTokens = agents.filter((a) => lost(a)).reduce((n, a) => n + totalTokens(a.self), 0);

  result.totals = {
    ...totals,
    totalTokens: totalTokens(totals),
    cacheHit: cacheHit(totals),
    toolCalls: parent.tools.total + agents.reduce((n, a) => n + a.tools.total, 0),
    agents: agents.length,
    maxDepth: depths.length ? Math.max(...depths) : 0,
    childShare: totalTokens(totals) ? Math.round((totalTokens(childUsage) / totalTokens(totals)) * 1000) / 10 : 0,
    interruptedCalls: rejected.size,
    lostTokens,
  };
  result.parallelism = {
    peakConcurrency: all.peak,
    peakAt: all.peakAt,
    agentWindowMs: all.busyMs,
    agentTimeMs: agentMs,
    factor: all.busyMs ? Math.round((agentMs / all.busyMs) * 10) / 10 : 0,
    byDepth: Object.fromEntries(depths.map((d) => [d, sweep(agents.filter((a) => a.depth === d).map((a) => a.interval).filter(Boolean)).peak])),
  };
  result.understatement = {
    parentSawTokens: reportedSum,
    realChildTokens: totalTokens(childUsage),
    note: "parentSawTokens sums the Agent tool results' totalTokens (last-turn context of depth-1 children)",
  };
  result.agents = agents
    .map((a) => {
      const sub = subtree(a);
      const { prompt, tools, interval: iv, ...rest } = a;
      return {
        ...rest,
        cacheHit: cacheHit(a.self),
        selfTokens: totalTokens(a.self),
        subtreeTokens: totalTokens(sub),
        toolCalls: tools.total,
        toolsByName: tools.byName,
        filesRead: tools.readFiles.length,
        startedAt: iv ? new Date(iv.start).toISOString() : null,
        durationMs: iv?.ms ?? null,
        promptChars: prompt.length,
        promptHead: prompt.slice(0, 2048),
      };
    })
    .sort((x, y) => y.subtreeTokens - x.subtreeTokens);
  result.signals = sig;
  result.warnings = warnings;
  return result;
}

export function toMarkdown(r) {
  const t = r.totals;
  const lines = [
    `## Retro ${r.sessionId.slice(0, 8)}${r.label ? ` - ${r.label}` : ""} (${r.mode})`,
    "",
    `Tokens **${fmtTokens(t.totalTokens)}** (in ${fmtTokens(t.input)} · out ${fmtTokens(t.output)} · cache read ${fmtTokens(t.cacheRead)} · cache write ${fmtTokens(t.cacheWrite)}) · cache hit ${t.cacheHit ?? "-"}% · tool calls ${t.toolCalls} · agents ${t.agents} (max depth ${t.maxDepth}) · wall ${fmtMs(r.wallMs)}`,
  ];
  if (r.parallelism) {
    const p = r.parallelism;
    lines.push(`Parallelism: peak ${p.peakConcurrency} at ${p.peakAt ?? "-"} · factor ${p.factor}× over ${fmtMs(p.agentWindowMs)} of agent activity · children ${t.childShare}% of tokens`);
    lines.push(`Parent saw ${fmtTokens(r.understatement.parentSawTokens)} of ${fmtTokens(r.understatement.realChildTokens)} real child tokens.`);
    if (t.lostTokens) lines.push(`**Lost ${fmtTokens(t.lostTokens)}** in failed/interrupted agents (no result came back).`);
  }
  lines.push("", "| agent | type | depth | self | subtree | cache hit | tools | duration | status |", "|---|---|---|---|---|---|---|---|---|");
  for (const a of r.agents.slice(0, 20)) {
    if (r.mode === "deep") {
      lines.push(`| ${a.id.slice(0, 8)} ${a.description ?? ""} | ${a.agentType} | ${a.depth} | ${fmtTokens(a.selfTokens)} | ${fmtTokens(a.subtreeTokens)} | ${a.cacheHit ?? "-"}% | ${a.toolCalls} | ${fmtMs(a.durationMs)} | ${a.status ?? "-"} |`);
    } else {
      lines.push(`| ${a.agentId.slice(0, 8)} ${a.description ?? ""} | ${a.agentType} | 1 | ? | ? | - | ${a.toolCalls ?? "-"} | ${fmtMs(a.durationMs)} | ${a.status ?? "-"} |`);
    }
  }
  if (r.signals) {
    const s = r.signals;
    lines.push("", "Signals:");
    for (const f of s.sharedFiles.slice(0, 5)) lines.push(`- shared file read by ${f.agents} agents: \`${f.file}\``);
    for (const d of s.duplicatedPrompts) lines.push(`- ${d.siblings} siblings of ${d.parentId} repeat ${d.repeatedChars} prompt chars between them (~${fmtTokens(d.approxTokensRepeated)} tokens)`);
    for (const o of s.outliers) lines.push(`- outlier ${o.agentId.slice(0, 8)} ${o.description ?? o.agentType}: ${o.why.join("; ")}`);
    for (const c of s.concurrency) lines.push(`- ${c.peak} concurrent children of ${c.parentId}, median cache hit ${c.medianCacheHit}%, cache writes ${fmtTokens(c.cacheWriteTokens)}, median first-turn context ${fmtTokens(c.medianBaseContext)}`);
    for (const f of s.failures) lines.push(`- failure ${f.agentId.slice(0, 8)}: status ${f.status ?? "-"}${f.stoppedByUser ? ", stopped by user" : ""}${f.apiErrors ? `, ${f.apiErrors} API errors` : ""}`);
  }
  for (const w of r.warnings) lines.push("", `> ⚠ ${w}`);
  return lines.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const logDir = projectLogDir(args.cwd ?? repoRoot());
  const sessionId = resolveSession(logDir, args._[0] ?? "latest");
  const r = retro({ logDir, sessionId, deep: !!args.deep, label: typeof args.label === "string" ? args.label : null });
  process.stdout.write(args.md ? `${toMarkdown(r)}\n` : `${JSON.stringify(r, null, 2)}\n`);
}
