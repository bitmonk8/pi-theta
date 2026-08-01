# Bug 0055 — `lowerTypeSource`'s literal-union arm emits a bare `{"enum":[…]}` where `schema-subset.md:80` spells `{"type":"string","enum":[…]}`, so the two spellings that rule groups under one emission — `enum Sev { Low = "low", High = "high" }` and `schema Sev = "low" | "high"` — lower to different bytes, mint different slugs, and register two `__theta_respond_` tools for one declared value set

- **Status:** open.
- **Kind:** defect, single element. The implementation emits a fragment the
  spec's own step-3 emission table does not spell.
  `docs/spec_topics/schema-subset.md:80` gives one rule for two source forms —
  "Enum (or string-literal union): `{ "type": "string", "enum": [...wire
  values...] }`" — and the implementation splits it: `lowerEnumToSchema`
  (`src/parser/body-type-lowering.ts:100`) emits the spelled form for a named
  `enum` declaration, while `lowerTypeSource`'s literal-union arm (`:358–363`)
  emits `{ enum: [...] }` with the `type` keyword absent. The divergence is
  pre-existing; it predates bug
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)'s
  fix (0.49.0), which pinned the current bytes.
- **Related:**
  - [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — fixed (0.49.0), the filing origin. Its §Fix *Residuals* item (vii)
    (`:279–281`) records this divergence and leaves it unfiled. Its fix carried
    the literal sublanguage down to every hoisting depth, so the arm now reaches
    strictly more positions than it did at 0.48.0, and it pinned the current
    (divergent) bytes in three places — the `a10` control
    (`tests/inline-object-nested-lowering.test.ts:990–1007`), `a5`'s expected
    fragment (`:350–355`) and the canonical constant that derives `a5`'s minted
    slug (`:356–358`). The `a10` comment (`:992–994`) states the pin's purpose:
    "a change to the literal emission … reds as ITSELF rather than as a
    mysterious slug mismatch in a5." **The fix here re-pins all three with the
    spec line as authority.** No ordering constraint: 0039 is landed, and this
    report's §Fix touches one `return` statement in a function 0039 left in
    place.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — fixed (0.45.0),
    which made the alias-RHS position lower at all. Its cell `c5`
    (`tests/schema-alias-union-decl.test.ts:1061–1087`) pins a string-literal
    union alias **behaviourally** — every declared arm accepted, `"zzz"` and `1`
    rejected — with a comment (`:1063–1067`) asserting that "the string-literal
    union's fragment shape is the implementer's choice between the enum form
    (schema-subset.md step 3, "Enum (or string-literal union)") and an `anyOf`
    of `const`s". `:80` fixes that shape; the comment is corrected by this
    report's §Fix. The cell's assertions do not move (§Reproduction, *Real AJV
    over both spellings*).
  - [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) — open, and a
    different case in the same function. Its §Non-goals bullet "A literal arm of
    a mixed union" (`:583–586`) concerns `"a" | Triage`, where the literal arm
    lowers `{}` through `lowerTypeExpr` because the literal check never fires
    (§Reproduction, *Positions the arm does not reach*). This report concerns
    the case where the check **does** fire. That bullet's citation
    `body-type-lowering.ts:139–151` is stale at HEAD; the arm is `:358–369`.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — fixed
    (0.38.0), which established `:80` as the enum authority in-tree and built the
    respond-tool wire envelope. Its landed wire test names the divergence in a
    row label: "a literal-union root (lowered to a bare `enum`, no `type`)"
    (`tests/respond-tool-wire.test.ts:151–156`), one row below "a declared enum
    root (schema-subset.md:80)" (`:143–148`).
- **Affected** (every citation verified at HEAD `52e257bc`, 0.49.0):
  - `src/parser/body-type-lowering.ts:358–363` — the arm. `splitTopLevel(s, "|")`
    at `:358`; when every arm parses as a literal (`parseLiteralArm`,
    `:693–714`), `:362` returns `{ enum: literals.map(…) }`. No `type` key is
    written on any path. The sibling single-literal arm (`:364–369`) returns
    `{ const: … }`, which `:79` spells and which is correct.
  - `src/parser/body-type-lowering.ts:100` — `lowerEnumToSchema`, the other half
    of the same emission rule: `return { type: "string", enum: values };`. This
    is the byte sequence `:80` spells, `type` first.
  - The positions the arm reaches, all through `lowerTypeSource`
    (`:335–341`):
    - `src/runtime/query-schema-lowering.ts:148` — the `@<T>` / `invoke<T>`
      annotation root, non-brace form. Two production call sites feed it:
      `src/extension/production-theta-producer.ts:2312–2319` (typed-query
      response schema, QRY-22) and `:3308–3312` (`invoke<T>` return validation).
    - `src/runtime/query-schema-lowering.ts:139–143` — the annotation root's
      brace form, which routes to `lowerInlineObject`
      (`src/parser/body-type-lowering.ts:151`) and from there per field to
      `lowerTypeSource` (`:119–125`).
    - `src/parser/body-type-lowering.ts:545` — `buildBodyTypeSchemas` pass 2's
      `schema`-body call, via `lowerObjectFields`'s per-field
      `lowerTypeSource` (`:119–125`).
    - `src/parser/body-type-lowering.ts:566` — pass 2's alias/union
      right-hand-side call.
    - `src/parser/body-type-lowering.ts:375–376` — the `lowerField` inner helper
      0039 introduced, which re-enters `lowerTypeSource` for each field of a
      hoisted inline object, so the arm fires at every nesting depth at every
      position above.
    - `src/parser/body-type-lowering.ts:682` — `collectUnresolvedNamedTypes`'s
      call. Diagnostics only; the fragment is discarded.
  - `src/parser/params.ts:541–544` — the `__inline_<slug>` mint:
    `canonicalForm(lowered)` then `schemaSlug(lowered)` over the hoisted
    fragment. A literal-union field inside a hoisted inline object is part of
    that fragment, so the missing `type` key is part of the hashed input.
  - `src/runtime/typed-query-validation.ts:347–348` — `respondSchemaSlug`:
    `sha256(JSON.stringify(lowered)).slice(0, 16)`. The lowered root's bytes name
    the registered respond tool, and — unlike the canonical hash — this recipe is
    key-**order** sensitive, so both the presence and the position of `type`
    matter here.
  - `src/extension/production-theta-producer.ts:2617–2620` — the PIC-44
    registration cache, keyed by that slug with `JSON.stringify(lowered)` as the
    byte-equality check.
  - `src/extension/production-theta-producer.ts:4975` — `renderTypedAwareQueryText`
    interpolates `JSON.stringify(lowered)` into the QRY-15 instruction, so the
    fragment is shown to the model, not only enforced.
  - `src/runtime/respond-tool-wire.ts:55–69` — `rootIsArgumentObjectSatisfiable`.
    A bare `enum` root is caught by the `lowered["enum"] === undefined` clause
    (`:64`); a `{"type":"string", …}` root is caught by the `type === "object"`
    test (`:57–59`). Both answer `false`, so the envelope decision is the same
    for both spellings (§Reproduction, *Slug and registration consequence*).
  - `src/seams/schema-validator.ts:112` (`allErrors: true`) and `:155–163` (every
    AJV `ErrorObject` mapped to one `ValidationError`) — why the two spellings
    produce different **issue lists** for a non-string payload while accepting
    and rejecting the same values.
  - `src/parser/schema-lowering.ts:252–259` — `buildSidecar`'s named-enum-position
    map, included "iff the source type was a named `enum`; anonymous
    string-literal-union positions are deliberately absent" (`:252–253`). The
    distinction is keyed to the source type kind, not to the lowered bytes, so
    making the two fragments byte-identical does not disturb it.
  - `docs/spec_topics/schema-subset.md:80` — the rule diverged from.
    `docs/reference/schema-subset.md:151–152` mirrors it.
  - **Positions and sources the arm does not reach**, measured, not assumed:
    - The `params:` field type. `p: "x" | "y"` lowers
      `{"anyOf":[{},{}]}` — `lowerParamsFieldType` routes to `lowerTypeExpr`
      (`src/parser/params.ts:384`), which has no literal sublanguage: each arm
      falls to its trailing catch-all at `:436–438` ("literal lowering is owned
      by the schema-subset leaves"). That asymmetry is 0039 §Fix residual (viii)
      (`:282–285`), unfiled, and a different defect: the `params:` position emits
      neither spelling.
    - A generic argument at any position: `array<"x" | "y">` lowers
      `{"type":"array","items":{"anyOf":[{},{}]}}`, because `lowerTypeExpr`'s
      `array` branch recurses into itself, not into `lowerTypeSource`
      (`src/parser/params.ts:392–395`).
    - A literal arm of a mixed union: `"x" | string` lowers
      `{"anyOf":[{},{"type":"string"}]}`. `parseLiteralArm` fails on `string`, so
      the whole-union check at `:361` fails and the source goes whole to
      `lowerTypeExpr`, whose own union split (`src/parser/params.ts:404–419`)
      lowers the literal arm through that same catch-all. This is 0043's
      §Non-goals bullet.
    - A `let` annotation, `fn` parameter or `fn` return type: those positions run
      the type-grammar pass and no lowering.
- **Observed at:** `0.49.0` (HEAD `52e257bc`). Fully offline and deterministic —
  no live model, no provider. Every value below was produced by scratch vitest
  probes through the shipped front end (`parseThetaDocument` via
  `tests/helpers/e2e-s1.ts`), the shipped lowerers, the shipped
  `respondSchemaSlug` / `respondToolWireSchema`, and the production
  `AjvSchemaValidator`; written, run, and deleted.

## Summary

`docs/spec_topics/schema-subset.md:80` states one emission rule covering two
source forms: "Enum (or string-literal union): `{ "type": "string", "enum":
[...wire values...] }`". The implementation splits the rule across two
functions. `lowerEnumToSchema` handles the named `enum` declaration and emits
the spelled bytes. `lowerTypeSource`'s literal-union arm handles the anonymous
string-literal union and emits `{ enum: [...] }` — the same `enum` array, the
`type` keyword absent.

Both fragments admit and refuse exactly the same JSON values (measured over 13
payloads through the production validator), so no theta accepts or rejects
differently because of this. What differs is bytes, and the bytes are load-bearing
in four places: the canonical schema hash that names a hoisted `__inline_<slug>`
entry; `respondSchemaSlug`, which names the registered `__theta_respond_<slug>`
tool and keys the PIC-44 registration cache; the QRY-15 instruction text the
model is shown; and the AJV issue list that drives QRY-11 respond-repair, which
gains a leading `type` / "must be string" entry once `type` is present.

The sharpest consequence is that two spellings of one declared value set diverge.
`enum Sev { Low = "low", High = "high" }` and `schema Sev = "low" | "high"`
produce `{"type":"string","enum":["low","high"]}` and `{"enum":["low","high"]}`
respectively — different slugs, and two respond-tool registrations where the
spec's single emission rule implies one.

The arm is reached from the `@<T>` and `invoke<T>` annotation roots, the
`schema`-body field type, the alias/union right-hand side, and every inline-object
field at every depth. It is not reached from the `params:` position, from a
generic argument, or from a literal arm of a mixed union; those three lower a
permissive fragment instead and are outside this report.

## Reproduction

Offline, at `52e257bc`. Scratch vitest: `parseDoc` (the real
`parseThetaDocument` with production-shaped deps, `tests/helpers/e2e-s1.ts`),
`lowerQueryResponseSchema`, `buildBodyTypeSchemas`, `lowerTypeSource`,
`lowerInlineObject`, `respondSchemaSlug`, `respondToolWireSchema`,
`respondSchemaIsEnveloped`, and the production `AjvSchemaValidator`. Every
fixture loads with zero diagnostics; a fixture that did not would have thrown.

### The one arm, at every position it reaches

`"x" | "y"`, written at each position `lowerTypeSource` serves:

```
@@ lowerTypeSource('"x" | "y"')  direct
   fragment :: {"enum":["x","y"]}
   unresolved :: []
