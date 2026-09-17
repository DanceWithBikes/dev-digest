// Stop hook: once per turn, nudge the agent to record non-obvious findings
// via the engineering-insights skill. `stop_hook_active` prevents a loop.
let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  const input = JSON.parse(raw || "{}");
  if (input.stop_hook_active) return;
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
