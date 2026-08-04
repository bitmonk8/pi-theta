# Bug 0080 — `keys()` / `values()` on a named-schema value return the constructor's field order, not the schema's declaration order, and the same key order reaches the model through the QRY-18 outbound JSON

- **Status:** fixed (0.70.0).
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

## Fix (0.70.0)

The settled §Fix, route **option 1 ("Order at construction")**. Options 2
("order at read" — sorting in `evaluateObjectMember`'s `keys` / `values` arms
off the `schemaTagOf` brand) and 3 ("amend the spec to construction order")
were rejected: option 2 leaves the QRY-18 JSON order wrong and makes `keys()`
disagree with `JSON.stringify` of the same value, and option 3 removes a
determinism guarantee and contradicts `docs/reference/grammar.md` as well.
Citations below name symbols, not lines.

**What shipped.**

- `src/runtime/value.ts` — `buildObjectSchemaValue`, the **single**
  construction point for every object / schema-constructor runtime value: it
  resolves the declaring schema, reorders the already-evaluated field record
  into declaration order, and brands. Beside it `SchemaFieldOrder`, a
  structural view of a declaration's object-form field list, so this leaf
  module resolves a schema without importing `SchemaDecl` from
  `src/parser/theta-document.ts` — no second module cycle beside the reviewed
  `type-layer-checks.ts` ↔ `theta-document.ts` edge bug 0079 landed. Four
  arms: a `null` type name and an unresolved type name both return the
  constructed record unchanged and unbranded (the second is bug 0025's
  passthrough); a declaration whose `fields` is absent (bug 0033's alias /
  `by … = …` / head-only shape) is branded as-is; a declaration with `fields`
  yields a fresh record carrying every declared name **present** in the
  constructed record, in declared order, then every remaining constructed key
  in its existing relative order, then branded. Every read of the constructed
  record by an author-written field name is own-key-guarded
  (`Object.prototype.hasOwnProperty.call`), never truthiness — a declared
  field the constructor omitted must not be filled from `Object.prototype`,
  and a schema declaring `toString` is the live case.
- `src/runtime/statement-executor.ts` — `evalExpr`'s
  `if (expr.kind === "object")` arm delegates to it. The field-evaluation loop
  is unchanged: values still evaluate left-to-right through `await evalExpr`
  and a non-`value` flow still short-circuits verbatim.
- `src/extension/production-theta-producer.ts` —
  `evaluatePureExpression`'s `case "object"` delegates to the same function.

**The two sites are UNIFIED, not kept in parallel.** No ordering or branding
decision remains at either call site, and `brandSchemaValue`'s only production
callers are now the two branded arms inside `buildObjectSchemaValue`. The
witness pins both sites regardless, and the neutralisations prove the pin:
breaking site 1 alone reds eight cells and leaves cell L green; breaking site 2
alone reds **cell L alone**. Cell L is the only cell reaching
`evaluatePureExpression`'s `case "object"`, through `stringifyInterpolation`.

