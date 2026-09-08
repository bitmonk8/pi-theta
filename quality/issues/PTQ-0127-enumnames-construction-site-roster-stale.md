---
id: PTQ-0127
title: StaticTypeInferenceDeps.enumNames documents "both production construction sites" and names two, while three production sites construct the pass
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/static-type-inference.ts:74-93
  - src/parser/type-layer-checks.ts:338-341
  - src/extension/invoke-static-checks.ts:943-946
  - src/extension/invoke-static-checks.ts:1386-1389
sites: 3
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# StaticTypeInferenceDeps.enumNames documents "both production construction sites" and names two, while three production sites construct the pass

## Observation
The doc comment on `StaticTypeInferenceDeps.enumNames` justifies the field's
no-default, explicitly-injected shape by enumerating the callers that must
supply it: "both production construction sites (./type-layer-checks.ts's
`checkTypeLayer`, ../extension/invoke-static-checks.ts's
`checkInvokeStaticResolution`) have `body.statements` in scope and must pass the
real set". `new StaticTypeInferencePass(` occurs at three production sites: the
two named ones and a third in `checkImportedFnCallArgs`
(invoke-static-checks.ts:1386), which also computes and passes
`collectEnumNames(...)`. The roster's cardinal word ("both") and its two-item
list therefore state a caller set the code does not have.

## Evidence
src/parser/static-type-inference.ts:82-89 — the roster:

```ts
   * the enum variant (../runtime/statement-executor.ts). Explicit dependency injection,
   * no default: both production construction sites
   * (./type-layer-checks.ts's `checkTypeLayer`,
   * ../extension/invoke-static-checks.ts's `checkInvokeStaticResolution`)
   * have `body.statements` in scope and must pass the real set, so a missing
   * value is a wiring bug caught at the call site, not a silent empty-set
   * fallback that would let a production path mis-resolve a shadowed enum
   * variant.
```

src/parser/type-layer-checks.ts:338-341 — named site one, inside `checkTypeLayer`:

```ts
  const pass = new StaticTypeInferencePass({
    checkCompatible,
    enumNames: collectEnumNames(body.statements),
  });
```

src/extension/invoke-static-checks.ts:943-946 — named site two, inside
`checkInvokeStaticResolution`:

```ts
    const typePass = new StaticTypeInferencePass({
      checkCompatible,
      enumNames: collectEnumNames(input.body.statements),
    });
```

src/extension/invoke-static-checks.ts:1386-1389 — the unnamed third site, inside
`checkImportedFnCallArgs` (declared at :1376):

```ts
  const importerPass = new StaticTypeInferencePass({
    checkCompatible,
    enumNames: collectEnumNames(importingBody.statements),
  });
```

## Why this is a problem
The comment is a closed caller roster used as the argument for a design
constraint (no default value): "both production construction sites … must pass
the real set". A reader changing the field's shape, or verifying the "a missing
value is a wiring bug caught at the call site" claim, would audit two call sites
and miss `checkImportedFnCallArgs`, which reads a different body
(`importingBody`) and therefore a different enum-name set. The count is
mechanical: `grep -rn "new StaticTypeInferencePass" src/ extensions/ tools/`
returns exactly three hits, none of which the roster covers in full.

## Suggested direction (non-binding, optional)
Either the roster names the third site or it stops enumerating and states the
obligation generically ("every production construction site").

## False-positive check
- `grep -rn "new StaticTypeInferencePass" .` (excluding `node_modules`, `.git`,
  `dist`) — 3 production hits (type-layer-checks.ts:338,
  invoke-static-checks.ts:943, invoke-static-checks.ts:1386) and 8 test hits.
  The three production hits are the counted set; the test hits are not
  "production construction sites" and are excluded from the count the roster
  makes.
- Enclosing-function identification: :338 sits inside `checkTypeLayer`
  (declared type-layer-checks.ts:333); :943 inside `checkInvokeStaticResolution`
  (declared invoke-static-checks.ts:912); :1386 inside `checkImportedFnCallArgs`
  (declared invoke-static-checks.ts:1376) — a function the roster does not name.
- `grep -rn "StaticTypeInferencePass" extensions/ tools/` — no hits, so no
  fourth production site hides outside `src/`.
- Not a deadness claim: all three sites are live production callers, so the
  test-only-caller exemption does not apply.
- Distinct from `qw20260907130901-d2-03-inferred-type-map-published-lookup-unconsumed.md`
  (whose subject is `infer()`'s discarded return value) and from
  `qw20260907183353-d2-05-inference-checkcompatible-knob-constant.md` (whose
  subject is the `checkCompatible` field): this finding's location is the
  `enumNames` doc block and its symptom is the two-of-three caller roster.

## Triage
verdict: confirmed — verified independently: exactly 3 production `new StaticTypeInferencePass` sites (type-layer-checks.ts:338, invoke-static-checks.ts:943, :1386) vs the roster's "both" plus two names; the unnamed third is live production (checkImportedFnCallArgs <- import-static-checks.ts:1808 <- checkThetaImports <- production-composition.ts), not test-only, and no hits exist in extensions/ or tools/ (triage: claude-opus-5)
