---
id: pending
title: The enum runtime value is recognised two ways — seven sites through the brand predicate `isEnumValue` (the route `value.ts` and the spec's reference-encoding paragraph name, and the only one bug 0020 hardened) and five sites through the carrier's concrete JS shape `value instanceof String` (three of them in `wire-form-outbound.ts`), the shape `value.ts` declares "may change without a spec revision"
lens: D1
status: intake
verdict: pending
locations:
  - src/runtime/value.ts:58-67
  - src/runtime/value.ts:135-144
  - src/runtime/value.ts:489-491
  - src/runtime/wire-form-outbound.ts:13-21
  - src/runtime/wire-form-outbound.ts:71-75
  - src/runtime/wire-form-outbound.ts:145-150
  - src/runtime/subagent-wire-form.ts:70-73
  - src/runtime/match-result.ts:77-81
  - src/runtime/query-interpolation.ts:177-180
  - src/parser/system-prompt-render.ts:126-131
  - src/render/query-render.ts:406-408
  - src/runtime/runtime-panics.ts:419
  - src/runtime/runtime-receiver-gate.ts:67
  - src/runtime/err-field-summary.ts:112
  - src/runtime/value.ts:220-222
  - src/runtime/wire-form-depth-walk.ts:17-22
sites: 12
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# The enum runtime value is recognised two ways — seven sites through the brand predicate `isEnumValue` (the route `value.ts` and the spec's reference-encoding paragraph name, and the only one bug 0020 hardened) and five sites through the carrier's concrete JS shape `value instanceof String` (three of them in `wire-form-outbound.ts`), the shape `value.ts` declares "may change without a spec revision"

## Observation
`makeEnumValue` (src/runtime/value.ts) is the single constructor of an enum runtime value: a boxed `String` carrying a non-enumerable symbol brand. `value.ts` exports `isEnumValue`, which recognises the value by that brand, and documents the in-memory shape as opaque. Across src/, the question "is this value the enum carrier?" is answered by two mechanisms: seven sites call `isEnumValue` (brand), five sites test `value instanceof String` (shape). Two of the shape sites do the same job as a brand site in another module — collapsing an enum to its bare wire string in an outbound QRY-18 walk (`lowerOutbound` vs `translateInterpolationOutbound`), and excluding enums from a "plain object" test (`isPlainObject` vs `system-prompt-render.ts`'s guard). Bug 0020 revised the brand route once (descriptor-privacy `privateBrandOf`) without the shape route being in its scope; wire-form-depth-walk.ts's header states the carrier decision is "single-sourced in that one function" (`classifyWireNode`) while its sibling wire-form module decides it three more times inline.

## Evidence

### The declared contract (one constructor, one recognition route, shape reserved as changeable)

src/runtime/value.ts:58-67:
```ts
/**
 * An enum runtime value. Carries the variant's wire string plus an
 * interpreter-private declaring-enum tag identifying the declaring enum.
 * `JSON.stringify` of an enum value yields the **bare wire string** — the tag
 * never appears in JSON output (runtime-value-model.md, value-representation
 * table, enum row). Opaque: construct only via `makeEnumValue`; the concrete
 * in-memory shape is an implementation detail not reachable from Theta code and
 * may change without a spec revision.
 */
export type EnumValue = { readonly [enumBrand]: "theta-enum" };
```

src/runtime/value.ts:135-144 (the sole `new String(` in src — command `grep -rn "new String(" src/ --include=*.ts`, 4 hits, 3 of them inside comments at subagent-wire-form.ts:52/193 and wire-form-depth-walk.ts:13):
```ts
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

src/runtime/value.ts:489-491:
```ts
export function isEnumValue(value: ThetaValue): value is EnumValue {
  return enumTagOf(value) !== undefined;
}
```

docs/spec_topics/runtime-value-model.md:16 (non-normative reference encoding; quoted for the recognition posture it names): "The enum tag is recognised the same way — by the non-enumerable descriptor on that symbol, never by key presence … These shapes are implementation details — neither is reachable from theta code, neither appears in any wire schema, and either may change without a spec revision."

### Way A — brand predicate (`isEnumValue`), 7 consumer sites

Command `grep -rn "isEnumValue(" src/ --include=*.ts`, 8 hits (the 8th is the declaration at value.ts:489):
```
src/parser/system-prompt-render.ts:129:    isEnumValue(value) ||
src/render/query-render.ts:406:  if (isEnumValue(value)) {
src/runtime/err-field-summary.ts:112:  if (isEnumValue(value as ThetaValue)) {
src/runtime/query-interpolation.ts:177:  if (isEnumValue(value)) {
src/runtime/runtime-panics.ts:419:  if (isEnumValue(value)) {
src/runtime/runtime-receiver-gate.ts:67:  if (isEnumValue(value)) {
src/runtime/value.ts:221:  return !isEnumValue(value) && !isResultValue(value);
src/runtime/value.ts:489:export function isEnumValue(value: ThetaValue): value is EnumValue {
```

src/runtime/query-interpolation.ts:177-180 (outbound collapse to the bare wire string, brand route):
```ts
  if (isEnumValue(value)) {
    // The enum brand is dropped; the model only ever sees the bare wire string.
    return String(value);
  }
```

src/parser/system-prompt-render.ts:126-131 (plain-object exclusion, brand route):
```ts
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    isEnumValue(value) ||
    isResultValue(value)
  ) {
```

### Way B — carrier shape (`instanceof String`), 5 sites in 3 files

Command `grep -rn "instanceof String" src/ --include=*.ts`, 5 hits:
```
src/runtime/match-result.ts:79:  if (value instanceof String) {
src/runtime/subagent-wire-form.ts:71:  if (value instanceof String) {
src/runtime/wire-form-outbound.ts:19:    !(value instanceof String)
src/runtime/wire-form-outbound.ts:71:  if (value instanceof String) {
src/runtime/wire-form-outbound.ts:146:  if (value instanceof String) {
```

src/runtime/wire-form-outbound.ts:13-21 (plain-object exclusion, shape route — the same predicate system-prompt-render.ts:126-131 answers by brand):
```ts
/** Whether `value` is a plain (non-array, non-enum-boxed, non-null) JS object. */
export function isPlainObject(value: unknown): value is { readonly [k: string]: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof String)
  );
}
```

src/runtime/wire-form-outbound.ts:71-75 (`lowerOutbound`'s outbound collapse — the same job query-interpolation.ts:177-180 does by brand; the comment frames the test as enum recognition):
```ts
  if (value instanceof String) {
    // An enum value is a boxed string carrying a non-enumerable declaring-enum
    // tag; its wire form is the bare string (the tag never crosses the wire).
    return value.valueOf();
  }
```

src/runtime/wire-form-outbound.ts:145-150 (`projectForValidation`):
```ts
export function projectForValidation(value: ThetaValue): unknown {
  if (value instanceof String) {
    // The boxed enum carrier's wire form is its bare string — the same
    // collapse `lowerOutbound` performs for the outbound direction.
    return value.valueOf();
  }
```

src/runtime/subagent-wire-form.ts:70-73 (`classifyWireNode`, consulted by three walks):
```ts
export function classifyWireNode(value: unknown): WireNode {
  if (value instanceof String) {
    return SCALAR_WIRE_NODE;
  }
```

src/runtime/match-result.ts:77-81 (scrutinee classification for a diagnostic — the same "what kind is this value" question runtime-panics.ts:419 / runtime-receiver-gate.ts:67 / err-field-summary.ts:112 answer by brand):
```ts
  // An enum runtime value is a boxed `String`; it renders as its bare wire
  // string (the declaring-enum tag never surfaces).
  if (value instanceof String) {
    return { kind: "enum", value: String(value) };
  }
```

### The concrete misread in scope

src/runtime/wire-form-depth-walk.ts:17-22 (header):
```ts
// (`docs/spec_topics/schema-subset.md:13`, `:22`, the counting algorithm at
// `:24–30`), so this walk classifies every node through `classifyWireNode`
// (`./subagent-envelope.ts`) — the one function bug 0201 already exported
// to answer this exact question for the child-side envelope writer — rather
// than re-deriving a second carrier arm: the carrier decision stays
// single-sourced in that one function.
```
The sibling wire-form module `wire-form-outbound.ts` carries three carrier arms of its own (:19, :71, :146), and the brand route in value.ts is a fourth decision point; the "single-sourced" reading holds only within the three depth/non-finite walks.

### The drift on record
docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md:1-8 — "The enum and schema brands … classify by presence-only `hasOwnProperty`: an enumerable same-named key forges them … **Status:** fixed (0.32.0). … a shared module-private `privateBrandOf` helper (own-property descriptor exists AND is non-enumerable) routes `enumTagOf`, `schemaTagOf`, and `isResultValue`: one privacy posture, three tags". The recognition rule was revised at the brand route; the shape route (`isPlainObject`'s `instanceof String`, present since commit 96c6fdb7 "V2e — wire-name translation boundary", per `git log -S"instanceof String" --oneline -- src/`) was outside that fix's scope, so the two routes have already been maintained as separate mechanisms once. At that fix's time the two disagreed on a production-reachable value: a JSON payload `{"__thetaEnum":"Severity"}` classified as an enum by the brand route (0020:224 "`isEnumValue(JSON.parse('{"__thetaEnum":"Severity"}'))` // true — the defect") and as a plain object by the shape route.

### Self-inconsistency statement
No written architecture rule pins how src/ recognises the enum carrier (the spec paragraph is non-normative); the anchor is self-inconsistency — one constructor, an exported brand predicate documented as the recognition route, and five sites that recognise by the shape the same module reserves the right to change — plus the cost below.

## Why this is a problem
Mechanically, what a maintainer gets wrong: `value.ts` and the spec reserve the right to change the carrier shape "without a spec revision", and the brand route survives any such change by construction. Every Way-B site takes `unknown` or `ThetaValue`, so a carrier change type-checks cleanly at all five and silently flips each to its object/record arm — `isPlainObject` would admit the carrier as a record, `lowerOutbound` and `projectForValidation` would emit its enumerable keys instead of the bare wire string, `classifyWireNode` would count it as a record level (the exact failure class bug 0202 recorded for `depthWalk`), and `summariseScrutinee` would render it as a schema object — while the seven Way-A sites keep answering correctly, so the divergence shows up as a split between the two halves of the same QRY-18 / ceiling-#4 pipeline rather than as a uniform breakage. Conversely, a hardening applied to the brand route (as 0020 was) never reaches the shape route. The in-scope header at wire-form-depth-walk.ts:17-22 gives a reader the false assurance that the carrier decision has one home.

## Suggested direction (non-binding, optional)
Unproven hypothesis: the wire-form modules recognise the carrier through `value.ts`'s exported brand predicate (with a `ThetaValue` narrowing where the input is `unknown`), leaving the JS-shape test to the one constructor — or, if the wire-form walks deliberately key on "what `JSON.stringify` writes for any `String` object" rather than on enum identity, their comments say so and stop describing the test as enum recognition. The fix stage owns the choice.

## False-positive check
- Injected clone map: no group covers this (G026 covers the depth-walk loop pair subagent-wire-form.ts:159-182 / wire-form-depth-walk.ts:67-88, not the one-line predicate sites).
- D4 check: the two mechanisms are not token copies of each other (a call vs an `instanceof` test); the five `instanceof String` lines are mechanism-shaped, so this is not re-derivable as a clone group.
- D9-affinity: not a wrong-home claim — no site is argued to belong elsewhere; the brand predicate already lives with the constructor.
- D2-deadness: both routes live — all 12 sites are in production modules reached by shipped paths (`translateOutbound` from query-render.ts:463, `projectForValidation` from the `invoke<T>` return gate and `#recoverDeclaredDefaults` per its own doc, `classifyWireNode` from three walks, `classifyScrutinee` from `summariseScrutinee`; the brand sites from the interpolation, receiver-gate, panic and render paths).
- Export-style exemption: not applicable (divergent-solutions).
- Prior filings: `grep -rln "instanceof String" quality/` → only quality/resolved/PTQ-0026-wire-walk-line-citations-drifted.md (a D10 line-citation drift); `grep -rn "isEnumValue" quality/intake quality/issues quality/resolved` → PTQ-1124 (interpolation `typeof` discriminator clone, resolved) and PTQ-1289 (D9 misplacement), neither about the two recognition routes. PTQ-1431 (D8, resolved) replaced `summariseScrutinee`'s rendering with `renderRuntimeValue` and left the `instanceof String` classification at match-result.ts:79 in place.
- Not a bug filing: with `makeEnumValue` the only `new String(` producer in src, the two routes agree on every value shipped today; the filing is the divergence and its stated maintenance cost, not a behaviour defect.
- Self-inconsistency: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. All three stated greps reproduce verbatim: isEnumValue( 8 hits (7 consumers + decl value.ts:489), instanceof String 5 hits (match-result:79, subagent-wire-form:71, wire-form-outbound:19/71/146), new String( 4 hits with value.ts:136 the only producer. Every cited excerpt matches at its lines, and clone-scan map shows no groups for value.ts or wire-form-outbound.ts. No intake/PTQ has this root cause: the sibling d1-01 qry18-two-translators filing is about the walkers, not the predicate. The cost is thin. 0020 exists and its :224 does show the two routes disagreeing, but there the brand route was the defective side and the shape route needed no hardening. The depth-walk header's "single-sourced" claim is scoped to its three walks (the filing concedes this). classifyWireNode's doc (subagent-wire-form.ts:42-44) says it keys on what JSON.stringify writes, which is a plausibly deliberate reason to test shape. So the remaining cost is a carrier change the code allows but has not made, and a human should rule on it (triage: claude-opus-5-5)
