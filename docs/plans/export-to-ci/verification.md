# Plan verification: SPEC-05 Export to CI (`docs/specs/export-to-ci.md`, Status: approved), with `docs/plans/export-to-ci/plan.md` and its Plan amendments

Worktree: `/Users/detrix/emdash/worktrees/dev-digest-82ca6d50/emdash-export-to-ci-omvv2` (branch `emdash/export-to-ci-omvv2`, uncommitted). Verified 2026-10-11.

**Summary of counts**

| Status | Count |
|---|---|
| Met | 138 of 151 |
| Partially met | 4 of 151 (AC-44, AC-105, NFR-5, NFR-8) |
| Not met | 0 of 151 |
| Cannot verify | 9 of 151 (AC-125, AC-126, AC-127, AC-128, AC-129, AC-130, NFR-6, NFR-7, NFR-9) |

**Partially met items and what closes each**

| Item | What is missing | To close it |
|---|---|---|
| AC-44 | When an installation is already `active`, a repeat PR install leaves it `active`, not `pr_open` (`ci/repository.ts:101-104`) | Either amend AC-44 (via spec-creator) to "state `pr_open`, unless the installation is already `active`", or drop the CASE expression |
| AC-105 | Same cause as AC-44: after "Update CI config" on an `active` installation, the tab shows `Active` | Closed by the same decision as AC-44 |
| NFR-5 | The new sidebar label "CI Runs" is hard-coded in `client/src/vendor/ui/nav.ts:41`, not in `messages/en/ci.json` | Accept nav.ts as the existing home for sidebar labels and say so in NFR-5, or translate the nav label |
| NFR-8 | A failed GitHub request during ingest logs `{repo, reason}` but no GitHub run id, even when the failure happened on one run (`ci/ingest.ts:50`) | Log the run id for per-run failures (listRunArtifacts / downloadArtifact / getPullRequest), or amend NFR-8 to "run id when one applies" |

Legend used below: `ci/` = `server/src/modules/ci/`; `C` = `server/src/vendor/shared/contracts/eval-ci.ts` (the client copy is identical apart from the hunk noted in AC-7); `IT` = `server/test/ci.it.test.ts`; `SVT` = `server/test/ci-service.test.ts`; `IGT` = `server/test/ci-ingest.test.ts`; `HT` = `server/test/ci-helpers.test.ts`; `CiTab/` = `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/`; `Wiz/` = `CiTab/_components/ExportCiWizard/`; `Runs/` = `client/src/app/ci-runs/_components/CiRunsView/`. The tests named below all passed in the gate runs listed under "Gates and tests run".

## Verdict

- **Mode:** Acceptance
- **Result:** INCOMPLETE
- **Counts:** Met 138 of 151 · Partially met 4 of 151 · Not met 0 of 151 · Cannot verify 9 of 151.
- **Is the spec done?** Every criterion that can be checked in code and automated tests is met, except four that are partly met: AC-44, AC-105, NFR-5 and NFR-8. Nine remain unverified: the e2e flow that could not be run, the manual checks on real GitHub Actions, keyboard and theme operability, and latency.
- **Advisory only.** The pre-PR gate is `pr-self-review`.

The checklist has 142 ACs (AC-1 to AC-142, none struck through) plus 9 NFRs = 151 items.

Where the code goes further than the spec, as the coordinator recorded:
- **AC-131:** the edited-workflow validator is an allowlist.
- **AC-51:** the server also checks the installation's repo and GitHub repo id, and fetches the PR when `pull_numbers` is empty.
- **AC-137:** `patchWorkflow` also sets `DEVDIGEST_INSTALLATION_ID`.

