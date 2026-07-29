# Bug 0020 — The enum and schema brands (`__thetaEnum` / `__thetaSchema`) classify by presence-only `hasOwnProperty`: an enumerable same-named key forges them, corrupting `==` and the QRY-18 interpolation render

- **Status:** fixed (0.32.0). Bug doc Option 1 — a shared module-private
  `privateBrandOf` helper (own-property descriptor exists AND is
  non-enumerable) routes `enumTagOf`, `schemaTagOf`, and `isResultValue`:
  one privacy posture, three tags; constructors and JSON/wire output
  unchanged. Review extended the posture to `valuesEqual`'s object-arm
  membership (`propertyIsEnumerable`), closing a forged-key-vs-genuine-brand
  asymmetric false-equal in the same class.
- **Kind:** defect — the implementation diverges from the documented value
  model. `docs/spec_topics/runtime-value-model.md` (value-representation
  table, enum row) pins the enum tag as "an **interpreter-private** tag
  identifying the declaring enum", and the reference-encoding paragraph
  claims the concrete shapes are "not reachable from theta code". Neither
  holds at HEAD: the constructors install the tags non-enumerable, but the
  classifiers (`enumTagOf` / `schemaTagOf`) test bare `hasOwnProperty`
  presence, so any enumerable own key named `__thetaEnum` / `__thetaSchema`
  — producible by `JSON.parse` of wire data and by ordinary theta object
  construction — classifies as a genuine brand. Honest reachability: the
  corruption is deterministic and offline-reproducible (including fully
  in-language, no wire), but the trigger key names are interpreter
  internals, so accidental collision is improbable — unlike bug 0017's
  `ok: boolean`, which is a ubiquitous field name. Wire-side, a forged
  payload passes the QRY-22 gate only through permissive `{}` lowering
  positions (forward/self/unresolved annotation names — parse-clean, no
  diagnostic) or the unvalidated untyped-invoke envelope; a closed declared
  schema rejects the key.
- **Affected** (at HEAD `28ce714d`, 0.28.0):
  - `enumTagOf` (`src/runtime/value.ts:131`) — presence-only
    `hasOwnProperty` at `:132`; every consumer inherits the forgery:
    - `isEnumValue` (`value.ts:190`);
    - `valuesEqual` (`value.ts:263`, enum arm) — the `==` relation routes a
      tag-carrying plain object to the enum arm before the object arm;
    - `interpolationTypeOf`
      (`src/extension/production-theta-producer.ts:5601`) — a forged object
      classifies `{ kind: "enum" }` and renders via `String(value)` →
      `"[object Object]"` (`src/render/query-render.ts:390`);
    - `translateInterpolationOutbound` (`production-theta-producer.ts:5531`)
      — a forged enum nested in an interpolated object/array collapses its
      whole subtree to `"[object Object]"` in the rendered JSON.
  - `schemaTagOf` (`src/runtime/value.ts:172`) — presence-only
    `hasOwnProperty` at `:177`; consumer:
    - `translateInterpolationOutbound` (`production-theta-producer.ts:5548`)
      — a forged `__thetaSchema` key selects, by name, which declared
      schema's theta→wire field renames are applied to the carrying object's
      other fields during the QRY-18 outbound render.
- **Observed at:** `0.28.0` (`28ce714d`). Offline and deterministic; no live
  model required.

## Fix (0.32.0)

Bug doc Option 1 — one descriptor-privacy posture for all three interpreter
tags, implemented as a shared module-private helper in
`src/runtime/value.ts`, plus an object-arm membership hole review found in
the same forged-key class (line anchors at the fix commit).

