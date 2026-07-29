# Bug 0026 — A schema ctor whose declared field is literally named `__thetaSchema` has that field silently destroyed: `brandSchemaValue` redefines the just-assigned enumerable field into the non-enumerable brand, replacing its value with the schema name

- **Status:** open
- **Kind:** defect — constructor-side, orthogonal to the classification
  privacy bug 0020 fixed (0.32.0). Both ctor hosts evaluate a schema
  constructor by assigning every field as an ordinary enumerable property and
  *then* branding the object; `brandSchemaValue` installs the brand with an
  unconditional `Object.defineProperty`, which — when a *declared* field is
  literally named `__thetaSchema` — replaces the just-assigned property's
  value AND descriptor. `F { __thetaSchema: "user-data", x: 1 }` binds as
  `{"x":1}` with schema tag `F`: the brand ends up healthy (correct name,
  correct non-enumerable posture — post-0020 it classifies as genuine), the
  author's field value is unreachable, and no diagnostic fires at parse or
  runtime. This violates expressions.md §Object construction ("Every
  declared field of the schema must be present" — enforced at parse against
  the source, then un-delivered by the runtime value), the
  runtime-value-model.md object-schema row ("JS plain object keyed by
  **theta-side names**"), and `brandSchemaValue`'s own contract
  (`src/runtime/value.ts:183`: branding leaves the value "indistinguishable
  from a plain object on every theta-visible surface" — here it is
  destructive, not invisible).
- **Affected** (citations verified at HEAD `b542dafe`, 0.32.0):
  - `brandSchemaValue` (`src/runtime/value.ts:186`;
    `Object.defineProperty(value, SCHEMA_TAG, …)` at `:190–195`) — redefines
    an existing enumerable own `__thetaSchema` property (still configurable
    at that point) into the non-enumerable / non-writable / non-configurable
    brand carrying the schema name.
  - The two ctor branding hosts, both assign-then-brand:
    `src/runtime/statement-executor.ts:657–673` (effectful host — enumerable
    field assignment `:664`, branding `:671`) and
    `src/extension/production-theta-producer.ts:5643–5649` (pure host —
    assignment `:5645`, branding `:5648`). These are the only two
    `brandSchemaValue` call sites in `src/`.
  - No parse guard admits-side: neither the schema declaration
    `schema F { __thetaSchema: string, … }` nor the ctor field raises any
    diagnostic (verified: zero diagnostics of any severity). The
    object-construction checks validate declared-field *presence* only
    (`src/parser/theta-document.ts:4709`, `:5035`).
  - Downstream of the destruction: the QRY-18 outbound render walks
    enumerable keys only (`production-theta-producer.ts:5560`,
    `Object.entries`) so the field is absent from interpolated JSON;
    `theta/parse/missing-object-field` is parse-phase-only, so nothing
    observes the runtime loss; the QRY-22 lowering marks the field required
    and the schema closed (`src/parser/body-type-lowering.ts:69`, `:74–75`);
    in-language reads of the destroyed key return the brand string via the
    `hasOwnProperty` reads of residual (ii)
    (`src/runtime/runtime-panics.ts:157` indexed access,
    `src/runtime/stdlib-object.ts:104` `has(k)`).
- **Observed at:** `0.32.0` (`b542dafe`). Offline and deterministic; no live
  model required.

## Summary

Ctor evaluation in both hosts is a two-step: a loop assigns each written
field with plain `obj[field.name] = value` — producing enumerable, writable,
configurable data properties — and, when the ctor names a resolvable schema,
`brandSchemaValue(obj, expr.typeName)` then installs the interpreter-private
declaring-schema brand. The brand lives in the same string-key namespace as
user field names (`SCHEMA_TAG = "__thetaSchema"`, `value.ts:177`). When a
declared field is literally named `__thetaSchema`, the just-assigned property
is configurable, so `Object.defineProperty` succeeds and replaces both halves
of it: the value (`"user-data"` → `"F"`) and the descriptor (enumerable →
non-enumerable, frozen). The author's field is gone from every enumerable
surface — `JSON.stringify`, `keys()`, the `valuesEqual` walk, the QRY-18
render — and its assigned value is unreachable anywhere.

Amplification: every declared field is mandatory in a ctor
(`theta/parse/missing-object-field`, expressions.md §Object construction), so
a schema that declares the field forces **every** in-language construction of
that schema through the destruction. There is no way to construct a value of
such a schema in-language that carries the field. Inbound wire values of the
same schema DO carry it — the QRY-22 gate requires it (`required` +
`additionalProperties: false`) and `rebuildInbound`
(`src/runtime/wire-translation.ts`) rebuilds plain enumerable objects, which
post-0020 are correctly inert — so structurally identical author intent
yields provenance-dependent values that never compare equal.

The sibling tag names do NOT share the defect: a declared ctor field named
`__thetaEnum` or `__thetaResult` survives as ordinary enumerable data
(`makeEnumValue` targets a boxed `String`, `brandResult` targets the `Result`
shape — neither runs against a ctor object), and post-0020 the enumerable
copy no longer forges classification (verified below). The collision is
specific to `__thetaSchema`, the one brand installed onto the ctor's own
object.

In-language, the destroyed field leaves three mutually inconsistent surfaces
(the read mechanism is residual (ii)'s `hasOwnProperty` reads, recorded in
bug 0020 §Fix): `f.has("__thetaSchema")` answers `true`, `f.keys()` omits the
key, and `f["__thetaSchema"]` returns `"F"` — the schema name, not the
assigned `"user-data"`, and not the documented `MissingObjectKeyPanic`.

## Reproduction

All offline, at HEAD `b542dafe`, via a scratch vitest (8 probe groups / 11
tests, written, run green, deleted per scratch policy). The end-to-end probes
drive the production executor with the bug-0020/0017 harness pattern
(`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`).

Verbatim residual case, end-to-end (parse diagnostics: `[]` — none of any
severity):

```theta
schema F { __thetaSchema: string, x: integer }
F { __thetaSchema: "user-data", x: 1 }
```

Outcome `success`; captured verbatim:

```
JSON.stringify(value):  {"x":1}
schemaTagOf(value):     "F"
descriptor:             {"value":"F","writable":false,"enumerable":false,"configurable":false}
```

Unit mechanics (`brandSchemaValue` over a just-assigned field):

```
before: {"value":"user-data","writable":true,"enumerable":true,"configurable":true}
after:  {"value":"F","writable":false,"enumerable":false,"configurable":false}
```

In-language read-back of the destroyed field (three surfaces, one value):

```theta
let f = F { __thetaSchema: "user-data", x: 1 }
f["__thetaSchema"]   // "F"     — the schema name, not "user-data", no panic
f.has("__thetaSchema") // true
f.keys()             // ["x"]
```

Sibling-tag control (probe (b) — preserved-but-inert, the collision is
`__thetaSchema`-specific):

```theta
schema G { __thetaEnum: string, x: integer }
G { __thetaEnum: "Severity", x: 1 }
// JSON {"__thetaEnum":"Severity","x":1}; isEnumValue(value) → false; schemaTagOf → "G"
schema H { __thetaResult: boolean, x: integer }
H { __thetaResult: true, x: 1 }
// JSON {"__thetaResult":true,"x":1}; isResultValue(value) → false
```

QRY-18 outbound render, both ctor hosts (untyped prompt-mode query observed
at the `pi.sendUserMessage` seam; executor-built via a `let`, pure-host via
the ctor written inline in the interpolation):

```
rendered text: "payload: {\"x\":1}"   — the declared field absent, "user-data" nowhere
```

Wire-side contradiction (QRY-22): the declared schema lowers the field as
required and closed —

```
lowerQueryResponseSchema("F", [F]) →
{"type":"object","properties":{"__thetaSchema":{"type":"string"},"x":{"type":"integer"}},
 "required":["__thetaSchema","x"],"additionalProperties":false}
```

— so a typed `@<F>` query that interpolates the ctor value shows the model
`{"x":1}` while requiring `__thetaSchema` in the response; the model must
invent the value the theta thought it had sent. The validated response then
binds with the field as ordinary enumerable data, and
`valuesEqual(ctorValue, JSON.parse('{"__thetaSchema":"user-data","x":1}'))`
is `false` in both argument orders — a ctor-built value never equals its
wire-provenance twin.

Fix-option ordering probe (see option 3): pre-installing the non-writable
brand and then assigning the field throws
`TypeError: Cannot assign to read only property '__thetaSchema' of object
'#<Object>'` (strict mode).

## Expected behaviour (what the spec and module contracts say)

- expressions.md §Object construction: "Every declared field of the schema
  must be present (omissions are `theta/parse/missing-object-field`)". The
  parse gate enforces presence in *source*; the constructed runtime value is
  what that presence is for. A ctor that parses clean with all fields written
  should produce a value carrying all of them.
- runtime-value-model.md, value-representation table, object-schema row: a
  schema value is a "JS plain object keyed by **theta-side names**". Here one
  declared theta-side name is not an (enumerable) key of the runtime value.
- `brandSchemaValue`'s contract (`value.ts:179–185`): the tag is installed
  non-enumerable "so the branded value is indistinguishable from a plain
  object on every theta-visible surface". Branding is specified as additive
  and invisible; for this ctor it is destructive — the branded value is
  missing a field its unbranded twin would have.
- runtime-value-model.md, reference-encoding paragraph: the concrete shapes
  are "implementation details — neither is reachable from theta code". The
  0.32.0 fix made that hold for *classification* (an enumerable same-named
  key is ordinary data); the ctor collision is the remaining reachable edge
  of the string encoding — naming the internal string in a schema makes the
  interpreter's bookkeeping observable (the field vanishes and reads back as
  the schema name).

