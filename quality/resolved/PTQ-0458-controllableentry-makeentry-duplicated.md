---
id: PTQ-0458
title: The ControllableEntry/makeEntry settleable-disposeBarrier factory is redeclared byte-for-byte between session-shutdown.test.ts and reload-teardown-quiesce.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/session-shutdown.test.ts:79-104
  - tests/reload-teardown-quiesce.test.ts:285-310
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# The ControllableEntry/makeEntry settleable-disposeBarrier factory is redeclared byte-for-byte between session-shutdown.test.ts and reload-teardown-quiesce.test.ts

## Observation
Both `tests/session-shutdown.test.ts` and `tests/reload-teardown-quiesce.test.ts`
declare an identical `ControllableEntry` interface (an `ActiveInvocationEntry`
paired with a `settle()` callback) and an identical `makeEntry(theta,
invocationId, options)` factory that builds an `ActiveInvocationEntry` whose
`disposeBarrier` is either an externally-settleable `Promise` (when
`options.settleable === true`) or a never-settling `Promise` (the default, to
exercise `session_shutdown` sub-step 3's bounded await). The two declarations
are statement-for-statement identical; the only difference is where an
explanatory comment about the never-settling branch is attached (inline vs. on
its own line above). Neither file imports this from `tests/helpers/`.

## Evidence
tests/session-shutdown.test.ts:79-104 (re-read immediately before filing):
```ts
interface ControllableEntry {
  readonly entry: ActiveInvocationEntry;
  settle(): void;
}

function makeEntry(
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

tests/reload-teardown-quiesce.test.ts:285-310 (re-read immediately before
filing; identical apart from the never-settling-branch comment's position):
```ts
interface ControllableEntry {
  readonly entry: ActiveInvocationEntry;
  settle(): void;
}

function makeEntry(
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
      : new Promise<void>(() => {}); // never settles → sub-step 3 bounded await
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

Exact search: `grep -n "^function makeEntry\|^interface ControllableEntry" tests/*.test.ts` returns exactly these two sites for this shape; `tests/active-invocation-registry.test.ts:22` and `tests/session-swap-tripwire.test.ts:115` each declare a differently-shaped, single-argument `makeEntry(theta, invocationId): ActiveInvocationEntry` with no `ControllableEntry`/`settle` wrapper and are not counted here.

## Why this is a problem
Both files build the identical `ActiveInvocationEntry`-plus-externally-settleable-barrier double to drive the real `runSessionShutdown` sub-step 3 bounded-await path, and the entire factory — the `settle` closure variable, the ternary choosing between a resolvable and a never-settling `Promise`, and the fixed `thetaAbort`/`shutdownReason` field set — is retyped rather than shared. `tests/helpers/` already holds the sibling `FakeClock` seam both files import instead of hand-rolling their own clock, which is the precedent for factoring exactly this kind of double once.

## Suggested direction (non-binding, optional)
A shared `ControllableEntry`/`makeEntry` export alongside the existing `tests/helpers/fake-clock.ts` convention is the natural home the two identical declarations already point at; the fix stage owns the actual extraction.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate, committed-fixture-parse-gate, registry-closed-set-corpus-gate); nothing cited here is a pinned count or inventory assertion.
- Recording-double check: `ControllableEntry`'s `settle()` releases a barrier for a positive-path assertion (the entry's dispose barrier resolving so `disposeBarrier`-driven sub-step 3 logic proceeds); it backs no "never called" MUST-NOT witness, so the negative-witness carve-out does not shield this claim and is not contested here.
- docs/bugs/ signature search: `grep -rl "ControllableEntry\|makeEntry" docs/bugs/*.md` returns no hits; neither file is a documented correct-reason red for this shape — `tests/reload-teardown-quiesce.test.ts` is itself a documented RED-by-design suite for a different reason (the PIC-57 teardown-aware debouncer, cited via its own header against pi-integration-contract/session-shutdown-semantics.md), but re-running the suite confirms all 9 of its tests pass at HEAD, and this finding does not contest that file's redness or behaviour — only the duplicated `ControllableEntry`/`makeEntry` factory both files depend on regardless.
- coverage-matrix/bug-doc citation search: `grep -n "session-shutdown.test.ts\|reload-teardown-quiesce.test.ts" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` inside them.
- Coverage-drift check: this finding is about a repeated harness-double DEFINITION that exists in both files today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/session-shutdown.test.ts:79-104 and tests/reload-teardown-quiesce.test.ts:285-310 (identical apart from the never-settling-branch comment placement); `grep -n "^function makeEntry\|^interface ControllableEntry" tests/*.test.ts` returns exactly these two ControllableEntry-shaped sites (active-invocation-registry.test.ts:22 and session-swap-tripwire.test.ts:115 are the differently-shaped two-arg variant, correctly excluded); tests/helpers/ has no such export; both copies are live (14 and 2 call sites; both suites pass, 36 + 9 tests); no docs/bugs/ or coverage-matrix citation; neither file is a gate kin; no existing PTQ or same-wave sibling covers this factory (siblings cover the spy quartet, controllableRebuild, and the deps builder) — copy-paste fixture/double, in tests/ only (triage: claude-fable-5-1)
