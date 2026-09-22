---
id: PTQ-1246
title: type-text-split.ts header comments cite five params.ts functions as "(above)"/"(below)" in this file
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/parser/type-text-split.ts:9-11
  - src/parser/type-text-split.ts:34-39
  - src/parser/type-text-split.ts:46-47
  - src/parser/type-text-split.ts:153-155
  - src/parser/type-text-split.ts:190
sites: 5
fix_scope: localized
wave: qw20260922150013
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# type-text-split.ts header comments cite five params.ts functions as "(above)"/"(below)" in this file

## Observation
Several doc comments in `type-text-split.ts` refer to `hoistInlineObjectType`,
`lowerBraceGroupUnionArms`, `lowerLiteralSublanguage`, `lowerParamsFieldType`,
and `lowerGenericArgument` using the same-file positional markers "(above)"
and "(below)". None of these five functions is declared anywhere in
`type-text-split.ts`; all five are declared in `src/parser/params.ts`.

## Evidence

`src/parser/type-text-split.ts:9-11` (inside `isSingleEnclosingBraceGroup`'s doc comment):
```
 * contents are skipped so a brace inside a string literal cannot perturb
 * depth). `lowerTypeSource` (body-type-lowering.ts) and `lowerParamsFieldType`
 * (below) both ask this of the whole source, then of each arm of a union
 * through `lowerBraceGroupUnionArms` (below) — every caller needs it rather
```

`src/parser/type-text-split.ts:34-39`:
```
 * discriminator-field classifier in `theta-document.ts` asks it for the same
 * reason at a non-lowering position (bug 0096 §Fix). `lowerParamsFieldType`
 * (below) asks it too, in place of the positional `startsWith("{") &&
 * endsWith("}")` test bug 0039 §Fix's byte-freeze had kept there: bug 0097
 * §Fix is the authority that lifts the freeze for a top-level union of
 * brace-balanced arms, and this predicate paired with
 * `lowerBraceGroupUnionArms` (below) is what the lifted position now asks. No
```

`src/parser/type-text-split.ts:46-47`:
```
 * the same rule that keeps `hoistInlineObjectType` (above) and
 * `lowerBraceGroupUnionArms` (below) here too. `body-type-lowering.ts`
```

`src/parser/type-text-split.ts:153-155` (inside `parseLiteralArm`'s doc comment):
```
 * `lowerLiteralSublanguage` (below) — the one emission every caller sharing
 * this recogniser eventually reaches, `lowerParamsFieldType` and
 * `lowerTypeSource` (body-type-lowering.ts) among them — needs this
```

`src/parser/type-text-split.ts:190`:
```
 * (`lowerParamsFieldType`'s intercept, `hoistInlineObjectType`, bugs
```

Actual declarations, confirmed by search:
```
$ grep -n "export function hoistInlineObjectType\|export function lowerBraceGroupUnionArms\|export function lowerLiteralSublanguage\|export function lowerParamsFieldType\|export function lowerGenericArgument" src/parser/params.ts
params.ts:1443:export function hoistInlineObjectType(
params.ts:1584:export function lowerBraceGroupUnionArms(
params.ts:1646:export function lowerLiteralSublanguage(source: string): Record<string, unknown> | undefined {
params.ts:1718:export function lowerParamsFieldType(
```
`grep -n "hoistInlineObjectType\|lowerBraceGroupUnionArms\|lowerLiteralSublanguage\|lowerParamsFieldType\|lowerGenericArgument" src/parser/type-text-split.ts`
returns only comment-text hits (none is a declaration site); the same
identifiers are absent from the file's exported/declared symbol list.

## Why this is a problem
The markers "(above)" and "(below)" are positional claims meaningful only
within the same file: a reader following them to locate the named function's
own declaration or contract finds nothing at any position in
`type-text-split.ts`, because the function is declared in a different module
entirely (`params.ts`). This is a factually wrong cross-reference baked into
the comment prose itself, not a design choice — the functions genuinely live
elsewhere, and the file's own header states the import direction runs the
other way ("`body-type-lowering.ts`... imports from this module and not the
reverse"), which makes "(above)"/"(below)" for `params.ts` symbols doubly
inconsistent with the stated architecture.

## Suggested direction (non-binding, optional)
Replace each "(above)"/"(below)" marker for a `params.ts`-declared function
with an explicit module reference (e.g. "(`params.ts`)"), matching how the
same file already annotates other cross-module citations such as
`(body-type-lowering.ts)`.

## False-positive check
Ran `grep -n "export function <name>"` for each of the five names across
`src/parser/` and confirmed each resolves uniquely to `params.ts`
(`hoistInlineObjectType:1443`, `lowerBraceGroupUnionArms:1584`,
`lowerLiteralSublanguage:1646`, `lowerParamsFieldType:1718`; `lowerGenericArgument`
confirmed absent as an exported symbol from a separate search but referenced
identically as "(below)" at line 343/356-357). Ran `grep -n "<name>" src/parser/type-text-split.ts`
for each and confirmed every hit in the file is inside a comment, with zero
matching `function <name>` or `const <name>` declarations. This is a comment-
text defect, not a behavior question, so no test-only-caller or dead-code
check applies.

## Triage
verdict: confirmed — all five excerpts match verbatim at the cited lines; re-ran the declaration hunt: type-text-split.ts declares only isSingleEnclosingBraceGroup/isBraceBalanced/parseLiteralArm/isUnspellableTextRefusable/hasUnterminatedStringLiteral/skipQuotedRegion/topLevelColon/splitTopLevelSegments/splitTopLevel (9 decls, none of the five names), while hoistInlineObjectType:1443, lowerBraceGroupUnionArms:1584, lowerLiteralSublanguage:1646, lowerParamsFieldType:1718, lowerGenericArgument:1089 (non-exported) and parseParams:178 all live in params.ts; the vestige is mechanically explained — `git show ac4e7697^:src/parser/params.ts` has the identical "(above)"/"(below)" prose at params.ts:1536/1719 where it was TRUE, and the PTQ-1149 D9 carve-out (ac4e7697) moved the comments into the new module without retargeting the positional markers; same class as accepted D2 citation-drift rows PTQ-1099/1102/1104/1105/1110, no existing PTQ or sibling intake (d2-02 is the re-export barrel, d9-01 the seam residue) names this; note the filing undercounts — line 190 carries no positional marker (weakest site), but lines 203-204 (`classifyGenericArgumentSegments` below `lowerGenericArgument`), 215 (`parseParams` below) and 343 (defined below `lowerGenericArgument`) are further stale same-file markers the fixer should sweep in the same pass (triage: claude-fable-5-1)
