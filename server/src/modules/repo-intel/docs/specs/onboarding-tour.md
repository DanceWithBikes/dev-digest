# Spec: Onboarding Tour — server/modules/repo-intel

Spec ID: SPEC-02
Status: approved
Overview: [../../../../../../docs/specs/onboarding-tour.md](../../../../../../docs/specs/onboarding-tour.md)

## Scope in this module

repo-intel turns on hotness, so that every file's rank becomes PageRank × (1 + hotness). Hotness comes from the per-file commit counts in the clone's recent history. The resync fetch already brings in up to 50 commits, and a first depth-1 clone counts as no history. Every repo indexed before this change is fully reindexed on its next refresh, so that it gains hotness (AC-106).

The `repoIntel.*` facade also exposes read-only index facts for the onboarding module:
- index state, with the indexed and candidate source-file counts (AC-1, AC-38, AC-39, AC-49, AC-50, AC-62)
- ranked files (AC-18, AC-27)
- import edges and the dependency chains built from them (AC-28, AC-29, AC-30)
- endpoints (AC-19)
- structure: the directory tree and the top-level directories with their indexed file counts (AC-3, AC-19, AC-56)

These readers only read the index. They never read manifest files, the README or any other file content from the clone: the onboarding module reads those through its own port, with its own allow-list and secret refusal (AC-21, AC-25, AC-26).

## Acceptance criteria (EARS)

- [ ] AC-7 WHEN the index computes file ranks, during a full index or an incremental refresh, the indexer shall count, for each indexed file, the commits that touched it among the at most 50 most recent commits present in the clone.
- [ ] AC-8 The indexer shall exclude from that count the commit at the clone's shallow boundary.
- [ ] AC-9 The indexer shall set each indexed file's hotness to its commit count divided by the highest commit count of any indexed file.
- [ ] AC-10 IF no indexed file has a counted commit, THEN the indexer shall set every indexed file's hotness to 0.
- [ ] AC-11 The indexer shall set each indexed file's rank to its PageRank × (1 + hotness), and compute its percentile from that rank.
- [ ] AC-12 The index state shall report whether hotness was available for the last rank computation and how many commits were counted.
- [ ] AC-13 Computing hotness shall make zero model calls and zero GitHub API calls.
- [ ] AC-14 The indexer shall compute identical hotness values for the same set of commits present in the clone.
- [ ] AC-106 WHEN a repo whose index was built before hotness existed is next refreshed, the indexer shall rebuild that repo's index in full, so that every indexed file gains hotness.

## Module notes

- This reverses the "Option B" decision (rank = PageRank, hotness = 0, because the clone is shallow). The `hotness` column was kept for exactly this switch: `server/src/modules/repo-intel/pipeline/rank.ts:4-7`, `server/src/db/schema/repo-intel.ts:95-98`. The index stats already carry `hotnessAvailable: false`: `server/src/modules/repo-intel/pipeline/full.ts:262`, `server/src/modules/repo-intel/pipeline/incremental.ts:251`.
- Consumers read only through the facade and never import the pipeline: `server/src/modules/repo-intel/AGENTS.md:5-6`. A changed rank therefore reaches every existing rank consumer (Blast Radius caller order, Conventions samples, the repo map, the review prompt's caller ranks) without changes on their side. That reordering is accepted (overview, Edge cases).
- AC-106 is met by bumping `INDEXER_VERSION`, which is 2 today (`server/src/modules/repo-intel/constants.ts:32-39`). A version mismatch with the stored index state forces a full reindex. This also covers the incremental-refresh paths that return before rank is recomputed (the plan review, `docs/plans/onboarding-tour/review.md:7`, `:15-18`).
- Selecting the first 5,000 files by path is left unchanged. The walk comment's plan to choose "top N by hotness" is a Non-goal of this spec: `server/src/modules/repo-intel/pipeline/walk.ts:10-12`.
- The indexer's own time limits do not fire today (`server/src/modules/repo-intel/docs/insights.md:30`), so NFR-6 bounds the hotness work by size (at most 50 commits, at most 1 history read) rather than by a timer.
