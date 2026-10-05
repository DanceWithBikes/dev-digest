# Signal → action

`retro.mjs --deep` computes the signals; this file turns them into actions. Thresholds live in `THRESHOLDS` in `scripts/retro.mjs`. Each action must name **what to change, where** (the agent definition, skill, or orchestration script that spawned the agents), **the evidence** (agent id or description, file, number), and **the expected saving**, estimated from the same numbers.

Start from the agent with the largest `subtreeTokens`. Fixing it is usually worth more than every other fix combined.

## 1. Remove duplicated context: `signals.duplicatedPrompts`

**Signal:** siblings repeat ≥ 2 000 prompt chars between them (`approxTokensRepeated`). Also watch `medianBaseContext` in `signals.concurrency`, which is the first-turn context every child pays for before doing anything.

**Action:**
- Move the repeated instructions out of the per-agent prompt and into a file the agent reads, or into the agent definition (`.claude/agents/<name>.md`), which is cached. Then pass only the varying part (scope, file list).
- When the repeated text is a template (pr-self-review style), keep the stable part **first** and the varying part **last**. A stable prefix is a cache hit; a varying prefix rewrites the cache for every sibling.

**Saving:** `approxTokensRepeated` input tokens per run, plus the cache writes that a stable prefix avoids.

## 2. Preload a shared file: `signals.sharedFiles`

**Signal:** the same file is read by ≥ 3 agents.

**Action:**
- Short file (< ~2k tokens, e.g. a severity rubric): have the parent read it once and paste it into each prompt's **stable prefix**, or bake it into the agent definition. The child then doesn't spend a tool turn on it, and each extra turn re-sends the whole context.
- Long file that every child only needs part of: the parent extracts the relevant excerpt.
- Code under review that several reviewers read: that's fine, they need it. Only flag it when the readers do the same job.

**Saving:** roughly (readers − 1) × (file tokens + one turn of `baseContext` cache read).

## 3. Split an overloaded role: `signals.outliers`

**Signal:** an agent spends > 2× the sibling median in tokens or tool calls, or its peak context exceeds 150k (it is dragging a huge context through every turn).

**Action:**
- Big scope (many files or many skills in one agent): split it by scope or by files into 2–3 agents of the same type.
- Long exploratory loops (`toolsByName` dominated by Bash/Grep/Read): give it a narrower prompt with paths, or put a cheap `Explore` step in front that returns a file list.
- Peak context > 150k: split, or tell it to return conclusions instead of dumps.
- One sibling that is legitimately bigger (security reviews more than zod) is **not** an outlier to act on. Say so instead of inventing an action.

**Saving:** the outlier's excess over the median, minus the extra `baseContext` of the new agents.

## 4. Reduce concurrency: `signals.concurrency`, `signals.failures`, `parallelism`

**Signal:** ≥ 6 siblings alive at once, especially when
- `lowCacheHit` (median < 50%): concurrent siblings all write their own cache instead of reading a warm one;
- `failures` show API errors, `stoppedByUser`, or a non-`completed` status;
- `parallelism.factor` is far below `peakConcurrency`, meaning most agents wait or finish very unevenly.

**Action:**
- Fan out in batches (e.g. 3–4 at a time). The first batch warms the shared prefix and later batches get cache reads.
- Merge tiny siblings (each < ~1/3 of median tokens) into one agent; each one pays the full `baseContext` on its own.
- Run in the `background` only what the parent doesn't need right away.

**Saving:** cache writes of the merged or batched siblings (`cacheWriteTokens`), and failed runs that no longer have to be retried.

## 5. Low cache hit overall

**Signal:** `totals.cacheHit` < 70% or a single agent < 50%.

**Action:** look for prompt content that changes on every call and sits *before* the stable part (timestamps, a file list, a diff), and move it to the end.

## 6. Interrupted fan-out: `totals.lostTokens`, `failures[].status == "interrupted"`

**Signal:** `lostTokens` > 0. Agent calls were rejected or interrupted (`totals.interruptedCalls`), or children failed, so their whole subtree's spend produced no result. A wave of interruptions that all hit at the same moment means the user stopped a fan-out of foreground agents that was blocking them.

**Action:**
- Run long fan-outs in `background` and collect the results through notifications: the parent stays responsive, and an interruption doesn't throw away finished children.
- Or fan out in batches of 4–5, so an interruption loses at most one batch.
- If the next session reruns the same work, retro both runs with the same `--label`. The interrupted row shows what the restart cost.

**Saving:** `lostTokens` per interrupted run.

## No action

If none of the signals fire, write "no action - run is efficient" and still append the row. A flat trend is data too.
