---
id: PTQ-0982
title: subagent-visible-regime.test.ts's hexInvocationRoot re-derives the clock/schemaValidator body of the rootDouble it already imports
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-visible-regime.test.ts:58-74
  - tests/helpers/subagent-fn-child-regime.ts:158-170
sites: 2
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-visible-regime.test.ts's hexInvocationRoot re-derives the clock/schemaValidator body of the rootDouble it already imports

## Observation
`tests/subagent-visible-regime.test.ts` imports `rootDouble` from
`./helpers/subagent-fn-child-regime` (line 15) and uses it directly at several
call sites (e.g. `rootDouble(input.checkpointThrows !== undefined ? ... :
undefined)`). The same file also declares a second, locally-defined
`RuntimeRoot` builder, `hexInvocationRoot(ids)` (lines 58-74), whose
`checkpoint`, `clock`, and `schemaValidator` fields are byte-for-byte
identical to the imported `rootDouble`'s — the only field that differs is
`idSource.newInvocationId`, which `hexInvocationRoot` parameterises over a
supplied id sequence instead of `rootDouble`'s fixed `"inv-1"`.

## Evidence
`tests/subagent-visible-regime.test.ts:58-74`:
```ts
function hexInvocationRoot(ids: readonly string[]): RuntimeRoot {
  let i = 0;
  return {
    checkpoint: new NoopCheckpoint(),
    idSource: {
      newInvocationId: (): string => ids[Math.min(i++, ids.length - 1)]!,
      newToolCallId: (): string => "tc-1",
    },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/subagent-fn-child-regime.ts:158-170` — the imported helper,
already in scope in the same file via the line-15 import:
```ts
export function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? new NoopCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}
```

The four-line `clock` object (`now`/`wallNow`/`setTimeout`/`clearTimeout`,
identical field names and bodies) and the `schemaValidator` line are
byte-identical between the two functions; `checkpoint` in both defaults to
`new NoopCheckpoint()` (the same imported class). `idSource.newToolCallId`
is also identical (`"tc-1"` in both). The only substantive difference is
`idSource.newInvocationId`.

## Why this is a problem
`hexInvocationRoot` is declared in the same file that already imports
`rootDouble` for the exact same `RuntimeRoot`-double purpose, and reproduces
three of `rootDouble`'s four fields verbatim to add one parameterised field.
`rootDouble` already accepts an optional `checkpoint` parameter, showing the
helper is designed to be varied by parameter rather than re-declared; a
change to the clock or schema-validator stand-in shape now has two
independently-typed copies in this one file to keep in step with each
other and with the imported helper.

## Suggested direction (non-binding, optional)
`rootDouble` already takes an optional `checkpoint` override; an analogous
optional `idSource` (or `newInvocationId`) parameter would let the F4 tests
that need a hex-sequence id source ask the imported helper for it directly,
rather than carrying a second copy of its clock/schemaValidator body in the
same file.

## False-positive check
- Gate-pin check: `subagent-visible-regime.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: neither `hexInvocationRoot` nor `rootDouble`
  records a call or backs a "never called" MUST-NOT witness — both are
  inert clock/id/schema-validator stand-ins that back positive-value
  assertions (e.g. the F4 label-suffix regex checks). The carve-out does
  not apply.
- docs/bugs/ signature search: `grep -rn "hexInvocationRoot" docs/bugs/*.md`
  → 0 hits; no documented correct-reason red cites this declaration.
- coverage-matrix/bug-doc citation search: `grep -n "hexInvocationRoot"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of any test, `it()`, or `describe()` — only
  that the local builder could ask the already-imported helper for the one
  field it varies instead of restating the rest of the helper's body.
- Coverage-drift check: this finding is about a duplicated builder body
  inside one already-passing test file; it makes no claim that any
  behaviour or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim at tests/subagent-visible-regime.test.ts:58-74 and tests/helpers/subagent-fn-child-regime.ts:158-170; `hexInvocationRoot` is live (5 F4 call sites at :541/:552/:562/:578/:595) and its `checkpoint`/`clock`/`schemaValidator`/`newToolCallId` members are byte-identical to the imported `rootDouble`'s (only `newInvocationId` varies), while the same file already imports and calls `rootDouble` at :16/:121/:439; the duplicated body is inert scaffolding, not a spec vector or locally-witnessed control, so folding it into an optional id-source override on the already-parameter-varied helper is mechanical and changes no assertion; docs/bugs (0), coverage-matrix (0) and quality/ (0 outside this candidate) greps for `hexInvocationRoot` reproduce; file green 22/22; not a duplicate — same-wave d7-05 tracks the helper's own internal builder pair (:38-50 vs :158-170) and d7-09 a different test file, though a parameterised `rootDouble` would plausibly serve both (triage: claude-fable-5-1)