@@ ann      let r = @<"x" | "y">`go`
   lowered  :: {"enum":["x","y"]}
@@ ann      let r = @<{a: "x" | "y"}>`go`
   lowered  :: {"type":"object","properties":{"a":{"enum":["x","y"]}},"required":["a"],"additionalProperties":false}
@@ ann      let r = @<{a: {b: "x" | "y"}}>`go`
   lowered  :: {"type":"object","properties":{"a":{"$ref":"#/$defs/__inline_f58549a813c166f9"}},"required":["a"],
                "additionalProperties":false,
                "$defs":{"__inline_f58549a813c166f9":
                  {"type":"object","properties":{"b":{"enum":["x","y"]}},"required":["b"],"additionalProperties":false}}}
@@ field    schema S { p: "x" | "y" }
   $defs.S  :: {"type":"object","properties":{"p":{"enum":["x","y"]}},"required":["p"],"additionalProperties":false}
@@ field    schema S { p: {b: "x" | "y"} }
   $defs.S  :: {"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_f58549a813c166f9"}},"required":["p"],
                "additionalProperties":false,"$defs":{"__inline_f58549a813c166f9": …as above…}}
@@ alias    schema X = "x" | "y"
   $defs.X  :: {"enum":["x","y"]}
@@ alias    schema X = {b: "x" | "y"}
   $defs.X  :: {"$ref":"#/$defs/__inline_f58549a813c166f9","$defs":{"__inline_f58549a813c166f9": …as above…}}
