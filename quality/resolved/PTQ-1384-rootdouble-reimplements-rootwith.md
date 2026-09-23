---
id: PTQ-1384
title: pure-async-unification.test.ts's local rootDouble() reimplements the canonical rootWith(checkpoint) export from tests/helpers/fixture-dispatch-harness.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/pure-async-unification.test.ts:120-125
  - tests/helpers/fixture-dispatch-harness.ts:182-191
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# pure-async-unification.test.ts's local rootDouble() reimplements the canonical rootWith(checkpoint) export from tests/helpers/fixture-dispatch-harness.ts

## Observation
`tests/pure-async-unification.test.ts` declares a local, module-scope
`rootDouble(): RuntimeRoot` returning a plain object literal with a
`checkpoint` field and an `idSource` field whose `newInvocationId` returns
`"inv-1"` and whose `newToolCallId` returns `"tc-1"`.
`tests/helpers/fixture-dispatch-harness.ts` already exports `rootWith(checkpoint,
invocationId = "inv-1", clock?)`, which with no `clock` argument returns the
exact same shape: `{ checkpoint, idSource: { newInvocationId: () =>
invocationId, newToolCallId: () => "tc-1" } }` — with `invocationId` already
defaulting to the literal `"inv-1"` the in-scope file hard-codes. The in-scope
file does not import from `fixture-dispatch-harness.ts` at all.

## Evidence

`tests/pure-async-unification.test.ts:120-125` (re-read immediately before
filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/fixture-dispatch-harness.ts:182-191` (re-read immediately
before filing, the canonical export):
```ts
export function rootWith(
  checkpoint: Checkpoint,
  invocationId = "inv-1",
  clock?: Clock,
): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => invocationId, newToolCallId: () => "tc-1" },
    ...(clock === undefined ? {} : { clock }),
  } as unknown as RuntimeRoot;
}
```

`rootWith(NOOP_CHECKPOINT)` — with the default `invocationId` and no `clock`
argument — produces an object identical in every field to the in-scope
file's local `rootDouble()`: the same `checkpoint` field, the same
`newInvocationId` returning `"inv-1"`, and the same `newToolCallId` returning
`"tc-1"` (the `clock` spread contributes nothing when omitted).

## Why this is a problem
The in-scope file's `rootDouble()` is not a novel double: it is the exact
object `rootWith(checkpoint)` already builds, hand-written a second time in a
file that imports several other test helpers (`recordingPiToolResolver` from
`tests/helpers/tool-call-dispatch-harness`) but not this one. A change to the
shared `idSource` id values or to `rootWith`'s field shape has to be applied
to this file's copy independently, with nothing tying the two together once
they diverge.

## Suggested direction (non-binding, optional)
Importing `rootWith` from `tests/helpers/fixture-dispatch-harness.ts` and
calling `rootWith(NOOP_CHECKPOINT)` in place of the local declaration is the
shape the existing export already offers.

## False-positive check
- Gate-pin check: `tests/pure-async-unification.test.ts` is not a
  `*gate*.test.ts` file or a named kin; the cited lines are a fixture-double
  builder, not a pinned count or inventory assertion.
- Recording-double check: this `rootDouble()` returns a static id/checkpoint
  double; it records no calls and backs no "never called" witness (it is not
  the recording double `recordingPiToolResolver` this same file already uses
  for that purpose).
- docs/bugs/ signature search: `grep -rl "pure-async-unification" docs/bugs/*.md` → 0 hits; no documented correct-reason-red cites this file or this helper.
- coverage-matrix/bug-doc citation search: `grep -n "pure-async-unification" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `describe()`/`it()` — only that the local `rootDouble()` declaration could be replaced by the existing `rootWith` export.
- Prior-finding overlap check: `grep -rli "pure-async-unification" quality/intake/*.md quality/resolved/*.md` → 0 hits before this filing. The many prior `rootDouble`/`rootWith` findings in the corpus (e.g. PTQ-1090) name different files and different call sites; none cites `tests/pure-async-unification.test.ts`, so this is a distinct site for the same duplicated-canonical-export root cause, not a re-file.
- Coverage-drift check: the claim is about a repeated function DEFINITION this file's own `it()` bodies already call via `producer({...})` and `runBody(...)`; no claim that any evaluator path is untested.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — re-verified independently: the local `rootDouble()` excerpt reproduces verbatim in tests/pure-async-unification.test.ts (at 105-110, a 15-line drift from the cited 120-125; tolerated) and `rootWith` matches exactly at tests/helpers/fixture-dispatch-harness.ts:182-191; `rootWith(NOOP_CHECKPOINT)` with the default `invocationId="inv-1"` and no clock yields a field-for-field identical object (`checkpoint`, `newInvocationId→"inv-1"`, `newToolCallId→"tc-1"`, empty clock spread), `rootWith` is a live export with 13 importing test files, and the in-scope file imports from tests/helpers/tool-call-dispatch-harness but not fixture-dispatch-harness (grep confirms); docs/bugs (0), coverage-matrix (0) searches reproduce, the file is not a gate test, the double is a static id/checkpoint carrier not a recording double, and no merge/rename/delete of any test is proposed; not a duplicate — the only resolved rows citing this file are PTQ-0670 (AST builders, its triage note mentions this file only for the span/callExpr copy) and PTQ-1015 (the `received = params` resolvePiTool double at :211-217), same-wave sibling d7-01 cites tests/schema-brand-symbol-migration.test.ts, and PTQ-1090/0862/1022/1010/1014/0873 name other files — in-scope D7 copy-paste double whose fix is a mechanical import swap (triage: claude-fable-5-1)
