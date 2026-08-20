# Bug 0210 — Five record-write sites bug 0119's fix left outside its six-site scope still let an author-controlled key reach the prototype slot or a prototype-chain read forge a guard: the two `params:` records drop a `__proto__`-named param so a subagent child's system prompt renders `[object Object]` and its marshalled params arrive `{}`, the three schema-lowering `properties` writes make the field's own schema node the properties table's prototype so AJV refuses to compile a parse-clean document, and the respond wire's `in`-guarded assignment fabricates a function-valued own key the model never sent

- **Status:** open
- **Sev/Diff estimate:** S1/D3 — the two `params:` records are reachable
  parse-clean through the single-string binder bypass and produce silent wrong
  values on a production path (a child system prompt reading
  `intro [object Object] outro` where the invocation's own argument belongs, and
  `PI_THETA_PARAMS` marshalling `{}` where the parent holds a bound param), with
  no diagnostic on any channel; D3 because the three schema-lowering sites cannot
  take 0119's landed `defineRecordField` idiom without adjudicating what an own
  `__proto__` key inside a JSON-Schema `properties` document does to AJV (which
  reads the *data*'s prototype chain, measured below), the fix spans three
  subsystems (`src/extension` + `src/binder` seam, `src/runtime`, `src/parser`),
  and the respond-wire site's prototype-replacing half is unmasked by fixing the
  lowering sites, so the two must land together.
- **Kind:** defect against
  `docs/spec_topics/schema-subset.md:8` and `:78`,
  `docs/spec_topics/pi-integration-contract/subagent.md:34` / `:93` (PIC-60),
  `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22), plus a
  registry gap. `schema-subset.md:8` requires the lowered object form's
  `required` to list *every* declared property and `:78` fixes the emission as
  `{"type":"object","properties":{…wire names…},"required":[…every wire name…],
  "additionalProperties":false}`; the three lowering sites emit a document whose
  `required` names a property `properties` omits. `subagent.md:34` installs "the
  resolved-and-interpolated frontmatter `system:`" as the child's system prompt
  and `:93` (PIC-60) requires the parent to "marshal them structurally as
  canonical JSON per the theta's `params:` schema"; both are measured wrong for a
  param named `__proto__`. QRY-22 forbids binding a typed query's value that has
  not been validated against its declared schema, and
  `src/runtime/respond-tool-wire.ts:132–143` states the coercion "only ever
  repairs the encoding, never the shape" — the measured forgery is a shape
  change. The registry gap: no row in any registry page fires for any of the
  five, and the field-name / param-name position's only case rule,
  `theta/parse/binding-case-mismatch`
  (`docs/spec_topics/diagnostics/code-registry-parse.md:19`), admits any name
  starting with a lowercase letter or `_`, so `__proto__` is admitted by rule.
- **Related:**
  - [0119](./0119-proto-named-field-silently-dropped.md) — **fixed (0.132.0)**,
    the parent. Its §Fix (0.132.0) converted six write sites to the exported
    helper `defineRecordField` (`src/runtime/value.ts:596`) and enumerated this
    family as its stated remainder: residual 1 names the two `params:` records,
    residual 2 names `respond-tool-wire.ts` (as
    `src/extension/respond-tool-wire.ts` — the module is
    `src/runtime/respond-tool-wire.ts`) and the two schema-lowering sites, both
    "unmeasured at filing and unmeasured here". This report measures them.
    `defineRecordField` is the landed idiom the write half of this fix uses;
    0119's route adjudication (per-field `Object.defineProperty` over a
    null-prototype record, on the ground that
    `docs/spec_topics/runtime-value-model.md:12` fixes an object-schema *runtime
    value* as a "JS plain object") governs runtime values and does not reach the
    three lowering sites, whose records are JSON-Schema documents, not theta
    values.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)** and
    [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
    **fixed (0.48.0)**, the null-prototype-with-own-key-guards precedents.
    `collectSchemaFields` (`src/parser/type-layer-checks.ts:840`, its
    `Object.create(null)` at `:846`) and `collectTypeEnv` (`:363`, its
    `Object.create(null)` at `:364`) hold author-controlled names in
    `Object.create(null)` records, and `resolveNamed`
    (`src/parser/type-compat.ts:104`) is own-key guarded. Both are in
    `src/parser/`, alongside the three lowering sites in this report, which are
    the same input class with neither defence applied.
  - [0173](./0173-inbound-rebuild-record-not-null-prototyped.md) — **fixed
    (0.96.0)**, the record-build hardening that already applied
    `Object.create(null)` to `src/runtime/wire-translation.ts`'s three builders
    (`:370`, `:601`, `:666`). That fix is why the inbound path in this report's
    reach chain preserves an own `__proto__` key instead of dropping it, and it
    is the precedent for a null-prototype carrier at the lowering sites.
- **Affected** (every citation verified at HEAD `78a6560c`, 0.132.0):
  - `src/extension/production-theta-producer.ts:1933`/`:1936` — **site (a1)**,
    the `system:`-render params record inside `spawnSubagentConversation`
    (declared `:1873`). `const params: Record<string, ThetaValue> = {}` then
    `params[name] = value` over `bindInput.paramBindings` (`:1935`). The record is
    handed to `renderSystemPrompt` (`src/parser/system-interpolation.ts:467`).
  - `src/extension/production-theta-producer.ts:2055`/`:2058` — **site (a2)**,
    the subagent `paramValues` marshalling record in the same method.
    `const paramValues: Record<string, unknown> = {}` then
    `paramValues[name] = value` over the same map (`:2057`). The record is handed
    to `marshalParams` (`src/runtime/subagent-params.ts:153`).
  - `src/runtime/respond-tool-wire.ts:307`/`:309`/`:312` — **site (b)**,
    `coerceNode`'s object arm (declared `:254`). `:307` spreads the model payload
    into a fresh plain object, `:309` guards with `!(key in result)` — a
    prototype-chain test, not an own-key test — and `:312` assigns
    `result[key] = coerceNode(member, result[key], …)`, where `result[key]` is
    also a prototype-chain read. Reached in production through the exported
    `coerceRespondWireArguments` (`:144`) and `respondPayloadFromWire` (`:159`).
  - `src/parser/body-type-lowering.ts:128`/`:132` — **site (c1)**,
    `lowerObjectFields` (declared `:120`).
    `const properties: Record<string, unknown> = {}` then
    `properties[field.name] = lowerTypeSource(…)`, with
    `required.push(field.name)` (`:141`) unconditional. Reached from
    `buildBodyTypeSchemas` (`:421`, `:452`), which
    `src/parser/theta-document.ts:1318` runs over every body `schema`
    declaration.
  - `src/parser/params.ts:170`/`:216` — **site (c2)**, `parseParams` (declared
    `:154`), the same two lines for a frontmatter `params:` field
    (`properties[field.name] = lowerParamsFieldType(…)`).
  - `src/parser/params.ts:952`/`:964` — **site (c3)**, `hoistInlineObjectType`
    (declared `:947`), the same two lines keyed by an inline object type's field
    name (`properties[fieldName] = lowerFieldType(…)`).
  - **The reach chain for sites (a1) / (a2)**, every link verified:
    `classifyBinderBypass` (`src/binder/binder-envelope.ts:204`) classifies a
    one-field non-defaulted `string` `params:` block as `single-string-bypass`;
    `applyBinderBypass` (`:272`) builds its args with a **computed-key object
    literal** (`:280`), which defines an own property rather than assigning, so
    the key survives; `src/extension/production-theta-producer.ts:777–787`
    returns those args without reaching the AJV compile at `:1317`, which only
    the genuine binder arm runs; `paramBindingsFrom`
    (`src/extension/theta-composition-producer.ts:100`) projects them through
    `bindParamsInbound` (`src/runtime/inbound-boundary.ts:134`), whose
    `Object.entries` walk (`:155`) and `bindings.set` (`:156`) carry the key into
    a `Map`; `theta-composition-producer.ts:486` builds that map and `:492`
    threads it into `spawnSubagentConversation` (`:497`) as
    `bindInput.paramBindings`.
  - `src/runtime/value.ts:596` — `defineRecordField`, 0119's exported helper and
    the landed idiom for a write site.
  - `src/runtime/wire-translation.ts:370`, `:601`, `:666` — bug 0173's three
    `Object.create(null)` record builders, the precedent for a null-prototype
    carrier.
  - `src/seams/schema-validator.ts:104` — `AjvSchemaValidator`; `:112` — its
    `new Ajv({ strict: false, allErrors: true, logger: false })`, the exact
    configuration the compile measurements below use; `:116` — `compile`;
    `:149` — the `this.#ajv.compile(schema)` call that throws.
  - `src/extension/production-theta-producer.ts:1317` — the unguarded
    `schemaValidator.compile(params.loweredSchema)` on the binder arm, and
    `src/extension/theta-composition-producer.ts:474` — the outer dispatch
    `try` (its disposition comment at `:465–473`) that catches the throw and
    frames it as one runtime-defect `theta-system-note`.
  - `docs/spec_topics/schema-subset.md:8` — the object row's `required` clause
    ("must list *every* declared property"); `:78` — the Object emission form.
  - `docs/spec_topics/pi-integration-contract/subagent.md:34` — the `system:`
    delivery clause; `:79` — "the value itself is the theta's frontmatter
    `system:` text after `${param}` interpolation"; `:93` — PIC-60, the
    marshalled-params channel.
  - `docs/spec_topics/binder/binder-bypass-and-envelope.md:11` — the
    single-string bypass, including its "AJV validation still runs as a safety
    net" sentence, which the implementation does not satisfy (§Non-goals).
  - `docs/spec_topics/query/query-failure-and-repair.md:78` — QRY-22;
    `docs/spec_topics/query/query-tool-loop.md:11` — QRY-14, the synthesised
    respond tool.
  - `docs/spec_topics/runtime-value-model.md:34` — the inbound-translation rule
    naming binder `args` one of its boundaries.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:19` —
    `theta/parse/binding-case-mismatch`, the only case rule on the field-name and
    param-name positions;
    `docs/spec_topics/diagnostics/code-registry-runtime.md:31` —
    `theta/runtime/subagent-params-validation-failed`, the child-side refusal a
    `{}` marshal would draw if the child's own compile did not throw first.
  - `tests/ctor-proto-named-field.test.ts` — 0119's witness (26 cells). Its
    header states these five sites out of scope and "asserts nothing about them",
    so no existing cell contradicts this report.
  - **Test coverage of these five sites: none.** No cell in the default suite
    drives a `__proto__`-named `params:` field, a `__proto__`-named field through
    the schema lowering, or the respond wire's `in` guard against an omitted
    `Object.prototype`-member field name.
- **Observed at:** `0.132.0` (HEAD `78a6560c`). Offline, deterministic; no live
  model, no provider. Scratch vitest under a gitignored directory with its own
  config: direct calls on `lowerObjectFields`, `parseParams`,
  `hoistInlineObjectType`, `buildBodyTypeSchemas`, `parseThetaDocument`,
  `AjvSchemaValidator.compile`, `classifyBinderBypass`, `applyBinderBypass`,
  `bindParamsInbound`, `renderSystemPrompt`, `marshalParams`,
  `coerceRespondWireArguments` and `respondPayloadFromWire`. Written, run,
  deleted; `src/`, `tests/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.

## Summary

Bug 0119 converted six record-write sites to `defineRecordField` and named the
rest of the family as its remainder. Five sites remain, in three shapes.

**Shape (a) — the two `params:` records drop the key.**
`spawnSubagentConversation` builds both its `system:`-render record
(`production-theta-producer.ts:1933`, `:1936`) and its `paramValues` marshalling
record (`:2055`, `:2058`) by assignment over `bindInput.paramBindings`. A
`params:` field named `__proto__` reaches them: the field name loads clean, and
because it is a single non-defaulted `string` field the single-string binder
bypass supplies the args directly (`binder-envelope.ts:272`) with a computed-key
object literal that *defines* the key, so it survives into `paramBindings`. The
bypass never compiles the lowered `params:` document, which is what keeps shape
(c)'s throw out of the way. Both writes then hit the inherited accessor and the
records come out empty. Measured: the child's system prompt renders
`intro [object Object] outro` where the invocation's own argument belongs, and
`PI_THETA_PARAMS` carries `{}`.

**Shape (b) — the respond wire's guard is a prototype-chain test and its write
is an assignment.** `coerceNode` guards each schema property with
`!(key in result)` and then assigns `result[key] = coerceNode(member,
result[key], …)` (`respond-tool-wire.ts:309`, `:312`). For a declared field named
after an `Object.prototype` member the guard is `true` even when the model sent
no such field, the read answers the inherited function, and the assignment makes
it an own property. Measured through the shipped `respondPayloadFromWire`: a
schema declaring `constructor: string` and a model payload of `{"a":"x"}` yield a
payload whose own keys are `["a","constructor"]` with `constructor === Object`.
The module's own contract is that it "only ever repairs the encoding, never the
shape" (`:132–143`). The prototype-replacing half of the same two lines is
measured on a hand-built properties table — the coerced object's prototype is no
longer `Object.prototype` — and is not reachable at HEAD only because shape (c)
strips the own `__proto__` key from every lowered properties table.

**Shape (c) — the schema node becomes the properties table's prototype.** All
three lowering sites write `properties[<field name>] = <lowered node>` into a
plain object and unconditionally `push` the same name onto `required`. For a
field named `__proto__` the assignment replaces the table's prototype with the
field's own lowered schema node, so the emitted document carries a `required`
entry for a property `properties` does not have, under
`additionalProperties: false` (the `required` write is gated on the field having
no default at `params.ts:277`, and is unconditional at the other two sites).
`schema-subset.md:8` requires `required` to list every declared property, and
`:78` fixes the emission form. The document is not
merely unsatisfiable: the prototype is a schema node, so a prototype-chain read
of the table answers that node's own keys, and AJV's meta-schema validation reads
`properties.type` as `"integer"` and refuses to compile at all. Measured: a
parse-clean theta declaring `params: { __proto__: integer, a: string }` produces
`Error: schema is invalid: data/properties/type must be object,boolean` from
`AjvSchemaValidator.compile`, surfaced at slash dispatch as a framed
runtime-defect note rather than any registered diagnostic.

The three shapes interlock. Fixing (c) so a `__proto__`-named field keeps its own
key in the properties table is what puts an own `__proto__` into the table
`coerceNode` iterates, which turns (b)'s measured-at-seam prototype replacement
into a reachable one. Fixing (c) also removes the compile throw that currently
blocks the binder arm, which is what confines (a) to the string-typed bypass
case; an object-valued `__proto__` param reaching (a1) / (a2) replaces the
record's prototype outright (measured at the seam: `"i" in record` is `true`,
`JSON.stringify` is `{"a":"x"}`).

