import { expect, test } from "vitest";
import { isNestedMemory } from "./stripped-repo.js";

test("isNestedMemory strips package/module rules but keeps the root and .claude/", () => {
  expect(isNestedMemory("server/AGENTS.md")).toBe(true);
  expect(isNestedMemory("server/CLAUDE.md")).toBe(true);
  expect(isNestedMemory("client/src/app/repos/[repoId]/pulls/[number]/AGENTS.md")).toBe(true);
  expect(isNestedMemory("AGENTS.md")).toBe(false);
  expect(isNestedMemory("CLAUDE.md")).toBe(false);
  expect(isNestedMemory(".claude/skills/zod/AGENTS.md")).toBe(false);
  expect(isNestedMemory("server/README.md")).toBe(false);
  expect(isNestedMemory("docs/MY_AGENTS.md")).toBe(false);
});
