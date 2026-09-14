---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: firstAdmittingArmProperties hand-rolls anyOf arm matching the already-wired AJV SchemaValidator already answers elsewhere in the same class
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-theta-producer.ts:7246-7301
  - src/extension/production-theta-producer.ts:7320-7343
  - src/extension/production-theta-producer.ts:7354-7370
  - src/extension/production-theta-producer.ts:7372-7434
  - src/extension/production-theta-producer.ts:4568-4576
  - src/seams/schema-validator.ts:29-36
  - docs/bugs/0381-echo-object-first-field-model-key-order.md:199-207
sites: 7                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: reimplemented      # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-theta-producer.ts#firstAdmittingArmProperties
wave: qw20260914091051
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# firstAdmittingArmProperties hand-rolls anyOf arm matching the already-wired AJV SchemaValidator already answers elsewhere in the same class

## Observation
`echoTypeFromValue` (`src/extension/production-theta-producer.ts:7246-7301`) and its helpers `derefLoweredProperty` (7320-7343), `loweredObjectPropertiesFor` (7354-7370) and `firstAdmittingArmProperties` (7401-7434) walk a lowered JSON-Schema position by hand — following `{"$ref":"#/$defs/<name>"}` chains and then picking a discriminated-union `anyOf` arm by comparing the bound value's own key set against each arm's `properties` key set and any `const`-valued field — to decide how `#emitBinderEchoNote`'s system note (line 1245, called from `runBinder` on every successful bind) renders one bound parameter's value. The same file already imports and wires the AJV-backed `SchemaValidator` facility (`src/seams/schema-validator.ts`, backed by the `ajv` package dependency) for exactly this "which schema arm does this value admit" question, and uses it correctly at 8+ other sites in the same class — including `#validateInvokeReturn`'s own `anyOf` clause, whose doc comment (4568-4576) states it "re-tests the value against each arm in source order... through the same `SchemaValidator`". `firstAdmittingArmProperties`'s own doc comment admits its narrower key-set/`const` approximation can pick a "possibly non-AJV-matching arm" and names the `SchemaValidator`-based approach as the "faithful fix" — a gap the bug-0381 fix report that introduced this code recorded as residual "F2" and explicitly recommended a follow-up filing for, which has not landed.

## Evidence

`src/extension/production-theta-producer.ts:7406-7418` — the hand-rolled arm-admission test (inside `firstAdmittingArmProperties`, full function 7401-7434): key-set size/membership plus a manual `const`-field loop, in place of a schema-aware validate call:
```ts
  const valueKeySet = new Set(Object.keys(value));
  for (const rawArm of arms) {
    const arm = derefLoweredProperty(rawArm, defs, 0);
    if (typeof arm !== "object" || arm === null) {
      continue;
    }
    const armProps = (arm as Record<string, unknown>)["properties"];
    if (typeof armProps !== "object" || armProps === null) {
      continue;
    }
    const armPropsRecord = armProps as Record<string, unknown>;
    const armKeys = Object.keys(armPropsRecord);
    if (armKeys.length !== valueKeySet.size || !armKeys.every((key) => valueKeySet.has(key))) {
      continue;
    }
```

`src/extension/production-theta-producer.ts:7389-7399` — the function's own doc comment naming the gap and the facility that would close it:
```ts
 * SCOPE of the match: this key-set + `const` test picks the AJV-matching arm
 * exactly for a DISCRIMINATED (all-object) union — where schemas.md
 * guarantees each variant a unique single-literal discriminator — and for a
 * union carrying at most one object arm. For an UNDISCRIMINATED
 * multi-object-arm union (reachable only via a mixed union `A | B | string`
 * or an inline object union, which schemas.md does not discriminator-gate)
 * two arms may share a key set with no distinguishing `const`; the first
 * key-set match is then a DETERMINISTIC but possibly non-AJV-matching arm.
 * Recorded limitation (docs/bugs/0381 §Fix residual): the faithful fix
 * re-tests each arm through the `SchemaValidator`, as
 * runtime-value-model.md §"Wire-name translation" does.
```

`src/extension/production-theta-producer.ts:4568-4576` — the facility used correctly for the identical question (`anyOf` arm admission), in the SAME class, elsewhere in the SAME file:
```ts
   * The pass reaches the positions the derived sidecars key by JSON Pointer —
   * named-enum positions, `$ref` targets, array elements, the annotated root —
   * and a `{"anyOf":[…]}` position: there the walk re-tests the value against
   * each arm in source order and translates under the FIRST arm that admits it
   * (runtime-value-model.md §"Wire-name translation", the inbound bullet's
   * union clause), through the same `SchemaValidator` the verdict above came
   * from. No arm admitting the value hands it to the caller exactly as AJV
   * validated it: untagged, unbranded, and not descended into.
```