These are marked "exceeds", not gaps.

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| AC-1 | CiResultArtifact accepts optional identity fields; artifact without them validates | Met | C:293-312; `contracts.test.ts:477` "artifact without identity fields parses…" |
| AC-2 | CiResultArtifact defines no credential field | Met | C:293-312 (field list) |
| AC-3 | CiInstallation state is one of pr_open/active/pr_closed | Met | C:211, C:223 |
| AC-4 | CiInstallation exposes agent version, runner version, PR URL, behind | Met | C:224-228 |
| AC-5 | CiRun exposes repository … status | Met | C:251-265 |
| AC-6 | CiExportInput target only `gha` | Met | C:176 `z.literal('gha')`; `contracts.test.ts:486` |
| AC-7 | Schema changes identical in both copies | Met | `diff` output: only the pre-existing Conformance `provider` hunk (C:323) |
| AC-8 | Preview returns exactly the six file kinds | Met | `ci/helpers.ts:141-164`; IT:249 |
| AC-9 | Manifest passes AgentManifest with the agent's fields | Met | `ci/helpers.ts:81-93`; HT:200 |
| AC-10 | memory.jsonl: one line per repo/global entry, content+kind only | Met | `ci/repository.ts:49-63`, `ci/helpers.ts:95-98`; IT:281 |
| AC-11 | No memory → 0-byte file | Met | `ci/helpers.ts:96-97`; IT:303, HT:206 |
| AC-12 | Workflow and skills editable | Met | `ci/helpers.ts:149,158`; IT:249 |
| AC-13 | Manifest, memory, runner, runner package.json not editable | Met | `ci/helpers.ts:153,160-162`; IT:249 |
| AC-14 | Missing bundle → error telling operator to build | Met | `ci/service.ts:73,146-147`; IT:347, SVT:47 |
| AC-15 | API never builds the bundle | Met | grep for spawn/exec in ci + runner-bundle: none; `adapters/runner-bundle/file.ts:21-37` |
| AC-16 | Skill slug with `/`, `\`, `..` → 422 naming skill | Met | `ci/helpers.ts:46-47,64-66`; IT:363, IT validation table "skill slug with '..'" |
| AC-17 | Repo not imported → 404, no GitHub call | Met | `ci/service.ts:143-144`; IT:328, IT:646 |
| AC-18 | target ≠ gha → 422 | Met | C:176; IT table "target other than gha (AC-18)" |
| AC-133 | Slug derivation rule | Met | `ci/helpers.ts:38-44`; HT:49 |
| AC-134 | Slug collision / empty slug → 422 naming them | Met | `ci/helpers.ts:57-70`; IT:380, IT:394 |
| AC-19 | Only pull_request with chosen types (incl. regenerated) | Met | `ci/helpers.ts:107`; `ci/service.ts:104,170`; HT:65 |
| AC-20 | No/unknown trigger → 422 | Met | C:180-183; IT table "no trigger type", "unknown trigger type" |
| AC-21 | Top-level permissions exactly contents:read, pull-requests:write | Met | `ci/helpers.ts:108`; HT:68 |
| AC-22 | Checks out base commit only | Met | `ci/helpers.ts:115-116`, `ci/constants.ts:33`; HT:76 |
| AC-23 | Job runs only when head repo full name == repository | Met | `ci/helpers.ts:112`, `ci/constants.ts:31-32` |
| AC-24 | No pull_request_target | Met | `ci/helpers.ts:107` |
| AC-25 | Every `uses:` pinned to 40-hex SHA | Met | `ci/constants.ts:36-38`; HT:71 |
| AC-26 | Runs `node .devdigest/runner/index.js`, no review-action | Met | `ci/helpers.ts:121`; grep `review-action` in ci/*.ts: none |
| AC-27 | Secrets only in runner step env | Met | `ci/helpers.ts:122-127` |
| AC-28 | DEVDIGEST_POST_AS = chosen mode | Met | `ci/helpers.ts:125`; HT:76 |
| AC-29 | Installation id passed to runner step | Met | `ci/helpers.ts:126`; HT:76 |
| AC-30 | No PR-controlled field in `run:` | Met | `ci/helpers.ts:121`; HT:71 |
| AC-31 | Upload result artifact always | Met | `ci/helpers.ts:129-133` |
| AC-32 | Invalid YAML → 422, no GitHub call | Met | `ci/domain.ts:212-223`; IT table "not valid YAML (AC-32)" |
| AC-33 | Missing/wider permissions → 422, no call | Met | `ci/domain.ts:240-244`; IT table AC-33 rows |
| AC-34 | pull_request_target → 422, no call | Met | `ci/domain.ts:246-249`; IT table AC-34 row |
| AC-35 | Edits to non-editable/unknown paths → 422, no call | Met | `ci/domain.ts:336-352`; IT table four AC-35 rows |
| AC-131 | No base checkout / no guard / unpinned / no runner step → 422 | Met (exceeds) | `ci/domain.ts:230-297`; IT table four AC-131 rows; HT:101-150 |
| AC-135 | Edited workflow gets chosen trigger types | Met | `ci/domain.ts:312`; `ci/service.ts:182-188`; IT:511, HT:158 |
| AC-136 | Edited workflow runner step gets DEVDIGEST_POST_AS | Met | `ci/domain.ts:318-325`; IT:511, SVT:112 |
| AC-137 | Every other key/value kept | Met (exceeds: also sets DEVDIGEST_INSTALLATION_ID) | `ci/domain.ts:306-333`; HT:158, HT:169 |
| AC-36 | Preview after edited install returns fresh files | Met | `ci/service.ts:80-91`; no edit is persisted (`ci/repository.ts:79-119`) |
| AC-37 | One commit on devdigest/ci with edits + Configure choices | Met | `ci/service.ts:221-227`; IT:417, IT:511 |
| AC-38 | Never writes other branches | Met | `ci/service.ts:222`, `ci/constants.ts:2` |
| AC-39 | Create devdigest/ci from recorded default branch | Met | `ci/service.ts:223`; `octokit.ts:325-335` |
| AC-40 | Existing open PR reused | Met | `ci/service.ts:229-230`; IT:456 |
| AC-41 | Otherwise open "Add DevDigest CI review" into default branch | Met | `ci/service.ts:231-236`, `ci/constants.ts:24`; IT:417 |
| AC-42 | Foreign commit → 409, branch unchanged | Met | `ci/service.ts:207-214`; IT:477, SVT:123 |
| AC-43 | 403/404 → "token lacks write access to <owner/name>", no record | Met | `ci/service.ts:265-273`; IT:494, SVT:131 |
| AC-44 | Record installation with state pr_open, versions, repo id, PR URL | Partially met | `ci/service.ts:240-251`; but `ci/repository.ts:104` keeps `active` on re-install |
| AC-45 | Repeat install updates, no second row | Met | `ci/repository.ts:99-108`, `server/src/db/schema/ci.ts:43`; IT:456 |
| AC-138 | Other agent's installation → 409, no GitHub write (PR and zip) | Met | `ci/service.ts:96-102`; IT:567, IT:703, SVT:91 |
| AC-139 | Commit deletes stale manifests/skills | Met | `ci/service.ts:217-219,226`, `ci/domain.ts:366-374`, `octokit.ts:354`; IT:540, SVT:140 |
| AC-46 | Zip holds exactly bundle files with edits + Configure | Met | `ci/service.ts:105-113`, `ci/helpers.ts:194-242`; IT:676 |
| AC-47 | Zip: no GitHub write, no installation change | Met | `ci/service.ts:107-113`; IT:676, IT:719, SVT:81 |
| AC-48 | List/refresh pulls completed, not-yet-ingested runs for every installation | Met | `ci/service.ts:125`, `ci/ingest.ts:40-73`; IT:753 |
| AC-49 | Download artifact via API with server token | Met | `ci/ingest.ts:129`, `octokit.ts:491`, `platform/container.ts:219` |
| AC-50 | Invalid artifact → no record, log run id + reason | Met | `ci/ingest.ts:136-146,187-190`; IT rejection table AC-50 rows |
| AC-132 | >64 KB → reject unparsed, no record, logged | Met | `ci/ingest.ts:127`, `ci/helpers.ts:279,292-294`, `ci/constants.ts:20`; IT two AC-132 rows |
| AC-51 | Identity mismatch/missing → no record, log field | Met (exceeds) | `ci/domain.ts:393-409`; IT rejection table seven AC-51 rows |
| AC-52 | Write agent run source ci with counts, cost, duration, model | Met | `ci/repository.ts:147-162`; IT:753 |
| AC-53 | Store repo, PR, head SHA, job URL (=html_url), run id, attempt, artifact id | Met | `ci/ingest.ts:99-109`, `ci/repository.ts:163-177`; IT:753 |
| AC-54 | Same run id + attempt → exactly one record | Met | `server/src/db/schema/ci.ts:77-81`, `ci/repository.ts:178-185`; IT:789 |
| AC-55 | Imported PR → run linked | Met | `ci/repository.ts:146,251-268`; IT:805 |
| AC-56 | Not imported → no PR link | Met | `ci/repository.ts:255-267`; IT:805 |
| AC-57 | Ingest never imports repo/PR | Met | `ci/repository.ts:143-187` (inserts only agent_runs, ci_runs); IT:805 |
| AC-58 | Null cost stored as null | Met | `ci/ingest.ts:162`; IT:868 |
| AC-59 | Zero findings → no_findings | Met | `ci/domain.ts:354-356`; IT:882 |
| AC-60 | ≥1 finding → succeeded + blockers regardless of job conclusion | Met | `ci/domain.ts:355`, `ci/ingest.ts:164`; IT:882 |
| AC-61 | No artifact (incl. cancelled) → failed with GitHub metadata | Met | `ci/ingest.ts:113-126`; IT:904 |
| AC-140 | Head branch devdigest/ci → store nothing | Met | `ci/domain.ts:377-379`, `ci/ingest.ts:69`; IT:922 |
| AC-141 | Concluded skipped → store nothing | Met | `ci/domain.ts:378`; IT:936 |
| AC-62 | First stored run moves pr_open → active | Met | `ci/ingest.ts:76-79`; IT:991 |
| AC-63 | PR merged → active | Met | `ci/ingest.ts:80-83`; IT:1003 |
| AC-64 | PR closed unmerged, no runs → pr_closed | Met | `ci/ingest.ts:84-86`; IT:1014 |
| AC-65 | GitHub failure → stored runs + warning naming repo | Met | `ci/ingest.ts:42-53`; IT:1025 |
| AC-66 | Never call Actions secrets API | Met | grep `secrets|Secret` in `octokit.ts`: none; ci/ hits are only workflow text |
| AC-67 | Never log/store/return OPENROUTER_API_KEY or GITHUB_TOKEN | Met | `ci/ingest.ts:186-198`, `ci/service.ts:271`; IT:1040 |
| AC-68 | Newest first, 50 per page | Met | `ci/repository.ts:239-245`, `ci/constants.ts:27`; IT:1055 |
| AC-69 | Filter by 7d/all (default 7d), agent, repo, status | Met | C:269-275; `ci/repository.ts:231-236`; IT:1081, IT:1106 |
| AC-70 | Agent = installation's agent name | Met | `ci/repository.ts:214,226-227`; IT:753 |
| AC-71 | Installations list fields + latest run or none | Met | `ci/repository.ts:270-307`, `ci/helpers.ts:323-340`; IT:1143 |
| AC-72 | behind when agent version newer | Met | `ci/domain.ts:358-360`; IT:1168 |
| AC-73 | No change to PR feed or multi-agent review service | Met | `git diff --stat main -- server/src/modules/pulls server/src/modules/reviews client/src/app/pulls` → empty |
| AC-74 | PR feed COST includes linked CI run cost via existing totals | Met | IT:842 |
| AC-75 | CI tab reachable by URL and keyboard | Met | `client/src/app/agents/[id]/page.tsx:15`; `AgentEditor/constants.ts:17`; `AgentEditor.tsx` `tab === "ci"` |
| AC-76 | Heading "CI deployment", badge "Active in N repos" | Met | `CiTab/CiTab.tsx:36-38`, `CiTab/helpers.ts:4-6`; CiTab.test.tsx:82 |
| AC-77 | Row: repo, "GitHub Actions", latest status, relative time / "no runs yet" | Met | `CiTab/_components/InstallationRow/InstallationRow.tsx:18-30`; InstallationRow.test.tsx:37,51 |
| AC-78 | "agent v<v> · runner <r>" | Met | InstallationRow.tsx:32, ci.json:115 |
| AC-79 | "behind" marker | Met | InstallationRow.tsx:34-38; InstallationRow.test.tsx:51 |
| AC-80 | State label | Met | InstallationRow.tsx:39, ci.json:117-121 |
| AC-81 | "Fail CI on" never/critical/warning/any on the shared setting | Met | `CiTab/CiTab.tsx:58-65`; `AgentEditor/constants.ts` `CI_FAIL_ON_VALUES` |
| AC-82 | Saved in CI tab → Config tab shows same after reload | Met | CiTab.tsx:62 (`useUpdateAgent` → `ci_fail_on`); ConfigTab.tsx:25,37; CiTab.test.tsx:93 |
| AC-83 | Note next to "Fail CI on" | Met | CiTab.tsx:66, ci.json:126 |
| AC-84 | "+ Add to CI" opens wizard | Met | CiTab.tsx:41-43,73; CiTab.test.tsx:103 |
| AC-85 | "Update CI config" opens wizard with repo preset | Met | CiTab.tsx:51; `Wiz/useExportWizard.ts:37`; CiTab.test.tsx:103 |
| AC-86 | "+ Add repository" → repository import flow | Met | CiTab.tsx:53-55 (`/onboarding` = add-repository screen) |
| AC-87 | Link to CI Runs filtered to agent | Met | CiTab.tsx:69-71; `client/src/app/ci-runs/page.tsx:7-11`; CiTab.test.tsx:93 |
| AC-88 | Title, subtitle, 4 steps | Met | `Wiz/ExportCiWizard.tsx:44-45,74`, `Wiz/constants.ts:4`; ExportCiWizard.test.tsx:81 |
| AC-89 | GitHub Actions card, recommended, selected | Met | `Wiz/_components/TargetStep/TargetStep.tsx:14-24` |
| AC-90 | No CircleCI/Jenkins/Generic CLI cards | Met | grep `CircleCI|Jenkins|Generic CLI` in client/src, messages: none; ExportCiWizard.test.tsx:81 |
| AC-91 | Repo picker: imported repos only, current preselected | Met | `Wiz/useExportWizard.ts:24-26,37`; TargetStep.tsx:25-27 |
| AC-92 | FILES TO CREATE lists every file; selected contents shown | Met | `Wiz/_components/PreviewStep/PreviewStep.tsx:46-66`; ExportCiWizard.test.tsx:106 |
| AC-93 | Edit only editable files, with badge | Met | PreviewStep.tsx:51,57-65; ExportCiWizard.test.tsx:106 |
| AC-94 | Edits kept across steps and sent | Met | `Wiz/useExportWizard.ts:33,71-74`, `Wiz/helpers.ts:16-23`; ExportCiWizard.test.tsx:118 |
| AC-95 | Closing discards edits | Met | CiTab.tsx:73 (unmount); ExportCiWizard.test.tsx:118 |
| AC-96 | Chip defaults | Met | `Wiz/constants.ts:9-11`; ExportCiWizard.test.tsx:147 |
| AC-97 | No chip → Continue disabled | Met | `Wiz/useExportWizard.ts:46`; ExportCiWizard.test.tsx:147 |
| AC-98 | OPENROUTER_API_KEY with instruction, no status badge | Met | `Wiz/_components/ConfigureStep/ConfigureStep.tsx:39-42`, ci.json:90 |
| AC-99 | GITHUB_TOKEN "Auto-provided by Actions" | Met | ConfigureStep.tsx:43-46, ci.json:91 |
| AC-100 | Post results as choices, GitHub review default + recommended | Met | `Wiz/constants.ts:17-22`; ConfigureStep.tsx:51-69 |
| AC-101 | Block-merge info text | Met | ConfigureStep.tsx:72-74, ci.json:99 |
| AC-102 | Old GitHub App text gone | Met | grep "Requires a GitHub App" in client/src, messages: none |
| AC-103 | Install options, PR default + recommended | Met | `Wiz/_components/InstallStep/InstallStep.tsx:53-83`, `Wiz/useExportWizard.ts:32` |
| AC-104 | PR success shows PR link | Met | InstallStep.tsx:29-43; ExportCiWizard.test.tsx:168 |
| AC-105 | PR success → CI tab shows pr_open without reload | Partially met | `client/src/lib/hooks/ci.ts:65` invalidation; state comes from AC-44 path (stays `active` on re-install) |
| AC-106 | Zip success → download | Met | `client/src/lib/hooks/ci.ts:29-39,64`; ci.test.tsx:65 |
| AC-107 | Failure stays on Install with server message | Met | ExportCiWizard.tsx:33-39, InstallStep.tsx:84-88; ExportCiWizard.test.tsx:191 |
| AC-108 | Never asks for/shows a secret value | Met | ConfigureStep.tsx:37-47 (names only, no input); ExportCiWizard.test.tsx:147 |
| AC-109 | Sidebar "CI Runs" → table with 8 columns | Met | `client/src/vendor/ui/nav.ts:41`; `Runs/constants.ts:6`; CiRunsView.test.tsx:73 |
| AC-110 | Null cost → "—" | Met | `Runs/helpers.ts:6-8`; CiRunsView.test.tsx:89 |
| AC-111 | failed labelled differently from succeeded | Met | `Runs/constants.ts:14-19`, CiRunsView.tsx:28; CiRunsView.test.tsx:96 |
| AC-112 | Blocker count on succeeded run | Met | `Runs/helpers.ts:18-20`, CiRunsView.tsx:30; CiRunsView.test.tsx:96 |
| AC-113 | Plain text only | Met | CiRunsView.tsx:17-46 (text nodes); CiRunsView.test.tsx:110 |
| AC-114 | Refresh re-requests list → ingest | Met | CiRunsView.tsx:81-83, `ci/service.ts:125`; CiRunsView.test.tsx:123 |
| AC-115 | No "auto-refresh on" | Met | grep "auto-refresh on|autoRefresh" in client: none; `hooks/ci.ts:86-95` no polling; CiRunsView.test.tsx:123 |
| AC-116 | Filters Last 7 days / All agents / All repos / All statuses | Met | CiRunsView.tsx:86-119, ci.json:18-22 |
| AC-142 | Time filter starts on Last 7 days, second option all ages | Met | CiRunsView.tsx:50, `Runs/constants.ts:8-9`; CiRunsView.test.tsx:151 |
| AC-117 | Ingest warning above table naming repo | Met | CiRunsView.tsx:121-128; CiRunsView.test.tsx:135 |
| AC-118 | Empty state copy | Met | CiRunsView.tsx:132, ci.json:3-4; CiRunsView.test.tsx:143 |
| AC-119 | Job link opens new tab | Met | CiRunsView.tsx:37; CiRunsView.test.tsx:73 |
| AC-120 | Runner artifact includes identity fields | Met | `agent-runner/src/artifact.ts:55-63`, `run.ts:154-163`, `context.ts` `resolvePrContext`; run.test.ts:319, context.test.ts:9 |
| AC-121 | verdict/blockers from deterministic gate | Met | `agent-runner/src/run.ts:35-39,158`; run.test.ts:247,319 |
| AC-122 | PR changes only via API diff | Met | `agent-runner/src/run.ts:114`; `ci/helpers.ts:115-116` (base checkout) |
| AC-123 | No secret in artifact, stdout/stderr, posts | Met | run.test.ts:365 |
| AC-124 | Fail before grounded review → exit 1 | Met | `agent-runner/src/run.ts:187`; run.test.ts:402 |
| AC-125 | Hermetic e2e flow 14 | Cannot verify | `e2e/specs/14-export-to-ci.flow.json` written (31 steps); `which agent-browser` → not found |
| AC-126 | Manual: export PR contains files | Cannot verify | Manual T4 on real GitHub; not run |
| AC-127 | Manual: test PR gets result | Cannot verify | Manual T4; not run |
| AC-128 | Manual: critical finding blocks merge | Cannot verify | Manual T4; not run |
| AC-129 | Manual: no secret in log/artifact | Cannot verify | Manual T4; not run |
| AC-130 | Manual: CI Runs lists run with right ids/link | Cannot verify | Manual T4; not run |
| NFR-1 | Runner bundle ≤ 5,242,880 bytes | Met | `wc -c agent-runner/dist/index.js` → 1601242; enforced `ci/service.ts:148-150`, `ci/constants.ts:22` |
| NFR-2 | ≤ 50 runs per page | Met | `ci/repository.ts:240-245`; IT:1055 |
| NFR-3 | 0 model calls server-side | Met | `grep -rnE "llm|LLMProvider" server/src/modules/ci` → exit 1, empty |
| NFR-4 | 0 new secrets server-side | Met | `platform/config.ts` adds only `DEVDIGEST_RUNNER_BUNDLE_PATH`, `DEVDIGEST_CI_GITHUB_MOCK`; `platform/container.ts:219` reuses `github()` |
| NFR-5 | Every new UI string in ci.json (or agents for tab label) | Partially met | ci.json covers the components; sidebar label hard-coded at `client/src/vendor/ui/nav.ts:41` |
| NFR-6 | Fully keyboard-operable | Cannot verify | Enter/Escape at `Wiz/useExportWizard.ts:54-61`; native controls; no keyboard test, no manual tab-through |
| NFR-7 | Renders in both themes | Cannot verify | Only CSS variables (grep for hex/rgb in CiTab/, ci-runs/: none); no both-theme render of these components |
| NFR-8 | One log line per rejection / failed request with repo, run id, reason | Partially met | Rejections: `ci/ingest.ts:187-190`; failed requests: `ci/ingest.ts:50` logs no run id |
| NFR-9 | Latency p95 budgets | Cannot verify | No measurement exists |

Row count: 151, which matches the item count.

## Item-by-item

### AC-1 The `CiResultArtifact` schema shall accept the optional fields `repository`, `repository_id`, `head_sha`, `verdict`, `blockers`, `run_id`, `run_attempt`, `installation_id` and `model`, and an artifact that omits all of them shall still validate.
**Verdict:** Met
**Evidence:** `server/src/vendor/shared/contracts/eval-ci.ts:303-311` — all nine fields are `.nullish()`. `server/test/contracts.test.ts:477` "artifact without identity fields parses; with all fields parses; unknown keys are stripped" passed.
**Gap:** —
**To close it:** —

### AC-2 The `CiResultArtifact` schema shall define no field meant to carry a credential, API key or token value.
**Verdict:** Met
**Evidence:** C:293-312. The fields are findings_count, critical, warning, suggestion, cost_usd, duration_ms, agent, version, pr_number, repository, repository_id, head_sha, verdict, blockers, run_id, run_attempt, installation_id and model. None of them is a credential, key or token. Unknown keys are stripped.
**Gap:** —
**To close it:** —

### AC-3 The `CiInstallation` schema shall expose the installation state as exactly one of `pr_open`, `active`, `pr_closed`.
**Verdict:** Met
**Evidence:** C:211 `CiInstallationState = z.enum(['pr_open','active','pr_closed'])`, used at C:223.
**Gap:** —
**To close it:** —

### AC-4 The `CiInstallation` schema shall expose the installed agent version, the runner version, the PR URL and whether the installation is behind the agent's current version.
**Verdict:** Met
**Evidence:** C:224-228 (`agent_version`, `runner_version`, `pr_url`, `behind`).
**Gap:** —
**To close it:** —

### AC-5 The `CiRun` schema shall expose repository, PR number, agent name, verdict, findings count, blocker count, cost (nullable), duration, head SHA, job URL and status.
**Verdict:** Met
**Evidence:** C:251-265. `cost_usd` is `z.number().nullable()`.
**Gap:** —
**To close it:** —

### AC-6 `CiExportInput` shall accept `gha` as the only `target` value.
**Verdict:** Met
**Evidence:** C:176 `target: z.literal('gha').default('gha')`. `contracts.test.ts:486` "CiExportInput rejects other targets and bad triggers; applies defaults" passed.
**Gap:** —
**To close it:** —

### AC-7 Each schema change in this spec shall be identical in the server copy and the client copy of `@devdigest/shared`.
**Verdict:** Met
**Evidence:** `diff server/src/vendor/shared/contracts/eval-ci.ts client/src/vendor/shared/contracts/eval-ci.ts` returns only `323c323` (Conformance `provider`), the pre-existing hunk the plan allows. The new port types in `adapters.ts` (`CommitFilesPayload.deletePaths`, `RepoInfo`, `WorkflowRunMeta`, …) were added to both copies.
**Gap:** —
**To close it:** —

### AC-8 WHEN the studio requests a CI bundle preview for an agent and an imported repo, the API shall return exactly these files: `.devdigest/agents/<agent-slug>.yaml`, one `.devdigest/skills/<skill-slug>.md` per enabled skill attached to the agent, `.devdigest/memory.jsonl`, `.github/workflows/devdigest-review.yml`, `.devdigest/runner/index.js` and `.devdigest/runner/package.json` (`{"type": "module"}`, because the bundle is an ES module).
**Verdict:** Met
**Evidence:** `ci/helpers.ts:141-164` `buildBundle`. Only enabled skills are included (`ci/service.ts:153`), and `ci/constants.ts:9` holds `RUNNER_PACKAGE_JSON`. IT:249 "returns exactly the six bundle files…" and SVT:36 "…enabled skills only…" passed.
**Gap:** —
**To close it:** —

### AC-9 The generated agent manifest shall pass `AgentManifest` validation and carry the agent's current name, provider, model, system prompt, skill slugs, strategy and `ci_fail_on`.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:81-93` builds all seven fields and calls `AgentManifest.parse(manifest)`. HT:200 "manifest round-trips through AgentManifest" passed.
**Gap:** —
**To close it:** —

