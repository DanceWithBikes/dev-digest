# Blast Radius — repo-intel part (per-symbol caller cap fix)

> Introduced in: L04. Overview: [`docs/specs/blast-radius.md`](../../../../../../docs/specs/blast-radius.md).
> Refs are `path:line` (`symbol`) at the time of writing — if a line moved, search for the symbol.

## Goal

The Blast Radius feature itself lives in `modules/blast/` (this module only computes the raw
facade result it reads). L04 fixed one pre-existing bug in this facade as a prerequisite: the
`MAX_CALLERS_PER_SYMBOL` cap was applied with a single global `slice()` over the whole rank-sorted
caller list, so one high-fan-out changed symbol could consume the entire cap and starve every other
changed symbol's callers down to zero. The fix caps callers PER `viaSymbol` instead, on both the
persistent (Postgres) path and the ripgrep fallback.

## Acceptance criteria

- [x] `tryPersistentBlast` caps each `viaSymbol` group at `MAX_CALLERS_PER_SYMBOL`, keeping rank order, via a per-symbol counter instead of a global slice — `service.ts:382`-`:389` (`cappedCallers`, `countPerSymbol`) · test: `../../../test/repo-intel-blast-cap.test.ts:16` ("persistent index: 25 callers for symbol A + 3 for symbol B → 20 A + 3 B")
- [x] The ripgrep fallback (`getBlastRadius`, no persistent index) applies the same per-symbol cap, not a global one — `service.ts:272`-`:292` (`countForSymbol`) · test: `../../../test/repo-intel-blast-cap.test.ts:56` ("ripgrep fallback (no persistent index): same per-symbol cap applies")
- [x] The limit itself is unchanged — still `MAX_CALLERS_PER_SYMBOL = 20`, still declared in `constants.ts` as the single source of truth for both paths — `constants.ts:30` · test: both cases above import `MAX_CALLERS_PER_SYMBOL` from this file rather than hardcoding 20

## Touched packages / modules

Project overview and the full cross-package table: [`docs/specs/blast-radius.md`](../../../../../../docs/specs/blast-radius.md).
Consumer of this fix: [`server/src/modules/blast/docs/specs/blast-radius.md`](../../../../blast/docs/specs/blast-radius.md).

## Open questions

- None — both paths are covered by an extend of `repo-intel-facade-degraded.test.ts`'s technique (fake `repo`/`codeIndex`, no Postgres), and the fix is a pure counting change with no contract impact.
