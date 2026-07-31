# Bug 0027 — Runtime receiver dispatch classifies by JS `typeof`, so enum and `Result` values take the object read surfaces: `s.keys()` yields `["0","1","2","3"]`, `r.ok` reads the discriminator outside `match` / `?`, and any other member aborts the theta with `theta/runtime/internal-error`

- **Status:** fixed (0.39.0). §Fix as settled — runtime receiver gate at the
  four read entry points, new registered runtime-defect-surface code
  `theta/runtime/non-object-receiver`, no static modelling. See
  §Fix (0.39.0) below.
- **Blocked on:** bug
  [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) —
  discharged: its Symbol migration landed in 0.33.0 and closed every
  brand-key read on every receiver — `has("__thetaSchema")`,
  `o["__thetaEnum"]`, `r.__thetaResult`. This report covers what survives that
  migration: the receiver's own non-brand properties, which no brand re-keying
  reaches. The two shipped as separate commits (key re-encoding and receiver
  dispatch are independent risk surfaces).
- **Kind:** defect — two elements against one root cause, the `typeof`-based
  runtime receiver dispatch.
  (1) **Enum and `Result` values take the object read surfaces.** A boxed
  `String` enum carrier and the `{ ok, value }` / `{ ok, error }` `Result`
  representation are both `typeof "object"`, so `keys()` / `values()` /
  `has(k)`, indexed access, and member access all apply to them.
  `s.keys()` → `["0","1","2","3"]`, `s.values()` → `["H","i","g","h"]`,
  `s["0"]` → `"H"`, `r.keys()` → `["ok","value"]`, `r["ok"]` / `r.ok` →
  `true`. runtime-value-model.md's `Result` row (`:14`) pins that "Theta code
  observes `Result` only through `Ok` / `Err` constructors, `match` patterns,
  and `?`; the in-memory shape is not part of the language surface", and its
  enum row (`:13`) admits only the wire string plus an interpreter-private
  tag. These reads name no interpreter internal and are parse-clean.
  (2) **An unknown member on such a receiver is a runtime abort, not a parse
  rejection.** `evaluateObjectMember`'s default arm
  (`src/runtime/stdlib-object.ts:106`) throws a raw
  `Error: unknown object stdlib member: <m>`, which the runtime-defect surface
  reclassifies as `theta/runtime/internal-error`. `s.toUpperCase()` — a
  declared `string` member (expressions.md:81), applied to the enum carrying
  that string — and `r.bogus()` both abort the theta. expressions.md:122 is
  normative and says the opposite: "Anything not on this list is
  `theta/parse/unknown-method` **rather than a runtime failure**." The same
  expression on a schema-typed receiver (`o.bogus()`) is rejected at parse
  with `theta/parse/unknown-method: unknown method 'bogus' on type F`.
- **Affected** (citations verified at HEAD `4d645f4f`; `src/` is byte-identical
  to the observation commit `b542dafe` — `git diff b542dafe HEAD -- src/` is
  empty):
  - Receiver dispatch, the root cause, in four entry points across two hosts.
    Stdlib methods: `applyStdlibMethod`
    (`src/runtime/statement-executor.ts:917`, object arm `:925`, called from
    `:745`) and its pure-host twin `evaluateStdlibMethod`
    (`src/extension/production-theta-producer.ts:5816`, object arm `:5828`,
    called from `:5698`). Indexed access: `evaluateIndexAccess`
    (`src/runtime/runtime-panics.ts:121`, called from
    `statement-executor.ts:702` and `production-theta-producer.ts:5669`).
    Member access: `evaluateMemberAccess` (`runtime-panics.ts:172`, called
    from `statement-executor.ts:719` and
    `production-theta-producer.ts:5663`). Every one of the four tests JS
    representation (`typeof receiver === "object" && receiver !== null`, or
    the negation at `runtime-panics.ts:148`) and none consults `isEnumValue`
    (`src/runtime/value.ts:218`) or `isResultValue` (`:239`).
  - `evaluateObjectMember` (`src/runtime/stdlib-object.ts:85`) — the
    `keys` / `values` / `has` arms (`:94` / `:98` / `:103–104`) read
    `Object.keys` / `Object.values` / `hasOwnProperty` off whatever receiver
    reaches them, and the default arm (`:106`) throws a raw `Error`.
    `OBJECT_MEMBERS` (`:83`) is exactly `{keys, values, has}` — no merge or
    spread surface exists to sweep.
  - The leaking properties are the carrier's and the literal's **own
    non-brand** properties, so no key-privacy posture reaches them:
    `makeEnumValue` installs only `ENUM_TAG` non-enumerably on the boxed
    `String` (`src/runtime/value.ts:119`, descriptor at `:121–126`) — the
    enumerable index properties `0`–`3` and the non-enumerable `length` come
    from the wrapper itself; `brandResult` installs only `RESULT_TAG`
    non-enumerably (`:257–262`) over an ordinary enumerable `{ ok, value }`
    literal. `privateBrandOf` (`:143`) and the `==` object arm (`:342`)
    classify by descriptor and are correct on both values; the defect is
    upstream of the key-privacy line, in receiver classification.
  - The A2 static layer defers rather than rejects, on annotated receivers as
    much as unannotated ones. `collectTypeEnv`
    (`src/parser/type-layer-checks.ts:231`) registers `schema` declarations
    only, so an enum name is absent from the `TypeEnv` and `classifyReceiver`
    (`:155`, unresolved-name arm `:169–171`) answers `"unknown"`;
    `checkMemberAccess` (`:931`) returns on `"unknown"` and on `"object"`
    alike (`:937`). `let t: Severity = s` is as parse-clean as an unannotated
    `fn` parameter.
  - Why the static layer is not part of the fix — the same `TypeEnv` feeds
    three classifiers, and `NamedDecl` has exactly two kinds:
    `src/parser/type-compat.ts:75–77` (`object-schema` | `alias`; `CompatType`
    at `:55–64` has no `result` form at all), consumed by `classifyOperand`
    (`src/parser/type-layer-checks.ts:129`) and `classifyIndexReceiver`
    (`src/parser/type-compat.ts:354`) as well as `classifyReceiver`. Making
    enum names concrete changes operand and index-receiver classification in
    positions this bug does not reach.
  - Surfaces that do NOT leak, on any receiver: the `==` object arm
    (`value.ts:342`), the QRY-18 interpolation render
    (`production-theta-producer.ts:5560` walks `Object.entries`;
    `src/render/query-render.ts:408` serialises via `JSON.stringify`), and
    JSON / wire egress. `for … in` iterates an `array<T>` snapshot only
    (control-flow.md:15, CTRL-1), so object iteration has no surface beyond
    `keys()`.
