// node --test .claude/skills/workflow-retro/scripts/retro.test.mjs
// Builds a synthetic session on disk: parent -> A (foreground) -> C (grandchild), parent -> B (background).
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendLedger } from "./append-ledger.mjs";
import { sumUsage } from "./lib.mjs";
import { retro, sweep } from "./retro.mjs";

const SID = "11111111-2222-3333-4444-555555555555";
const T0 = Date.parse("2026-10-01T10:00:00Z");
const ts = (s) => new Date(T0 + s * 1000).toISOString();
const usage = (input, read, write, out) => ({ input_tokens: input, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: out });

// One API message written as one record per content block, each repeating the usage.
const assistant = (id, at, u, blocks) =>
  blocks.map((b) => ({ type: "assistant", timestamp: ts(at), cwd: "/repo", requestId: `req_${id}`, message: { id, model: "claude-opus-5-5", usage: u, content: [b] } }));
const user = (at, content, extra = {}) => ({ type: "user", timestamp: ts(at), cwd: "/repo", message: { role: "user", content }, ...extra });
const read = (id, path) => ({ type: "tool_use", id, name: "Read", input: { file_path: path } });
const agentCall = (id, desc) => ({ type: "tool_use", id, name: "Agent", input: { description: desc, subagent_type: "general-purpose", prompt: "…" } });
const jsonl = (rows) => rows.flat().map((r) => JSON.stringify(r)).join("\n") + "\n";

const SHARED = "Read /repo/docs/severity.md first.\nThis line is the shared review template and is long enough to count.\n";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "retro-"));
  const sub = join(root, SID, "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(
    join(root, `${SID}.jsonl`),
    jsonl([
      user(0, "run the review"),
      assistant("m_p1", 1, usage(10, 0, 1000, 50), [{ type: "thinking", thinking: "" }, agentCall("tu_a", "Review A"), agentCall("tu_b", "Review B")]),
      user(12, [{ type: "tool_result", tool_use_id: "tu_a", content: "done" }], {
        toolUseResult: { agentId: "aaaa", agentType: "general-purpose", status: "completed", totalDurationMs: 10000, totalTokens: 500, totalToolUseCount: 3 },
      }),
      user(2, [{ type: "tool_result", tool_use_id: "tu_b", content: "launched" }], { toolUseResult: { agentId: "bbbb", status: "async_launched" } }),
      user(16, `<task-notification>\n<task-id>bbbb</task-id>\n<status>completed</status>\n<usage><subagent_tokens>300</subagent_tokens><tool_uses>1</tool_uses><duration_ms>10000</duration_ms></usage>\n</task-notification>`),
      assistant("m_p2", 17, usage(5, 1000, 100, 20), [{ type: "text", text: "ok" }]),
    ]),
  );
  // A: 0-10s, spawns C, reads the shared file.
  writeFileSync(join(sub, "agent-aaaa.meta.json"), JSON.stringify({ agentType: "general-purpose", description: "Review A", spawnDepth: 1, requestShape: "foreground" }));
  writeFileSync(
    join(sub, "agent-aaaa.jsonl"),
    jsonl([
      user(1, `${SHARED}Review files of A.`),
      assistant("m_a1", 2, usage(2, 0, 2000, 100), [{ type: "thinking", thinking: "" }, read("r1", "/repo/docs/severity.md"), agentCall("tu_c", "Review C")]),
      user(10, [{ type: "tool_result", tool_use_id: "tu_c", content: "done" }], { toolUseResult: { agentId: "cccc", status: "completed", totalTokens: 100 } }),
      assistant("m_a2", 11, usage(2, 2000, 50, 30), [{ type: "text", text: "A done" }]),
    ]),
  );
  // B: 5-15s, background, reads the shared file.
  writeFileSync(join(sub, "agent-bbbb.meta.json"), JSON.stringify({ agentType: "general-purpose", description: "Review B", spawnDepth: 1, requestShape: "background" }));
  writeFileSync(
    join(sub, "agent-bbbb.jsonl"),
    jsonl([user(5, `${SHARED}Review files of B.`), assistant("m_b1", 15, usage(2, 0, 2000, 40), [read("r2", "/repo/docs/severity.md")])]),
  );
  // C: 6-8s, grandchild of A, reads the shared file.
  writeFileSync(join(sub, "agent-cccc.meta.json"), JSON.stringify({ agentType: "Explore", description: "Review C", spawnDepth: 2, parentAgentId: "aaaa", requestShape: "foreground" }));
  writeFileSync(
    join(sub, "agent-cccc.jsonl"),
    jsonl([user(6, "Look at C."), assistant("m_c1", 8, usage(1, 500, 500, 10), [read("r3", "docs/severity.md"), { type: "text", text: "C" }])]),
  );
  return root;
}

test("usage is counted once per message id, not once per content block", () => {
  const recs = assistant("m1", 0, usage(1, 2, 3, 4), [{ type: "thinking" }, { type: "text" }, { type: "tool_use", name: "Bash", input: {} }]);
  const u = sumUsage(recs);
  assert.equal(u.turns, 1);
  assert.deepEqual([u.input, u.cacheRead, u.cacheWrite, u.output], [1, 2, 3, 4]);
});