### AC-10 The generated `.devdigest/memory.jsonl` shall contain one JSON line per workspace memory entry whose scope is the target repo or global, and each line shall hold only that entry's content and kind.
**Verdict:** Met
**Evidence:** `ci/repository.ts:49-63` (repo-scoped or global), `ci/helpers.ts:95-98` (`{content, kind}` per line). IT:281 passed.
**Gap:** —
**To close it:** —

### AC-11 IF the workspace has no memory entry scoped to the target repo or global, THEN the generated `.devdigest/memory.jsonl` shall be an empty file (0 bytes).
**Verdict:** Met
**Evidence:** `ci/helpers.ts:96-97` returns `''` for no entries. IT:303 and HT:206 passed.
**Gap:** —
**To close it:** —

### AC-12 The bundle preview shall mark the workflow and every skill file as editable.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:149` (workflow) and `:158` (skills) set `editable: true`. IT:249 passed.
**Gap:** —
**To close it:** —

### AC-13 The bundle preview shall mark the agent manifest, `.devdigest/memory.jsonl`, the runner bundle and `.devdigest/runner/package.json` as not editable.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:153,160,161,162` set `editable: false`. IT:249 passed.
**Gap:** —
**To close it:** —

### AC-14 IF the prebuilt runner bundle is missing on the server, THEN the API shall reject the preview and the install with an error message telling the operator to build the agent-runner package.
**Verdict:** Met
**Evidence:** `ci/service.ts:146-147` throws `ConfigError("Runner bundle not found. Build it: cd agent-runner && pnpm install && pnpm build")` inside `prepare`, which both preview and export call. `adapters/runner-bundle/file.ts:29` returns null on ENOENT. IT:347 and SVT:47 passed.
**Gap:** —
**To close it:** —

### AC-15 The API shall never build the runner bundle as part of a preview or an install request.
**Verdict:** Met
**Evidence:** `grep -rnE "spawn|exec\(|execFile|child_process" server/src/modules/ci server/src/adapters/runner-bundle` matches only regex `.exec(` calls and a comment. `file.ts:21-37` only calls `readFile`.
**Gap:** —
**To close it:** —

### AC-16 IF an agent's skill slug would produce a path containing `/`, `\` or `..` under `.devdigest/skills/`, THEN the API shall reject the preview and the install with a 422 error naming the skill.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:46-47,64-66` throws `ValidationError` (422) with `Skill "<name>"…`. IT:363 (preview) and the IT validation table "skill slug with '..' (AC-16) — open_pr / zip" passed.
**Gap:** —
**To close it:** —

### AC-17 IF the requested repo is not imported into the caller's workspace, THEN the API shall reject the preview and the export with 404 and make no GitHub call.
**Verdict:** Met
**Evidence:** `ci/service.ts:143-144` checks this in `prepare`, before any `github()` call. IT:328 (preview) and IT:646 (export) passed with zero mock calls.
**Gap:** —
**To close it:** —

### AC-18 WHEN `POST /agents/:id/export-ci` receives a `target` other than `gha`, the API shall reject the request with a 422 validation error.
**Verdict:** Met
**Evidence:** C:176, enforced by the route body schema at `ci/routes.ts:49`. IT table "target other than gha (AC-18)" passed with 422 `validation_error` in both modes.
**Gap:** —
**To close it:** —

### AC-133 The API shall derive the agent slug and every skill slug from the name by lowercasing it, applying Unicode NFKD normalisation, replacing every run of characters outside `[a-z0-9._-]` with a single `-`, and trimming leading and trailing `-`.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:38-44` `slugify`, used for the agent and skills at `:56,63`. HT:49 "slugifies per AC-133" passed.
**Gap:** —
**To close it:** —

### AC-134 IF two enabled skills attached to the agent derive the same slug, THEN the API shall reject the preview and the install with a 422 error naming both skills, and IF the agent or an enabled skill derives an empty slug, THEN it shall reject them with a 422 error naming that agent or skill.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:57-59` (empty or unsafe agent slug), `:64-66` (empty skill slug) and `:67-70` (collision naming both). IT:380, IT:394, the IT table "colliding skill slugs (AC-134)" and SVT:146 passed.
**Gap:** —
**To close it:** —

### AC-19 The generated workflow, including the one an install regenerates when the workflow was not edited, shall trigger only on the `pull_request` event, with exactly the activity types selected in the wizard's Configure step.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:107` `on: { pull_request: { types: opts.triggers } }`. Install regenerates from `input.triggers` at `ci/service.ts:104,170`. HT:65 passed.
**Gap:** —
**To close it:** —

### AC-20 IF an export request selects no trigger type, or a type other than `opened`, `synchronize` or `reopened`, THEN the API shall reject it with 422.
**Verdict:** Met
**Evidence:** C:180-183 (enum, `.min(1)`). The IT table rows "no trigger type (AC-20)" and "unknown trigger type (AC-20)" passed in both modes.
**Gap:** —
**To close it:** —

### AC-21 The generated workflow shall declare a top-level `permissions` block granting exactly `contents: read` and `pull-requests: write`, so every other permission is `none`.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:108`. HT:68 "has the two least-privilege grants" passed.
**Gap:** —
**To close it:** —