@@ lowerInlineObject('b: "x" | "y"')
   fragment :: {"type":"object","properties":{"b":{"enum":["x","y"]}},"required":["b"],"additionalProperties":false}
```

`@<S>` over `schema S { p: "x" | "y" }` returns the `$defs.S` bytes above as the
document root, so the annotation and body positions agree byte for byte.

The non-string literal forms take the same arm:

```
"x"            -> {"const":"x"}            (schema-subset.md:79, correct)
1 | 2          -> {"enum":[1,2]}
"x" | 1        -> {"enum":["x",1]}
true | false   -> {"enum":[true,false]}
"x" | null     -> {"enum":["x",null]}
```

Controls that must not move — the arm is not reached:

```
string | null  -> {"type":["string","null"]}          (SUBS-1, :81)
"x" | string   -> {"anyOf":[{},{"type":"string"}]}    (literal arm lowers {})
```

### The two spellings of one emission rule

`:80` covers both. The implementation does not:

```
@@ enum Sev { Low = "low", High = "high" }
   $defs.Sev :: {"type":"string","enum":["low","high"]}
   @<Sev>    :: {"type":"string","enum":["low","high"]}
@@ schema Sev = "low" | "high"
   $defs.Sev :: {"enum":["low","high"]}
   @<Sev>    :: {"enum":["low","high"]}
```

### Real AJV over both spellings

Through the production `AjvSchemaValidator` (`strict: false`, `allErrors: true`,
`ajv-formats` installed), compiling `{"enum":["x","y"]}` and
`{"type":"string","enum":["x","y"]}`:

```
payload      bare        typed
"x"          ACCEPT      ACCEPT
"y"          ACCEPT      ACCEPT
"z"          REJECT      REJECT
""           REJECT      REJECT
1            REJECT      REJECT
0            REJECT      REJECT
true         REJECT      REJECT
false        REJECT      REJECT
null         REJECT      REJECT
[]           REJECT      REJECT
["x"]        REJECT      REJECT
{}           REJECT      REJECT
{"x":1}      REJECT      REJECT
```

The admitted value set is identical on all thirteen. The reported issue list is
not:

```
bare  "z" :: [enum "must be equal to one of the allowed values"]
typed "z" :: [enum "must be equal to one of the allowed values"]
bare   1  :: [enum "must be equal to one of the allowed values"]
typed  1  :: [type "must be string", enum "must be equal to one of the allowed values"]
bare  null:: [enum "must be equal to one of the allowed values"]
typed null:: [type "must be string", enum "must be equal to one of the allowed values"]
```

A non-string payload gains a leading `type` issue. `src/seams/schema-validator.ts:155–163`
maps every AJV error to a `ValidationError`, so both entries reach the QRY-11
respond-repair follow-up and the `invoke<T>` return-validation error.

### Slug and registration consequence

```
@<"low" | "high">                        {"enum":["low","high"]}
  respondSchemaSlug                      3738bdf57eb9ee93
  respondSchemaIsEnveloped               true
  respondToolWireSchema                  {"type":"object","properties":{"value":{"enum":["low","high"]}},"required":["value"]}
