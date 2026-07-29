# Bug 0025 — Schema-constructor static checking is presence-only: field values are never checked against the declared field types, and a constructor naming an undeclared schema (`Mystery { r: Ok(1) }`) loads clean and evaluates as an unbranded plain object

- **Status:** open
- **Kind:** defect — two static-gate gaps in the single object-constructor
  checker (`checkObjectExpr`), reported together per the bug-0002 / bug-0023
  two-defect precedent because they share one root cause: the checker
  consults constructor *names* against declared field-*name* sets and nothing
  else. (1) **Undeclared-constructor passthrough** — a constructor whose name
  resolves to no declaration (`Mystery { … }`) takes the checker's defer arm,
  raises no diagnostic anywhere, and evaluates to an unbranded plain object:
  the [bare-object-literal ban](../spec_topics/expressions.md#object-construction)
  (whose stated purpose is "every constructed object must name its schema, so
  the type is unambiguous from the syntax alone") is evaded by naming a
  schema that does not exist, and what evaluates is exactly the bare object
  literal the ban forbids. Spec standing: the second bug category of
  [docs/bugs/README.md](./README.md) — spec and implementation together fail
  to deliver documented behaviour (the input slips between the two documented
  regimes: neither the bare-literal rejection nor the constructor field
  checks apply, and no third disposition is defined). (2) **Absent
  field-value typing** — `theta/parse/missing-object-field` /
  `theta/parse/extra-object-field` compare field-name sets only; a declared
  schema constructor with every field present but wrong-typed
  (`Point { x: "not a number", y: true }`, `x`/`y` declared `number`) loads
  clean and mints a `Point`-branded value that falsifies the type system's
  stated soundness premise ([type-system.md — Operational
  definition](../spec_topics/type-system.md#type-compatibility): a value of
  static type `T` AJV-validates against `T`'s lowering). Spec standing is
  weaker and stated honestly below: no registry code exists for a
  constructor field-value mismatch, and the §Type-compatibility check-site
  enumeration does not list the constructor-field position — the defect is
  the unenforced invariant, not a missing promised check.
- **Affected** (citations verified at HEAD `b542dafe`, 0.32.0):
  - `checkObjectExpr` (`src/parser/theta-document.ts:5038`) — the only
    constructor gate. Bare-literal arm :5045–5052; **defer arm :5054–5060**
    (constructor name not in the declared-object-schema map → silent return,
    comment: "the field-set check needs the declared shape, so defer — do
    not guess"); extra-field presence loop :5061–5073; missing-field call
    :5074–5080.
  - `checkObjectLiteralFields` (`src/parser/literal-sublanguage.ts:543`) and
    its `ObjectSchemaSpec` input (:528–531) — `fields: readonly string[]`,
    names only. The `StructuralRefs.schemas` map feeding both checks
    (`src/parser/theta-document.ts:4711`) is built by
    `s.fields.map((f) => f.name)` (:4752): declared field **types are
    dropped at collection**.
  - The identifier-resolution walk (`src/parser/theta-document.ts:3981–3991`)
    — excludes constructor names by design ("schema-constructor names …
    are not identifier-resolution sites here"), so
    `theta/parse/unknown-identifier` never fires for them.
  - `src/parser/static-type-inference.ts:257–258` — a constructor expression
    types as `{ kind: "named", name: node.typeName }` whether or not the
    name is declared; `src/parser/type-compat.ts:222–237` — an unresolvable
    `named` operand yields `"unknown"`, so every downstream sink check
    (typed `let`, fn-arg, invoke-arg) skips. An undeclared constructor is
    thereby compatible-by-silence with **every** annotation, including
    primitives (matrix rows u2/u5).
  - Runtime, both evaluation hosts: the async executor's object arm
    (`src/runtime/statement-executor.ts:657–673`, brand-or-plain choice
    :669–672) and the pure host
    (`src/extension/production-theta-producer.ts:5636–5651`, :5647–5650) —
    `env.resolveSchema(typeName)` (`src/runtime/lexical-environment.ts:517`)
    misses → the plain field object is returned **unbranded**, the
    constructor name silently discarded.
  - QRY-18 outbound render (`translateInterpolationOutbound`,
    `src/extension/production-theta-producer.ts:5526`, fallback :5544–5551)
    — an unbranded value with no resolvable hint "recurses with its keys
    unchanged": the value renders as a plain JSON object.
- **Observed at:** `0.32.0` (`b542dafe`). Fully offline and deterministic —
  no live model, no provider.

## Summary

`checkObjectExpr` is the whole static story for `Schema { field: expr, … }`
constructors, and it checks exactly two things, both presence-only: no
undeclared field name, no omitted declared field name. Two input families
escape it entirely.

A constructor naming an **undeclared schema** takes the defer arm: no parse
diagnostic, no load diagnostic, no runtime disposition. `Mystery { r: Ok(1) }`
loads with zero diagnostics and evaluates — through the same executor arm a
declared constructor uses — to a plain object that fails the
`resolveSchema` test and is therefore never schema-branded. The result is
observably a bare object literal: unbranded (`schemaTagOf` `undefined`),
rendered with keys unchanged, its `Mystery` name discarded. Because the
inferred static type is the nominal placeholder `named "Mystery"` and the
compatibility engine maps an unresolvable name to `"unknown"`, the value also
sails through every annotated sink — `let p: Point = Mystery { … }` and even
`let n: number = Mystery { a: 1 }` load clean. A constructor naming a
declared **enum** (`Color { r: 1 }`) rides the same defer arm to the same
unbranded object.

A **declared** schema constructor with wrong-typed field *values* is equally
silent: `Point { x: "not a number", y: true }` (both fields declared
`number`) loads clean and mints a `Point`-branded value whose payload does
not AJV-validate against `Point`'s lowering. The sharpest instance smuggles a
`Result`: `Holder { r: Ok(1) }` (field declared `r: Inner`) loads clean and
brands, although the type grammar forbids even *declaring* a `Result`-typed
schema field (`theta/parse/result-in-schema-position` — "`Result` is observed
only by theta code and is never lowered"). This is the member route that
surfaced the family during the bug-0019 review: a schema-branded object
carrying a field value the type system says cannot exist there.

## Reproduction

Offline, deterministic, at `b542dafe`. Harness: the production prompt-mode
binding used by `tests/result-value-privacy.test.ts` §"Shared harness" (also
`tests/question-operand-defect.test.ts`) — `parseThetaDocument` →
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`.
"static" = the full parse diagnostic list; "runtime" = `BodyExecution`
observables plus the `schemaTagOf` / `isResultValue` brand reads
(`src/runtime/value.ts`). All fixtures are `mode: prompt` with the construct
`let`-bound and returned as the tail expression.

Undeclared-name family (defect 1):

| # | fixture | static | runtime |
|---|---|---|---|
| u1 | `let m = Mystery { r: Ok(1) }` | none — loads | outcome `success`; value JSON `{"r":{"ok":true,"value":1}}`; `schemaTagOf(m)` = `undefined` (unbranded); `isResultValue(m.r)` = `true` |
| u2 | `schema Point { x: number, y: number }` + `let p: Point = Mystery { x: 1, y: 2 }` | none — loads | (not driven) |
| u5 | `let n: number = Mystery { a: 1 }` | none — loads | (not driven) |
| u3 | `enum Color { Red }` + `let c = Color { r: 1 }` | none — loads | outcome `success`; `schemaTagOf` = `undefined` |

Declared-name, wrong-typed-value family (defect 2):

| # | fixture | static | runtime |
|---|---|---|---|
| w1 | `schema Point { x: number, y: number }` + `let p = Point { x: "not a number", y: true }` | none — loads | outcome `success`; value JSON `{"x":"not a number","y":true}`; `schemaTagOf(p)` = `"Point"` |
| w2 | `schema Inner { a: number }`, `schema Holder { r: Inner }` + `let h = Holder { r: Ok(1) }` | none — loads | outcome `success`; `schemaTagOf(h)` = `"Holder"`; `isResultValue(h.r)` = `true` |
| w4 | `schema Bag { xs: array<number> }` + `let b = Bag { xs: ["a", "b"] }` | none — loads | (not driven) |

Controls (the gates that do exist fire; the gap is not a dead checker):

| # | fixture | static |
|---|---|---|
| c1 | `Point { x: 1, z: 3 }` (declared `x` only) | `theta/parse/extra-object-field`: `extra field 'z' on schema 'Point'` |
| c2 | `Point { x: 1 }` (`y` omitted) | `theta/parse/missing-object-field`: `missing field 'y' on schema 'Point'` |
| c3 | `let p = { x: 1 }` | `theta/parse/bare-object-literal`: `bare object literal not permitted in this position; name the schema (Schema { ... })` |

c3 against u1 is the point: writing any capitalised name before the brace
silences the rejection while supplying nothing the rejection exists to
obtain. w4 additionally pins that the declared field type is never threaded
as a sink into the array-literal element check: `["a", "b"]` against a
declared `array<number>` field is silent (the sink-less common-type pass
accepts `array<string>`), where the same literal under
`let xs: array<number> = ["a", "b"]` reports element mismatches.

## Expected behaviour (what the spec does and does not promise)

**What the spec says.**
[expressions.md §Object construction](../spec_topics/expressions.md#object-construction)
(`docs/spec_topics/expressions.md:209`):

> Schema-typed values are constructed with `Schema { field: expr, ... }`.
> Every declared field of the schema must be present (omissions are
> `theta/parse/missing-object-field`); extra fields are
> `theta/parse/extra-object-field`; field order is irrelevant. Bare object
> literals (`{ field: expr }` with no leading schema name) surface as
> `theta/parse/bare-object-literal` — every constructed object must name its
> schema, so the type is unambiguous from the syntax alone.

The paragraph defines two regimes over constructed objects: named
constructors get the field-set checks; nameless literals are rejected (two
carve-outs aside). Both regimes presuppose the name resolves to a declared
schema — the stated rationale ("the type is unambiguous from the syntax
alone") is deliverable only then. For an undeclared name the implementation
delivers neither regime and the spec defines no third: the field-set checks
cannot run (no declared shape), the bare-literal rejection is bypassed (a
name is syntactically present), and what evaluates is the very value the ban
exists to prevent — an object of no schema. Per
[docs/bugs/README.md](./README.md), spec and implementation together failing
to deliver documented behaviour is a defect.

For field values, the type system's
[Operational definition](../spec_topics/type-system.md#type-compatibility)
(`docs/spec_topics/type-system.md:29`) states the invariant every check
relies on: "Whenever `T₁ ⊑ T₂` holds, every value statically typed as `T₁`
AJV-validates against the lowering of `T₂`". A constructor is the
type-introduction site — the one place the static type `Point` is minted for
a value — and minting it without examining the field values produces values
that are statically `Point` everywhere downstream (TYPE-10 nominal identity)
yet do not validate against `Point`'s lowering. w2 is the limit case: the
registry row for `theta/parse/result-in-schema-position`
(`docs/spec_topics/diagnostics/code-registry-parse.md:59`) makes a
`Result`-typed schema field *undeclarable*, and the value-typing gap
constructs the forbidden state anyway. The
[Unresolvable operands](../spec_topics/type-system.md#type-compatibility)
paragraph (`type-system.md:48`) licenses skipping a static check only where
"the runtime AJV check is the safety net" — true at effect boundaries
(outbound tool/invoke/query validation,
[tool-calls.md](../spec_topics/tool-calls.md)), false for a value used purely
in-body (member reads, `==`, interpolation render), which never crosses one.

**What the spec does not say — stated honestly.**

- No registry code covers "constructor names an undeclared schema".
  `theta/parse/unknown-identifier`
  (`code-registry-parse.md:60`) triggers on a "bare identifier in call or
  value position", and [expressions.md §Identifier
  resolution](../spec_topics/expressions.md#identifier-resolution) (:42–52)
  defines resolution for call-position identifiers; a constructor name is
  arguably neither, and the implementation's identifier walk excludes
  constructor-name sites explicitly. The undeclared-name disposition is
  unspecified, not mis-specified.
- No registry code covers a constructor field-value type mismatch, and the
  §Type compatibility check-site enumeration (`type-system.md:27`) does not
  list the constructor-field position. The nearest neighbour is
  [§Array construction](../spec_topics/expressions.md#array-construction)
  (:218) naming a "surrounding constructor field" as an element-type
  *inference context* for `[]` — an inference context, not a promised check
  site. Absent value-typing is therefore an unenforced invariant plus a
  registry gap, not a divergence from an explicitly promised diagnostic.
  Fixing either half is consequently a
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) registry
  amendment (spec change + implementation in lock-step), admissible within a
  1.x minor under the [GOV-15 diagnostic-registry
  carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  — a code addition whose covered effect is exactly that previously
  clean-loading inputs (u1–u5, w1–w4 above) gain the new emission.

## Actual behaviour / root cause

One checker, two structural omissions:

1. **The defer arm has no reject case.** `refs.schemas` holds only same-file
   object-form `schema` declarations (`theta-document.ts:4746–4753`), so the
   defer arm (:5054–5060) must pass names it cannot see — aliases, enums,
   and legitimately, **imported** `.thetalib` schemas. It defers by lookup
   miss alone, so "declared elsewhere / declared as something else" and
   "declared nowhere" are indistinguishable, and the second class inherits
   the first's silence. No later phase revisits the name: the
   identifier-resolution walk skips constructor sites by design
   (:3981–3991), inference emits the `named <typeName>` placeholder
   (:257–258) whether or not the name exists, and the compat engine's
   `"unknown"` arm (`type-compat.ts:222–237`) converts the unresolvable
   placeholder into a skip at every sink — the same "defer to the runtime
   safety net" posture bug 0019 found for `?` operands, in positions where
   no net exists.
2. **The field-name map never carried types.** `ObjectSchemaSpec.fields` is
   `readonly string[]`; the collection site drops `f.type` on the floor
   (:4752). Extra/missing are set-difference checks over names. No code path
   compares a field value's inferred type against the declared field type,
   and the declared type is likewise never threaded as a sink into the
   array-literal element check (w4).
3. **Runtime completes the silence.** Both hosts resolve the name once, for
   branding only (`statement-executor.ts:669–672`,
   `production-theta-producer.ts:5647–5650`): a miss produces the plain
   object with the name discarded — no diagnostic, no distinct value state.
   Downstream, the QRY-18 outbound render treats the unbranded value under
   the "safe no-rename default" (:5544–5551), and the AJV net fires only if
   the value happens to reach an effect boundary, where the error names the
   boundary, not the construction site.

## Why it matters

- **The bare-object-literal ban is decorative.** Its documented purpose is
  that the type of every constructed object is knowable from the syntax.
  Any capitalised name — a typo (`Pointt`), a renamed schema's old name, an
  invented one — silences the ban and yields precisely the untyped object
  it forbids. The natural authoring error (misspelling a schema name)
  produces zero signal at any phase.
- **An undeclared name poisons every downstream static check.** u2/u5: the
  `named` placeholder degrades typed-`let`, fn-arg, and invoke-arg checks to
  `"unknown"`-skip, so the annotation the author wrote to catch exactly this
  class of error is inert — even a primitive annotation.
- **Branded-but-malformed values falsify the compat engine's premise.** Every
  downstream consumer of the `⊑` relation assumes a `Point`-typed value
  validates as `Point`. w1-class values break that silently; the failure, if
  it ever surfaces, is a runtime AJV `Err` at a distant effect boundary
  naming no construction site — the parse-first posture
  (`type-system.md:29`, "compatibility failures surface as parse errors at
  the offending source span rather than as runtime validation errors at a
  downstream call site") inverted.
- **The `Result`-smuggle route stays open.** w2 constructs the state
  `result-in-schema-position` exists to make unrepresentable. Bug 0019's
  runtime brand guard now makes the `?` unwrap of such a field loud, but
  every other consumer (interpolation render, `==`, member reads, wire
  lowering) handles a schema-branded value carrying a `Result` the type
  grammar forbids in that position.

## Fix options and recommendation

1. **Reject undeclared constructor names at parse (defect 1; recommended).**
   Give the defer arm a classification instead of a lookup miss: defer only
   for names declared as something the field-set check cannot use (alias /
   enum / imported / builtin), reject names that resolve to nothing in the
   whole-file declaration-plus-import view (the resolution universe
   `checkUnknownIdentifiers` already builds). Registry: either widen the
   `theta/parse/unknown-identifier` trigger to constructor-name sites (a
   DIAG-2 trigger change, in-scope as an addition for these inputs under the
   GOV-15 carve-out) or — cleaner message contract (`unknown schema
   '<name>' in constructor position`, hint naming the declared schemas) —
   mint a dedicated code. Either way the closed registry moves with the
   implementation in the same change. Risk to control: imported-schema
   constructors must not false-positive, so the check keys off the resolved
   import symbol set, not `refs.schemas`.
2. **Field-value type checking at the constructor (defect 2; follow-up,
   larger).** Carry `f.type` into the schemas map and check each field
   value's inferred type against the declared field type with the existing
   `checkCompatible` engine, reporting a new registered per-field code (and
   threading the declared type as the sink for array-literal field values,
   closing w4 with the already-registered
   `theta/parse/array-element-type-mismatch`). Interaction with inference
   bounds the scope honestly: many field values infer as `named`
   placeholders (member reads, call results — the bug-0019 inference
   limits), which yield `"unknown"` and skip, so the check is partial by
   construction — it moves diagnosis to load where types are resolvable
   (literals, constructor values, annotated bindings; this closes w1 and
   w2 — a `Result` constructor value against any lowerable field type is
   statically incompatible) and leaves the rest to the AJV boundary, the
   same split `let-rhs-type-mismatch` already lives with. DIAG-2 registry
   amendment as above; GOV-15 carve-out covers the newly-rejected inputs.
3. **Runtime guard instead of a parse gate (rejected).** Branding-or-throw at
   the two evaluator arms would catch u1-class values only at run time, in
   both hosts, for a site that is fully static — the author wrote the name
   in source; nothing is past the parser's view. A load rejection is
   strictly earlier and cheaper. (Defence-in-depth at the brand site is not
   harmful, but it is not the fix.)

Option 1 is small, total over its input class, and restores the documented
premise of the bare-literal ban; option 2 is the substantive typing work and
can follow independently. Both require their registry rows in the same
change (DIAG-2); neither requires touching the runtime value model.

## Non-goals

- The body-level type-alias declaration rejection observed while probing
  (`schema Animal = Cat | Dog` in a theta body is
  `theta/parse/unsupported-feature: stray '='` at `b542dafe`) — a separate
  surface, not investigated here. Consequently union- and alias-named
  constructors were not probed; the defer-arm comment names them as deferred
  classes, but this report's evidence covers undeclared and enum names only.
- Bug 0019's `?` unwrap over smuggled `Result` fields — guarded since
  0.31.0; separate.
- Equality semantics of unbranded vs branded values (`Mystery { a: 1 } ==
  Point { a: 1 }` is structural by the runtime value model; the brand is
  deliberately non-enumerable — bug 0020 territory, spec-conformant).
- The empty-array "surrounding constructor field" inference context
  (`expressions.md:218`) as a general inference feature — adjacent to
  defect 2's sink-threading, not filed here.
- Render-privacy of a smuggled `Result`'s internals under interpolation —
  `result-value-privacy` territory, separate audit if pursued.

## Provenance

- **Origin:** bug 0019 §Fix (0.31.0) residual paragraph
  ([0019](./0019-question-operand-bypasses-result-normalisation.md),
  "Adjacent pre-existing issue identified during review, out of scope, not
  filed here"), fix commit `655e4d39`; surfaced there while probing the
  member-route control, recorded as "a static-gate gap family distinct from
  ERR-18".
- **Evidence:** scratch vitest (deleted after probing) over the production
  prompt-mode binding harness pattern of `tests/result-value-privacy.test.ts`
  §"Shared harness"; matrix rows u1–u5, w1–w4, controls c1–c3 probed at
  `b542dafe`, all offline; verbatim outputs quoted in §Reproduction.
- **Implementation:** `src/parser/theta-document.ts` (:3981–3991, :4701–4755,
  :5027–5081), `src/parser/literal-sublanguage.ts` (:528–562),
  `src/parser/static-type-inference.ts` (:257–258), `src/parser/type-compat.ts`
  (:222–237), `src/runtime/statement-executor.ts` (:657–673),
  `src/runtime/lexical-environment.ts` (:517),
  `src/extension/production-theta-producer.ts` (:5526–5566, :5636–5651), all
  at `b542dafe`.
- **Spec measured against:**
  [expressions.md §Object construction](../spec_topics/expressions.md#object-construction)
  (`docs/spec_topics/expressions.md:209`), §Identifier resolution (:42–52),
  §Array construction (:218);
  [type-system.md §Type compatibility](../spec_topics/type-system.md#type-compatibility)
  (:27–52, TYPE-8/9/10 and the Operational-definition and
  Unresolvable-operands paragraphs);
  [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md)
  rows :44–46 (`extra-object-field`, `missing-object-field`,
  `bare-object-literal`), :59 (`result-in-schema-position`), :60
  (`unknown-identifier`);
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2);
  [GOV-15 and its diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out).
