# Bug 0031 — Schema-constructor field values are never checked against the declared field types: `Point { x: "hello" }` loads clean and mints a `Point`-branded value

- **Status:** fixed (0.43.0). §Fix as settled — declared field types threaded
  into the `TypeEnv`, one per-field compatibility check at the type-phase
  `object` arm, new `theta/parse/object-field-type-mismatch` row (DIAG-2),
  `type-system.md:27` enumeration entry. See §Fix (0.43.0) below.
- **Kind:** defect — the constructor position runs no compatibility check over
  its field values. Two elements with different spec standing:
  1. **The declared field type is not threaded as an `array<T>` element sink.**
     [grammar.md §`array<T>` literal type-sink rule](../spec_topics/grammar.md#arrayt-literal-type-sink-rule)
     (`docs/spec_topics/grammar.md:216–221`) declares its sink set **exhaustive**
     and lists "the declared type of a surrounding constructor field
     (`Schema { items: [...] }`)" at `:220`;
     [expressions.md:222](../spec_topics/expressions.md#object-construction-array-construction-and-operator-rules)
     pins the sink-mismatch code as `theta/parse/array-element-type-mismatch`.
     The implementation reaches a constructor-field array literal through the
     sink-less arm. Implementation defect against a normative rule; the code is
     already registered.
  2. **No field value of any other shape is compared to its declared type.**
     A `Point`-branded value whose `x` holds a `string` falsifies the
     [Operational definition](../spec_topics/type-system.md#type-compatibility)
     (`docs/spec_topics/type-system.md:29`: a value statically typed `T`
     AJV-validates against `T`'s lowering). Standing is weaker and stated
     honestly below: `type-system.md:27`'s normative check-site enumeration
     omits the constructor-field position and no registry code covers a
     constructor field-value mismatch, so this element is an unenforced
     invariant plus a registry gap — the second bug category of
     [docs/bugs/README.md](./README.md).
- **Affected** (citations verified at HEAD `4d645f4f`, 0.32.0):
  - **The live site** — `TypeLayerWalk.walkExpr`'s `object` arm
    (`src/parser/type-layer-checks.ts:754–758`): it recurses into every field
    value and passes nothing down. No `checkCompatible` call, no element sink.
  - `src/parser/type-layer-checks.ts:710–717` — the sink-less array arm
    (`this.checkArrayLiteral(e, undefined, bindings)`) a constructor-field
    array literal falls into from `:756`.
  - `src/parser/type-layer-checks.ts:336–368` — the typed-`let` arm, live over
    the same values: `checkLetRhsCompat` at `:347`, element-sink threading at
    `:358–360`. Same walk, same engine, same block.
  - `src/parser/type-layer-checks.ts:231–239` (`collectTypeEnv`) — maps every
    `schema` declaration to `{ kind: "object-schema" }` and records no field
    list; `enum` declarations are not recorded at all.
  - `src/parser/type-compat.ts:75–77` (`NamedDecl`) — the `object-schema` arm
    carries no fields, so the compatibility engine cannot reach a declared
    field type even when handed one. `checkCompatible` (`:113`),
    `checkLetRhsCompat` (`:372–411`), `checkCommonType` (`:465–497`) are the
    engines the constructor-field position never calls.
  - `src/parser/type-compat.ts:222–237` — a `named` operand absent from the
    `TypeEnv` yields `"unknown"`, which every caller treats as a skip. This
    bounds the fix's coverage (see §Fix).
  - **The data gap, both copies.** The parser retains the declared field type:
    `SchemaFieldSource` (`src/parser/theta-document.ts:515–525`) carries
    `name`, `typeSource`, and the optional `wireName`. Both consumers drop
    `typeSource`:
    - `ObjectSchemaSpec` (`src/parser/literal-sublanguage.ts:528–531`) is
      `{ name, fields: readonly string[] }`; `checkObjectLiteralFields`
      (`:543–562`) is a set difference over names.
    - `StructuralRefs.schemas` (`src/parser/theta-document.ts:4711`) is
      `ReadonlyMap<string, readonly string[]>`, built at `:4746–4753` by
      `s.fields.map((f) => f.name)` (`:4752`).
  - `checkObjectExpr` (`src/parser/theta-document.ts:5038`) — the structural
    constructor gate: extra-field loop `:5061–5073`, missing-field call
    `:5074–5080`. Both presence-only.
  - `src/parser/static-type-inference.ts:257–258` — an object constructor
    types as `{ kind: "named", name: node.typeName }`; `:259–260` — a
    `result-ctor` types as `{ kind: "named", name: node.ctor }` (`"Ok"` /
    `"Err"`), a name no `TypeEnv` declares. This is why fixture w2 is not
    closed by threading field types alone.
  - Runtime, both evaluation hosts: `src/runtime/statement-executor.ts:657–673`
    (brand choice `:669–672`) and
    `src/extension/production-theta-producer.ts:5636–5651` (`:5647–5650`).
    Both brand on `env.resolveSchema(typeName)` succeeding
    (`src/runtime/lexical-environment.ts:517`) and inspect no field value.
  - QRY-18 outbound render (`translateInterpolationOutbound`,
    `src/extension/production-theta-producer.ts:5526–5566`) — the brand read at
    `:5548` is authoritative over the declared-type hint, and drives the
    theta→wire rename map built at `:5552–5557`. A malformed `Point`-branded
    value is rendered under `Point`'s wire names.
  - `schemaTagOf` (`src/runtime/value.ts:207`) and `isResultValue` (`:239`) —
    the brand reads used as observables below.
- **Observed at:** `0.32.0` (`4d645f4f`). Fully offline and deterministic — no
  live model, no provider.
- **Fix ordering:** none. [0025](./0025-ctor-unresolved-schema-name-passthrough.md)
  is the sibling gate in the same constructor position and the two are
  independent: 0025 edits the structural defer arm
  (`theta-document.ts:5054–5060`) and widens
  `theta/parse/unresolved-named-type`; this fix edits the type-phase walk
  (`type-layer-checks.ts`) and mints a different row. The two gates partition
  the input space — a constructor whose name does not resolve to a declared
  object schema never reaches the field-value check.

## Fix (0.43.0)

The settled §Fix, implemented as written. Line anchors are at the fix commit.

**Declared field types carried into the `TypeEnv`.** `NamedDecl`'s
`object-schema` arm (`src/parser/type-compat.ts`) gains an optional
`fields?: Readonly<Record<string, CompatType>>`; `collectTypeEnv`
(`src/parser/type-layer-checks.ts`) populates it from `SchemaDecl.fields`
through the existing `annotationToCompatType`. The record is
null-prototyped and the lookup own-keyed (review finding F1: theta field
names may collide with `Object.prototype` members — `toString`,
`constructor`, `__proto__` — and the record must neither answer through the
prototype chain nor let a `__proto__` assignment set the prototype). The
alias / `by … = …` forms keep a fieldless decl; `checkCompatible`'s
TYPE-10 arm reads only `env[name] !== undefined`, so no existing relation
moved (`tests/type-compat.test.ts` green unmodified).

**The check at the `object` arm.** For a constructor resolving to an object
schema with fields, each field in the literal∩declaration intersection is
checked by the new `checkObjectFieldCompat` (mirrors `checkLetRhsCompat`
routing): a `result-ctor` value is rejected outright (the only route that
closes w2 — `checkCompatible` answers `"unknown"` for it at every sink);
otherwise `"incompatible"` emits the new code, `"integer-narrowing"` emits
the registered `theta/parse/integer-narrowing` (closes w5),
`"compatible"`/`"unknown"` emit nothing. An array-literal value under an
`array<T>` declared type is additionally sunk through `checkArrayLiteral`
with the per-field skip threaded through `walkExpr`'s `skipArray`, closing
w4 through the already-registered `theta/parse/array-element-type-mismatch`
beside the new code — the c3 let-arm pair. Extra/missing fields keep
reporting only through the presence gates (x1/x2). No runtime change; brand
sites, `checkObjectExpr`, and the parse-structural layer untouched.

**Registry (DIAG-2, same commit).**
`docs/spec_topics/diagnostics/code-registry-parse.md:46` — the
`theta/parse/object-field-type-mismatch` row exactly as §Fix specifies
(Sev E, phase type, the row-`:54` resolvability qualifier, Message
`field '<field>' on schema '<schema>' type mismatch: expected <expected>,
got <actual>`); mirrored at `docs/reference/diagnostics.md:92`. All four
placeholders pre-exist in the closed placeholder surface (`<field>`
category 5, `<schema>` category 7, `<expected>`/`<actual>` category 1) — no
closure edit. `type-system.md:27` gains "or a schema-constructor field
value against its declared field type" in the check-site enumeration; the
reference type-system page is position-generic and needed nothing.

**Reproduction re-derived at the fix baseline** (`62a848ff`, 0.42.0): all
17 rows (w1–w5, c1–c7, r1–r5 both sides) plus the four runtime brand
observables byte-identical to the recorded 0.32.0 tables — zero drift
across eight releases. Post-fix: w1 fires the new code per field, w2
`expected Inner, got Ok`, w3 `expected Inner, got Other`, w4 the
new-code + array-element pair, w5 `cannot narrow number to integer`;
c1–c7 byte-unchanged; r1–r5 still silent on both sides.

**Offline lock.** `tests/ctor-field-type-check.test.ts` (30 tests):
w1–w5 red-first, x1/x2 intersection rule, c1–c7 controls with
registry-sourced messages, ten residue negatives pinned as total silence
(so widening `collectTypeEnv` to `enum` names is a deliberate edit),
e1–e5 production-executor observables (branded-malformed values gone
because the source is refused; well-typed constructor still brands),
p1–p4 prototype-collision pins, REG DIAG-4 drift guard reconciling the
pinned template against the live registry. Verified in both directions:
neutralising the object-arm check reds exactly w1–w5/x2/e1–e4/p4 with the
recorded signatures (REG stays green — the red attributes to the code
path, not the row); byte-exact restore per blob hash greens 30/30. Full
gate 234 files / 2856 tests; typecheck and lint clean. Live: H8a 7/7 green
(the forged-ingress row's child body is itself a schema constructor parsed
by the new check inside a real spawned child) plus the H9a
constructor-bearing acceptance witness green.

**Residuals.** (i) A field whose declared type names an alias-form schema
(`schema Alias = number` — body-level, already refused as
`unsupported-feature`, bug 0033) emits the new code beside the refusal on a
mistyped value, exactly parallel to the matched `let`'s pre-existing
`let-rhs-type-mismatch` pair on the same fixture — within §Fix's
"identical to the typed-`let` position's" bound, on documents already
refused at error severity; noted, not filed. (ii) `collectTypeEnv`'s `env`
itself is a plain `{}` keyed by schema names — the same prototype-hazard
class one level up, pre-existing at baseline, shielded at the schema-name
position by `theta/parse/schema-case-mismatch` (every `Object.prototype`
member name is lowercase); candidate for a separate filing, not filed here.
Filed as [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
and discharged by its fix (0.48.0): the env is null-prototyped and its eight
reads own-key-guarded through one exported `resolveNamed`. That fix also
measured the recorded shield weaker than stated — `schema-case-mismatch` is a
lexer diagnostic whose `E` severity denies registration rather than a grammar
refusal, and it never covered the read side, where both of 0038's symptoms lived.
(iii) [0080](./0080-keys-values-construction-order-not-declaration-order.md)
records, in its fix (0.70.0), that its own §Related mis-stated where this check
lives: it is in the parse / type layer (`collectSchemaFields` /
`checkObjectFieldCompat`) over a null-prototyped `Record<string, CompatType>`
that discards field order, not at the runtime constructor evaluation sites, so
it could supply no declaration order for that report to reuse. Those sites
resolve `env.resolveSchema` independently. This check is untouched by that fix.
(iv) [0084](./0084-increment-decrement-check-dead.md) reused this fix's GOV-15
disposition in 0.71.0 — the diagnostic-registry carve-out
(`source-language-stability.md` §*Diagnostic-registry carve-out*) applied as an
addition, whose covered effect is exactly that previously clean-loading inputs
gain an emission. There the edit is narrower than here: no registry row was
added, so the carve-out was engaged by the *trigger* arm, which the same clause
dispositions "as an addition for inputs newly brought into the code's emission
set". This fix's own registry addition is untouched.

## Summary

`Schema { field: expr, … }` gets two static checks, both over field *names*: no
undeclared field (`theta/parse/extra-object-field`), no omitted declared field
(`theta/parse/missing-object-field`). Nothing compares a field *value* to the
type the schema declares for that field.

`Point { x: "not a number", y: true }` against `schema Point { x: number, y:
number }` loads with zero diagnostics and evaluates to a `Point`-branded object
whose payload does not validate against `Point`'s lowering. The same walk
reports `let x: number = "not a number"` as
`theta/parse/let-rhs-type-mismatch`: its `let` arm
(`type-layer-checks.ts:336–368`) calls the compatibility engine, its `object`
arm (`:754–758`) does not.

The array case is a normative violation on its own. `grammar.md:216–221`
declares the `array<T>` literal sink set exhaustive and names the surrounding
constructor field as a member of it. `Bag { xs: ["a", "b"] }` against `schema
Bag { xs: array<number> }` reaches `TypeLayerWalk.checkArrayLiteral` with
`sink: undefined` (`type-layer-checks.ts:712`, from the `object` arm at `:756`),
so the sink-less common-type pass accepts `array<string>` and the registered
`theta/parse/array-element-type-mismatch` never fires. The same literal under
`let xs: array<number> = ["a", "b"]` reports it.

The root data gap is that the declared field types never reach either checker.
The parser retains them as `SchemaFieldSource.typeSource`
(`theta-document.ts:515–525`), and both downstream copies discard them:
`ObjectSchemaSpec.fields` is `readonly string[]`
(`literal-sublanguage.ts:528–531`), and `collectTypeEnv`
(`type-layer-checks.ts:231–239`) records only `{ kind: "object-schema" }` per
schema name.

The limit case smuggles a `Result`. `Holder { r: Ok(1) }` against `schema
Holder { r: Inner }` loads clean and brands `Holder`, although declaring the
field as `Result` is itself rejected (`theta/parse/result-in-schema-position` —
"`Result` is observed only by theta code and is never lowered"). This is the
member route that surfaced the family during the bug-0019 review.

## Reproduction

Offline, deterministic, at `4d645f4f`. Harness: the production prompt-mode
binding used by `tests/result-value-privacy.test.ts` §"Shared harness" (:108;
also `tests/question-operand-defect.test.ts`) — `parseThetaDocument` →
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`.
"static" = the full parse diagnostic list; "runtime" = `BodyExecution`
observables (`execution.result.value`) plus the `schemaTagOf` / `isResultValue`
brand reads (`src/runtime/value.ts:207`/`:239`). All fixtures are `mode: prompt`
with the construct `let`-bound and returned as the tail expression.

Declared-name, wrong-typed-value fixtures:

| # | fixture | static | runtime |
|---|---|---|---|
| w1 | `schema Point { x: number, y: number }` + `let p = Point { x: "not a number", y: true }` | none — loads | `success`; `{"x":"not a number","y":true}`; `schemaTagOf(p)` = `"Point"` |
| w2 | `schema Inner { a: number }`, `schema Holder { r: Inner }` + `let h = Holder { r: Ok(1) }` | none — loads | `success`; `{"r":{"ok":true,"value":1}}`; `schemaTagOf(h)` = `"Holder"`; `isResultValue(h.r)` = `true` |
| w3 | `schema Inner { a: number }`, `schema Other { a: number }`, `schema Holder { r: Inner }` + `let h = Holder { r: Other { a: 1 } }` | none — loads | `success`; `{"r":{"a":1}}`; `schemaTagOf(h)` = `"Holder"`; `schemaTagOf(h.r)` = `"Other"` |
| w4 | `schema Bag { xs: array<number> }` + `let b = Bag { xs: ["a", "b"] }` | none — loads | `success`; `{"xs":["a","b"]}`; `schemaTagOf(b)` = `"Bag"` |
| w5 | `schema N { i: integer }` + `let n = N { i: 1.5 }` | none — loads | (not driven) |

Matched `let` controls — same value, same declared type, one position over:

| # | fixture | static |
|---|---|---|
| c1 | `let x: number = "not a number"` | `theta/parse/let-rhs-type-mismatch`: `let binding 'x' initialiser type mismatch: expected number, got string` |
| c2 | `schema Inner { a: number }`, `schema Other { a: number }` + `let r: Inner = Other { a: 1 }` | `theta/parse/let-rhs-type-mismatch`: `let binding 'r' initialiser type mismatch: expected Inner, got Other` |
| c3 | `let xs: array<number> = ["a", "b"]` | `theta/parse/let-rhs-type-mismatch`: `let binding 'xs' initialiser type mismatch: expected array<number>, got array<string>` **and** `theta/parse/array-element-type-mismatch`: `array element type mismatch at index 0: expected number, got string` |
| c4 | `let i: integer = 1.5` | `theta/parse/integer-narrowing`: `cannot narrow number to integer` |

c1/c2/c3/c4 pair against w1/w3/w4/w5. The checker, the engine and the block are
the same; the only variable is whether the sink is a `let` annotation or a
declared schema field.

Controls that fire at the constructor (the presence gates are not dead):

| # | fixture | static |
|---|---|---|
| c5 | `schema Point { x: number }` + `let p = Point { x: 1, z: 3 }` | `theta/parse/extra-object-field`: `extra field 'z' on schema 'Point'` |
| c6 | `schema Point { x: number, y: number }` + `let p = Point { x: 1 }` | `theta/parse/missing-object-field`: `missing field 'y' on schema 'Point'` |
| c7 | `schema Holder { r: Result<number, string> }` | `theta/parse/result-in-schema-position`: `'Result' has no lowered-schema form and is not permitted in a schema-feeding position` |

c7 against w2: declaring a `Result`-typed field is rejected, and the
field-value gap constructs the forbidden state anyway.

Residue probes — silent at the constructor field **and** at the matched `let`,
so they stay silent after the fix (§Fix bounds this):

| # | constructor fixture | matched `let` | both |
|---|---|---|---|
| r1 | w2 (`Holder { r: Ok(1) }`) | `let r: Inner = Ok(1)`, `let n: number = Ok(1)` | none — a `result-ctor` types as `named "Ok"` (`static-type-inference.ts:259–260`), unresolvable in the `TypeEnv` |
| r2 | `schema S { n: number }`, `fn f(): string { "s" }` + `S { n: f() }` | `let n: number = f()` | none — a call types as `named "f"` |
| r3 | `schema S { n: number }`, `schema P { x: string }`, `let p = P { x: "s" }` + `S { n: p.x }` | `let n: number = p.x` | none — a member read is unresolvable |
| r4 | `enum Color { Red, Green }`, `schema Box { c: Color }` + `Box { c: 3 }` | `let c: Color = 3` | none — `collectTypeEnv` records no `enum` names |
| r5 | `schema S { k: "a" \| "b" }` + `S { k: "zzz" }` | `let k: "a" \| "b" = "zzz"` | none — `annotationToCompatType` maps a literal type to an unresolvable `named` |

r1 is the correction to the split-out's inherited claim: fixture w2 is **not**
closed by threading declared field types. `let r: Inner = Ok(1)` and `let n:
number = Ok(1)` both report nothing at HEAD, so the compatibility engine skips
a `Result` constructor value at every sink, not only at the constructor field.

## Expected behaviour (what the spec does and does not promise)

**What the spec says.**

*The array-literal sink is normative and its sink set is closed.*
[grammar.md §`array<T>` literal type-sink rule](../spec_topics/grammar.md#arrayt-literal-type-sink-rule)
(`:216`):

> `[]` and `[expr, ...]` literals require a *type sink* in surrounding context
> to determine the element type when the elements alone are insufficient […]
> The sink set is exhaustive:

and lists at `:220`:

> - The declared type of a surrounding constructor field (`Schema { items: [...] }`).

[glossary.md:67](../spec_topics/glossary.md) repeats "a surrounding constructor
field" in its *type sink* definition, and
[expressions.md:222](../spec_topics/expressions.md#object-construction-array-construction-and-operator-rules)
supplies the code: "If a type sink is in scope […] every element must satisfy
`T_element ⊑ T_sinkElement`; a mismatch is
`theta/parse/array-element-type-mismatch` naming the offending element." w4 is
an implementation defect against those three, with the code already registered
(`code-registry-parse.md:40`).

*The soundness premise the other elements break.*
[type-system.md — Operational definition](../spec_topics/type-system.md#type-compatibility)
(`:29`): "Whenever `T₁ ⊑ T₂` holds, every value statically typed as `T₁`
AJV-validates against the lowering of `T₂`", and the parser "is required to
recognise the structural cases enumerated below without falling back to
[AJV], so that compatibility failures surface as parse errors at the offending
source span rather than as runtime validation errors at a downstream call
site". A constructor is the type-introduction site — the one place the static
type `Point` is minted for a value. Minting it without examining the field
values produces values that are statically `Point` everywhere downstream
(TYPE-10 nominal identity, `:52`) and do not validate against `Point`'s
lowering.

w3 is the sharpest instance because both sides resolve: TYPE-10 (`:52`) makes
`Other ⋢ Inner` regardless of field shape, the engine decides it at the `let`
sink (control c2), and the constructor field never asks.

[type-system.md §Unresolvable operands](../spec_topics/type-system.md#type-compatibility)
(`:48`) licenses skipping a static check only where "the runtime AJV check is
the safety net" — true at effect boundaries (outbound tool / invoke / query
validation, [tool-calls.md](../spec_topics/tool-calls.md)), false for a value
used purely in-body (member reads, `==`, interpolation render), which never
crosses one. w1's operands are a string literal and a declared `number` field:
neither is past the parser's static view.

*The adjacent position already gets this check.* The other object-literal form
— the single positional argument of a Pi-tool call — carries a parse-time
field-value static-type check today:
[tool-calls.md:16](../spec_topics/tool-calls.md) specifies
`theta/parse/tool-arg-schema-conflict` when "a field-value expression's static
type is **provably disjoint** from the tool's registered input-schema type for
that field", registered at `code-registry-parse.md:51` and emitted at
`src/runtime/tool-call.ts:283`. The schema-constructor position, whose declared
shape is in the same file, has no counterpart.

**What the spec does not say — stated honestly.**
No registry code covers a constructor field-value type mismatch, and
`type-system.md:27`'s enumeration of the positions governed by `⊑` — "the RHS
of a typed `let`, a function-argument slot, an `invoke<T>` return annotation,
the common type of `match` arms or ternary branches, an `array<T>` element
against its sink, the `+` operator's mixed-numeric case, a frontmatter
`params:` default" — does not list the constructor-field position. That
enumeration describes itself as normative ("the answer is governed by the
single relation"), so a check site absent from it is unciteable. The nearest
neighbour is
[expressions.md §Array construction](../spec_topics/expressions.md#object-construction-array-construction-and-operator-rules)
(`:218`), naming the surrounding constructor field as an element-type
*inference* context — which `grammar.md:220` then promotes to an exhaustive
sink-set member, but only for `array<T>` literals. Elements outside w4 are
therefore an unenforced invariant plus a registry gap, not a divergence from an
explicitly promised diagnostic. Closing them requires a
[DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) registry
amendment (spec change and implementation in lock-step) plus the `:27`
enumeration entry, admissible within a 1.x minor under the [GOV-15
diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
(`source-language-stability.md:25`) — a code addition whose covered effect is
exactly that previously clean-loading inputs (w1, w3, w5 above) gain the
emission.

## Actual behaviour / root cause

1. **The type-phase `object` arm passes nothing down.**
   `TypeLayerWalk.walkExpr` (`type-layer-checks.ts:754–758`) is the entire
   type-phase treatment of a constructor:

   ```ts
   case "object":
     for (const field of e.fields) {
       this.walkExpr(field.value, bindings, flow);
     }
     return;
   ```

   No declared-field lookup, no `checkCompatible` call, no sink argument. Every
   field value is walked as if it stood in unannotated position. The typed-`let`
   arm of the same walk (`:336–368`) does both halves for the same values:
   `checkLetRhsCompat` at `:347` and, for an array initialiser, the element sink
   at `:358–360`.

2. **The array literal therefore hits the sink-less arm.** `:756` recurses into
   the field value with the default `skipArray = null`, so an array field value
   lands at `:710–717` and calls `checkArrayLiteral(e, undefined, bindings)`.
   With `sink === undefined`, `checkCommonType` (`type-compat.ts:465–497`) takes
   its no-sink branch, `["a", "b"]` has the common type `array<string>`, and
   nothing rejects it. The typed-`let` arm avoids this by pre-checking the array
   against `annotation.element` and marking the node skipped
   (`sinkedArrayOf`, `:651–666`).

3. **The declared field types are dropped twice, and the schema name resolves
   to a fieldless declaration.** The parser retains `typeSource` per field
   (`theta-document.ts:515–525`). The structural walk copies out names only
   (`:4752`, into the `ReadonlyMap<string, readonly string[]>` at `:4711`,
   consumed through `ObjectSchemaSpec` at `literal-sublanguage.ts:528–531`).
   The type walk copies out nothing: `collectTypeEnv`
   (`type-layer-checks.ts:231–239`) records `env[stmt.name] = { kind:
   "object-schema" }`, and `NamedDecl`'s `object-schema` arm
   (`type-compat.ts:75–77`) has no field slot to hold them. So even a checker
   wired at `:754` could not resolve `Point` to `{ x: number, y: number }`
   today.

4. **Runtime brands on the name alone.** Both hosts
   (`statement-executor.ts:669–672`,
   `production-theta-producer.ts:5647–5650`) brand iff
   `env.resolveSchema(typeName)` succeeds and inspect no field value. The brand
   is then authoritative on the QRY-18 outbound render (`:5548`, over the
   declared-type hint), so the malformed value is rendered under the declaring
   schema's wire names (`:5552–5557`). The AJV net fires only if the value
   reaches an effect boundary, where the error names the boundary, not the
   construction site.

## Why it matters

- **Branded-but-malformed values falsify the compatibility engine's premise.**
  Every downstream consumer of `⊑` assumes a `Point`-typed value validates as
  `Point`. w1- and w3-class values break that with no diagnostic; the failure,
  if it surfaces at all, is a runtime AJV `Err` at a distant effect boundary —
  the parse-first posture of `type-system.md:29` inverted.
- **An exhaustive normative sink list has an unimplemented member.**
  `grammar.md:216–221` states the `array<T>` sink set is closed and names the
  constructor field in it. A theta author who reads that list and relies on it
  gets no element check (w4), while the neighbouring listed sink (binding
  annotation) delivers one (c3).
- **The `Result`-smuggle route stays open.** w2 constructs the state
  `theta/parse/result-in-schema-position` exists to make unrepresentable.
  Bug 0019's runtime brand guard made the `?` unwrap of such a field loud since
  0.31.0; every other consumer (interpolation render, `==`, member reads, wire
  lowering) still handles a schema-branded object carrying a `Result` in a
  position the type grammar forbids.
- **The same mistake is caught one position over.** c1–c4 fire on the identical
  value/type pairs at a typed `let`; the Pi-tool argument position has its own
  field-value check (`tool-calls.md:16`). The schema-constructor position, where
  the declared shape is in the same file and already parsed, reports nothing.

## Fix

Check each constructor field value against its declared field type in the type
phase, using the engine the typed-`let` arm already uses.

**Carry the declared field types into the `TypeEnv`.** Widen `NamedDecl`'s
`object-schema` arm (`type-compat.ts:75–77`) to hold the declared fields, and
populate it in `collectTypeEnv` (`type-layer-checks.ts:231–239`) from
`SchemaDecl.fields` (`theta-document.ts:536`), mapping each
`SchemaFieldSource.typeSource` through the existing `annotationToCompatType`
(`type-layer-checks.ts:249–271`) — the same function that converts a `let`
annotation. `checkCompatible`'s TYPE-10 arm (`type-compat.ts:222–233`) reads
only `env[name] !== undefined`, so adding a field list to the declaration
changes no existing relation.

**Check at `walkExpr`'s `object` arm** (`type-layer-checks.ts:754–758`). For a
constructor whose name resolves to an object schema in `this.env`, per field
present in both the literal and the declaration:

- Compare `this.typeOf(field.value, bindings)` against the declared field type
  with `checkCompatible`, and route the outcome the way `checkLetRhsCompat`
  (`type-compat.ts:372–411`) does: `"incompatible"` emits the new code,
  `"integer-narrowing"` emits the registered
  `theta/parse/integer-narrowing` (`code-registry-parse.md:24`, closing w5),
  `"compatible"` and `"unknown"` emit nothing.
- When the field value is an array literal and the declared field type is
  `array<T>`, call `checkArrayLiteral(value, declared.element, bindings)` and
  add the node to the walk's skip set, mirroring `:358–360` and `sinkedArrayOf`
  (`:651–666`). This closes w4 through the already-registered
  `theta/parse/array-element-type-mismatch` (`code-registry-parse.md:40`) — no
  new code for the array case.
- Reject a `result-ctor` field value outright. Every declared field type is
  lowerable, because `theta/parse/result-in-schema-position`
  (`code-registry-parse.md:59`) makes a `Result`-typed field undeclarable
  (control c7), so a `Result` value is incompatible with whatever the field
  declares, and the field position emits the new code. This is decidable
  without a `Result` arm in `CompatType` (`type-compat.ts:55–64`), and it is
  the only way w2 closes: `checkCompatible` alone returns `"unknown"` for a
  `result-ctor` operand at every sink, including a typed `let` (probe r1).

Fields absent from the declaration, and declared fields absent from the
literal, keep reporting through the existing presence checks in
`checkObjectExpr` (`theta-document.ts:5061–5080`); the type check runs over the
intersection so a mistyped extra field does not produce two diagnostics.

**Coverage is partial by construction, and identical to the typed-`let`
position's.** `checkCompatible` returns `"unknown"` whenever either operand is a
`named` type absent from the `TypeEnv` (`type-compat.ts:222–237`), which covers
call results, member reads, `enum`-declared field types (`collectTypeEnv`
records no `enum` names), and literal-type field annotations. Probes r2–r5
measure each of those silent at the constructor field *and* at the matched
`let`. The check therefore moves diagnosis to load for the resolvable cases —
literals, array literals, constructor values, annotated bindings — and leaves
the rest to the AJV boundary: the same split `theta/parse/let-rhs-type-mismatch`
lives with, whose registry row already carries the qualifier "where the RHS type
is statically resolvable" (`code-registry-parse.md:53`).

**Registry (DIAG-2).** One new row in
[code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md):

| Code | Sev | Phase | Trigger | Spec rule | Hint | Message |
|---|---|---|---|---|---|---|
| `theta/parse/object-field-type-mismatch` | E | type | A schema-constructor field value has a static type that is not compatible with the schema's declared type for that field under `[Type System — Type compatibility](../type-system.md#type-compatibility)`, where the field value's type is statically resolvable. | `[Type System — Type compatibility](../type-system.md#type-compatibility)` | — | `field '<field>' on schema '<schema>' type mismatch: expected <expected>, got <actual>` |

The *Spec rule* and *Trigger* links are written relative to the registry page,
as the row will read there. The Trigger's resolvability qualifier copies row
`:53`'s, which is where the partial coverage is already recorded for the `let`
position. Severity is `E`,
following the bug-0014 `empty-query-annotation` precedent. This row is disjoint
from the `theta/parse/unresolved-named-type` widening that
[0025](./0025-ctor-unresolved-schema-name-passthrough.md) and
[0028](./0028-unresolved-annotation-silent-permissive-lowering.md) coordinate
on, so no amendment is shared and no ordering constraint follows.

**Normative check-site enumeration.** Add the constructor-field position to
`type-system.md:27`'s list of positions governed by `⊑`, phrased in the same
register as its neighbours (e.g. "a schema-constructor field value against its
declared field type"). Without the entry the new check emits from a site the
normative enumeration does not admit. The partial coverage sits in the registry
row's Trigger cell alongside the existing `let`-RHS precedent, not in `:27` —
`:27` enumerates positions, and `:31`/`:48` already govern what the parser may
defer.

**No runtime change.** The brand sites
(`statement-executor.ts:669–672`, `production-theta-producer.ts:5647–5650`)
stay as they are. A brand-time field validation would catch these values later,
in two hosts, for a site that is fully static.

**Test witness — unit, offline, no live provider.** The whole fix is witnessable
at the `parseThetaDocument` boundary: `diagnostics` for w1–w5, controls c1–c7,
and residue probes r1–r5, plus the prompt-mode harness with `schemaTagOf` /
`isResultValue` for the runtime observables. Nothing on this path crosses a
provider, so no live test applies. Constructor diagnostics live in
`tests/e2e-s1-expr-diagnostics.test.ts` and `tests/fix1-parser-structural.test.ts`
(additive); the compatibility engine's own tests are
`tests/type-compat.test.ts`. No existing test pins the buggy behaviour — no test
in `tests/` constructs a schema with a wrong-typed field value. The residue
probes r2–r5 must be pinned as negative tests so a later widening of
`collectTypeEnv` (to `enum` names, say) is a deliberate change and not a
silent one.

## Non-goals

- Constructor **name** resolution: a name that resolves to no declaration or to
  a non-constructible one (`Mystery { … }`, `Color { r: 1 }`) is
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md). Its inputs never
  reach this check, which runs only when the name resolves to a declared object
  schema.
- Recording `enum` declarations in the `TypeEnv` (`collectTypeEnv`,
  `type-layer-checks.ts:233–237`, matches `stmt.kind === "schema"` only). It
  would close probe r4 and also change the typed-`let` position (`let c: Color
  = 3` reports nothing at HEAD), so it is a coverage change at two positions,
  not one. Not filed.
- The `params:` default and Pi-tool argument positions. Both are bare-object
  carve-outs with their own gates (`expressions.md:211–212`), and the Pi-tool
  one already has a field-value check (`tool-calls.md:16`).
- Body-level type-alias and discriminated-union declarations: `schema Animal =
  Cat | Dog` in a theta body yields `theta/parse/unsupported-feature`, and
  `skipDeclarationShape` (`theta-document.ts:2268–2282`) has no caller —
  [0033](./0033-body-level-schema-alias-unsupported.md). Alias-typed fields are
  therefore unreachable from a `.theta` body and unprobed here.
- A schema constructor whose declared field is literally named
  `__thetaSchema`, whose value the brand destroys —
  [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md). Shares both
  evaluation sites, different root cause; a `string`-typed `__thetaSchema` field
  holding a string is type-correct under this report.
- Bug 0019's `?` unwrap over smuggled `Result` fields — guarded since 0.31.0
  ([0019](./0019-question-operand-bypasses-result-normalisation.md)).
- Render privacy of a smuggled `Result`'s internals under interpolation —
  `result-value-privacy` territory, separate audit if pursued.
- The empty-array "surrounding constructor field" inference context
  (`expressions.md:218`) as a general inference feature for `[]` with no
  elements. This fix threads the declared field type as a sink for the
  *element-mismatch* check; supplying an element type to an empty literal is
  adjacent and not filed.

## Provenance

- **Origin:** bug 0019 §Fix (0.31.0) residual paragraph
  ([0019](./0019-question-operand-bypasses-result-normalisation.md):173–180,
  "Adjacent pre-existing issue identified during review, out of scope, not
  filed here: schema-constructor field values are presence-checked only"), fix
  commit `655e4d39`; surfaced while probing the member-route control. Filed
  first as the second defect of
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md) and split out here;
  0025's fixture labels `w1`, `w2`, `w4` carry over unchanged, and `w3` / `w5`
  are new.
- **Evidence:** scratch vitest (deleted after probing) over the production
  prompt-mode binding harness pattern of `tests/result-value-privacy.test.ts`
  §"Shared harness" (:108); fixtures w1–w5, controls c1–c7 and residue probes
  r1–r5 measured at `4d645f4f`, all offline; outputs quoted verbatim in
  §Reproduction.
- **Implementation:** `src/parser/type-layer-checks.ts` (:231–239, :249–271,
  :336–368, :636–649, :651–666, :710–717, :754–758),
  `src/parser/type-compat.ts` (:55–64, :75–80, :113, :222–237, :372–411,
  :465–497), `src/parser/theta-document.ts` (:515–525, :528–537, :4711,
  :4746–4753, :5038, :5061–5080), `src/parser/literal-sublanguage.ts`
  (:528–531, :543–562), `src/parser/static-type-inference.ts` (:257–260),
  `src/runtime/statement-executor.ts` (:657–673),
  `src/runtime/lexical-environment.ts` (:517), `src/runtime/value.ts` (:207,
  :239), `src/runtime/tool-call.ts` (:283, the Pi-tool-argument precedent),
  `src/extension/production-theta-producer.ts` (:5526–5566, :5636–5651), all at
  `4d645f4f`.
- **Spec measured against:**
  [grammar.md §`array<T>` literal type-sink rule](../spec_topics/grammar.md#arrayt-literal-type-sink-rule)
  (`:214–223`, the constructor-field sink bullet at `:220`);
  [glossary.md:67](../spec_topics/glossary.md) (*type sink*);
  [expressions.md §Object construction](../spec_topics/expressions.md#object-construction)
  (`:209`, carve-outs `:211–212`), §Array construction (`:218`, sink-mismatch
  rule `:222`);
  [type-system.md §Type compatibility](../spec_topics/type-system.md#type-compatibility)
  (check-site enumeration `:27`, Operational definition `:29`, closed
  structural list `:31`, Unresolvable operands `:48`, TYPE-9 `:50`, TYPE-10
  `:52`);
  [tool-calls.md:16](../spec_topics/tool-calls.md) (provable-disjointness
  field-value check);
  [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md)
  rows `:24` (`integer-narrowing`), `:40` (`array-element-type-mismatch`),
  `:44`–`:45` (`extra-object-field`, `missing-object-field`), `:51`
  (`tool-arg-schema-conflict`), `:53` (`let-rhs-type-mismatch`), `:59`
  (`result-in-schema-position`);
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)
  (`diagnostic-shape.md:72`);
  [GOV-15 diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`source-language-stability.md:25`).
- **Related bugs:**
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md) — the sibling gate
  in the same constructor position (unresolvable / non-constructible
  constructor name); disjoint code, disjoint registry row, no ordering
  constraint.
  [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) — shares
  both constructor evaluation sites (`statement-executor.ts:657–673`,
  `production-theta-producer.ts:5636–5651`), different root cause.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — the
  registry row 0025 coordinates with; named here to record that this report
  does not contend for it.
  [0033](./0033-body-level-schema-alias-unsupported.md) — keeps alias-typed
  schema fields unreachable from a `.theta` body.

## Discharge note — bug 0102 (0.75.0)

Appended by the bug 0102 fix; nothing above is altered. Precedent citation only
— this report gains no obligation and loses none.

[0102](./0102-params-default-string-literal-raw-newline-admitted.md) reused this
report's **GOV-15 diagnostic-registry carve-out** disposition
(`source-language-stability.md:25`) for a DIAG-2 *trigger* change, in the
narrower shape bug 0084 also took: `theta/parse/literal-newline-in-string`'s
*Trigger* was widened to name the `params:` default RHS as a second emission
site and its *Phase* cell became `lex, parse`, bringing a set of previously
clean-loading inputs into the code's emission set. In scope as an *addition*,
with no code added or removed — so `tests/code-registry.test.ts`'s closed-set
reconciliation gained no new asserting-test obligation and stays byte-unchanged.
The *Message* cell is unchanged (DIAG-4). The committed-corpus sweep was re-run
and re-verified behaviourally against the fixed parser: 34 `.theta` /
`.thetalib` files, 17 declaring `params:`, 19 fields, one default, **zero** in
the refused set.