**Shared brand classifier (`value.ts:143`).** `privateBrandOf(value, tag)`
returns the brand descriptor's value only when `value` is a non-null,
non-array object AND `Object.getOwnPropertyDescriptor(value, tag)` exists
AND is non-enumerable — the `isResultValue` check (bug 0017, `fa58456b`)
generalised to one helper. `enumTagOf` (:161) and `schemaTagOf` (:207)
route through it and narrow the brand with `typeof === "string"` (the
blind `Record<string, string>` casts are gone; the `Array.isArray` guard
the two classifiers disagreed on is unified in the helper — the report's
adjacent item (ii)). `isResultValue` (:239) routes through the same helper
(what classifies is a defined brand value; the constructors install
`true`). Constructors untouched: `makeEnumValue` / `brandSchemaValue`
already install non-enumerable / non-writable / non-configurable, and
every construction site routes through them (`lexical-environment.ts:533`,
`wire-translation.ts:167`, `statement-executor.ts:671`,
`production-theta-producer.ts:5648`) — genuine values keep classifying,
and every consumer (`valuesEqual`, `isEnumValue`, `interpolationTypeOf`,
both `translateInterpolationOutbound` sites, the query render) inherits
the rejection of enumerable same-named keys, which is all `JSON.parse` and
theta-side construction can mint. JSON/wire output is byte-unchanged (the
tags never serialised).

**`valuesEqual` object-arm membership (`value.ts:342`).** Review round 1:
the object arm walked `Object.keys(a)` (enumerable own) but tested
membership on `b` with `hasOwnProperty`, which matches non-enumerable
brands — a forged enumerable `__thetaSchema` key satisfied membership
against a genuinely branded object by name and, through the unfiltered
property read, by value:
`valuesEqual(JSON.parse('{"__thetaSchema":"Person","name":"x"}'),
brandSchemaValue({name:"x", other:1}, "Person"))` compared `true` in that
argument order and `false` reversed — an asymmetric false-equal in the
same forged-key class, surviving the classifier fix (pre-existing at the
fix base). Membership is now enumerable-only (`propertyIsEnumerable`),
mirroring the key walk: theta-side keys are enumerable own keys on both
sides, so a brand can neither satisfy membership nor defeat it.

**Spec (`runtime-value-model.md`).** One sentence added to the
non-normative reference-encoding paragraph: the enum tag is recognised the
same way as the `Result` brand — by the non-enumerable descriptor, never
by key presence — so an object naming `__thetaEnum` as an ordinary
(enumerable) key is an ordinary object value. `type-system.md` needed no
edit (its "interpreter-private / not reachable from theta code" claims
hold post-fix). `coverage-matrix.md` unaffected (no new REQ-ID; the RVM
code-keyed obligation rows already cover `value.ts`).

**Citation refresh.** The bug-0019 fix (`655e4d39`) moved
`statement-executor.ts`: the object/field assignment cited at `:659` is
`:664` and the effectful ctor branding cited at `:666` is `:671` at the
fix base — both refreshed in place above — and the invoke-envelope bullet
is corrected (the untyped form discards the child's value; the payload
path is typed `invoke<T>`).

**Verification.** Full default suite 221 files / 2580 tests green;
typecheck and lint clean. Offline lock:
`tests/enum-schema-tag-privacy.test.ts` (20 tests) — (a) classifier units,
(b) genuine-construction controls across the construction sites (ctor
branding, `Enum.Variant` access, inbound re-tag), (c) `valuesEqual`
including the membership pair, (d) the QRY-18 render driven through the
real private routing (`renderQueryText` → `interpolationTypeOf` →
`translateInterpolationOutbound`, observed at the `sendUserMessage` seam),
(e) the report's in-language `a == b` end-to-end through the production
executor, (f) the QRY-22 permissive-`{}` admission + closed-schema
rejection as ingress documentation. 10 red at `655e4d39` with the report's
signatures (forged classification `true` / `"Person"`; `valuesEqual`
`true` on structurally different pairs; renders collapsing to
`[object Object]`; in-language `a == b` `true`), green post-fix; red
direction re-proven by base revert of `value.ts` plus byte-identical
restore (SHA-256-verified). Live:
`tests/live/live-production-acceptance.test.ts` 7/7 — the five
pre-existing bullets plus two new witnesses: (i) a QRY-18
enum-interpolation control — a genuine enum interpolated into a real typed
query renders its bare wire string (`<<high>>`) in the outbound text
(red-proven by classifier mutation: the boxed-String value renders as its
index-keyed object form); (ii) a forged-`__thetaEnum` wire-ingress witness
— a spawned subagent child's PIC-59 envelope carries the forged tag
through `invoke<Forged>` typed return-validation (the tag key as a
declared field of a closed schema) and the parent binds it as a plain
object, interpolating byte-exact `{"__thetaEnum":"Severity","x":1}`
(red-proven at the base revert: the rendered segment collapses to
`[object Object]` — the live corruption signature).
`tests/live/harness.ts` gains the `userTexts` outbound-text channel
(settled-transcript read, additive). Live regression:
`tests/live/hardening/recent-rfc-live-drives.test.ts` 3/3 (drives `match`
over live `Result`s through the re-routed `isResultValue`).

