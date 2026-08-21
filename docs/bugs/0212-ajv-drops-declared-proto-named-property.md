# Bug 0212 — AJV's generated validator drops a declared property literally named `__proto__` from every schema-derived code path and reads the `required` check off the data's prototype chain, so the document theta now emits for a `__proto__`-named `params:` field or `schema` field validates `{}` as conforming, refuses a conforming payload that carries the key as `additionalProperties`, and never enforces the field's declared type — a `__proto__`-named field cannot bind end to end even though bug 0210 closed every record-write site that reaches this validator

- **Status:** fixed (0.152.0). The run took §Fix route 1 (the schema-build
  indirection) combined with the route-3 `ownProperties: true` component, both
  confined to documents that actually declare the name; see §Fix (0.152.0) for
  the route adjudication and its measurements. No ordering dependency on
  [0214](./0214-defaulting-and-inference-drop-the-proto-named-key.md): the two
  are independently fixable and independently witnessable, but a
  `__proto__`-named param binds end to end only when both land.
- **Sev/Diff estimate:** S1/D3 — a declared constraint is not enforced with no
  diagnostic (an absent required property validates `ok: true`, and the
  property's declared `type` is never checked), and a conforming payload is
  refused, on the two AJV boundaries every bound `params:` document and every
  typed query crosses; D3 because the route is an upstream-vs-wrapper
  adjudication in a third-party validator's codegen and the fix must land in
  lock step with the live H8a cell that pins the defective refusal message.
- **Kind:** defect against
  `docs/spec_topics/pi-integration-contract/host-interfaces-services.md:38`
  (PIC-11) and `docs/spec_topics/query/query-failure-and-repair.md:78`
  (QRY-22), located in the `V8c` validator seam
  (`src/seams/schema-validator.ts`) over an emission that is itself correct.
  PIC-11 makes the injected `SchemaValidator` the enforcement mechanism for the
  lowered document produced by `schema-subset.md`'s lowering algorithm; QRY-22
  forbids binding a value "that has not been validated against its declared
  schema". The lowered document is conformant post-0210
  (`schema-subset.md:8`, `:78`), and the validator compiled from it does not
  enforce it: measured below, the `required` entry for `__proto__` is satisfied
  by any payload including `{}`, the `additionalProperties` allow-list omits the
  declared name so a payload carrying it is refused, and the `properties` type
  check for that name is not emitted at all. No registry row fires: the failure
  is either a false pass (no diagnostic exists for a validator that answers
  `ok` wrongly) or `theta/runtime/subagent-params-validation-failed`
  (`docs/spec_topics/diagnostics/code-registry-runtime.md:31`) firing on a
  conforming payload.
- **Related:**
  - [0210](./0210-remaining-record-writes-reach-the-prototype-slot.md) —
    **fixed (0.136.0)**, the filing origin. Its §Fix (0.136.0) *Residuals*
    item 1 names this defect and records it as the validator seam's own key
    discipline, excluded from that report by §Non-goals ("AJV's own `required` /
    `properties` checks read the DATA's prototype chain … an `ownProperties`
    question of the validator seam"). 0210's fix is what makes the document
    compile at all — pre-fix `AjvSchemaValidator.compile` threw `schema is
    invalid: data/properties/type must be object,boolean` — so this defect is
    only observable at HEAD. Both directions measured here reproduce 0210's
    residual and add two manifestations it does not name (the omitted
    `additionalProperties` allow-list entry is named there; the never-emitted
    `properties` type check and the `ownProperties: true` half-fix are not).
  - [0214](./0214-defaulting-and-inference-drop-the-proto-named-key.md) —
    **open**, 0210's residuals 2 and 3: two of our own record writes that drop
    the surviving key one and two seams past the lowering. Disjoint subject —
    that report is about our assignments, this one is about what the validator
    does with a document that carries the key. Neither blocks the other.
  - [0119](./0119-proto-named-field-silently-dropped.md) — **fixed (0.132.0)**,
    which established the settled route that a declared field named `__proto__`
    survives rather than being refused. That route is unchanged here: no
    field-name refusal is proposed.
  - [0031](./0031-ctor-field-value-typing-unchecked.md) — **fixed (0.43.0)** and
    [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
    **fixed (0.48.0)**, the null-prototype-with-own-key-guards family. Both hold
    author-controlled names in `Object.create(null)` records and guard reads with
    own-key tests; this report is the same hazard one layer out, inside a
    third-party validator theta cannot own-key-guard from the outside.
- **Affected** (every citation verified at HEAD `689fc630`, 0.137.0; `src/` is
  byte-identical to `cea6665f`, 0.136.0, where the measurements were taken):
  - `src/seams/schema-validator.ts:112` — `new Ajv({ strict: false, allErrors:
    true, logger: false })`, the production configuration; `:116` —
    `AjvSchemaValidator.compile`, the slug-cached entry point; `:149` — the
    `this.#ajv.compile(schema)` that generates the defective validator. The
    class is the `V8c` seam (PIC-11) and is the only AJV construction site in
    `src/`.
  - `node_modules/ajv/dist/vocabularies/code.js:48` — `allSchemaProperties`,
    the upstream mechanism: `Object.keys(schemaMap).filter((p) => p !==
    "__proto__")`. Every keyword whose codegen enumerates the schema's
    `properties` table (`properties`, `additionalProperties`) reads through it,
    so a declared property named `__proto__` contributes neither a type check
    nor an allow-list entry. `ajv` is `8.20.0` (`node_modules/ajv/package.json`).
  - The `required` half has no filter: the generated code reads `data.__proto__
    === undefined` (quoted verbatim in §Reproduction), a prototype-chain read,
    which answers `Object.prototype` for a payload that omits the key.
  - `src/parser/params.ts` — `parseParams`, the producer of the `params:`
    document these measurements compile; `src/parser/body-type-lowering.ts` —
    `lowerObjectFields` / `buildBodyTypeSchemas`, the same for a body `schema`
    declaration. Both emit a conformant document post-0210 and are not the
    defect; they are the two reach paths.
  - `src/extension/production-theta-producer.ts:1318` — the binder arm's
    `fillDefaultsAndRevalidate` call, whose `validator` is compiled at `:1317`
    from the theta's own lowered `params:` document: the ceiling-#3/#4 `params`
    boundary that consumes this validator.
  - `src/runtime/subagent-params.ts:153` — `marshalParams` (PIC-60's marshalled
    channel) and `src/extension/production-theta-producer.ts:2238` — the
    child-side intake step `#intakeSubagentRootParams` (its call at `:2358`),
    the boundary where the refusal is observed live.
  - `tests/live/live-production-acceptance.test.ts:11363` — H8a **cell 69**'s
    asserted `userTexts` value,
    `"Reply with the single word OK. b0210-marker=subagent marshalled params
    failed schema validation: must NOT have additional properties"`. That string
    is this defect's refusal message, pinned as an equality assertion. **A fix
    for this report must update cell 69 in the same change** — the cell's
    header already records the obligation (`:11220–11262`) and states that the
    cell "cannot assert full end-to-end BINDING (the AJV defect above blocks
    that regardless of 0210's fix)". Once the validator honours the declared
    property, the child's intake succeeds and the parent's `invoke<string>`
    returns `Ok`, so the asserted string changes; leaving the cell unchanged
    would red on the fix.
  - `tests/proto-named-record-write-sites.test.ts` — 0210's 17-cell offline
    witness. Its cells C2/C4/C6 assert compile success and the exact measured
    verdicts, stating on the spot that the verdict asserted is the measured one,
    not the correct one; a fix here moves cells C2/C4 and the two-verdict
    control C6.
  - `docs/spec_topics/pi-integration-contract/host-interfaces-services.md:38`
    (PIC-11) and `:40`–`:46` (its behavioural list);
    `docs/spec_topics/query/query-failure-and-repair.md:78` (QRY-22);
    `docs/spec_topics/schema-subset.md:8`, `:78` (the emission, which is
    correct); `docs/spec_topics/pi-integration-contract/subagent.md:93`
    (PIC-60); `docs/spec_topics/diagnostics/code-registry-runtime.md:31`
    (`theta/runtime/subagent-params-validation-failed`, the row that fires on a
    conforming payload).
  - **Offline test coverage of this defect: none.** No cell asserts what a
    conforming validator would answer for either direction; 0210's cells pin
    the measured (defective) verdicts by construction.
- **Observed at:** `0.137.0` (HEAD `689fc630`; `src/` unmoved from `cea6665f`,
  0.136.0). Offline, deterministic, no live model and no provider: scratch
  vitest under a gitignored directory with its own config, driving the shipped
  `parseParams` and `AjvSchemaValidator`, plus one direct `ajv` probe that
  prints the generated validator source. The live half is not re-run here; cell
  69's recorded post-fix message is 0210's own live measurement.

## Summary

Bug 0210's fix made the lowered document carry an own `__proto__` key in its
`properties` table, so `AjvSchemaValidator.compile` now succeeds where it
threw. The validator it produces does not enforce that entry, in three
distinct ways, all visible in the generated code:

1. **`required` is satisfied by any payload.** The generated check is
   `if(data.__proto__ === undefined)`, a prototype-chain read: for `{}` it
   answers `Object.prototype`, so the required property is reported present.
   `validate({})` is `{"ok":true}` against
   `{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"],"additionalProperties":false}`.
2. **`additionalProperties` refuses the declared name.** The allow-list
   disjunction is built from `allSchemaProperties`, which filters `__proto__`
   out, so a payload carrying the key as an own property is refused with
   `keyword: "additionalProperties"`,
   `params.additionalProperty: "__proto__"`. For a single-property document the
   allow-list is empty, so the generated loop refuses *every* own key.
3. **The declared type is never checked.** The `properties` keyword emits no
   per-key check for the filtered name. With `additionalProperties` absent from
   the document, `{"a":"1","__proto__":123}` validates `ok: true` against a
   `__proto__: string` declaration.

Direction 1 is a silent false pass on a validation boundary; direction 2 is a
conformant payload noisily refused; direction 3 is a declared constraint never
enforced. The two boundaries reached are the binder arm's `params` AJV check
(`production-theta-producer.ts:1317`–`:1318`) and the subagent child's
marshalled-params intake (PIC-60), where the refusal is what H8a cell 69
observes live.

The AJV option `ownProperties: true` repairs direction 1 only. Measured: with
that option the empty payload correctly reds `must have required property
'__proto__'`, and the own-key payload is still refused as
`additionalProperties`. It is therefore not a whole fix, and
`src/seams/schema-validator.ts` does not set it.

## Reproduction

Offline, at `689fc630`. Scratch vitest with the shipped `parseParams` and
`AjvSchemaValidator` (`{ strict: false, allErrors: true, logger: false }`, the
production configuration at `schema-validator.ts:112`), plus one `node`
invocation of `ajv` directly to print the generated validator. Every `@@` block
is the probe's output verbatim.

### The lowered document, and both directions through the shipped validator

`parseParams([{ name: "__proto__", typeSource: "string" }], [], …)`, then
`AjvSchemaValidator.compile`:

```
@@ P1 lowered bytes :: {"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"],"additionalProperties":false}
@@ P1 properties own keys :: ["__proto__"]
@@ P1 properties own __proto__ :: true
@@ P1 compile :: OK
@@ P1a validate({}) :: {"ok":true}
@@ P1b JSON.parse own key? :: true proto :: Object.prototype
@@ P1b validate(JSON.parse) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","message":"must NOT have additional properties","params":{"additionalProperty":"__proto__"}}]}
@@ P1c defineRecordField own key? :: true
@@ P1c validate(defineRecordField) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","message":"must NOT have additional properties","params":{"additionalProperty":"__proto__"}}]}
@@ P1d computed-key literal own key? :: true
@@ P1d plain assignment own key? :: false proto :: Object.prototype
@@ P1d validate(plain assignment) :: {"ok":true}
```

The payload's own key is built three ways — `JSON.parse` (the wire path), the
shipped `defineRecordField` (`src/runtime/value.ts`), and a computed-key object
literal — all three produce the own key and all three are refused. A plain
`payload["__proto__"] = "x"` assignment produces **no** own key (it hits the
inherited setter) and then validates `ok: true`, which is why the false pass
and the refusal are two views of the same mishandling.

The sibling-name control, same code path:

```
@@ P1e control bytes :: {"type":"object","properties":{"p":{"type":"string"}},"required":["p"],"additionalProperties":false}
@@ P1e control validate({}) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/required","keyword":"required","message":"must have required property 'p'","params":{"missingProperty":"p"}}]}
@@ P1e control validate({p:'x'}) :: {"ok":true}
```

`__proto__` beside an ordinary field, which is the shape a real `params:` block
usually has:

```
@@ P1f two-field bytes :: {"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},"required":["a","__proto__"],"additionalProperties":false}
@@ P1f validate({a:'1'}) :: {"ok":true}
@@ P1f validate({a,__proto__ own}) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","message":"must NOT have additional properties","params":{"additionalProperty":"__proto__"}}]}
```

### The generated validator, verbatim

`ajv@8.20.0`, production configuration, one declared `__proto__: string`
property (the `properties` table built with `Object.defineProperty` so the key
is an own key):

```js
function validate10(data, {instancePath="", parentData, parentDataProperty, rootData=data}={}){let vErrors = null;let errors = 0;if(data && typeof data == "object" && !Array.isArray(data)){if(data.__proto__ === undefined){const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "__proto__"},message:"must have required property '"+"__proto__"+"'"};…}for(const key0 in data){const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},…};…}}…}
```

`data.__proto__ === undefined` is the `required` check. The
`additionalProperties` loop carries **no** allow-list guard, so every own key is
refused. There is no `properties` type check for the declared property.

For `["a", "__proto__"]` the allow-list guard exists and names `a` only:

```js
for(const key0 in data){if(!(key0 === "a")){… additionalProperties …}}
if(data.a !== undefined){if(typeof data.a !== "string"){… type …}}
```

The `["a", "b"]` control emits `if(!((key0 === "a") || (key0 === "b")))` and a
type check per field.

### The declared type is not enforced

Same document with `additionalProperties` omitted, so direction 2 does not mask
direction 3:

```
@@ R3 no-additionalProperties doc :: {"type":"object","properties":{"__proto__":{"type":"string"},"a":{"type":"string"}},"required":["a","__proto__"]}
@@ R3 validate({a:'1',__proto__:123}) :: true null
```

An integer bound to a `string`-declared property passes.

### `ownProperties: true` repairs one direction only

Same document, the two configurations side by side:

```
@@ P4 opts :: {"strict":false,"allErrors":true,"logger":false}
@@ P4   validate({}) :: {"ok":true,"errors":null}
@@ P4   validate(own __proto__) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","params":{"additionalProperty":"__proto__"},"message":"must NOT have additional properties"}]}
@@ P4 opts :: {"strict":false,"allErrors":true,"logger":false,"ownProperties":true}
@@ P4   validate({}) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/required","keyword":"required","params":{"missingProperty":"__proto__"},"message":"must have required property '__proto__'"}]}
@@ P4   validate(own __proto__) :: {"ok":false,"errors":[{"instancePath":"","schemaPath":"#/additionalProperties","keyword":"additionalProperties","params":{"additionalProperty":"__proto__"},"message":"must NOT have additional properties"}]}
```

### Reach

The `params:` reach is parse-clean and takes the binder arm (two fields, so no
bypass), which compiles the document at `production-theta-producer.ts:1317`:

```
@@ R1 parse diagnostics :: []
@@ R1 loweredSchema :: {"type":"object","properties":{"a":{"type":"string"},"__proto__":{"type":"string"}},"required":["a"],"additionalProperties":false}
@@ R1 classifyBinderBypass :: {"kind":"binder"}
```

The live reach is already recorded: H8a cell 69 drives a real spawned subagent
child over 0210 §Reproduction site (a)'s fixture and observes the real child's
real intake refusal, `subagent marshalled params failed schema validation: must
NOT have additional properties`.

## Expected behaviour

The compiled validator enforces the lowered document as written, for every
declared property name the parser admits — `__proto__` included, since
`code-registry-parse.md:19`'s case rule admits any name starting with a
lowercase letter or `_` and 0119 settled that such a field survives rather than
being refused. Concretely, for
`{"type":"object","properties":{"__proto__":{"type":"string"}},"required":["__proto__"],"additionalProperties":false}`:

- `validate({})` reds with `keyword: "required"`,
  `params.missingProperty: "__proto__"`.
- `validate(JSON.parse('{"__proto__":"hello"}'))` is `{"ok":true}`.
- `validate(JSON.parse('{"__proto__":123}'))` reds with `keyword: "type"` at
  `instancePath: "/__proto__"`.
- `validate(JSON.parse('{"z":1}'))` reds with `keyword: "additionalProperties"`,
  `params.additionalProperty: "z"`.

The sibling-name control's verdicts (`@@ P1e`) are the shape every one of these
must take.

## Actual behaviour / root cause

Measured above. AJV's codegen reaches the schema's `properties` table through
`allSchemaProperties` (`node_modules/ajv/dist/vocabularies/code.js:48`), which
filters the name `__proto__` out of the key list. Two keywords lose the entry:
`properties` (no type check is emitted) and `additionalProperties` (the
allow-list disjunction omits the name, so an own key carrying it is
"additional"). The `required` keyword reads its names from the document's
`required` array instead, so the entry survives — but the generated test is the
prototype-chain read `data.__proto__ === undefined`, which any object payload
satisfies, so the check passes for `{}`. The two halves are the same upstream
posture (a prototype-pollution hardening applied to the schema-key space) with
no compensating own-key discipline on the data side; `ownProperties: true`
switches the data-side reads to `hasOwnProperty` and so repairs the `required`
half alone, leaving the filtered allow-list intact.

Nothing in `src/` is wrong at the emission: the document is exactly
`schema-subset.md:78`'s form, its `required` and `properties` agree, and
`AjvSchemaValidator` passes it through unmodified. The defect is that the seam
theta relies on to enforce PIC-11 does not enforce this document, and theta
neither detects nor reports that.

## Why it matters

Two production boundaries answer wrongly:

- **The binder `params` boundary** (`production-theta-producer.ts:1317`–`:1318`,
  ceiling #4's `params` arm). A theta declaring a non-defaulted `__proto__`
  param binds with the param absent: the post-merge validation answers
  `ok: true` for args that do not carry it, so the body runs with a required
  param unbound and no diagnostic on any channel. QRY-22's "MUST NOT bind …
  a response that has not been validated" is the same obligation one boundary
  over, and `code-registry-parse.md:19` admits the name, so this is reachable
  from parse-clean source.
- **The subagent marshalled-params intake** (PIC-60,
  `code-registry-runtime.md:31`). A child receiving the *correct* marshalled
  payload `{"__proto__":"hello"}` refuses it fail-closed with `must NOT have
  additional properties` — a conformant payload refused, the failure H8a cell 69
  asserts today. End to end, `invoke`-ing a theta with a `__proto__`-named param
  cannot succeed at HEAD, whatever the record-write sites do.

The same validator compiles every typed query's body schema
(`buildBodyTypeSchemas`), so a `schema` declaration with a `__proto__`-named
field carries the identical three failures onto the query path.

## Fix

Constraint-pinned; the route is not decided here.

**What must hold whichever route lands.**

1. The emission does not change. `schema-subset.md:8`/`:78` is satisfied at
   HEAD, 0210 settled that the properties table carries an own `__proto__` key
   written through `defineRecordField`, and the schema-slug cache compares
   emitted bytes (`schema-validator.ts:123`, inside `compile` at `:116`): any
   route that alters the
   bytes of a document declaring no `__proto__` field is refused.
2. 0119's settled route stands: no field-name refusal, no new diagnostic on the
   name. DIAG-2 (`docs/spec_topics/diagnostics/diagnostic-shape.md:72`) stays
   unengaged unless a route mints a code, which none of the routes below does.
3. All four expected verdicts in §Expected behaviour must hold, and the
   sibling-name control's verdicts must be unmoved. Repairing only the
   `required` direction leaves the conformant payload refused; repairing only
   the `additionalProperties` direction leaves the false pass.
4. **Lock step with H8a cell 69.** `tests/live/live-production-acceptance.test.ts:11363`
   asserts the defective refusal message by equality. A fix changes what the
   real child does, so the cell's asserted `userTexts` and the header block that
   explains why the cell cannot assert end-to-end binding (`:11220–11262`) are
   part of the same change. 0210's offline witness cells C2/C4/C6
   (`tests/proto-named-record-write-sites.test.ts`) pin the measured verdicts
   the same way and move with it.

**Routes.**

- *Patch the schema build so the validator never sees a schema property named
  `__proto__`.* The document theta hands to `compile` is theta's own, so the
  seam can compile an equivalent document that expresses the same constraint
  through keywords whose codegen does not enumerate `properties` — a
  `$defs`/`$ref` indirection for the affected property, or `propertyNames`
  plus a per-name subschema. What must be measured before taking it: that the
  translated document is verdict-equivalent for every payload (not just the
  four above), that the translation is confined to documents actually declaring
  such a name so no other document's compiled behaviour or cached bytes move,
  and where the translation lives relative to the slug cache (the cache is keyed
  on the *emitted* document's slug — translating inside `#build` keeps the key
  space unchanged).
- *Own-key pre-check in the wrapper.* `AjvSchemaValidator.compile` returns a
  `CompiledValidator` whose `validate` is theta's own closure
  (`schema-validator.ts:151`–`:165`, over `#build`'s `this.#ajv.compile` at
  `:149`); it can enforce the affected property names
  itself — presence by `hasOwnProperty`, type by the declared node — and merge
  its findings into the `ValidationError[]` AJV returns, discarding AJV's
  spurious `additionalProperties` entry for those names. What must be measured:
  that `ValidationError` shape and PIC-11's single-pass / all-errors and
  determinism obligations are preserved, that the injected errors carry
  `instancePath` / `schemaPath` / `keyword` / `params` a real AJV error for that
  failure would carry (ERR-14's canonical ordering, applied downstream by
  `orderValidationIssues`, must still produce a stable order), and that a
  document declaring no such name takes a byte-identical, allocation-equivalent
  path.
- *Validator configuration.* `ownProperties: true` is measured above: it
  repairs the `required` direction only and does not on its own satisfy
  constraint 3. It is recorded as a component a route may combine with, not as
  a route.
- *Upstream.* The filter is deliberate upstream code
  (`code.js:48`); an upstream change or a pinned fork is the fourth option, and
  the decision must state whether theta is willing to depend on it. This report
  measures the behaviour of `ajv@8.20.0` as shipped and does not assume any
  upstream movement.

**Witness.** One offline file over the shipped `AjvSchemaValidator`: both
directions for a single-property document and for `__proto__` beside an ordinary
field, the declared-type check with and without `additionalProperties`, the
sibling-name control, and a byte assertion that a document declaring no
`__proto__` field compiles to the same verdicts as today. Each cell must red on
its own direction alone. The live half is cell 69, updated in the same change.

## Fix (0.152.0)

- **What shipped**, keyed to §Fix:
  - `src/seams/schema-validator.ts` — three module-private additions plus one
    branch, all inside the `V8c` seam. `declaresFilteredProperty` is a
    read-only, schema-aware walk answering whether any `properties` table in
    the document carries `__proto__` as an own enumerable key; it classifies
    keys as schema-MAP (`properties`, `$defs`, `patternProperties`,
    `definitions`), schema-VALUED (`items` incl. tuple form,
    `additionalProperties` when an object, `not`, `contains`, `propertyNames`,
    `if`, `then`, `else`), schema-LIST (`anyOf`, `allOf`, `oneOf`) and LEAF
    (everything else — `type`, `required`, `enum`, `const`, `format`,
    `description` are never recursed into), so a document declaring an ordinary
    field literally named after a keyword cannot misfire.
    `translateFilteredProperties` returns an equivalent document over the same
    classification: at every affected node the `properties.__proto__` entry is
    relocated to `patternProperties["^__proto__$"]`, whose codegen matches the
    DATA's own keys against the pattern and is not routed through
    `allSchemaProperties`. `required` is untouched at every level (§Fix
    constraint 1, `schema-subset.md:8`); every copied table is written through
    the landed `defineRecordField` idiom (`src/runtime/value.ts`), and the
    input document is never mutated or aliased-and-mutated.
  - `src/seams/schema-validator.ts` — a second per-instance `Ajv`,
    `#hardenedAjv`, configured `{ strict: false, allErrors: true, logger:
    false, ownProperties: true }` with `addFormats` applied.
    `ownProperties: true` is what repairs the `required` direction: it switches
    AJV's data-side presence read from the prototype-chain
    `data.__proto__ === undefined` to a `hasOwnProperty` test
    (`noPropertyInData`, `ajv/dist/vocabularies/code.js:43`–`:47`). It is a
    SECOND instance rather than the default configuration because it changes
    the generated code for every `required` check in every document, which
    §Fix constraint 1 forbids for a document declaring no such name.
  - `#build` branches once: an affected document compiles the translated
    document on `#hardenedAjv`; every other document takes the unmediated
    path — the same `#ajv`, the same `schema` object by identity, one
    `Ajv.compile` call. The branch lives strictly inside `#build`, after
    `compile` has computed the slug and canonical bytes off the EMITTED
    document, so the cache key space does not move. The `CompiledValidator`
    closure, the `ValidationError` projection and the slug cache are unchanged.
  - No emission change, no field-name refusal (0119's settled route stands), no
    code minted and no *Trigger* widened (DIAG-2 unengaged, §Fix constraint 2),
    no new export.
- **Route adjudication, on the record** (§Fix left the route open and required
  measurement first). Route 1 alone cannot satisfy constraint 3 — relocating
  the entry repairs `additionalProperties` and the per-key `type` check but
  leaves `required` reading the prototype chain; the route-3 component alone
  repairs only `required`, as §Fix already measured. Measured together on
  `ajv@8.20.0` under the production configuration, the translated document
  `{"type":"object","properties":{},"patternProperties":{"^__proto__$":{"type":"string"}},"required":["__proto__"],"additionalProperties":false}`
  answers all four §Expected behaviour verdicts: `validate({})` →
  `required`/`missingProperty:"__proto__"`; `{"__proto__":"hello"}` → `ok`;
  `{"__proto__":123}` → `type` at `instancePath:"/__proto__"`; `{"z":1}` →
  `additionalProperties`/`z` (co-reported with the `required` entry
  `allErrors: true` owes). The wrapper-side own-key pre-check (§Fix route 2)
  was refused on measurement, not on taste: enforcing the affected names in
  theta's own closure repairs the ROOT document only unless the wrapper
  re-implements the walk, and the defect is per-subschema (witness cells
  F1–F3 red at `$defs` depth), so route 2 would have shipped a partial fix or
  a second validator. Upstream (§Fix route 4) was not taken: the filter is
  deliberate upstream code and this fix depends on no upstream movement.
  `$defs` / `$ref` indirection was measured and rejected as a mechanism —
  `properties: {"__proto__": {"$ref": …}}` keeps the filtered KEY, so
  `allSchemaProperties` drops it regardless of what the value is.
- **The AJV-reads-the-data's-prototype question, settled.** 0210's fix record
  left it open ("§Non-goals' measured AJV-reads-the-data's-prototype finding,
  unchanged by this fix"), and it is the same question this fix answers. It is
  settled as a VALIDATOR-SEAM own-key discipline, resolved by configuration
  confined to the affected document rather than by any change to the emission
  or to the data: JSON Schema's `required` is a statement about own
  properties, `ownProperties: true` is AJV's own switch for that reading, and
  every payload class production can present at this seam (`JSON.parse` of the
  wire, `defineRecordField` records, `marshalParams`' JSON round trip, the
  `{...binderArgs}` spread in `fillDefaultsAndRevalidate`) mints own keys
  only — measured by the round-1 reviewer: no payload class's verdict moves
  except the prescribed repairs. The prototype-chain reading is therefore not
  relied on anywhere, and no field-name refusal or data-side rewrite was
  needed.
- **§Fix constraint 4's obligation, discharged and partly corrected.**
  - H8a **cell 69** (`tests/live/live-production-acceptance.test.ts`) is
    flipped in this change, under §Fix constraint 4's own authority. Its
    asserted `userTexts` moves from
    `["Reply with the single word OK. b0210-marker=subagent marshalled params
    failed schema validation: must NOT have additional properties"]` to
    `["Reply with the single word OK. b0210-marker=hello"]`, and the header
    block that explained why the cell could not assert end-to-end binding is
    rewritten. The cell's SUBJECT is preserved and strengthened: it still
    witnesses 0210 site (a2) — that the marshalled payload carries the key —
    and now witnesses it through the strongest available observable, the real
    child's real BOUND value returned on the `Ok` arm. It still discriminates a
    site-(a2) regression: with (a2) regressed the marshalled JSON is `{}` and
    the now-enforcing intake reds `required` instead of false-passing, a
    byte-distinct outcome; with this fix regressed the intake reds
    `additionalProperties` on the conforming payload. Verified live, green.
  - **§Fix constraint 4's claim that 0210's offline cells C2/C4/C6 move with it
    is FALSE.** Re-read at HEAD by the test author, both reviewers and the
    verifier: C2 asserts the emitted shape and bytes, `C2, AJV` and C4 assert
    `expect(() => compile(document)).not.toThrow()`, and C6 is the
    sibling-name control over a document declaring `b` and `a` only. None pins
    a `__proto__`-named property's validation verdict, so none moves under any
    constraint-1-conforming fix. `tests/proto-named-record-write-sites.test.ts`
    is byte-unmoved and 17/17 green (`git diff --stat` on the path is empty).
  - Bug 0214's witness cells 1a/1b, whose recorded boundary omits the
    post-merge AJV verdict because it is this report's subject, were NOT
    extended. `tests/proto-named-binder-write-sites.test.ts` is byte-unmoved
    and 9/9 green. The binder-boundary verdict this fix makes assertable is
    locked instead by this report's own witness cell E, which drives the
    shipped `fillDefaultsAndRevalidate` and asserts `validation.ok === false`
    and `classification.kind === "ajv_args"` for a non-defaulted
    `__proto__`-named param absent from the args — the same claim, inside this
    report's own file, leaving 0214's protected cells alone.
- **Witness:** `tests/proto-named-schema-validator-enforcement.test.ts`, 18
  offline cells over the shipped `AjvSchemaValidator`, the shipped
  `parseParams`, the shipped `defineRecordField` and the shipped
  `fillDefaultsAndRevalidate`: A0–A4 (the single-property document and all four
  §Expected behaviour verdicts, one cell per direction), B0–B3 (`__proto__`
  beside an ordinary field, §Reach's shape), C (the declared type with
  `additionalProperties` ABSENT, so direction 3 is witnessed unmasked), D1/D2
  (the sibling-name control and a `$defs`/`$ref` object-typed control — bytes
  and verdicts including full `schemaPath`s, §Fix constraint 1's guard), E (the
  binder `params` boundary), F0–F3 (the DEPTH LOCK: the same three directions
  for a `__proto__` property inside a `$defs` fragment reached by `$ref`), G
  (a hand-built document whose pre-existing `patternProperties["^__proto__$"]`
  collides with the relocated entry: both constraints must fire). `schemaPath`
  is deliberately unpinned for entries reported against the `__proto__`-named
  property itself — the translation legitimately moves that pointer, and
  nothing in `src/` reads `schemaPath` (`orderValidationIssues`,
  `src/runtime/query-error.ts:197`, keys on `(instancePath, keyword, message)`
  only, so ERR-14 determinism is preserved) — and pinned in full everywhere
  else, every control included.
- **Gates** (each re-run by the orchestrator after the last edit): witness
  `npx vitest run tests/proto-named-schema-validator-enforcement.test.ts` →
  `Tests 18 passed (18)`; pre-fix the same file was `Tests 12 failed | 5 passed
  (17)`. Default suite `npm test` → `Test Files 344 passed (344)` / `Tests 6587
  passed (6587)`, against the lane baseline 343/6569 — the delta is exactly
  this witness file. `npx tsc -p tsconfig.json --noEmit` clean. `npm run lint`
  clean. Live: the whole H8a file
  `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts`
  → `Tests 73 passed (73)` (cell 69 among them, with the flipped assertion),
  and the H9a acceptance suite `tests/live/acceptance` → `Tests 11 passed
  (11)`. Both live suites were run because this seam compiles every bound
  `params:` document and every typed query's body schema, so the
  unaffected-document path is the blast radius that matters.
- **Review:** 2 rounds plus one comment-only polish round. Round 1 (deep) —
  F1 [correctness]: an exact `^__proto__$` collision in a hand-built
  `patternProperties` table was silently OVERWRITTEN by the relocated entry
  (measured: a document declaring `pattern ^__proto__$: integer` beside
  `properties.__proto__: string` moved `{"__proto__":"h"}` from refuse to ok),
  and the doc comment claimed a merge that did not happen; F2 [prose]: a false
  "allocates nothing" claim; two residuals — a `translateSchemaMap` /
  `translateSchemaMapExcluding` duplication and a cell title naming the half
  that was already green. All four landed: the collision now INTERSECTS as
  `{ allOf: [pre-existing, relocated] }` through one shared
  `relocateFilteredProperty` helper both write sites call, locked by the new
  witness cell G. Round 2 (deep, routed deep because round 1 raised a
  correctness finding and because the witness file had to be reconstructed
  after a fixer-round scripting accident truncated it) — CLEAN, with the
  reconstruction independently proven not weaker: every non-control cell's
  asserted expectation was re-derived against a locally-built pre-fix Ajv and
  shown to differ, every control's to match, `schemaPath` pinning audited call
  site by call site, and every adversarial translation case re-measured
  (collision whose pre-existing entry itself declares a nested `__proto__`, a
  boolean `false` pre-existing entry, a `$ref` self-cycle, keyword-named
  ordinary fields, `enum`/`const` object values). Three stale self-citations
  round 2 raised were fixed in a comment-only polish round confined to the two
  files this fix owns; polish verified by gate-diff, confirmation round
  skipped.
- **Verification:** SOLID. The fix has three separable mechanisms and each was
  neutralised ALONE, with `git hash-object` proving a byte-exact restore after
  every experiment (`992f08a6…` before and after all three): (a) the whole
  branch → 13 of 18 cells red, the 5 passes being exactly the controls; (b) the
  translation alone (still on the hardened instance) → exactly A2/A3/B2/B3/C/
  F2/F3/G red, the `additionalProperties` and per-key `type` directions;
  (c) `ownProperties` alone (translated document on the plain instance) →
  exactly A1/A4/B1/E/F1 red, the `required` direction. No cell is carried by
  another's failure and no direction is unwitnessed. Full suite, typecheck and
  lint re-run green; the two protected witnesses re-run green and proven
  byte-unmoved; the live end-to-end obligation discharged by cell 69, audited
  against `#intakeSubagentRootParams` and `marshalParams` as a genuine real
  spawned child validating a real marshalled payload through this seam.
- **Residuals:**
  1. **A hand-built document is the only way to reach the collision path.** The
     lowered subset emits no `patternProperties` (`schema-subset.md:8`), so
     `relocateFilteredProperty`'s `allOf` intersection is unreachable from
     theta source; cell G drives it with a hand-built `LoweredSchema` and says
     so. It is kept rather than refused because the translation has no
     diagnostic channel and silently dropping a declared constraint would be
     the worse failure.
  2. **The keyword classification is wider than the lowered subset.**
     `contains`, `propertyNames`, `if` / `then` / `else` and `definitions` are
     classified but never emitted by our lowering. Round 2 measured the width
     as inert (no verdict divergence, no misfire) rather than risky; it exists
     so a hand-built or future document is walked at the right depth instead of
     silently skipped. Any keyword NOT classified is a leaf, i.e. copied
     verbatim and not repaired — a `__proto__`-named property under an
     unclassified keyword would still be mishandled by AJV. No such keyword is
     reachable at HEAD.
  3. **`schemaPath` moves for the relocated property's own errors** — from
     `#/properties/__proto__/…` to `#/patternProperties/%5E__proto__%24/…`.
     Nothing in `src/` reads `schemaPath` (grep: this seam is the only
     mention) and ERR-14's ordering keys on `(instancePath, keyword, message)`,
     so this is downstream-inert today; a future consumer of `schemaPath`
     would see the relocated pointer.
  4. **Line-number citations elsewhere in the corpus that point into
     `src/seams/schema-validator.ts` past line 55 are left stale** by this
     fix's ~300-line insertion — including this report's own §Affected anchors
     (`:112`, `:116`, `:123`, `:149`) and 0210's fix record. No citation sweep
     was run (bug 0134's forbidden class); every site this fix touches is
     cited by SYMBOL. Only the self-citations INSIDE the two files this fix
     owns were re-derived.
  5. **Two citation drifts and one measurement error in this document,** found
     while re-deriving and not corrected in place: §Reach's `@@ R1` block
     quotes `"required":["a"]` for `{a: string, __proto__: string}`, but the
     shipped `parseParams` emits `"required":["a","__proto__"]` (re-measured;
     `@@ P1f` is the accurate row and `schema-subset.md:8` requires it); and
     §Affected's `production-theta-producer.ts:1317`–`:1318`,
     `:2238`/`:2358` and `subagent.md:93` are now `:1328`–`:1329`,
     `:2259`/`:2379` and `subagent.md:96`.
- **Discharge notes appended:** none. 0210's fix record §Residuals item 1 is
  this report's subject and is discharged BY this record; 0214's §Residuals
  third bullet ("a `__proto__`-named param binds end to end only when both
  reports are fixed") is now satisfied and evidenced by H8a cell 69's green
  `b0210-marker=hello`.
- **Pinned dispositions / non-goals:** the emission is untouched — no change to
  `src/parser/params.ts`, `src/parser/body-type-lowering.ts` or any lowering
  site, and a document declaring no `__proto__` field compiles byte-identically
  on the same instance from the same object; no field-name refusal, per 0119's
  settled route; no diagnostic code minted and no *Trigger* widened, so DIAG-2
  is unengaged; no upstream `ajv` change, fork or version bump; `ownProperties:
  true` is NOT applied to the default instance; 0210's other excluded finding —
  the single-string bypass running no AJV validation — remains excluded and
  unadjudicated.

## Provenance

Filed against HEAD `689fc630` (0.137.0; `src/` byte-identical to `cea6665f`,
0.136.0) from bug 0210's §Fix (0.136.0) *Residuals* item 1, which records this
defect measured but unfixed and names the H8a cell that pins it. Every citation
was re-derived here: the shipped `parseParams` produced the documents, the
shipped `AjvSchemaValidator` produced every verdict quoted, and the generated
validator source was printed from `ajv@8.20.0` under the production
configuration to locate the mechanism (`allSchemaProperties`) rather than infer
it. The `ownProperties: true` comparison and the declared-type measurement are
new here; 0210's residual names only the `required` false pass and the
`additionalProperties` refusal. Scratch vitest and one `node` probe under a
gitignored directory, deleted after the run; `src/`, `tests/`,
`docs/bugs/README.md` and every other bug document are unmodified by this
filing.