test("quick mode reads only the parent and warns that child spend is missing", () => {
  const r = retro({ logDir: fixture(), sessionId: SID });
  assert.equal(r.mode, "quick");
  assert.equal(r.totals.totalTokens, 10 + 1000 + 50 + 5 + 1000 + 100 + 20);
  assert.equal(r.agents.length, 2);
  assert.equal(r.agents.find((a) => a.agentId === "bbbb").status, "completed");
  assert.equal(r.agents.find((a) => a.agentId === "bbbb").lastTurnTokens, 300);
  assert.match(r.warnings[0], /--deep/);
});

test("deep mode builds the tree, rolls up subtree cost and finds the grandchild", () => {
  const r = retro({ logDir: fixture(), sessionId: SID, deep: true });
  const a = r.agents.find((x) => x.id === "aaaa");
  const c = r.agents.find((x) => x.id === "cccc");
  assert.equal(r.totals.agents, 3);
  assert.equal(r.totals.maxDepth, 2);
  assert.equal(c.parentId, "aaaa");
  assert.equal(c.status, "completed");
  assert.equal(a.selfTokens, 2 + 2000 + 100 + 2 + 2000 + 50 + 30);
  assert.equal(a.subtreeTokens, a.selfTokens + c.selfTokens);
  assert.equal(r.understatement.parentSawTokens, 800);
  assert.equal(r.understatement.realChildTokens, r.agents.reduce((n, x) => n + x.selfTokens, 0));
});

test("deep mode measures parallelism", () => {
  const r = retro({ logDir: fixture(), sessionId: SID, deep: true });
  assert.equal(r.parallelism.peakConcurrency, 3);
  assert.equal(r.parallelism.agentWindowMs, 14000);
  assert.equal(r.parallelism.byDepth[2], 1);
});

test("signals: a file read by 3 agents (relative paths resolved against cwd)", () => {
  const r = retro({ logDir: fixture(), sessionId: SID, deep: true });
  assert.deepEqual(r.signals.sharedFiles.map((f) => [f.file, f.agents]), [["/repo/docs/severity.md", 3]]);
  assert.equal(r.signals.failures.length, 0);
});

test("sweep counts touching intervals as sequential", () => {
  assert.equal(sweep([{ start: 0, end: 10 }, { start: 10, end: 20 }]).peak, 1);
  assert.equal(sweep([{ start: 0, end: 10 }, { start: 5, end: 20 }]).busyMs, 20);
});

test("ledger is created with a header, appended to, and not duplicated", () => {
  const r = retro({ logDir: fixture(), sessionId: SID, deep: true, label: "review" });
  const ledger = join(mkdtempSync(join(tmpdir(), "ledger-")), "docs", "retros", "ledger.md");
  assert.equal(appendLedger(ledger, r, "preload severity.md | once").appended, true);
  assert.equal(appendLedger(ledger, r, "again").appended, false);
  assert.equal(appendLedger(ledger, { ...r, mode: "quick" }, null).appended, true);
  const text = readFileSync(ledger, "utf8");
  assert.match(text, /^# Workflow retro ledger/);
  const rows = text.split("\n").filter((l) => l.startsWith("| 2026-"));
  assert.equal(rows.length, 2);
  assert.match(rows[0], /\| 11111111 \| review \| deep \| 3 \/ 2 \|.*preload severity\.md \\\| once \|$/);
});

// The user rejects a running foreground Agent call: no agentId comes back, only an is_error result.
function interruptedFixture() {
  const root = mkdtempSync(join(tmpdir(), "retro-int-"));
  const sub = join(root, SID, "subagents");
  mkdirSync(sub, { recursive: true });
  writeFileSync(
    join(root, `${SID}.jsonl`),
    jsonl([
      user(0, "review"),
      assistant("m_p1", 1, usage(1, 0, 100, 10), [agentCall("tu_x", "Review X")]),
      user(9, [{ type: "tool_result", tool_use_id: "tu_x", is_error: true, content: "The user doesn't want to proceed with this tool use." }], {
        toolUseResult: "User rejected tool use",
      }),
    ]),
  );
  writeFileSync(join(sub, "agent-xxxx.meta.json"), JSON.stringify({ agentType: "general-purpose", description: "Review X", spawnDepth: 1, toolUseId: "tu_x" }));
  writeFileSync(join(sub, "agent-xxxx.jsonl"), jsonl([user(1, "Review X."), assistant("m_x1", 5, usage(1, 0, 1000, 9), [{ type: "text", text: "…" }])]));
  writeFileSync(join(sub, "agent-yyyy.meta.json"), JSON.stringify({ agentType: "Explore", description: "Y", spawnDepth: 2, parentAgentId: "xxxx", toolUseId: "tu_y" }));
  writeFileSync(join(sub, "agent-yyyy.jsonl"), jsonl([user(2, "Look."), assistant("m_y1", 4, usage(0, 0, 500, 0), [{ type: "text", text: "…" }])]));
  return root;
}

test("an interrupted Agent call is a failure and its whole subtree counts as lost", () => {
  const logDir = interruptedFixture();
  const deep = retro({ logDir, sessionId: SID, deep: true });
  assert.equal(deep.agents.find((a) => a.id === "xxxx").status, "interrupted");
  assert.deepEqual(deep.signals.failures.map((f) => f.agentId), ["xxxx"]);
  assert.equal(deep.totals.interruptedCalls, 1);
  assert.equal(deep.totals.lostTokens, 1 + 1000 + 9 + 500);
  const quick = retro({ logDir, sessionId: SID });
  assert.equal(quick.totals.interruptedCalls, 1);
  assert.match(quick.warnings[0], /1 Agent call\(s\) were rejected\/interrupted.*Review X/);
});