### AC-22 The generated workflow shall check out the PR's base commit and never the PR's head commit or merge ref.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:115-116` checks out with `ref: ${{ github.event.pull_request.base.sha }}` (`ci/constants.ts:33`). HT:76 passed.
**Gap:** —
**To close it:** —

### AC-23 The generated workflow shall run the review job only when the PR head repository's full name equals the workflow repository's full name.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:112` `if: SAME_REPO_GUARD`. `ci/constants.ts:31-32` is `github.event.pull_request.head.repo.full_name == github.repository`.
**Gap:** —
**To close it:** —

### AC-24 The generated workflow shall not use the `pull_request_target` event.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:107`: the only event is `pull_request`. HT:65 asserts `on` equals `{pull_request: …}`.
**Gap:** —
**To close it:** —

### AC-25 Every `uses:` reference in the generated workflow shall be pinned to a 40-character hexadecimal commit SHA.
**Verdict:** Met
**Evidence:** `ci/constants.ts:36-38`. HT:71 "pins every action…" checks `/@[0-9a-f]{40}$/` and passed.
**Gap:** —
**To close it:** —

### AC-26 The generated workflow shall run the review as `node .devdigest/runner/index.js` and shall reference no `devdigest/review-action`.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:121` `run: RUNNER_COMMAND` (`ci/constants.ts:15`). `grep -rn "review-action" server/src/modules/ci/*.ts` exits 1 (no match).
**Gap:** —
**To close it:** —

### AC-27 The generated workflow shall pass `OPENROUTER_API_KEY` from `secrets.OPENROUTER_API_KEY` and `GITHUB_TOKEN` from the job's own token, only in the environment of the runner step.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:122-127` sets both in the runner step's `env`. There is no workflow-level or job-level `env` (`:105-137`).
**Gap:** —
**To close it:** —

### AC-28 The generated workflow, including the one an install regenerates when the workflow was not edited, shall set `DEVDIGEST_POST_AS` in the runner step to the publish mode chosen in the wizard's Configure step: `github_review`, `pr_comment` or `none`.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:125`. Install regeneration uses `input.post_as` (`ci/service.ts:104`). HT:76 passed.
**Gap:** —
**To close it:** —

### AC-29 The generated workflow shall pass the installation id to the runner step.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:126` `DEVDIGEST_INSTALLATION_ID`. The id is deterministic (`ci/helpers.ts:167-171`), so preview and install agree. HT:76 passed.
**Gap:** —
**To close it:** —

### AC-30 The generated workflow shall not interpolate any PR-controlled event field (title, body, head ref, branch name, comment text) into a `run:` script.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:121`: the run script is the constant command. HT:71 asserts no `${{` in any `run`, and passed.
**Gap:** —
**To close it:** —

### AC-31 The generated workflow shall upload `devdigest-result.json` as a workflow artifact whenever the runner wrote one, including when the runner exited non-zero.
**Verdict:** Met
**Evidence:** `ci/helpers.ts:129-133`: `upload-artifact` with `if: ${{ always() }}`, `path: devdigest-result.json` and `if-no-files-found: ignore`. HT:76 passed.
**Gap:** —
**To close it:** —

### AC-32 IF the edited workflow submitted with an install request is not valid YAML, THEN the API shall reject the install with 422 and make no GitHub call.
**Verdict:** Met
**Evidence:** `ci/domain.ts:212-223` `parseStrict` throws `ValidationError`. It runs in `applyEdits` (`ci/service.ts:105,182`) before `openPr`. The IT table row "workflow that is not valid YAML (AC-32)" passed in both modes with `calls` equal to `[]`.
**Gap:** —
**To close it:** —

### AC-33 IF the edited workflow has no top-level `permissions` block, or grants any permission other than `contents: read` and `pull-requests: write`, THEN the API shall reject the install with 422 and make no GitHub call.
**Verdict:** Met
**Evidence:** `ci/domain.ts:240-244` (top level) and `:262-264` (job level). The IT table rows "workflow without a permissions block" and "workflow granting contents: write" passed.
**Gap:** —
**To close it:** —

### AC-34 IF the edited workflow uses the `pull_request_target` event, THEN the API shall reject the install with 422 and make no GitHub call.
**Verdict:** Met
**Evidence:** `ci/domain.ts:246-249`: `on` must be a mapping whose only key is `pull_request`. The IT table row "workflow using pull_request_target (AC-34)" passed.
**Gap:** —
**To close it:** —

### AC-35 IF an install request carries contents for the agent manifest, `.devdigest/memory.jsonl`, the runner bundle, or a path that is not in the generated file set, THEN the API shall reject the install with 422 and make no GitHub call.
**Verdict:** Met
**Evidence:** `ci/domain.ts:336-352` `validateEdits`, called at `ci/service.ts:176`. The four IT table rows "edit for the agent manifest / memory.jsonl / runner bundle / a path outside the bundle (AC-35)" passed in both modes.
**Gap:** —
**To close it:** —

### AC-131 IF the edited workflow does not check out the PR's base commit, drops the same-repo guard of AC-23, has a `uses:` reference not pinned to a 40-character hexadecimal commit SHA, or has no step that runs `node .devdigest/runner/index.js`, THEN the API shall reject the install with 422 and make no GitHub call.
**Verdict:** Met. It also exceeds the spec: the validator is an allowlist with an exact guard, allowed job keys, allowed expressions, no YAML aliases, and the base checkout before the runner in the same job.
**Evidence:** `ci/domain.ts:265-267` (guard), `:274-277` (pinning), `:278-284` (base checkout), `:288-296` (runner step). The four IT table rows "(AC-131)" passed. HT:101-150 "allowlist bypasses" passed.
**Gap:** —
**To close it:** —

### AC-135 WHEN an install request carries an edited workflow, the API shall set that workflow's `on.pull_request.types` to exactly the trigger types chosen in the wizard's Configure step before it commits or zips the workflow.
**Verdict:** Met
**Evidence:** `ci/domain.ts:312`, applied in `ci/service.ts:183-188` before the zip or commit. IT:511 and HT:158 passed.
**Gap:** —
**To close it:** —

### AC-136 WHEN an install request carries an edited workflow, the API shall set `DEVDIGEST_POST_AS` in the environment of the step that runs `node .devdigest/runner/index.js` to the publish mode chosen in the wizard's Configure step before it commits or zips the workflow.
**Verdict:** Met
**Evidence:** `ci/domain.ts:318-323`. IT:511, SVT:112 and HT:158 passed.
**Gap:** —
**To close it:** —

### AC-137 WHEN the API applies AC-135 and AC-136 to an edited workflow, it shall keep every other key and value of that workflow as the user submitted it.
**Verdict:** Met. It exceeds the literal text in one respect: `DEVDIGEST_INSTALLATION_ID` on the runner step is also overwritten (`ci/domain.ts:324`), which enforces AC-29. The coordinator recorded this as intended.
**Evidence:** `ci/domain.ts:306-333` uses `parseDocument`/`setIn`/`toString`, which keeps comments. HT:158 "rewrites triggers and post-as and preserves comments and other keys" and HT:169 passed.
**Gap:** —
**To close it:** — (the AC-137 wording could name the installation-id overwrite; that is a doc-writer note, not a gap)

### AC-36 WHEN the studio requests a preview after an install that carried edits, the API shall return the freshly generated files, not the edited ones.
**Verdict:** Met
**Evidence:** `ci/service.ts:80-91`: preview always calls `generate()`, and no edit content is stored (`ci/repository.ts:79-119` persists only metadata). IT:277 asserts the preview makes no GitHub call. There is no dedicated "preview after an edited install" test; the proof is the code path.
**Gap:** —
**To close it:** —

### AC-37 WHEN an install request asks to open a PR, the API shall commit every bundle file, with accepted edits applied and the Configure choices enforced by AC-135 and AC-136, as one commit on the branch `devdigest/ci` of the target repo.
**Verdict:** Met
**Evidence:** `ci/service.ts:221-227` makes a single `commitFiles` call with all files. `octokit.ts` `commitFiles` uses one `createTree` and one `createCommit`. IT:417 and IT:511 passed.
**Gap:** —
**To close it:** —

### AC-38 The API shall never create a commit on, or move, any branch of the target repo other than `devdigest/ci`.
**Verdict:** Met
**Evidence:** `ci/service.ts:222` `branch: CI_BRANCH` is the only write target (`ci/constants.ts:2`). `base` is only read when the branch does not exist yet (`octokit.ts:325-335`).
**Gap:** —
**To close it:** —

### AC-39 WHEN `devdigest/ci` does not exist in the target repo, the API shall create it from the head of the repo's default branch as recorded in the workspace.
**Verdict:** Met
**Evidence:** `ci/service.ts:223` `base: repo.defaultBranch`, where the repo comes from the workspace DB (`ci/repository.ts:33-46`). `octokit.ts:332-334` forks from `heads/<base>`. IT:417 passed.
**Gap:** —
**To close it:** —

### AC-40 WHEN an open PR with head `devdigest/ci` already exists, the API shall add the new commit to that PR and return its URL.
**Verdict:** Met
**Evidence:** `ci/service.ts:229-230` (`findOpenPr` first). IT:456 asserts `openedPrs` has length 1 after two installs, and passed.
**Gap:** —
**To close it:** —

### AC-41 WHEN no open PR with head `devdigest/ci` exists, the API shall open a PR titled "Add DevDigest CI review" from `devdigest/ci` into the repo's default branch and return its URL.
**Verdict:** Met
**Evidence:** `ci/service.ts:231-236`, `ci/constants.ts:24`. IT:417 passed.
**Gap:** —
**To close it:** —

### AC-42 IF `devdigest/ci` contains a commit that DevDigest did not create, THEN the API shall refuse the install with 409 and leave the branch unchanged.
**Verdict:** Met
**Evidence:** `ci/service.ts:207-214` runs the compare check before `commitFiles` and returns `ConflictError` with `ci_branch_foreign_commit`. IT:477 and SVT:123 passed.
**Gap:** —
**To close it:** —

### AC-43 IF GitHub answers 403 or 404 to any write of the install, THEN the API shall return an error with the message "token lacks write access to <owner/name>" and create no installation record.
**Verdict:** Met
**Evidence:** `ci/service.ts:265-270`. The upsert at `:240` runs only after the GitHub block succeeds. IT:494 and SVT:131 passed.
**Gap:** —
**To close it:** —

### AC-44 WHEN the install opens or updates a PR, the API shall record an installation for that agent and repo with state `pr_open`, the agent version, the runner version, the GitHub numeric repository id and the PR URL.
**Verdict:** Partially met
**Evidence:**
- **Holds:** `ci/service.ts:240-251` records the agent version, runner version, `githubRepoId: info.id` and `prUrl`, and a new row gets `state: 'pr_open'` (`ci/repository.ts:84`). IT:417 passed.
- **Missing:** on conflict, `ci/repository.ts:104` runs `CASE WHEN state = 'active' THEN 'active' ELSE 'pr_open' END`. A repeat PR install ("Update CI config") on an `active` installation records `active`, not `pr_open`.
**Gap:** The literal text requires `pr_open` on every install that opens or updates a PR.
**To close it:** Have spec-creator amend AC-44 to "state `pr_open`, unless the installation is already `active`", which matches the deliberate code comment at `ci/repository.ts:101`. Otherwise, remove the CASE expression.

### AC-45 WHEN an install repeats for an agent and repo that already have an installation, the API shall update that installation and not create a second one.
**Verdict:** Met
**Evidence:** `ci/repository.ts:99-108` (`onConflictDoUpdate` on `(workspace_id, repo)`), with the unique index at `server/src/db/schema/ci.ts:43`. IT:456 asserts `count = 1`, and passed.
**Gap:** —
**To close it:** —

