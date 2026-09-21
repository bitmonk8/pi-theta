---
id: pending
title: concatElementType — the static element type of array<T>.concat — lives in stdlib-string.ts, touching 3 type-compat members and 0 string members, while every other array-member static check lives in stdlib-array.ts
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/stdlib-string.ts:252-269
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# concatElementType — the static element type of array<T>.concat — lives in stdlib-string.ts, touching 3 type-compat members and 0 string members, while every other array-member static check lives in stdlib-array.ts

## Observation
`concatElementType` (src/runtime/stdlib-string.ts:252-269, 18 LOC) computes the
static result element type of `array<T>.concat(array<U>)` — the LUB `T ⊔ U`
under the V2b `⊑` relation. Its subject is an `array<T>` stdlib member, yet it
is declared in the `string` member module; `stdlib-array.ts` has to carry a
header cross-reference explaining the ownership. Per the structural map it has
0 src importers and 1 test importer.

## Evidence
src/runtime/stdlib-string.ts:252-263:

```ts
export function concatElementType(
  left: CompatType,
  right: CompatType,
  env: TypeEnv,
): CompatType {
  // LUB under `⊑`: if one element type is `⊑` the other, the wider one is the
  // LUB (this collapses identical types and applies the `integer ⊑ number`
  // widening in both call directions). Disjoint element types union to
  // `left | right`, receiver-first — the same union the array-literal
  // common-type rule (case 2) computes.
  if (checkCompatible(left, right, env) === "compatible") {
    return right;
  }
```

The ownership cross-reference the placement forces on the array module
(src/runtime/stdlib-array.ts:20-21):

```ts
// The `array<T>.concat(array<U>)` LUB element type is owned by V3f
// (`concatElementType` in `stdlib-string.ts`) and is not re-declared here.
```

Affinity counted both ways:
- `concatElementType` touches 3 members of `../parser/type-compat`
  (`checkCompatible`, `CompatType`, `TypeEnv`) and 0 members of
  stdlib-string's own surface (`STRING_MEMBERS`, `STRING_MEMBER_SIGNATURES`,
  `evaluateStringMember`, `replaceLiteral` — none referenced; nothing else in
  the file references it back).
- Its subject member's every other artifact lives in `stdlib-array.ts`: the
  `concat` allow-list entry (line 44), the `concat` signature row (line 65),
  and the runtime `concat` arm (lines 124-125), whose comment must point back
  across modules ("The V3f type layer (`concatElementType`) has already
  resolved the result element type", line 119).
- Inbound (structural map): 0 src importers, 1 test importer
  (tests/expression-stdlib-string.test.ts).

Sibling pattern, per instance: each stdlib surface hosts its own members'
parse-time/static checks in its own module — `checkArrayJoin`, the `join`
element-type precondition, in `stdlib-array.ts:161-185`; `checkObjectIndex`,
the object-index check, in `stdlib-object.ts:64-88`. `concat`'s static element
type is the one member-level static computation housed in a different surface's
module.

## Why this is a problem
A declaration about `array<T>.concat` with zero references to its host module's
own surface (3 foreign type-compat members touched, 0 own) sits in the `string`
module, breaking the otherwise-uniform sibling pattern (join's check in the
array module, object-index's check in the object module) and forcing both
modules to carry cross-reference comments to explain the split. The only
in-repo rationale is the historical V3f-T seam label ("V3f-T declared the seam —
the `evaluateStringMember` runtime dispatcher and the `concatElementType` LUB
computation", stdlib-string.ts:26-28), which records which task declared it,
not where its affinity lies.

## Suggested direction (non-binding, optional)
Hypothesis (unproven; the human ratifies): re-home `concatElementType` to
`stdlib-array.ts` beside `checkArrayJoin` (18 LOC, 1 exported symbol, external
importers today 0 src / 1 tests, no cross-references back into stdlib-string),
updating the one test import and the two cross-reference comments.

## False-positive check
- Affinity counts both ways (3 foreign members touched / 0 own; subject member's
  3 sibling artifacts all in stdlib-array), member names listed; importer counts
  quoted from the structural map (0/1).
- D2-deadness check: tests are its only callers, which per the D2 rule means it
  is NOT dead; the mirror relationship with type-compat's array-literal
  common-type rule (type-compat.ts:782-785 comment; b0344 test note) is a
  drift/parallel concern outside this lens and is not filed here.
- Sibling-pattern citations: stdlib-array.ts:161-185 (`checkArrayJoin`),
  stdlib-object.ts:64-88 (`checkObjectIndex`).
- Barrel/facade check: not a re-export; declared here.
- Prior-filing check: no PTQ or pending intake finding names concatElementType
  (searched the issue roster for "concat"); no exemption for this path.
- Band: exempt for breakdown (269 LOC file); placement is size-independent.

## Triage
verdict: questionable — accounting verified: excerpts byte-exact at stdlib-string.ts:252-269 and stdlib-array.ts:20-21/:119; concatElementType references exactly checkCompatible/CompatType/TypeEnv (3 ../parser/type-compat members) and 0 stdlib-string members, with nothing in the file referencing it back; concat's other three artifacts (allow-list :44, signature row :65, runtime arm :124-125) all live in stdlib-array.ts, and the sibling static checks checkArrayJoin (stdlib-array.ts:160-186) and checkObjectIndex (stdlib-object.ts:64-88) each sit in their own surface's module; grep across src/extensions/tools/tests reproduces 0 src importers (type-compat.ts:782-788 is a comment mention only) and 1 test importer (tests/expression-stdlib-string.test.ts), so not D2-dead; no exemption for either path, no prior PTQ names it, and sibling intake d9-02 targets a different declaration set (the StdlibParamKind/signature substrate) — target home (stdlib-array.ts vs. the type-compat mirror it is deliberately kept separate from per type-compat.ts:784-788) needs a human ruling (triage: claude-fable-5-1)
