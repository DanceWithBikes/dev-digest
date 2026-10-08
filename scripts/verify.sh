#!/usr/bin/env bash
# Root verification: runs every lane even after a failure, prints a PASS/FAIL
# summary table, exits 1 if any lane failed. `--it` adds the Docker-backed
# server integration lane. Deliberately no `set -e`.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WITH_IT=0
[ "${1:-}" = "--it" ] && WITH_IT=1

LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

NAMES=()
RESULTS=()
N=0

# run_lane <name> <cwd> <command...> — logs to a temp file, prints its tail on failure.
run_lane() {
  local name="$1" dir="$2"
  shift 2
  N=$((N + 1))
  local log="$LOGDIR/lane-$N.log"
  echo "==> $name"
  (cd "$dir" && "$@") >"$log" 2>&1
  local rc=$?
  NAMES+=("$name")
  if [ $rc -eq 0 ]; then
    RESULTS+=("PASS")
  else
    RESULTS+=("FAIL")
    echo "    FAILED (exit $rc) — last 40 lines:"
    tail -n 40 "$log" | sed 's/^/    | /'
    LAST_FAILED=1
    return 1
  fi
  LAST_FAILED=0
}

record() { # record <name> <rc> <message-on-failure>
  N=$((N + 1))
  NAMES+=("$1")
  if [ "$2" -eq 0 ]; then RESULTS+=("PASS"); else RESULTS+=("FAIL"); echo "    $3" | sed 's/^/    | /'; fi
}

if [ ! -d "$ROOT/reviewer-core/node_modules" ]; then
  echo "note: reviewer-core/node_modules is missing — run: cd reviewer-core && npm ci"
  echo "      (server typecheck needs it too)"
fi

# (a) reviewer-core
run_lane "reviewer-core typecheck" "$ROOT/reviewer-core" npm run typecheck
run_lane "reviewer-core tests" "$ROOT/reviewer-core" npm test

# (b) server
run_lane "server typecheck" "$ROOT/server" pnpm typecheck
run_lane "server arch:check" "$ROOT/server" pnpm arch:check
run_lane "server unit (eval, seed-eval, contracts)" "$ROOT/server" \
  pnpm exec vitest run --exclude '**/*.it.test.ts' eval seed-eval contracts

# (c) shared parity — the eval contract and the barrel only; the whole tree
# already drifts in 5 unrelated files (docs/insights.md).
echo "==> shared copies parity (eval-pipeline.ts + index.ts)"
S="$ROOT/server/src/vendor/shared"
C="$ROOT/client/src/vendor/shared"
OUT="$(diff "$S/contracts/eval-pipeline.ts" "$C/contracts/eval-pipeline.ts" 2>&1
       diff "$S/index.ts" "$C/index.ts" 2>&1)"
if [ -z "$OUT" ]; then
  record "shared copies parity" 0 ""
else
  record "shared copies parity" 1 "$(echo "$OUT" | head -n 40)"
fi

# (d) scoring guard (AC-120): pure, no model calls, type-only imports.
echo "==> scoring guard (reviewer-core/src/eval/score.ts)"
SCORE="$ROOT/reviewer-core/src/eval/score.ts"
GUARD_RC=0
GUARD_MSG=""
if [ ! -f "$SCORE" ]; then
  GUARD_RC=1
  GUARD_MSG="missing $SCORE"
else
  BAD_IMPORTS="$(grep -nE '^(import |export .* from )' "$SCORE" | grep -vE '^[0-9]+:(import|export) type ' )"
  if [ -n "$BAD_IMPORTS" ]; then
    GUARD_RC=1
    GUARD_MSG="non-type import(s):"$'\n'"$BAD_IMPORTS"
  fi
  for tok in 'openai' 'anthropic' 'openrouter' 'completeStructured' 'LLMProvider' 'fetch(' 'process.env'; do
    HIT="$(grep -nF -- "$tok" "$SCORE")"
    if [ -n "$HIT" ]; then
      GUARD_RC=1
      GUARD_MSG="$GUARD_MSG"$'\n'"forbidden token '$tok':"$'\n'"$HIT"
    fi
  done
fi
record "scoring guard" "$GUARD_RC" "$GUARD_MSG"

# (e) client
run_lane "client typecheck" "$ROOT/client" pnpm typecheck
if [ "$LAST_FAILED" = "1" ]; then
  echo "    hint: a new route must be requested once under \`pnpm dev\` so Next generates its route types"
fi
run_lane "client arch:check" "$ROOT/client" pnpm arch:check
run_lane "client unit (eval-related)" "$ROOT/client" \
  pnpm exec vitest run evals EvalsTab EvalDashboard CaseEditor FindingCard FindingsPanel DiffTab diff-text eval-metrics Sparkline

# (f) integration (Docker)
if [ "$WITH_IT" -eq 1 ]; then
  run_lane "server integration (eval.it)" "$ROOT/server" pnpm exec vitest run eval.it
fi

# Summary
echo
echo "Summary"
echo "-------"
FAILED=0
for i in "${!NAMES[@]}"; do
  printf '%-4s %s\n' "${RESULTS[$i]}" "${NAMES[$i]}"
  [ "${RESULTS[$i]}" = "FAIL" ] && FAILED=$((FAILED + 1))
done
echo "-------"
if [ "$FAILED" -gt 0 ]; then
  echo "$FAILED lane(s) FAILED"
  exit 1
fi
echo "All ${#NAMES[@]} lanes PASS"
exit 0