### AC-138 IF an install request, as a PR or as a zip, targets a repo that already has an installation of a different agent, THEN the API shall refuse it with 409 and make no GitHub write.
**Verdict:** Met
**Evidence:** `ci/service.ts:95-102`, before the zip or PR branch. A race is also caught in `ci/repository.ts:107-116`. IT:567 (PR), IT:703 (zip) and SVT:91 passed.
**Gap:** —
**To close it:** —

### AC-139 WHEN a PR install commits the bundle, the commit shall delete every `.devdigest/agents/*.yaml` and `.devdigest/skills/*.md` file of the branch's parent tree that is not in the generated file set, so the target repo holds exactly one agent manifest.
**Verdict:** Met
**Evidence:** `ci/service.ts:217-219,226`, `ci/domain.ts:366-374` and `octokit.ts:354` (`sha: null` entries in the same tree). IT:540, SVT:140 and `adapters.test.ts:35` passed. Real-GitHub `sha: null` behaviour is left to T4.
**Gap:** —
**To close it:** —

### AC-46 WHEN an install request asks for a zip, the API shall return a zip archive holding exactly the bundle files at their repo paths, with accepted edits applied and the Configure choices enforced by AC-135 and AC-136.
**Verdict:** Met
**Evidence:** `ci/service.ts:104-113` uses the same `applyEdits` output as the PR path. `ci/helpers.ts:194-242` writes the zip. IT:676 passed.
**Gap:** —
**To close it:** —

### AC-47 WHEN an install request asks for a zip, the API shall make no GitHub write and create or change no installation record.
**Verdict:** Met
**Evidence:** `ci/service.ts:107-113` returns before `openPr`. Only `findInstallationByRepo` (a read) runs. IT:676, IT:719 and SVT:81 passed.
**Gap:** —
**To close it:** —

### AC-48 WHEN the CI runs list is requested or refreshed, the server shall ask GitHub, for every installation in the workspace, for completed runs of the DevDigest workflow that are not yet ingested.
**Verdict:** Met
**Evidence:** `ci/service.ts:125` → `ci/ingest.ts:40-44` (every installation) → `:62-70` (`status: 'completed'`, skipping keys already known). IT:753 passed.
**Gap:** —
**To close it:** —

### AC-49 WHEN a completed run has a `devdigest-result.json` artifact, the server shall download it through the GitHub API with the server's own GitHub token.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:129` → `octokit.ts:491` `actions.downloadArtifact`. The client comes from `platform/container.ts:219` `ciGithub()` → `github()`, which uses the server token. IT:753 passed.
**Gap:** —
**To close it:** —

### AC-50 IF a downloaded artifact fails `CiResultArtifact` validation, THEN the server shall write no run record for it and log the GitHub run id and the reason.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:136-146` → `reject` at `:187-190` logs `{repo, runId, reason}`. The IT rejection rows "fails the CiResultArtifact schema (AC-50)" and "is not JSON (AC-50)" passed and assert `runId` and the reason.
**Gap:** —
**To close it:** —

### AC-132 IF a `devdigest-result.json` artifact is larger than 64 KB (65,536 bytes), THEN the server shall reject it without parsing it, write no run record for it, and log it like AC-50.
**Verdict:** Met
**Evidence:**
- `ci/ingest.ts:127` rejects on the declared size before download.
- `ci/helpers.ts:279` checks the central-directory size, and `:292-294` passes `maxOutputLength` to inflate.
- `ci/constants.ts:20` sets the limit at 65_536.
- The IT rows "is declared larger than 64 KB" and "inflates past 64 KB although its metadata claims it is small" passed.
**Gap:** —
**To close it:** —

### AC-51 IF the artifact's `repository`, `repository_id`, `head_sha`, `pr_number` or `installation_id` is missing or differs from GitHub's metadata for that workflow run, or from the installation's repository, GitHub repository id and installation id, THEN the server shall write no run record for it and log the GitHub run id and the mismatched field.
**Verdict:** Met. It exceeds the spec: when `pull_numbers` is empty, the PR is fetched from the installation's repo (`ci/ingest.ts:148-151,172-184`).
**Evidence:** `ci/domain.ts:393-409`. Seven IT rejection rows (repository, repository_id, head_sha, pr_number ×2, installation_id ×2) passed, asserting `mismatch:<field>` and `runId`. HT:256 and HT:261 passed.
**Gap:** —
**To close it:** —

### AC-52 WHEN an artifact passes validation and verification, the server shall write one agent run with source `ci` for the installation's agent, holding the findings count, blocker count, cost, duration and model.
**Verdict:** Met
**Evidence:** `ci/repository.ts:147-162` (`source: 'ci'`, `agentId` from the installation at `ci/ingest.ts:102`). IT:753 passed.
**Gap:** —
**To close it:** —

### AC-53 WHEN the server writes a CI agent run, it shall also store the repository, PR number, head SHA, job URL, GitHub run id, run attempt and artifact id, using the workflow run's `html_url` from GitHub as the job URL.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:99-109` (`jobUrl: run.html_url`) and `ci/repository.ts:163-177`. IT:753 passed.
**Gap:** —
**To close it:** —

### AC-54 Ingesting the same GitHub run id and run attempt for the same installation more than once shall leave exactly one run record.
**Verdict:** Met
**Evidence:** Unique index `server/src/db/schema/ci.ts:77-81`; `ci/repository.ts:178-185` rolls back the duplicate. The migration `0022_lowly_katie_power.sql` creates `ci_runs_installation_run_attempt_uq`. IT:789 and IGT:123 passed.
**Gap:** —
**To close it:** —

### AC-55 WHEN the PR of an ingested run is imported in the workspace, the server shall link the agent run to that PR.
**Verdict:** Met
**Evidence:** `ci/repository.ts:146,251-268` (`prId` lookup by workspace, repo and number). IT:805 passed.
**Gap:** —
**To close it:** —

### AC-56 WHEN the PR of an ingested run is not imported in the workspace, the server shall store the run with no PR link.
**Verdict:** Met
**Evidence:** `ci/repository.ts:267` gives `null` when no PR is found. IT:805 passed.
**Gap:** —
**To close it:** —

### AC-57 Ingest shall never import a repository or a PR into the workspace.
**Verdict:** Met
**Evidence:** `ci/repository.ts:143-187` inserts only into `agent_runs` and `ci_runs`. IT:805 passed ("…importing nothing").
**Gap:** —
**To close it:** —

### AC-58 WHEN an artifact reports a null cost, the server shall store the run's cost as null, never as 0.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:162` `costUsd: artifact.cost_usd`, with no coalescing. IT:868 passed.
**Gap:** —
**To close it:** —

### AC-59 WHEN a verified artifact reports zero findings, the server shall store the run with status `no_findings`.
**Verdict:** Met
**Evidence:** `ci/domain.ts:354-356`, `ci/ingest.ts:159`. IT:882 passed.
**Gap:** —
**To close it:** —

### AC-60 WHEN a verified artifact reports one or more findings, the server shall store the run with status `succeeded` and the artifact's blocker count, whether the job concluded success or failure.
**Verdict:** Met
**Evidence:** `ci/domain.ts:355` (the job conclusion is not consulted) and `ci/ingest.ts:164`. IT:882 and IGT:52 passed.
**Gap:** —
**To close it:** —

### AC-61 IF a completed run of the DevDigest workflow that AC-140 and AC-141 do not exclude has no `devdigest-result.json` artifact, including a run that concluded `cancelled`, THEN the server shall store the run with status `failed`, its PR number, head SHA and job URL taken from GitHub's run metadata, and no findings count.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:113-126` (`prNumber: run.pull_numbers[0]`, `headSha: run.head_sha`, `jobUrl: run.html_url`, `findingsCount: null`). IT:904 and IGT:111 passed.
**Gap:** —
**To close it:** —

### AC-140 IF a workflow run's head branch is `devdigest/ci`, THEN the server shall store nothing for it, so it counts for neither AC-61 nor AC-62.
**Verdict:** Met
**Evidence:** `ci/domain.ts:377-379`, applied at `ci/ingest.ts:69` before the artifact lookup. IT:922 passed (installation stays `pr_open`).
**Gap:** —
**To close it:** —

### AC-141 IF a workflow run concluded `skipped`, THEN the server shall store nothing for it.
**Verdict:** Met
**Evidence:** `ci/domain.ts:378`. IT:936 passed.
**Gap:** —
**To close it:** —

### AC-62 WHEN the server stores the first run of an installation in state `pr_open`, it shall set that installation's state to `active`.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:76-79`. IT:991 passed.
**Gap:** —
**To close it:** —

### AC-63 WHEN a refresh finds an installation's PR merged, the server shall set that installation's state to `active`.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:80-83`, `octokit.ts` `getPullState`. IT:1003 passed.
**Gap:** —
**To close it:** —

### AC-64 WHEN a refresh finds an installation's PR closed without merging and the installation has no ingested run, the server shall set its state to `pr_closed`.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:84-86`. IT:1014 and IGT:129 passed.
**Gap:** —
**To close it:** —

### AC-65 IF a GitHub request during ingest fails for a repo (403, 404, rate limit or network error), THEN the CI runs list shall still return every run already stored, plus a warning naming that repo.
**Verdict:** Met
**Evidence:** `ci/ingest.ts:42-53` (`Promise.allSettled` turns failures into `{repo, message}`), and `ci/service.ts:125-133` returns the stored rows. IT:1025 and IGT:140 passed.
**Gap:** —
**To close it:** —

### AC-66 The server shall never call the GitHub Actions secrets API.
**Verdict:** Met
**Evidence:** `grep -rnE "secrets|Secret" server/src/adapters/github/octokit.ts` has no match. The only hits in `ci/` are the workflow text `${{ secrets.OPENROUTER_API_KEY }}` and the allowlist strings.
**Gap:** —
**To close it:** —

### AC-67 The server shall never log, store or return a value of `OPENROUTER_API_KEY` or `GITHUB_TOKEN`.
**Verdict:** Met
**Evidence:** The log payloads are `{repo, runId, reason}` (`ci/ingest.ts:188`), `{repo, reason}` (`:50`) and `{repo, status}` (`ci/service.ts:271`). `describeFailure` (`ci/ingest.ts:194-198`) emits only an AppError message or a status. IT:1040 "does not leak a token or an artifact body into a warning" passed.
**Gap:** —
**To close it:** —

### AC-68 The CI runs list shall return the workspace's CI runs newest first, 50 per page.
**Verdict:** Met
**Evidence:** `ci/repository.ts:239-245`, `ci/constants.ts:27`. IT:1055 passed.
**Gap:** —
**To close it:** —

### AC-69 The CI runs list shall filter by time window (`7d` or `all`, defaulting to `7d`), agent, repository and status.
**Verdict:** Met
**Evidence:** C:270-273 and `ci/repository.ts:231-236`. IT:1081 and IT:1106 passed.
**Gap:** —
**To close it:** —

### AC-70 The CI runs list shall report each run's agent as the name of the installation's agent, never the artifact's `agent` string.
**Verdict:** Met
**Evidence:** `ci/repository.ts:214,226-227` (`agents.name` through `ci_installations`). The artifact `agent` is never stored. IT:753 passed.
**Gap:** —
**To close it:** —

### AC-71 The installations list for an agent shall return, per installation, the repository, target `gha`, state, installed agent version, runner version, and the status and time of the latest stored run, or no run.
**Verdict:** Met
**Evidence:** `ci/repository.ts:270-307`, `ci/helpers.ts:323-340`. IT:1143 passed.
**Gap:** —
**To close it:** —