- **Observed at:** `0.32.0` (HEAD `4d645f4f`). Offline and deterministic; no
  live model required. Every probe drives the production executor
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`) with parse-clean sources.

## Fix (0.39.0)

The settled §Fix, implemented as written. Line anchors are at the fix commit.

**One shared classifier (`src/runtime/value.ts:220`).** `isObjectValue`
lives beside `privateBrandOf` and answers whether a `typeof "object"` value
is an *object value* in the language's sense — `false` for `isEnumValue`
(`:281`) and `isResultValue` (`:304`), `true` otherwise. All four read entry
points route through it:

- `applyStdlibMethod` (`src/runtime/statement-executor.ts:934–935`) and its
  pure-host twin `evaluateStdlibMethod`
  (`src/extension/production-theta-producer.ts:5917–5918`) — byte-identical
  gated arms ahead of the `evaluateObjectMember` call, so the effectful
  executor and the pure producer move in lockstep;
- `evaluateIndexAccess` (`src/runtime/runtime-panics.ts:261–263`) — the
  existing non-object guard widened (`typeof target !== "object" ||
  !isObjectValue(target)`), not a second guard; its whole input class —
  primitives included — now carries the registered code;
- `evaluateMemberAccess` (`runtime-panics.ts:299`) — enum and `Result`
  receivers gated after the `null` guard; primitive member reads
  (`"hi".length`, array `length`) are untouched.

**The registered code (`theta/runtime/non-object-receiver`).**
`NonObjectReceiverError` (`runtime-panics.ts:145`) is a plain `Error`
carrying the code — not a `ThetaPanic`; the six-source panic list is
untouched. `surfaceUnexpectedThrow` gained an arm ahead of the generic
fallback: the diagnostic carries the registered message bare (no
`internal error: ` prefix) and the throw's stack in `hint`. Routing reuses
the internal-error channels — slash-command system note,
`Err(InvokeInfraError { cause: "internal_error" })` to an `invoke` parent;
no new arm. The message template is
`non-object receiver: cannot read <read> on <receiver kind>`: `<read>`
renders `.<member>()` for a stdlib method call, `[<key>]` (bare, never
quoted) for indexed access, `.<field>` for member access; `<receiver kind>`
is the closed five-value set `an enum value` / `a Result value` / `a string`
/ `a number` / `a boolean` (`GatedReceiverKind`, `runtime-panics.ts:123`).
A receiver outside the set — raw JS `undefined` from bug
[0032](./0032-absent-member-binds-undefined.md)'s absent-member bind can
reach the index guard — keeps the pre-fix raw-`Error` →
`theta/runtime/internal-error` disposition (`nonObjectReceiverRejection`,
`:196`), so the registered trigger stays exactly the five kinds.

**Spec amendments (same change).**
`docs/spec_topics/diagnostics/code-registry-runtime.md` — one new DIAG-2 row
plus a sentence in the intro paragraph introducing the second
runtime-defect-surface code (a deliberate gate, not an unexpected throw;
same routing; not a panic source). `error-model.md` §Runtime panics — the
runtime-defect-surface sentence gained the clause admitting registered
non-panic runtime rejections (this gate; for indexed access alone, also a
primitive receiver the static check did not reject) onto the same surface.
`placeholder-rendering-a.md` — Closure carve-out (f) admits `<read>`
(bespoke, rendering owned by the registry row);
`placeholder-rendering-b.md` §7 — `<receiver kind>` registered as a
closed-enum placeholder with the row's Trigger prose as source of truth.
The closed panic list and the six-template table are byte-untouched.

**Docstring corrections.** `src/runtime/stdlib-object.ts` header states the
receiver precondition (the object stdlib surface presupposes an object-value
receiver; enum/`Result` receivers are gated ahead of it) and the real
default-arm boundary: parse-time `theta/parse/unknown-method` covers
statically-resolvable receivers only, so a laundered genuine-object receiver
still reaches the raw-`Error` default arm and rides internal-error —
pre-existing, outside this bug's receiver-kind scope. `brandSchemaValue`'s
docstring needed no change (its claim is about schema-branded objects, which
the gate classifies as object values).

**No static modelling.** `collectTypeEnv`, `NamedDecl`, `classifyOperand`,
`classifyIndexReceiver` untouched, per D5: the runtime gate is total over
the input class — the unannotated (E7), annotated (E8/R9) and laundered
receivers take the same gate.

**GOV-15 standing.** The affected inputs were never conformant: every probe
that changes value read a shape `runtime-value-model.md:16` disclaims under
its own "may change without a spec revision" licence, so the equivalence
promise is not engaged by the return-value changes. The diagnostic-registry
carve-out (`source-language-stability.md:23–25`) is the mechanism for the
new code only.

**Offline lock.** `tests/non-object-receiver-gate.test.ts` (37 tests,
offline, through the production executor): the enum and `Result` read
surfaces on all four entry points, the unknown-member aborts replacing
internal-error (E9/E10/R10), the laundered/annotated variants (E7/E8/R9),
both hosts (the pure host via the QRY-18 interpolation render), byte-exact
template pins for all five receiver kinds (h1–h6), gate-before-key-check
ordering (`r["definitely_absent"]` → the gate, not missing-object-key), and
the controls: O1 parse rejection, O2/O3 object and string receivers, string
and array `length`, `match` and `?` over `Result` (which read the
representation internally, not through the gated entry points), the
out-of-model `undefined` receiver keeping internal-error, and the
MissingObjectKeyPanic arm for genuine object receivers. Verified in both
directions: neutralising `isObjectValue` re-opens every leak with the
§Reproduction values; per-site neutralisations partition the 27 witness
tests across the four entry points. Live: H8a production acceptance 7/7 and
H9a real-binary acceptance 11/11 green with the gate in place;
`theta/runtime/non-object-receiver` is not emitted by any acceptance
fixture, so the H7a permitted-code list is unchanged.

**Residuals.** (i) Member access on an *absent* name of a genuine object
value still binds raw JS `undefined` — bug
[0032](./0032-absent-member-binds-undefined.md), unchanged here and since
discharged by its fix (0.42.0: the shared presence gate panics on the
absent name, and control i7 is re-anchored to the unit seam); the
widened index guard deliberately routes that value to internal-error rather
than claiming it for the new code. (ii) An unknown stdlib member on a
laundered genuine-object receiver still rides internal-error (the
default-arm boundary above) — pre-existing, receiver-kind-shaped fixes do
not reach it. (iii) Found in review: the `missing object key: <key>`
implementation renders `<key>` bare always, diverging from
`placeholder-rendering-b.md` §5's quoting vector for non-identifier-shaped
keys (`obj["my-key"]` → `missing object key: "my-key"`); pre-existing and
unfiled at fix time, since filed as
[0036](./0036-missing-object-key-bare-key-rendering.md) and discharged by
its fix (0.41.0) — the new row deliberately pins its own bare-always rule
instead of citing §5.

## Summary

Runtime dispatch decides "is this an object?" by JS `typeof`. Two theta value
kinds that the language defines as non-object satisfy that test: an enum value
is a boxed `String` and a `Result` is a `{ ok, … }` object literal. Both
therefore take the object read surfaces, and both expose their reference
encoding to ordinary theta code:

- `s.keys()` → `["0","1","2","3"]` and `s.values()` → `["H","i","g","h"]` —
  the boxed-`String` wrapper's per-character index properties, presented as a
  theta `array<string>`.
- `s["0"]` → `"H"` — an in-language read of one character of the wire string.
- `s.length` and `s["length"]` → `4`, `s.has("length")` → `true` — the boxed
  wrapper's own `length`. expressions.md declares `length` on `string`
  (`:79`) and on `array` (`:107`); the enum row admits no such observable.
- `r.keys()` → `["ok","value"]`, `r.values()` → `[true,1]`, `r["ok"]` and
  `r.ok` → `true` — the `Result` discriminator and payload read directly,
  bypassing the closed `Ok` / `Err` / `match` / `?` observation surface and
  the ERR-18/ERR-19 machinery built around it.

None of these names an interpreter internal. An author who calls an ordinary
stdlib member on the wrong receiver gets representation data back instead of a
diagnostic. An author who calls any *other* member gets an aborted theta: the
receiver still routes to `evaluateObjectMember`, whose default arm throws a
raw `Error`, and the runtime-defect surface turns that into
`theta/runtime/internal-error`. expressions.md:122 pins that case as a parse
rejection, "rather than a runtime failure", and delivers exactly that on a
schema-typed receiver.

Bug [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) closes
the sibling half of this surface. Moving the three brands to `Symbol` keys
removes every string-keyed brand read on every receiver — `o.has(brand)`,
`o[brand]`, `o.brand`, and their enum and `Result` equivalents — because no
string key remains to find. That migration does not touch the leaks above:
the carrier's index properties and `length` and the `Result`'s
`ok` / `value` / `error` fields are the receiver's own data, not brands.

The scope is in-language observability. Nothing is corrupted, nothing reaches
JSON or the wire, and `==` and the QRY-18 render exclude the brands on both
sides (bug 0020's 0.32.0 fix). The abort in element (2) is recoverable only by
not writing the expression.

## Reproduction

Offline, at HEAD `4d645f4f`, via a scratch vitest through the production
executor (the `tests/enum-schema-tag-privacy.test.ts` group-(e) harness
pattern; written, run, deleted per scratch policy). Each probe is a
parse-clean prompt-mode theta whose final expression is the probe; `value` is
the body's final value.

Fixtures: `enum Severity { Low, High }` / `let s = Severity.High` (carrier
`new String("High")`, brand `__thetaEnum: "Severity"`); `let r = Ok(1)`
(representation `{ ok: true, value: 1 }`, brand `__thetaResult: true`);
`schema F { x: integer }` / `let o = F { x: 1 }` as the object-receiver
control. Verbatim output:

```text
E1  s.has("__thetaEnum")   :: outcome=success value=true
E2  s["__thetaEnum"]       :: outcome=success value="Severity"
E3  s.__thetaEnum          :: outcome=success value="Severity"
E4  s.keys()               :: outcome=success value=["0","1","2","3"]
E5  s.values()             :: outcome=success value=["H","i","g","h"]
E6  s["0"]                 :: outcome=success value="H"
E7  laundered has(brand)   :: outcome=success value=true
E8  let t: Severity = s; t.keys()
                           :: outcome=success value=["0","1","2","3"]
