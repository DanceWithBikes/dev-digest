import type { WorkflowCase } from "../src/index.js";

/**
 * Systemic ("workflow") tier — asserts the real on-disk harness (CLAUDE.md + skills + subagents,
 * loaded via settingSources:["project"]) behaves as documented. Organized by scenario, not by a
 * single artifact, because these behaviors are cross-cutting. Nested-CLAUDE.md delivery lives in
 * nested-memory.cases.ts.
 *
 * Budget: 6 Claude sessions total.
 *   - 4 × trace     → 1 session each                      = 4
 *   - 1 × activation pair (positive + near-miss negative) = 2
 *
 * `trace` folds several assertions into ONE session (cheaper, coarser) and stops early once its
 * evidence is in — so a dispatch-bearing trace never waits out the nested subagent's full run.
 */
export const cases: WorkflowCase[] = [
  // --- trace (1 session): server conventions reach the context + subagent dispatch, together -----
  {
    kind: "trace",
    // Endpoint must NOT already exist, or the model reviews the existing code inline instead of
    // planning-then-dispatching. GET /reviews/:id/export is genuinely absent from routes.ts.
    // The API conventions live in server/CLAUDE.md (→ AGENTS.md), which loads on any Read under
    // server/ — so assert its delivery rather than one specific file the model chose to open.
    name: "API-route task loads server conventions AND pulls the architecture-reviewer",
    prompt:
      "Я планую додати НОВИЙ, ще не реалізований ендпоінт GET /reviews/:id/export (віддає ревʼю як " +
      "markdown). Спершу звірся з конвенціями API цього репо. Потім ОБОВʼЯЗКОВО запусти сабагента " +
      "architecture-reviewer, щоб він оцінив мій план на відповідність onion-шарам — не рецензуй сам.",
    expectMemoryLoaded: ["server/CLAUDE.md"],
    expectSubagents: ["architecture-reviewer"],
    // 8 was too tight: the model sometimes spends ~10 tool calls on the reviews module before it
    // dispatches, and hits max-turns with no subagent (2026-10-06). The early stop keeps it cheap.
    maxTurns: 14,
  },

  // --- trace (1 session): CLAUDE.md "Docs" routing → the feature's spec --------------------------
  {
    kind: "trace",
    // Tests the root CLAUDE.md routing ("docs/specs/"), so the prompt must push toward CONSULTING
    // the docs, not exploring source — otherwise the model dives into the brief module's code.
    name: "feature-change task follows CLAUDE.md to the feature's spec",
    prompt:
      "Я збираюся змінити фічу PR Brief. Перш ніж торкатися коду — звірся з настановами цього репо " +
      "(CLAUDE.md) щодо того, де лежать специфікації, і прочитай специфікацію саме цієї фічі.",
    expectFilesRead: ["docs/specs/pr-brief.md"],
    maxTurns: 8,
  },

  // --- trace (1 session): CLAUDE.md "found something non-obvious" routing → nearest insights ----
  // Was a contrast case, but the control run (empty tmpdir) could still reach the real repo by
  // absolute path, making the negative flaky. As a single-session trace it reliably checks the
  // same routing rule: in the real repo, the discovery prompt reads the package's insights.
  {
    kind: "trace",
    name: "CLAUDE.md routes a gotchas lookup to reviewer-core/docs/insights.md",
    prompt:
      "У reviewer-core я стикнувся з несподіваною поведінкою — щось працює не так, як я очікував. " +
      "За настановами цього репо, де це вже могло бути задокументовано? Прочитай той файл.",
    expectFilesRead: ["reviewer-core/docs/insights.md"],
    maxTurns: 5,
  },

  // --- trace (1 session): CLAUDE.md "Docs" routing → TESTING.md ---------------------------------
  {
    kind: "trace",
    // The root CLAUDE.md already lists `pnpm test` / `e2e:hermetic`, so a bare "how do I test?" is
    // answered from context with no Read. Ask for the doc explicitly to test the routing itself.
    name: "testing question follows CLAUDE.md to TESTING.md",
    prompt:
      "Хочу зрозуміти, як у цьому репо влаштоване тестування (unit, integration, e2e). За настановами " +
      "репо (CLAUDE.md) знайди документ про тестування і прочитай його, перш ніж відповідати.",
    expectFilesRead: ["TESTING.md"],
    maxTurns: 5,
  },

  // --- activation pair (2 sessions): positive + near-miss negative ------------------------------
  {
    kind: "activation",
    name: "engineering-insights activates on a genuine discovery",
    prompt:
      "Щойно з'ясував, чому pgvector-запит повертав нуль рядків — розмірність колонки не збіглася " +
      "після зміни моделі ембедингів. Хочу це зафіксувати, щоб більше не наступати.",
    skill: "engineering-insights",
    shouldActivate: true,
    maxTurns: 4,
  },
  {
    kind: "activation",
    name: "near-miss negative — explaining the same topic must NOT record an insight",
    prompt:
      "Поясни, як у pgvector працюють розмірності колонок і чому невідповідність повертає нуль рядків.",
    skill: "engineering-insights",
    shouldActivate: false,
    maxTurns: 4,
  },
];
