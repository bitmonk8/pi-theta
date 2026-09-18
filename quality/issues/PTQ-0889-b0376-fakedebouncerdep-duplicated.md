---
id: PTQ-0889
title: b0376's fakeDebouncerDep reimplements reload-teardown-quiesce.test.ts's identically-bodied debouncer double
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0376-teardown-call-label-set-underenumerates.test.ts:75-86
  - tests/reload-teardown-quiesce.test.ts:284-294
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0376's fakeDebouncerDep reimplements reload-teardown-quiesce.test.ts's identically-bodied debouncer double

## Observation
tests/b0376-teardown-call-label-set-underenumerates.test.ts declares a
module-scope function `fakeDebouncerDep(whenIdleImpl)` returning an object
with a `markTornDown: vi.fn()` and a `whenIdle: vi.fn(whenIdleImpl)`.
tests/reload-teardown-quiesce.test.ts already declares a function of the same
name taking the same single parameter and returning the identical two-field
object body. The two functions' bodies are byte-identical; only the return
type annotation differs, because b0376 imports the production
`TeardownAwareDebouncer` type (now exported from
src/extension/session-shutdown.ts) while reload-teardown-quiesce.test.ts
still declares its own local `TeardownAwareDebouncerDep` interface, per its
own comment, "as the interface the implementation must satisfy so this file
type-checks while `SessionShutdownDeps` does not yet carry a `debouncer`
field." Neither declaration lives under tests/helpers/.

## Evidence

tests/b0376-teardown-call-label-set-underenumerates.test.ts:75-86 (re-read
immediately before filing):
```ts
function fakeDebouncerDep(
  whenIdleImpl: () => Promise<void>,
): TeardownAwareDebouncer & {
  markTornDown: ReturnType<typeof vi.fn>;
  whenIdle: ReturnType<typeof vi.fn>;
} {
  return {
    markTornDown: vi.fn(),
    whenIdle: vi.fn(whenIdleImpl),
  };
}
```

tests/reload-teardown-quiesce.test.ts:284-294 (the same function, same
parameter, same two-line return body, differing only in the return-type
annotation's named type):
```ts
function fakeDebouncerDep(
  whenIdleImpl: () => Promise<void>,
): TeardownAwareDebouncerDep & {
  markTornDown: ReturnType<typeof vi.fn>;
  whenIdle: ReturnType<typeof vi.fn>;
} {
  return {
    markTornDown: vi.fn(),
    whenIdle: vi.fn(whenIdleImpl),
  };
}
```

The executable bodies — `{ markTornDown: vi.fn(), whenIdle: vi.fn(whenIdleImpl) }`
— are identical character-for-character; the only difference across the two
declarations is the intersected type name (`TeardownAwareDebouncer` vs the
file-local `TeardownAwareDebouncerDep`), which reload-teardown-quiesce.test.ts's
own comment explains was a stand-in for a field the production type did not
yet carry — a gap b0376's import of the now-exported `TeardownAwareDebouncer`
shows has since closed.

## Why this is a problem
The same debouncer test double is declared from scratch in two files rather
than shared once; reload-teardown-quiesce.test.ts's own comment on the
now-superseded local interface shows the two files no longer have a type
reason to diverge, so this is only a repeated definition, not a divergent one.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ export of `fakeDebouncerDep`, typed against the
production `TeardownAwareDebouncer`, is the natural home both files' copies
point at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named kin; not
  applicable.
- Recording-double check: `fakeDebouncerDep`'s `vi.fn()` calls are read by
  each file's own assertions (e.g. b0376 checks the emitted diagnostic that
  results from `whenIdle` rejecting), not asserted as "never called" — the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0376-teardown-call-label-set-underenumerates.md
  exists and pins b0376's two cells as documented correct-reason reds against
  the label-set omission; that disposition is unrelated to this
  fixture-duplication claim, which is about the double's declaration, not any
  red/skip.
- coverage-matrix/bug-doc citation search: `grep -n "b0376-teardown-call-label-set-underenumerates\|reload-teardown-quiesce" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of either file or any `it()`/`describe()` — only that the double could be imported from a shared module instead of redeclared a second time.
- Prior-finding overlap check: quality/resolved/PTQ-0443 (this wave's
  predecessor) already fixed b0376's `watcherSpy`/`signalSpy`/`sinkSpy`/`flush`
  quartet by importing them from tests/helpers/session-shutdown-harness.ts;
  that fix's location list does not include `fakeDebouncerDep`, which remains
  a local declaration in both files post-fix.
- Coverage check: the claim is about a repeated fixture DEFINITION, not a
  missing test path; both cells exercising the double are unaffected.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/b0376-teardown-call-label-set-underenumerates.test.ts:75-86 and tests/reload-teardown-quiesce.test.ts:284-294; sed-extracted and diffed after a single `TeardownAwareDebouncer`→`TeardownAwareDebouncerDep` substitution → zero diff (same param, same `{ markTornDown: vi.fn(), whenIdle: vi.fn(whenIdleImpl) }` body); both copies are live (b0376:111; reload-teardown-quiesce:350,:421); `TeardownAwareDebouncer` is exported at src/extension/session-shutdown.ts:126 and `SessionShutdownDeps.debouncer?` exists at :145, so the file-local interface's "does not yet carry a `debouncer` field" rationale (:235-243) is stale and no type reason to diverge remains; `grep -rn debouncer tests/helpers/session-shutdown-harness.ts` → 0, no shared home; both under tests/, D7 copy-paste-fixture/double class; stated searches reproduce (coverage-matrix → 0 hits; docs/bugs/0376 pins the two cells' RED disposition, not the double); not a gate file, the vi.fn spies are read by each file's sink/failedEmits assertions (no negative-witness carve-out), no merge/rename/delete proposed; dedupe: PTQ-0443 (spy quartet), PTQ-0699 (deps builder), PTQ-0458 (makeEntry), PTQ-0503 (controllableRebuild), PTQ-0014 (whenIdle param) all touch these files but none names `fakeDebouncerDep` or `markTornDown` — untracked root cause (triage: claude-fable-5-1)
