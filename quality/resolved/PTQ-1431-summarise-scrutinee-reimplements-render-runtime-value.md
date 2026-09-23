---
id: PTQ-1431
title: summariseScrutinee in match-result.ts hand-rolls the category-2 runtime-value rendering that diagnostics/placeholder.ts renderRuntimeValue already implements
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/runtime/match-result.ts:54-86
  - src/diagnostics/placeholder.ts:71-123
sites: 1
fix_scope: cross-module
d8_class: reimplemented
d8_host: src/runtime/match-result.ts#summariseScrutinee
wave: qw20260923010657
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-23
---

# summariseScrutinee in match-result.ts hand-rolls the category-2 runtime-value rendering that diagnostics/placeholder.ts renderRuntimeValue already implements

## Observation
`src/runtime/match-result.ts#summariseScrutinee` (33 LOC per the structural map, one live caller: the `MatchError` message at match-result.ts:159) renders a scrutinee value "per the category-2 runtime-value placeholder rule (diagnostics/placeholder-rendering-a.md)" — its own doc-comment's words. `src/diagnostics/placeholder.ts` is the module built as "the diagnostic placeholder-rendering seam" (its line-1 header) and exports `renderRuntimeValue` (placeholder.ts:86-109) plus `truncateRuntimeString` (placeholder.ts:117-123) implementing the same category-2 table. A grep for `renderRuntimeValue` across src/ finds no caller outside placeholder.ts itself; its only consumers are tests (tests/placeholder-rendering.test.ts). So the seam module's implementation sits production-unused while match-result carries an inline re-derivation of the same rules.

## Evidence
The reimplementation, src/runtime/match-result.ts:54-86 (re-read before filing):

```ts
function summariseScrutinee(value: ThetaValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    const codePoints = Array.from(value);
    return codePoints.length <= 80 ? value : codePoints.slice(0, 77).join("") + "...";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return Object.is(value, -0) ? "0" : String(value);
  }
```
…continuing (match-result.ts:70-85): boxed-`String` enum → bare string, `Array.isArray` → `JSON.stringify`, `isResultValue` → `Ok(${summariseScrutinee(...)})` / `Err(${summariseScrutinee(...)})`, fall-through object → compact `JSON.stringify`.

The facility, src/diagnostics/placeholder.ts:86-109 and 117-123 (re-read before filing):

```ts
export function renderRuntimeValue(value: RuntimeValue): string {
  switch (value.kind) {
    case "string":
      return truncateRuntimeString(value.value);
    ...
    case "number":
      return Object.is(value.value, -0) ? "0" : String(value.value);
    case "boolean":
      return value.value ? "true" : "false";
    case "null":
      return "null";
    case "schema-object":
      return JSON.stringify(value.value);
    case "result":
      return `${value.variant}(${renderRuntimeValue(value.inner)})`;
  }
}
```
and `truncateRuntimeString` (placeholder.ts:117-123): `codePoints.slice(0, 77).join("") + "..."` past 80 code points — byte-for-byte the same rule as match-result.ts:58-60.

Feature-for-feature comparison against the call site's real need (one caller, the `MatchError: no arm matched <scrutinee summary>` message, match-result.ts:159): six of the eight rendering rules `summariseScrutinee` applies — string truncation (80→77+`...` by code point), boolean literal, `-0`→`"0"` number, `null` literal, schema-object compact `JSON.stringify`, `Ok(...)`/`Err(...)` recursion — are implemented identically in `renderRuntimeValue`. The two arms the facility's `RuntimeValue` union (placeholder.ts:71-79) does NOT cover are: an array value (match-result JSON.stringifies it — the same disposition as its schema-object arm) and an enum boxed-`String` (rendered as its bare wire string). Bridging would need a `ThetaValue`→`RuntimeValue` classifier plus those two arms; that gap is real and counted here, not elided.

Caller/production-use counts: structural map gives `summariseScrutinee` 54-86, 33 LOC, 0 importers (module-private, one internal caller). Search `renderRuntimeValue` across src/: 2 hits, both in placeholder.ts (declaration + self-recursion); across tests/: tests/placeholder-rendering.test.ts only. The parallel is already acknowledged in-code: src/runtime/err-field-summary.ts:26 cites "(`summariseScrutinee`'s schema-typed-object arm, `src/runtime/match-result.ts`)" as a rule source — i.e. the codebase names this inline copy, not the seam module, as the place the rule lives.