## Reproduction

Offline, at `78a6560c`. Scratch vitest. Every `@@` block below is the probe's
output verbatim.

### Site (a) — reach: a `__proto__` param loads, bypasses the binder, and binds

Fixture:

```theta
---
mode: subagent
system: |
  intro ${__proto__} outro
params:
  __proto__: string
---
@`hi`
```

```
@@ A0 parse diagnostics :: []
@@ A0 params fields :: [{"wireName":"__proto__","type":"string","hasDefault":false,"nullable":false}]
@@ A0 classifyBinderBypass :: {"kind":"single-string-bypass","wireName":"__proto__"}
@@ A0 applyBinderBypass args :: {"__proto__":"hello"}
@@ A0 args own keys :: ["__proto__"]
@@ A0 args own "__proto__" :: true
@@ A0 paramBindings keys :: ["__proto__"]
@@ A0 paramBindings.get("__proto__") :: "hello"
```

The slash arguments were `"  hello  "`. The bypass is taken, so the AJV compile
at `production-theta-producer.ts:1317` never runs.

### Site (a1) — the `system:`-render record loses the param

The record loop is `production-theta-producer.ts:1935–1937` verbatim; the
template is the parsed frontmatter's; `renderSystemPrompt` is the production
function.

```
@@ A1 record own keys :: []
@@ A1 record prototype is Object.prototype :: true
@@ A1 system template :: {"parts":[{"kind":"text","value":"intro "},{"kind":"path","segments":["__proto__"],"type":{"kind":"string"}},{"kind":"text","value":" outro\n"}]}
@@ A1 renderSystemPrompt :: {"ok":true,"text":"intro [object Object] outro\n"}
@@ A1 control record own keys :: ["__proto__"]
@@ A1 control renderSystemPrompt :: {"ok":true,"text":"intro hello outro\n"}
```

