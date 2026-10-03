// Stop hook: nudge the agent to record non-obvious findings via the
// engineering-insights skill — but only on turns that did real work: edited a
// file, or ran a subagent (whose "insights to record" the caller must write).
// A pure conversation turn ends silently instead of paying for an extra round.
// `stop_hook_active` prevents a loop.
import { readFileSync } from "node:fs";

const WORK_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Agent", "Task"]);

// Tool names used since the last real user prompt (not a tool result, not a
// hook or system message). Returns null when the transcript cannot be read.
function toolsThisTurn(transcriptPath) {
  try {
    const entries = readFileSync(transcriptPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((e) => !e.isSidechain && (e.type === "user" || e.type === "assistant"));
    const isPrompt = (e) => {
      if (e.type !== "user" || e.isMeta) return false;
      const c = e.message?.content;
      return typeof c === "string" || (Array.isArray(c) && c.some((x) => x.type !== "tool_result"));
    };
    let start = 0;
    entries.forEach((e, i) => {
      if (isPrompt(e)) start = i;
    });
    return entries
      .slice(start)
      .flatMap((e) => (e.type === "assistant" && Array.isArray(e.message?.content) ? e.message.content : []))
      .filter((x) => x.type === "tool_use")
      .map((x) => x.name);
  } catch {
    return null;
  }
}

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(raw || "{}");
  if (input.stop_hook_active) return;
  const tools = input.transcript_path ? toolsThisTurn(input.transcript_path) : null;
  // Unreadable transcript: fall back to nudging, as before.
  if (tools && !tools.some((name) => WORK_TOOLS.has(name))) return;
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason:
        "Insights check: did this turn reveal anything non-obvious (dead end, library quirk, recurring error, implicit convention, open question)? " +
        "If yes, apply the engineering-insights skill and write it to the nearest docs/insights.md. " +
        "If not, stop without comment.",
    }),
  );
});
