# Bug 0212 — AJV's generated validator drops a declared property literally named `__proto__` from every schema-derived code path and reads the `required` check off the data's prototype chain, so the document theta now emits for a `__proto__`-named `params:` field or `schema` field validates `{}` as conforming, refuses a conforming payload that carries the key as `additionalProperties`, and never enforces the field's declared type — a `__proto__`-named field cannot bind end to end even though bug 0210 closed every record-write site that reaches this validator

- **Status:** open. §Fix is constraint-pinned: two routes are named (a
  schema-build change that sidesteps the validator's schema-properties codegen,
  and a wrapper-side own-key pre-check in `AjvSchemaValidator`), plus the
  measured `ownProperties: true` half-fix; none is chosen here, and the route
  decision is left to the run. No ordering dependency on
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