The render reports `ok: true`. The interpolation resolved `Object.prototype` and
stringified it. The control record is the same loop with
`Object.defineProperty` in place of the assignment.

### Site (a2) — the marshalled params arrive empty

```
@@ A2 paramValues own keys :: []
@@ A2 marshalParams env :: {"PI_THETA_PARAMS":"{}"}
@@ A2 control marshalParams env :: {"PI_THETA_PARAMS":"{\"__proto__\":\"hello\"}"}
```

### Site (a) — an object-valued param replaces the record's prototype

The same loop over a `paramBindings` map whose `__proto__` value is the object
`{ i: 1 }`. Reaching this from source needs a non-`string` param type, which
takes the binder arm, whose compile shape (c) currently throws — so this is a
seam measurement.

```
@@ A3 record own keys :: []
@@ A3 prototype is Object.prototype :: false
@@ A3 prototype :: {"i":1}
@@ A3 "i" in rec :: true
@@ A3 JSON.stringify(rec) :: {"a":"x"}
```

### Site (b) — the `in` guard forges an own key the model never sent

Schema `{"type":"object","properties":{"constructor":{"type":"string"},
"a":{"type":"string"}},"required":["constructor","a"],
"additionalProperties":false}`; model payload `{"a":"x"}`, built with
`JSON.parse`.