## Why this is a problem
The repo built a single-implementation seam for exactly this table — placeholder.ts's header: "The normative surface (per diagnostics/placeholder-rendering-a.md and …-b.md) groups every V1 placeholder into eight categories and fixes one rendering rule per category, so two conformant implementations produce byte-identical strings" — and match-result is a second conformant implementation of the category-2 rules, which is the drift shape that header exists to prevent. The truncation constant (77/80), the `-0` normalisation, and the `Ok(`/`Err(` spelling now live in two places that must stay byte-identical (the spec demands it), with the facility copy verified only by tests and the hand-rolled copy the one production actually runs.

## Suggested direction (non-binding, optional)
Unproven hypothesis: a `ThetaValue`→`RuntimeValue` classifier (plus an array arm, or array-as-schema-object mapping, and an enum-boxed-String arm on the facility) would let `summariseScrutinee` delegate to `renderRuntimeValue`, making the seam module the single production implementation its header claims. Not designed here; the two-arm gap in `RuntimeValue` is the open cost.

## False-positive check
- Exemption check: store D8 exemptions carry no key for src/runtime/match-result.ts or `#summariseScrutinee` (only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties).
- Prior-filing check: PTQ-1257 (evaluatematch sentinel thunk, against-grain) targets `evaluateMatch`/`MatchArm`, a different function and class; no PTQ names summariseScrutinee or renderRuntimeValue; the wave sibling filings (d2/d4) touch statement-executor re-exports and import-specifier-facts.
- Test-only-caller rule: `renderRuntimeValue` having only test callers does NOT make it dead (D2 precedent), and the direction above would make it production-live, never demote live code to test-only reachability.
- Spec check: diagnostics/placeholder-rendering-a.md's category-2 rule constrains the OUTPUT bytes, not which module computes them; delegating drops no spec-required behaviour. The two uncovered arms (array, enum) are named above rather than hidden.
- Reference searches run: `renderRuntimeValue|truncateRuntimeString` across src/, tests/, extensions/, tools/ (src hits: placeholder.ts only; tests hits: placeholder-rendering.test.ts); `summariseScrutinee` across src/ (match-result.ts declaration + 3 internal uses, plus the err-field-summary.ts:26 comment citation).

## Triage
verdict: questionable — accounting verified: match-result.ts:54-86 `summariseScrutinee` (one live caller, :159) and placeholder.ts:86-123 `renderRuntimeValue`/`truncateRuntimeString` both reproduce byte-for-byte at the cited lines; 6 of 8 arms (string 80→77+`...`, boolean, `-0`→`0` number, null, compact JSON.stringify object, `Ok(`/`Err(` recursion) are identical and the two uncovered arms (array, boxed-String enum) are honestly counted; `renderRuntimeValue|truncateRuntimeString` across src/extensions/tools/tests hits only placeholder.ts + tests/placeholder-rendering.test.ts (no production caller); `summariseScrutinee` hits match-result.ts (decl + 3 uses), err-field-summary.ts:26 and tests/err-note-render.test.ts:301 comments only; quality/exemptions.json has no D8 key for match-result.ts; spec placeholder-rendering-a.md §2 pins output bytes not the computing module so delegating drops nothing; no PTQ names either function (PTQ-0083 is citation drift only, PTQ-1257 targets evaluateMatch) — but the simpler shape needs a `ThetaValue`→`RuntimeValue` classifier plus two new facility arms, a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: match-result.ts:54-86 `summariseScrutinee` (sole live caller :159) and placeholder.ts:86-123 `renderRuntimeValue`/`truncateRuntimeString` reproduce byte-for-byte; 6 of 8 arms identical (string 80→77+`...`, boolean, `-0`→`0`, null, compact JSON.stringify object, `Ok(`/`Err(` recursion), the facility's `integer` arm (`renderInteger` :153-160) applies the same `-0`/String rule so no hidden need is missed, and the two uncovered arms (array, boxed-String enum) are honestly counted; grep `renderRuntimeValue|truncateRuntimeString` across src/extensions/tools/tests hits only placeholder.ts (decl + self-recursion + private helper) and tests/placeholder-rendering.test.ts — zero production callers; `summariseScrutinee` hits match-result.ts (decl + 3 uses) plus comment citations in err-field-summary.ts:26 and tests/err-note-render.test.ts:301; quality/exemptions.json D8 keys are only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties; docs/spec_topics/diagnostics/placeholder-rendering-a.md:53-64 category 2 pins output bytes not the computing module so delegating drops nothing; no open/resolved PTQ names either function (PTQ-0083 is citation drift in err-field-summary, PTQ-1257 targets evaluateMatch); minor inaccuracy only — `truncateRuntimeString` is module-private, not exported as the Observation says — but the simpler shape needs a `ThetaValue`→`RuntimeValue` classifier plus two new facility arms, a design decision for a human ruling (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
