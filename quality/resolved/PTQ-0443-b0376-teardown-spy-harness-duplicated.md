---
id: PTQ-0443
title: b0376's watcherSpy/signalSpy/sinkSpy/flush teardown-harness quartet is redeclared byte-identically from tests/reload-teardown-quiesce.test.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0376-teardown-call-label-set-underenumerates.test.ts:48-102
  - tests/reload-teardown-quiesce.test.ts:64-69
  - tests/reload-teardown-quiesce.test.ts:312-332
  - tests/session-shutdown.test.ts:107-109
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0376's watcherSpy/signalSpy/sinkSpy/flush teardown-harness quartet is redeclared byte-identically from tests/reload-teardown-quiesce.test.ts

## Observation
tests/b0376-teardown-call-label-set-underenumerates.test.ts declares four
module-scope helpers — `flush`, `watcherSpy`, `signalSpy`, `sinkSpy` — that
build the `SessionShutdownDeps` spy fixtures for driving the real
`runSessionShutdown`. Its own section comment states "teardown harness
(mirrors tests/reload-teardown-quiesce.test.ts)". Three of these four
functions (`watcherSpy`, `signalSpy`, `sinkSpy`) are byte-identical to the
same-named functions already declared in tests/reload-teardown-quiesce.test.ts,
and `flush`'s executable body is byte-identical there too (only the doc
comment differs). `watcherSpy` alone is also byte-identical in
tests/session-shutdown.test.ts. Neither file imports these from
`tests/helpers/`.

## Evidence
tests/b0376-teardown-call-label-set-underenumerates.test.ts:48-77:
```ts
/** Flush the microtask queue so the handler's in-flight promises settle. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function watcherSpy(): ClosableWatcher & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() };
}

function signalSpy(
  label: ForwardingSignalSource["label"],
): ForwardingSignalSource & { removeEventListener: ReturnType<typeof vi.fn> } {
  return { label, removeEventListener: vi.fn() };
}

// The sink serialises via JSON.stringify, so each `emit` call carries the single
// serialised diagnostic line — parseable back to its `details` shape below.
function sinkSpy(): EmissionSink & {
  emit: ReturnType<typeof vi.fn>;
  serialise: ReturnType<typeof vi.fn>;
} {
  return {
    emit: vi.fn((line: unknown) => {
      void line;
    }),
    serialise: vi.fn((diagnostic: Diagnostic) => JSON.stringify(diagnostic)),
  };
}
```

