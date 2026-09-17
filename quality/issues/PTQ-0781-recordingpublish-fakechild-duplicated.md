---
id: PTQ-0781
title: recordingPublish and FAKE_CHILD helper functions are redeclared byte-for-byte across two test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-child-tap.test.ts:17-21
  - tests/execution-status-progress-wire.test.ts:285-289
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260917204232
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# recordingPublish and FAKE_CHILD helper functions are redeclared byte-for-byte across two test files

## Observation
Both `tests/execution-status-child-tap.test.ts` and
`tests/execution-status-progress-wire.test.ts` declare a module-level
`FAKE_CHILD` constant and a `recordingPublish()` function with identical bodies,
used to construct a `FakeRpcChild` and a recording `ChildTapEvent` publish
sink for driving `attachChildActivityTap`. Both files import `FakeRpcChild`
from `./helpers/fake-rpc-child` and `ChildTapEvent` from
`../src/extension/execution-status/types`.

## Evidence
tests/execution-status-child-tap.test.ts:17-21
```ts
const FAKE_CHILD = () => new FakeRpcChild({ exitOnStdinEof: false });

function recordingPublish(): { events: ChildTapEvent[]; publish: (e: ChildTapEvent) => void } {
  const events: ChildTapEvent[] = [];
  return { events, publish: (e) => events.push(e) };
}
```

tests/execution-status-progress-wire.test.ts:285-289
```ts
const FAKE_CHILD = () => new FakeRpcChild({ exitOnStdinEof: false });

function recordingPublish(): { events: ChildTapEvent[]; publish: (e: ChildTapEvent) => void } {
  const events: ChildTapEvent[] = [];
  return { events, publish: (e) => events.push(e) };
}
```

The two blocks are byte-identical apart from surrounding whitespace/position.
`FAKE_CHILD` is called at child-tap.test.ts:30,96,133,158,193,209,233 (7 call
sites) and at progress-wire.test.ts:306,320,357,365,374,384,403,418,429,449 (10
call sites); `recordingPublish` is called at the same 7 and 10 call sites
respectively, one call per `it()` body in each file's "parent tap ingest"
section.

## Why this is a problem
The identical five-line harness pair (a fake RPC child constructor plus a
recording-publish-sink builder) is authored twice, once per file, instead of
once. Both files are in the same `execution-status` test family and both
drive the same `attachChildActivityTap` function under test; the harness
shapes are not incidental overlap but the same construction repeated verbatim.

## Suggested direction (non-binding, optional)
A single shared home under `tests/helpers/` for a `FakeRpcChild`-backed
`ChildTapEvent` recording harness would let both files import one
implementation instead of each declaring their own copy.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kinds; not a census/pin gate.
- Recording-double carve-out: `recordingPublish` IS a recording double (it
  records published `ChildTapEvent`s for later assertion), but the carve-out
  protects the *pattern* of a negative/positive witness from being called
  vacuous — it does not exempt a harness constructor that is copy-pasted
  verbatim across files from D7 boilerplate-duplication scrutiny; the finding
  here is about the duplication of the construction, not about the witness
  assertions built on top of it.
- docs/bugs/ signature search: `grep -n "recordingPublish\|FAKE_CHILD"
  docs/bugs/0477-code-side-theta-progress-routes-through-host-loop-bridge.md`
  → no hits.
- coverage-matrix/bug-doc citation search: `grep -rn
  "execution-status-progress-wire\|execution-status-child-tap"
  docs/reference/coverage-matrix.md` → no hits; neither file nor either helper
  name is cited by name in any witness list found.
- This finding does not propose merging, renaming, or deleting either test
  file — only consolidating the two private helper declarations; no
  coverage-matrix/bug-doc pin is crossed.

## Triage
verdict: confirmed — independently re-verified: sed-extracted child-tap.test.ts:17-21 and progress-wire.test.ts:285-289 diff to zero (byte-identical `FAKE_CHILD` + `recordingPublish`); `FAKE_CHILD()` call sites reproduce exactly (child-tap 30,96,133,158,193,209,233 = 7; progress-wire 306,320,357,365,374,384,403,418,429,449 = 10) with `recordingPublish()` paired one line after each, so both copies are live; repo-wide grep across src/extensions/tools/tests finds no third declaration and no shared helper exporting either (tests/helpers/fake-rpc-child.ts exports only the class); stated searches reproduce (0 hits for either name in docs/bugs/0477, 0 hits for either filename in docs/reference/coverage-matrix.md); both locations under tests/ and the class is D7 copy-paste fixture/double — git blame shows the child-tap copy landed in 1dad42ac and the progress-wire copy was pasted verbatim one commit later in 1f45d654 with no comment justifying a private redeclaration; no carve-out binds (neither file is a *gate* test; the recording-double carve-out protects witness assertions from vacuity claims, not a duplicated constructor; no it()/describe() merge/rename/delete proposed); not a duplicate — PTQ-0667 tracks the distinct fakeHostApi/fakeEntry/ARGS pair between progress-tool and progress-wire, PTQ-0465 cites these files only in its FakeRpcChild-importer roster, and same-wave siblings d7-02/03/04 are tautology/name/vacuity classes on other line ranges; the fix is a mechanical hoist into one tests/helpers/ module (triage: claude-fable-5-1)