**No spec, registry or `permitted-codes.json` edit.** The fix makes the
implementation conform to prose already shipped: `docs/spec_topics/expressions.md`'s
stdlib `object` table (`keys()` "in schema declaration order for named
schemas", `values()` "in the same order as `keys()`") and §"Object
construction" ("field order is irrelevant"), mirrored at
`docs/reference/grammar.md`, with
`docs/spec_topics/query/query-escapes-stringification.md`'s QRY-18 object row
carrying the same order to the wire. No new diagnostic code, no DIAG-2 row, no
trigger widening. `src/runtime/stdlib-object.ts`,
`translateInterpolationOutbound` and `valuesEqual` are untouched — the
record's own key order is what all three already report.

**Re-derived pre-fix baseline** (HEAD `a410f727` / 0.69.0, offline, through the
production composition drive, rendered turn captured at
`pi.sendUserMessage`). Every §Reproduction observation reproduces
byte-identically — zero drift across seventeen releases:

| Source | Observed pre-fix | Post-fix |
| --- | --- | --- |
| `schema P { b: integer, a: string }` / `let p = P { a: "x", b: 1 }` / `[p.keys(), p.values()]` | `[["a","b"],["x",1]]` | `[["b","a"],[1,"x"]]` |
| the same, constructor written in declaration order (control) | `[["b","a"],[1,"x"]]` | unchanged |
| the same out-of-order constructor, `` @`J${p}` `` | `J{"a":"x","b":1}` | `J{"b":1,"a":"x"}` |
| `` @`J${P { a: "x", b: 1 }}` `` (constructor INLINE in the interpolation) | `J{"a":"x","b":1}` | `J{"b":1,"a":"x"}` |
| `schema Inner { i: integer, j: integer }` / `Outer { o: Inner { j: 2, i: 1 } }` | `J{"o":{"j":2,"i":1}}` | `J{"o":{"i":1,"j":2}}` |
| `schema P { b as "B": integer, a: string }`, out-of-order constructor | `J{"a":"x","B":1}` | `J{"B":1,"a":"x"}` |
| `schema S { __thetaSchema: string, z: integer }` / `S { z: 1, __thetaSchema: "mine" }` | `[["z","__thetaSchema"],[1,"mine"]]` | `[["__thetaSchema","z"],["mine",1]]` |
| `schema R { constructor: integer, toString: string }` / `R { toString: "x", constructor: 7 }` | `[["toString","constructor"],["x",7],true]` | `[["constructor","toString"],[7,"x"],true]` |
| `schema Q { __proto__: integer, a: string }` / `Q { a: "x", __proto__: 7 }` | parses `[]`; `[["a"],["x"]]` | unchanged — residual (i) |
| an extra constructor field | `theta/parse/extra-object-field` | unchanged |
| an unresolved constructor schema name | `theta/parse/unresolved-named-type` | unchanged |

The last two rows are why the undeclared-name fallback is defensive: neither
shape can be written in a theta that loads.

**The inbound (model → theta) rebuild path — §Non-goals' directed check,
answered: NO.** `rebuildInbound` (`src/runtime/wire-translation.ts`) builds its
record by walking `Object.entries` of the AJV-validated model JSON, so a typed
query's result carries the **model's** key order, and it installs no
`brandSchemaValue` brand. Probed at this HEAD through `translateInbound`: with
a schema declaring `b` then `a` and the model answering `{"a":"x","b":1}`, the
rebuilt value's keys are `["a","b"]`; with both fields renamed (`b as "B"`,
`a as "A"`) and the model answering `{"A":"x","B":1}`, still `["a","b"]`.
Fixing it is a **separate surface**, deliberately not widened into:
`SchemaSidecar` (`src/parser/schema-lowering.ts`) carries only *renamed* fields
— `buildSidecar` emits an entry iff `wireName !== thetaName`, so the
no-rename case emits `wireNames: []` — hence it carries no field order at all
and a fix needs the sidecar's shape extended. Residual (ii).

**Offline lock.** `tests/ctor-declaration-order.test.ts` (16 cells): nine
primaries red-first over the table above, plus controls for the
declaration-order constructor, the two parse rejections, order-insensitive
equality driven through theta (`valuesEqual` untouched), the bare
Pi-tool-argument object keeping SOURCE order and carrying no brand
(`preEvaluateToolArgs` — the anonymous-object non-goal), and the read seam
mirroring the record verbatim. Two cells discharge the brand-integrity
constraint: the `__thetaSchema`-named field reorders like any other field, and
the reordered record still recovers its declaring schema through `schemaTagOf`
with exactly one own symbol whose descriptor is non-enumerable, at unchanged
key set and key count. One cell pins the `__proto__` residual: the field stays
dropped, the record's prototype stays `Object.prototype`, and the brand
survives.

**Live lock.** `tests/live/live-production-acceptance.test.ts` gained one
additive H8a cell (100 insertions, 0 deletions) driving BOTH construction sites
through one real model turn: `` @`SITE1=J${p}|SITE2=J${P { a: "x", b: 1 }}|END …` ``
must send exactly `SITE1=J{"b":1,"a":"x"}|SITE2=J{"b":1,"a":"x"}|END …`. It
asserts the deterministic `turn.userTexts` channel and an empty fail-closed
`turn.systemNotes` set, never `assistantText` and never `prompt()` merely
resolving, beside a positive registration control.