E9  s.toUpperCase()        :: THREW Error: unknown object stdlib member: toUpperCase
E10 s.bogus()              :: THREW Error: unknown object stdlib member: bogus
E11 s["length"]            :: outcome=success value=4
E12 s.length (member)      :: outcome=success value=4
E13 s.has("length")        :: outcome=success value=true
R1  r.has("__thetaResult") :: outcome=success value=true
R2  r["__thetaResult"]     :: outcome=success value=true
R3  r.__thetaResult        :: outcome=success value=true
R4  r.keys()               :: outcome=success value=["ok","value"]
R5  r.values()             :: outcome=success value=[true,1]
R6  r["ok"]                :: outcome=success value=true
R7  r["definitely_absent"] :: THREW MissingObjectKeyPanic: missing object key: definitely_absent
R8  r.ok (member)          :: outcome=success value=true
R9  let q: Result<integer, string> = r; q.keys()
                           :: outcome=success value=["ok","value"]
R10 r.bogus()              :: THREW Error: unknown object stdlib member: bogus
O1  o.bogus() control      :: PARSE-REJECT theta/parse/unknown-method: unknown method 'bogus' on type F
O2  o.keys() control       :: outcome=success value=["x"]
O3  "hi".toUpperCase()     :: outcome=success value="HI"
```

Disposition against the two fixes:

| Rows | Reads | Closed by 0026 | This report |
| --- | --- | --- | --- |
| E1–E3, R1–R3 | the brand under its string key | Yes — no string key survives the Symbol migration | No |
| E4–E6, R4–R6, R8 | the carrier's enumerable index properties and the `Result` literal's enumerable fields | No — these are not brands | Yes |
| E11–E13 | the carrier's own non-enumerable `length` | No — not a brand, and presence-based reads see it regardless of descriptor | Yes |
| E7–E8, R9 | the same reads, through an unannotated `fn` parameter and through an explicitly annotated `let` | No | Yes |
| E9–E10, R10 | an unknown member | No | Yes |

Reading the rest of the table:

- **Element (1) is receiver-shaped, not key-shaped.** E4/E5/E6 read the boxed
  `String`'s index properties; R4/R5/R6/R8 read the `Result` literal's own
  fields. Both sets are enumerable, which is why `keys()` and `values()` —
  the two surfaces that DO honour the brand-privacy line — leak here anyway.
  E11–E13 make the same point from the other side: `length` is
  *non*-enumerable on the wrapper, and the presence-based surfaces read it
  because they never consult the descriptor. No key-level posture spans both
  sets; receiver classification does.
- **The static layer catches none of it.** E7 launders the receiver through
  an unannotated `fn` parameter; E8 and R9 annotate it explicitly
  (`let t: Severity`, `let q: Result<integer, string>`). All three are
  parse-clean. Annotation does not narrow the input class, which is why the
  fix is a runtime gate.
- **Element (2) against its controls.** E9/E10/R10 abort. O1 — the identical
  expression shape on a schema-typed receiver — is rejected at parse with the
  code expressions.md:122 prescribes. O3 shows E9 is not a bad member name:
  `toUpperCase()` is a declared `string` member (expressions.md:81) and works
  on a `string` receiver; on the enum carrying that same string it aborts,
  because dispatch never reaches the string surface.
- **R7 is the working arm.** A genuinely absent key on the same `Result`
  receiver raises the registered `MissingObjectKeyPanic`, so the read path is
  reached and functioning; the defect is that the receiver reaches it at all.
- **O2 is the object-receiver baseline.** `keys()` on a real object value
  answers with the declared theta-side names.

## Expected behaviour (what the spec and the module contracts say)

- runtime-value-model.md value-representation table, `Result` row (`:14`):
  "Theta code observes `Result` only through `Ok` / `Err` constructors,
  `match` patterns, and `?`; the in-memory shape is not part of the language
  surface." R4–R6 and R8 observe the in-memory shape directly. The same row
  is restated normatively at `docs/reference/type-system.md:113` ("observed
  only via constructors, `match`, `?`").
- runtime-value-model.md, enum row (`:13`): an enum value "carries the
  variant's wire string plus an interpreter-private tag identifying the
  declaring enum". The row names one theta-visible component and one
  interpreter-private one, and admits no field, index or membership surface on
  an enum value. E4–E6 and E11–E13 read one: the wire string decomposed into
  per-character index properties, plus a `length`, by the carrier the
  reference interpreter happens to use.
- runtime-value-model.md, object row (`:12`), read with expressions.md:118–120
  (`keys()` / `values()` / `has(k)` — "Theta-side field names"; "Whether a
  theta-side name is present"): the three object stdlib members are defined
  over an object value's theta-side field names. An enum value and a `Result`
  value have no theta-side field names; neither is an object value. So each
  of the three members MUST be unavailable on those receivers, not answered
  from the carrier.
- expressions.md:122: "Anything not on this list is
  `theta/parse/unknown-method` rather than a runtime failure."
  `s.toUpperCase()` and `r.bogus()` are runtime failures — element (2)
  directly.
- expressions.md:10 (indexed access): "the receiver `a` must be an
  `array<T>` or an object value; indexing any other type (including a
  `string`) is `theta/parse/non-indexable-receiver`". An enum value is
  neither. `s["0"]` and `s["length"]` are reads the same sentence forbids for
  a bare `string`, reached because the carrier is boxed.
- runtime-value-model.md:16 states the intent directly — "These shapes are
  implementation details — neither is reachable from theta code" — but the
  paragraph opens **"Reference encoding (non-normative)."** and is cited here
  as intent, not obligation. The normative anchors are the three
  value-representation rows and the expressions.md sentences above.
- Post-fix, the required observables are:
  - `s.keys()` / `s.values()` / `s.has(k)` / `s[k]` / `s.field` and the
    `Result` equivalents: rejected, carrying the registered code, on every
    path including the unannotated and annotated ones (E7/E8/R9) and
    regardless of the read property's descriptor (E11–E13).
  - `s.toUpperCase()` / `r.bogus()`: the same rejection, replacing the raw
    `Error` → `theta/runtime/internal-error` abort.
  - Object and string receivers unchanged: O1 keeps its parse rejection, O2
    keeps `["x"]`, O3 keeps `"HI"`, and R7's panic arm keeps firing for object
    receivers.
- Member access on an absent name is out of scope here and is filed as bug
  [0032](./0032-absent-member-binds-undefined.md): `evaluateMemberAccess`
  (`runtime-panics.ts:176`) binds raw JS `undefined`, and
  `o.definitely_absent == null` evaluates `false` in-language, so the
  out-of-model value is not merely invisible but untestable. This report
  states no post-fix value for the absent-member case; it inherits whatever
  0032 settles.

## Actual behaviour / root cause

The four read entry points classify their receiver by JS representation:

```
applyStdlibMethod        (statement-executor.ts:917)         typeof === "object" && !== null
evaluateStdlibMethod     (production-theta-producer.ts:5816) typeof === "object" && !== null
evaluateIndexAccess      (runtime-panics.ts:148)             typeof !== "object" → throw; else object path
evaluateMemberAccess     (runtime-panics.ts:172)             null guard only, then an unfiltered read
```

The predicate is satisfied by three distinct theta value kinds, not one:
object-schema values, the boxed-`String` enum carrier, and the `Result`
literal. The runtime carries the discriminators needed to tell them apart —
`isEnumValue` (`value.ts:218`) and `isResultValue` (`:239`), both already
exported and both used by the classifiers and by `==` — and no read path
consults either.

The static layer does not compensate. `collectTypeEnv`
(`type-layer-checks.ts:231`) builds the whole-file `TypeEnv` from `schema`
declarations alone, so an enum name resolves to nothing and
`classifyReceiver` (`:155`) returns `"unknown"` for it; `Result` has no
`CompatType` form (`type-compat.ts:55–64`) to classify at all.
`checkMemberAccess` (`:931`) treats `"unknown"` as "defer to the runtime
safety net" (`:937`) — the correct posture in general, and the reason
annotation makes no difference (E8, R9).

Element (2) is the same dispatch delivering a member the object surface does
not implement. `evaluateObjectMember`'s `switch` (`stdlib-object.ts:85`) has
arms for `keys` / `values` / `has` and a `default` that throws a raw `Error`
(`:106`). On an object receiver that arm is unreachable — the A2 layer
rejects the expression first (O1) — so it functions as an internal invariant
assertion. On an enum or `Result` receiver the A2 layer defers, the assertion
fires against author input, and the runtime-defect surface
(error-model.md:74) reclassifies it as `theta/runtime/internal-error`, which
aborts the theta and reports an interpreter message to the operator.

No key-level posture reaches the leaking properties, in either direction.
The 0.32.0 privacy line (`privateBrandOf`, `value.ts:143`) separates
interpreter-private brands from author data by descriptor; the enum carrier's
index properties and the `Result`'s `ok` / `value` / `error` fields are
enumerable and sit on the author-data side of it by construction — they are
the representation, not a tag on it. The carrier's `length` sits on the other
side, non-enumerable, and the presence-based surfaces read it anyway because
they never consult a descriptor (E11–E13). Re-keying the brands, which is what
bug 0026 does, moves neither set. Only receiver classification does.

## Why it matters

- The `Result` observation surface is closed by spec and open in practice.
  `r.ok` reads the discriminator without `match` or `?`, so a theta can
  branch on success without ever entering the ERR-18/ERR-19 propagation
  machinery those forms carry. The value-representation row exists to keep
  that surface closed.
- The leaks are reachable by accident. `s.keys()` and `r.keys()` require no
  knowledge of any interpreter internal — they are the documented object
  stdlib applied to the wrong receiver. What comes back
  (`["0","1","2","3"]`) is representation garbage that a theta can then
  index, compare, and interpolate.
- Thetas written against these accidents constrain a freedom the spec
  reserves. runtime-value-model.md:16 states the encoding "may change without
  a spec revision"; bug 0026's Symbol migration is one such change already
  queued, and a future change of the enum carrier from a boxed `String` to a
  plain object would silently change every E-row.
- Element (2) converts a member access into an aborted theta and an
  operator-facing internal-error report. It fires on a typo (`r.bogus()`) and
  equally on a correct member applied to the wrong receiver
  (`s.toUpperCase()`, which works on the `string` the enum carries). On an
  object or string receiver the same expression is either a parse diagnostic
  pointing at the source range or a working call.
- No corruption and no wire effect: this is an in-language observability and
  diagnostic-class defect, deterministic and offline-witnessable, in the same
  privacy family as bugs 0017, 0020 and 0026 but on the receiver axis rather
  than the key axis.

## Fix

**Land bug [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md)
first.** Its Symbol migration closes rows E1–E3 and R1–R3, so this fix is
written and tested against a tree where no brand is reachable under a string
key on any receiver.

**Gate the receiver at runtime.** Add one shared classifier in
`src/runtime/value.ts` beside `privateBrandOf` (`:143`) that answers whether a
`typeof "object"` value is an *object value* in the language's sense — false
for `isEnumValue` (`:218`) and `isResultValue` (`:239`), true otherwise — and
route all four read entry points through it before they reach the object
path:

- `applyStdlibMethod` (`src/runtime/statement-executor.ts:917`) and
  `evaluateStdlibMethod` (`src/extension/production-theta-producer.ts:5816`),
  ahead of the `evaluateObjectMember` call at `:925` / `:5828`.
- `evaluateIndexAccess` (`src/runtime/runtime-panics.ts:121`), extending the
  existing non-object guard at `:148–152` rather than adding a second one.
  That guard is already the "the static check was bypassed; surface it as a
  runtime defect" site, with the reclassification comment at `:146–147`; the
  gate widens its predicate and gives it a registered code.
- `evaluateMemberAccess` (`runtime-panics.ts:172`), which today has only the
  `null` guard.

One definition point, four call sites. The two hosts move in lockstep: the
effectful executor and the pure producer implement the same dispatch and a
gate on one alone leaves the other leaking.

**Mint `theta/runtime/non-object-receiver`.** A gated receiver produces this
code with a message naming the receiver kind and the attempted read. It is a
**runtime-defect-surface code, not a panic**: the six-source panic list
(error-model.md:67–72, `theta/runtime/missing-object-key` at `:71`) is closed
for spec-defined sources (`:74`) and stays closed. The new code sits
alongside `theta/runtime/internal-error`
(`docs/spec_topics/diagnostics/code-registry-runtime.md:22`) on the same
surface, with the same routing — slash-command system note,
`Err(InvokeInfraError { cause: "internal_error" })` to an `invoke` parent —
and replaces the raw `Error: unknown object stdlib member: <m>` that reaches
authors today with a diagnosis naming the actual fault. It reuses the
existing `cause: "internal_error"` arm on `InvokeInfraError`; no new arm.

Two spec edits go with it. (a) A DIAG-2 addition
(`docs/spec_topics/diagnostics/diagnostic-shape.md:72` — the registry is
closed, so a new code is a spec change): one new row in
`code-registry-runtime.md` (columns at `:11` — *Code*, *Sev*, *Phase*,
*Trigger*, *Spec rule*, *Message template*). (b) error-model.md:74 today
defines the runtime-defect surface as *unexpected* interpreter exceptions,
"any throw originating inside the runtime … that is not one of the six
closed-list sources". A deliberate receiver gate is not an unexpected throw,
so that sentence gains a clause admitting registered non-panic runtime
rejections onto the same surface. Both land in the same change as the gate.
Neither touches the closed panic list.

**No static modelling.** `collectTypeEnv` (`type-layer-checks.ts:231`) is not
extended and `NamedDecl` (`type-compat.ts:75–77`) gains no third kind. The
runtime gate is total over the input class — it catches the annotated (E8,
R9), unannotated (E7) and laundered receivers identically. A static half would
cover a strict subset (it cannot reach `Result` at all: `CompatType`,
`type-compat.ts:55–64`, has no `result` form) and would change behaviour in
positions this bug does not reach, because the same `TypeEnv` feeds
`classifyOperand` (`type-layer-checks.ts:129`) and `classifyIndexReceiver`
(`type-compat.ts:354`), where enum-typed expressions currently classify
`"unknown"` and defer. Parse-time rejection of statically-resolvable enum
receivers is separate work on top of a fix that already leaves no leak.

**Docstring corrections in the same change.** `stdlib-object.ts:18–22`'s
header ("`has(k)` tests own theta-side names only") and
`brandSchemaValue`'s "indistinguishable from a plain object on every
theta-visible surface" (`value.ts:183`) both become true only once 0026 and
this fix have landed; 0026 rewrites the latter for the Symbol encoding, and
this change updates the former to state the receiver precondition.

**GOV-15 standing.** The affected inputs were never conformant. Every probe
that changes value here reads a shape that runtime-value-model.md:16
disclaims and that the same sentence says "may change without a spec
revision"; the equivalence promise
(`docs/spec_topics/governance/source-language-stability.md:5`) is not engaged
by inputs relying on a disclaimed encoding. The *diagnostic-registry
carve-out* (`source-language-stability.md:23–25`) is the mechanism for the
new code only — a DIAG-2 addition is carve-out-covered on inputs that did not
previously emit it. The carve-out does not cover the return-value changes
(`s.keys()` answering an array today and rejecting after); those rest on the
never-conformant argument.

**Test witness — offline unit test, no live test.** A vitest mirroring
`tests/enum-schema-tag-privacy.test.ts` group (e) runs the whole probe set
through the real production executor
(`parseThetaDocument` → `createProductionProducerDeps` →
`bindPromptConversation` → `executeBody`) in under 20 ms with no model, no
network and no child process. Pin both directions: assert the new code fires,
and assert the pre-fix values are gone (`["0","1","2","3"]`,
`["ok","value"]`, `4` from `s.length`, `true` from `r.ok`) rather than only
that a rejection occurs. Keep the object- and string-receiver controls
O1/O2/O3 and R7 in the same file so a future over-broad gate reds
immediately.

## Provenance

- Origin: bug 0020 §Fix (0.32.0) residual (ii)
  (`docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md:147–153`):
  "Read-side brand visibility (found in review, established by code reading):
  `stdlib-object.ts:104` — in-language `obj.has("__thetaSchema")` answers
  `true` on a branded value (`hasOwnProperty`), and `runtime-panics.ts:157` —
  indexed access `obj["__thetaSchema"]` returns the brand string instead of
  `MissingObjectKeyPanic`; tension with `brandSchemaValue`'s
  'indistinguishable from a plain object on every theta-visible surface'" —
  found in review round 2 of the 0020 fix (fix commit `b542dafe`). The sweep
  of that residual established the receiver-dispatch class this report now
  carries; the brand-key sites the residual names are discharged by bug
  [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md), which
  also discharges residual (i).
- Sibling reports: [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md)
  (brand keys, lands first);
  [0032](./0032-absent-member-binds-undefined.md) (the absent-member
  `undefined` bind, split out of this report's member-access arm);
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md), whose
  unresolved-constructor passthrough (`Mystery { r: Ok(1) }` loads clean and
  evaluates as an unbranded plain object) is a second author-plausible route
  into the R-arm: it constructs an object *holding* a `Result`, so `m.r.ok`
  reaches element (1) while naming no interpreter internal.
- Spec: `docs/spec_topics/runtime-value-model.md:12/:13/:14`
  (value-representation table — object, enum and `Result` rows) and `:16`
  (reference-encoding paragraph, explicitly non-normative);
  `docs/spec_topics/expressions.md:10` (indexed access — receiver must be an
  `array<T>` or an object value), `:79` (`string` `length`), `:81`
  (`string` `toUpperCase()`), `:107` (`array` `length`), `:118–120` (object
  stdlib table rows `keys()` / `values()` / `has(k)`), `:122` ("Anything not
  on this list is `theta/parse/unknown-method` rather than a runtime
  failure");
  `docs/spec_topics/errors-and-results/error-model.md:71` (the
  `theta/runtime/missing-object-key` panic bullet), `:74` (closed panic list
  and the runtime-defect surface), `:84` (registered template
  `missing object key: <key>`);
  `docs/spec_topics/diagnostics/code-registry-runtime.md:22`
  (`theta/runtime/internal-error` row);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2 — the closed
  registry); `docs/reference/type-system.md:113` (`Result` observed only via
  constructors, `match`, `?`);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15),
  `:23–25` (diagnostic-registry carve-out);
  `docs/spec_topics/control-flow.md:15` (CTRL-1 — `for` iterates an
  `array<T>` snapshot, so object iteration has no direct surface).
- Implementation evidence at `4d645f4f`: `src/runtime/statement-executor.ts:917`
  (`applyStdlibMethod`, object arm `:925`, call site `:745`; index and member
  entry points `:702` / `:719`);
  `src/extension/production-theta-producer.ts:5816` (`evaluateStdlibMethod`,
  object arm `:5828`, call site `:5698`; index and member entry points
  `:5669` / `:5663`; render walk `:5560`);
  `src/runtime/runtime-panics.ts:121` (`evaluateIndexAccess`), `:148–152`
  (non-object guard, reclassification comment `:146–147`), `:157/:158/:160`
  (object arm), `:172/:176` (`evaluateMemberAccess`);
  `src/runtime/stdlib-object.ts:83` (`OBJECT_MEMBERS`), `:85`
  (`evaluateObjectMember`), `:94/:98/:103–104` (`keys`/`values`/`has` arms),
  `:106` (raw-`Error` default arm), `:18–22` (header comment);
  `src/runtime/value.ts:119/:121–126` (`makeEnumValue` and its brand
  descriptor), `:143` (`privateBrandOf`), `:183` (`brandSchemaValue`
  contract), `:218` (`isEnumValue`), `:239` (`isResultValue`), `:257–262`
  (`brandResult` descriptor), `:342` (`valuesEqual` enumerable membership);
  `src/parser/type-layer-checks.ts:129` (`classifyOperand` named arm), `:155`
  (`classifyReceiver`), `:231` (`collectTypeEnv` — schemas only), `:931/:937`
  (`checkMemberAccess` — object and unknown both defer);
  `src/parser/type-compat.ts:55–64` (`CompatType` — no `result` form),
  `:75–77` (`NamedDecl` — two kinds), `:354` (`classifyIndexReceiver` named
  arm); `src/render/query-render.ts:408` (compact `JSON.stringify` render).
- Reproduction: scratch vitest at HEAD — 26 probes through the production
  executor: the enum-carrier set including the no-internal-names probes
  (`keys()` / `values()` / `["0"]`), the non-enumerable-`length` probes on all
  three presence-based surfaces, an unannotated-`fn` laundering variant and an
  explicitly annotated `let` variant; the `Result` brand, shape and annotated
  sets; the unknown-member probes on both receiver kinds; and the controls —
  parse rejection and `keys()` on an object receiver, `toUpperCase()` on a
  `string` receiver, and the absent-key panic. Output quoted verbatim above,
  then deleted per scratch policy.