tests/reload-teardown-quiesce.test.ts:64-69 (`flush`, body byte-identical to
b0376's; only the doc comment differs):
```ts
/** Flush the microtask queue so in-flight promises settle. */
async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
```

tests/reload-teardown-quiesce.test.ts:312-332 (`watcherSpy`/`signalSpy`/
`sinkSpy`, byte-identical to b0376's excerpt above):
```ts
function watcherSpy(): ClosableWatcher & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() };
}

function signalSpy(
  label: ForwardingSignalSource["label"],
): ForwardingSignalSource & { removeEventListener: ReturnType<typeof vi.fn> } {
  return { label, removeEventListener: vi.fn() };
}

function sinkSpy(): EmissionSink & {
  emit: ReturnType<typeof vi.fn>;
  serialise: ReturnType<typeof vi.fn>;
} {
  return {
    emit: vi.fn((line: unknown) => {
      void line;
    }),
    serialise: vi.fn((diagnostic: Diagnostic) => JSON.stringify(diagnostic)),
  };
}
```

tests/session-shutdown.test.ts:107-109 (`watcherSpy`, byte-identical again):
```ts
function watcherSpy(): ClosableWatcher & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() };
}
```

Verification performed during this review: `md5sum` over the sed-extracted
function bodies (`^function watcherSpy` through its closing `}`,
`^function signalSpy` through its closing `}`, `^function sinkSpy` through
its closing `}`) across the five files that declare any of these three names
(`tests/b0376-...test.ts`, `tests/e2e-s6-session-shutdown-real-teardown.test.ts`,
`tests/reload-teardown-quiesce.test.ts`, `tests/session-shutdown.test.ts`,
`tests/session-swap-tripwire.test.ts`) confirms: `watcherSpy` hashes identical
across b0376, reload-teardown-quiesce, and session-shutdown (3 files);
`signalSpy` hashes identical across b0376, e2e-s6, and reload-teardown-quiesce
(3 files); `sinkSpy` hashes identical across b0376, reload-teardown-quiesce,
and session-swap-tripwire (3 files). `makeHarness` (b0376:85-102) additionally
mirrors reload-teardown-quiesce's `makeHarness` (:341-368) field-for-field
(same seven-key `SessionShutdownDeps` literal), differing only in that
reload-teardown-quiesce's takes an `overrides` parameter b0376's fixed-shape
harness does not need.

## Why this is a problem
This is the "Boilerplate duplication" class: a four-function spy/harness
quartet — three near-trivial `vi.fn()`-wrapping factories plus the microtask
`flush` loop — is redeclared as a unit rather than imported, and b0376's own
header comment names the exact file ("mirrors
tests/reload-teardown-quiesce.test.ts") it was copied from. The independent
hash matches across three-to-five files for each of the three spy factories
confirm this is not incidental convergent naming but the same code retyped at
each site. `tests/helpers/` holds no `SessionShutdownDeps`-spy module any of
these five files could import from instead.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting `watcherSpy`/`signalSpy`/`sinkSpy`
(and the `flush` microtask loop) would sit beside the existing `fake-clock.ts`
convention these same files already import `FakeClock` from, and is the home
the credited "mirrors" comment already points at.

## False-positive check
- Gate-pin check: none of the cited files match `*gate*.test.ts` or the named
  gate kin; none of the cited code is a pinned count or inventory assertion.
- Recording-double check: `watcherSpy`/`signalSpy`/`sinkSpy` wrap `vi.fn()`
  spies that some tests in these files use for call-count assertions, but
  this finding targets the duplicated FACTORY code, not any "never called"
  witness built on top of it — the carve-out does not shield the claim being
  made and is not being contested here.
- docs/bugs/ signature search: docs/bugs/0376-teardown-call-label-set-underenumerates.md
  exists and is the open bug this test file is the RED witness for; this
  finding does not contest b0376's redness or behaviour, only the duplicated
  spy-harness code every cell in the file depends on regardless of which way
  the bug resolves. tests/reload-teardown-quiesce.test.ts and
  tests/session-shutdown.test.ts are unrelated to bug 0376 and pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0376-teardown-call-label-set-underenumerates\|reload-teardown-quiesce\|session-shutdown.test.ts"
  docs/reference/coverage-matrix.md` returns no hits for the b0376 file. This
  finding proposes no merge, rename, or deletion of any cited file.
- Coverage-drift check: the claim is about a repeated harness DEFINITION that
  exists today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: all four excerpts match at the cited lines (b0376:48-77, reload-teardown-quiesce:64-69 and :312-332, session-shutdown:107-109); awk-extracted md5s reproduce the byte-identity claims exactly (watcherSpy identical in b0376/reload-teardown-quiesce/session-shutdown; signalSpy identical in b0376/e2e-s6/reload-teardown-quiesce; sinkSpy identical in b0376/reload-teardown-quiesce/session-swap-tripwire; flush body identical in b0376 and reload-teardown-quiesce), b0376:46 self-declares "mirrors tests/reload-teardown-quiesce.test.ts", tests/helpers/ exports none of these names nor any SessionShutdownDeps builder, coverage-matrix has no hits for the cited files, docs/bugs/0376 exists and its redness is not contested — in-scope D7 boilerplate duplication; not in the tracked list (same-wave sibling intake d7-140-03 covers the overlapping makeHarness/SessionShutdownDeps builder across seven files and would share the eventual helper home, so the fixer should land both together) (triage: claude-fable-5-1)
