---
id: PTQ-0856
title: session-swap-tripwire.test.ts's local makeEntry re-implements the canonical helper's makeEntry default (non-settleable) branch, comment included
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/session-swap-tripwire.test.ts:100-109
  - tests/helpers/session-shutdown-harness.ts:23-39
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# session-swap-tripwire.test.ts's local makeEntry re-implements the canonical helper's makeEntry default (non-settleable) branch, comment included

## Observation
`tests/session-swap-tripwire.test.ts` imports `sinkSpy`, `shutdownDeps`, and
`eventWith` from `tests/helpers/session-shutdown-harness.ts` (line 32), a
module that also exports a `makeEntry(theta, invocationId, options?)`
function whose default (`options.settleable` unset) branch builds an
`ActiveInvocationEntry` with a never-settling `disposeBarrier`. The file
declares its own single-purpose local `makeEntry(theta, invocationId):
ActiveInvocationEntry` (lines 100-109) that reproduces exactly that default
branch's field set and its explanatory comment verbatim, rather than calling
the imported module's `makeEntry(...).entry`.

## Evidence
tests/session-swap-tripwire.test.ts:100-109 (re-read immediately before
filing):
```ts
function makeEntry(theta: string, invocationId: string): ActiveInvocationEntry {
  return {
    thetaAbort: new AbortController(),
    // A never-settling barrier so sub-step 3's bounded await is exercised.
    disposeBarrier: new Promise<void>(() => {}),
    shutdownReason: undefined,
    theta,
    invocationId,
  };
}
```

tests/helpers/session-shutdown-harness.ts:23-39 (re-read immediately before
filing — the module this same file already imports three other exports
from):
```ts
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
```

The five-field `ActiveInvocationEntry` object literal
(`thetaAbort: new AbortController()`, `disposeBarrier: new Promise<void>(()
=> {})`, `shutdownReason: undefined`, `theta`, `invocationId`) and the exact
comment string "A never-settling barrier so sub-step 3's bounded await is
exercised." are byte-identical between the local function's body and the
helper's default-branch code path; the local declaration only omits the
`settle`/`ControllableEntry` wrapper the imported version would return
alongside the entry (unused by this file's one call site at line 187, which
passes the local `makeEntry(...)` result straight into
`activeInvocations.add(...)`).

Exact search: `grep -n "^function makeEntry\|^export function makeEntry" tests/session-swap-tripwire.test.ts tests/helpers/session-shutdown-harness.ts` → exactly these two sites.

## Why this is a problem
The file's own import line (32) shows it already depends on
`tests/helpers/session-shutdown-harness.ts` for three of this fixture
family's exports; `makeEntry`'s default branch is a fourth export covering
this file's exact single use case (a non-settleable `ActiveInvocationEntry`
for arming the tripwire), yet the field set and its comment were retyped
locally instead of read off `makeEntry(theta, invocationId).entry`. A change
to the `ActiveInvocationEntry` shape (e.g. a new required field) must be
applied to both this local copy and the module's export to stay in sync.

## Suggested direction (non-binding, optional)
Calling the imported `makeEntry(theta, invocationId).entry` (its default,
non-settleable branch already matches this file's one call site) removes
the local redeclaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; nothing cited here is a pinned count or inventory assertion.
- Recording-double check: the built entry backs a genuine positive assertion
  in this file (`expect(drainSpy).toHaveBeenCalledTimes(1)` and
  `expect(harness.deps.discoveryWatcher.close).toHaveBeenCalledTimes(1)`
  driven off adding this entry to `activeInvocations`); this finding targets
  the redeclared FIXTURE-BUILDING code, not the validity of any assertion
  built on top of it.
- docs/bugs/ signature search: `grep -rl "makeEntry" docs/bugs/*.md` → 0
  hits; `grep -rl "session-swap-tripwire" docs/bugs/*.md` → 0073/0371/0375/0451
  narrative references, none naming this `makeEntry` function or these line
  numbers, and none is a documented correct-reason red for this file (the
  suite is green at HEAD: `npx vitest run tests/session-swap-tripwire.test.ts`,
  13/13 passing).
- coverage-matrix/bug-doc citation search: `grep -n "session-swap-tripwire.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any file or `it()`/`describe()`.
- Coverage check: the claim is about a repeated fixture-factory DEFINITION
  that exists today, not a missing test path; the prior resolved finding
  PTQ-0458 (session-shutdown.test.ts / reload-teardown-quiesce.test.ts's
  `ControllableEntry`/settleable `makeEntry` pair) explicitly excluded this
  file's differently-shaped single-argument `makeEntry` from ITS count —
  that exclusion was about a different (settleable) shape pairing and predates
  the canonical helper module existing with a default branch that now covers
  this exact non-settleable case; this finding is scoped only to the
  post-helper redundancy between this file's local copy and the helper's
  already-imported-from module.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/session-swap-tripwire.test.ts:100-109 and tests/helpers/session-shutdown-harness.ts:23-43; the local body's five fields (`thetaAbort: new AbortController()`, never-settling `disposeBarrier`, `shutdownReason: undefined`, `theta`, `invocationId`) match the helper's default (`settleable` unset) branch exactly and the comment "A never-settling barrier so sub-step 3's bounded await is exercised." occurs once in each file; the test already imports `sinkSpy`/`shutdownDeps`/`eventWith` from that same module at :32 but not `makeEntry`; the local copy is live (one call at :181 → `activeInvocations.add`, backing positive drain/close assertions; suite green 13/13); `grep "^function makeEntry\|^export function makeEntry" tests/` → three declarations, the third (active-invocation-registry.test.ts:22) uses `Promise.resolve()` and does not import the helper, so the 1-site scoping is honest; stated searches reproduce (docs/bugs `makeEntry` → 0; coverage-matrix cite → 0; the bug-doc file list is 0047/0371/0375/0451 not 0073/…, and 0047 cites the src/ module, so no carve-out applies); not a gate file, no merge/rename/delete proposed; D7 copy-paste fixture, both locations under tests/; not a duplicate — fixed PTQ-0458 minted this helper export but explicitly excluded this file's single-arg copy from its count, PTQ-0509/0699 cover the deps builder, and same-wave d7-01-signalspy covers a different residual (signalSpy in session-shutdown.test.ts) (triage: claude-fable-5-1)