Expected concretely: `F { __thetaSchema: "user-data", x: 1 }` either
constructs `{"__thetaSchema":"user-data","x":1}` (field preserved, brand
intact) or is rejected loudly — never a silent
`{"x":1}`-with-the-value-gone.

## Actual behaviour / root cause

Assign-then-brand ordering plus an unconditional `defineProperty` plus a
shared namespace. The field loop writes `__thetaSchema` as an ordinary
enumerable property; `brandSchemaValue` then redefines that same key —
legal, because the just-assigned property is configurable — into the frozen
non-enumerable brand whose value is the schema name. No guard exists at any
layer: the parser admits the field name in declarations and ctors (bug 0020
established the admission for the sibling tag; verified here for
`__thetaSchema` with zero diagnostics), the ctor hosts do not special-case
it, and `brandSchemaValue` does not check for a pre-existing own key. The
0.32.0 fix hardened the *read* side (classification by non-enumerable
descriptor); the *write* side still collides because the brand is a string
property in the same namespace as user field names.

## Why it matters

Honest reachability, mirroring the parent bug: the trigger requires a theta
author to literally declare a field named `__thetaSchema` — an
interpreter-internal string, not a plausible domain field name (unlike bug
0017's `ok: boolean`). Accidental collision is improbable; this report does
not claim otherwise. When it fires, though, the failure is deterministic,
diagnostic-free, and self-contradictory across surfaces:

- The value silently loses a declared field at every enumerable surface, and
  the parse-time presence guarantee (`missing-object-field`) has no runtime
  counterpart to catch the loss.
- The in-language read surfaces disagree with each other: `has` says present,
  `keys()` says absent, indexed access returns a *different string than was
  assigned* (the schema name) — corrupted data rather than missing data.
- The wire contract inverts: QRY-22 requires of the model a field the QRY-18
  render can never show it and the theta can never construct; wire-provenance
  and ctor-provenance values of the same schema are structurally unequal.
- Contract erosion: post-0020 the spec pins the encoding as unreachable from
  theta code and `brandSchemaValue` promises invisibility; this wrinkle is
  the one construction-side spot where both statements are still false.

## Fix options and recommendation

1. **Module-private `Symbol` brands (the parent report's Option 2;
   recommended).** Move the brand out of the string-key namespace:
   `SCHEMA_TAG` (and, for one posture, all three tags) becomes a module
   `Symbol`, installed non-enumerable as today. A declared `__thetaSchema`
   field then coexists with the brand as ordinary enumerable data — post-0020
   an enumerable string-keyed copy is already inert for classification — and
   this wrinkle disappears wholesale rather than per-name. It also closes
   residual (ii)'s read-side visibility in the same stroke: the
   `hasOwnProperty` reads at `stdlib-object.ts:104` and
   `runtime-panics.ts:157` no longer see any brand under a string key, so
   `obj.has("__thetaSchema")` on a branded value answers `false` and indexed
   access raises the documented `MissingObjectKeyPanic`. Costs: diverges from
   the string-tag + descriptor-privacy pattern bugs 0017/0020 established
   (`privateBrandOf` reworked for `Symbol` keys — cleanest as one migration
   of all three tags, a wider diff than this bug alone needs); the
   non-normative reference-encoding paragraph naming the string properties
   needs the matching edit (permitted — "may change without a spec
   revision"); the bug-0020 clone/wire audit note carries over unchanged
   (Symbols also do not survive JSON round-trips, so boundaries re-enter
   through the constructors, as `brandResult`'s comment already requires).
2. **Reject the reserved theta-side field name at parse time.** A new
   `theta/parse/*` diagnostic at the schema-declaration site for a field
   whose theta-side name is `__thetaSchema` (arguably all three `__theta*`
   tag names, for uniformity — the siblings are preserved-but-inert today).
   The declaration is the single choke point: a ctor field must be declared
   (`theta/parse/extra-object-field` otherwise), so rejecting the declaration
   covers every ctor; bare object literals are already rejected wholesale
   (`theta/parse/bare-object-literal`). Costs: the registry is closed —
   adding the code is a DIAG-2 registry amendment
   (`docs/spec_topics/diagnostics/code-registry-parse.md` +
   `diagnostic-shape.md` DIAG-2; admissible in a 1.x minor under the GOV-15
   diagnostic-registry carve-out) — and it promotes an implementation-detail
   string into a permanent language-surface reserved name, in tension with
   the reference-encoding paragraph's "may change without a spec revision"
   mobility (the rejection outlives any later encoding change or becomes
   compat baggage). Smaller than option 1; leaves residual (ii) untouched.
3. **Brand-before-assign ordering.** Rejected — analysed in both variants:
   (a) with the brand kept non-writable (as today), the subsequent field
   assignment throws `TypeError: Cannot assign to read only property
   '__thetaSchema'` (probed; module code runs in strict mode) — the executor
   reclassifies a non-panic throw as `theta/runtime/internal-error`
   (`runtime-panics.ts`), so a parse-clean program trades silent destruction
   for a runtime crash; (b) making the brand writable so the assignment
   succeeds inverts the corruption: assignment to an existing own data
   property updates the value while inheriting the non-enumerable descriptor,
   so the brand's value becomes the user's field value (`schemaTagOf` →
   `"user-data"`) and the field's data selects, by name, which declared
   schema's theta→wire renames the QRY-18 render applies — re-opening the
   value-controlled-brand class bug 0020 closed, now through the brand slot
   itself.

A fourth variant — skip branding when the ctor object already carries an own
`__thetaSchema` key — preserves the field but silently drops wire-name
translation for that value (QRY-18 renders theta-side names), trading one
silent wrong for another; not recommended.

## Provenance

- Origin: bug 0020 §Fix (0.32.0), Residuals item (i)
  (`docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md`): "The
  ctor-collision wrinkle (the report's adjacent item (i)) survives Option 1 —
  constructor-side, orthogonal to classification privacy: a schema ctor whose
  *declared* field is literally named `__thetaSchema` has that field's value
  destroyed when `brandSchemaValue` redefines the just-assigned enumerable
  property into the brand". First identified as probe 9 of the 0020 triage
  scratch suite; recorded in the parent report's Fix option 2 as the adjacent
  wrinkle `Symbol` brands would fix wholesale, and deliberately not pinned by
  the 0020 offline lock (`tests/enum-schema-tag-privacy.test.ts` header:
  "OUT OF SCOPE (fix option 1): the ctor-collision wrinkle … constructor-side
  and deliberately NOT pinned here").
- Spec: `docs/spec_topics/expressions.md` §Object construction;
  `docs/spec_topics/runtime-value-model.md` (value-representation table,
  object-schema row; reference-encoding paragraph);
  `docs/spec_topics/diagnostics/code-registry-parse.md` +
  `docs/spec_topics/diagnostics/diagnostic-shape.md` DIAG-2 (fix option 2's
  amendment path).
- Implementation evidence at `b542dafe`: `src/runtime/value.ts:177`
  (`SCHEMA_TAG`), `:179–185` (the invisibility contract), `:186–197`
  (`brandSchemaValue`, `defineProperty` at `:190–195`), `:143–149`
  (`privateBrandOf`), `:207–210` (`schemaTagOf`);
  `src/runtime/statement-executor.ts:657–673` (effectful ctor host);
  `src/extension/production-theta-producer.ts:5643–5649` (pure ctor host),
  `:5548`/`:5560` (QRY-18 brand recovery + enumerable walk);
  `src/parser/theta-document.ts:4709`/`:5035` (parse-only presence checks);
  `src/parser/body-type-lowering.ts:69`/`:74–75` (required + closed
  lowering); `src/runtime/wire-translation.ts` (`rebuildInbound` — inbound
  values stay plain); `src/runtime/runtime-panics.ts:157` and
  `src/runtime/stdlib-object.ts:104` (the residual-(ii) read surfaces the
  destroyed field is observed through).
- Reproduction: scratch vitest at HEAD (8 probe groups / 11 tests — unit
  destruction mechanics, verbatim end-to-end with zero-diagnostic parse
  admission, in-language read-back, sibling-tag controls, QRY-18 render drop
  through both ctor hosts, provenance-twin inequality, QRY-22
  required-field lowering, brand-before-assign `TypeError`), run green on the
  signatures quoted above, then deleted per scratch policy.
