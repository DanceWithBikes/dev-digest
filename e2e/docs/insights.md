# Insights — e2e

Knowledge you can't see in the code. Newest entry on top of each section.
Format and rules: `.claude/skills/engineering-insights/SKILL.md`.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

- **2026-09-25 · `e2e:hermetic` hangs forever, silently, when ANY stale process already holds port 3100** — Symptom: the run produces no output at all and never exits; `ps` shows `bash ../scripts/e2e.sh` alive but burning no CPU, with a single child, `curl -fsS http://localhost:3100`, stuck for tens of minutes. Root cause: the readiness loop polls the port with `curl -fsS` and **no `--max-time`**, so if something is LISTENING but not answering HTTP — e.g. an orphaned `next dev -p 3100` from a previous session, which in this case had been up for 6 days and returned nothing at all — curl blocks indefinitely and the loop's retry budget never advances. The script never reports "port busy", because from its side the port looks alive. Fix: before blaming the suite, run `lsof -nP -iTCP:3100 -sTCP:LISTEN` and `curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3100` — a `000` means a squatter; kill it (`kill <pid>` plus its `next dev` / `pnpm exec` parents) and re-run. Same applies to the API port (default 3001, `${API_PORT}`), which has the identical unbounded-curl loop. (×1)
  Where: `../scripts/e2e.sh:33` (`WEB_PORT="${E2E_WEB_PORT:-3100}"`), `../scripts/e2e.sh:153` (the unbounded web `curl -fsS` readiness loop), `../scripts/e2e.sh:139` (the same shape for the API port)

- **2026-09-25 · Every flow failing with `spawn agent-browser ENOENT` means the CLI was never installed — it is NOT a package dependency** — All 8 flows fail identically and instantly, which reads like the suite is broken. It isn't: `e2e/package.json` declares only `tsx`, `typescript` and `@types/node`, so `npm install` in this package can never provide `agent-browser`. It is a GLOBAL, one-time prerequisite that also downloads Chrome for Testing — `npm i -g agent-browser && agent-browser install` (`README.md:52-53`) — and the runner shells out to whatever `AGENT_BROWSER_BIN` names (default `agent-browser`, resolved from `PATH`). Check with `which agent-browser` before concluding anything about the flows; a machine that has never installed it has never been able to run e2e at all, no matter how green the rest of the gates are. (×1)
  Where: `package.json` (`devDependencies` — no `agent-browser`), `README.md:52` (the global install line), `README.md:83` (`AGENT_BROWSER_BIN` override)

## Session Notes

## Open Questions

- **2026-09-19 · The L01 features have no e2e flow, though the seed already supports one** — the seeded PR #482 review has one CRITICAL + one WARNING finding and no run row, so without any LLM call the stack shows severity counts in the PR list, pills in the findings panel and "—" as cost. Flow 04 stops at the finding title. Open: add assertions for the FINDINGS column, the pills filter and the COST "—"?
  Where: `server/src/db/seed.ts:136` (seeded review), `specs/04-pr-findings.flow.json:14` (last step)

- **2026-09-19 · CI can miss e2e-breaking changes** — the API under test runs reviewer-core's raw source, yet `reviewer-core/**` and `scripts/e2e.sh` are not in `e2e-web.yml`'s path filter; and `npm run typecheck` (defined here) never runs in CI — tsx doesn't type-check.
  Where: `.github/workflows/e2e-web.yml:20` (`pull_request` paths), `.github/workflows/e2e-web.yml:120` (`npm test` only), `package.json:10` (`typecheck`)