### AC-72 WHERE the agent's current version is newer than an installation's installed agent version, the installations list shall report that installation as behind.
**Verdict:** Met
**Evidence:** `ci/domain.ts:358-360`, `ci/helpers.ts:333`. IT:1168 passed.
**Gap:** —
**To close it:** —

### AC-73 This feature shall change neither the PR feed's behaviour or code, nor the multi-agent review service.
**Verdict:** Met
**Evidence:** `git diff --stat main -- server/src/modules/pulls server/src/modules/reviews client/src/app/pulls` produced empty output. `git status` lists no untracked files under those paths.
**Gap:** —
**To close it:** —

### AC-74 WHEN a CI run is linked to an imported PR, the PR feed's COST for that PR shall include the run's cost through the existing totals, with no code change to the PR feed.
**Verdict:** Met
**Evidence:** IT:842 "adds a linked CI run's cost to the PR feed COST through the existing totals (AC-74)" passed. The pulls diff is empty (AC-73).
**Gap:** —
**To close it:** —

### AC-75 The agent page shall show a CI tab, reachable by URL and by keyboard like the other agent tabs.
**Verdict:** Met
**Evidence:** `client/src/app/agents/[id]/page.tsx:15` `VALID_TABS` includes `ci`; `AgentEditor/constants.ts:17` adds the TABS entry; `AgentEditor.tsx` renders `tab === "ci" && <CiTab/>`. The tab goes through the same TABS mechanism as the other tabs. Flow 14 step 5 waits on `tab=ci` (not run).
**Gap:** —
**To close it:** —

### AC-76 The CI tab shall show the heading "CI deployment" and a badge "Active in N repos", where N is the number of installations in state `active`.
**Verdict:** Met
**Evidence:** `CiTab/CiTab.tsx:36-38`, `CiTab/helpers.ts:4-6`, ci.json:110,112. `CiTab.test.tsx:82` "counts only active installations in the badge…" passed.
**Gap:** —
**To close it:** —

### AC-77 The CI tab shall show one row per installation with the repository, "GitHub Actions", the latest run's status, its relative time, or "no runs yet" when it has none.
**Verdict:** Met
**Evidence:** `InstallationRow.tsx:18-30`. `InstallationRow.test.tsx:37` and `:51` passed.
**Gap:** —
**To close it:** —

### AC-78 Each installation row shall show the workflow version as "agent v<agent version> · runner <runner version>".
**Verdict:** Met
**Evidence:** `InstallationRow.tsx:32`, ci.json:115 `"agent v{agent} · runner {runner}"`. `InstallationRow.test.tsx:37` passed.
**Gap:** —
**To close it:** —

### AC-79 WHERE an installation is behind, its row shall show a "behind" marker.
**Verdict:** Met
**Evidence:** `InstallationRow.tsx:34-38`. `InstallationRow.test.tsx:51` passed.
**Gap:** —
**To close it:** —

### AC-80 Each installation row shall show its state `pr_open`, `active` or `pr_closed` as a label.
**Verdict:** Met
**Evidence:** `InstallationRow.tsx:39`, ci.json:117-121 ("PR open" / "Active" / "PR closed"). `InstallationRow.test.tsx:51` passed.
**Gap:** —
**To close it:** —

### AC-81 The CI tab shall show a "Fail CI on" control with the options never, critical, warning and any, bound to the same agent CI gate setting as the Config tab.
**Verdict:** Met
**Evidence:** `CiTab/CiTab.tsx:58-65` (`value={agent.ci_fail_on}`, `update.mutate({ci_fail_on})`). `AgentEditor/constants.ts` `CI_FAIL_ON_VALUES` is shared with ConfigTab (ConfigTab.tsx imports it from `../../constants`).
**Gap:** —
**To close it:** —

### AC-82 WHEN "Fail CI on" is saved in the CI tab, the Config tab's CI gate shall show the same value after reload.
**Verdict:** Met
**Evidence:** CiTab saves through `useUpdateAgent` to the agent's `ci_fail_on` (CiTab.tsx:62). ConfigTab reads `agent.ci_fail_on` (ConfigTab.tsx:25,37). `CiTab.test.tsx:93` "saves the shared Fail CI on gate through the agent update…" passed.
**Gap:** —
**To close it:** —

### AC-83 The CI tab shall state next to "Fail CI on" that a change reaches a repo only after "Update CI config" and the merge of that PR.
**Verdict:** Met
**Evidence:** `CiTab.tsx:66`, ci.json:126.
**Gap:** —
**To close it:** —

### AC-84 WHEN the user clicks "+ Add to CI", the studio shall open the Export to CI wizard.
**Verdict:** Met
**Evidence:** `CiTab.tsx:41-43,73`. `CiTab.test.tsx:103` passed.
**Gap:** —
**To close it:** —

### AC-85 WHEN the user clicks "Update CI config", the studio shall open the Export to CI wizard with the repository of the selected installation preset.
**Verdict:** Met
**Evidence:** `CiTab.tsx:51` `setWizard({ repo: inst.repo })` → `Wiz/useExportWizard.ts:37`. `CiTab.test.tsx:103` passed.
**Gap:** —
**To close it:** —

### AC-86 WHEN the user clicks the "+ Add repository" row, the studio shall navigate to the existing repository import flow.
**Verdict:** Met
**Evidence:** `CiTab.tsx:53-55` `router.push("/onboarding")`. `client/src/components/app-shell/helpers.test.ts:3` names `/onboarding` as "the add-repository screen".
**Gap:** —
**To close it:** —

### AC-87 The CI tab shall link to the CI Runs page filtered to this agent, as the agent's CI history.
**Verdict:** Met
**Evidence:** `CiTab.tsx:69-71` `/ci-runs?agent=<id>`. `client/src/app/ci-runs/page.tsx:7-11` presets the agent filter. `CiTab.test.tsx:93` passed.
**Gap:** —
**To close it:** —

### AC-88 The wizard shall show the title "Export to CI", the subtitle "Run <agent name> automatically on pull requests" and the steps 1 Target · 2 Preview · 3 Configure · 4 Install.
**Verdict:** Met
**Evidence:** `Wiz/ExportCiWizard.tsx:44-45,74`, `Wiz/constants.ts:4`, ci.json:55-56,63-68. `ExportCiWizard.test.tsx:81` passed.
**Gap:** —
**To close it:** —

### AC-89 The Target step shall show the "GitHub Actions" card, marked "recommended" and selected.
**Verdict:** Met
**Evidence:** `TargetStep.tsx:14-24` (`s.card(true)`, `aria-current="true"`, a "recommended" Badge).
**Gap:** —
**To close it:** —

### AC-90 The Target step shall not show CircleCI, Jenkins or Generic CLI cards.
**Verdict:** Met
**Evidence:** `grep -rln "CircleCI|Jenkins|Generic CLI" client/src client/messages` exits 1 (no match). `ExportCiWizard.test.tsx:81` "offers only GitHub Actions on Target…" passed.
**Gap:** —
**To close it:** —

### AC-91 The Target step shall offer a repository picker that lists only repositories imported into the workspace, with the current repository preselected.
**Verdict:** Met
**Evidence:** `Wiz/useExportWizard.ts:24-26` (`useRepos()` = workspace repos) and `:37` (preset → active repo → first). `TargetStep.tsx:25-27`.
**Gap:** —
**To close it:** —

### AC-92 The Preview step shall list under "FILES TO CREATE" every file the bundle preview returns, and show the selected file's contents.
**Verdict:** Met
**Evidence:** `PreviewStep.tsx:46-66`. `ExportCiWizard.test.tsx:106` passed.
**Gap:** —
**To close it:** —

### AC-93 The Preview step shall let the user edit only files the bundle preview marks editable, and show those with an "editable" badge.
**Verdict:** Met
**Evidence:** `PreviewStep.tsx:51` (badge), `:57-65` (Textarea only if `editable`, otherwise `<pre>`). `ExportCiWizard.test.tsx:106` passed.
**Gap:** —
**To close it:** —

### AC-94 WHILE the wizard is open, the studio shall keep Preview edits across step changes and send them with the install request.
**Verdict:** Met
**Evidence:** `Wiz/useExportWizard.ts:33` (state), `:71-74` (sent through `changedEdits`, `Wiz/helpers.ts:16-23`). `ExportCiWizard.test.tsx:118` passed.
**Gap:** —
**To close it:** —

### AC-95 WHEN the wizard is closed, the studio shall discard Preview edits.
**Verdict:** Met
**Evidence:** `CiTab.tsx:73` mounts the wizard only while it is open, so closing unmounts it and clears state. `ExportCiWizard.test.tsx:118` "…discards edits when reopened" passed.
**Gap:** —
**To close it:** —

### AC-96 The Configure step shall show trigger chips `pull_request:opened` and `pull_request:synchronize` on and `pull_request:reopened` off by default.
**Verdict:** Met
**Evidence:** `Wiz/constants.ts:9-11`, `ConfigureStep.tsx:28-32`. `ExportCiWizard.test.tsx:147` passed.
**Gap:** —
**To close it:** —

### AC-97 WHILE no trigger chip is on, the Configure step shall disable "Continue".
**Verdict:** Met
**Evidence:** `Wiz/useExportWizard.ts:46` and `ExportCiWizard.tsx:61`. `ExportCiWizard.test.tsx:147` passed.
**Gap:** —
**To close it:** —

### AC-98 The Configure step shall list `OPENROUTER_API_KEY` with an instruction to add it under Settings → Secrets and variables → Actions, and with no status badge.
**Verdict:** Met
**Evidence:** `ConfigureStep.tsx:39-42` has no Badge; the text is at ci.json:90.
**Gap:** —
**To close it:** —

### AC-99 The Configure step shall list `GITHUB_TOKEN` as "Auto-provided by Actions".
**Verdict:** Met
**Evidence:** `ConfigureStep.tsx:43-46`, ci.json:91.
**Gap:** —
**To close it:** —

### AC-100 The Configure step shall offer "Post results as" choices "GitHub review" (marked "recommended" and selected by default), "PR comment" and "None (exit code only)".
**Verdict:** Met
**Evidence:** `Wiz/constants.ts:17-22`, `ConfigureStep.tsx:51-69`, ci.json:92-97.
**Gap:** —
**To close it:** —

### AC-101 The Configure step shall show the info text: to block merges, set Fail CI on (CI tab) so the run exits non-zero, then add a required status check in the repo's GitHub branch protection; no GitHub App is needed.
**Verdict:** Met
**Evidence:** `ConfigureStep.tsx:72-74`, ci.json:99.
**Gap:** —
**To close it:** —

### AC-102 The studio shall no longer show the text "Requires a GitHub App — not available with PAT in local mode".
**Verdict:** Met
**Evidence:** `grep -rn "Requires a GitHub App" client/src client/messages` has no match. `git diff client/messages/en/ci.json` shows `blockMergeDesc` removed. `client/messages` holds only `en`.
**Gap:** —
**To close it:** —

### AC-103 The Install step shall offer "Open a PR with these files" (marked "recommended" and selected by default) and "Copy files as a zip".
**Verdict:** Met
**Evidence:** `InstallStep.tsx:53-83` and the `useExportWizard.ts:32` default `"open_pr"`.
**Gap:** —
**To close it:** —

### AC-104 WHEN a PR install succeeds, the wizard shall show a link to the PR.
**Verdict:** Met
**Evidence:** `InstallStep.tsx:29-43`. `ExportCiWizard.test.tsx:168` passed.
**Gap:** —
**To close it:** —

