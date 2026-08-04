# Bug 0026 — A schema ctor whose declared field is literally named `__thetaSchema` has that field silently destroyed: `brandSchemaValue` redefines the constructor-assigned enumerable field into the non-enumerable brand, replacing its value with the schema name

- **Status:** fixed (0.33.0). §Fix as settled — `ENUM_TAG`, `SCHEMA_TAG` and
  `RESULT_TAG` migrated in one stroke from string keys to module `Symbol`s in
  `src/runtime/value.ts`; `privateBrandOf` takes a `symbol`. Neither ctor host
  changed: the collision class disappears because the brands left the
  string-key namespace. Also closes the brand-key half of bug
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md).
- **Kind:** defect — constructor-side, orthogonal to the classification
  privacy bug [0020](./0020-enum-schema-tags-presence-only-forgeable.md) fixed
  (0.32.0). Both ctor hosts evaluate a schema constructor by assigning every
  field as an ordinary enumerable property and *then* branding the object;
  `brandSchemaValue` installs the brand with an unconditional
  `Object.defineProperty`, which — when a *declared* field is literally named
  `__thetaSchema` — replaces the assigned property's value AND descriptor.
  `F { __thetaSchema: "user-data", x: 1 }` binds as `{"x":1}` with schema tag
  `F`: the brand ends up healthy (correct name, correct non-enumerable
  posture — post-0020 it classifies as genuine), the author's field value is
  unreachable, and no diagnostic fires at parse or runtime. This violates
  expressions.md §Object construction ("Every declared field of the schema
  must be present" — enforced at parse against the source, then un-delivered
  by the runtime value), the runtime-value-model.md object-schema row ("JS
  plain object keyed by **theta-side names**"), and `brandSchemaValue`'s own
  contract (`src/runtime/value.ts:183`: branding leaves the value
  "indistinguishable from a plain object on every theta-visible surface" —
  here it is destructive, not invisible).
- **Affected** (citations verified at HEAD `4d645f4f`; `src/` is byte-identical
  to the observation commit `b542dafe` — `git diff b542dafe HEAD -- src/` is
  empty):
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
  - No parse guard on the admitting side: neither the schema declaration
    `schema F { __thetaSchema: string, … }` nor the ctor field raises any
    diagnostic (verified: zero diagnostics of any severity). The
    object-construction checks validate declared-field *presence* only
    (`src/parser/theta-document.ts:4711` — the `StructuralRefs.schemas` map;
    `:5038` — `checkObjectExpr`).
  - Downstream of the destruction: the QRY-18 outbound render walks
    enumerable keys only (`production-theta-producer.ts:5560`,
    `Object.entries`) so the field is absent from interpolated JSON;
    `theta/parse/missing-object-field` is parse-phase-only, so nothing
    observes the runtime loss; the QRY-22 lowering marks the field required
    and the schema closed (`src/parser/body-type-lowering.ts:69`, `:74–75`);
    in-language reads of the destroyed key return the brand string through
    the unfiltered own-property reads reported as bug
    [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
    (`src/runtime/runtime-panics.ts:157` indexed access, `:176` member
    access, `src/runtime/stdlib-object.ts:104` `has(k)`).
- **Observed at:** `0.32.0` (`b542dafe`). Offline and deterministic; no live
  model required.
- **Fix ordering:** this bug lands before bug
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md). The Symbol migration in §Fix
  also closes 0027's brand-key half; 0027 is re-scoped against the post-0026
  baseline and ships as a separate commit.

## Fix (0.33.0)

The settled §Fix, implemented as written. Line anchors are at the fix commit.

**Symbol brands (`src/runtime/value.ts`).** The three interpreter-private
brands leave the string-key namespace: `ENUM_TAG` (`:56`), `RESULT_TAG`
(`:88`) and `SCHEMA_TAG` (`:233`) are module `Symbol`s, and `privateBrandOf`
(`:186`) takes a `symbol` key. A symbol key is unreachable from `JSON.parse`
and from theta-side object construction — both mint string keys only — so a
declared field named `__thetaSchema` and the brand occupy disjoint key spaces
and the ctor's assign-then-brand sequence can no longer overwrite the field.
The three constructors keep their non-enumerable / non-writable /
non-configurable install (`makeEnumValue` `:137`, `brandSchemaValue` `:251`,
`brandResult` `:326`) and `privateBrandOf` keeps the non-enumerable
predicate: the descriptor posture bounds propagation through spread /
`Object.assign`, which copy own *enumerable* symbol-keyed properties, and
keeps the read side aligned with what the constructors write. The three
readers (`enumTagOf` `:206`, `schemaTagOf` `:270`, `isResultValue` `:304`)
route through the helper unchanged. Four code lines changed in total; every
other hunk in the module is docstring text re-anchored on the symbol
encoding.

**Neither ctor host changed.** `statement-executor.ts:671` and
`production-theta-producer.ts:5648` call `brandSchemaValue` exactly as
before — they remain the only two call sites in `src/`.

**Docs.** `docs/spec_topics/runtime-value-model.md:16` — the non-normative
reference-encoding paragraph re-anchored on the symbol encoding under its own
"may change without a spec revision" licence; the bug-0017 claim (recognised
by the brand, never by the `{ ok, … }` shape) and the bug-0020 claim
(recognised by the descriptor, never by key presence) are preserved, the
latter strengthened to hold unconditionally — a string key can never equal
the symbol, so its enumerability no longer enters the guarantee.
`docs/reference/type-system.md:115–119` — the same correction to its
concrete-shapes parenthetical. Neither edit adds or removes a normative
requirement, a REQ-ID, or a diagnostic code. `__thetaSchema` was never named
in either paragraph, so neither needed a removal.

**Cross-bug records.** Bug 0020's §`Fix (0.32.0)` gains a
`**Superseded mechanism (0.33.0).**` paragraph: its string-tag +
non-enumerable-descriptor mechanism is re-encoded here, its residual (i) is
discharged, and its residual (ii)'s brand-key half is closed. The
"OUT OF SCOPE (fix option 1)" header at
`tests/enum-schema-tag-privacy.test.ts:96` is discharged and now points at
this bug's lock.

**Bug 0027.** The migration closes 0027's brand-key half, verified against
the code: `stdlib-object.ts:104` tests `hasOwnProperty` with a string
argument, which never matches a symbol-keyed property, so
`obj.has("__thetaSchema")` answers `false`; `runtime-panics.ts:157` raises
the documented `MissingObjectKeyPanic` on the absent string key; `:176`
member access no longer reads a brand. In 0027's probe table that closes
rows **E1–E3** (`s.has("__thetaEnum")`, `s["__thetaEnum"]`, `s.__thetaEnum`)
and **R1–R3** (the `Result` equivalents), plus this report's own four
schema-brand read surfaces. Everything else in that table — E4–E13, R4–R10,
E7–E8/R9, the unknown-member aborts — is receiver-shaped, not key-shaped,
and survives untouched: 0027 re-scopes to its receiver-dispatch defect
against this baseline and ships as a separate commit.

**Offline lock.** `tests/schema-brand-symbol-migration.test.ts` (12 tests,
5 groups, no provider), covering the §Fix's five minimum items: (a) the unit
mechanics — `brandSchemaValue` over an object already carrying an own
enumerable `__thetaSchema`, descriptor pinned before and after; (b) the
end-to-end ctor through the production executor, including the
zero-error-diagnostic parse admission; (c) provenance-twin equality in both
argument orders; (d) the QRY-18 outbound render at the `pi.sendUserMessage`
seam through *both* ctor hosts — `let`-bound (effectful,
`statement-executor.ts:657–673`) and written inline in the interpolation
(pure, `production-theta-producer.ts:5643–5649`); (e) the sibling-tag
controls plus a partial-migration guard (e4) asserting no brand occupies a
string key.

**Verification.** Full default suite 225 files / 2645 tests green; lint and
typecheck clean. Red direction proven twice by temporary local revert of
`src/runtime/value.ts` with byte-identical restore (SHA-256 verified both
times): reverting all three tags to strings reds exactly the 8 RED-labelled
tests with this report's verbatim signatures (descriptor
`{"value":"F",false,false,false}`, `{"x":1}`, `payload: {"x":1}`,
`valuesEqual` false both ways) while the 4 controls stay green; migrating
`SCHEMA_TAG` alone reds e4 and only e4. Live: no new test — the surface
already has end-to-end coverage, and all three migrated brands were driven
through a real provider.
`tests/live/live-production-acceptance.test.ts` 7/7 (the QRY-18
enum-interpolation render through a genuine `ENUM_TAG`, and the
forged-`__thetaEnum` wire-ingress witness whose child-side ctor value carries
a genuine `SCHEMA_TAG` brand);
`tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3 (`match` over live
`Result`s through `RESULT_TAG`).

**Residuals.** (i) Pre-existing prose defects in `src/runtime/value.ts`,
present at the fix base and outside the §Fix's enumerated docstring ranges,
left for whoever next edits the module: the V2c-T plan-history paragraph in
the module header (`:30–38`) describes the behaviour-bearing functions as
inert stubs, which is false of the module as it stands; `valuesEqual`'s
docstring (`:352`) carries the banned word `simply`; two docstrings end on a
dangling ` *` line (`:353`, `:436`). (ii) The QRY-22 lowering still marks a declared
`__thetaSchema` field required and the schema closed — correct, and now
consistent with the render, which carries the field. (iii) The constraint this
fix established — the brand install must target a value whose *string* keys are
exactly the declared theta-side names, so a field literally named
`__thetaSchema` survives — is now carried by a single shared construction
point, `buildObjectSchemaValue` (`src/runtime/value.ts`), introduced by
[0080](./0080-keys-values-construction-order-not-declaration-order.md) and
discharged by its fix (0.70.0): that function brands a freshly rebuilt record
rather than the constructor's own, at unchanged key set and key count, and two
cells of `tests/ctor-declaration-order.test.ts` pin this report's shape against
it — the `__thetaSchema`-named field takes its declared position like any other
field, and the reordered record still recovers its declaring schema through
`schemaTagOf` with exactly one own symbol whose descriptor is non-enumerable.

## Summary

Ctor evaluation in both hosts is a two-step: a loop assigns each written
field with plain `obj[field.name] = value` — producing enumerable, writable,
configurable data properties — and, when the ctor names a resolvable schema,
`brandSchemaValue(obj, expr.typeName)` then installs the interpreter-private
declaring-schema brand. The brand lives in the same string-key namespace as
user field names (`SCHEMA_TAG = "__thetaSchema"`, `value.ts:177`). When a
declared field is literally named `__thetaSchema`, the assigned property is
configurable, so `Object.defineProperty` succeeds and replaces both halves
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
(`src/runtime/wire-translation.ts:129`, plain-object rebuild at `:158–173`)
rebuilds plain enumerable objects, which post-0020 are correctly inert — so
structurally identical author intent yields provenance-dependent values that
never compare equal.

The sibling tag names do NOT share the defect today: a declared ctor field
named `__thetaEnum` or `__thetaResult` survives as ordinary enumerable data
(`makeEnumValue` targets a boxed `String`, `brandResult` targets the `Result`
shape — neither runs against a ctor object), and post-0020 the enumerable
copy no longer forges classification (verified below). The collision is
specific to `__thetaSchema`, the one brand installed onto the ctor's own
object.

In-language, the destroyed field leaves four read surfaces that disagree
(the read mechanism is bug [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)'s
unfiltered own-property reads): `f.has("__thetaSchema")` answers `true`,
`f.keys()` omits the key, and both `f["__thetaSchema"]` and `f.__thetaSchema`
return `"F"` — the schema name, not the assigned `"user-data"`, and not the
documented `MissingObjectKeyPanic`.

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

Unit mechanics (`brandSchemaValue` over a freshly-assigned field):

```
before: {"value":"user-data","writable":true,"enumerable":true,"configurable":true}
after:  {"value":"F","writable":false,"enumerable":false,"configurable":false}
```

In-language read-back of the destroyed field (four surfaces, one value):

```theta
let f = F { __thetaSchema: "user-data", x: 1 }
f["__thetaSchema"]     // "F"     — the schema name, not "user-data", no panic
f.__thetaSchema        // "F"
f.has("__thetaSchema") // true
f.keys()               // ["x"]
```

The member-access surface is bug [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md)
probe S4, run against a value whose `__thetaSchema` descriptor is the one
captured above; `evaluateMemberAccess` (`runtime-panics.ts:172`) reads the
property at `:176` with no enumerability filter.

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

## Expected behaviour (what the spec and module contracts say)

- expressions.md §Object construction (`docs/spec_topics/expressions.md:209`):
  "Every declared field of the schema must be present (omissions are
  `theta/parse/missing-object-field`)". The parse gate enforces presence in
  *source*; the constructed runtime value is what that presence is for. A ctor
  that parses clean with all fields written should produce a value carrying
  all of them.
- runtime-value-model.md, value-representation table, object-schema row
  (`:12`): a schema value is a "JS plain object keyed by **theta-side
  names**". Here one declared theta-side name is not an (enumerable) key of
  the runtime value.
- `brandSchemaValue`'s contract (`value.ts:179–185`): the tag is installed
  non-enumerable "so the branded value is indistinguishable from a plain
  object on every theta-visible surface". Branding is specified as additive
  and invisible; for this ctor it is destructive — the branded value is
  missing a field its unbranded twin would have.
- runtime-value-model.md, reference-encoding paragraph (`:16`, non-normative):
  the concrete shapes are "implementation details — neither is reachable from
  theta code". The 0.32.0 fix made that hold for *classification* (an
  enumerable same-named key is ordinary data); the ctor collision is the
  remaining reachable edge of the string encoding — naming the internal string
  in a schema makes the interpreter's bookkeeping observable (the field
  vanishes and reads back as the schema name).

Expected concretely: `F { __thetaSchema: "user-data", x: 1 }` constructs
`{"__thetaSchema":"user-data","x":1}` — field preserved, brand intact — never
a silent `{"x":1}` with the value gone.

## Actual behaviour / root cause

Assign-then-brand ordering plus an unconditional `defineProperty` plus a
shared namespace. The field loop writes `__thetaSchema` as an ordinary
enumerable property; `brandSchemaValue` then redefines that same key —
legal, because the assigned property is configurable — into the frozen
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
  `keys()` says absent, indexed and member access return a *different string
  than was assigned* (the schema name) — corrupted data rather than missing
  data.
- The wire contract inverts: QRY-22 requires of the model a field the QRY-18
  render can never show it and the theta can never construct; wire-provenance
  and ctor-provenance values of the same schema are structurally unequal.
- Contract erosion: post-0020 the spec pins the encoding as unreachable from
  theta code and `brandSchemaValue` promises invisibility; this wrinkle is
  the one construction-side spot where both statements are still false.

## Fix

Move all three interpreter-private brands out of the string-key namespace.
`ENUM_TAG` (`src/runtime/value.ts:48`), `RESULT_TAG` (`:73`) and `SCHEMA_TAG`
(`:177`) become module `Symbol`s in one migration. A declared `__thetaSchema`
field then coexists with the brand as ordinary enumerable data, and the
collision class disappears wholesale rather than per-name.

**Scope is one module.** The three constants and the three tag strings occur
nowhere in `src/` outside `src/runtime/value.ts`
(`rg --glob '!src/runtime/value.ts' "__thetaSchema|__thetaEnum|__thetaResult" src/`
is empty), and no test references the constants. The migration is:

- The three constant declarations (`:48`, `:73`, `:177`) become `Symbol`s.
- `privateBrandOf` (`:143`) takes a `symbol` key. Its "one privacy posture
  for all three tags" docstring (`:130–142`) stays true — all three migrate
  together, so the helper keeps describing a single posture.
- The three constructors keep their non-enumerable, non-writable,
  non-configurable install: `makeEnumValue` (`:121–126`), `brandSchemaValue`
  (`:190–195`), `brandResult` (`:257–262`). `privateBrandOf` keeps the
  non-enumerable predicate. A symbol key is unreachable from `JSON.parse`
  and from theta-side construction, so the enumerable-key forgery class bug
  [0020](./0020-enum-schema-tags-presence-only-forgeable.md) closed cannot
  re-open through the new encoding.
- The three readers route through the helper unchanged: `enumTagOf`
  (`:161–164`), `schemaTagOf` (`:207–210`), `isResultValue` (`:239–241`).
- Every docstring describing the encoding as a string property re-anchors on
  symbols: the module header (`:10–18`), `makeEnumValue` (`:112–117`),
  `privateBrandOf` (`:130–142`), `enumTagOf` (`:151–160`), `SCHEMA_TAG`
  (`:166–176`), `brandSchemaValue` (`:179–185`), `schemaTagOf` (`:199–206`),
  `isResultValue` (`:222–238`), `brandResult` (`:243–251`).

**Neither ctor host changes.** `statement-executor.ts:671` and
`production-theta-producer.ts:5648` call `brandSchemaValue` exactly as today;
the collision disappears because the brand leaves the string-key namespace,
not because the hosts learn about it.

**Spec.** `docs/spec_topics/runtime-value-model.md:16` — the non-normative
reference-encoding paragraph names `__thetaEnum` and `__thetaResult` as
string properties and is edited to the symbol encoding. The paragraph's own
"either may change without a spec revision" licenses the edit; the affected
inputs were never conformant. `__thetaSchema` is not named in that paragraph,
so that tag needs no removal there.

**Boundary audit, not code.** Symbols do not survive JSON round-trips — the
same constraint the string tags already have, and `brandResult`'s comment
(`:246–248`) already requires re-entry through the constructors at any
boundary that round-trips a `Result`. `rebuildInbound`
(`wire-translation.ts:129`) is unaffected: it builds plain objects and
re-tags enums through `makeEnumValue` (`:167`), never by key.

**Cross-bug consequences.**

- The migration also closes the brand-key half of bug
  [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md): with no brand under a string
  key, `obj.has("__thetaSchema")` on a branded value answers `false`, indexed
  access raises the documented `MissingObjectKeyPanic`, and member access
  stops reading the brand.
- **This bug lands first.** Bug 0027 is then re-scoped against the new
  baseline and ships as a **separate commit** — key re-encoding and receiver
  dispatch are independent risk surfaces and do not bundle.
- Bug [0020](./0020-enum-schema-tags-presence-only-forgeable.md)'s
  §`Fix (0.32.0)` record needs a pointer stating that its string-tag +
  non-enumerable-descriptor mechanism is superseded by this migration, and
  that its residual (i) is discharged here.
- `tests/enum-schema-tag-privacy.test.ts:96–98` carries an "OUT OF SCOPE (fix
  option 1)" header declaring the ctor collision deliberately unpinned. The
  fix discharges that header.

**Offline lock.** A plain offline vitest is sufficient; no live or
integration test is required. Minimum coverage:

1. Unit — `brandSchemaValue` over an object already carrying an own
   enumerable `__thetaSchema`: the field's value and enumerability survive,
   `schemaTagOf` still returns the schema name.
2. End-to-end through the production executor —
   `F { __thetaSchema: "user-data", x: 1 }` stringifies to
   `{"__thetaSchema":"user-data","x":1}` with `schemaTagOf` → `"F"`.
3. Provenance-twin equality —
   `valuesEqual(ctorValue, JSON.parse('{"__thetaSchema":"user-data","x":1}'))`
   is `true` in both argument orders (currently `false` both ways).
4. Sibling-tag controls retained, to catch a partial migration.
5. The QRY-18 render witness (`payload: {"__thetaSchema":"user-data","x":1}`)
   through the `LiveSessionDouble` already present in
   `tests/enum-schema-tag-privacy.test.ts` group (d) — still offline, no
   provider.

## Provenance

- Origin: bug 0020 §Fix (0.32.0), Residuals item (i)
  ([`./0020-enum-schema-tags-presence-only-forgeable.md`](./0020-enum-schema-tags-presence-only-forgeable.md)):
  "The ctor-collision wrinkle (the report's adjacent item (i)) survives
  Option 1 — constructor-side, orthogonal to classification privacy: a schema
  ctor whose *declared* field is literally named `__thetaSchema` has that
  field's value destroyed when `brandSchemaValue` redefines the just-assigned
  enumerable property into the brand". First identified as probe 9 of the 0020
  triage scratch suite; recorded in the parent report as the adjacent wrinkle
  `Symbol` brands would fix wholesale, and deliberately not pinned by the 0020
  offline lock (`tests/enum-schema-tag-privacy.test.ts` header at `:96–98`:
  "OUT OF SCOPE (fix option 1): the ctor-collision wrinkle … constructor-side
  and deliberately NOT pinned here").
- Related: bug [0027](./0027-typeof-receiver-dispatch-exposes-enum-result-encoding.md) — the read-side
  half of the same shared-namespace cause (bug 0020 residual (ii)). This
  report's fix lands first and closes 0027's brand-key half; 0027's remaining
  receiver-dispatch defect is re-scoped afterwards.
- Spec: `docs/spec_topics/expressions.md:209` §Object construction;
  `docs/spec_topics/runtime-value-model.md:12` (value-representation table,
  object-schema row) and `:16` (non-normative reference-encoding paragraph).
- Implementation evidence, verified at HEAD `4d645f4f` (`src/` byte-identical
  to `b542dafe`): `src/runtime/value.ts:48`/`:73`/`:177` (the three tag
  constants), `:121–126` (`makeEnumValue` install), `:143–149`
  (`privateBrandOf`), `:179–185` (the invisibility contract), `:186–197`
  (`brandSchemaValue`, `defineProperty` at `:190–195`), `:207–210`
  (`schemaTagOf`), `:239–241` (`isResultValue`), `:257–262` (`brandResult`
  install); `src/runtime/statement-executor.ts:657–673` (effectful ctor host);
  `src/extension/production-theta-producer.ts:5643–5649` (pure ctor host),
  `:5548`/`:5560` (QRY-18 brand recovery + enumerable walk);
  `src/parser/theta-document.ts:4711`/`:5038` (parse-only presence checks);
  `src/parser/body-type-lowering.ts:69`/`:74–75` (required + closed
  lowering); `src/runtime/wire-translation.ts:129`/`:158–173`
  (`rebuildInbound` — inbound values stay plain); `src/runtime/runtime-panics.ts:157`
  and `:176`, and `src/runtime/stdlib-object.ts:104` (the read surfaces the
  destroyed field is observed through).
- Reproduction: scratch vitest at HEAD (8 probe groups / 11 tests), including
  unit destruction mechanics, verbatim end-to-end with zero-diagnostic parse
  admission, in-language read-back, sibling-tag controls, QRY-18 render drop
  through both ctor hosts, provenance-twin inequality, and QRY-22
  required-field lowering — run green on the signatures quoted above, then
  deleted per scratch policy.
</content>
</invoke>