```
@@ B2 BEFORE (model payload, `constructor` omitted):
     own keys :: ["a"]
     own "constructor" :: false   typeof read :: function
@@ B2 AFTER coerceRespondWireArguments:
     own keys :: ["a","constructor"]
     own "constructor" :: true   typeof read :: function
   forged value is Object constructor :: true
```

Through the shipped entry point, with the same schema and payload:

```
@@ B5 payload from wire:
     own keys :: ["a","constructor"]
     own "constructor" :: true   typeof read :: function
```

A sweep over seven `Object.prototype` member names
(`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`,
`propertyIsEnumerable`, `toLocaleString`) × seven declared node shapes
(`{"type":"string"}`, `integer`, `boolean`, `array` of string, an object node, a
`{"type":["string","integer"]}` union, and `{}`) × the required and the optional
position — 98 rows — forges the own key in every row, with
`typeof coerced[name] === "function"` in every row. The control, a declared field
named `b`:

```
@@ B6 AFTER (control):
     own keys :: ["a"]
   validate :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/required","keyword":"required","message":"must have required property 'b'","params":{"missingProperty":"b"}}]}
```

### Site (b) — prototype replacement, on a hand-built properties table

Schema properties table carrying an **own** `__proto__` key valued an object
node; model payload `{"a":"x"}`.