**Residuals.** (i) The ctor-collision wrinkle (the report's adjacent item
(i)) survives Option 1 — constructor-side, orthogonal to classification
privacy: a schema ctor whose *declared* field is literally named
`__thetaSchema` has that field's value destroyed when `brandSchemaValue`
redefines the just-assigned enumerable property into the brand
(`F { __thetaSchema: "user-data", x: 1 }` binds as `{"x":1}` with schema
tag `F`). (ii) Read-side brand visibility (found in review, established by
code reading): `stdlib-object.ts:104` — in-language
`obj.has("__thetaSchema")` answers `true` on a branded value
(`hasOwnProperty`), and `runtime-panics.ts:157` — indexed access
`obj["__thetaSchema"]` returns the brand string instead of
`MissingObjectKeyPanic`; tension with `brandSchemaValue`'s
"indistinguishable from a plain object on every theta-visible surface".
(iii) The permissive-`{}` lowering positions remain diagnostic-free
(`body-type-lowering.ts:130` discards the unresolved list), so the
admitting surface stays invisible to the author — the ingress this report
used, unchanged by this fix.

## Summary

`makeEnumValue` (`value.ts:119`) and `brandSchemaValue` (`value.ts:158`)
install their tags with `Object.defineProperty(…, { enumerable: false,
writable: false, configurable: false })` — the representation half of the
"interpreter-private" contract is correct, and `JSON.stringify` of a genuine
enum yields the bare wire string as specified. The classification half is
not: `enumTagOf` and `schemaTagOf` test
`Object.prototype.hasOwnProperty.call(value, TAG)` and read the property,
accepting an **enumerable** same-named key as a brand. `JSON.parse` produces
only enumerable own properties, and the statement executor's object/field
assignment (`statement-executor.ts:664`) likewise produces enumerable
keys — so both wire data and theta source can mint objects the runtime then
treats as enum values or schema-branded values.

Bug 0017 fixed exactly this class for the third tagged kind: `isResultValue`
(`value.ts:209`) requires the own-property descriptor to exist **and** be
non-enumerable, so a payload naming `__thetaResult` cannot forge a `Result`.
The two sibling tags kept presence-only checks; the residual was recorded in
0017's Fix section. This report substantiates it.

Consequences once a tag-carrying object exists:

1. `==` is corrupted in both directions. Two structurally different objects
   carrying the same `__thetaEnum` string compare **equal** — the enum arm
   compares tag plus `String(value)`, and `String` of any plain object is
   `"[object Object]"`. Conversely, a tag-carrying object never receives the
   documented object comparison (key set + per-key value): the enum arm
   short-circuits first.
2. The QRY-18 interpolation render silently destroys the payload:
   `interpolationTypeOf` routes the forged object to the enum arm, which
   renders `String(value)` → `"[object Object]"` — in place of the compact
   JSON the object rule specifies. Nested occurrences collapse their subtree
   the same way inside `translateInterpolationOutbound`.
3. A forged `__thetaSchema: "<Name>"` key makes the outbound render look up
   `<Name>` among the theta's declared schemas and apply that schema's
   theta→wire renames to the forged object's sibling fields — wire data
   selects, by name, which rename map is applied to itself.

## Reproduction

All offline. Unit level (`src/runtime/value.ts` exports), verified at HEAD
via a scratch vitest (written, run, deleted):

```ts
import { isEnumValue, schemaTagOf, valuesEqual } from "../src/runtime/value";

isEnumValue(JSON.parse('{"__thetaEnum":"Severity"}'));          // true  — the defect
schemaTagOf(JSON.parse('{"__thetaSchema":"Person","name":"x"}')); // "Person" — the defect

valuesEqual(
  { __thetaEnum: "Severity", x: 1 },
  { __thetaEnum: "Severity", y: 2 },
);                                                               // true — structurally
                                                                 // different objects
```

