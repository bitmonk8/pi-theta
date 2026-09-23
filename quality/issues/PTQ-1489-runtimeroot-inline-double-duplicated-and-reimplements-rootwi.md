---
id: PTQ-1489
title: unresolved-annotation-lowering.test.ts's inline RuntimeRoot double is duplicated in-file and reimplements the canonical rootWith helper's idSource shape
lens: D7
status: open
verdict: confirmed
locations:
  - tests/unresolved-annotation-lowering.test.ts:793-800
  - tests/unresolved-annotation-lowering.test.ts:1145-1152
  - tests/helpers/fixture-dispatch-harness.ts:182-191
sites: 2
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# unresolved-annotation-lowering.test.ts's inline RuntimeRoot double is duplicated in-file and reimplements the canonical rootWith helper's idSource shape

## Observation
`tests/unresolved-annotation-lowering.test.ts` builds a `RuntimeRoot` fake
inline as an object literal, cast `as unknown as RuntimeRoot`, at two call
sites in the same file (the "RED RESPOND" test and the "PARAMS-BINDER"
test). Both literals carry byte-identical `checkpoint`, `idSource` and
`clock` fields. `tests/helpers/fixture-dispatch-harness.ts` exports
`rootWith(checkpoint, invocationId = "inv-1", clock?)`, which builds a
`RuntimeRoot` with the exact same `idSource` shape
(`newInvocationId`/`newToolCallId` returning the same literal `"inv-1"` /
`"tc-1"` strings) and an optional `clock` parameter this file's inline
double also happens to carry. The same helper module is imported and this
exact `rootWith` export is used for the equivalent purpose in a sibling file
in this review's own scope
(`tests/unresolvable-operand-structural-target-adjudication.test.ts:12,
"rootWith(SEAM_NOOP_CHECKPOINT)"`).

## Evidence
`tests/unresolved-annotation-lowering.test.ts:793-800` (re-read immediately
before filing):
```ts
      root: {
        checkpoint: { before: (): Promise<void> => Promise.resolve() },
        idSource: {
          newInvocationId: (): string => "inv-1",
          newToolCallId: (): string => "tc-1",
        },
        clock: { wallNow: (): number => 0 },
        schemaValidator: ajv(),
      } as unknown as RuntimeRoot,
```

`tests/unresolved-annotation-lowering.test.ts:1145-1152` (re-read
immediately before filing) — the same eight lines, verbatim, at the second
call site:
```ts
      root: {
        checkpoint: { before: (): Promise<void> => Promise.resolve() },
        idSource: {
          newInvocationId: (): string => "inv-1",
          newToolCallId: (): string => "tc-1",
        },
        clock: { wallNow: (): number => 0 },
        schemaValidator: ajv(),
      } as unknown as RuntimeRoot,
```

`tests/helpers/fixture-dispatch-harness.ts:182-191` (re-read immediately
before filing) — the canonical builder covering the `checkpoint`/`idSource`/
`clock` portion of both inline literals:
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
The `checkpoint`/`idSource`/`clock` fields of the two inline `RuntimeRoot`
literals in this file are character-for-character identical to each other
(two in-file repetitions), and both reproduce the exact `idSource` shape
(`newInvocationId` returning `"inv-1"`, `newToolCallId` returning `"tc-1"`)
that `rootWith` in `tests/helpers/fixture-dispatch-harness.ts` already
builds, including `rootWith`'s own optional `clock` parameter this file's
duplicate also carries. This is copy-paste re-implementation of a double
where a canonical helper for the same shape exists under `tests/helpers/`
and is demonstrably in active use for the identical purpose by another file
in this same review scope.

## Suggested direction (non-binding, optional)
Building the `checkpoint`/`idSource`/`clock` portion of both `RuntimeRoot`
literals through `rootWith(...)` (adding only the file-specific
`schemaValidator: ajv()` field on top of its result) is observed as
available without introducing a new abstraction, since the helper module
already ships the exact shape both call sites hand-roll.

## False-positive check
- gate-pin: not a `*gate*.test.ts` file; no pinned census/inventory count.
- recording-double: neither literal records calls for a MUST-NOT
  assertion; both are plain stub doubles satisfying the `RuntimeRoot`
  interface shape, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "unresolved-annotation-lowering"
  docs/bugs/` finds no report matching this test file's name; the file's
  cited bug (0028) does not pin this harness's construction, so this is not
  a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "unresolved-annotation-lowering" docs/reference/coverage-matrix.md`
  returns no hit; no rename, merge, or delete of the test is proposed —
  only the shared construction of the `RuntimeRoot` double.
- coverage drift: this finding does not claim any behaviour is untested; it
  is confined to the duplicated/reimplemented harness code within and
  across the reviewed files.

## Triage
<!-- triage appends its note below this line -->
verdict: confirmed — both inline RuntimeRoot literals reproduce byte-identical at tests/unresolved-annotation-lowering.test.ts:793-800 and :1145-1152 (checkpoint/idSource "inv-1"/"tc-1"/clock + schemaValidator), the file imports nothing from tests/helpers/fixture-dispatch-harness.ts whose exported rootWith(checkpoint, invocationId="inv-1", clock?) at :182-191 builds exactly that idSource/clock shape and is used for the same createProductionProducerDeps/executeBody purpose by sibling tests/unresolvable-operand-structural-target-adjudication.test.ts:8,376; not a gate test, no recording double, docs/bugs 0028/0055/0124/0203/0204 cite this file's cells but not the harness construction and no rename/merge/delete is proposed; no tracked issue cites this file (only open rootWith filing PTQ-1318 is a different file/helper) — copy-paste double with a mechanical dedupe (spread rootWith(...) + schemaValidator: ajv()) (triage: claude-fable-5-1)
