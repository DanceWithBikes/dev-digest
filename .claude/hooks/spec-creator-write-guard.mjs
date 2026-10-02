// PreToolUse hook, wired only in .claude/agents/spec-creator.md frontmatter, so it runs
// only while that subagent is active. It keeps every write inside an existing
// `docs/specs/` directory and inside a spec that is still a draft:
//   - the target is `<any>/docs/specs/<kebab-name>.md`, never README.md, never
//     under server/clones/ or node_modules/, and its directory already exists;
//   - an existing spec that is not a draft (approved, implemented, legacy) may be
//     changed with Edit only — a whole-file Write over it is denied;
//   - after every write the file carries a `Spec ID: SPEC-NN` line and exactly
//     `Status: draft` — a changed spec goes back to draft for re-approval, and
//     promoting it to approved/implemented is a human / doc-writer decision.
// Anything it cannot verify is denied (fail closed).
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

const SPEC_PATH = /^(?:[a-z0-9._-]+\/)*docs\/specs\/[a-z0-9][a-z0-9-]*\.md$/;
const FORBIDDEN_PREFIXES = ["server/clones/", "node_modules/"];
const DRAFT = /^Status: draft[ \t]*$/m;
const NON_DRAFT = /^Status: (?!draft[ \t]*$).*$/m;
const SPEC_ID = /^Spec ID: SPEC-\d{2,}[ \t]*$/m;

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `spec-creator write guard: ${reason}`,
      },
    }),
  );
}

function applyEdits(current, edits) {
  let next = current;
  for (const { old_string: oldStr = "", new_string: newStr = "", replace_all: all } of edits) {
    if (!next.includes(oldStr)) return null;
    next = all ? next.split(oldStr).join(newStr) : next.replace(oldStr, () => newStr);
  }
  return next;
}

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    return deny("unreadable hook input.");
  }

  const tool = input.tool_name ?? "";
  if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) return;
  if (tool === "NotebookEdit") return deny("notebooks are not specs.");

  const ti = input.tool_input ?? {};
  const filePath = ti.file_path;
  if (typeof filePath !== "string" || !filePath) return deny("no file_path.");

  let root;
  try {
    root = realpathSync(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd());
  } catch {
    return deny("cannot resolve the project root.");
  }
  const abs = isAbsolute(filePath) ? filePath : resolve(input.cwd || root, filePath);
  let dir;
  try {
    dir = realpathSync(dirname(abs));
  } catch {
    return deny(`${dirname(abs)} does not exist — specs go into an existing docs/specs/ directory only.`);
  }
  const rel = relative(root, resolve(dir, basename(abs))).split(sep).join("/");

  if (rel.startsWith("..") || isAbsolute(rel)) return deny(`${filePath} is outside the repository.`);
  if (FORBIDDEN_PREFIXES.some((p) => rel.startsWith(p) || rel.includes(`/${p}`)))
    return deny(`${rel} is under a forbidden tree (server/clones/, node_modules/).`);
  if (!SPEC_PATH.test(rel) || basename(rel) === "README.md")
    return deny(`${rel} is not a spec file. Allowed: <any>/docs/specs/<kebab-case-feature>.md, never README.md.`);

  const exists = existsSync(abs);
  let current = "";
  if (exists) {
    try {
      current = readFileSync(abs, "utf8");
    } catch {
      return deny(`cannot read ${rel}.`);
    }
    if (!DRAFT.test(current) && tool === "Write")
      return deny(`${rel} is not a draft — change an approved, implemented or legacy spec with Edit, never overwrite it.`);
  } else if (tool !== "Write") {
    return deny(`${rel} does not exist; create it with Write.`);
  }

  let next;
  if (tool === "Write") next = ti.content ?? "";
  else {
    const edits = tool === "MultiEdit" ? ti.edits ?? [] : [ti];
    next = applyEdits(current, edits);
    if (next === null) return; // the tool itself will fail on a non-matching old_string
  }

  if (!DRAFT.test(next) || NON_DRAFT.test(next))
    return deny(`${rel} must say exactly "Status: draft" after the write — only a human approves a spec, and doc-writer marks it implemented.`);
  if (!SPEC_ID.test(next))
    return deny(`${rel} must carry a "Spec ID: SPEC-NN" line after the write — adopting a legacy spec adds it in the same edit as the status.`);
});