Render arm (what `interpolationTypeOf`'s `{ kind: "enum" }` routing
produces):

```ts
stringifyInterpolatedValue(JSON.parse('{"__thetaEnum":"Severity","x":1}'),
  { kind: "enum" });
// { ok: true, text: "[object Object]" } — the payload is gone
```

Wire reachability of the QRY-22 gate (real `lowerQueryResponseSchema` + real
`AjvSchemaValidator`):

```ts
const lowered = lowerQueryResponseSchema("NotDeclaredAnywhere", []);
// {} — an unresolved / forward / self reference lowers permissively, with NO
// parse diagnostic (lowerTypeSource, body-type-lowering.ts:130, discards the
// unresolved list; contrast params.ts:132, which errors)
ajv.compile(lowered).validate(JSON.parse('{"__thetaEnum":"Severity","x":1}'));
// { ok: true } — the forged payload passes typed-query validation

// Control: a closed declared schema rejects it —
lowerQueryResponseSchema("{ x: integer }", []);
// additionalProperties: false → AJV: "must NOT have additional properties"
// (additionalProperty: "__thetaEnum")
```

End-to-end through the production executor (the bug-0017 harness pattern:
`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`) — fully in-language, no wire:

```theta
schema A { __thetaEnum: string, x: integer }
schema B { __thetaEnum: string, y: integer }
let a = A { __thetaEnum: "Severity", x: 1 }
let b = B { __thetaEnum: "Severity", y: 2 }
a == b
```

Result: outcome `success`, value **`true`** (verified at HEAD). The control
without the tag field evaluates `false`. The parser admits `__thetaEnum` as
an ordinary field name, so the "not reachable from theta code" claim fails
in-language, parse-clean.

Not driven end-to-end here, stated honestly:

