// PreToolUse hook: a PR is opened or merged only on top of a fresh PASS verdict
// from the pr-self-review skill. No verdict, a stale one (files changed since the
// review) or a BLOCKED one denies the call and tells the agent what to do next.
import { isAbsolute, resolve } from "node:path";
import { checkGate, currentBranch, repoRoot } from "../skills/pr-self-review/scripts/lib.mjs";

// Only a real invocation counts: heredoc bodies and quoted strings are dropped first,
// so a commit message or a report that merely mentions the command is not gated.
function stripText(command) {
  return command
    .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, " ")
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}
const PR_COMMAND = /(?:^|[;&|(\n])\s*(?:\w+=\S*\s+)*gh\s+pr\s+(create|merge)\b/;
const LEADING_CD = /(?:^|[;&|(\n])\s*cd\s+("[^"]+"|'[^']+'|[^\s;&|]+)/g;

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
    }),
  );
}

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return;
  }
  const command = input.tool_input?.command ?? "";
  const bare = stripText(command);
  const action =
    input.tool_name === "Bash" ? bare.match(PR_COMMAND)?.[1] : /create_pull_request/.test(input.tool_name ?? "") ? "create" : null;
  if (!action || /\s--help\b/.test(bare)) return;

  // `cd /some/worktree && gh pr create` is about that checkout, not the session's.
  let cwd = input.cwd || process.cwd();
  const upToPr = command.slice(0, command.search(/gh\s+pr\s+(create|merge)/));
  for (const [, target] of upToPr.matchAll(LEADING_CD)) {
    const dir = target.replace(/^['"]|['"]$/g, "");
    cwd = isAbsolute(dir) ? dir : resolve(cwd, dir);
  }

  let root;
  try {
    root = repoRoot(cwd);
  } catch {
    return; // not a git checkout: nothing to gate
  }

  let gate;
  try {
    gate = checkGate(root);
  } catch (err) {
    // Fail closed: an unreadable verdict must not open the door.
    return deny(`The PR self-review verdict could not be verified (${err.message}). Re-run the pr-self-review skill.`);
  }

  // Merging some other PR from this checkout is not this review's business.
  if (action === "merge" && (gate.state === "missing" || gate.verdict?.branch !== currentBranch(root))) return;
  if (gate.state === "pass") return;

  const v = gate.verdict;
  const reasons = {
    missing: "No PR self-review has been recorded for these changes.",
    stale: `The changes moved since the last PR self-review (${(gate.changed ?? []).slice(0, 5).join(", ")}).`,
    incomplete: "The last PR self-review did not finish: some matched skills or gates were not run.",
    blocked:
      `The last PR self-review is BLOCKED: ${v?.summary?.critical ?? 0} critical finding(s), ` +
      `${v?.summary?.gatesFailed ?? 0} failed gate(s). Fix them, then re-run the review.`,
  };
  deny(
    `${reasons[gate.state]} Run the pr-self-review skill and retry once it records PASS. ` +
      "Do not write the verdict by hand or work around this gate; only the user can dismiss a finding.",
  );
});
