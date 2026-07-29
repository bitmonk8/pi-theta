# Bug 0027 — The in-language object read surfaces test JS own-property presence, not theta-side membership: `has("__thetaSchema")` answers `true` on a branded value, indexed access returns the brand string instead of `MissingObjectKeyPanic`, member access reads it bare, and enum/`Result` receivers expose their whole reference encoding

- **Status:** open
- **Kind:** defect — the three object read surfaces disagree with the read
  semantics expressions.md pins and with the privacy claims the runtime value
  model (and the 0.32.0 fix itself) make. expressions.md's indexed-access
  bullet: "The index names a **theta-side name** … an object index whose
  theta-side name is absent panics with `theta/runtime/missing-object-key`";
  its stdlib table row for `has(k)`: "Whether a **theta-side name** is
  present". An interpreter-private brand is not a theta-side name —
  `docs/spec_topics/runtime-value-model.md` (reference-encoding paragraph)
  claims the concrete shapes are "not reachable from theta code", and
  `brandSchemaValue`'s module contract (`src/runtime/value.ts:183`) claims the
  branded value is "indistinguishable from a plain object on every
  theta-visible surface". At HEAD, three read surfaces reach the brands (and,
  for enum/`Result` receivers, the entire reference encoding) while the other
  four surfaces honour privacy — the defect is the inconsistency plus the
  violated contracts, not a corruption: post-0020, classification, `==`, the
  QRY-18 render, and JSON/wire output are all brand-clean.
- **Affected** (at HEAD `b542dafe`, 0.32.0):
  - `evaluateObjectMember` (`src/runtime/stdlib-object.ts:85`), `has` arm
    (:104) — `Object.prototype.hasOwnProperty.call(receiver, k)` matches the
    non-enumerable brands. Its own header comment says "`has(k)` tests own
    theta-side names only".
  - `evaluateIndexAccess` (`src/runtime/runtime-panics.ts:157`) — the
    missing-key gate is `hasOwnProperty`, so a brand key passes it and the
    unfiltered read at `:160` returns the brand value in place of the
    documented `MissingObjectKeyPanic`.
  - `evaluateMemberAccess` (`src/runtime/runtime-panics.ts:172–176`) — a bare
    unfiltered property read; no membership gate at all. Statically clean:
    `checkMemberAccess` (`src/parser/type-layer-checks.ts:931`, arm at :937)
    deliberately does not gate field access on object-classified receivers.
  - Receiver dispatch — `applyStdlibMethod`
    (`src/runtime/statement-executor.ts:917`) and its pure-host twin
    `evaluateStdlibMethod`
    (`src/extension/production-theta-producer.ts:5816`) route ANY non-null
    non-array `typeof "object"` receiver to `evaluateObjectMember`. The
    boxed-`String` enum carrier and the `Result` representation are both
    `typeof "object"`, so enum and `Result` receivers take the object read
    surface. The static A2 gate defers instead of rejecting: `collectTypeEnv`
    (`type-layer-checks.ts:231`) registers only `schema` declarations, so an
    enum- or `Result`-typed receiver classifies `"unknown"`
    (`classifyReceiver`, :155) and every probe below is parse-clean.
  - Surfaces that HONOUR privacy (the other half of the inconsistency):
    `keys()` / `values()` (`stdlib-object.ts:94/:98` — `Object.keys` /
    `Object.values`, enumerable-only), the `==` object arm
    (`src/runtime/value.ts:342` — enumerable key walk plus
    `propertyIsEnumerable` membership, the posture the 0.32.0 fix added), the
    QRY-18 render (`production-theta-producer.ts:5560` walks
    `Object.entries`; `query-render.ts:408` and the outbound pass serialise
    via `JSON.stringify`, which skips non-enumerable properties), and JSON/
    wire egress (brands never serialise).
- **Observed at:** `0.32.0` (`b542dafe`). Offline and deterministic; no live
  model required. All probes drive the production executor
  (`parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`) with parse-clean sources.

