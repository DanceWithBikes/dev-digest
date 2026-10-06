import type { WorkflowCase } from "../src/index.js";

/**
 * Nested CLAUDE.md delivery — when work enters a folder, do its local rules reach the context?
 *
 * Claude Code loads a nested CLAUDE.md on touch (a Read inside the folder), never at startup: every
 * CLAUDE.md between the repo root and the read file is attached. Only the on-disk transcript shows
 * it, so `expectMemoryLoaded` reads that (src/runtime/transcript.ts). Each prompt names one real
 * file, so the case is a deterministic regression check: it fails when a `CLAUDE.md -> AGENTS.md`
 * symlink is lost, a folder is renamed, or settingSources stops loading project memory.
 *
 * This proves DELIVERY, not that the model APPLIED the rule. A 2026-10-06 probe (4 realistic
 * tasks × 3 runs) showed haiku and sonnet both applied the delivered rule 12/12.
 *
 * Budget: 8 Claude sessions, each stops as soon as the expected memory is attached (~5-10 s).
 */
export const cases: WorkflowCase[] = [
  // --- server: two- and three-level nesting ---------------------------------------------------
  {
    kind: "trace",
    name: "server module task loads server/ and server/src/modules/ CLAUDE.md",
    prompt:
      "Я хочу додати новий серверний модуль `exports` за зразком модуля pulls. Подивись на " +
      "server/src/modules/pulls/routes.ts і скажи, з яких файлів має складатися новий модуль. Код не пиши.",
    expectMemoryLoaded: ["server/CLAUDE.md", "server/src/modules/CLAUDE.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "schema task loads server/ and server/src/db/ CLAUDE.md",
    prompt:
      "Хочу додати колонку `archived_at` до таблиці репозиторіїв. Відкрий server/src/db/schema.ts і " +
      "скажи, які кроки для цього потрібні. Код не пиши.",
    expectMemoryLoaded: ["server/CLAUDE.md", "server/src/db/CLAUDE.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "error-handling task loads server/ and server/src/platform/ CLAUDE.md",
    prompt:
      "Мені треба повернути 404 із сервісу, коли ревʼю не знайдено. Подивись server/src/platform/errors.ts " +
      "і скажи, як це правильно зробити. Код не пиши.",
    expectMemoryLoaded: ["server/CLAUDE.md", "server/src/platform/CLAUDE.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "new-adapter task loads server/ and server/src/adapters/ CLAUDE.md",
    prompt:
      "Хочу додати адаптер для Slack-нотифікацій. Подивись server/src/adapters/index.ts і скажи, що саме " +
      "треба створити і де його підключити. Код не пиши.",
    expectMemoryLoaded: ["server/CLAUDE.md", "server/src/adapters/CLAUDE.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "MCP tool task loads server/ and server/src/mcp/ CLAUDE.md",
    prompt:
      "Хочу додати шостий інструмент у DevDigest MCP-сервер. Подивись server/src/mcp/server.ts і скажи, " +
      "де і як реєструються інструменти. Код не пиши.",
    expectMemoryLoaded: ["server/CLAUDE.md", "server/src/mcp/CLAUDE.md"],
    maxTurns: 6,
  },

  // --- client: package level + a deep route folder (bracketed path segments) -------------------
  {
    kind: "trace",
    name: "PR-page task loads client/ and the PR-page CLAUDE.md",
    prompt:
      "Хочу додати новий лейбл у BlastRadiusCard на сторінці PR " +
      "(client/src/app/repos/[repoId]/pulls/[number]/page.tsx). Відкрий page.tsx і скажи, куди піде новий рядок. Код не пиши.",
    expectMemoryLoaded: ["client/CLAUDE.md", "client/src/app/repos/[repoId]/pulls/[number]/CLAUDE.md"],
    maxTurns: 6,
  },

  // --- the other packages -----------------------------------------------------------------------
  {
    kind: "trace",
    name: "grounding question loads reviewer-core/ CLAUDE.md",
    prompt:
      "Подивись reviewer-core/src/grounding.ts і поясни, що відбувається з finding, який не цитує " +
      "реальний рядок диффу. Код не пиши.",
    expectMemoryLoaded: ["reviewer-core/CLAUDE.md"],
    maxTurns: 6,
  },
  {
    kind: "trace",
    name: "new e2e flow task loads e2e/ CLAUDE.md",
    prompt:
      "Хочу написати новий e2e-флоу для сторінки агентів. Подивись e2e/specs/03-agents.flow.json і скажи, " +
      "як має виглядати новий файл. Код не пиши.",
    expectMemoryLoaded: ["e2e/CLAUDE.md"],
    maxTurns: 6,
  },
];