```
@@ B1 properties own keys :: ["__proto__","a"]
   BEFORE (model payload):
     prototype is Object.prototype :: true
   AFTER coerceRespondWireArguments:
     own keys :: ["a"]
     prototype is Object.prototype :: false
```

Reach at HEAD:

```
@@ B4 lowered properties own keys :: ["a"]
   own "__proto__" :: false
```

The lowering never produces that own key, which is site (c).

### Site (c1) — the body-type lowering drops the field and keeps it `required`

```
@@ C1 lowerObjectFields (__proto__: integer)
   own keys of properties :: ["a"]
   prototype is Object.prototype :: false
   prototype :: {"type":"integer"}
   properties["__proto__"] own? :: false
   JSON.stringify(schema) :: {"type":"object","properties":{"a":{"type":"string"}},"required":["__proto__","a"],"additionalProperties":false}
   inherited read table["type"] :: "integer"
   "type" in table :: true
```

An object-typed field lowers to a `$ref`, which becomes the prototype instead:

```
@@ C1b lowerObjectFields (__proto__: { inner: string })
   own keys of properties :: ["a"]
   prototype :: {"$ref":"#/$defs/__inline_57bbd82eefe32c5e"}
   JSON.stringify(schema) :: {"type":"object","properties":{"a":{"type":"string"}},"required":["__proto__","a"],"additionalProperties":false,"$defs":{"__inline_57bbd82eefe32c5e":{"type":"object","properties":{"inner":{"type":"string"}},"required":["inner"],"additionalProperties":false}}}
```

Through `buildBodyTypeSchemas`, over a parse-clean fixture
(`schema Q { __proto__: integer, a: string }` with ``let r: Q = @`give me a Q` ``):

```
@@ E2 parse diagnostics :: []
@@ E2 buildBodyTypeSchemas Q :: {"type":"object","properties":{"a":{"type":"string"}},"required":["__proto__","a"],"additionalProperties":false}
@@ E2 Q.properties own keys :: ["a"]
@@ E2 Q.properties prototype :: {"type":"integer"}
@@ E2 compile :: THREW Error: schema is invalid: data/properties/type must be object,boolean
```

### Site (c2) — the same, from a parse-clean `params:` block

```
@@ E1 parse diagnostics :: []
@@ E1 loweredSchema :: {"type":"object","properties":{"a":{"type":"string"}},"required":["__proto__","a"],"additionalProperties":false}
@@ E1 properties own keys :: ["a"]
@@ E1 properties prototype :: {"type":"integer"}
@@ E1 compile :: THREW Error: schema is invalid: data/properties/type must be object,boolean
```

An object-typed param throws on the `$ref` instead:

```
@@ C-AJV/2 params __proto__: { inner: string }
   compile :: THREW Error: schema is invalid: data/properties/$ref must be object,boolean
```

The control, a field named `b` instead of `__proto__`, compiles and validates:

```
@@ C-AJV/4 control
   lowered :: {"type":"object","properties":{"b":{"type":"integer"},"a":{"type":"string"}},"required":["b","a"],"additionalProperties":false}
   properties own keys :: ["b","a"]
   compile :: OK
   validate both (own keys ["b","a"]) :: {"ok":true}
   validate only a (own keys ["a"]) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/required","keyword":"required","message":"must have required property 'b'","params":{"missingProperty":"b"}}]}
```

