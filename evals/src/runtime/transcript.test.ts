import { describe, expect, test } from "vitest";
import { parseNestedMemory, projectSlug } from "./transcript.js";

const ROOT = "/Users/x/dev-digest";
const nested = (path: string) => JSON.stringify({ attachment: { type: "nested_memory", path, content: {} } });

describe("parseNestedMemory", () => {
  test("returns repo-relative paths in load order, deduplicated", () => {
    const jsonl = [
      JSON.stringify({ type: "user", message: { content: "Read server/src/modules/pulls/routes.ts" } }),
      nested(`${ROOT}/server/CLAUDE.md`),
      nested(`${ROOT}/server/src/modules/CLAUDE.md`),
      nested(`${ROOT}/server/CLAUDE.md`),
    ].join("\n");
    expect(parseNestedMemory(jsonl, ROOT)).toEqual(["server/CLAUDE.md", "server/src/modules/CLAUDE.md"]);
  });

  test("ignores other attachment types and a partially flushed last line", () => {
    const jsonl = [
      JSON.stringify({ attachment: { type: "skill_listing", path: `${ROOT}/x` } }),
      nested(`${ROOT}/client/CLAUDE.md`),
      '{"attachment":{"type":"nested_memory","path":"/Users/x/dev-dig',
    ].join("\n");
    expect(parseNestedMemory(jsonl, ROOT)).toEqual(["client/CLAUDE.md"]);
  });
});

test("projectSlug matches Claude Code's transcript folder naming", () => {
  expect(projectSlug("/Users/detrix/Coding/AI_Neoversity/dev-digest")).toBe(
    "-Users-detrix-Coding-AI-Neoversity-dev-digest",
  );
});