## Summary

Bug 0020 (fixed 0.32.0) made brand *classification* descriptor-private: an
enumerable same-named key can no longer forge an enum, a schema brand, or a
`Result`, and `valuesEqual`'s object arm now tests membership with
`propertyIsEnumerable`. The *read* direction was recorded as residual (ii) of
that fix and is substantiated here: the three in-language object read
surfaces — `has(k)`, indexed access `o[k]`, and member access `o.field` —
still answer from JS own-property presence, which includes the non-enumerable
brands. The result is one object value with two contradictory key sets:
`o.keys()` on a branded schema value yields `["x"]`, yet `o.has("__thetaSchema")`
answers `true`, `o["__thetaSchema"]` returns `"F"` where the spec's own
wording requires `MissingObjectKeyPanic`, and `o.__thetaSchema` reads the
brand bare.

The sweep found the exposure is wider than the two sites the residual
recorded:

1. **Member access is a third leaking surface.** `o.__thetaSchema` is
   parse-clean (object field access is deliberately ungated at the type
   layer) and `evaluateMemberAccess` performs an unfiltered read — no
   `hasOwnProperty` gate is even involved.
2. **Enum receivers expose the whole boxed-`String` carrier, not only the
   brand.** Runtime dispatch classifies receivers by JS `typeof`, and a boxed
   `String` is `typeof "object"`, so every object read surface applies:
   `s.has("__thetaEnum")` → `true`, `s["__thetaEnum"]` / `s.__thetaEnum` →
   `"Severity"`, and — reachable without naming any interpreter internal —
   `s.keys()` → `["0","1","2","3"]` and `s.values()` → `["H","i","g","h"]`
   (the carrier's enumerable index properties), `s["0"]` → `"H"`.
3. **`Result` receivers expose the brand AND the internal `{ ok, … }`
   shape.** `r.has("__thetaResult")` → `true`, `r["__thetaResult"]` /
   `r.__thetaResult` → `true` (the brand value); and `r.keys()` →
   `["ok","value"]`, `r.values()` → `[true,1]`, `r["ok"]` / `r.ok` → `true` —
   although the value-representation table's `Result` row states "Theta code
   observes `Result` only through `Ok` / `Err` constructors, `match`
   patterns, and `?`; the in-memory shape is not part of the language
   surface." (The shape fields are enumerable, so this arm is not a brand
   read — it is the reference encoding reachable from theta code, the exact
   thing the encoding paragraph disclaims.)

Honest severity: an in-language-only observability defect. Nothing is
corrupted — post-0020 the brands cannot be forged, `==` and the QRY-18 render
exclude them on both sides, and they never serialise to JSON or wire. The
brand reads on plain schema values require deliberately naming an interpreter
internal. The elevation the sweep adds: the enum-carrier and `Result`-shape
exposures (`s.keys()`, `r.keys()`, `r.ok`) require no such knowledge — an
author calling an ordinary stdlib member on the wrong receiver silently gets
interpreter internals (`["0","1","2","3"]`) instead of a diagnostic or panic.

## Reproduction

Offline, at HEAD `b542dafe`, via a scratch vitest through the production
executor (the `tests/enum-schema-tag-privacy.test.ts` group-(e) harness
pattern; written, run, deleted per scratch policy). Each probe is a
parse-clean prompt-mode theta whose final expression is the probe; `value` is
the body's final value.

Fixtures: `schema F { x: integer }` / `let o = F { x: 1 }` (brand
`__thetaSchema: "F"`); `enum Severity { Low, High }` / `let s = Severity.High`
(carrier `new String("High")`, brand `__thetaEnum: "Severity"`);
`let r = Ok(1)` (brand `__thetaResult: true`). Verbatim output:

```text
S1  o.has(brand)          :: outcome=success value=true
S2  o[brand]              :: outcome=success value="F"
S3  o[absent] control     :: THREW MissingObjectKeyPanic: missing object key: definitely_absent
S4  o.__thetaSchema       :: outcome=success value="F"
S5  o.keys()              :: outcome=success value=["x"]
S6  o.values()            :: outcome=success value=[1]
S7  has(absent) control   :: outcome=success value=false
S8  ==-arm brands excluded :: outcome=success value=true
E1  s.has(brand)          :: outcome=success value=true
E2  s[brand]              :: outcome=success value="Severity"
E3  s.__thetaEnum         :: outcome=success value="Severity"
E4  s.keys()              :: outcome=success value=["0","1","2","3"]
E5  s.values()            :: outcome=success value=["H","i","g","h"]
E6  s["0"]                :: outcome=success value="H"
E7  laundered has(brand)  :: outcome=success value=true
R1  r.has(brand)          :: outcome=success value=true
R2  r[brand]              :: outcome=success value=true
R3  r.__thetaResult       :: outcome=success value=true
R4  r.keys()              :: outcome=success value=["ok","value"]
R5  r.values()            :: outcome=success value=[true,1]
R6  r["ok"]               :: outcome=success value=true
R7  r[absent] control     :: THREW MissingObjectKeyPanic: missing object key: definitely_absent
S9  o.definitely_absent   :: outcome=success value=undefined
R8  r.ok (member)         :: outcome=success value=true
```

Reading the table:

- **The recorded residual, re-verified** — S1 (`has` → `true`) and S2
  (indexed read → `"F"`), against control S3: a genuinely absent key panics
  with the registered `missing object key: <key>` message, so the brand key
  behaves as *more present* than an absent theta-side name on the same
  surface that panics for the latter.
- **The keys()-vs-has() asymmetry** — S5 (`keys()` → `["x"]`) against S1: the
  brand is invisible to the enumeration surface and visible to the membership
  surface on the same value. S8 confirms `==` excludes brands on both sides
  (two same-shaped values branded by *different* schemas, `F` vs `G`, compare
  `true`).
- **The third surface** — S4: member access reads the brand with no gate.
  Control S9: member access on a genuinely absent field silently binds
  `undefined` (a pre-existing adjacent quirk of the missing-member semantic,
  orthogonal to this report; noted so the post-fix expectation for S4 is
  stated against the real baseline).
- **Enum carrier** — E1–E6 all parse-clean and leak; E4/E5/E6 name no
  interpreter internal. E7 shows the same read laundered through an
  unannotated `fn` parameter (the receiver's static type is unresolvable
  either way; the A2 gate defers on both paths).
- **`Result`** — R1–R3 read the brand; R4–R6/R8 read the internal shape;
  control R7 panics as documented.

## Expected behaviour (what the spec and the module contracts say)

- expressions.md §"Supported forms" (indexed access): "The index names a
  **theta-side name** … an object index whose theta-side name is absent
  panics with `theta/runtime/missing-object-key`." The runtime value model
  (value-representation table, object row) defines an object value as a "JS
  plain object keyed by **theta-side names**". A brand is not a theta-side
  name — so `o["__thetaSchema"]` on a branded value whose schema declares no
  such field is an absent theta-side name and MUST panic (control S3 shows
  the panic arm working for every other absent key).
- expressions.md §"Built-in methods and properties", `has(k)` row: "Whether a
  **theta-side name** is present." → `o.has("__thetaSchema")` MUST answer
  `false` (as `false` as `o.has("definitely_absent")`).
- Member access on a branded value MUST behave as if the brand key were
  absent — i.e. take whatever the absent-member semantic is (today:
  the silent `undefined` bind of S9), never read the brand.
- `docs/spec_topics/runtime-value-model.md`, reference-encoding paragraph
  (including the sentence the 0.32.0 fix added): "The reference interpreter
  implements the enum tag as a non-enumerable `__thetaEnum` string property
  on the JS string wrapper, and represents `Result<T, E>` as
  `{ ok: true, value: T }` for `Ok(v)` and `{ ok: false, error: E }` for
  `Err(e)`, branded by the constructors with a non-enumerable `__thetaResult`
  property. … The enum tag is recognised the same way — by the non-enumerable
  descriptor, never by key presence — so an object naming `__thetaEnum` as an
  ordinary (enumerable) key is an ordinary object value. These shapes are
  implementation details — **neither is reachable from theta code**, neither
  appears in any wire schema, and either may change without a spec
  revision." Every E- and R-row above is theta code reaching those shapes.
