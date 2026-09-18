---
id: PTQ-0837
title: session-shutdown.test.ts redeclares signalSpy locally while already importing its sibling exports from the same canonical helper module
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/session-shutdown.test.ts:84-88
  - tests/helpers/session-shutdown-harness.ts:50-53
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# session-shutdown.test.ts redeclares signalSpy locally while already importing its sibling exports from the same canonical helper module

## Observation
`tests/session-shutdown.test.ts` imports `watcherSpy`, `makeEntry`,
`healthyInventory`, `type ControllableEntry`, `shutdownDeps`, and `eventWith`
from `tests/helpers/session-shutdown-harness.ts` (lines 32-39), a module that
also exports a `signalSpy(label)` function building a
`ForwardingSignalSource & { removeEventListener: vi.fn }` double. Rather than
importing that seventh export, the file declares its own module-level
`signalSpy` function (lines 84-88) with the identical parameter type, return
type, and body.

## Evidence
tests/session-shutdown.test.ts:84-88 (re-read immediately before filing):
```ts
function signalSpy(label: ForwardingSignalSource["label"]): ForwardingSignalSource & {
  removeEventListener: ReturnType<typeof vi.fn>;
} {
  return { label, removeEventListener: vi.fn() };
}
```

tests/helpers/session-shutdown-harness.ts:50-53 (re-read immediately before
filing — the already-exported, already-imported-from-in-this-same-file
module's sibling function):
```ts
export function signalSpy(
  label: ForwardingSignalSource["label"],
): ForwardingSignalSource & { removeEventListener: ReturnType<typeof vi.fn> } {
  return { label, removeEventListener: vi.fn() };
}
```

The two bodies are behaviourally and structurally identical (same parameter
type `ForwardingSignalSource["label"]`, same return-type intersection, same
single-expression body `{ label, removeEventListener: vi.fn() }`); the only
difference is where the multi-line type annotation wraps.

Exact search: `grep -n "^function signalSpy\|^export function signalSpy" tests/session-shutdown.test.ts tests/helpers/session-shutdown-harness.ts` → exactly these two sites.

## Why this is a problem
`tests/session-shutdown.test.ts`'s own import statement (lines 32-39) proves
the file already knows about and depends on
`tests/helpers/session-shutdown-harness.ts` for six of this exact double
family's siblings (`watcherSpy`, `makeEntry`, `healthyInventory`,
`ControllableEntry`, `shutdownDeps`, `eventWith`); `signalSpy` is the seventh
export of that same module and is used in this file for the identical
purpose (building `forwardingSignals` spy entries for `SessionShutdownDeps`,
e.g. at line 128). A change to `ForwardingSignalSource`'s shape (e.g. adding
a required field) must be applied to both this local copy and the module's
export to keep them in sync, even though every other member of the same spy
family in this file is already sourced from the one module.

## Suggested direction (non-binding, optional)
Importing `signalSpy` alongside the six other names already pulled from
`tests/helpers/session-shutdown-harness.ts` removes the local redeclaration.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; nothing cited here is a pinned count or inventory assertion.
- Recording-double check: `signalSpy`'s `removeEventListener` spy backs a
  genuine positive assertion in this file
  (`expect(signal.removeEventListener).toHaveBeenCalledTimes(1)`); this
  finding targets the redeclared FACTORY code, not the validity of any
  assertion built on top of it.
- docs/bugs/ signature search: `grep -rl "signalSpy" docs/bugs/*.md` → 0
  hits; this is not a documented correct-reason red for either file (both
  are green at HEAD, confirmed via `npx vitest run tests/session-shutdown.test.ts`,
  36/36 passing).
- coverage-matrix/bug-doc citation search: `grep -n "session-shutdown.test.ts"
  docs/reference/coverage-matrix.md` → 0 hits; several docs/bugs/ files cite
  `tests/session-shutdown.test.ts` at other, unrelated line ranges (0073,
  0074, 0189, 0216, 0376, 0468) for different subjects, none touching
  `signalSpy` or these line numbers. This finding proposes no merge, rename,
  or deletion of any file or `it()`/`describe()`.
- Coverage check: the claim is about a repeated fixture-factory DEFINITION
  that exists today in both places, not a missing test path.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/session-shutdown.test.ts:84-88 and tests/helpers/session-shutdown-harness.ts:50-53 (same param type, same return intersection, same body; only annotation wrapping differs), the test's import block at :32-39 already pulls six names from that harness but not `signalSpy`, `grep -rn "function signalSpy\|const signalSpy" tests/` → exactly these two declarations (every other importer — b0376, e2e-s6, reload-teardown-quiesce — now uses the harness export), the local copy is live (called at :144-146, backing positive `removeEventListener` assertions at :418/:446-447; suite green 36/36), stated searches reproduce (docs/bugs `signalSpy` → 0; coverage-matrix cite → 0; bugs 0073/0074/0189/0216/0376/0468 cite the file for unrelated subjects), no gate/recording-double/red-test carve-out, no merge/rename/delete proposed; D7 copy-paste double, both locations under tests/; not a duplicate — fixed PTQ-0443 minted the harness and migrated this file's `watcherSpy` (:107-109) but its inventory listed `signalSpy` only in b0376/e2e-s6/reload-teardown-quiesce, so this is an unmigrated residual site, and PTQ-0458/0509/0576/0699 cover makeEntry, the deps builder and the wiring Harness, not this factory; minor tolerated drift: the call-site example is :144-146, not :128 (triage: claude-fable-5-1)