**Gates.** Witness 16/16 (pre-fix 9 failed / 7 passed). Default suite
**262 files / 3796 tests passed** (pre-fix 261 / 3780).
`npx tsc -p tsconfig.json --noEmit` clean. `npm run lint` clean. Live H8a
`tests/live/live-production-acceptance.test.ts` **14/14** on a real model run,
including the new cell. H9a `tests/live/acceptance/` deliberately not run:
option 1 touches only expression evaluation and reaches no discovery /
registration / load-diagnostic surface, so `tests/fixtures/h7a/permitted-codes.json`
needs and gets no change.

**Review.** Two rounds, both clean. Round 1 (deep) cleared fidelity to option
1, the unification, brand integrity, the own-key guards, the `__proto__`
behaviour identity, ordering stability, and the "theta field names are never
integer-like" claim against the real lexer grammar (schema-declaration field
names are `ident` / `keyword` tokens; constructor names are `ident` or a
`string` token whose text retains its quotes), and proved the red path itself
in a detached worktree of HEAD. Round 2 (fast) cleared the additive live cell
against the live-suite conventions and re-derived its expected bytes three
independent ways.

**Verification.** SOLID. Four neutralise / restore cycles, each a targeted byte
edit restored byte-exact with the blob hash verified: the shared function's
reorder removed reds all nine primaries with the pre-fix signatures; site 1
alone reverted reds eight and leaves cell L green; site 2 alone reverted reds
cell L alone; the live cell reds with the reorder removed and greens on
restore.

**Residuals.**

(i) A declared field literally named `__proto__` is silently dropped, at both
construction sites and unchanged by this fix: `obj[field.name] = value` reaches
the inherited `__proto__` accessor, so no own property is created and no
diagnostic is emitted. Probed: `schema Q { __proto__: integer, a: string }` /
`let q = Q { a: "x", __proto__: 7 }` parses with `[]` diagnostics and answers
`keys() == ["a"]`. Deliberately not fixed here — the remedies (a
null-prototyped value, or `Object.defineProperty`) change the prototype or the
descriptor of every object-schema runtime value, a blast radius outside this
report's surface. Pinned green in `tests/ctor-declaration-order.test.ts`.

(ii) The inbound rebuild path does not agree with the outbound one, per the
probe above: `rebuildInbound` reconstructs in the model's JSON key order and
leaves the value unbranded, so `keys()` on a typed-query result is
model-ordered and a later interpolation of that value resolves no declaring
schema. `SchemaSidecar` carries no field order, so a fix needs its shape
extended — a separate surface.

(iii) A wire rename may be integer-like (`b as "B"` is ordinary; `b as "0"` is
not rejected), and the outbound walk re-keys a fresh record by wire names,
where `JSON.stringify` fronts an integer-like key regardless of insertion
order. Untouched here, and outside expressions.md's order clause, which governs
`keys()` / `values()` over theta-side names.

(iv) §Related's claim that bug 0031 "added a per-field type check over the same
field list" whose lookup this fix could reuse is **wrong**: that check lives in
the parse / type layer (`collectSchemaFields` / `checkObjectFieldCompat`,
`src/parser/type-layer-checks.ts`) over a null-prototyped
`Record<string, CompatType>` that discards order, not at the runtime
construction sites. There was no shared lookup to reuse; the runtime sites
resolve `env.resolveSchema` independently, exactly as they already did to
decide branding. 0031's check is untouched.

**Discharge notes appended** to bugs 0025 (its unresolved-schema-name
passthrough is now an arm of the shared construction point), 0026 (the brand
install now targets a freshly reordered record, and its
`__thetaSchema`-named-field case is pinned by two cells here), 0027 (its
lockstep discipline over four READ entry points is now applied to the two WRITE
sites, and the key order `evaluateObjectMember` reports is established at
construction) and 0031 (residual (iv) above).

**Pinned dispositions.** Equality stays order-insensitive by spec
(`valuesEqual` compares key sets) — two values of one schema written in
opposite field orders are `==` and now also render identically. Anonymous /
bare object values keep insertion order; expressions.md fixes that as the
"otherwise" clause, not a defect. `has(k)` was probed conformant and is
untouched.

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