@<Sev>  where schema Sev = "low" | "high"
  lowered                                {"enum":["low","high"]}
  respondSchemaSlug                      3738bdf57eb9ee93
@<Sev>  where enum Sev { Low = "low", High = "high" }
  lowered                                {"type":"string","enum":["low","high"]}
  respondSchemaSlug                      16d4106209c9ee70
  respondSchemaIsEnveloped               true
  respondToolWireSchema                  {"type":"object","properties":{"value":{"type":"string","enum":["low","high"]}},"required":["value"]}
```

Two tool names — `__theta_respond_3738bdf57eb9ee93` and
`__theta_respond_16d4106209c9ee70` — and two PIC-44 registration-cache entries
for one declared value set. The envelope decision is the same for both
(`respondSchemaIsEnveloped` is `true` either way), so the wire *shape* is stable
and only the enveloped payload schema and the tool name move.

Bytes the spelled form would produce, and the slugs they carry:

```
{"type":"string","enum":["low","high"]}          respondSchemaSlug 16d4106209c9ee70
{"type":"string","enum":["x","y"]}               respondSchemaSlug 6fe5fb9a460eb639
{"type":"string","enum":["a","b"]}               respondSchemaSlug 2451e4ccd157b4a4
canonical {"additionalProperties":false,"properties":{"b":{"enum":["x","y"],"type":"string"}},"required":["b"],"type":"object"}
                                                 schemaSlug        e5d2019c9669ee7c   (today: f58549a813c166f9)
```

The `__inline_` slug moves because the canonical form gains a key; it is
insensitive to key order (`docs/spec_topics/schema-subset.md:100`). The respond
slug moves because `JSON.stringify` is not, so the emission order chosen for the
fixed spelling is part of the contract — `type` first, matching
`lowerEnumToSchema` (`src/parser/body-type-lowering.ts:100`), is what makes the
two spellings collapse to one slug.

### The pins that carry the current bytes

```
tests/inline-object-nested-lowering.test.ts:1005   a10  toEqual({ enum: ["x", "y"] })
tests/inline-object-nested-lowering.test.ts:352    a5   G2_NESTED_FRAGMENT properties.b = { enum: ["x","y"] }
tests/inline-object-nested-lowering.test.ts:357    a5   G2_NESTED_CANONICAL, which derives G2_NESTED_INLINE
tests/respond-tool-wire.test.ts:155                     ENVELOPE row expectedRoot = { enum: ["a", "b"] }
tests/production-typed-query-validation.test.ts:252     properties["category"] = { enum: ["bug","feature","question"] }
tests/typed-query-schema-integration.test.ts:133        hand-written LOWERED.properties.status = { enum: ["ok","degraded"] }
```

Green and unmoved by the fix:

```
tests/schema-alias-union-decl.test.ts:1061–1087    c5, behavioural: arms accepted, "zzz" and 1 rejected
tests/schema-lowering-hash.test.ts:87              canonicalForm over a hand-built value, not a lowering result
tests/e2e-s3-schema-lowering-conformance.test.ts:35, :42   lowerEnumToSchema, already the spelled form
tests/binder-inference-provider-mapping.test.ts:484–587     named enum, already the spelled form
```

No committed `.theta` / `.thetalib` fixture pins the bytes.
`tests/fixtures/h7a/acceptance.theta:21` carries `status: "ok" | "degraded"`, but
H7a scores `golden-transcript.json`, which records binder calls, fragments, tool
results and turn ends — no lowered schema and no respond-tool name. The three
`docs/examples/` files carrying literal unions
(`handle-error.theta:8`, `review-lens.theta:12`, `sentiment.theta:8`) are scored
by `tests/committed-fixture-parse-gate.test.ts` for zero diagnostics only.

## Expected behaviour

`docs/spec_topics/schema-subset.md:80`, verbatim:

```
   - Enum (or string-literal union): `{ "type": "string", "enum": [...wire values...] }`.
```

One rule, two source forms, one emission. So:

```
"x" | "y"                      -> {"type":"string","enum":["x","y"]}
schema X = "low" | "high"      -> {"type":"string","enum":["low","high"]}
schema S { p: "x" | "y" }      -> {"type":"object","properties":{"p":{"type":"string","enum":["x","y"]}},
                                   "required":["p"],"additionalProperties":false}
@<{a: {b: "x" | "y"}}>         -> the nested fragment carries the same, and hoists under
                                  __inline_e5d2019c9669ee7c
