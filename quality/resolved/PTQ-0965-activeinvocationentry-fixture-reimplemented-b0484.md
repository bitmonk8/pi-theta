---
id: PTQ-0965
title: b0484's local entry(theta) reimplements the canonical fakeEntry ActiveInvocationEntry builder
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0484-synthesised-exit-kills-and-child-aborts.test.ts:278-286
  - tests/helpers/execution-status-progress.ts:29-36
  - tests/execution-status-progress-tool.test.ts:348-350
sites: 1
fix_scope: localized
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0484's local entry(theta) reimplements the canonical fakeEntry ActiveInvocationEntry builder

## Observation
`tests/b0484-synthesised-exit-kills-and-child-aborts.test.ts` declares a local
`function entry(theta: string): ActiveInvocationEntry` inside its
"channel-death sweep" `describe` block, building the same five-field
`ActiveInvocationEntry` shape (`thetaAbort`, `disposeBarrier`,
`shutdownReason: undefined`, `theta`, `invocationId`) that
`tests/helpers/execution-status-progress.ts` already exports as
`fakeEntry(overrides)`. `tests/execution-status-progress-tool.test.ts:348-350`
demonstrates the exact per-caller-varying-`theta`/`invocationId` usage b0484
needs, built directly from `fakeEntry()` via object-spread with overrides.

## Evidence
`tests/b0484-synthesised-exit-kills-and-child-aborts.test.ts:278-286` (re-read
immediately before filing):
```ts
  function entry(theta: string): ActiveInvocationEntry {
    return {
      thetaAbort: new AbortController(),
      disposeBarrier: Promise.resolve(),
      shutdownReason: undefined,
      theta,
      invocationId: `${theta}-id`,
    };
  }
```

`tests/helpers/execution-status-progress.ts:29-36` (re-read immediately
before filing):
```ts
export function fakeEntry(overrides: Partial<ActiveInvocationEntry> = {}): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    disposeBarrier: Promise.resolve(),
    shutdownReason: undefined,
    theta: "quality-loop",
    invocationId: "inv-1",
    ...overrides,
  };
}
```
Every field b0484's `entry` sets — `thetaAbort: new AbortController()`,
`disposeBarrier: Promise.resolve()`, `shutdownReason: undefined`, `theta`,
`invocationId` — is the same field with the same default construction as
`fakeEntry`'s.

`tests/execution-status-progress-tool.test.ts:348-350` (re-read immediately
before filing), showing the identical override pattern already in use
elsewhere against the canonical helper:
```ts
    const a: ActiveInvocationEntry = { ...fakeEntry(), theta: "a", invocationId: "a-id" };
    const b: ActiveInvocationEntry = { ...fakeEntry(), theta: "b", invocationId: "b-id" };
    const c: ActiveInvocationEntry = { ...fakeEntry(), theta: "c", invocationId: "c-id" };
```

## Why this is a problem
b0484's `entry(theta)` and the canonical `fakeEntry(overrides)` build the same
value from the same five fields with the same expressions
(`new AbortController()`, `Promise.resolve()`, `undefined`). A field added to
`ActiveInvocationEntry` that the sweep under test reads would need to be
added to both b0484's private builder and the shared helper to keep both
current, and `execution-status-progress-tool.test.ts` already shows the
override-per-caller usage (`{ ...fakeEntry(), theta: "a", invocationId:
"a-id" }`) that b0484's own `entry("a")` / `entry("b")` calls would map to
directly.

## Suggested direction (non-binding, optional)
Importing `fakeEntry` from `tests/helpers/execution-status-progress.ts` and
spreading `theta`/`invocationId` overrides, as
`execution-status-progress-tool.test.ts` already does, is the shape already
present in the tree for this exact need.

## False-positive check
- Gate-pin check: `b0484-synthesised-exit-kills-and-child-aborts.test.ts` does not match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `entry(theta)` builds a plain data fixture consumed by `abortInvocationsOnResultChannelDeath`, not a fake that records calls for a MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "b0484-synthesised-exit-kills-and-child-aborts" docs/bugs/*.md` → docs/bugs/0484-*.md cites the test file NAME as its witness suite; it does not document this local `entry` builder as a correct-reason red.
- coverage-matrix citation search: `grep -n "b0484-synthesised-exit-kills-and-child-aborts.test.ts" docs/reference/coverage-matrix.md` → 0 hits.
- Duplicate/prior-finding search: `grep -rl "fakeEntry" quality/issues quality/intake quality/resolved` → 0 hits before this filing. This finding makes no coverage claim — b0484's sweep tests already exercise the abort behaviour; only the fixture-construction function is a local reimplementation of an existing exported helper.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce byte-for-byte at tests/b0484-synthesised-exit-kills-and-child-aborts.test.ts:278-286, tests/helpers/execution-status-progress.ts:29-38 and tests/execution-status-progress-tool.test.ts:348-350; `ActiveInvocationEntry` (src/runtime/active-invocation-registry.ts:33-39) has exactly the five fields both builders set with identical defaults, so `entry(theta)` ≡ `fakeEntry({ theta, invocationId: \`${theta}-id\` })` and the fold is mechanical (fresh `AbortController` per call keeps the :299-307 `Object.defineProperty` cell intact); b0484 imports nothing from the helper; not a gate test, `entry` is a plain data fixture not a recording double, docs/bugs/0484-*.md cites only the file name and coverage-matrix → 0; the filing's dedupe claim "grep -rl fakeEntry quality/… → 0 hits" does NOT reproduce (6 hits) but none tracks this root cause — PTQ-0667 (resolved) is the filing that created `fakeEntry`, PTQ-0856 is the never-settling `makeEntry` vs session-shutdown-harness — so not a duplicate; `sites: 1` undercounts the same resolved-barrier shape retyped as named builders `makeEntry` at tests/active-invocation-registry.test.ts:22-30 and `seededEntry` at tests/e2e-s6-session-shutdown-real-teardown.test.ts:41-49 plus the inline literal at tests/double-session-start-supersession.test.ts:161-167, which should be folded into the location list at acceptance (triage: claude-fable-5-1)