### AC-105 WHEN a PR install succeeds, the CI tab shall show the installation with state `pr_open` without a page reload.
**Verdict:** Partially met
**Evidence:**
- **Holds:** `client/src/lib/hooks/ci.ts:65` invalidates `ciInstallationsKey` on success, so the row refreshes without a reload. `ci.test.tsx:51` passed. A first install shows `pr_open`.
- **Missing:** after a repeat PR install of an `active` installation, the server returns `active` (`ci/repository.ts:104`), so the tab shows "Active".
**Gap:** The same cause as AC-44.
**To close it:** Closed by the same AC-44 decision (amend the spec or change `ci/repository.ts:104`).

### AC-106 WHEN a zip install succeeds, the browser shall download the zip.
**Verdict:** Met
**Evidence:** `client/src/lib/hooks/ci.ts:29-39,64`. `ci.test.tsx:65` "downloads a zip result exactly once" passed.
**Gap:** —
**To close it:** —

### AC-107 IF an install fails, THEN the wizard shall stay on the Install step and show the server's error message.
**Verdict:** Met
**Evidence:** `ExportCiWizard.tsx:33-39,93-100`, `InstallStep.tsx:84-88`. `ExportCiWizard.test.tsx:191` "keeps the wizard on Install and shows the server's 409 message" passed.
**Gap:** —
**To close it:** —

### AC-108 The wizard shall never ask for, accept or show the value of any secret.
**Verdict:** Met
**Evidence:** `ConfigureStep.tsx:37-47` shows names only, with no input. `Wiz/constants.ts:24-26`. `ExportCiWizard.test.tsx:147` "…never asks for a secret" passed.
**Gap:** —
**To close it:** —

### AC-109 The CI Runs page, opened from the sidebar entry "CI Runs", shall show a table with the columns repository, pull request, agent, verdict, findings, cost, duration and a link to the job.
**Verdict:** Met
**Evidence:** `client/src/vendor/ui/nav.ts:41`, `Runs/constants.ts:6`, `CiRunsView.tsx:135-144`. `CiRunsView.test.tsx:73` "shows the eight columns…" passed.
**Gap:** —
**To close it:** —

### AC-110 WHEN a run's cost is null, the CI Runs page shall show "—" in the cost column.
**Verdict:** Met
**Evidence:** `Runs/helpers.ts:6-8`. `CiRunsView.test.tsx:89` passed.
**Gap:** —
**To close it:** —

### AC-111 The CI Runs page shall label a run with status `failed` differently from a run with status `succeeded`.
**Verdict:** Met
**Evidence:** `Runs/constants.ts:14-19`, `CiRunsView.tsx:28`, ci.json:43-45. `CiRunsView.test.tsx:96` passed.
**Gap:** —
**To close it:** —

### AC-112 The CI Runs page shall show the blocker count of a `succeeded` run that has blockers.
**Verdict:** Met
**Evidence:** `Runs/helpers.ts:18-20`, `CiRunsView.tsx:30`. `CiRunsView.test.tsx:96` passed.
**Gap:** —
**To close it:** —

### AC-113 The CI Runs page shall render every value it shows as plain text, never as markdown or HTML.
**Verdict:** Met
**Evidence:** `CiRunsView.tsx:17-46` renders text nodes only, with no `dangerouslySetInnerHTML` and no markdown renderer. `CiRunsView.test.tsx:110` passed.
**Gap:** —
**To close it:** —

### AC-114 WHEN the user clicks Refresh, the CI Runs page shall request the list again and so trigger ingest.
**Verdict:** Met
**Evidence:** `CiRunsView.tsx:81-83` `runs.refetch()` → `GET /ci-runs` → `ci/service.ts:125` `ingest.refresh`. `CiRunsView.test.tsx:123` passed.
**Gap:** —
**To close it:** —

### AC-115 The CI Runs page shall not show the label "auto-refresh on".
**Verdict:** Met
**Evidence:** `grep -rn "auto-refresh on\|autoRefresh" client/src client/messages` has no match. `hooks/ci.ts:89-94` sets no `refetchInterval`. `CiRunsView.test.tsx:123` and `ci.test.tsx:102` passed.
**Gap:** —
**To close it:** —

### AC-116 The CI Runs page shall offer the filters "Last 7 days", "All agents", "All repos" and "All statuses".
**Verdict:** Met
**Evidence:** `CiRunsView.tsx:86-119`, ci.json:18-22.
**Gap:** —
**To close it:** —

### AC-142 The CI Runs page's time filter shall start on "Last 7 days" and offer a second option that lists runs of every age.
**Verdict:** Met
**Evidence:** `CiRunsView.tsx:50` (`"7d"`), `Runs/constants.ts:8-9` (`all` → "All time"). `CiRunsView.test.tsx:151` passed.
**Gap:** —
**To close it:** —

### AC-117 WHEN the list carries an ingest warning, the CI Runs page shall show it above the table, naming the repo.
**Verdict:** Met
**Evidence:** `CiRunsView.tsx:121-128` (before the table at `:133`), ci.json:12. `CiRunsView.test.tsx:135` passed.
**Gap:** —
**To close it:** —

### AC-118 WHEN there are no CI runs, the CI Runs page shall show "No CI runs yet" and "Once you export an agent to CI, every automated review shows up here."
**Verdict:** Met
**Evidence:** `CiRunsView.tsx:132`, ci.json:3-4. `CiRunsView.test.tsx:143` passed.
**Gap:** —
**To close it:** —

### AC-119 The job link on a CI run shall open the job URL in a new tab.
**Verdict:** Met
**Evidence:** `CiRunsView.tsx:36-38` (`target="_blank" rel="noopener noreferrer"`). `CiRunsView.test.tsx:73` passed.
**Gap:** —
**To close it:** —