### Site (c3) — the inline-object hoist

```
@@ C3 fragment :: {"$ref":"#/$defs/__inline_5d3c8e724477c8c2"}
@@ C3 defs :: {"__inline_5d3c8e724477c8c2":{"type":"object","properties":{"a":{"type":"string"}},"required":["__proto__","a"],"additionalProperties":false}}
```

The retained `$defs` fragment has the same defect: `required` names `__proto__`,
`properties` does not carry it.

## Expected behaviour

- `docs/spec_topics/schema-subset.md:8` — the lowered object form's `required`
  "must list *every* declared property", and `:78` fixes the emission as
  `{"type":"object","properties":{…wire names…},"required":[…every wire name…],
  "additionalProperties":false}`. A declared field named `__proto__` is therefore
  either present in `properties` under that name or refused at parse; a document
  whose `required` names a property `properties` omits satisfies neither reading.
- `docs/spec_topics/pi-integration-contract/subagent.md:34` — the child's system
  prompt is "the resolved-and-interpolated frontmatter `system:`", and `:79`
  repeats that the value is "the theta's frontmatter `system:` text after
  `${param}` interpolation". A `${__proto__}` interpolation over a bound param
  resolves to that param's value.
- `docs/spec_topics/pi-integration-contract/subagent.md:93` (PIC-60) — the
  runtime "MUST marshal them structurally as canonical JSON per the theta's
  `params:` schema and the child MUST validate the received JSON against **the
  same schema**". A param the parent bound is in the marshalled JSON.
