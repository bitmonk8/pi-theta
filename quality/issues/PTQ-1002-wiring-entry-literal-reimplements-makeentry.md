---
id: PTQ-1002
title: active-invocation-wiring.test.ts hand-builds two ActiveInvocationEntry literals instead of the canonical makeEntry fixture
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/active-invocation-wiring.test.ts:176-182
  - tests/active-invocation-wiring.test.ts:205-211
  - tests/helpers/session-shutdown-harness.ts:17-41
sites: 2
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# active-invocation-wiring.test.ts hand-builds two ActiveInvocationEntry literals instead of the canonical makeEntry fixture

## Observation
`tests/active-invocation-wiring.test.ts` builds two `ActiveInvocationEntry`
object literals inline, one per `it()`, each setting the same five fields
(`thetaAbort`, `disposeBarrier`, `shutdownReason: undefined`, `theta`,
`invocationId`) that `tests/helpers/session-shutdown-harness.ts` already
exports a `makeEntry(theta, invocationId, options)` factory for. The file
imports `shutdownDeps` indirectly through nothing (it never imports from
`session-shutdown-harness` at all), so it does not reach for the canonical
factory that three other test files in the tree already import from that
same module for the identical entry shape.

## Evidence
`tests/active-invocation-wiring.test.ts:176-182` (re-read immediately before
filing — the "cancel in-flight" test's inline entry):
```ts
    const entry: ActiveInvocationEntry = {
      thetaAbort,
      // Immediately-settling barrier so sub-step 3 does not park.
      disposeBarrier: Promise.resolve(),
      shutdownReason: undefined,
      theta: "foo",
      invocationId: "inv-42",
    };
```

`tests/active-invocation-wiring.test.ts:205-211` (re-read immediately before
filing — the "bounded await" test's inline entry):
```ts
    const entry: ActiveInvocationEntry = {
      thetaAbort: new AbortController(),
      // Never settles — forces the sub-step 3 cap to fire.
      disposeBarrier: new Promise<void>(() => {}),
      shutdownReason: undefined,
      theta: "foo",
      invocationId: "inv-stuck",
    };
```

`tests/helpers/session-shutdown-harness.ts:17-41` (re-read immediately before
filing — the canonical factory building the identical five-field shape,
including the identical never-settling-barrier default the second inline
entry above duplicates verbatim):
```ts
export interface ControllableEntry {
  readonly entry: ActiveInvocationEntry;
  settle(): void;
}

export function makeEntry(
  theta: string,
  invocationId: string,
  options: { settleable?: boolean } = {},
): ControllableEntry {
  let settle: () => void = (): void => {};
  const disposeBarrier =
    options.settleable === true
      ? new Promise<void>((resolve) => {
          settle = resolve;
        })
      : // A never-settling barrier so sub-step 3's bounded await is exercised.
        new Promise<void>(() => {});
  const entry: ActiveInvocationEntry = {
    thetaAbort: new AbortController(),
    disposeBarrier,
    shutdownReason: undefined,
    theta,
    invocationId,
  };
  return { entry, settle };
}
```
The second inline entry (`:205-211`, never-settling `disposeBarrier`) is
exactly `makeEntry("foo", "inv-stuck").entry` with no options — the same
`new AbortController()`, the same `shutdownReason: undefined`, and the same
`new Promise<void>(() => {})` default branch, field for field. The first
inline entry (`:176-182`, an already-resolved `disposeBarrier`) differs only
in needing the barrier settled at construction rather than later via
`settle()`; `makeEntry(theta, invocationId, { settleable: true })` followed
by an immediate `settle()` call reaches the same pre-settled state through
the existing factory. `grep -n "makeEntry(" tests/*.test.ts` shows
`tests/session-shutdown.test.ts`, `tests/reload-teardown-quiesce.test.ts`,
and `tests/session-swap-tripwire.test.ts` all importing and calling this
same factory for this same entry shape; `active-invocation-wiring.test.ts`
is not among them.

## Why this is a problem
The five-field `ActiveInvocationEntry` construction — `thetaAbort`,
`disposeBarrier`, `shutdownReason: undefined`, `theta`, `invocationId` — is
retyped twice in this file rather than reached through the one factory three
other files already import from `tests/helpers/session-shutdown-harness.ts`
for the identical shape. A field added to `ActiveInvocationEntry` that the
factory's default construction accounts for would need a fourth,
independently-typed update inside this file to stay current with the three
files that already call the shared helper.

## Suggested direction (non-binding, optional)
Importing `makeEntry` from `tests/helpers/session-shutdown-harness.ts`, as
`session-shutdown.test.ts` / `reload-teardown-quiesce.test.ts` /
`session-swap-tripwire.test.ts` already do, and taking `.entry` (calling
`settle()` immediately for the first test's already-resolved case, and
passing no options for the second test's never-settling case) is the shape
already present in the tree for this exact need.

## False-positive check
- Gate-pin check: `active-invocation-wiring.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: both entries back positive assertions (the abort
  fires, `shutdownReason` is stamped, the timeout line is emitted), not
  MUST-NOT-called witnesses; the negative-witness recording-double carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rln "active-invocation-wiring"
  docs/bugs/` → `docs/bugs/0074-registry-insertion-after-binder-await.md`
  cites the file NAME as a witness; it does not document either inline
  entry literal as a correct-reason red, and no skip or disabled-test claim
  is made here.
- coverage-matrix citation search: `grep -n "active-invocation-wiring.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of the file or either `it()` — only that the
  two entry literals could be built through the existing `makeEntry` import
  instead of retyped.
- Coverage-drift check: this finding is about a fixture-construction shape
  repeated inside test code that exists and passes today; it makes no claim
  that any behaviour or path is untested.
- Duplicate/prior-finding check: `quality/resolved/PTQ-0458-controllableentry-makeentry-duplicated.md`
  (fixed) covered the byte-identical LOCAL `ControllableEntry`/`makeEntry`
  DECLARATION duplicated between `session-shutdown.test.ts` and
  `reload-teardown-quiesce.test.ts`; its fix produced the shared
  `tests/helpers/session-shutdown-harness.ts` module cited above (confirmed
  live: three importers found by grep). `quality/issues/PTQ-0965-...md`
  (open) covers a DIFFERENT, unrelated file (`b0484-...test.ts`) reimplementing
  a DIFFERENT canonical helper (`fakeEntry` in
  `tests/helpers/execution-status-progress.ts`). Neither prior finding cites
  `active-invocation-wiring.test.ts:176-182` or `:205-211`; this is the first
  filing naming this file's two entry literals against the now-existing
  `makeEntry` factory.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/active-invocation-wiring.test.ts:176-182 and :205-211 and the factory at tests/helpers/session-shutdown-harness.ts:17-41; `ActiveInvocationEntry` (src/runtime/active-invocation-registry.ts:33-39) has exactly the five fields both literals set, so :205-211 ≡ `makeEntry("foo", "inv-stuck").entry` field-for-field (same never-settling default branch) and :176-182 ≡ `makeEntry("foo", "inv-42", { settleable: true })` + immediate `settle()` (the local `thetaAbort` becomes `entry.thetaAbort`, which the abort listener already reads through `entry`) — a mechanical fold; the file imports nothing from session-shutdown-harness while `grep -rln helpers/session-shutdown-harness tests/` → 8 importers and `makeEntry(` is called from 4 test files; both copies are live (suite green 4/4), back positive assertions (abort fires, stamp-before-abort, one timeout line), not gate kin; coverage-matrix → 0 reproduces; the docs/bugs search under-reports (0073/0074/0468 cite the file, not just 0074) but all three name it only as a span/cancel witness, none documents either literal as a correct-reason red and no merge/rename/delete is proposed, so no carve-out applies; D7 copy-paste fixture, both locations under tests/; not a duplicate — PTQ-0458 minted the helper, PTQ-0856 (fixed) folded session-swap-tripwire's local copy into this same `makeEntry`, PTQ-0965 (open) and same-wave d7-01-seededentry track `fakeEntry`-shaped resolved-barrier builders in b0484 / e2e-s6 / supersession / registry.test, and none cites this file; 2-site per-file scoping is honest (`grep ": ActiveInvocationEntry = {" tests/` → only these two inline literals outside the helpers and the already-tracked files) (triage: claude-fable-5-1)
