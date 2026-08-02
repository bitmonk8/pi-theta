# Bug 0080 — `keys()` / `values()` on a named-schema value return the constructor's field order, not the schema's declaration order, and the same key order reaches the model through the QRY-18 outbound JSON

- **Status:** open.
- **Kind:** defect. expressions.md's stdlib table fixes `keys()` order as
  "schema declaration order for named schemas"; both constructor sites build
  the JS object by walking the constructor's field list, so the order an author
  wrote at the *call* site — which the same page declares irrelevant — is what
  every consumer observes.
- **Related:**
  - [0026](../../../docs/bugs/0026-ctor-field-named-thetaschema-destroyed-by-brand.md)
    (fixed 0.33.0) and
    [0025](../../../docs/bugs/0025-ctor-unresolved-schema-name-passthrough.md)
    (fixed 0.37.0) both change the same two constructor evaluation sites; this
    report changes the *order* those sites insert keys in, and is independent
    of the brand install and the name resolution both fixed.
  - [0031](../../../docs/bugs/0031-ctor-field-value-typing-unchecked.md) (fixed
    0.43.0) added a per-field type check over the same field list. The
    declaration order needed here is the same lookup that check already
    resolves (the declaring schema's field array), so the two touch adjacent
    code without conflicting.
  - [0027](../../../docs/bugs/0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
    (fixed 0.39.0) owns *which receivers* reach `evaluateObjectMember`; this
    report is about what `evaluateObjectMember` returns for a legitimate
    object receiver.
- **Affected** (citations verified at HEAD `d06daae3`):
  - `evaluateObjectMember` (`src/runtime/stdlib-object.ts:111`) — `case "keys"`
    returns `Object.keys(receiver)` (`:115`) and `case "values"` returns
    `Object.values(receiver)` (`:119`). Both are the object's own insertion
    order, with no reference to any schema declaration.
  - The module header (`:1–48`) states the intended contract and the
    assumption that makes it wrong: "`keys()` returns the theta-side field
    names as an `array<string>`, in schema declaration order for named schemas
    and insertion order otherwise (**at runtime both reduce to the object's own
    key order, established at construction time**)". The construction-time key
    order is the constructor literal's order, not the declaration's.
  - The two construction sites that establish it:
    `src/runtime/statement-executor.ts:660–663` (`const obj: Record<string,
    ThetaValue> = {}` then `for (const field of expr.fields) { … obj[field.name]
    = … }`) and `src/extension/production-theta-producer.ts:5723–5726` (the same
    loop in `evaluatePureExpression`). `expr.fields` is the parsed
    `ObjectExpr.fields` array (`src/parser/theta-document.ts:230`) — source
    order at the call site.
  - `brandSchemaValue` (`src/runtime/value.ts`) attaches the declaring-schema
    name non-enumerably at both sites, so the schema *is* recoverable at
    construction; nothing reorders the keys.
  - The same key order is what `translateInterpolationOutbound`
    (`src/extension/production-theta-producer.ts:5606`) walks —
    `for (const [thetaKey, fieldValue] of Object.entries(value))` (`:5637`) —
    so the compact JSON QRY-18 sends to the model carries the constructor's
    order.
- **Observed at:** 0.52.0 (`d06daae3`), offline, through the production
  composition drive (`createProductionProducerDeps` → `bindPromptConversation`
  → `executeBody`), with `keys()` / `values()` read off the theta's final value
  and the rendered turn captured at `pi.sendUserMessage`.

## Summary

`schema P { b: integer, a: string }` declares `b` before `a`. Constructing it
as `P { a: "x", b: 1 }` — a field order expressions.md explicitly permits
("field order is irrelevant") — yields `p.keys() == ["a", "b"]` and
`p.values() == ["x", 1]`, and interpolating `p` into a query renders
`{"a":"x","b":1}`. The spec pins all three to declaration order.

## Reproduction

Offline, through the production composition.

```theta
---
mode: prompt
---
schema P { b: integer, a: string }
let p = P { a: "x", b: 1 }
let k = p.keys()
let v = p.values()
[k, v]
```

Observed final value: `[["a","b"], ["x",1]]`.
Expected per expressions.md:118–119: `[["b","a"], [1,"x"]]`.

Control (same file, constructor written in declaration order
`P { b: 1, a: "x" }`): `p.keys()` is `["b","a"]` — correct. The result tracks
the constructor, not the schema.

QRY-18 half, same harness, capturing the rendered user turn:

```theta
---
mode: prompt
---
schema P { b: integer, a: string }
let p = P { a: "x", b: 1 }
@`J${p}`
```

Observed: `J{"a":"x","b":1}`. Declaration order would render `J{"b":1,"a":"x"}`.

Nested values behave the same — the inner constructor's order wins:

```theta
schema Inner { i: integer, j: integer }
schema Outer { o: Inner }
let v = Outer { o: Inner { j: 2, i: 1 } }
@`J${v}`
```

Observed: `J{"o":{"j":2,"i":1}}`.

Probe: throwaway vitest reusing the conformance drive harness; deleted after
the run.

## Expected behaviour

- `docs/spec_topics/expressions.md:118` — `keys()`: "Theta-side field names,
  **in schema declaration order for named schemas**; insertion order
  otherwise".
- `:119` — `values()`: "Field values in the same order as `keys()`".
- `docs/reference/grammar.md:416` mirrors it: "declaration order for named
  schemas); `values(): array<T>` (union of field types,…".
- The two clauses are only distinguishable when the two orders differ, and
  expressions.md §"Object construction" is what makes them differ: "Every
  declared field of the schema must be present …; **field order is
  irrelevant**". An author is told the constructor's order carries no meaning
  while it silently determines every downstream order.
- `docs/spec_topics/runtime-value-model.md`, object row: an object-schema value
  is "a JS plain object keyed by theta-side names" — it says nothing about
  order, so expressions.md:118 is the sole authority.

## Actual behaviour / root cause

Both constructor evaluation sites build a fresh `{}` and assign fields in
`expr.fields` order (`statement-executor.ts:660–663`,
`production-theta-producer.ts:5723–5726`). JS object key order for string
(non-integer-like) keys is insertion order, so the schema's declaration order
is never consulted. `evaluateObjectMember`'s `keys` / `values` arms
(`stdlib-object.ts:115`, `:119`) return `Object.keys` / `Object.values`
verbatim, and the QRY-18 outbound walk iterates `Object.entries` (`:5637`).

The declaring schema is available at both construction sites — each already
calls `env.resolveSchema(expr.typeName)` on the very next line to decide
whether to brand — so the ordering information needed is in hand and unused.

## Why it matters

1. `keys()` and `values()` are the only object iteration surface theta 1.0
   exposes (there is no `for … in obj`), and control-flow.md points authors at
   `obj.keys()` as *the* way to walk an object. A `for k in p.keys()` loop
   therefore visits fields in an order the author cannot predict from the
   schema, and `p.keys()` zipped against `p.values()` by index is order-
   correlated but not declaration-correlated.
2. The wire JSON the model sees carries the same order. Field order is a real
   prompt-engineering input (the model reads the object left to right), and it
   now varies with an incidental detail of the constructor's source text that
   the spec told the author was irrelevant.
3. Two thetas constructing the same schema with the fields written in different
   orders produce values that are `==` (equality ignores key order —
   `valuesEqual` compares key sets) but render as different bytes. Any consumer
   hashing or diffing the rendered form sees spurious differences.
4. It is a silent divergence: no diagnostic, no panic, and the two orders
   coincide whenever the author happens to write the constructor in
   declaration order — which is why the existing suite does not catch it.

## Non-goals

- Not about anonymous / bare object values, where "insertion order otherwise"
  is what the implementation already does correctly.
- Not about `has(k)`, which was probed at this HEAD and is conformant (own keys
  only, `false` for an unknown key, `false` for `toString`).
- Not about the inbound (model → theta) rebuild path, which was not probed
  offline here; a fix should check whether that path already reconstructs in
  schema order, since the two paths must agree.
- Not about equality, which is order-insensitive by spec and is implemented
  order-insensitively (`valuesEqual`, `src/runtime/value.ts`).

## Fix

Options.

1. **Order at construction.** At both constructor sites, when
   `env.resolveSchema(expr.typeName)` resolves, assign fields in the declared
   schema's field order (falling back to `expr.fields` order for names the
   schema does not declare — an already-rejected case, so the fallback is
   defensive). One extra loop each; every downstream consumer (`keys()`,
   `values()`, `Object.entries` in the outbound walk, `JSON.stringify`) then
   sees declaration order with no further change. Cost: the two sites must not
   drift — the same lockstep obligation bug 0027 records for the four read
   entry points.
2. **Order at read.** Leave construction alone and have
   `evaluateObjectMember`'s `keys` / `values` arms consult the value's
   `schemaTagOf` brand and sort by the declared order. Narrower blast radius,
   but it does not fix the QRY-18 JSON order (a third site would need the same
   treatment), and it makes `keys()` disagree with `JSON.stringify` of the same
   value.
3. **Amend the spec** to say "construction order for every object value",
   deleting the named-schema clause. Cheapest, and it matches the current
   implementation — but it removes a determinism guarantee authors can
   currently rely on from reading the schema, and it contradicts
   `docs/reference/grammar.md:416` as well, so it is a two-page GOV-30 edit.

Recommendation: option 1. It is the only one that makes all three observable
orders (`keys()`, `values()`, outbound JSON) agree with the declaration, and it
puts the ordering decision at the single point where the declaring schema is
already resolved.

Constraint any fix must satisfy: the brand install (`brandSchemaValue`) must
still target a value whose *string* keys are exactly the declared theta-side
names, so bug 0026's `__thetaSchema`-named-field case stays intact; reordering
must not drop or duplicate a key.

## Provenance

- Spec: `docs/spec_topics/expressions.md:118–119` (stdlib `object` table),
  `:210` (§"Object construction", field order irrelevant);
  `docs/spec_topics/runtime-value-model.md` (object row);
  `docs/reference/grammar.md:416`;
  `docs/spec_topics/query/query-escapes-stringification.md:27` (QRY-18 object
  row).
- Implementation: `src/runtime/stdlib-object.ts:1–48`, `:111–127`;
  `src/runtime/statement-executor.ts:656–675`;
  `src/extension/production-theta-producer.ts:5716–5735`, `:5606–5645`;
  `src/parser/theta-document.ts:227–231`.
- Existing reports read in full for duplicate separation: 0025, 0026, 0027,
  0031, 0032.
- Observations: throwaway vitest probe over the production composition drive at
  `d06daae3`, deleted after the run.
