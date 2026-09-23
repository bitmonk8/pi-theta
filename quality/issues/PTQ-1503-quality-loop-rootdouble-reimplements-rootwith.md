---
id: PTQ-1503
title: quality-loop-empty-tail-return-validation.test.ts's local rootDouble() reimplements the canonical rootWith(checkpoint, invocationId, clock) export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/quality-loop-empty-tail-return-validation.test.ts:251-264
  - tests/helpers/fixture-dispatch-harness.ts:182-191
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# quality-loop-empty-tail-return-validation.test.ts's local rootDouble() reimplements the canonical rootWith(checkpoint, invocationId, clock) export

## Observation
`tests/quality-loop-empty-tail-return-validation.test.ts` declares a local,
module-scope `rootDouble(): RuntimeRoot` that returns an object literal with
a `checkpoint` field (`NOOP_CHECKPOINT`), an `idSource` field whose
`newInvocationId` returns the literal `"inv-1"` and whose `newToolCallId`
returns `"tc-1"`, a `clock` field, and a `schemaValidator` field.
`tests/helpers/fixture-dispatch-harness.ts` already exports `rootWith(checkpoint,
invocationId = "inv-1", clock?: Clock)`, which returns `{ checkpoint,
idSource: { newInvocationId: () => invocationId, newToolCallId: () => "tc-1"
}, ...(clock === undefined ? {} : { clock }) }` — with `invocationId`
defaulting to the exact `"inv-1"` literal the in-scope file hard-codes, so
`rootWith(NOOP_CHECKPOINT, "inv-1", clockObject)` produces the identical
`checkpoint`/`idSource`/`clock` shape the in-scope file builds by hand. The
in-scope file does not import from `fixture-dispatch-harness.ts` at all.

## Evidence

`tests/quality-loop-empty-tail-return-validation.test.ts:251-264` (re-read
immediately before filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: NOOP_CHECKPOINT,
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => Date.now(),
      wallNow: (): number => Date.now(),
      setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
      clearTimeout: (handle: unknown): void =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}
```

`tests/helpers/fixture-dispatch-harness.ts:182-191` — the canonical export
(re-read immediately before filing):
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

## Why this is a problem
The `checkpoint`/`idSource: { newInvocationId: () => "inv-1", newToolCallId:
() => "tc-1" }` shape the in-scope file's `rootDouble()` constructs by hand is
byte-identical, field for field and literal for literal, to what
`rootWith(NOOP_CHECKPOINT, "inv-1", clockObject)` already returns; only the
`clock` object's construction and the added `schemaValidator` field sit
outside `rootWith`'s parameters, and `rootWith`'s own third parameter is
typed to accept exactly a `Clock`-shaped object. The in-scope file restates
the shared helper's fixed literals (`"inv-1"`, `"tc-1"`) independently rather
than calling the export both the helper module and this file's sibling
harnesses already import for the identical purpose.

## Suggested direction (non-binding, optional)
`tests/helpers/fixture-dispatch-harness.ts`'s `rootWith(checkpoint,
invocationId, clock)` is the natural shared point this file's `checkpoint`/
`idSource` construction already converges on; the `clock` object and
`schemaValidator` field could layer over its return value.

## False-positive check
Gate-pin check: the file name matches no `*gate*.test.ts` pattern, so the
census/pin carve-out does not apply. Recording-double check: `rootDouble()`
here is a plain value double, not a recording double asserting a MUST-NOT-call
witness, so the negative-witness carve-out does not apply. docs/bugs/
signature search: the file's own header cites the 2026-09-10 quality-loop
abort and docs/bugs/ narratives for the BEHAVIOUR under test, but names no
red-test signature for this harness function itself, so this is not a
documented correct-reason red. coverage-matrix/bug-doc citation search:
`grep -rln "quality-loop-empty-tail-return-validation"
docs/reference/coverage-matrix.md docs/bugs/*.md` hits
`docs/bugs/0473-cross-file-invoke-return-type-check-unimplemented.md`, whose
"Witnesses (landed with this report)" section names this file's cells A-E by
their assertion content, pinning the file and its cells' assertions — not the
`rootDouble()` harness function cells C-E call into. This finding proposes no
merge, rename, or deletion of the file or of any cell; it observes a value
double re-implementing fields a canonical helper in `tests/helpers/` already
exports for the same purpose, staying inside D7's copy-paste-fixture class.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: local `rootDouble()` reproduces verbatim at tests/quality-loop-empty-tail-return-validation.test.ts:251-264 (sole caller :315) and `rootWith` at tests/helpers/fixture-dispatch-harness.ts:182-191; its checkpoint/idSource literals ("inv-1"/"tc-1") are field-for-field what `rootWith(NOOP_CHECKPOINT, "inv-1", clock)` returns, the local clock object satisfies src/seams/clock.ts's `Clock` (now/wallNow/setTimeout/clearTimeout), and only `schemaValidator: ajv()` sits outside it; rootWith is live (16 tests/ files reference it) while this file imports nothing from fixture-dispatch-harness; D7 copy-paste double in tests/, not a gate file, not a recording double, the docs/bugs/0473 witness-list hit pins cells A-E and no merge/rename/delete is proposed; not a duplicate — the 2026-09-17 duplicate ruling on this file's trio (TRIAGE_LOG row 100) pointed at resolved PTQ-0209, which predates rootWith (not present at acac5cc3), and the directly analogous PTQ-1348 (schema-brand rootLive with clock + schemaValidator) and PTQ-1384 (pure-async rootDouble), both sites already present in PTQ-0209's era, were confirmed as distinct rootWith-migration findings; no open issue or same-wave intake cites this function (sibling d7-04 targets loadPi/loadCtx/loadCorpus) (triage: claude-opus-5-5)