```

and `enum Sev { Low = "low", High = "high" }` and `schema Sev = "low" | "high"`
lower to byte-identical fragments, hash to one slug, and share one respond-tool
registration.

`docs/reference/schema-subset.md:151–152` repeats the rule for the user-facing
reference. `docs/spec_topics/schema-subset.md:85` (*Array element order*) fixes
the `enum` array's order as source enumeration order, which the current arm
already satisfies; only the `type` keyword is missing.

Three boundaries of the rule the spec does **not** state, and which the expected
behaviour therefore does not extend to:

- A union of non-string literals (`1 | 2`, `true | false`). `:80` says "wire
  values" of an enum or a **string**-literal union; `:79` covers a single literal
  of any type. No rule covers `1 | 2`, and `{"type":"string","enum":[1,2]}` would
  reject every value the declaration admits.
- A mixed literal union including `null` (`"x" | null`). `:81` treats `null` as a
  primitive for SUBS-1, but SUBS-1 governs unions of `PrimitiveType`
  (`docs/spec_topics/grammar.md:97`), and `"x"` is a `LiteralType` (`:102`), so
  neither `:80` nor `:81` reaches the mixture.
- The `params:` position, which emits neither spelling.

## Actual behaviour / root cause

`lowerTypeSource` splits its source on top-level `|`
(`src/parser/body-type-lowering.ts:358`) and, when every arm parses as a literal,
returns at `:362`:

```ts
return { enum: literals.map((lit) => (lit as { readonly value: unknown }).value) };
```

That is the whole of it. The object literal has one key. Nothing downstream adds
`type`: `lowerObjectFields` (`:119–125`) stores the returned fragment as the
field's value unchanged, `hoistInlineObjectType` hashes whatever it is handed,
and `pruneDocumentDefs` copies rather than rewrites.

The named-`enum` half of the same rule lives in a different function —
`lowerEnumToSchema` (`:95–101`) — reached from `buildBodyTypeSchemas` pass 1
(`:521–523`), and it does emit `type`. The two functions were written against the
two halves of `:80` independently and were never reconciled, so the rule holds
for one source form and not the other.

The arm is also `parseLiteralArm`-driven (`:693–714`), which recognises quoted
strings, `true`, `false`, `null` and numeric literals alike. A single `type`
keyword cannot be added unconditionally: the arm serves four literal kinds and
only the all-strings case is the one `:80` spells.

The divergence predates bug 0039. What 0039 changed is reach: its part B routes
each field of a hoisted inline object back through `lowerTypeSource`
(`:375–376`), specifically so the literal sublanguage survives at depth, so the
arm now fires at every nesting level of every `lowerTypeSource` position instead
of at the top level only.

Two in-tree records state the current output incorrectly, both written by 0039:

- `docs/bugs/0039-…md:570–575` (§Fix constraint *The literal sublanguage must not
  regress*) says a nested field would lower `anyOf: [{}, {}]` "where the same
  field at depth 0 lowers `{"type":"string","enum":["x","y"]}`". Depth 0 lowers
  `{"enum":["x","y"]}`; the constraint's mechanism is right and its cited byte
  string is the spec's, not the implementation's.
- `docs/bugs/0039-…md:279–281` (residual (vii)) and
  `tests/inline-object-nested-lowering.test.ts:856` and `:993` attribute the rule
  to SUBS-1 at `:81`. SUBS-1 governs a union of `PrimitiveType` arms; a
  string-literal union is `LiteralType` arms and is governed by `:80`. The
  behaviour those records describe is correct; the rule id and line are not.

## Why it matters

- **One declared value set registers two respond tools.**
  `enum Sev { Low = "low", High = "high" }` and `schema Sev = "low" | "high"`
  produce `__theta_respond_16d4106209c9ee70` and
  `__theta_respond_3738bdf57eb9ee93`. Tool registration is permanent — pi exposes
  no unregister (`src/extension/production-theta-producer.ts:2630–2640`) — so a
  theta using both spellings for the same set leaves two live registrations where
  the spec's single emission rule implies one, and the PIC-44 byte-equality reuse
  (`:2617–2620`) cannot collapse them.
- **The fragment is conveyed, not only enforced.**
  `src/extension/production-theta-producer.ts:4975` interpolates
  `JSON.stringify(lowered)` into the QRY-15 instruction
  (`docs/spec_topics/query/query-tool-loop.md:37`), and
  `respondToolWireSchema` puts the same bytes in the registered tool's
  `parameters`. A model shown `{"enum":["low","high"]}` is shown a schema the
  spec does not pin; a model shown `{"type":"string","enum":["low","high"]}` for
  the equivalent `enum` declaration is shown the pinned one. The two forms are
  not interchangeable inputs to grammar-constrained decoding on every provider,
  and nothing in-tree measures the difference.
- **The slug is the on-disk and on-wire contract.**
  `docs/spec_topics/schema-subset.md:94` states the canonical-hash recipe "is part
  of the on-disk and on-wire contract — changing it is a breaking change for any
  cached artefact, fixture snapshot, or replayable provider payload". The bytes
  hashed are the lowered fragment (`:98`, step 1 *Input*), so a fragment that does not
  match the emission table produces a slug for a schema the spec never spelled.
  Fixing this later costs strictly more than fixing it now: each release adds
  cached artefacts keyed on the divergent bytes.
- **Repair text differs between the two spellings.** A non-string payload against
  the bare form yields one issue; against the spelled form, two — `type` first.
  QRY-11 respond-repair renders the issue list and the lowered schema into the
  follow-up turn (`renderFollowUpTurn`,
  `src/runtime/query-followup-render.ts:106–110`), so an author who moves a
  declaration between the two spellings changes the repair instruction without
  changing the declared type.
- **The divergence is documented in-tree as a fact rather than a defect.**
  `tests/respond-tool-wire.test.ts:152` labels the row "a literal-union root
  (lowered to a bare `enum`, no `type`)", and
  `tests/schema-alias-union-decl.test.ts:1063–1067` records the shape as "the
  implementer's choice". Both read as settled; `:80` settles it the other way.
- **No gate scores it.** Every pin listed in §Reproduction asserts the current
  bytes or asserts behaviour that does not move, so the whole default suite is
  green at HEAD and would stay green if the divergence widened.

## Fix

Emit the spec's spelling from the literal-union arm when every arm is a string
literal, in `src/parser/body-type-lowering.ts:359–363`:

```ts
const arms = splitTopLevel(s, "|");
if (arms.length > 1) {
  const literals = arms.map(parseLiteralArm);
  if (literals.every((lit) => lit !== undefined)) {
    const values = literals.map((lit) => (lit as { readonly value: unknown }).value);
    return values.every((v) => typeof v === "string")
      ? { type: "string", enum: values }
      : { enum: values };
  }
}
```

One frame, one branch. `type` is written **first**, matching `lowerEnumToSchema`
(`:100`), so a string-literal union and the equivalent named `enum` produce
byte-identical fragments and therefore one `respondSchemaSlug`, one
`__inline_<slug>`, and one registration-cache entry. Key order does not affect the
canonical hash (`docs/spec_topics/schema-subset.md:100` sorts keys) but does affect
`respondSchemaSlug` (`src/runtime/typed-query-validation.ts:348`), which hashes
`JSON.stringify`.

The all-strings guard is required, not defensive. `parseLiteralArm`
(`src/parser/body-type-lowering.ts:693–714`) accepts numbers, `true`, `false` and
`null`, so `1 | 2` and `"x" | null` reach this arm. `:80` spells the emission for
an enum or a **string**-literal union only; `{"type":"string","enum":[1,2]}` would
refuse every value `1 | 2` declares. Those inputs keep today's bare-`enum`
fragment and stay outside the fix, as §Expected behaviour states — a permissive
byte shape the spec does not cover, not a wrong one.

The single-literal arm (`:364–369`) is untouched: `{ const: … }` is what `:79`
spells.

**Existing pins that move by design**, all in the same change:

- `tests/inline-object-nested-lowering.test.ts:1005` — `a10`'s expected value
  becomes `{ type: "string", enum: ["x", "y"] }`. Its failure message
  (`:1004`) cites `body-type-lowering.ts:139–150`, stale by 0039's own fix;
  re-derive it to `:358–369` and re-anchor the comment at `:992–994` on
  `schema-subset.md:80` rather than SUBS-1. 0039 wrote `a10` for exactly this
  event — the comment states the pin exists so a literal-emission change "reds as
  ITSELF" — so re-pinning it with the spec line as authority is the pin
  discharging its purpose, not a weakening.
- `tests/inline-object-nested-lowering.test.ts:352` — `G2_NESTED_FRAGMENT`'s
  `properties.b` becomes `{ type: "string", enum: ["x", "y"] }`.
- `tests/inline-object-nested-lowering.test.ts:357` — `G2_NESTED_CANONICAL`
  becomes
  `{"additionalProperties":false,"properties":{"b":{"enum":["x","y"],"type":"string"}},"required":["b"],"type":"object"}`,
  and `G2_NESTED_INLINE` follows it from `__inline_f58549a813c166f9` to
  `__inline_e5d2019c9669ee7c`. The constant is the input to the file's own
  independent slug oracle (group (0)), so the oracle re-derives the new name
  rather than having it pasted in.
- `tests/inline-object-nested-lowering.test.ts:856` — `a5`'s message cites
  `schema-subset.md:81 (SUBS-1)` for a literal-union rule; re-derive to `:80`.
- `tests/respond-tool-wire.test.ts:151–156` — the ENVELOPE row's `expectedRoot`
  becomes `{ type: "string", enum: ["a", "b"] }` and the row label loses "lowered
  to a bare `enum`, no `type`". The row's subject — that a non-object root rides
  the envelope — is unchanged: `respondSchemaIsEnveloped` is `true` for both
  spellings (§Reproduction, *Slug and registration consequence*), so only the
  fixture bytes move, not the assertion.
- `tests/production-typed-query-validation.test.ts:252` —
  `properties["category"]` becomes `{ type: "string", enum: ["bug", "feature",
  "question"] }`.
- `tests/typed-query-schema-integration.test.ts:133` — the hand-written `LOWERED`
  constant, whose comment (`:126–129`) claims it is what the lowering produces.
  Nothing in that file compares it against the lowerer, so it is a
  documentation-accuracy edit; its AJV outcomes (`CONFORMING` accepted,
  `NON_CONFORMING` rejected on `/status`) do not move.

**Records corrected in the same change**, each falsified or mislabelled by the
fix:

- `tests/schema-alias-union-decl.test.ts:1063–1067` — the comment asserting the
  fragment shape is "the implementer's choice between the enum form … and an
  `anyOf` of `const`s". `:80` fixes it. The cell's assertions stay as written and
  stay green; only the rationale changes.
- `src/parser/body-type-lowering.ts:293` and `:302–304` — `lowerTypeSource`'s doc
  comment, which says a literal union "lowers to an `enum`" and names "the SUBS-1
  enum form". Re-derive to the emitted bytes and to `:80`.
- `tests/unresolved-annotation-lowering.test.ts:10` and `:64` state `:80`'s rule
  for the named-`enum` case only; neither is falsified, and neither needs an edit.

**Blast radius.** Lowered bytes move for exactly the inputs enumerated in
§Reproduction — an all-string-literal union at any `lowerTypeSource` position at
any depth — and those bytes are conveyed and content-addressed:

- **Respond-tool names change for affected annotations.** An `@<"low" | "high">`
  registers under `__theta_respond_16d4106209c9ee70` instead of
  `__theta_respond_3738bdf57eb9ee93`, and collides — byte-equally, so the cache
  reuses the registration — with the equivalent named `enum`. That collapse is
  the correction: `:80` states one emission for both.
- **`__inline_<slug>` names change** for every hoisted inline object carrying a
  string-literal-union field. The names are synthesised, never author-written
  (`docs/spec_topics/schema-subset.md:108`), and are internal to one lowered
  document, so nothing outside the lowering resolves them.
- **No payload changes verdict.** The accept/reject table above is identical on
  all thirteen probed values through the production validator; the fix adds a
  redundant constraint to a set already closed by `enum`. The QRY-11 and
  `invoke<T>` issue lists gain a leading `type` entry for a non-string payload.
- **The wire envelope decision is unchanged.** `rootIsArgumentObjectSatisfiable`
  answers `false` for both spellings, by two different clauses
  (`src/runtime/respond-tool-wire.ts:57–59` versus `:64`). No annotation crosses
  between the pass-through and enveloped forms.
- **Argument coercion is unchanged.** `coerceRespondWireArguments` only parses a
  JSON-encoded string where the schema position admits `object` or `array`
  (`src/runtime/respond-tool-wire.ts:286–290`). Neither spelling admits either, so
  no position starts or stops being coerced.
- **The sidecar is unchanged.** `buildSidecar` includes a named-enum position "iff
  the source type was a named `enum`" (`src/parser/schema-lowering.ts:252–254`),
  keyed to the source kind, so making the fragments byte-identical does not make
  an anonymous literal union start carrying an enum tag.
- **The `params:` position is byte-untouched.** It never reaches this arm
  (§Reproduction). `tests/params-inline-object-lowering.test.ts` and its 37-cell
  bug-0035 lock stay byte-identical.
- **No source-language change.** No theta that loads today stops loading, and no
  diagnostic is added, widened or narrowed. `docs/spec_topics/diagnostics/` is
  untouched, so DIAG-2 needs no registry edit.

**Test witness — unit, offline, no live provider.** Every fixture in
§Reproduction is a `lowerTypeSource`, `lowerInlineObject`, `buildBodyTypeSchemas`
or `lowerQueryResponseSchema` call. Required beyond re-pinning the six moved
cells: a byte pin at each of the six positions the arm reaches, proving they
agree; a byte-equality cell asserting `enum Sev { Low = "low", High = "high" }`
and `schema Sev = "low" | "high"` lower identically **and** hash to one
`respondSchemaSlug`; a real-AJV table over both spellings proving the admitted
value set does not move and that a non-string payload's issue list gains the
`type` entry; no-op cells for `1 | 2`, `"x" | null`, `true | false`, `"x" | 1`
proving the all-strings guard holds in the refusing direction; and no-op cells for
`params: p: "x" | "y"`, `array<"x" | "y">` and `"x" | string` proving the three
unreached positions are byte-identical to HEAD.

## Non-goals

- **The `params:` position's missing literal sublanguage.** `p: "x" | "y"` lowers
  `{"anyOf":[{},{}]}`, which is neither spelling — a permissive fragment
  accepting any two values. That is 0039 §Fix residual (viii) (`:282–285`),
  unfiled, and closing it would move the frozen `params:` bytes that 0039's
  settled route mandates be byte-shared. Nothing here changes it.
- **A literal arm of a mixed union.** `"x" | string` lowers
  `{"anyOf":[{},{"type":"string"}]}`; the literal arm's `{}` comes from
  `lowerTypeExpr`'s trailing catch-all, never from this arm.
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md) §Non-goals owns it.
- **A generic argument's element type.** `array<"x" | "y">` lowers
  `{"type":"array","items":{"anyOf":[{},{}]}}` because `lowerTypeExpr`'s `array`
  branch recurses into itself (`src/parser/params.ts:392–395`). Same family as
  the previous bullet.
- **Non-string literal unions.** `1 | 2`, `true | false`, `"x" | null` keep the
  bare `{ enum: [...] }`. The subset admits `enum` as a validation keyword
  (`docs/spec_topics/schema-subset.md:7`), so the fragment is inside the subset;
  what is absent is a step-3 rule spelling it. Whether the emission table should
  gain one is a spec question, not this report's.
- **Whether `respondSchemaSlug` should use the canonical form.** It hashes
  `JSON.stringify(lowered)` (`src/runtime/typed-query-validation.ts:348`) rather
  than the key-sorted canonical form `docs/spec_topics/schema-subset.md:99–105`
  defines, which is why emission order is contractual here. Unfiled and
  unchanged; this report only fixes the emission order so the two spellings
  agree under the recipe as it stands.

## Provenance

- Origin: bug
  [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
  §Fix (0.49.0) *Residuals* item (vii) (`:279–281`), recorded also in
  `.pi/tmp/fixes/0039-report.md` §Residuals item 7, left unfiled. This report
  files it, re-derives every value at HEAD `52e257bc`, and corrects the record in
  three places: the governing line is `:80` (the step-3 enum / string-literal-union
  emission rule), not `:81` (SUBS-1, which governs unions of `PrimitiveType`); the
  divergence is not confined to the annotation root but reaches six positions at
  every depth after 0039's part B; and 0039 §Fix's own constraint text
  (`:570–575`) states the depth-0 output as `{"type":"string","enum":["x","y"]}`
  where the implementation emits `{"enum":["x","y"]}`.
- Spec: `docs/spec_topics/schema-subset.md:7` (`enum` / `const` in the subset),
  `:74` (step 3, *Emits per type form*), `:79` (the single-literal `const` rule),
  `:80` (the rule diverged from), `:81`
  ([SUBS-1](../spec_topics/schema-subset.md#subs-1), unions of primitives),
  `:85` (*Array element order*), `:87` (step 5, the sidecar's named-enum
  positions and the deliberate absence of anonymous literal-union positions),
  `:94` (§Canonical schema hash — the on-disk/on-wire contract statement), `:98`
  (step 1, the lowered fragment as hash input), `:100` (the key-sorting rule),
  `:104` (array elements left in lowering order),
  `:108` (§Synthesised names — `__inline_<slug>`,
  `__theta_respond_<slug>`); `docs/spec_topics/grammar.md:94` (`Type "|" Type`),
  `:97` (`PrimitiveType`), `:102` (`LiteralType`), `:109` (§Inline object types —
  the recursive `Type` inside each field);
  `docs/spec_topics/query/query-tool-loop.md:37` (QRY-15 conveyance);
  `docs/spec_topics/schemas.md:62` (§Enum declarations — the name-is-wire
  default the fixed spelling's `enum` array carries).
  User-facing reference: `docs/reference/schema-subset.md:151–152`.
- Implementation evidence at `52e257bc`: `src/parser/body-type-lowering.ts:95–101`
  (`lowerEnumToSchema`, emission at `:100`), `:119–125` (`lowerObjectFields`'s
  per-field call), `:151` (`lowerInlineObject`), `:293`/`:302–304`
  (`lowerTypeSource`'s doc comment on the literal arm), `:335–341` (the function
  signature), `:358–369` (the literal sublanguage — union arm `:359–363`, single
  literal `:364–369`), `:375–376` (the `lowerField` inner helper), `:521–523`
  (pass 1's enum seeding), `:545` (pass 2's `schema`-body call), `:566` (pass 2's
  alias-RHS call), `:682` (`collectUnresolvedNamedTypes`'s call), `:693–714`
  (`parseLiteralArm`); `src/parser/params.ts:384` (`lowerTypeExpr`), `:392–395`
  (its `array` branch's self-recursion), `:404–419` (its union split),
  `:436–438` (its trailing catch-all — the `params:` position's disposition),
  `:541–544` (the `__inline_<slug>` mint); `src/parser/schema-lowering.ts:131` (`schemaSlug`),
  `:243–262` (`buildSidecar`); `src/runtime/query-schema-lowering.ts:139–143`
  (the annotation root's brace arm), `:148` (its non-brace arm);
  `src/runtime/typed-query-validation.ts:347–348` (`respondSchemaSlug`);
  `src/runtime/respond-tool-wire.ts:55–69` (`rootIsArgumentObjectSatisfiable`),
  `:91–94` (`respondToolWireSchema`), `:286–290` (the coercion's structural
  test); `src/runtime/query-followup-render.ts:106–110` (`renderFollowUpTurn`,
  the QRY-12 follow-up render);
  `src/seams/schema-validator.ts:112` (`allErrors: true`), `:155–163` (the AJV
  error mapping); `src/extension/production-theta-producer.ts:2312–2319` (the
  typed-query lowering), `:2617–2620` (the respond registration cache),
  `:3308–3312` (the `invoke<T>` return lowering), `:4975` (the QRY-15
  interpolation).
- Test evidence at `52e257bc`: `tests/inline-object-nested-lowering.test.ts:344–358`
  (`G2_NESTED_FRAGMENT` / `_CANONICAL` / `_INLINE`), `:846–863` (`a5`),
  `:990–1007` (`a10`); `tests/respond-tool-wire.test.ts:141–157` (the ENVELOPE
  fixture table, the literal-union row at `:151–156`);
  `tests/production-typed-query-validation.test.ts:242–255`;
  `tests/typed-query-schema-integration.test.ts:126–138`;
  `tests/schema-alias-union-decl.test.ts:431–434` (`P_SEVERITY`), `:1061–1087`
  (`c5`); `tests/e2e-s3-schema-lowering-conformance.test.ts:35`, `:42`;
  `tests/schema-lowering-hash.test.ts:87`;
  `tests/unresolved-annotation-lowering.test.ts:10`, `:64`;
  `tests/fixtures/h7a/acceptance.theta:21` and `tests/fixtures/h7a/golden-transcript.json`;
  `docs/examples/handle-error.theta:8`, `docs/examples/review-lens.theta:12`,
  `docs/examples/sentiment.theta:8`.
- Measurement: scratch vitest probes under `tests/`, run with
  `npx vitest run`, deleted after use. No source file, test file, or other bug
  document was modified.
