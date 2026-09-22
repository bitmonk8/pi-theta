---
id: pending
title: StdlibMethodArgumentDefectError and StdlibMethodArgumentKindDefectError are declared in runtime-panics.ts while their only thrower is stdlib-signature.ts and their sibling defect class lives beside its dispatcher
lens: D9
status: intake
verdict: pending
locations:
  - src/runtime/runtime-panics.ts:720-728
  - src/runtime/runtime-panics.ts:752-759
sites: 2
fix_scope: cross-module
d9_class: misplacement
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# StdlibMethodArgumentDefectError and StdlibMethodArgumentKindDefectError are declared in runtime-panics.ts while their only thrower is stdlib-signature.ts and their sibling defect class lives beside its dispatcher

## Observation
The two stdlib gate-gap defect classes — the bug-0315 arity belt `StdlibMethodArgumentDefectError` (runtime-panics.ts:720-728) and the bug-0394 kind belt `StdlibMethodArgumentKindDefectError` (752-759) — are declared in runtime-panics.ts. Every throw site for both lives in stdlib-signature.ts, the module that enforces the arity/kind preconditions they report. Their sibling-in-kind, `StdlibJoinElementDefectError`, lives in stdlib-array.ts (146-153) beside the `join` check that throws it.

## Evidence
runtime-panics.ts:752-758 (re-read before filing):

```ts
export class StdlibMethodArgumentKindDefectError extends Error {
  public constructor(method: string, argIndex: number, expectedKind: string, actual: ThetaValue) {
    super(
      `internal defect: stdlib method '${method}' argument ${argIndex} expects ${expectedKind}, got ${summariseNonResultOperand(actual)}; ...`,
    );
    this.name = "StdlibMethodArgumentKindDefectError";
  }
}
```

Affinity, counted both ways. `StdlibMethodArgumentDefectError` touches 0 members of runtime-panics (extends plain `Error`, no module-local call); `StdlibMethodArgumentKindDefectError` touches 1 (`summariseNonResultOperand`, exported). Both touch the concern of stdlib-signature.ts, their sole consumer: grep `StdlibMethodArgument(Kind)?DefectError` across src/ finds exactly one importing module — stdlib-signature.ts:3 — with four throw sites (stdlib-signature.ts:60, 63, 66, 94) and zero throw sites anywhere else (the remaining hits are the declarations themselves and doc-comment mentions in parser/stdlib-arg-diagnostics.ts:23 and stdlib-array.ts:138). Map importer counts: StdlibMethodArgumentDefectError 1 src / 0 tests; StdlibMethodArgumentKindDefectError 1/0. Sibling pattern: `StdlibJoinElementDefectError` (stdlib-array.ts:146-153) — the same belt family, per the kind belt's own doc comment ("exactly as `StdlibMethodArgumentDefectError` and `StdlibJoinElementDefectError` do") — is declared in the stdlib module that throws it.

## Why this is a problem
Counted affinity is entirely one-way: 0 and 1 members of the declaring module touched, versus a sole importer/thrower (stdlib-signature.ts, 4 throw sites) in another module. The file's own placement precedent, stated at QuestionOperandDefectError's doc comment (runtime-panics.ts:~747-750: "the precedent defect classes live beside the lowerings whose parse-gate preconditions they enforce — `PiToolArgShapeDefectError` / `ShadowedCalleeDispatchDefectError`, src/runtime/tool-call.ts"), argues for housing a defect class beside the code that enforces its precondition — which for these two is stdlib-signature.ts, not runtime-panics.ts. QuestionOperandDefectError itself is correctly beside `evaluateQuestion`; these two have no adjacent enforcer in this file.

## Suggested direction (non-binding, optional)
Hypothesis: move both classes to stdlib-signature.ts (the enforcer and sole thrower), keeping the `summariseNonResultOperand` import from runtime-panics — the same shape stdlib-array.ts already uses for StdlibJoinElementDefectError. Routing through `surfaceUnexpectedThrow` is unaffected (that surface classifies any non-panic throw; it never names these classes).

## False-positive check
Affinity counted both ways with member names (0-of-own / 1-of-own vs 4 throw sites in stdlib-signature.ts). Sibling-pattern citation: StdlibJoinElementDefectError at stdlib-array.ts:146-153, named per instance. Reference search: `grep -r "StdlibMethodArgument(Kind)?DefectError" src` — 12 hits, all accounted (declarations, self-names, one import + four throws in stdlib-signature.ts, two doc-comment mentions); no string-keyed/dynamic access, no re-export of either symbol found. surfaceUnexpectedThrow (runtime-panics.ts:828-875) re-read: it special-cases only ThetaPanic, HostFatal, NonObjectReceiverError — no dependency on these two classes staying in-module. Not a husk claim and not dead code (live throwers exist).

## Triage
verdict: questionable — accounting verified; target shape needs a human ruling: both declarations sit at runtime-panics.ts:720-728 / 752-759 as cited, StdlibMethodArgumentDefectError touches 0 own-host members (plain `Error`, no module-local reference) and the Kind sibling touches 1 (exported `summariseNonResultOperand`), the sole importer re-greps to stdlib-signature.ts:3 with exactly four throw sites (60/63/66/94) and no test/extensions/tools importer, string-keyed access or re-export barrel; the sibling pattern is real and self-declared — StdlibJoinElementDefectError at stdlib-array.ts:146-153 carries a doc comment saying "defined here (not in runtime-panics.ts) because the fix is confined to this file's owned surface" — and the QuestionOperandDefectError precedent quote is byte-exact at 686-690; surfaceUnexpectedThrow (828-875) names only ThetaPanic/HostFatal/NonObjectReceiverError, so routing is location-independent; not a duplicate (PTQ-1216 moved the signature substrate, not these classes; the same-wave d9-01 breakdown intake lists them as its hypothetical Seam B but is a different d9_class and untracked). Counter-signals for the ruling: docs/bugs/0315 §Fix (l.205) and 0394 §Fix (l.193) name `src/runtime/runtime-panics.ts` as the ratified home, and stdlib-signature.ts:12-13 plus parser/stdlib-arg-diagnostics.ts:23 cite "the belts' defect errors in `runtime-panics.ts`", so a move touches two doc comments and two bug-doc file lists (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: independent re-verification reproduces every claim — declarations at runtime-panics.ts:720-728/752-759, own-host affinity 0 (arity class, plain `Error`) and 1 (kind class → exported `summariseNonResultOperand`), sole importer stdlib-signature.ts:3 with exactly four throws (60/63/66/94), no importer under tests/extensions/tools, no re-export or string-keyed access; `surfaceUnexpectedThrow` branches only on HostFatal/NonObjectReceiverError (840/847) and `isThetaPanic` (879), so routing is location-independent; the sibling pattern is real and self-justified at stdlib-array.ts:132-153 ("defined here (not in runtime-panics.ts) because the fix is confined to this file's owned surface"); not tracked in quality/issues (PTQ-1216 moved the signature substrate only; PTQ-1119 deduped the dispatchers); counter-signals stand for the ruling — docs/bugs/0315 l.205 and 0394 l.193 ratify `src/runtime/runtime-panics.ts` as the home and stdlib-signature.ts:12-13 / stdlib-arg-diagnostics.ts:23 cite it, so a move edits two doc comments plus two bug-doc §Fix file lists (triage: claude-fable-5-1)
