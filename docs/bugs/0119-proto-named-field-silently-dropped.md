# Bug 0119 — A declared schema field literally named `__proto__` is silently dropped at construction: `obj[field.name] = value` reaches `Object.prototype`'s inherited `__proto__` accessor, so no own property is created and no diagnostic is emitted on any channel, while expressions.md §"Object construction" forces every in-language construction to write the field — the residual bug 0080 pinned green rather than fixed, because both candidate remedies change the prototype or the property descriptor of every object-schema runtime value

- **Status:** fixed (0.132.0). §Fix was filed unsettled; §Fix (0.132.0) below records
  the route adjudication, the scope adjudication, what shipped and the residuals. No ordering dependency on another open
  report — [0080](./0080-keys-values-construction-order-not-declaration-order.md)
  (**fixed 0.70.0**) already landed the single construction point
  `buildObjectSchemaValue` this fix edits, and
  [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) (**fixed
  0.33.0**) already moved the brand out of the string-key namespace. One
  coordination clause instead: cell F of `tests/ctor-declaration-order.test.ts`
  pins today's behaviour green and names itself the one cell to update against
  this report (`:679–718`).
- **Sev/Diff estimate:** S1/D3 — a declared field's evaluated value is discarded
  with zero diagnostics on any channel while the parse layer forces the field to
  be written and type-checks its value, so the presence rule has no runtime
  counterpart; D3 because the route, the DIAG-2 disposition and the scope over
  four adjacent same-idiom record-building sites are all adjudicated in-run, and
  the fix edits bug 0080's shared construction point under pinned-byte
  coordination against cell F and 0026's two brand-integrity cells.