`src/seams/schema-validator.ts:29-36` — the facility's own location: an AJV-backed (`ajv` package, `package.json` `"ajv": "^8.17.1"`) schema validator already imported into `production-theta-producer.ts` (`import type { CompiledValidator, LoweredSchema, SchemaValidator } from "../seams/schema-validator";`, line 258) and reached via `this.#input.root.schemaValidator` at 8+ call sites in the `ProductionThetaProducer` class (e.g. lines 1067, 1590, 2739, 3453, 3793, 4606):
```ts
export interface CompiledValidator {
  validate(value: unknown):
    | { ok: true }
    | { ok: false; errors: readonly ValidationError[] };
}

export interface SchemaValidator {
  compile(schema: LoweredSchema): CompiledValidator;
}
```

`docs/bugs/0381-echo-object-first-field-model-key-order.md:199-207` — the fix report that introduced this exact code (landed 0.369.0) recording the gap as an open residual with a recommended, still-unfiled follow-up:
```
- Residuals:
  1. F2 — an undiscriminated union carrying ≥2 object arms (reachable only via a mixed
     union `A | B | string` or an inline object union, which `schemas.md` does not
     discriminator-gate) whose arms share a key set in different declared order: the echo's
     key-set + `const` match selects a DETERMINISTIC but possibly non-AJV-matching arm's
     order. Exotic / non-normative (no BNDR-6 vector); 0381's determinism thesis holds
     either way. Faithful fix: re-test each arm through the injected `SchemaValidator`
     (runtime-value-model.md §"Wire-name translation"). The `firstAdmittingArmProperties`
     comment scopes the claim honestly. Recommend a follow-up filing.
```

Feature-for-feature comparison: the facility (`SchemaValidator.compile(schema).validate(value)`) runs AJV's full keyword set per arm (type, required, const, nested properties, formats, …) and is exactly the mechanism `#validateInvokeReturn`'s sibling `anyOf` walk already uses for arm admission. The hand-rolled `firstAdmittingArmProperties` instead checks only "same key COUNT and every arm key present in the value" plus a manual `const`-field equality loop — no `type` check, no nested-schema check, no `required` check beyond the key-count proxy. The two diverge exactly where an authored discriminated union is not literal-discriminated (a real, reachable theta 1.0 shape per the residual note), which is the gap the bug's own report names.

## Why this is a problem
Four functions (~90 LOC: `echoTypeFromValue` 56 LOC, `derefLoweredProperty` 24 LOC, `loweredObjectPropertiesFor` 17 LOC, `firstAdmittingArmProperties` 34 LOC) hand-roll `$ref`-chasing and `anyOf`-arm admission that the `SchemaValidator` facility already answers — a facility this exact file already imports and calls at 8+ other sites in the same class for the same "which schema arm does this value admit" question. The gap between the hand-rolled approximation and the facility is not a hypothesis: it is stated in the hand-rolled code's own doc comment and recorded as an open residual ("Recommend a follow-up filing") in the bug report that shipped it, with no follow-up filed since (grepped `docs/bugs/*.md` for `firstAdmittingArmProperties` / `0381`: only the originating report itself references it).

## Suggested direction (non-binding, optional)
Thread the already-available `this.#input.root.schemaValidator` (or a compiled per-arm `CompiledValidator`) from `#emitBinderEchoNote` down to the arm-matching step so admission is decided by AJV against each arm's own schema — the same pattern `#validateInvokeReturn` already uses — instead of the key-set/`const` approximation; unproven hypothesis, not a design.

## False-positive check
- Design-decision carve-out: the hand-rolled code's own comment does not claim the current shape is intentional or superior — it names the `SchemaValidator`-based approach as the "faithful fix" and calls the current one a "Recorded limitation", which is the opposite of a rationale that would make this a deliberate, defensible design choice.
- Bug-doc follow-up check: searched `docs/bugs/*.md` for `firstAdmittingArmProperties`, `declarationOrderedEchoFields`, and `0381` — only `0381-echo-object-first-field-model-key-order.md` itself (the originating fix) references the residual; no later-numbered bug (up to 0476, the newest in the tree) closes it.
- Not dead code: `echoTypeFromValue` is reached from `#emitBinderEchoNote` (line 1245), itself called by `runBinder` on every successful bind whose theta does not set `bind_echo: false` — a live, exercised production path, not test-only.
- Already-filed / rejected check: grepped the wave's already-filed PTQ list and recent triage rejections for "echo", "arm", "anyOf", "firstAdmitting", "SchemaValidator" — no match; this is a fresh observation.
- D2 spec-mirroring carve-out: the `arms` here are a per-theta AUTHOR-DECLARED union of arbitrary cardinality/shape, not a fixed spec-named enumeration the code is mirroring one-for-one, so the "type arm mirrors a spec enumeration" not-finding precedent does not apply.

## Triage
verdict: questionable — every citation reproduces (SchemaValidator, its 8+ same-class call sites, the analogous per-arm compile-then-validate walk in wire-translation.ts, bug-0381's F2 residual) so the reimplementation gap is real, but the complained-of functions are top-level module functions ~2600 lines after ProductionThetaProducer's class body closes (not "the same class" as titled), the function's own comment — quoted by the filing only from the sentence after — calls it deliberately "a pure value→descriptor function, not a validation boundary," and 0381 itself scopes the gap as "exotic / non-normative" with its determinism thesis holding either way: a real, available simplification but a purity-vs-AJV-fidelity design trade-off for a human to rule on, not a proven defect (triage: claude-opus-5)