- `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22) — the runtime
  "MUST NOT bind, as a typed query's value, a response that has not been
  validated against its declared schema", and
  `src/runtime/respond-tool-wire.ts:132–143` states the shim "only ever repairs
  the encoding, never the shape". The object handed to validation carries exactly
  the properties the model sent, with only string-encoded structured positions
  decoded.
- `docs/spec_topics/diagnostics/code-registry-parse.md:19` — the field-name and
  param-name positions admit any name starting with a lowercase letter or `_`, so
  `__proto__` is an admitted name and needs a behaviour, not an accident.

## Actual behaviour / root cause

One idiom, five instances: a plain `{}` record and an assignment keyed by an
author-controlled string. `__proto__` is not an ordinary string key on a plain
object — it is an accessor inherited from `Object.prototype` — so the assignment
invokes that setter: a no-op for a primitive value, a prototype replacement for
an object one, and never an own property.

- Sites (a1) / (a2) write `ThetaValue`s. A string-valued param is discarded
  silently, so `renderSystemPrompt` resolves the path against the record, finds
  nothing own, reads the inherited `Object.prototype`, and stringifies it to
  `[object Object]` while reporting `ok: true`; `marshalParams` canonicalises the
  empty record to `{}`.
- Site (b) writes into a spread of the model's payload. Its two reads of
  `result[key]` (`:309` inside the `in` test, `:312` as the coercion input) are
  prototype-chain reads, so a declared field name that is also an
  `Object.prototype` member name passes the guard on an absent field and the
  assignment materialises the inherited function as an own data property. For the
  key `__proto__` the same assignment replaces the payload's prototype.
- Sites (c1) / (c2) / (c3) write lowered schema *nodes*. The value is always an
  object, so the assignment always takes the prototype-replacing branch: the
  field's own schema node becomes the properties table's prototype. Two
  consequences follow. The document is malformed against
  `schema-subset.md:8`/`:78` — `required` retains the name (`required.push` is
  unconditional at `body-type-lowering.ts:141` and `params.ts:965`, and gated only
  on the field carrying a default at `params.ts:277`). And the table now answers
  prototype-chain reads with the schema node's own keys, which is what AJV's
  meta-schema validation performs: it reads `properties.type` as `"integer"` (or
  `properties.$ref` as a string) and rejects the document, so
  `AjvSchemaValidator.compile` throws `Error: schema is invalid: …` instead of
  returning a validator. At slash dispatch that throw is caught by
  `theta-composition-producer.ts:474` and framed as a runtime-defect system note;
  no registered diagnostic fires, at parse or at runtime.

Bug 0119's fix does not reach any of the five. Its route — per-field
`Object.defineProperty` through `defineRecordField` — was adjudicated for
*runtime values*, on the ground that `runtime-value-model.md:12` fixes an
object-schema value as a "JS plain object"; sites (c1)–(c3) build JSON-Schema
documents, which that clause does not describe. And 0173's `Object.create(null)`
hardening of `wire-translation.ts` is the reason the reach chain for site (a)
preserves the key that far: the inbound rebuild no longer drops it.

## Why it matters

A theta author who names a `params:` field or a schema field `__proto__` writes a
name the case rule admits, gets no diagnostic, and gets one of three wrong
outcomes: a subagent child whose system prompt says `[object Object]` where the
invocation's argument belongs and whose marshalled params are empty (silent, on
the production dispatch path); or an invocation that dies with an AJV
meta-schema message in a runtime-defect note (`data/properties/type must be
object,boolean`), which names nothing an author can act on and no registry row
covers. The lowered document is also wrong on the wire independently of the
compile throw: it declares a required property it does not describe, so any
consumer that does compile it can never be satisfied.

Site (b) is on the model-facing respond wire. The object it returns is the object
QRY-22's validation and the subsequent binding run over, and at HEAD that object
can carry a property the model never sent whose value is a host JS function. The
same two lines replace the payload's prototype for the key `__proto__` —
measured — and the only thing standing between that and reach is site (c)
stripping the key from the properties table. Fixing (c) without (b) makes the
respond wire prototype-writable from a lowered schema.

## Non-goals

Two adjacent findings were measured and are excluded — they are not record-write
defects and this report does not adjudicate them.

- **The single-string bypass runs no AJV validation.**
  `docs/spec_topics/binder/binder-bypass-and-envelope.md:11` states "AJV
  validation still runs as a safety net (a string passes by definition; this is
  just the standard validation path)". At HEAD
  `production-theta-producer.ts:777–787` returns `applyBinderBypass`'s args
  directly and the only compile of `params.loweredSchema` is at `:1317`, on the
  binder arm. Measured: the bypass fixture above binds without any compile, which
  is exactly what makes sites (a1) / (a2) reachable while site (c)'s throw blocks
  the binder arm. If that safety net were wired, this report's site-(a)
  reproduction would become a site-(c) throw instead of a silent wrong render —
  which is a reason to fix (a) and (c) together, not a reason to fix the bypass
  here.
- **AJV's own `required` and `properties` checks read the data's prototype
  chain**, so a declared field named after an `Object.prototype` member is
  mis-verdicted independently of site (b). Measured: across all 98 sweep rows,
  the verdict on the raw model payload and on the coerced payload is byte-equal —
  AJV never reports `must have required property 'constructor'`, because
  `data.constructor !== undefined` holds through the prototype. This is a
  property of the validator seam's key discipline (an `ownProperties` question),
  not of a theta record write, and it means site (b)'s measured harm at HEAD is
  the fabricated own property itself and the latent prototype replacement, not a
  changed validation verdict.

Also out of scope: no field-name refusal is proposed. Bug 0119 settled that a
declared field named `__proto__` must survive rather than be refused (its route
adjudication rejects the two refusal routes for want of spec text and a registry
code), and this report does not reopen that.

## Fix

One idiom, three remedies, chosen per site by what the record is.

**Sites (a1) and (a2) — `defineRecordField`.** Both records hold `ThetaValue`s
and are the same shape 0119 converted six times. Replace
`params[name] = value` (`production-theta-producer.ts:1936`) and
`paramValues[name] = value` (`:2058`) with `defineRecordField`
(`src/runtime/value.ts:596`). Constraints: `production-theta-producer.ts` already
imports the helper (0119's fix added the import), so no new import line is needed
and the comment-citation drift 0119's residual 4 describes does not recur in that
module for this change; `marshalParams` (`src/runtime/subagent-params.ts:153`)
canonicalises the record, so the fix must show the canonical JSON gains the field
under its own name and that key order is unchanged for every other field;
`renderSystemPrompt` (`src/parser/system-interpolation.ts:467`) must be shown
resolving the path to the param's value, replacing the measured
`intro [object Object] outro`.

**Site (b) — an own-key guard plus a defining write.** Two edits at
`respond-tool-wire.ts:309` and `:312`: the `!(key in result)` test becomes an
own-key test (the 0031/0038 idiom —
`Object.prototype.hasOwnProperty.call(result, key)`, as `resolveNamed`
(`src/parser/type-compat.ts:104`) does for its own author-controlled names), and
the write and its input read stop going through the prototype. Constraints: the
module's stated contract is that the shim "only ever repairs the encoding, never
the shape" (`:132–143`), so the guard change must be shown to leave every
encoding repair the existing witnesses pin byte-identical while dropping the
fabricated key; the `{ ...current }` spread at `:307` already defines rather than
assigns, so an own `__proto__` key in the model's payload survives it and only
the write at `:312` needs changing for that key. This site lands in the same
change as the (c) sites: the prototype-replacing half is reachable only once a
lowered properties table can carry an own `__proto__` key, and that is what the
(c) fix creates.

**Sites (c1), (c2) and (c3) — a null-prototype carrier, route unsettled.** These
records are JSON-Schema documents, not theta values, so 0119's route adjudication
does not carry: `runtime-value-model.md:12`'s "JS plain object" clause describes a
runtime value and says nothing about a lowered document. Two routes, neither
decided here, and the decision needs measurements this report does not have:

- *Null-prototype the properties table* — `Object.create(null)` at
  `body-type-lowering.ts:128`, `params.ts:170` and `params.ts:952`, which is
  0173's remedy applied one layer over. What must be measured before taking it:
  whether `Ajv.compile` accepts a document whose `properties` value has a null
  prototype (it walks the document, and the same document is `JSON.stringify`-ed
  by the canonical-form hash at `src/seams/schema-validator.ts:116` and by the
  schema-slug recipe, both of which are own-key walks and should be unmoved —
  measure, do not assume); and whether the emitted `properties` bytes are
  byte-identical to today's for every schema not declaring `__proto__`, which the
  schema-slug cache's byte comparison (`:118–137`) makes a hard requirement.
- *Interpose a null-prototype carrier only for the write* — build the table
  null-prototyped, then hand a plain-prototype copy onward, so the document that
  reaches AJV is shaped exactly as today except that it now carries the
  `__proto__` key. This confines the prototype change to the lowering and leaves
  the document's own representation alone, at the cost of one copy per lowered
  object.

Either route makes `properties` carry an own `__proto__` key, which raises the
question the route decision must answer and this report leaves open: AJV's
generated validator reads a declared property off the *data* by prototype-chain
access, so a `properties` entry named `__proto__` is read against the payload's
inherited accessor. Measure what AJV does with such a document before choosing; a
route that produces a compilable-but-wrong validator is worse than today's throw.
The `required` writes are correct under `schema-subset.md:8` and stay as they
are — it is the `properties` write that must change. They are unconditional at
`body-type-lowering.ts:141` and `params.ts:965`, and gated on
`field.defaultSource === undefined` at `params.ts:277–279`, so a defaulted
`__proto__` param yields a document whose `required` and `properties` agree and
whose properties table is still prototype-replaced: the compile throw is the
symptom there, without the `required` mismatch.

**Ordering.** The (c) sites and site (b) land together, for the reason above. Site
(a) may land independently, but its reproduction is a consequence of the bypass
skipping the compile (§Non-goals), so a fix that lands (c) first and (a) second
leaves a window in which the bypass path throws where it previously rendered
`[object Object]`; land (a) first, or land all five at once.

**Witness.** One new test file, cells per site, each able to red on its own site
alone: the two `params:` records through the real bypass → `bindParamsInbound` →
`renderSystemPrompt` / `marshalParams` chain; the respond wire through
`respondPayloadFromWire` for both the forged-key and the own-`__proto__` cases;
the three lowering sites through `lowerObjectFields`, `parseParams` and
`hoistInlineObjectType` plus an `AjvSchemaValidator.compile` assertion and a
sibling-name control. `tests/ctor-proto-named-field.test.ts` states these five
sites out of 0119's scope and asserts nothing about them, so its 26 cells stay
byte-identical; if the (c) route changes any lowered document's bytes, the
schema-slug and canonical-form witnesses are the ones to check first.

**No registry work.** No route above mints a code or widens a *Trigger*, so
DIAG-2 (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`) is not engaged. A
route that instead refuses the name would engage it — and would contradict 0119's
settled route, per §Non-goals.

## Provenance

Filed against HEAD `78a6560c` (0.132.0) from bug 0119's §Fix (0.132.0) residuals
1 and 2, which enumerate these five sites and record them unmeasured. Every site
was re-located by symbol (0119's line anchors had drifted, and its residual 2
cites the respond-wire module under the wrong directory) and reproduced at HEAD
before filing; the reach of each was established against the real upstream code
paths rather than asserted. Sites (a1) / (a2) are measured with the production
upstream (`classifyBinderBypass` → `applyBinderBypass` → `bindParamsInbound`) and
the production downstream (`renderSystemPrompt`, `marshalParams`) around a
verbatim copy of the two record loops, because both loops sit inside
`spawnSubagentConversation`, which launches a child process; the loops themselves
are two lines each and are quoted in §Affected. Every other measurement calls
exported production functions directly. Two adjacent findings were measured and
excluded in §Non-goals. Scratch vitest under a gitignored directory, deleted
after the run.