- **Kind:** defect against `docs/spec_topics/expressions.md:209` and
  `docs/spec_topics/runtime-value-model.md:12`, plus a registry gap. `:209`
  requires every declared field to be present and registers
  `theta/parse/missing-object-field` for an omission; `:12` fixes an
  object-schema value as "JS plain object keyed by **theta-side names**". A
  schema declaring `__proto__` forces every in-language construction through the
  drop: the author must write the field to satisfy the presence rule (measured:
  omitting it is `error theta/parse/missing-object-field`), and writing it
  produces a value that does not carry it. The registry gap is the other half —
  no code is registered for the position, so a parse-time refusal route needs a
  DIAG-2 decision (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`). The
  field-name position's only case rule, `theta/parse/binding-case-mismatch`
  (`docs/spec_topics/diagnostics/code-registry-parse.md:19`), admits any name
  starting with a lowercase letter or `_`, so `__proto__` is admitted by rule,
  not by oversight.
- **Related:**
  - [0080](./0080-keys-values-construction-order-not-declaration-order.md) —
    **fixed (0.70.0)**, the parent. Its fix unified the two constructor
    evaluation sites into the single construction point `buildObjectSchemaValue`
    (`src/runtime/value.ts:385`) and **deliberately did not fix this**: residual
    (i) records the drop verbatim ("`obj[field.name] = value` reaches the
    inherited `__proto__` accessor, so no own property is created and no
    diagnostic is emitted"), states the deferral ground ("the remedies (a
    null-prototyped value, or `Object.defineProperty`) change the prototype or
    the descriptor of every object-schema runtime value, a blast radius outside
    this report's surface"), and pins the behaviour green in cell F. This report
    is that residual, measured at HEAD and widened to the sites the residual note
    does not name.
  - [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) — **fixed
    (0.33.0)**, the same shape one key over, and the nearest precedent for a fix.
    There the collision was with the interpreter's own brand: `brandSchemaValue`
    redefined the freshly assigned enumerable `__thetaSchema` field into the
    non-enumerable brand, so the field's value was replaced by the schema name
    and read back as `"F"` on two of four surfaces. Here the collision is with
    `Object.prototype`'s inherited `__proto__` accessor, which is not the
    interpreter's property and cannot be moved: 0026 was resolved by migrating
    `ENUM_TAG` / `SCHEMA_TAG` / `RESULT_TAG` from string keys to module
    `Symbol`s (`src/runtime/value.ts:263` is the surviving `SCHEMA_TAG`), which
    made the collision class disappear because the brand left the string-key
    namespace. No such move exists for `__proto__` — the name is JS's, in the
    same string-key namespace theta field names occupy, so every route in §Fix
    changes the record instead of the brand. The two also differ in outcome:
    0026 corrupted the value (reads answered the schema name, `has` said
    `true`, `keys()` said absent — four surfaces disagreeing), while this defect
    loses it consistently (measured: `has` `false`, both read spellings raise the
    registered `theta/runtime/missing-object-key` panic, `keys()` omits it).
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)**, the
    check that makes the loss sharper. Its per-field compatibility check records
    declared field types in a **null-prototype** record
    (`collectSchemaFields`, `src/parser/type-layer-checks.ts:464`, rationale at
    `:450–461`) precisely so a field named `__proto__` keeps its declared type,
    and `tests/ctor-field-type-check.test.ts` pins that: p3 (`:562`) a well-typed
    `__proto__` field loads clean, p4 (`:574`) a mistyped one reports
    `theta/parse/object-field-type-mismatch` attributed to `__proto__` like any
    other name. The parse layer therefore type-checks a value the runtime then
    discards.
  - [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
    **fixed (0.48.0)**, the hazard class. Its fix null-prototyped the `TypeEnv`
    (`collectTypeEnv`, `src/parser/type-layer-checks.ts:303`, rationale at
    `:290–301`, which names the `__proto__` write in terms) and added the
    own-key-guarded `resolveNamed` (`src/parser/type-compat.ts:104`,
    rationale `:92–103`). `src/extension/invoke-static-checks.ts:272–284` names
    the discipline "the 0031 / 0038 hazard class" and applies it to
    author-controlled callable names. The construction path in this report is the
    same input class — a record keyed by author-controlled strings — with neither
    defence applied.
- **Affected** (every citation verified at HEAD `bb5206a6`, 0.70.0):
  - `src/runtime/statement-executor.ts:659–676` — **defect site 1**, the
    executor's constructor arm. `const obj: Record<string, ThetaValue> = {}`
    (`:660`) is an ordinary plain object, and `obj[field.name] = evaluated.value`
    (`:666`) is an assignment, so a `field.name` of `__proto__` reaches the
    inherited accessor instead of creating an own property. The value is already
    evaluated at that point (`:662`), so the loss is of a computed value, not of
    an unevaluated expression.
  - `src/extension/production-theta-producer.ts:5809–5824` — **defect site 2**,
    `evaluatePureExpression`'s `case "object"`, the same two lines (`:5819`
    record, `:5821` assignment). This is the site an inline constructor inside a
    `${…}` interpolation reaches.
  - `src/runtime/value.ts:385–412` — `buildObjectSchemaValue`, bug 0080's single
    construction point and **defect site 3**. The drop does not originate here —
    both callers hand it a record from which the field is already absent — but
    the function *preserves* it and would *re-create* it if the callers were
    fixed alone. Its declared-fields arm builds a fresh plain object
    (`const ordered: Record<string, ThetaValue> = {}`, `:400`), skips a declared
    name the constructed record does not carry own-key-wise (`:402`, which is
    `false` for `__proto__`, so the field is treated exactly like a genuinely
    absent one), and writes each surviving field by assignment
    (`ordered[field.name] = …`, `:403`; the undeclared-name fallback at `:408`).
    Measured: handed a record that *does* carry an own enumerable `__proto__`
    data property, the function returns a record without it. Its own docstring
    states the current disposition and names it out of scope (`:378–383`: "A
    field literally named `__proto__` is never an own key of `constructedFields`
    — the inherited `__proto__` setter drops a non-object assignment before this
    function ever sees it, a pre-existing defect out of this fix's scope").
  - `src/runtime/value.ts:390–399` — the three arms that return before the
    rebuild: `typeName === null` (`:391`, a bare object literal), an unresolved
    constructor name (`:395`, bug 0025's passthrough), and a declaration whose
    `fields` is absent (`:398`, bug 0033's alias / `by … = …` / head-only shape).
    These return the caller's own record, so they neither drop nor rebuild —
    measured: an own `__proto__` key survives the `fields`-absent arm intact.
    Any route that fixes only the rebuild leaves these three arms on a different
    rule.
  - `src/runtime/value.ts:277–288` — `brandSchemaValue`, whose
    `Object.defineProperty(value, SCHEMA_TAG, …)` install is non-enumerable /
    non-writable / non-configurable, and `:263` — `SCHEMA_TAG`, a module
    `Symbol` since bug 0026's fix. `:398` and `:411` are its only two callers in
    `src/`, both inside `buildObjectSchemaValue`: the single-construction-point
    property bug 0080 established. `:300` — `schemaTagOf`, the recovery any fix
    must keep working.
  - **The read surfaces, all own-key-only — verified, and the list bug 0080's
    round-1 review recorded is accurate at HEAD with one spelling corrected**
    (the walk is `propertyIsEnumerable`, not "propertyyEnumerable"):
    `assertKeyPresent` (`src/runtime/runtime-panics.ts:221`, the
    `Object.prototype.hasOwnProperty.call` test at `:222`), shared by indexed
    access (`:300`) and member access (`:338`); `keys` / `values` / `has`
    (`src/runtime/stdlib-object.ts:115`, `:119`, `:124` — `Object.keys`,
    `Object.values`, and `hasOwnProperty.call`, gated by `OBJECT_MEMBERS` at
    `:103`); `valuesEqual`'s enumerable-own-key walk (`src/runtime/value.ts:494`,
    the `Object.prototype.propertyIsEnumerable.call` test at `:550`);
    `match-result.ts:214`'s `hasOwnProperty.call` guard in the object-pattern
    arm; the QRY-18 outbound `Object.entries` walk
    (`src/extension/production-theta-producer.ts:5730`, inside
    `translateInterpolationOutbound` `:5696`, entered from
    `stringifyInterpolation` `:5657` at `:5673`); and `JSON.stringify` at that
    same `:5673`. **Measured: a prototype change perturbs none of them** — a
    null-prototype record with a branded symbol answers identical
    `Object.keys` / `Object.values` / `Object.entries` / `JSON.stringify` /
    `hasOwnProperty.call` / `propertyIsEnumerable.call` / `schemaTagOf` results,
    and `valuesEqual` is `true` in both argument orders against a plain-prototype
    twin with the same own keys.
  - **The one measured perturbation is primitive coercion.** `String(record)`,
    `"x" + record` and a JS template embedding of the record all raise
    `TypeError: Cannot convert object to primitive value` on a null-prototype
    record where a plain record yields `[object Object]`. The theta `+` route is
    parse-closed: `let s = "x" + q` and `let n = 1 + q` over an object-valued `q`
    are both `error theta/parse/mixed-plus-operands` (measured), and
    `applyBinaryScalar` (`src/runtime/statement-executor.ts:882`, `:888`), the
    `expression-evaluator` twin (`src/runtime/expression-evaluator.ts:509`) and
    the pure host's arm (`src/extension/production-theta-producer.ts:6050`) are
    reached only past that gate. QRY-18 renders an object through
    `JSON.stringify`, never `String(…)`
    (`docs/spec_topics/query/query-escapes-stringification.md:27`). No other
    coercion site was enumerated, so a null-prototype route owes that sweep.
  - **Per-field `Object.defineProperty` does not change the descriptor**, which
    corrects the deferral note's second half. Measured: writing each field with
    `Object.defineProperty(rec, k, { value, enumerable: true, writable: true,
    configurable: true })` yields `{"value":…,"writable":true,"enumerable":true,
    "configurable":true}` — byte-identical to what assignment produces (bug
    0026's §Reproduction records the same descriptor for an assigned field) —
    keeps `Object.prototype`, keeps `String(record)` at `[object Object]`, and
    keeps `schemaTagOf`. The descriptor change bug 0080's residual names applies
    to `defineProperty`'s attribute *defaults* (all `false`), not to the route as
    such.
  - `src/runtime/statement-executor.ts:345–352` — **adjacent site, measured**:
    `preEvaluateToolArgs` (declared `:297`) builds the Pi-tool argument record
    with the same two lines (`args[field.name] = evaluated.value`, `:351`) and
    has no rebuild downstream, so its record is what the tool receives. Measured
    with a scalar value, the key is absent from the argument object; measured
    with an object value, the record's **prototype is replaced by the theta
    value** and the host receives an object for which `"i" in received` is
    `true`, at parse diagnostics `[]`. Pi-tool argument field names come from the
    tool's registered input schema
    (`docs/spec_topics/grammar.md:11`), and no parse rule rejects `__proto__`
    among them.
  - `src/extension/production-theta-producer.ts:3646–3649` — **adjacent site,
    unmeasured**: the pure host's Pi-tool argument lowering
    (`params[field.name] = evaluatePureExpression(…)`, `:3648`), the twin of the
    executor seam above (the guard at `:3626` states the mirroring).
  - `src/runtime/wire-translation.ts:129–175` — **adjacent site, measured at the
    seam**: `rebuildInbound` builds `const result: { [k: string]: ThetaValue } =
    {}` (`:158`) and writes `result[thetaKey] = …` (`:167`, `:171`). Measured
    through the exported `translateInbound` (`:118`): a `__proto__` key in
    AJV-shaped JSON is dropped, and an **object-valued** one becomes the rebuilt
    record's prototype — a model-supplied prototype. Production reach is not
    established: `grep -rn translateInbound src/` finds no importer outside that
    module (only `tests/wire-name-translation.test.ts` and
    `tests/enum-schema-tag-privacy.test.ts`), so this is a seam measurement, the
    same standing as bug 0080's residual (ii) probe.
    [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md)
    (**open**) owns this function's disposition — it is bug 0080's residual (ii),
    and its §Status records the same unwired finding — so whichever report lands
    first states the record-building idiom this one uses.
  - `src/runtime/wire-translation.ts:193–222` — **adjacent site, unmeasured**:
    `lowerOutbound`'s `result[wireKey] = …` (`:220`, record at `:217`), reached
    in production through `translateOutbound` (`:183`) ←
    `stringifyInterpolatedValue`'s object arm
    (`src/render/query-render.ts:396`, `:415–429`) ←
    `src/parser/system-interpolation.ts:480`, the frontmatter `system:` render.
  - `src/extension/production-theta-producer.ts:1671–1675` and `:1802–1806` —
    **adjacent sites, unmeasured**: the `system:`-render params record and the
    subagent `paramValues` marshalling record, both `record[name] = value` over
    `bindInput.paramBindings`, keyed by author-written `params:` field names,
    which the same `binding-case-mismatch` rule admits with a `_` lead.
  - **The wire-rename trigger — measured, and it needs no theta-side
    `__proto__`.** `schemas.md:21–48` admits an arbitrary wire name
    (`:30` "arbitrary JSON property names are fine", `:39` names the mechanism
    the only one for non-theta-identifier property names, `:43` requires only a
    non-empty string literal). Measured: `schema P { b as "__proto__": integer,
    a: string }` parses with zero diagnostics, the value carries both theta-side
    keys (`keys()` is `["b","a"]`), and the QRY-18 render sends `J{"a":"x"}` —
    the renamed field is absent from the wire JSON, dropped by
    `result[wireKey] = …` (`production-theta-producer.ts:5733`) rather than by
    the construction loops.
    [0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md) (**open**)
    owns that write's key *order* for the integer-like rename case; the two share
    the write and the wire-name space and are otherwise disjoint.
  - `docs/spec_topics/expressions.md:207` — the §"Object construction" heading;
    `:209` — the presence rule and its registered code, quoted in §Expected
    behaviour; `:118` / `:119` — the `object` stdlib table's `keys()` /
    `values()` order clauses (bug 0080's subject, and the surface the drop is
    read through); `:120` — `has(k)`'s "`false` for unknown keys (no panic)"
    contract.
  - `docs/spec_topics/grammar.md:44` — the same presence rule restated for the
    `NamedObjectLit` production ("Every declared field of the LHS schema … MUST
    be present. Omissions are `theta/parse/missing-object-field`").
  - `docs/spec_topics/runtime-value-model.md:12` — the value-representation
    table's object row: "JS plain object keyed by **theta-side names**,
    regardless of any wire-name renames declared on the schema".
  - `docs/spec_topics/query/query-escapes-stringification.md:16` — QRY-18;
    `:27` — the Schema-typed-object row ("`JSON.stringify` of the value,
    **compact** …, with wire-name translation applied recursively"), the sentence
    the rename measurement contradicts.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:45` — the
    `theta/parse/missing-object-field` row (*Trigger*: "Schema constructor omits
    a declared (required) field"; *Message* `missing field '<field>' on schema
    '<schema>'`); `:44` — `theta/parse/extra-object-field`; `:46` —
    `theta/parse/object-field-type-mismatch` (bug 0031's); `:19` —
    `theta/parse/binding-case-mismatch`, the field-name position's only case
    rule. No row in any registry page fires for a schema declaring a reserved
    field name.
  - `docs/spec_topics/diagnostics/code-registry-runtime.md:17` — the
    `theta/runtime/missing-object-key` row, the panic both read spellings of the
    dropped field raise (*Message* `missing object key: <key>`).
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a code addition or a trigger change is a spec change landing in
    the same commit); `:74` — DIAG-4 (the *Message* column is normative; a reword
    is deferred to theta 2.0). User-facing mirrors a DIAG-2 addition reaches:
    `docs/reference/diagnostics.md:91`, `docs/reference/grammar.md:387` and
    `:533`.
  - `tests/ctor-declaration-order.test.ts:679–718` — **cell F**, bug 0080's pin.
    Its comment states why it is pinned rather than fixed and names its own
    successor: "WHY PINNED RATHER THAN FIXED: `obj[field.name] = value` in both
    constructor arms invokes `Object.prototype`'s inherited `__proto__` SETTER,
    which ignores a non-object value — so the field never becomes an own key and
    no diagnostic is emitted. That drop is a pre-existing defect of the
    record-building idiom (the 0031/0038 null-prototype hazard class), reported
    separately from bug 0080 as a residual; this fix must neither worsen it nor
    corrupt the record while reordering. Reordering the assignments cannot change
    the outcome, so this cell is green on both sides. Should the implementer
    null-prototype the record, THIS cell is the one to update — against the
    residual report, not against bug 0080." The cell asserts three things:
    `[q.keys(), q.values()]` is `[["a"],["x"]]`, `Object.getPrototypeOf(record)
    === Object.prototype`, and `schemaTagOf(record)` is `"Q"`. The file header
    repeats the disposition at `:112–120` and carries row F's baseline at `:104`.
  - `tests/ctor-field-type-check.test.ts:311–324` — the prototype-collision
    fixtures (`P3` `:321–322`, `P4` `:323–324`) and the comment stating why they
    exist; `:562–572` (p3) and `:574–592` (p4) — the parse-layer pins described
    under §Related 0031.
  - **Test coverage of this defect: none as a defect.** The only cells that drive
    the input assert today's behaviour is preserved (cell F) or exercise the
    parse layer (p3 / p4). No test drives an object-valued `__proto__` field, the
    Pi-tool argument record, the inbound rebuild, or the `as "__proto__"` rename.
- **Observed at:** `0.70.0` (HEAD `bb5206a6`). Offline, deterministic; no live
  model, no provider. Scratch vitest under a gitignored directory with its own
  config: eleven end-to-end drives through the production composition (parse →
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`, with
  the `LiveSessionDouble` / `sendUserMessage`-capture harness
  `tests/ctor-declaration-order.test.ts` establishes), plus direct calls on
  `buildObjectSchemaValue`, `brandSchemaValue`, `valuesEqual` and
  `translateInbound`. Written, run, deleted; `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Summary

Both constructor evaluation sites build the field record by assignment into a
plain object: `const obj: Record<string, ThetaValue> = {}` then
`obj[field.name] = evaluated.value`
(`src/runtime/statement-executor.ts:660`, `:666`;
`src/extension/production-theta-producer.ts:5819`, `:5821`). `__proto__` is not
an ordinary string key on a plain object — it is an accessor inherited from
`Object.prototype` — so the assignment invokes that setter. For a non-object
value the setter is a no-op; for an object value it replaces the record's
prototype. Either way no own property named `__proto__` is created, and no
diagnostic is emitted at parse or at runtime.

Bug 0080's fix routed both sites through one construction point,
`buildObjectSchemaValue` (`src/runtime/value.ts:385`), which rebuilds the record
in declaration order and brands it. The drop survives that unification twice
over. It reaches the function already complete: the own-key guard at `:402` is
`false` for `__proto__`, so the declared field is skipped exactly as a genuinely
absent field would be, which is what the docstring at `:378–383` records. And it
is re-created by the rebuild: `ordered` is a plain object (`:400`) and
`ordered[field.name] = …` (`:403`) is the same assignment, so a record that
*does* carry an own `__proto__` key loses it here — measured. Fixing the two
callers without the rebuild changes nothing.

What makes this a defect rather than a curiosity is the spec's presence rule.
`docs/spec_topics/expressions.md:209` requires every declared field of the schema
to be present and registers `theta/parse/missing-object-field` for an omission,
which is enforced against the source (measured: omitting `__proto__` is
`error theta/parse/missing-object-field :: missing field '__proto__' on schema
'Q'`). A schema declaring `__proto__` therefore forces every in-language
construction through the drop — the author must write the field, and writing it
yields a value without it. Bug 0031's per-field type check compounds the
asymmetry: it records the declared type in a null-prototype record specifically
so a `__proto__` field keeps its type, and `tests/ctor-field-type-check.test.ts`
p3/p4 pin that the value *is* type-checked. The parse layer checks a value the
runtime then discards.

This is the same shape bug 0026 had for `__thetaSchema`, with one difference that
decides the fix. 0026's field collided with the interpreter's own brand, and was
resolved by moving the brand — `SCHEMA_TAG` became a module `Symbol`
(`src/runtime/value.ts:263`), so the collision class disappeared without either
constructor host changing. `__proto__` belongs to `Object.prototype`, in the same
string-key namespace theta field names occupy, and cannot be moved: every route
below changes the record. The outcomes differ too. 0026 corrupted the value (four
read surfaces disagreeing, reads answering the schema name); here the loss is
consistent — `has("__proto__")` is `false`, both read spellings raise the
registered `theta/runtime/missing-object-key` panic, and `keys()` omits the key.
Consistency is what makes it silent: nothing observes that the record is short.

The blast radius that deferred the fix is measurable, and smaller than the
deferral note states. Every read surface the corpus names is own-key-only, and a
null-prototype record perturbs none of them, equality included. The measured
perturbation is primitive coercion, whose theta route is parse-closed by
`theta/parse/mixed-plus-operands`. Per-field `Object.defineProperty` with all
three attributes `true` reproduces an assignment's descriptor exactly. What the
fix does have to decide is scope: the same one-line idiom builds the Pi-tool
argument record (where an object-valued `__proto__` sends a host tool an object
whose prototype is a theta value — measured), the inbound rebuild record (where
the prototype would be model-supplied — measured at the seam), the `system:` and
subagent params records, and the outbound wire-name record, where a spec-admitted
rename `b as "__proto__"` drops a field from the model's JSON with no theta-side
`__proto__` anywhere in the schema — measured.

## Reproduction

Offline, at `bb5206a6`. Scratch vitest; drives run through the production
composition and read the body's final value plus the text handed to
`pi.sendUserMessage`. `parse diagnostics` is the whole `doc.diagnostics` array,
unfiltered, at every severity.

### The measurement — the declared field is gone, with no diagnostic

```theta
---
mode: prompt
---
schema Q { __proto__: integer, a: string }
let q = Q { a: "x", __proto__: 7 }
[q.keys(), q.values()]
```

```
@@ P1  [q.keys(), q.values()]
   parse diagnostics :: []
   outcome :: success
   value :: [["a"],["x"]]
@@ P2  the record itself (tail expression `q`)
   parse diagnostics :: []
   value :: {"a":"x"}
   own keys :: ["a"]
   prototype is Object.prototype :: true
   schemaTagOf :: "Q"
   own __proto__ descriptor :: undefined
```

The brand is intact and the record is an ordinary plain object. One declared
field's evaluated value is discarded.

### The read surfaces agree the field is absent

```
@@ P3a q.has("__proto__")   → false
@@ P3b q["__proto__"]       → THREW MissingObjectKeyPanic: missing object key: __proto__
@@ P3c q.__proto__          → THREW MissingObjectKeyPanic: missing object key: __proto__
```

All three are the registered dispositions for an absent key
(`code-registry-runtime.md:17`; `expressions.md:120` for `has`). This is the
contrast with bug 0026, where the same three surfaces disagreed and two returned
the schema name.

### The presence rule forces the write

```
@@ P4  the field OMITTED: `let q = Q { a: "x" }`
   parse diagnostics :: ["error theta/parse/missing-object-field :: missing field '__proto__' on schema 'Q'"]
```

There is no way to construct a `Q` in-language that carries the field, and no way
to construct one that omits it.

### The wire sees the short record

```
@@ P5  @`J${q}`
   parse diagnostics :: []
   sent :: ["J{\"a\":\"x\"}"]
```

### Two values differing only in the dropped field are equal

```
@@ P8  let q = Q { a: "x", __proto__: 7 } / let r = Q { a: "x", __proto__: 9 } / q == r
   value :: true
@@ P10 valuesEqual(ctorValue, JSON.parse('{"__proto__":7,"a":"x"}'))
   ctor value :: {"a":"x"}                own keys ["a"]
   twin       :: {"__proto__":7,"a":"x"}  own keys ["__proto__","a"]
   valuesEqual(a,b) :: false
   valuesEqual(b,a) :: false
```

`JSON.parse` mints an own `__proto__` key, so a value of the same schema arriving
as JSON carries the field and never compares equal to a constructor-built one —
the provenance-twin inequality bug 0026 recorded, with the arms swapped (there
the wire value was the complete one too).

### `buildObjectSchemaValue` re-drops an own `__proto__` key

Direct calls, with the input built by `Object.defineProperty` so the field is a
genuine own enumerable data property — the record the two callers cannot produce
today:

```
@@ P11  declared-fields arm, decl.fields = [{name:"__proto__"},{name:"a"}]
   input own keys :: ["__proto__","a"]   input hasOwn __proto__ :: true
   returned :: {"a":"x"}                 returned own keys :: ["a"]
   returned hasOwn __proto__ :: false    returned identical to input :: false
   schemaTagOf :: "Q"
@@ P11b fields-absent arm (bug 0033's alias / `by … = …` / head-only shape)
   returned :: {"__proto__":7,"a":"x"}   returned own keys :: ["__proto__","a"]
   returned hasOwn __proto__ :: true     returned identical to input :: true
```

The rebuild is a second drop point; the three early-return arms are not, because
they do not write. A fix confined to the two callers is a no-op for the arm that
rebuilds, and a fix confined to the rebuild leaves the other three arms on a
different rule.

### An object-valued field replaces a prototype

```
@@ P11c upstream record: obj["__proto__"] = { i: 1 }, then obj["a"] = "x"
   upstream own keys :: ["a"]
   upstream prototype is Object.prototype :: false
   upstream prototype is the inner value :: true
   upstream inherits i :: true
   rebuilt own keys :: ["a"]
   rebuilt prototype is Object.prototype :: true
```

Through a constructor the mutation is contained by accident: the rebuild discards
the mutated record, so the theta value is prototype-clean (confirmed end to end —
`schema Inner { i: integer }` / `schema Q2 { __proto__: Inner, a: string }` /
`Q2 { a: "x", __proto__: Inner { i: 1 } }` parses `[]`, answers
`[["a"],["x"]]`, keeps `Object.prototype`, brands `"Q2"`, and `q.i` raises
`missing object key: i`). The Pi-tool argument record has no rebuild:

```
@@ P12 grep({ a: "x", __proto__: Inner { i: 1 } })
   parse diagnostics :: []
   drive :: success
   tool received :: {"a":"x"}          own keys :: ["a"]
   tool received prototype is Object.prototype :: false
   tool received prototype :: {"i":1}
   "i" in received :: true
   JSON.stringify(received) :: "{\"a\":\"x\"}"
@@ P9  grep({ a: "x", __proto__: 7 })   [scalar control]
   parse diagnostics :: []
   tool received :: {"a":"x"}          own keys :: ["a"]
```

### The inbound rebuild, at the seam

```
@@ P13  translateInbound over {"__proto__":7,"a":"x"}
   raw JSON.parse own keys :: ["__proto__","a"]
   rebuilt :: {"a":"x"}   rebuilt own keys :: ["a"]
   rebuilt prototype is Object.prototype :: true
@@ P13b translateInbound over {"__proto__":{"i":1},"a":"x"}
   rebuilt :: {"a":"x"}   rebuilt own keys :: ["a"]
   rebuilt prototype is Object.prototype :: false
   rebuilt prototype :: {"i":1}
   "i" in rebuilt :: true
```

`translateInbound` has no importer in `src/` outside its own module at this HEAD,
so this is a seam measurement.

### A spec-admitted wire rename drops a field with no theta-side `__proto__`

```
@@ P19  schema P { b as "__proto__": integer, a: string } / let p = P { b: 1, a: "x" }
   parse diagnostics :: []
   @`J${p}`  sent :: ["J{\"a\":\"x\"}"]
   [p.keys(), p.values()] :: [["b","a"],[1,"x"]]
```

The theta-side value is complete and correctly ordered; the wire JSON is missing
`b`. `schemas.md:30` admits arbitrary wire names by rule, and
`query-escapes-stringification.md:27` requires the render to be `JSON.stringify`
of the value with wire-name translation applied.

### What a prototype or descriptor change would perturb

```
@@ P15  null-prototype record, own `__proto__` data property, brandSchemaValue applied
   own keys :: ["a","b","__proto__"]
   JSON.stringify :: {"a":"x","b":1,"__proto__":7}
   Object.entries :: [["a","x"],["b",1],["__proto__",7]]
   hasOwnProperty.call(o,"__proto__") :: true
   propertyIsEnumerable.call(o,"a") :: true
   schemaTagOf :: "Q"
   own symbol count :: 1; descriptor enumerable :: false
   String(o) THREW :: TypeError: Cannot convert object to primitive value
   "x" + o  THREW :: TypeError: Cannot convert object to primitive value
   plain control: "x" + plainObj :: x[object Object]
   structuredClone keys :: ["a","b","__proto__"]
@@ P17  valuesEqual across a prototype difference, identical own keys
   valuesEqual(a,b) :: true      valuesEqual(b,a) :: true
@@ P18  parse dispositions for object-valued `+` operands
   'let s = "x" + q' :: ["error theta/parse/mixed-plus-operands :: '+' has mixed operand types: string and Q"]
   'let n = 1 + q'   :: ["error theta/parse/mixed-plus-operands :: '+' has mixed operand types: integer and Q"]
@@ P16  per-field defineProperty({value, enumerable:true, writable:true, configurable:true})
   own keys :: ["__proto__","a"]
   JSON.stringify :: {"__proto__":7,"a":"x"}
   prototype is Object.prototype :: true
   descriptor of __proto__ :: {"value":7,"writable":true,"enumerable":true,"configurable":true}
   descriptor of a :: {"value":"x","writable":true,"enumerable":true,"configurable":true}
   String(o) :: [object Object]
   schemaTagOf :: "Q"
```

## Expected behaviour

`docs/spec_topics/expressions.md:209`, §"Object construction":

> Schema-typed values are constructed with `Schema { field: expr, ... }`. Every
> declared field of the schema must be present (omissions are
> `theta/parse/missing-object-field`); extra fields are
> `theta/parse/extra-object-field`; field order is irrelevant.

`docs/spec_topics/grammar.md:44` restates it for the `NamedObjectLit`
production, and `docs/spec_topics/runtime-value-model.md:12` fixes what the
constructed value is: "JS plain object keyed by **theta-side names**, regardless
of any wire-name renames declared on the schema".

Read together: a constructor that parses clean with every declared field written
produces a value whose theta-side keys are exactly the declared names. Concretely
for the measured input, `Q { a: "x", __proto__: 7 }` constructs
`{"__proto__":7,"a":"x"}` — the declaration order bug 0080 pinned, both keys
present, brand intact — and `q.keys()` is `["__proto__","a"]`.

Two further clauses are in scope and currently unsatisfied:

- `docs/spec_topics/expressions.md:118–119` fix `keys()` to the theta-side field
  names in declaration order and `values()` to the same order. A declared name
  absent from `keys()` is outside what those rows admit; there is no clause under
  which a declared field is legitimately missing from a constructed value.
- `docs/spec_topics/query/query-escapes-stringification.md:27` fixes the QRY-18
  object render as `JSON.stringify` of the value with wire-name translation
  applied recursively, and `docs/spec_topics/schemas.md:30`/`:39`/`:43` admit an
  arbitrary wire-name string. A field renamed `as "__proto__"` must therefore
  appear in the rendered JSON under that wire name.

What the corpus does **not** state is any disposition for a schema that declares
the name. No registry page carries a reserved-field-name row, and
`code-registry-parse.md:19`'s case rule admits a `_`-leading identifier in a
field-name position. So the *behaviour* is decided by `:209` and `:12` — the
field must survive — while a *refusal* route would need text and a code that do
not exist. That asymmetry is what §Fix has to resolve, and it is why route (c)
below is a DIAG-2 decision rather than an implementation choice.

## Actual behaviour / root cause

**A plain object is not a bare key space.** `Object.prototype.__proto__` is an
accessor property, so on any object inheriting from `Object.prototype` the
assignment `obj["__proto__"] = v` invokes a setter instead of defining an own
property. The setter ignores a non-object `v` and replaces the receiver's
prototype for an object `v`. Both constructor field loops
(`statement-executor.ts:666`, `production-theta-producer.ts:5821`) and every
adjacent record builder listed in §Affected use that assignment. The declared
field's value is already evaluated when it is lost.

**The single construction point preserves the loss and re-creates it.**
`buildObjectSchemaValue` reads `constructedFields` through
`Object.prototype.hasOwnProperty.call` (`value.ts:402`) — the guard bug 0080
added so a declared name the constructor omitted is never filled in from
`Object.prototype`. For `__proto__` that guard is `false`, so the declared field
is skipped as absent, which is exactly what the function's docstring states
(`:378–383`). The rebuild then writes surviving fields with
`ordered[field.name] = …` into a plain `ordered` (`:400`, `:403`, `:408`), so the
field would be dropped a second time if it arrived: measured, a record carrying an
own enumerable `__proto__` returns without it. The three early-return arms
(`:391`, `:395`, `:398`) do not write and preserve whatever they are handed —
measured, an own `__proto__` key survives the `fields`-absent arm. One behaviour
therefore has four different implementations inside one function.

**No channel carries the loss.** Parse: zero diagnostics of any severity for the
declaration and for the constructor (measured), because the field name passes
`binding-case-mismatch`, the presence check finds the written field in the
*source*, and bug 0031's type check finds it in a null-prototype record. Runtime:
the record is a well-formed `Record<string, ThetaValue>` of the same type whether
or not the field landed, and no caller carries an expected key count, so no
post-condition exists. The presence guarantee is parse-phase only, exactly as bug
0026 recorded for its own case: "`theta/parse/missing-object-field` is
parse-phase-only, so nothing observes the runtime loss".

**The loss is consistent, which is why it is silent.** Every theta read surface
is own-key-only — `assertKeyPresent` (`runtime-panics.ts:222`), `keys` / `values`
/ `has` (`stdlib-object.ts:115`, `:119`, `:124`), `valuesEqual`'s
`propertyIsEnumerable` walk (`value.ts:550`), `match-result.ts:214`'s guard, the
QRY-18 `Object.entries` walk (`production-theta-producer.ts:5730`) and
`JSON.stringify` (`:5673`). All six agree the field is absent, so the value is
indistinguishable from a value of a schema that never declared it. Bug 0026's
defect announced itself through four disagreeing surfaces; this one announces
nothing.

**The object-valued arm is a prototype write, not a drop, and its containment is
incidental.** Through a constructor, bug 0080's fresh-record rebuild discards the
mutated record, so the theta value keeps `Object.prototype` (measured, both
through the rebuild in isolation and end to end). No code states that as an
intent — the rebuild exists for key order — so it is a property a later change to
the ordering arm can remove. At the Pi-tool argument seam
(`statement-executor.ts:345–352`) there is no rebuild, and the host receives an
object whose prototype is a theta value (measured). At the inbound seam
(`wire-translation.ts:158–172`) the prototype would be model-supplied (measured
at the seam). Every theta-side read is own-key-guarded, so the mutation is not
theta-observable; what it changes is the JS-level identity of a record crossing a
boundary the interpreter does not own.

**The deferral ground is partly overstated, measured.** Bug 0080's residual (i)
gives the blast radius as "the prototype or the descriptor of every object-schema
runtime value". The prototype half holds as a statement of what changes, but not
of what it perturbs: none of the six read surfaces, and not equality, changes
behaviour on a null-prototype record (measured, including a branded one whose
single own symbol stays non-enumerable and `schemaTagOf`-recoverable). The
descriptor half does not hold for the `defineProperty` route as such: writing
`{ value, enumerable: true, writable: true, configurable: true }` reproduces an
assignment's descriptor byte for byte (measured). The genuine costs are
different: a null-prototype record raises `TypeError` where a plain record
coerces to `[object Object]` (theta's `+` route is parse-closed by
`theta/parse/mixed-plus-operands`, and no other coercion site was enumerated),
and per-field `defineProperty` replaces every field assignment on the
construction path with a call.

## Why it matters

- **A declared field's value is discarded with no diagnostic on any channel.**
  Measured: parse diagnostics `[]`, `keys()` short, the value absent from
  `JSON.stringify`, from the QRY-18 render, and from every in-language read. The
  spec's presence rule has no runtime counterpart to catch the loss.
- **The presence rule forces the input class.** A schema declaring `__proto__`
  cannot be constructed carrying the field and cannot be constructed without
  writing it (`theta/parse/missing-object-field`, measured). Every in-language
  construction of such a schema goes through the drop; there is no conforming
  spelling.
- **The parse layer checks what the runtime discards.** Bug 0031's check records
  the field's declared type in a null-prototype record for this exact name and
  reports a mismatch against it (`tests/ctor-field-type-check.test.ts` p3/p4).
  An author sees the field validated, then not delivered.
- **Provenance splits the value.** A `Q` arriving as JSON carries `__proto__` as
  an own key (`JSON.parse` mints one — measured), so a wire-provenance value and
  a constructor-built value of one schema never compare equal, in either argument
  order. Two constructor-built values differing only in that field do compare
  equal.
- **A wire rename reaches the same drop without any theta-side `__proto__`.**
  `schema P { b as "__proto__": integer, a: string }` parses clean and renders
  `J{"a":"x"}` (measured), so the model is shown an object missing a field the
  schema declares — under a rename mechanism `schemas.md:39` describes as the
  only way to express non-theta-identifier property names, with `"$ref"` and
  `"@type"` as its own examples. For a typed query the lowered schema still marks
  the field required and the object closed, so the model is asked for a field the
  render never showed it — the inversion bug 0026 recorded for `__thetaSchema`.
- **An object-valued field writes a prototype across a host boundary.** A Pi tool
  receives an argument object whose prototype is a theta value, and the inbound
  seam would give a rebuilt record a model-supplied prototype (both measured).
  Theta-side reads are own-key-guarded throughout, so nothing in the language
  observes it; the host does.
- **The corpus already applies the remedy one layer up.** `collectTypeEnv`
  (`type-layer-checks.ts:303`) and `collectSchemaFields` (`:464`) are
  null-prototyped, and `resolveNamed` (`type-compat.ts:104`) is own-key-guarded,
  each with a docstring naming the `__proto__` write as the reason
  (`:290–301`, `:450–461`, `:92–103`). `invoke-static-checks.ts:272–284` calls it
  "the 0031 / 0038 hazard class". The runtime construction path is the same input
  class with neither defence.
- **Nothing in the suite scores it as a defect.** Cell F asserts the drop
  persists; p3/p4 cover the parse layer. No test drives the object-valued field,
  the tool-argument record, the inbound rebuild, or the rename.

## Non-goals

- **Key order.** Which order `keys()` / `values()` / the outbound JSON report is
  bug 0080's subject, settled and fixed (0.70.0). This report changes what the
  record *contains*, and any route must leave the declaration-order contract and
  the anonymous-object insertion-order carve-out intact.
- **The `__thetaSchema` collision.** Closed by bug 0026's Symbol migration. This
  report must not reopen it: the brand stays a non-enumerable own symbol
  (`value.ts:263`, `:277–288`) and `schemaTagOf` (`:300`) keeps recovering it.
- **The read surfaces.** All six are own-key-only and conformant for an absent
  key — `has` answers `false` per `expressions.md:120`, and both read spellings
  raise the registered `theta/runtime/missing-object-key`
  (`code-registry-runtime.md:17`). The panic is the consequence of the drop, not
  a second defect, and its text and route are untouched here.
- **Equality.** Order- and prototype-insensitive by spec and in implementation
  (`valuesEqual`, `value.ts:494`; measured `true` both ways across a prototype
  difference). The provenance-twin inequality in §Reproduction is a symptom of
  the missing key, not of the relation.
- **Bug 0080's residual (ii)** — that `rebuildInbound` reconstructs in the
  model's key order and leaves the value unbranded, filed as
  [0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md). This
  report measures a different property of the same function (which keys survive
  at all) and does not adjudicate order or branding there.
- **Bug 0080's residual (iii)** — integer-like wire names re-keying the outbound
  record, filed as
  [0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md). Adjacent:
  the same write (`production-theta-producer.ts:5733`) and the same unconstrained
  wire-name space (`schemas.md:43`). It asks whether that record's key *order* is
  guaranteed at all; this report asks whether a declared field survives into it.
  Neither answer settles the other.
- **Whether `__proto__` is a plausible field name.** It is not, and this report
  does not claim otherwise; the reachability argument is in §Why it matters and
  rests on the forced input class, the wire-rename trigger, and the two host
  boundaries — not on the likelihood of the spelling.

## Fix

**Not settled.** Four routes, none decided here. Each is stated with the
consequences measured at this HEAD, so the adjudication chooses between known
costs rather than between guesses.

**(a) Null-prototype the constructed record.** `Object.create(null)` at the two
constructor field loops (`statement-executor.ts:660`,
`production-theta-producer.ts:5819`) and at `buildObjectSchemaValue`'s `ordered`
(`value.ts:400`). This is the remedy the corpus already applies to records keyed
by author-controlled strings (`type-layer-checks.ts:303`, `:464`) and the one
cell F names ("Should the implementer null-prototype the record, THIS cell is the
one to update"). Measured consequences: every own-key read surface is unperturbed
(keys / values / entries, `JSON.stringify`, `hasOwnProperty.call`,
`propertyIsEnumerable.call`, the symbol brand and `schemaTagOf`, `valuesEqual` in
both argument orders); the field becomes an ordinary own enumerable key and
appears in `keys()` and in the render. Cost: `String(record)` and `"x" + record`
raise `TypeError` instead of yielding `[object Object]`. The theta `+` route is
parse-closed (`theta/parse/mixed-plus-operands`, measured), and QRY-18 renders
objects through `JSON.stringify`, so this route owes an enumeration of every
remaining site that could coerce a theta object value — host-side included —
before it can claim the perturbation is unreachable. Second cost: three of the
four arms of `buildObjectSchemaValue` return a record built elsewhere
(`value.ts:391`, `:395`, `:398`), so either every builder that can reach those
arms is null-prototyped too or the four arms disagree.

**(b) Per-field `Object.defineProperty`.** Replace the assignment at the same
three write sites with
`Object.defineProperty(rec, name, { value, enumerable: true, writable: true,
configurable: true })`. Measured: the descriptor is byte-identical to an
assignment's, the prototype stays `Object.prototype`, `String(record)` keeps
working, `schemaTagOf` keeps working, and `__proto__` becomes an own key. This
route has no measured perturbation of any surface — which corrects the deferral
note's descriptor claim, and makes the choice between (a) and (b) turn on cost,
not on blast radius. Its costs: every field write becomes a `defineProperty` call
on the construction path, and the two write sites inside
`buildObjectSchemaValue` (`:403`, `:408`) must both change or the rebuild
re-drops (measured). It also leaves `__proto__` as an own key on a record that
still inherits from `Object.prototype`, so any *later* plain assignment to that
key on the same record still hits the accessor: the discipline is per-write, not
per-record, and every adjacent site in scope has to adopt it.

**(c) Refuse at parse: a schema declaring a reserved field name.** This is a
DIAG-2 decision, not an implementation choice. No code is registered for the
position: `code-registry-parse.md:19`'s `binding-case-mismatch` admits any
`_`-leading identifier in a field-name position, and no reserved-field-name row
exists in any registry page. A route here mints a code, which under DIAG-2
(`diagnostic-shape.md:72`) lands its row in the same commit, with the
`docs/reference/` mirrors (`docs/reference/diagnostics.md:91` neighbourhood, and
`docs/reference/grammar.md:387` / `:533`, which carry the object-construction
code list). It also has to state its own extent: the theta-side field name only,
or wire names too (`as "__proto__"` parses clean today and drops the field from
the render — measured), or `params:` field names, or Pi-tool argument keys. And it
refuses input the current spec admits: `:209` requires the field to be present,
not absent, so this route needs the §Expected behaviour reading changed as well
as extended — which is route (d)'s work.

**(d) Reserve the name in the spec.** Amend `expressions.md` §"Object
construction" (`:207–209`) so a declared field name is drawn from a set
excluding the JS prototype-accessor spelling, with `docs/spec_topics/grammar.md:44`
and the `docs/reference/` mirrors following in the same commit. Cheapest in code
and it matches the implementation, but it removes a name the field-name grammar
currently admits, and on its own it leaves the wire-rename case (whose name space
`schemas.md:43` deliberately leaves open), the Pi-tool argument record and the
inbound rebuild untouched. Taken alone it converts a silent loss into a
documented prohibition without closing any of the three boundaries where the
prototype write happens.

**Constraints on every route.**

1. **Bug 0080's single construction point stays single.**
   `buildObjectSchemaValue` (`value.ts:385`) remains the one place a
   schema-constructor value is ordered and branded, and `brandSchemaValue`'s only
   production callers remain its two branded arms (`:398`, `:411`). No ordering
   or branding decision returns to either call site.
2. **Bug 0026's `__thetaSchema` shape stays intact.** A declared field named
   `__thetaSchema` keeps taking its declared position as ordinary enumerable data
   and the record keeps recovering its schema — the two cells of
   `tests/ctor-declaration-order.test.ts` bug 0080 added for it stay green
   unedited.
3. **The brand stays a non-enumerable own symbol recoverable by `schemaTagOf`.**
   `value.ts:263`, `:277–288`, `:300`. Measured to hold under (a) — a
   null-prototype record carries exactly one own symbol whose descriptor is
   non-enumerable — and trivially under (b).
4. **Key set and key count are unchanged for ordinary fields.** Bug 0080's own
   §Fix constraint. The only difference any route may make is that a declared
   `__proto__` field becomes present; no other name is invented, dropped or
   duplicated.
5. **The four write paths inside and around the construction point move
   together.** `value.ts:403` and `:408` are both drops (measured); `:391`,
   `:395` and `:398` return records built by callers. A route that changes a
   subset leaves one behaviour with several implementations, which is the
   condition bug 0080's unification removed.
6. **DIAG-2 and DIAG-4.** A new code or a widened *Trigger* is a spec change
   landing in the same commit (`diagnostic-shape.md:72`) with the
   `docs/reference/` mirrors updated; no existing *Message* may be reworded
   (`:74`). Routes (a) and (b) need neither — they make the implementation
   conform to `expressions.md:209` and `runtime-value-model.md:12` as written.
7. **Scope over the adjacent sites is stated, not left implicit.** The same
   one-line idiom builds the executor and pure-host Pi-tool argument records
   (`statement-executor.ts:351`, `production-theta-producer.ts:3648`), the
   inbound rebuild record (`wire-translation.ts:167`, `:171`), the outbound
   wire-name records (`production-theta-producer.ts:5733`,
   `wire-translation.ts:220`) and the two params records
   (`production-theta-producer.ts:1674`, `:1805`). Two of these are measured to
   carry a prototype write across a boundary the interpreter does not own. A fix
   states which it covers and why the rest are out of scope.
8. **Cell F is the coordination point.** `tests/ctor-declaration-order.test.ts:679–718`
   asserts the drop, the `Object.prototype` identity and the brand, and its
   comment directs its own update to this report. Its three assertions are the
   three bytes to re-pin; the file header's row-F baseline (`:104`, `:112–120`)
   is re-derived in the same edit. Bug 0080's other fifteen cells stay
   byte-identical.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one production-composition drive or one direct call, so the harness is
`tests/ctor-declaration-order.test.ts` extended, not a new mechanism. Required:
the measurement and its parse-clean admission; the omission control
(`theta/parse/missing-object-field`); the three read surfaces; the QRY-18 render;
both equality rows including the wire-provenance twin; the unit rows over
`buildObjectSchemaValue` for all four arms, including a record carrying an own
`__proto__` key (the second drop point, which reds if only the callers are
fixed); the object-valued row at the constructor and at the Pi-tool argument
seam, asserting the record's prototype identity; the rename row's rendered bytes;
and the sibling-name controls (`constructor` / `toString`, already row F2) so a
route that special-cases one name does not regress the general own-key guard.
Every asserted diagnostic message sourced from the registry's *Message* column
per DIAG-4, as that file already does through its `assertRegistered` oracle.

## Provenance

- Origin: the bug 0080 fix (0.70.0, commit `a03d22d6`), residual (i), which
  states the drop, the deferral and the blast radius in terms and pins the
  behaviour green in cell F. This report is that residual, and adds what the
  residual note does not state: the measured parse and value observations at
  HEAD with the read-surface triple; the omission control that establishes the
  forced input class; the second drop point inside `buildObjectSchemaValue` and
  the four-way disagreement among its arms; the object-valued sub-case and its
  incidental containment; the Pi-tool argument and inbound-seam measurements; the
  spec-admitted `as "__proto__"` rename that reaches the same loss with no
  theta-side `__proto__`; the correction that no read surface is perturbed by a
  prototype change and that per-field `defineProperty` leaves the descriptor
  unchanged; and the four routes with their constraints.
- Spec: `docs/spec_topics/expressions.md:207` (§"Object construction"), `:209`
  (the presence rule — the anchor), `:118–119` (the `keys()` / `values()` order
  clauses), `:120` (`has(k)`); `docs/spec_topics/grammar.md:11` (the Pi-tool
  argument's field names), `:44` (the presence rule restated);
  `docs/spec_topics/runtime-value-model.md:12` (the object row);
  `docs/spec_topics/schemas.md:21–48` (wire-name renaming; `:30`, `:39`, `:43`);
  `docs/spec_topics/query/query-escapes-stringification.md:16` (QRY-18), `:27`
  (the Schema-typed-object row);
  `docs/spec_topics/diagnostics/code-registry-parse.md:19`, `:44`, `:45`, `:46`;
  `docs/spec_topics/diagnostics/code-registry-runtime.md:17`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4). User-facing mirrors: `docs/reference/diagnostics.md:91`,
  `docs/reference/grammar.md:387`, `:533`.
- Implementation evidence at `bb5206a6`: `src/runtime/value.ts:263`
  (`SCHEMA_TAG`), `:277–288` (`brandSchemaValue`), `:300` (`schemaTagOf`),
  `:378–383` (the docstring stating the current disposition), `:385–412`
  (**`buildObjectSchemaValue`**: arms at `:390–399`, the own-key guard at `:402`,
  the two writes at `:403` / `:408`, the brand at `:411`), `:494` / `:550`
  (`valuesEqual` and its `propertyIsEnumerable` walk);
  `src/runtime/statement-executor.ts:297` / `:345–352` (`preEvaluateToolArgs`),
  `:659–676` (**construction site 1**, assignment `:666`, call `:674`), `:882` /
  `:888` (`applyBinaryScalar`);
  `src/extension/production-theta-producer.ts:1671–1675` / `:1802–1806` (the two
  params records), `:3626` / `:3646–3649` (the pure-host tool-argument
  lowering), `:5657` (`stringifyInterpolation`), `:5673` (the `JSON.stringify`
  of the outbound walk), `:5696–5735` (`translateInterpolationOutbound`, the
  `Object.entries` walk at `:5730`, the wire-name write at `:5733`),
  `:5809–5824` (**construction site 2**, assignment `:5821`, call `:5823`),
  `:6050` (the pure host's `+`);
  `src/runtime/stdlib-object.ts:103` / `:105` / `:115` / `:119` / `:124`;
  `src/runtime/runtime-panics.ts:221–226` (`assertKeyPresent`), `:300`, `:338`;
  `src/runtime/match-result.ts:214`; `src/runtime/expression-evaluator.ts:509`;
  `src/runtime/wire-translation.ts:118` (`translateInbound`), `:129–175`
  (`rebuildInbound`, record `:158`, writes `:167` / `:171`), `:183`
  (`translateOutbound`), `:193–222` (`lowerOutbound`, write `:220`);
  `src/render/query-render.ts:396` / `:415–429`
  (`stringifyInterpolatedValue`'s object arm);
  `src/parser/system-interpolation.ts:480`;
  `src/parser/type-layer-checks.ts:290–301` / `:303` (`collectTypeEnv`),
  `:450–461` / `:464` (`collectSchemaFields`);
  `src/parser/type-compat.ts:92–103` / `:104` (`resolveNamed`);
  `src/extension/invoke-static-checks.ts:272–284` (the hazard-class comment).
- Test evidence at `bb5206a6`: `tests/ctor-declaration-order.test.ts:679–718`
  (cell F, its three assertions and the comment quoted in §Affected), `:104` and
  `:112–120` (the row-F baseline and the header's disposition);
  `tests/ctor-field-type-check.test.ts:311–324` (the prototype-collision
  fixtures), `:562–572` (p3), `:574–592` (p4);
  `tests/wire-name-translation.test.ts` and
  `tests/enum-schema-tag-privacy.test.ts:486–502` (the only importers of
  `translateInbound`, which is how its production reach was checked).
- Reproduction: one scratch vitest directory at `bb5206a6` under a gitignored
  path with its own config — eleven production-composition drives (the
  measurement, the record, the three read surfaces, the omission control, the
  QRY-18 render, the object-valued constructor and its three read rows, the
  equality pair, the Pi-tool argument rows, the rename rows) plus direct calls on
  `buildObjectSchemaValue` (four arms, including the own-`__proto__`-key input),
  `brandSchemaValue`, `valuesEqual` and `translateInbound`, and the
  prototype/descriptor perturbation rows. Run on the outputs quoted above, then
  deleted. No file in the tree was written by the probe. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

## Fix (0.132.0)

**Route adjudication (§Fix was filed unsettled).** Route **(b)**, per-field
`Object.defineProperty`, over routes (a), (c) and (d). Grounds, all from this
document: §Reproduction P16 measures route (b)'s descriptor as byte-identical to
an assignment's, so no descriptor, prototype or brand observable moves and cell F's
prototype-identity and `schemaTagOf` assertions stay green unedited; route (a)
(`Object.create(null)`) would contradict `runtime-value-model.md:12`'s "JS plain
object" representation, perturbs primitive coercion (P15), and §Fix makes an
open-ended coercion-site sweep a precondition of taking it; route (a) would also
split `buildObjectSchemaValue`'s four arms, three of which return a caller-built
record, which is the condition §Fix constraint 5 forbids. Routes (c) and (d) are
refused by §Expected behaviour: the behaviour is decided by `expressions.md:209`
and `runtime-value-model.md:12` — the field must survive — and a refusal route
would need spec text and a registry code that do not exist. DIAG-2 is therefore
**not engaged**: no code minted, no *Trigger* widened, no spec page and no
`docs/reference/` mirror edited (§Fix constraint 6).

**Scope adjudication.** Six write sites, all converted, verified by symbol at the
fix commit (this document's `bb5206a6` line anchors had drifted): the executor
constructor arm (`statement-executor.ts:667`) and its `preEvaluateToolArgs`
Pi-tool argument record (`:352`); the pure host's inline-constructor arm
(`production-theta-producer.ts:6284`) and its `lowerToolCallParams` twin
(`:4016`); `buildObjectSchemaValue`'s two rebuild writes (`value.ts:403`, `:408`);
and the QRY-18 outbound wire-name write in `translateInterpolationOutbound`
(`production-theta-producer.ts:6195`). The last is a scope extension adjudicated
in-run against §Expected behaviour's second in-scope-and-unsatisfied clause
(`query-escapes-stringification.md:27` with `schemas.md:30`/`:39`/`:43`: a field
renamed `as "__proto__"` must appear in the rendered JSON under that wire name)
and against §Non-goals' deconfliction from
[0121](./0121-integer-like-wire-rename-escapes-order-guarantee.md), which owns
that write's key *order* and not field survival; `Object.defineProperty` leaves
integer-like own-key ordering exactly where assignment does, and the full suite
reds nothing pre-existing with that site converted. §Affected's disposition for
`src/runtime/wire-translation.ts` is stale: that module's three record builders
are already `Object.create(null)` (`:370`, `:601`, `:666`) from bug 0173
(**fixed 0.96.0**), and
[0120](./0120-inbound-rebuild-ignores-declaration-order-and-brand.md) is **fixed
(0.97.0)**, so neither the inbound rebuild nor the outbound lowering needed work.

- What shipped:
  - `src/runtime/value.ts` — new exported `defineRecordField(record, name, value)`
    at the module tail, so no pre-existing line in the module moves: one
    `Object.defineProperty` with all three attributes `true`, the 0031/0038
    hazard-class remedy applied at the runtime record-building sites. Both
    `buildObjectSchemaValue` rebuild writes (`:403`, `:408`) define instead of
    assign, satisfying §Fix constraint 5's "move together"; the docstring sentence
    naming the drop a pre-existing out-of-scope defect is replaced by the settled
    disposition at the same line count.
  - `src/runtime/statement-executor.ts` — the constructor arm (`:667`) and the
    Pi-tool argument record (`:352`) define instead of assign.
  - `src/extension/production-theta-producer.ts` — the pure host's
    inline-constructor arm (`:6284`), its Pi-tool argument lowering (`:4016`) and
    the QRY-18 outbound wire-name write (`:6195`, with a WHY comment in the
    vocabulary of `schemas.md:43` and `query-escapes-stringification.md:27`)
    define instead of assign.
  - `tests/ctor-proto-named-field.test.ts` — new, 26 cells: the §Witness matrix
    (measurement, admission, descriptor / key set / prototype / brand, the whole
    read path, the QRY-18 render, both equality rows, all four
    `buildObjectSchemaValue` arms including both drop points, the object-valued
    row, both Pi-tool argument seams, the wire-rename row, the sibling-name
    controls, and the DIAG-4 registry-sourced omission control).
  - `tests/ctor-declaration-order.test.ts` — cell F re-pinned (the one
    pre-authorized existing-test edit, §Fix constraint 8): its ordering assertion
    flipped to `[["__proto__","a"],[7,"x"]]`, while its prototype-identity and
    `schemaTagOf` assertions stay green unedited as the route's non-extent; the
    header row-F baseline and disposition block are re-derived. Bug 0080's other
    fifteen cells are byte-identical.
  - `tests/live/live-production-acceptance.test.ts` — one appended H8a cell
    (CELL-B2) driving both construction sites' `__proto__` field through the
    QRY-18 render into the outbound turn text.
- Gates: witness `npx vitest run tests/ctor-proto-named-field.test.ts
  tests/ctor-declaration-order.test.ts` → `Test Files 2 passed (2) / Tests 42
  passed (42)`; before the fix the same pair was `16 failed | 23 passed`. Full
  default suite `npm test` → `Test Files 329 passed (329) / Tests 6067 passed
  (6067)`. `npm run typecheck` → clean. `npm run lint` → clean. Live H8a
  `tests/live/live-production-acceptance.test.ts` → `64 passed (64)` (baseline 63
  cells plus CELL-B2). Live H9a `tests/live/acceptance/` → `11 passed (11)` across
  two files, matching baseline.
- Review: 2 rounds. Round 1 (deep) — FINDINGS ×5: three of the six write sites had
  no witness able to red (`:6284`, `:4016`, `value.ts:408`); four wrong `path:line`
  citations and four false present-tense comment claims; the witness header's
  out-of-scope statement misattributed ownership (0120/0173 above); two banned-word
  occurrences (`STYLE.md:22`); plus one deferred `correctness` finding, recorded as
  residual 2. Round 2 (fast) — CLEAN, no findings, no `recommend-deep-review`.
- Verification: SOLID. (i) The witness reds — per-site neutralisation re-derived
  independently of the fixer's matrix, every site carrying at least one cell that
  reds naming the short-key symptom (`:352` → I1, I2; `:667` → 13 cells and cell F;
  `value.ts:403` → 7 cells; `:408` → G5; `:4016` → I3; `:6195` → D, K, L; `:6284` →
  L), every restore blob-verified identical. (ii) The full default suite is green,
  run twice. (iii) Live coverage: CELL-B2 red-proven both directions under the live
  lock — green, then `:6195`/`:6284` neutralised gives
  `SITE1=J{"a":"x"}|SITE2=J{"a":"x"}` against the expected
  `SITE1=J{"__proto__":7,"a":"x"}|SITE2=J{"__proto__":7,"a":"x"}`, then restored
  blob-verified and green again — followed by the whole H8a file and both H9a files
  green. (iv) Typecheck and lint clean, re-run after the live cell landed.
- Residuals:
  1. **The two `params:` records** — `production-theta-producer.ts:1866` (the
     `system:`-render params record) and `:1988` (the subagent `paramValues`
     marshalling record) still assign. Both are keyed by author-written `params:`
     field names, which `code-registry-parse.md:19`'s case rule admits with a `_`
     lead. Unmeasured at filing and unmeasured here; no report owns them (verified:
     `grep -rn "params\[name\] = value\|paramValues\[name\] = value"
     docs/bugs/*.md` is empty). §Fix constraint 7 requires the scope be stated;
     this is the stated remainder.
  2. **Three further same-idiom siblings over author-controlled key spaces**, found
     by the round-1 reviewer's sweep and named by no report:
     `src/extension/respond-tool-wire.ts:308`/`:312` — the guard is a
     prototype-chain `in` rather than an own-key test and the write is an
     assignment, so a `__proto__` key that is not an own key passes the guard
     through the inherited accessor and the assignment **replaces the record's
     prototype** (probed by the reviewer: own keys `['a']`, prototype replaced
     `true`); `src/parser/body-type-lowering.ts:132` and `src/parser/params.ts:216`
     — `properties[field.name] = <lowered type node>` over an object value, so a
     `__proto__`-named field's schema node becomes the lowered properties table's
     prototype and is absent from the emitted JSON schema. Out of this fix's
     adjudicated scope: a different surface, no witness, and widening again would
     be unbounded.
  3. **`value.ts:408`'s arm is unreachable from theta source** — an own key absent
     from the declaration is `theta/parse/extra-object-field`. Cell G5 pins it as a
     direct unit row because the function is exported and its two writes must obey
     one rule; no source-level witness exists or is claimed.
  4. **Comment-citation drift (the known 0134 class, deliberately not chased).**
     This fix adds one import line to each of `statement-executor.ts` and
     `production-theta-producer.ts` and a six-line comment at
     `production-theta-producer.ts:6185`, so roughly a hundred pre-existing
     `path:line` citations in unrelated test comments drift by one to seven lines.
     Chasing them would edit protected witness files for comment-only reasons; the
     complete shifted set was enumerated by a scratch sweep, which was deleted, and
     left alone. Every citation inside this fix's own diff was verified against the
     current tree.
- Discharge note (bug 0210, fixed 0.136.0): residuals 1 and 2 above are
  discharged. 0210 measured all five sites at `78a6560c` and converted them in
  one change — both `params:` records in `spawnSubagentConversation`,
  `coerceNode`'s `in` guard and write in `src/runtime/respond-tool-wire.ts` (the
  module residual 2 cites under `src/extension/`), and the three schema-lowering
  `properties` writes in `lowerObjectFields`, `parseParams` and
  `hoistInlineObjectType` — all through this fix's exported `defineRecordField`,
  with no second idiom. 0210 §Fix (0.136.0) carries the route adjudication for the
  lowering sites, whose records are JSON-Schema documents rather than runtime
  values, and its residuals record what its own landing newly exposed. Residual
  4's comment-citation-drift class recurs there and is again not chased.
- Discharge notes appended: none.
- Pinned dispositions / non-goals: bug 0080's single construction point stays
  single and its declaration-order contract is unchanged (constraints 1, 4); bug
  0026's `__thetaSchema` shape and the non-enumerable own-symbol brand recovered by
  `schemaTagOf` are untouched (constraints 2, 3); the read surfaces' dispositions
  for a key that genuinely is absent (`has` → `false`, and
  `theta/runtime/missing-object-key` on both read spellings) are unchanged; bug
  0121's question — whether the outbound record's key *order* is guaranteed for
  integer-like wire names — is untouched and unadjudicated here.
