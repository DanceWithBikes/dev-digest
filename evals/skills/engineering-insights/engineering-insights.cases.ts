import type { SkillCase } from "../../src/index.js";

// "quality" cases run with no tools (skillTask measures SKILL.md in isolation), so each prompt
// inlines the session facts and the current insights file the skill would normally Read itself.

const NO_TOOLS = `Everything you would normally read is included below — treat it as already read. Show the exact entry you would insert (and its target file and section) as text; do not ask for tool access.`;

const EXISTING_FILE = `Current content of server/src/modules/reviews/docs/insights.md:

## What Works
- **2026-09-02 · Batch embeddings** — embed in batches of 20. Where: \`server/src/modules/reviews/embed.ts:31\` (\`embedBatch\`)

## Recurring Errors & Fixes
- **2026-09-20 · pgvector dimension mismatch** — \`error: expected 1536 dimensions, not 3072\`. Cause: embedding model was switched without a migration. Fix: regenerate the column via \`pnpm db:generate\`. (×2)
  Where: \`server/src/db/schema/embeddings.ts:12\` (\`embedding\`)`;

export const cases: SkillCase[] = [
  {
    name: "dead end is recorded as What Doesn't Work with Tried/Failed/Instead and a precise Where",
    kind: "quality",
    prompt: `${NO_TOOLS}

Session: in server/src/modules/ingest/pipeline.ts line 42 (function ingestAll) I used Promise.all over all PR files. With ~30+ files it times out after about 30 seconds. I reverted to Promise.allSettled in batches of 10 and it works. The file server/src/modules/ingest/docs/insights.md exists but has no entries yet. Record what we learned.`,
    grounding: ["What Doesn't Work", "Where:", "pipeline.ts:42"],
    practices: [
      "the entry is placed under the 'What Doesn't Work' section, not under 'What Works' or Session Notes",
      "the entry follows the pattern 'Tried: … → Failed because: … → Instead: …' (or an equivalent three-part structure naming what was tried, why it failed, and what to do instead)",
      "the entry names the concrete fix: Promise.allSettled with batches of 10, and the symptom: timeout with ~30 items",
      "the entry has a 'Where:' line containing both a file:line and a symbol name (e.g. pipeline.ts:42 and ingestAll)",
      "the entry starts with an absolute date in YYYY-MM-DD form, not a relative one like 'today'",
    ],
    threshold: 0.7,
    maxTurns: 8,
  },
  {
    name: "picks the nearest docs/insights.md, and the root file for cross-package insights",
    kind: "quality",
    prompt: `${NO_TOOLS}

Two things came up. These docs/insights.md files all exist: docs/insights.md, server/docs/insights.md, client/docs/insights.md, server/src/modules/reviews/docs/insights.md.
(A) While editing server/src/modules/reviews/service.ts I found that findings with severity "nit" are silently dropped before persisting (service.ts:77, filterFindings).
(B) I changed a contract in server/src/vendor/shared/contracts/platform.ts (PrMeta) without the client/src/vendor/shared copy; it compiled and broke only at runtime. The fix is to always diff -r both copies.
For each, say which insights file it goes to and why.`,
    grounding: ["server/src/modules/reviews/docs/insights.md", "docs/insights.md"],
    practices: [
      "insight (A) is assigned to server/src/modules/reviews/docs/insights.md, the nearest insights file to the edited module",
      "insight (B) is assigned to the root docs/insights.md because it spans several packages (server and client)",
      "the answer justifies the choice by walking up from the edited file to the nearest docs/insights.md, or by saying the insight spans multiple packages",
      "the answer does not put insight (A) into the root docs/insights.md or server/docs/insights.md",
    ],
    threshold: 0.7,
    maxTurns: 8,
  },
  {
    name: "refuses noise and secrets instead of recording them",
    kind: "quality",
    prompt: `${NO_TOOLS}

Please record these as insights in the nearest docs/insights.md:
1. "Promises can be tricky, be careful with async."
2. "Use OPENROUTER_API_KEY=sk-or-v1-abc123def456 for the eval runs."
3. "Migrations do NOT run on server boot (already stated in the root AGENTS.md)."`,
    practices: [
      "the answer declines to record 'Promises can be tricky' because it is generic noise that is not specific, located, or prescriptive",
      "the answer declines to record the API key and says secrets must never be written to insights files",
      "the answer does not repeat the key value sk-or-v1-abc123def456 inside any proposed insights entry",
      "the answer declines to record the migrations note because it is already stated in AGENTS.md",
    ],
    threshold: 0.75,
    maxTurns: 8,
  },
  {
    name: "recurring error bumps the counter, stays append-only, and proposes promotion at x3",
    kind: "quality",
    prompt: `${NO_TOOLS}

${EXISTING_FILE}

Session: I hit \`error: expected 1536 dimensions, not 3072\` again in server/src/db/schema/embeddings.ts:12 (embedding). Same cause: embedding model was switched without a migration. Record it, then report back to me the way the skill prescribes.`,
    grounding: ["×3"],
    practices: [
      "the answer updates the existing 'pgvector dimension mismatch' entry by bumping its counter from (×2) to (×3) instead of adding a duplicate entry",
      "the answer proposes to the user promoting the fix into the module's AGENTS.md as a one-line rule, because the counter reached ×3",
      "the answer applies the change as a targeted edit anchored on the existing entry or section, and does not rewrite or replace the whole file or reword other entries",
      "the answer ends with a one-line confirmation of the form 'Insight recorded → <path> (<section>)'",
    ],
    threshold: 0.7,
    maxTurns: 8,
  },
];
