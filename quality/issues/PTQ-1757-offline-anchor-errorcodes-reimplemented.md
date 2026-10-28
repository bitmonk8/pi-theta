---
id: PTQ-1757
title: The offline b0357 anchor suite redeclares the shared parse-error-code reader.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0357-doc-comment-field-variant-anchors.test.ts:44-47
  - tests/helpers/e2e-s1.ts:428-436
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The offline b0357 anchor suite redeclares the shared parse-error-code reader.

## Observation
The offline b0357 suite defines a local `parseErrorCodes` that parses source, filters error-severity diagnostics, and extracts their codes. Its existing `tests/helpers/e2e-s1.ts` dependency exports that source-to-code-list operation as `errorCodes`, as well as the source-order projection as `errorCodesOf`. The local wrapper adds a fixture filename suffix and omits sorting; its consumers compare against an empty list or test code membership, neither of which depends on order.

## Evidence
`tests/b0357-doc-comment-field-variant-anchors.test.ts:44-47`:
```ts
/** Error-severity diagnostic codes from a parse-only run over a `.theta` source. */
function parseErrorCodes(name: string, src: string): string[] {
  return errors(parseDoc(src, `${name}.theta`).diagnostics).map((d) => d.code);
}
```

`tests/helpers/e2e-s1.ts:428-436`:
```ts
/** The error-severity load/parse codes `parseDoc` attributes to one source, sorted. */
export function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return errors(parseDoc(thetaText, thetaPath).diagnostics).map((d) => d.code).sort();
}

/** Error-severity diagnostic codes from a parsed doc, in source order. */
export function errorCodesOf(doc: ThetaDocument): string[] {
  return errors(doc.diagnostics).map((d) => d.code);
}
```

The counted occurrence is the one local definition above, not the shared reference implementation. Inspection of every `parseErrorCodes` consumer in this scoped file shows only `toEqual([])`, `toContain`, and `not.toContain` assertions (including assertions on the two local `codes` variables).

## Why this is a problem
This is boilerplate duplication of an existing test-harness operation. The parsing, severity selection, and code projection are restated locally despite already being supplied by the file's shared parsing helper. The filename adaptation does not account for repeating the diagnostic projection, and the sorting difference does not distinguish any assertion in this file. The natural shared home is the existing `tests/helpers/e2e-s1.ts` reader module.

## False-positive check
- Gate-pin check: this file is not a gate/pin inventory; no expected inventory or count is challenged.
- Recording-double check: this reader does not record calls or implement a MUST-NOT witness.
- docs/bugs/ signature search: the bug 0357 report records status fixed (0.356.0). Its documented misplaced-anchor failure is a production diagnostic, not a silent skip or a reason to retain a separate diagnostic-list implementation. No red test disposition is challenged.
- Coverage-matrix/bug-doc citation search: searching the scoped filename in `docs/reference/coverage-matrix.md` returned no match. `docs/bugs/0357-doc-comment-field-variant-anchors-refused.md:305` cites this offline witness; bug 0360 also names it as a pipeline witness, and bug 0421 names a citation in it. No test merge, rename, or deletion is proposed; the cited tests and assertions remain the subject of their existing citations.
- Prior-filing check: PTQ-1034 covers `tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts` and its live b0351 sibling, not this offline path. PTQ-1320 covers the doc-accepting readers in b0406/b0408. Neither includes this local definition.
- Intent check: `git log -2 --oneline -S 'function parseErrorCodes' -- tests/b0357-doc-comment-field-variant-anchors.test.ts` locates its introduction in e0586b1c, the bug-0357 fixture commit. The current shared exports are present; this is a remaining local wrapper, not a claim about missing behaviour.
- Coverage boundary: the claim concerns existing duplicated harness code only, not tests that should exist, suite composition, or runtime behaviour.

## Triage
verdict: confirmed — The local helper reproduces e2e-s1's existing errorCodes/errorCodesOf computation; every consumer uses only empty-list equality or membership, so sorting is immaterial and the filename suffix does not justify duplicating the projection. D7 boilerplate duplication; cited witnesses remain intact, and PTQ-1034/PTQ-1320 cover different files with no resolved ruling prescribing this local implementation. (triage: claude-opus-5-5)
