---
id: PTQ-1218
title: InterpolatedResultPanic is the only ThetaPanic subclass declared outside src/runtime/, living in the render module that never throws it
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/render/query-render.ts:108-114
sites: 1
fix_scope: cross-module
d9_class: misplacement
wave: qw20260921001431
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-21
---

# InterpolatedResultPanic is the only ThetaPanic subclass declared outside src/runtime/, living in the render module that never throws it

## Observation
`InterpolatedResultPanic` (src/render/query-render.ts:108-114) is a `ThetaPanic` subclass declared in the render layer. The module header (query-render.ts:3) states the module owns "the pure `@`...`` query-template rendering pipeline"; this module never constructs the panic (its own `stringifyInterpolatedValue` `result` arm returns a diagnostic instead, 590-604 region). The class's sole src constructor site is src/extension/production-theta-producer.ts:8038, and its purpose per its own doc comment is runtime panic classification (`isThetaPanic`, QRY-21) in src/runtime/runtime-panics.ts.

## Evidence
src/render/query-render.ts:108-114:
```ts
export class InterpolatedResultPanic extends ThetaPanic {
  readonly code = INTERPOLATED_RESULT_CODE;
  constructor(message: string) {
    super(message);
    this.name = "InterpolatedResultPanic";
  }
}
```
Affinity counted both ways: the class touches 2 members of foreign hosts — `ThetaPanic` (extends/`super`, imported at query-render.ts:32 from `../runtime/runtime-panics`) and the `isThetaPanic`/QRY-21 classification its doc comment (103-106) says it exists for (runtime-panics.ts) — plus its only construction site at src/extension/production-theta-producer.ts:8038; it touches 1 member of its own module (`INTERPOLATED_RESULT_CODE`, line 78). Grep `new InterpolatedResultPanic` across src/: 1 hit, production-theta-producer.ts:8038 — zero in src/render/.

Sibling pattern, cited per instance (grep `extends ThetaPanic` across src/, 7 hits): `IndexOutOfBoundsPanic` (runtime/runtime-panics.ts:296), `MissingObjectKeyPanic` (:305), `NullIndexAccessPanic` (:314), `NullMemberAccessPanic` (:323), `InvokeDepthExceededPanic` (:332), `MatchError` (runtime/match-result.ts:36) — 6 of 7 subclasses live under src/runtime/; this is the only one in another layer. Its own doc comment names the pattern: "exactly as it already does for `MissingObjectKeyPanic` / `NullMemberAccessPanic` (`../runtime/runtime-panics.ts`)" (query-render.ts:105-106). Structural-map importer count for the class: 1 src / 3 tests.

## Why this is a problem
Correct code in the wrong module: a runtime panic-classification carrier sits in a module whose header claims a pure rendering pipeline and which never throws it. The counted affinity runs 2 foreign-host members (plus the extension-layer throw site) against 1 own-module member, and the siblings-in-kind all live elsewhere (6/7 under src/runtime/, 5 of them in one file, runtime-panics.ts). Every reader tracing the panic taxonomy from runtime-panics.ts misses this one member of the family.

## Suggested direction (non-binding, optional)
Hypothesis, unproven: re-home the class to src/runtime/runtime-panics.ts beside its five siblings, importing `INTERPOLATED_RESULT_CODE` from ../render/query-render (or moving the code constant with it); the 1 src importer (production-theta-producer.ts:329) and 3 test importers update their import path. No behaviour moves.

## False-positive check
Reference search: `InterpolatedResultPanic` across src/ — declaration (query-render.ts:108) + import/throw in production-theta-producer.ts (329, 8038); no dynamic/string-keyed access found. Not a re-export barrel or facade: query-render.ts declares the class, it does not re-export it. Dependency-direction check: query-render.ts already imports from ../runtime/runtime-panics (line 32) and ../runtime/wire-translation, so moving the class removes a render-layer declaration rather than adding a new cross-layer edge; runtime-panics.ts would gain one import of a render constant (or the constant moves too). Deliberate-colocation check: the class's doc comment ties it to the QRY-18 code constant declared here, but the constant is already exported and imported elsewhere (map: `INTERPOLATED_RESULT_CODE` 1 src / 6 test importers), so colocation is not load-bearing. Duplicate check: no PTQ issue or pending intake candidate names `InterpolatedResultPanic` (grep of quality/ — only PTQ-1124, resolved, targets `interpolationTypeOf`, a different declaration).

## Triage
verdict: questionable — accounting verified with one correction: excerpt byte-exact at query-render.ts:108-114, doc-comment sibling citation at 105-106 real, `extends ThetaPanic` = 7 src hits with 6 under src/runtime/ (runtime-panics.ts:296/305/314/323/332, match-result.ts:36), `new InterpolatedResultPanic` = 1 src hit (production-theta-producer.ts:8038 via raiseInterpolatedResult, import at :329), zero constructions in src/render/ (the module's own `result` arm at 493-504 — not 590-604 as filed — returns a diagnostic), size-scan importers 1 src / 3 tests for the class and 1/6 for INTERPOLATED_RESULT_CODE, no exemptions row, not a barrel, no dynamic access (test string literals are gate assertion constants), not a duplicate (d9-09 targets the extension-layer evaluator family; PTQ-1124 targets interpolationTypeOf); correction: the strict affinity is 1 own (INTERPOLATED_RESULT_CODE) vs 1 foreign (ThetaPanic) — the `isThetaPanic`/QRY-21 classification is a consumer of the class, not a member it touches, so the filed 2:1 is padded and the misplacement rests on the sibling pattern alone; the home needs a human ruling because error-model.md:65 states this panic is "deliberately not an entry" in the `theta/runtime/*` set, runtime-panics.ts:1-15 claims ownership of "the closed theta 1.0 runtime-panic set", and query-render.ts:13-15 explicitly lists the QRY-18 `theta/parse/interpolated-result` rejection as owned there — either home has a documented claim (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
