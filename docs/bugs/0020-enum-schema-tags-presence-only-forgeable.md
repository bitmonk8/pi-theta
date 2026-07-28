# Bug 0020 — The enum and schema brands (`__thetaEnum` / `__thetaSchema`) classify by presence-only `hasOwnProperty`: an enumerable same-named key forges them, corrupting `==` and the QRY-18 interpolation render

- **Status:** open
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
assignment (`statement-executor.ts:659`) likewise produces enumerable
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
- The untyped-invoke ingress (`makeOk(result.value as ThetaValue)`,
  `production-theta-producer.ts:1868`, over the `JSON.parse`d PIC-59 child
  envelope — no return annotation ⇒ no validation) is established by code
  reading; driving it needs a child spawn.
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
   `statement-executor.ts:666` for ctor branding). `valuesEqual`,
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
