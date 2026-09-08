---
id: PTQ-0013
title: value.ts module header still narrates the V2c-T inert-stub state ("stubs the behaviour-bearing functions inertly ... are absent") although the same file now implements every named function
lens: D2                     # the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/value.ts:30-37
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# value.ts module header still narrates the V2c-T inert-stub state ("stubs the behaviour-bearing functions inertly ... are absent") although the same file now implements every named function

## Observation
The module header of `src/runtime/value.ts` closes with a paragraph describing
the V2c-T tests-task delivery state: it says the leaf "stubs the behaviour-
bearing functions inertly" and that "the declaring-enum-tagged representation,
the structural-equality relation, and the `Result`-not-lowerable recognition
are absent". All three are present in this same file today: `makeEnumValue`
installs the declaring-enum tag, `valuesEqual` implements the full structural-
equality relation, and `isWireLowerable` implements the `Result`-not-lowerable
recognition. The paragraph describes a superseded delivery phase, not the
current code.

## Evidence
src/runtime/value.ts:30-37 — the narration:

```
// V2c-T (tests-task) declares the seam shapes — `ThetaValue`, the opaque
// `EnumValue`, the `ResultValue` discriminated union, the `makeEnumValue` /
// `makeOk` / `makeErr` constructors, the `valuesEqual` structural-equality
// relation, and the `isWireLowerable` predicate — and stubs the behaviour-
// bearing functions inertly so the failing tests compile and red on their own
// primary assertions (the declaring-enum-tagged representation, the structural-
// equality relation, and the `Result`-not-lowerable recognition are absent).
// The paired V2c implementation leaf fills these in.
```

src/runtime/value.ts:135-144 — the "declaring-enum-tagged representation" the
narration calls absent is implemented:

```
export function makeEnumValue(declaringEnum: string, wire: string): EnumValue {
  const boxed = new String(wire);
  Object.defineProperty(boxed, ENUM_TAG, {
    value: declaringEnum,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return boxed as unknown as EnumValue;
}
```

src/runtime/value.ts:507-516 — the "structural-equality relation" the narration
calls absent is implemented (full relation continues through line ~575):

```
export function valuesEqual(a: ThetaValue, b: ThetaValue): boolean {
  // Enum variants compare the declaring-enum tag *and* the wire value; an enum
  // against a non-enum (e.g. `Severity.Low == "low"`) is a cross-type pair.
  const tagA = enumTagOf(a);
  const tagB = enumTagOf(b);
  if (tagA !== undefined || tagB !== undefined) {
    if (tagA === undefined || tagB === undefined) {
      return false;
    }
    return tagA === tagB && String(a) === String(b);
  }
```

src/runtime/value.ts:590-592 — the "`Result`-not-lowerable recognition" the
narration calls absent is implemented:

```
export function isWireLowerable(value: ThetaValue): boolean {
  return !isResultValue(value);
}
```

## Why this is a problem
Historical narration comment: the paragraph asserts, in present tense, a stub
state ("stubs the behaviour-bearing functions inertly", "... are absent") that
the same file's own function bodies contradict. A reader is told the three
behaviours are absent while they sit fully implemented below in the same
module. This is the same retired tests-task-stub narration class already
documented for other modules in this wave
(qw20260907130901-d2-01/-08/-09-stale-tests-task-stub-narration cover binder,
extension, and discovery/diagnostics modules); none of those findings covers
src/runtime/value.ts.

## Suggested direction (non-binding, optional)
Rewrite or drop the delivery-phase paragraph so the header describes the
module's current contents; the surviving spec anchors (runtime-value-model.md,
the value-representation table) already carry the normative content.

## False-positive check
- Verified the three behaviours the narration calls absent are implemented in
  the current file: `makeEnumValue` (value.ts:135-144, installs `ENUM_TAG`),
  `valuesEqual` (value.ts:507 onward, full relation with enum/Result/array/
  object/primitive arms), `isWireLowerable` (value.ts:590-592).
- Checked the already-filed wave findings on this topic: d2-01 covers
  src/binder/* modules, d2-08 covers src/extension/inventory-closure-audit.ts
  and load-pre-eval.ts, d2-09 covers src/discovery/* and src/diagnostics/* —
  none lists src/runtime/value.ts, so this is not a re-file.
- git history: `git log --oneline -- src/runtime/value.ts` shows subsequent
  behaviour-bearing fixes landed in this file (bc5eb11d bug-0342, 78a6560c
  bug-0119), confirming the implementation leaf landed and the stub phase is
  over.
- Confirmed this files against the comment only; no code change is implied by
  the finding (the named functions are alive: `makeEnumValue`, `valuesEqual`
  grep >20 production references; `isWireLowerable` is test-consumed, which is
  legitimate).

## Triage
verdict: confirmed — header para (value.ts:30-37, verbatim) still says the enum tag, equality relation and Result-not-lowerable recognition "are absent" while all three are implemented in the same file (135-144, 507, 590-592); the paired impl commit 984796c1 filled the bodies and left the V2c-T narration from eed66a89 untouched, and no other intake file cites this header (triage: claude-opus-5)
