---
id: PTQ-1011
title: session-control-adapters.test.ts hand-rolls the microtask/macrotask drain twice instead of calling settleAndObserve from the module it already imports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/session-control-adapters.test.ts:243-247
  - tests/session-control-adapters.test.ts:274-277
sites: 2
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# session-control-adapters.test.ts hand-rolls the microtask/macrotask drain twice instead of calling settleAndObserve from the module it already imports

## Observation
`tests/session-control-adapters.test.ts:19` imports
`createUnhandledRejectionTrap` from `./helpers/unhandled-rejection-trap`. That
same module also exports `settleAndObserve()`, an async function that drains
eight microtask turns, takes one macrotask turn via
`setTimeout(resolve, 0)`, then drains eight more microtask turns, for the
exact purpose this file's D5b and D5c tests need ("so a would-be
unhandledRejection lands"). Both D5b and D5c re-type a two-thirds subset of
that same sequence inline (the leading eight-microtask loop and the single
macrotask turn, omitting only the trailing eight-microtask loop) instead of
importing and calling `settleAndObserve()`.

## Evidence
`tests/session-control-adapters.test.ts:19` (the import already present in
this file):
```ts
import { createUnhandledRejectionTrap } from "./helpers/unhandled-rejection-trap";
```

`tests/helpers/unhandled-rejection-trap.ts:53-63` (the exported function the
file above does not also import):
```ts
export async function settleAndObserve(): Promise<void> {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}
```

`tests/session-control-adapters.test.ts:243-247` (D5b, re-read immediately
before filing):
```ts
    // Drain microtasks + one macrotask so a would-be unhandledRejection lands.
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

```

`tests/session-control-adapters.test.ts:274-277` (D5c, byte-identical to the
D5b excerpt above):
```ts
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

```

Exact search: `grep -n "for (let i = 0; i < 8; i++) {" tests/*.test.ts` → 4
hits total (`checkpoint-seam.test.ts:44`,
`hot-reload-stale-ctx-replacement.test.ts:308`, and the two cited sites in
`session-control-adapters.test.ts`); this finding cites only the two sites
inside the in-scope file.

## Why this is a problem
The two inline copies are not independent re-derivations: they sit in a file
that already has a live import statement reaching the exact module that
exports the ready-made drain function, `settleAndObserve`, under the name the
copies' own leading comment describes verbatim ("Drain microtasks + one
macrotask so a would-be unhandledRejection lands" vs the helper's doc comment
"Drain microtasks and take a macrotask turn so a would-be
`unhandledRejection` … is observed if it fires"). A change to the drain
sequence's turn count (already tuned once, per PTQ-0514's resolution, to
reliably surface a scheduled `unhandledRejection`) is applied at the shared
helper and silently NOT applied to these two inline, shorter copies, which
now drain a different (smaller) number of microtask turns than every other
site in the suite that calls `settleAndObserve()`.

## Suggested direction (non-binding, optional)
Both D5b and D5c could call the already-imported module's `settleAndObserve`
export directly, extending this file's existing import statement to include
it, the same way `query-swallowing-handler.test.ts` (same lens scope) already
imports `settleAndObserve` alongside `createUnhandledRejectionTrap` from the
identical module.

## False-positive check
- Gate-pin check: `session-control-adapters.test.ts` does not match
  `*gate*.test.ts` or the named gate kin.
- Recording-double check: the `unhandled` array these drains feed is a
  legitimate MUST-NOT witness (`expect(unhandled).toEqual([])`); this finding
  targets only the drain-sequence declaration being retyped, not the
  validity of that assertion.
- docs/bugs/ signature search: `grep -rl "session-control-adapters"
  docs/bugs/*.md` → 0 hits; no documented correct-reason red covers this
  block.
- coverage-matrix/bug-doc citation search: `grep -n
  "session-control-adapters.test.ts" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any file or
  `it()`/`describe()`.
- Prior-finding overlap check: `grep -rli "settleandobserve" quality/intake/*.md`
  (this wave, all shards so far) → 0 hits. PTQ-0514 (resolved, "fixed") cited
  `session-control-adapters.test.ts:192-202` for the four-piece
  trap-only subset (this file had no drain-loop call at filing time — the
  D5b/D5c cells citing it here did not yet exist in that snapshot) and its
  fix hoisted `settleAndObserve` into `tests/helpers/unhandled-rejection-trap.ts`,
  which this file already partially adopted (it now imports
  `createUnhandledRejectionTrap` from that exact module). The two sites cited
  here are a residual, distinct re-duplication of the other half of that same
  fix, not a restatement of PTQ-0514's own evidence.
- Coverage check: the claim is about the drain-sequence DECLARATION being
  retyped rather than imported; both D5b and D5c exercise their own copy
  successfully today (both suites green), so no coverage claim is made.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/session-control-adapters.test.ts:243-247 and :274-277 (byte-identical 4-line drain blocks) and `settleAndObserve` at tests/helpers/unhandled-rejection-trap.ts:56-63 is exactly that sequence plus a trailing 8-microtask loop, so substituting `await settleAndObserve()` drains a strict superset and cannot weaken the two MUST-NOT witnesses (`settledCount ≤ 1`, `unhandled` empty); the file already imports from that module (line 19) and 5 sibling files (cancellation-core, invoke-/query-/tool-calls-swallowing-handler, production-cancellation-wiring) call the export; the stated searches reproduce (drain-loop grep → 4 hits, but checkpoint-seam:44 is a microtask-only `flushMicrotasks` and hot-reload-stale-ctx-replacement:308 is a 20ms poll tail — different shapes, so `sites: 2` is the correct count for this root cause; docs/bugs 0, coverage-matrix 0); not a duplicate — resolved PTQ-0514 scoped this file to the trap-only subset at 192-202 and its fix commit 29ba0112 migrated only the trap, leaving these loops as an un-migrated residual, PTQ-0690 is the abort-race wrapper, PTQ-0976 is makeChannels; one FP-check inaccuracy is non-blocking: git blame shows both loops landed in 6b219884 (2026-09-16), BEFORE PTQ-0514 filed, so the "D5b/D5c did not yet exist in that snapshot" claim is wrong, but 0514 never cited or tracked these lines either way; D7 boilerplate-duplication class, all sites under tests/, not a gate file, no merge/rename/delete proposed, file green (15/15); fix is a mechanical two-block replacement plus one import extension (triage: claude-fable-5-1)