- The full typed-query loop over a permissive annotation (the wire ingress)
  is exercised above at its two seams — lowering + AJV admission, then
  classifier corruption of the parsed value — not as one driven query; the
  bound payload of a typed query is the parsed/validated JSON value
  (bug 0017's trace established the bind path), so the composition adds no
  new mechanism.
- The invoke-envelope ingress (`makeOk(result.value as ThetaValue)`,
  `production-theta-producer.ts:1868`, over the `JSON.parse`d PIC-59 child
  envelope) is established by code reading; driving it needs a child spawn.
  Correction at the fix base (`655e4d39`): the untyped `invoke(...)` form
  returns `Result<null, …>` — the runtime discards the child's value above
  that seam (invocation.md §Typed return) — so a payload reaches the
  classifiers there only through typed `invoke<T>`, whose closed lowering
  admits a tag-named key as a *declared* field (the parser already admits
  the field name in-language, reproduction above).
- Ingress paths that do **not** reach the classifiers with forgeable data:
  code-tool results (`lowerResolvedToolEnvelope` lowers to `Ok(<joined
  text>)` — strings only); untyped queries (bind text); closed declared
  schemas (control above); binder `args` via unresolved param types
  (`theta/parse/unresolved-named-type` is severity `error` — the theta
  un-registers).

## Expected behaviour (what the spec says)

`docs/spec_topics/runtime-value-model.md`, value-representation table, enum
row: "An enum value carries the variant's wire string plus an
**interpreter-private** tag identifying the declaring enum." The
reference-encoding paragraph: "The reference interpreter implements the enum
tag as a non-enumerable `__thetaEnum` string property on the JS string
wrapper", and: "These shapes are implementation details — **neither is
reachable from theta code**, neither appears in any wire schema".
`docs/reference/type-system.md` (enum row) mirrors: "wire string plus an
interpreter-private declaring-enum tag; cross-enum equality compares both".

"Interpreter-private" requires that user/model data cannot install the tag:
a brand any JSON payload or object literal can mint by naming a key is not
private. The same paragraph already states the required posture for
`Result` (post-0017): "The interpreter recognises a `Result` by that brand,
never by the `{ ok, … }` shape, so a user- or model-produced object carrying
a boolean `ok` field is an ordinary object value at every boundary." The
enum row's privacy claim, and bug 0017's own reliance on it ("user data must
not be able to forge a `Result`, exactly as the enum representation already
guarantees"), pin the identical guarantee for the enum tag. The
`__thetaSchema` brand carries no spec row of its own, but its module
contract (`value.ts:158`: "indistinguishable from a plain object on every
theta-visible surface") states the same posture.

Expected concretely: a plain object carrying an enumerable `__thetaEnum` /
`__thetaSchema` key is an ordinary object value — object-arm `==`, compact-
JSON interpolation, no schema-brand recovery.

## Actual behaviour / root cause

`enumTagOf` (`value.ts:131`) and `schemaTagOf` (`value.ts:172`) test
`hasOwnProperty` and read the value — presence-only. The constructors'
non-enumerable installation is therefore load-bearing only for JSON *output*
(genuine tags never serialise); it plays no part in *classification*, so the
distinction between a constructor-installed brand (non-enumerable
descriptor) and arriving data (enumerable key) is discarded exactly where it
matters. `isResultValue` (`value.ts:209`) demonstrates the correct check
three declarations away: `Object.getOwnPropertyDescriptor(value, TAG)`
exists **and** `!descriptor.enumerable`.

Downstream, every consumer trusts the classifier: `valuesEqual`'s enum arm
(`value.ts:263`) fires before the array/object arms;
`interpolationTypeOf` / `translateInterpolationOutbound` /
`stringifyInterpolatedValue` render the "enum" as `String(value)`;
`translateInterpolationOutbound` resolves a forged `__thetaSchema` name
against the declared-schema environment and applies its renames.

## Why it matters

- The 0017 fix set the precedent and the spec now documents brand-recognition
  posture; the shipped tree enforces it for one of the three tagged kinds.
  The inconsistency is itself a hazard: `value.ts`'s own `Result` commentary
  cites the enum tag as the model to mirror, while the enum tag lacks the
  property that made the mirror worth building.
- `==` is a language primitive; once a tag-carrying object exists anywhere
  in a binding, equality over it is wrong in both directions with no
  diagnostic — the same silent-corruption class as 0017, narrower trigger.
- The interpolation corruption feeds garbage forward: a theta that binds a
  forged payload through a permissive typed query and interpolates it sends
  `"[object Object]"` to the model in place of the data, and the failure
  surfaces (if at all) as inexplicable model behaviour, far from the cause.
- The forged `__thetaSchema` arm hands wire data control over which rename
  map is applied to it — an integrity inversion of QRY-18's "theta code
  never sees a wire name, the model never sees a theta-side name" boundary.
- The permissive-`{}` lowering positions that admit the wire forgery are
  parse-clean (no diagnostic distinguishes a forward reference from a typo'd
  never-declared name at the query-annotation site), so the admitting
  surface is invisible to the author.

## Fix options and recommendation

1. **Descriptor-privacy check via a shared helper (recommended).** Mirror
   `isResultValue`: a tag classifies only when the own-property descriptor
   exists AND is non-enumerable. Extract one module-private helper (e.g.
   `privateBrandOf(value, TAG)`) and route `enumTagOf`, `schemaTagOf`, and
   `isResultValue` through it — one privacy posture, three tags. No
   constructor changes: `makeEnumValue` (`value.ts:121`) and
   `brandSchemaValue` (`value.ts:162`) already install non-enumerable /
   non-writable / non-configurable, and every `src/` construction site
   routes through them (`lexical-environment.ts:533` for `Enum.Variant`
   access, `wire-translation.ts:167` for the inbound re-tag,
   `statement-executor.ts:671` and `production-theta-producer.ts:5648` —
   the effectful and pure-expression hosts — for ctor branding).
   `valuesEqual`,
   `isEnumValue`, `interpolationTypeOf`, and both
   `translateInterpolationOutbound` sites inherit the fix. JSON output is
   unchanged (tags already never serialise). Kills both ingress classes at
   once: `JSON.parse` and theta-side construction produce only enumerable
   keys.

   Clone/wire audit to carry with the fix (the Result re-tag-at-decode
   precedent): a genuine enum crossing the PIC-59 child envelope collapses
   child-side to its bare wire string (`JSON.stringify` of the boxed value —
   the specified JSON form) and binds parent-side as a plain string on the
   untyped path; a **typed** boundary re-tags through the sidecar-driven
   inbound pass (`wire-translation.ts:167`) — already the correct posture,
   matching the anonymous-position equality rule. No `structuredClone` of
   runtime values exists in `src/` at HEAD (`binder-inference.ts:290` clones
   schema fragments only); any future runtime-value clone strips boxed-String
   expando tags and must re-enter through `makeEnumValue`, as `brandResult`'s
   comment (`value.ts:220`) already requires for `Result`.

2. **Module-private `Symbol` brands.** Forgery-proof without a descriptor
   check, and additionally collision-proof — fixing an adjacent wrinkle
   found during investigation: a schema ctor whose *declared* field is
   literally named `__thetaSchema` has that field's value silently destroyed
   when `brandSchemaValue` redefines the just-assigned enumerable property
   into the brand (verified: `F { __thetaSchema: "user-data", x: 1 }` binds
   as `{"x":1}` with schema tag `F`). Cost: diverges from the string-tag +
   descriptor pattern 0017 established for `Result`, and the non-normative
   reference-encoding paragraphs naming the string properties need the
   matching edit (permitted — "may change without a spec revision"). Either
   option satisfies the spec; option 1 is the smaller, posture-unifying
   change, and the collision wrinkle can be recorded separately.

3. **Strip or reject enumerable tag-named keys at ingress boundaries.**
   Rejected: per-boundary allowlisting (typed-query bind, invoke envelope,
   …) misses in-language construction entirely, mutates user data, and
   re-introduces the class every time a new ingress is added.

Adjacent, out of scope: (i) the option-2 collision wrinkle above
(constructor-side, orthogonal to classification privacy); (ii) `enumTagOf`
lacks the `Array.isArray` guard `schemaTagOf` carries — moot under the
descriptor check for every JSON/theta-constructible value, but worth
unifying inside the shared helper.

## Provenance

- Origin: bug 0017's Fix section residual (ii)
  (`docs/bugs/0017-ok-field-object-misclassified-as-result.md`): "the
  enum/schema tags (`__thetaEnum` / `__thetaSchema`) still classify by
  presence-only `hasOwnProperty`, not by descriptor" — identified during
  bug-0017 review round 1 (fix commit `fa58456b`), which added the
  descriptor-privacy check to the new `Result` brand for precisely this
  forgery class and left the sibling tags unchanged.
- Spec: `docs/spec_topics/runtime-value-model.md` (value-representation
  table enum row; reference-encoding paragraph),
  `docs/reference/type-system.md` §Runtime value model (enum row,
  concrete-shapes paragraph).
- Implementation evidence at `28ce714d`: `src/runtime/value.ts:48/119/131`
  (`ENUM_TAG` / `makeEnumValue` / `enumTagOf`), `:149/158/172`
  (`SCHEMA_TAG` / `brandSchemaValue` / `schemaTagOf`), `:190`
  (`isEnumValue`), `:209` (`isResultValue`, the adopted precedent), `:263`
  (`valuesEqual` enum arm);
  `src/extension/production-theta-producer.ts:5531/5548/5601`
  (interpolation consumers), `:1868` (untyped invoke envelope ingress);
  `src/render/query-render.ts:390` (enum render arm);
  `src/runtime/query-schema-lowering.ts:20` +
  `src/parser/body-type-lowering.ts:130` (diagnostic-free permissive `{}`
  lowering); `src/parser/params.ts:132` (the contrasting `params:` error
  arm); `src/runtime/tool-call-execute.ts` (`lowerResolvedToolEnvelope` —
  tool results are text-only, excluded as ingress).
- Reproduction: scratch vitest at HEAD (11 probes — classifier units,
  AJV-gate admission w/ closed-schema control, production-executor
  end-to-end `==` corruption w/ control, ctor-collision wrinkle), run green
  on the defect signatures quoted above, then deleted per scratch policy.