- Value-representation table, `Result` row: "Theta code observes `Result`
  only through `Ok` / `Err` constructors, `match` patterns, and `?`; the
  in-memory shape is not part of the language surface." R4–R6/R8 observe the
  in-memory shape directly.
- `brandSchemaValue` (`src/runtime/value.ts:186`, docstring at :183): "The
  tag is installed **non-enumerable**, so the branded value is
  indistinguishable from a plain object on every theta-visible surface; only
  {@link schemaTagOf} reads it." S1/S2/S4 distinguish a branded value from a
  plain one in-language and read the tag other than through `schemaTagOf`.
  (The sibling `SCHEMA_TAG` docstring at :168 claims invisibility only for
  the surfaces that do honour it — `JSON.stringify`, `Object.keys`,
  `valuesEqual` — and names neither `has` nor index/member; the over-claim is
  `brandSchemaValue`'s "every theta-visible surface".)

Which surfaces honour "interpreter-private / not reachable from theta code"
and which do not, precisely:

| Theta-visible surface | Mechanism | Brand visible? |
| --- | --- | --- |
| `keys()` | `Object.keys` (enumerable own) | No |
| `values()` | `Object.values` (enumerable own) | No |
| `for x in …` | arrays only (CTRL-1); object iteration routes through `keys()` | No |
| `==` object arm | `Object.keys` walk + `propertyIsEnumerable` membership (0.32.0) | No |
| QRY-18 interpolation render | `Object.entries` walk + `JSON.stringify` | No |
| JSON / wire egress | `JSON.stringify` (non-enumerable skipped) | No |
| `has(k)` | `hasOwnProperty` | **Yes** |
| `o[k]` indexed access | `hasOwnProperty` gate + unfiltered read | **Yes** (brand value returned; the documented panic is suppressed) |
| `o.field` member access | unfiltered read, no gate | **Yes** |

(Spread/merge object stdlib operations do not exist at HEAD — `OBJECT_MEMBERS`
is exactly `{keys, values, has}` — so there is no merge surface to sweep.)

## Actual behaviour / root cause

Two mechanisms compose:

1. **Presence-based reads.** `has()` and the indexed-access gate test
   `Object.prototype.hasOwnProperty` — the same presence-only posture bug
   0020 removed from the *classifiers* — and member access reads with no gate
   at all. The 0.32.0 fix drew the enumerability line for classification
   (`privateBrandOf`, `value.ts:143`) and for `==` membership
   (`value.ts:342`) but the three read surfaces were left on JS own-property
   presence, so the theta-visible key set differs by surface.
2. **`typeof`-based receiver dispatch.** `applyStdlibMethod` /
   `evaluateStdlibMethod` and `evaluateIndexAccess` / `evaluateMemberAccess`
   classify receivers by JS representation (`typeof "object"`), which is
   satisfied by the boxed-`String` enum carrier and the `Result` object — so
   value kinds the language defines as *non-object* (each has its own
   value-representation row and, for `Result`, an explicit closed observation
   surface) take the object read path. The static A2 layer cannot catch this:
   `collectTypeEnv` registers only `schema` declarations, so enum- and
   `Result`-typed receivers classify `"unknown"` and defer to the runtime
   safety net — which then answers from the carrier. The enum carrier's index
   properties and the `Result`'s `ok`/`value`/`error` fields are *enumerable*
   own properties, which is why even the enumerable-only surfaces (`keys()` /
   `values()`) leak on those receivers: for them the defect is upstream of
   the enumerability line, in receiver classification.

## Why it matters

- The 0.32.0 fix's own posture is half-applied: one shared privacy line
  (non-enumerable ⇒ interpreter-private) now governs classification and
  equality, while three read surfaces on the same values answer from a
  different key universe. `keys()` and `has()` — documented as two views of
  one membership notion ("theta-side name … present") — disagree on the same
  object.
- The documented panic contract is silently suppressed for exactly the brand
  keys: `o["__thetaSchema"]` is the one absent-theta-side-name read that
  returns a value instead of `MissingObjectKeyPanic`, and what it returns is
  an interpreter internal. Code that probes keys via `has`/index (the
  documented safe-check pattern) will treat branded values as carrying fields
  their schemas do not declare.
- The enum/`Result` arm is reachable innocently (`s.keys()`, `r.keys()`,
  `r.ok` — no internal names required) and returns representation garbage
  (`["0","1","2","3"]`) or bypasses the closed `Result` observation surface
  (`r.ok` reads the discriminator without `match`/`?`, skipping the ERR-18/19
  machinery built around them). Thetas written against these accidents
  constrain the "may change without a spec revision" freedom the encoding
  paragraph reserves — e.g. the bug-0020 fix options contemplated re-keying
  the brands (Symbols), which would silently change every probe in the table.
- No corruption and no wire effect: this is an information-leak /
  inconsistency defect, deterministic and offline-witnessable, in the same
  privacy family as bugs 0017 and 0020 but strictly read-side.

## Fix options and recommendation

1. **One shared theta-visible-membership helper for the three read surfaces
   (recommended), plus receiver gating for enum/`Result` (required by every
   option).**
   - (a) Add `isThetaVisibleKey(value, key)` (or reuse the
     `propertyIsEnumerable` posture directly) in `src/runtime/value.ts`
     beside `privateBrandOf` — the read-side dual of the 0.32.0 classifier —
     and route `has()` (`stdlib-object.ts:104`), the indexed-access gate
     (`runtime-panics.ts:157`), and `evaluateMemberAccess`
     (`runtime-panics.ts:172`) through it. `has(brand)` becomes `false`,
     `o[brand]` becomes `MissingObjectKeyPanic`, `o.brand` takes the
     absent-member semantic. One definition point prevents the drift that
     produced this bug (0020 fixed four call sites; these three were the ones
     left behind).
   - (b) Gate receiver dispatch: an `isEnumValue` / `isResultValue` receiver
     must not take the object read surface (`applyStdlibMethod`,
     `evaluateStdlibMethod`, `evaluateIndexAccess`, `evaluateMemberAccess`) —
     enums have no stdlib members and `Result` observation is closed by its
     spec row. Registering enum declarations in the A2 `TypeEnv`
     (`collectTypeEnv`) additionally turns the statically-typed cases into
     parse-time `theta/parse/unknown-method` / `non-indexable-receiver`
     rejections instead of runtime accidents. Without (b), option (a) still
     leaves `s.keys()` → `["0","1","2","3"]` and `r.keys()` → `["ok","value"]`:
     the carrier/shape properties are enumerable, so no key-level posture
     reaches them.
   - Cost: touches the documented `has`/index behaviour only for keys no
     schema can declare honestly today; a theta relying on reading brands is
     relying on the disclaimed encoding.
2. **Symbol brands (the parent report's Option 2).** Re-key the three brands
   as module-private `Symbol`s. String-keyed visibility disappears from every
   surface at once — `has("__thetaSchema")`, `o["__thetaSchema"]`, and
   `o.__thetaSchema` all become ordinary absent-key reads with no per-surface
   edits — and it also fixes the sibling residual (i), the constructor
   collision (a declared field literally named `__thetaSchema` destroyed by
   `brandSchemaValue`), being filed in parallel as bug 0026: with a Symbol
   key there is no string key to collide with. Cost: diverges from the
   string-tag + descriptor pattern bugs 0017/0020 standardised
   (`privateBrandOf` and its docstrings re-anchor on Symbols), the
   non-normative reference-encoding paragraph needs the matching edit
   (permitted — "may change without a spec revision"), and it does NOT touch
   the enum-carrier / `Result`-shape exposure — arm 1(b) is still required,
   since those leaks are enumerable carrier properties, not brand keys. If
   bug 0026's fix lands as Symbols, the brand-key half of this report
   collapses into it and only 1(b) remains needed here.
3. **Per-surface inline spot fixes** (swap `hasOwnProperty` for
   `propertyIsEnumerable` at each of the three sites, no shared helper).
   Same observable outcome as 1(a); rejected as the pattern that caused the
   drift — the privacy posture would then live in five copies across three
   modules, and the next read surface added would default to presence again.

## Provenance

- Origin: bug 0020 §Fix (0.32.0) residual (ii)
  (`docs/bugs/0020-enum-schema-tags-presence-only-forgeable.md`): "Read-side
  brand visibility (found in review, established by code reading):
  `stdlib-object.ts:104` — in-language `obj.has(\"__thetaSchema\")` answers
  `true` on a branded value (`hasOwnProperty`), and `runtime-panics.ts:157` —
  indexed access `obj[\"__thetaSchema\"]` returns the brand string instead of
  `MissingObjectKeyPanic`; tension with `brandSchemaValue`'s
  'indistinguishable from a plain object on every theta-visible surface'" —
  found in review round 2 of the 0020 fix (fix commit `b542dafe`). This
  report re-verifies both sites at that commit, adds the member-access
  surface and the enum-carrier / `Result` equivalents, and reproduces all of
  it empirically.
- Sibling residual (i) — the constructor collision — is being filed in
  parallel as bug 0026 (cross-referenced by number; see fix option 2 for the
  interaction).
- Spec: `docs/spec_topics/expressions.md` (indexed-access bullet; stdlib
  table rows `keys()` / `values()` / `has(k)`),
  `docs/spec_topics/runtime-value-model.md` (value-representation table —
  object, enum, and `Result` rows; reference-encoding paragraph including the
  0.32.0-added recognition sentence),
  `docs/spec_topics/errors-and-results/error-model.md`
  (`theta/runtime/missing-object-key`, registered template
  `missing object key: <key>`), `docs/reference/type-system.md` (`Result`
  row: "observed only via constructors, `match`, `?`"),
  `docs/spec_topics/control-flow.md` CTRL-1 (`for` iterates an `array<T>`
  snapshot — object iteration has no direct surface).
- Implementation evidence at `b542dafe`: `src/runtime/stdlib-object.ts:85`
  (`evaluateObjectMember`), `:94/:98/:104` (`keys`/`values`/`has` arms);
  `src/runtime/runtime-panics.ts:157/:160` (indexed-access gate and read),
  `:172–176` (`evaluateMemberAccess`); `src/runtime/value.ts:143`
  (`privateBrandOf`), `:168` (`SCHEMA_TAG` docstring), `:183/:186`
  (`brandSchemaValue` contract), `:342` (`valuesEqual` enumerable
  membership); `src/runtime/statement-executor.ts:917` /
  `src/extension/production-theta-producer.ts:5816` (`typeof`-based receiver
  dispatch, effectful and pure hosts), `:5560` (render walk via
  `Object.entries`); `src/render/query-render.ts:408` (compact
  `JSON.stringify` render); `src/parser/type-layer-checks.ts:155`
  (`classifyReceiver`), `:231` (`collectTypeEnv` — schemas only), `:931/:937`
  (`checkMemberAccess` — object field access ungated).
- Reproduction: scratch vitest at HEAD (24 probes through the production
  executor — the three brand-read surfaces with absent-key panic and
  `has(absent)` controls, the `keys()`/`values()` invisibility and `==`
  brand-exclusion controls, the enum-carrier set including the
  no-internal-names probes and an unannotated-`fn` laundering variant, the
  `Result` brand and shape sets, and the absent-member baseline), output
  quoted verbatim above, then deleted per scratch policy.