### AC-120 WHEN the runner writes `devdigest-result.json`, it shall include `repository`, `repository_id`, `head_sha`, `verdict`, `blockers`, `run_id`, `run_attempt`, `installation_id` and `model`.
**Verdict:** Met
**Evidence:**
- `agent-runner/src/artifact.ts:55-63` and `run.ts:154-163` write the fields.
- `context.ts` `resolvePrContext` reads `GITHUB_REPOSITORY_ID`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` and `DEVDIGEST_INSTALLATION_ID` from the environment, and `pull_request.head.sha` from the event.
- `run.test.ts:319` and `context.test.ts:9` passed.
**Gap:** —
**To close it:** —

### AC-121 The runner shall take `verdict` and `blockers` in the artifact from the deterministic gate against the manifest's `ci_fail_on`, never from the model's self-reported verdict.
**Verdict:** Met
**Evidence:** `agent-runner/src/run.ts:35-39,158` (`EVENT_TO_VERDICT[payload.event]`). `run.test.ts:247` and `:319` ("model said approve") passed.
**Gap:** —
**To close it:** —

### AC-122 The runner shall read the PR's changes only through the GitHub API diff, never from files of the PR head.
**Verdict:** Met
**Evidence:** `agent-runner/src/run.ts:114` (`fetchDiffImpl` → `fetchPrDiff`, GitHub API). The workflow checks out only the base commit (`ci/helpers.ts:115-116`).
**Gap:** —
**To close it:** —

### AC-123 The runner shall write no value of `OPENROUTER_API_KEY` or `GITHUB_TOKEN` to `devdigest-result.json`, to stdout or stderr, or to any posted review or comment.
**Verdict:** Met
**Evidence:** `run.test.ts:365` "AC-123: neither OPENROUTER_API_KEY nor GITHUB_TOKEN reaches the artifact, stdout/stderr or the posted payload" passed.
**Gap:** —
**To close it:** —

### AC-124 IF the runner fails before a grounded review exists, THEN it shall exit 1, as it does today.
**Verdict:** Met
**Evidence:** `agent-runner/src/run.ts:187` `return { exitCode: 1, artifact: null, … }`. `run.test.ts:402` passed.
**Gap:** —
**To close it:** —

### AC-125 A hermetic e2e flow shall open the wizard from the agent's CI tab, step through Target, Preview (listing every bundle file) and Configure, install as a PR against the mock GitHub client, and then see an installation row for that repository with state `pr_open`.
**Verdict:** Cannot verify
**Evidence:**
- `e2e/specs/14-export-to-ci.flow.json` exists, with 31 steps covering the CI tab → Target → Preview (waits on all five path kinds) → Configure → Install → "PR OPEN" row.
- The infra is wired: `scripts/e2e.sh` builds the runner bundle and exports `DEVDIGEST_CI_GITHUB_MOCK=true`, and `.github/workflows/e2e-web.yml` does the same.
- `which agent-browser` → "agent-browser not found". This agent is barred from running e2e.
**Gap:** The flow has never been executed.
**To close it:** Run `cd e2e && npm run e2e:hermetic` on a machine with agent-browser and Docker; flow 14 has to pass.

### AC-126 WHEN an agent is exported to a fork of a demo repo, the export PR on `devdigest/ci` shall contain the manifest, skills, memory file, workflow and runner bundle.
**Verdict:** Cannot verify
**Evidence:** This is a manual check on real GitHub (plan T4) and has not been run.
**Gap:** No real-GitHub evidence.
**To close it:** Run T4 and record the PR URL and its file list.

### AC-127 WHEN the export PR is merged and `OPENROUTER_API_KEY` is set in the repo's Actions secrets, a test PR opened from a branch of the same repo shall receive the agent's result in the chosen publish mode.
**Verdict:** Cannot verify
**Evidence:** Manual T4; not run. Plan risk: posting `APPROVE` with the Actions token may return 422 (plan.md:750).
**Gap:** No real-GitHub evidence.
**To close it:** Run T4 and record the test PR with the posted review or comment.

### AC-128 WHILE "Fail CI on" is `critical` and the DevDigest check is required by branch protection, a test PR with a CRITICAL finding shall show that check red and be blocked from merging.
**Verdict:** Cannot verify
**Evidence:** Manual T4; not run.
**Gap:** No real-GitHub evidence.
**To close it:** Run T4 and record the red required check and the blocked merge.

### AC-129 The job log and the `devdigest-result.json` artifact of that run shall contain no value of `OPENROUTER_API_KEY` or `GITHUB_TOKEN`.
**Verdict:** Cannot verify
**Evidence:** Manual T4; not run. The unit-level analogue is AC-123.
**Gap:** No real-GitHub evidence.
**To close it:** Run T4 and grep the downloaded job log and artifact for the key values.

### AC-130 WHEN CI Runs is refreshed after that run completes, it shall list the run with the right repository, PR number and head SHA, and a link that opens the GitHub Actions job.
**Verdict:** Cannot verify
**Evidence:** Manual T4; not run.
**Gap:** No real-GitHub evidence.
**To close it:** Run T4, refresh `/ci-runs`, and record the row against the GitHub run.

### NFR-1: The runner bundle committed as `.devdigest/runner/index.js` shall be at most 5 MB (5,242,880 bytes).
**Verdict:** Met
**Evidence:** `wc -c < agent-runner/dist/index.js` → `1601242`. Enforced at `ci/service.ts:148-150` with `MAX_RUNNER_BYTES = 5_242_880` (`ci/constants.ts:22`).
**Gap:** —
**To close it:** —

### NFR-2: The CI runs list shall return at most 50 runs per page.
**Verdict:** Met
**Evidence:** `ci/repository.ts:240-242`. IT:1055 "returns 50 per page … (AC-68, NFR-2)" passed.
**Gap:** —
**To close it:** —

### NFR-3: The server-side part of this feature (preview, install, ingest) shall make 0 model calls. The only model call is the runner's review in the target repo's CI.
**Verdict:** Met
**Evidence:** `grep -rnE "llm|LLMProvider" server/src/modules/ci` exits 1 (no match). `ci/compose.ts:17-32` wires no LLM.
**Gap:** —
**To close it:** —

### NFR-4: The server-side part of this feature shall need 0 new secrets. It uses the existing server GitHub token for writes and for Actions read access.
**Verdict:** Met
**Evidence:** `platform/config.ts` adds only `DEVDIGEST_RUNNER_BUNDLE_PATH` and `DEVDIGEST_CI_GITHUB_MOCK`, neither of which is a secret. `platform/container.ts:219-223` `ciGithub()` falls back to the existing `github()`.
**Gap:** —
**To close it:** —

### NFR-5: Every new UI string shall live in `messages/en/ci.json` (or the agents namespace for the tab label), with no hard-coded copy in components.
**Verdict:** Partially met
**Evidence:**
- **Holds:** CiTab, InstallationRow, the wizard steps and CiRunsView take all copy from `useTranslations("ci…")` (ci.json:1-136). The tab label `editor.tabs.ci` is in `messages/en/agents.json:60`.
- **Missing:** the new sidebar entry label is hard-coded: `client/src/vendor/ui/nav.ts:41` `{ key: "ci-runs", label: "CI Runs", … }`, which `vendor/ui/shell/NavItem.tsx:54` renders. This follows the existing nav.ts convention for every sidebar label.
**Gap:** One new UI string lives outside ci.json.
**To close it:** Either amend NFR-5 to accept nav.ts as the home of sidebar labels (spec-creator/doc-writer), or translate nav labels.

### NFR-6: The wizard, the CI tab and the CI Runs page shall be fully operable by keyboard: Tab or arrow keys between steps, cards, chips and radios, Enter to continue, Escape to close the wizard.
**Verdict:** Cannot verify
**Evidence:**
- **Tried:** Escape and Enter handlers are at `Wiz/useExportWizard.ts:54-61`. Chips are `<button>` (`vendor/ui/primitives/Chip.tsx:65`). Radios are native `<input type="radio">` (ConfigureStep.tsx:54, InstallStep.tsx:63). Filters use `SelectInput`.
- **Not found:** `grep -rn "Escape|Enter|keyDown|keyboard"` over the CiTab and ci-runs tests matches nothing, so there is no keyboard test. No manual tab-through was recorded, although the plan's coverage row asks for both.
**Gap:** "Fully operable by keyboard" is not proven.
**To close it:** Add a keyboard test for Escape, Enter and tab order, or record a manual tab-through of the three surfaces.

### NFR-7: The wizard, the CI tab and the CI Runs page shall render in both themes (`data-theme="dark"` and `"light"`).
**Verdict:** Cannot verify
**Evidence:** `grep -rnE "#[0-9a-fA-F]{3,6}\b|rgb\("` over `CiTab/` and `client/src/app/ci-runs` (non-test) matches nothing, so the new UI uses only CSS variables. `client/src/test/smoke.test.tsx` renders the component gallery in both themes but not these components. The plan planned a manual check, which was not recorded.
**Gap:** No rendering evidence in either theme.
**To close it:** Do a manual check under both `data-theme` values, or extend the smoke test to mount CiTab, ExportCiWizard and CiRunsView.

### NFR-8: Each rejected artifact and each failed GitHub request during ingest shall produce exactly one server log line with the repo, the GitHub run id and the reason, and no token, key or artifact body.
**Verdict:** Partially met
**Evidence:**
- **Holds for rejected artifacts:** one `warn` with `{repo, runId, reason}` (`ci/ingest.ts:187-190`). The IT rejection table asserts `runId` and the reason. IGT:89 checks that no body is logged.
- **Missing for failed GitHub requests:** `ci/ingest.ts:50` logs `{ repo, reason }` with no run id, including when the failure was on one run's `listRunArtifacts` or `downloadArtifact`, which propagate out of `refreshOne`.
- **Also:** a `getPullRequest` failure in `pullBelongsToRun` (`ci/ingest.ts:181-183`) is swallowed and surfaces only as `mismatch:pr_number`.
**Gap:** The run id is missing from failed-request log lines.
**To close it:** Catch per-run GitHub failures in `ingestRun` and log `{repo, runId, reason}` once. Alternatively, amend NFR-8 to "the run id when the failure concerns one run".

### NFR-9: The bundle preview shall answer within 1,000 ms p95; an install within 10,000 ms p95; one ingest refresh shall add at most 5,000 ms p95 per installation.
**Verdict:** Cannot verify
**Evidence:** No latency measurement exists. The plan assigns it to T4 (`curl -w '%{time_total}'`), which has not been run. The test runs use mocks and say nothing about real p95.
**Gap:** No measurement.
**To close it:** During T4, time ≥20 previews, installs and refreshes against real GitHub and report p95.

## Beyond the plan

**Changed files that no AC asks for:**
- `server/src/platform/errors.ts`: new `ForbiddenError` (403), used for AC-43's `github_write_denied`. The plan amendment dropped Step 6 (`BadRequestError`) and did not list this class.
- `client/src/lib/github-urls.ts`: new `safeHttpUrl`, a hardening of the `href`s for AC-104 and AC-119, from the review fixes.
- `server/src/modules/ci/domain.ts:124-128,382-384` and `ci/ingest.ts:172-184`: PR verification for emptied `pull_numbers` (part of the AC-51 "exceeds").
- `server/src/db/schema/ci.ts:69-74`: legacy `ci_runs` columns (`status`, `findings_count`, `cost_usd`, `source`) were kept and marked unused.
- `docs/plans/export-to-ci/b1-handoff.md`: a working note, not product code.

**Planned work that is not tied to an AC (accounted for by plan steps):**
- `server/src/adapters/mocks.ts` (Step 2)
- `server/package.json` / `pnpm-lock.yaml`: `yaml ^2.9.0` (plan Risks named ^2.6.1)
- `scripts/e2e.sh`, `.github/workflows/e2e-web.yml` (Step 17)
- `server/test/config.test.ts`
- the insights edits in `docs/insights.md`, `server/docs/insights.md`, `agent-runner/docs/insights.md` and `e2e/docs/insights.md`

**Absences checked:**
- **Present:** the module `AGENTS.md` exists, and `server/src/modules/ci/CLAUDE.md -> AGENTS.md` is a symlink. Module spec parts exist for server, ci, client, agent-runner and e2e.
- **Missing:** `docs/specs/README.md` has no SPEC-05 / export-to-ci row (the eval-pipeline row is at :73). `server/README.md` and `client/README.md` do not mention `/ci-runs` or `export-ci`. The plan's Handoff step 10 assigns both to `doc-writer`.

## Gates and tests run

| Command | cwd | Result | Notes |
|---|---|---|---|
| `pnpm typecheck` | server | pass | `tsc --noEmit` exit 0 |
| `pnpm arch:check` | server | pass | "✔ no dependency violations found (278 modules, 968 dependencies cruised)"; 33 known baselined violations ignored |
| `pnpm exec vitest run --exclude '**/*.it.test.ts'` | server | pass | Test Files 61 passed; Tests 911 passed. This lane opens `DATABASE_URL` and reaps running `agent_runs` rows (`server/docs/insights.md`) |
| `pnpm exec vitest run test/ci.it.test.ts` | server | pass | Test Files 1 passed; Tests 88 passed (testcontainers Postgres; Docker was up) |
| `pnpm typecheck` | client | pass | exit 0 |
| `pnpm arch:check` | client | pass | "✔ no dependency violations found (579 modules, 1259 dependencies cruised)" |
| `pnpm test` | client | pass | Test Files 73 passed; Tests 450 passed |
| `pnpm typecheck` | agent-runner | pass | exit 0 |
| `pnpm test` | agent-runner | pass | Test Files 4 passed; Tests 27 passed |
| `diff server/…/eval-ci.ts client/…/eval-ci.ts` | repo root | only `323c323` | pre-existing Conformance hunk (AC-7) |
| `git diff --stat main -- server/src/modules/pulls server/src/modules/reviews client/src/app/pulls` | repo root | empty | AC-73 |
| `wc -c < agent-runner/dist/index.js` | repo root | 1601242 | NFR-1 (dist present from an earlier build; not rebuilt here) |
| `npm run e2e:hermetic` | e2e | skipped | agent-browser not installed (`which agent-browser` → not found); this agent may not run e2e |
| `pnpm build` (agent-runner) | agent-runner | skipped | writes to disk; the existing dist was measured instead |
| `pnpm db:generate` / `db:migrate` | server | skipped | write operations; the migration `0022_lowly_katie_power.sql` was read (additive ALTER/CREATE only) |
| `npm run typecheck` | e2e | not run | e2e has no TS change; the flow is JSON |

## Cannot verify

- **AC-125.** Tried: read flow 14 and the e2e.sh and workflow wiring; checked `which agent-browser`, which was not found. Settled by: a passing `npm run e2e:hermetic` run (14/14) on a machine with agent-browser and Docker.
- **AC-126 to AC-130.** Tried: nothing can be checked locally; these need real GitHub Actions. Settled by: the user's T4 run with recorded evidence (PR URL and files, the test PR's review, the red required check, a grep of the log and artifact for secrets, and the CI Runs row against the GitHub run).
- **NFR-6.** Tried: read the key handlers and control types; found no keyboard test. Settled by: a keyboard test, or a recorded manual tab-through of the wizard, CI tab and CI Runs page.
- **NFR-7.** Tried: grepped for hard-coded colours (none); the smoke test does not mount these components. Settled by: a both-theme render test or a recorded manual check.
- **NFR-9.** Tried: nothing to read, since no measurement exists. Settled by: p95 timings of preview, install and refresh against real GitHub during T4.

## Confidence

**High** for the 138 Met items. Each is anchored in code, and most also in a named test that passed in this run (server 911 unit + 88 IT, client 450, runner 27). **Medium** overall, because nine items rest on runs that have not happened (e2e flow 14, T4, keyboard, themes, latency). Confidence would rise with:
- a green `npm run e2e:hermetic`;
- the T4 record;
- the AC-44 / NFR-5 / NFR-8 wording decisions.

## Insights to record

- `server/src/modules/ci/repository.ts:101-104` deliberately keeps an `active` installation `active` on re-export. That contradicts the literal text of AC-44 and AC-105. Record the intent in the ci module insights, or amend the spec, so a future verifier does not re-flag it.
- The `agent-runner/dist/` bundle is gitignored and produced by `pnpm build`, while the server preview reads it from disk. Plan-verifier and other read-only agents can only measure an existing dist and cannot rebuild it. NFR-1 evidence therefore depends on whoever last built it.

## Closure of the partially met items (coordinator, 2026-10-11, after this report)

| Item | How it was closed |
|---|---|
| AC-44, AC-105 | Spec amended (Changelog 2026-10-11): a re-install keeps an `active` installation `active`; the CI tab shows the recorded state. Code unchanged (`server/src/modules/ci/repository.ts` CASE expression). |
| NFR-5 | Spec amended: the sidebar label lives in `client/src/vendor/ui/nav.ts` by the existing convention (`client/docs/insights.md`). |
| NFR-8 | Code fixed: `server/src/modules/ci/ingest.ts` wraps a per-run failure in `RunIngestError`, so the single warn line carries `{ repo, runId, reason }`. Test: `server/test/ci-ingest.test.ts` "a GitHub failure on one run logs exactly one line with the repo and the run id (NFR-8)". |
| AC-125 | Still Cannot verify: `agent-browser` is not installed on this machine; the user chose to skip the hermetic run. Flow `e2e/specs/14-export-to-ci.flow.json` is written but never executed. |

Result after closure: 142 Met, 0 Partially met, 0 Not met, 9 Cannot verify (AC-125, AC-126 to AC-130, NFR-6, NFR-7, NFR-9).
