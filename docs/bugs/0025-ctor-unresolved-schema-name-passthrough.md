# Bug 0025 — A constructor naming an undeclared or non-constructible schema (`Mystery { r: Ok(1) }`, `Color { r: 1 }`) loads clean and evaluates as an unbranded plain object

- **Status:** fixed (0.37.0). §Fix as settled — `checkObjectExpr`'s silent
  lookup-miss arm becomes a classification against the whole-file top-level
  type-declaring universe: an imported `.thetalib` symbol defers, and an
  `enum`, a `schema` with no object body, and a name resolving to no top-level
  declaration each fire the widened `theta/parse/unresolved-named-type`. The
  DIAG-2 amendment carrying that widening is written here and is shared with
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md), which
  needs no further registry edit. No runtime change.
- **Kind:** defect — a static-gate gap in the single object-constructor checker
  (`checkObjectExpr`). The checker looks the constructor name up in the
  declared object-schema field-name map and takes a silent defer arm on a
  lookup miss, so three classes collapse into one: a name that resolves to no
  declaration, a name that resolves to a declaration that is not
  brace-constructible (an `enum`), and an imported `.thetalib` schema whose
  field bodies are genuinely unavailable at the importer's parse. The first two
  inherit the third's silence — no parse diagnostic, no load diagnostic, no
  runtime disposition — and evaluate to an unbranded plain object. The
  [bare-object-literal ban](../spec_topics/expressions.md#object-construction)
  (whose stated purpose is "every constructed object must name its schema, so
  the type is unambiguous from the syntax alone") is evaded by naming a schema
  that does not exist, and what evaluates is exactly the bare object literal
  the ban forbids. Spec standing: the second bug category of
  [docs/bugs/README.md](./README.md) — spec and implementation together fail to
  deliver documented behaviour. The input slips between the two documented
  regimes: neither the bare-literal rejection nor the constructor field-set
  checks apply, and no third disposition is defined.
- **Affected** (citations verified at HEAD `4d645f4f`, 0.32.0):
  - `checkObjectExpr` (`src/parser/theta-document.ts:5038`) — the only
    constructor gate. Bare-literal arm :5045–5052; **defer arm :5054–5060**
    (constructor name not in the declared-object-schema map → silent return,
    comment: "the field-set check needs the declared shape, so defer — do not
    guess"); extra-field presence loop :5061–5073; missing-field call
    :5074–5080.
  - `StructuralRefs.schemas` (`src/parser/theta-document.ts:4711`), the map the
    defer arm consults, built at :4746–4753 from same-file object-form `schema`
    declarations only (`s.kind === "schema" && s.fields !== undefined`, :4751).
    Every other name — imported, `enum`, alias/union form — misses.
  - The identifier-resolution walk (`src/parser/theta-document.ts:3981–3991`)
    — excludes constructor names by design ("schema-constructor names … are not
    identifier-resolution sites here"), so `theta/parse/unknown-identifier`
    never fires for them.
  - `src/parser/static-type-inference.ts:257–258` — a constructor expression
    types as `{ kind: "named", name: node.typeName }` whether or not the name is
    declared; `src/parser/type-compat.ts:222–237` — an unresolvable `named`
    operand yields `"unknown"`, so every downstream sink check (typed `let`,
    fn-arg, invoke-arg) skips. An unresolvable constructor is thereby
    compatible-by-silence with **every** annotation, including primitives
    (fixtures u2/u4).
  - Runtime, both evaluation hosts: the async executor's object arm
    (`src/runtime/statement-executor.ts:657–673`, brand-or-plain choice
    :669–672) and the pure host
    (`src/extension/production-theta-producer.ts:5636–5651`, :5647–5650) —
    `env.resolveSchema(typeName)` (`src/runtime/lexical-environment.ts:517`)
    misses → the plain field object is returned **unbranded**, the constructor
    name silently discarded.
  - QRY-18 outbound render (`translateInterpolationOutbound`,
    `src/extension/production-theta-producer.ts:5526`, fallback :5544–5551) —
    an unbranded value with no resolvable hint "recurses with its keys
    unchanged": the value renders as a plain JSON object.
- **Observed at:** `0.32.0` (`4d645f4f`). Fully offline and deterministic — no
  live model, no provider.
- **Fix ordering:** the fix widens the same registry row that
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) widens
  (`theta/parse/unresolved-named-type`). The two changes coordinate on one
  DIAG-2 amendment; 0025 landed first and wrote the row.

## Fix (0.37.0)

Both §Fix halves — classification and DIAG-2 amendment — in one commit; line
anchors at the fix commit.

**The classification (§Fix "Classification", D2).**
`checkObjectExpr` (`src/parser/theta-document.ts:5086`) reaches the
classification only when `refs.schemas` misses, so a same-file object-form
`schema` keeps the unchanged extra-field / missing-field path. The former
silent-defer arm is now four arms over the destructured
`refs.bodyTypes` triple (`:5109`), each emitting at most one diagnostic and
returning:

1. `imports.has(name)` (`:5110`) — **defer**. `collectBodyTypes`'s `imports`
   is a name-only `Set<string>`: the importer's parse holds neither the
   symbol's field bodies nor its kind, so it cannot decide even whether the
   name is brace-constructible. The one genuinely undecidable class.
2. `enums.has(name)` (`:5118`) — **reject**. An `enum` is not
   brace-constructible; a discriminated union constructs via the variant
   schema name (`expressions.md:218`). Keyed off `collectBodyTypes`'s `enums`
   rather than `StructuralRefs.enums` to keep constructor-name resolution
   decoupled from the `Enum.Variant` member-access map; both sets hold a
   variant-less `enum` (see §Residuals (iii)).
3. `bodySchemas.has(name)` (`:5125`) — **reject**. Present in the whole-file
   schema set but absent from `refs.schemas` means `fields === undefined`: the
   alias/union form, which has no object body to brace-construct.
4. otherwise (`:5133`) — **reject**. No top-level `schema` of either form, no
   top-level `enum`, no imported symbol.

All three reject arms emit through one builder,
`unresolvedNamedTypeDiagnostic` (`:4277`) — severity `error`, range the
constructor expression's, message `unresolved named type '<name>'`, byte-equal
to the row's normative Message and to the pre-existing `params:` emission
(`src/parser/params.ts:137`).

**Threading (§Fix "Threading").** `StructuralRefs` gains
`readonly bodyTypes: FrontmatterBodyTypes` (`:4748`); `checkStructural`
(`:4771`) takes it as a parameter (`:4773`) and forwards it into the refs
literal; the single call site (`:755`) supplies the `collectBodyTypes(statements)`
value already computed at `:725`. Not `collectIdentRoots`, which folds in
`params:` field names, resolved `tools:` callable names and the stdlib
builtins — `read { x: 1 }` would classify as resolvable.

**Registry (DIAG-2, GOV-15).**
`docs/spec_topics/diagnostics/code-registry-parse.md:88` — the
`theta/parse/unresolved-named-type` Trigger widens from the `params:`
right-hand side to a closed four-position list: `params:` RHS, `@<T>` query
annotation, `schema` body field type, and object-constructor name. Resolution
is whole-file over the body's **top-level** declarations. The constructor
position carries the added brace-constructibility requirement, and the row
states that an imported symbol always defers there. One row, one Message,
severity `E` unchanged; the Spec-link cell gains
`[Expressions — Object construction]` beside the frontmatter link.
`docs/spec_topics/expressions.md:214` gains the matching normative paragraph,
between the two bare-literal carve-outs and the discriminated-union sentence.
This newly rejects inputs that loaded clean before (u1–u4 and the typo case);
the [GOV-15 diagnostic-registry
carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
admits a trigger widening within a 1.x minor, and it is the mechanism relied
on here.

**Unchanged by decision.** No runtime change — `env.resolveSchema`
(`src/runtime/lexical-environment.ts:517`) and both brand sites
(`src/runtime/statement-executor.ts:657–673`,
`src/extension/production-theta-producer.ts:5636–5651`) are untouched; the
input never loads. `theta/parse/unknown-identifier` is not widened — `let a =
Mystery` keeps its own row, pinned by
`tests/e2e-s4-never-emitted-diagnostics.test.ts:53–54` and by this bug's own
c6 / c6-inverse controls. No new diagnostic code, so
`tests/fixtures/h7a/permitted-codes.json` is unchanged (its 10 entries are
load/runtime codes; the widened parse code is unreachable from every H9a
fixture). Constructor field-value typing stays with
[0031](./0031-ctor-field-value-typing-unchecked.md):
`StructuralRefs.schemas` still carries field names only.

**Verification.** Default suite 227 files / 2680 tests green; typecheck clean;
lint clean. Offline lock — `tests/ctor-unresolved-schema-name.test.ts` (new,
24 cells over the `parseThetaDocument` boundary plus the shipped
`discoverAndComposeFixtures`, messages sourced from the registry per DIAG-4):
the DIAG-2 row contract (`:201`), the four reject fixtures u1 / u2 / u4
(`:227`, `:235`, `:245`), the typo (`:252`), a nested inner constructor
(`:261`), a block-nested declaration (`:276`), the enum u3 / u3b (`:297`,
`:305`), the alias/union head (`:321`), the two imported-symbol defer cells
(`:357`, `:362`), eleven controls holding c1–c6 plus the forward reference,
the Pi-tool sole-argument and `params:`-default carve-outs (`:381`–`:473`), and
the load consequence (`:513`) — the offending theta no longer registers.
Both halves proven load-bearing in both directions: with only
`src/parser/theta-document.ts` reverted to `4eb0721c`, ten cells red with
`actual diagnostics=[]` and `registered=["ctorunres","goodctl"]`, matching
§Reproduction exactly, while all fourteen defer/control cells stay green; with
only the registry page reverted, exactly the row cell reds; both restored,
24/24 green and the tree byte-identical. Live —
`tests/live/acceptance/ctor-unresolved-load-refusal.test.ts` (new, H9a-style,
its own temp discovery root and its own file, deliberately outside the shared
nine-area manifest so bug 0030's empty-capture gate is untouched) drives a real
`pi -p`: the offending theta is refused, a well-formed matched-pair control
registers and drives, and a prober theta's `match invoke("./<offender>.theta")`
turns the refusal into a positive `B25 OFFENDER REFUSED` sentinel on stdout.
Green (1/1) and red-proved once with the fix neutralised (`B25 OFFENDER
LOADED`). H9a acceptance 10/10 green, `tests/acceptance-stderr-gate.test.ts`
32/32 green — no new stderr line, no new code slug.

**Residuals.** (i) Discharged by
[0028](./0028-unresolved-annotation-silent-permissive-lowering.md)'s fix
(0.38.0): the row's remaining two positions — the `@<T>` annotation and the
`schema` body field type — now emit as documented, so the four-position
trigger is fully delivered (the settled shared-amendment plan: this fix wrote
the registry row, 0028 landed code only). (ii) A constructor name inside a query-template
interpolation (`` @`${ Mystery { a: 1 } }` ``) or inside a `params:` default
value is not classified. This is a general hole, not one this fix opens: no
structural check reaches interpolation contents at all — a *declared*
constructor's extra-field check and `unknown-identifier` are equally silent
there — so every sentence of `expressions.md` §Object construction shares the
boundary. (iii) Two §Fix sentences are factually wrong at `4eb0721c`, neither
changing what shipped. It asserts that `StructuralRefs.enums` "is populated
only for a declaration with variants": `parseEnum` always supplies `variants`
(`parseEnumVariants` returns `[]` for an empty body), so both sets hold a
variant-less `enum` — the classification's choice of `collectBodyTypes`'s set
is a decoupling decision, not a coverage necessity, and the outcome for `enum
Color { }` + `Color { r: 1 }` is the same either way (both
`theta/parse/empty-enum-body` and `theta/parse/unresolved-named-type` fire, at
their two distinct sites). It also says alias/union names "are unreachable from
a `.theta` body today": the alias *head* parses as a fields-less `schema`
statement and only its `= Cat | Dog` tail degrades into 0033's stray-token
diagnostics, so `schema Animal = Cat | Dog` + `Animal { x: 1 }` reaches arm 3
today and is pinned by a test cell. (iv) A block-nested `schema` / `enum`
declaration is accepted with no diagnostic although resolution and runtime
registration are both top-level-only — so `if true { schema S { x: number }
let s = S { x: 1 } }` now reports `unresolved named type 'S'` while its
declaration sits in view. The rejection is the correct disposition (the runtime
would brand nothing), but the silent acceptance of the nested declaration is an
unfiled gap, sibling to `theta/parse/nested-fn` and to
[0033](./0033-body-level-schema-alias-unsupported.md). (v) Import/local
name-collision precedence is undefined and lands on opposite sides here: a
local object-form `schema` shadowing an import runs the field-set checks, while
a local `enum` shadowing an import defers. Neither behaviour changes with this
fix, and no spec text or diagnostic covers duplicate declaration names.

## Summary

`checkObjectExpr` is the whole static story for `Schema { field: expr, … }`
constructors, and it checks two things, both presence-only: no undeclared field
name, no omitted declared field name. Both need the declared shape, so a name
the checker cannot look up takes a defer arm that returns without a diagnostic.

`Mystery { r: Ok(1) }` loads with zero diagnostics and evaluates — through the
same executor arm a declared constructor uses — to a plain object that fails the
`resolveSchema` test and is therefore never schema-branded. The result is
observably a bare object literal: unbranded (`schemaTagOf` `undefined`),
rendered with keys unchanged, its `Mystery` name discarded. Because the inferred
static type is the nominal placeholder `named "Mystery"` and the compatibility
engine maps an unresolvable name to `"unknown"`, the value also sails through
every annotated sink — `let p: Point = Mystery { … }` and `let n: number =
Mystery { a: 1 }` both load clean.

A constructor naming a declared **enum** (`Color { r: 1 }`) rides the same defer
arm to the same unbranded object, although an enum is not brace-constructible
under any reading of the spec and the checker holds the data to see that
(`StructuralRefs.enums`, `theta-document.ts:4703`).

The same name one brace apart gets the opposite disposition: `let a = Mystery`
is `theta/parse/unknown-identifier`, `let a = Mystery { r: 1 }` is silent.

## Reproduction

Offline, deterministic, at `4d645f4f`. Harness: the production prompt-mode
binding used by `tests/result-value-privacy.test.ts` §"Shared harness" (:108;
also `tests/question-operand-defect.test.ts`) — `parseThetaDocument` →
`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`.
"static" = the full parse diagnostic list; "runtime" = `BodyExecution`
observables plus the `schemaTagOf` / `isResultValue` brand reads
(`src/runtime/value.ts:207`/`:239`). All fixtures are `mode: prompt` with the
construct `let`-bound and returned as the tail expression.

| # | fixture | static | runtime |
|---|---|---|---|
| u1 | `let m = Mystery { r: Ok(1) }` | none — loads | outcome `success`; value JSON `{"r":{"ok":true,"value":1}}`; `schemaTagOf(m)` = `undefined` (unbranded); `isResultValue(m.r)` = `true` |
| u2 | `schema Point { x: number, y: number }` + `let p: Point = Mystery { x: 1, y: 2 }` | none — loads | (not driven) |
| u3 | `enum Color { Red }` + `let c = Color { r: 1 }` | none — loads | outcome `success`; value JSON `{"r":1}`; `schemaTagOf(c)` = `undefined` |
| u4 | `let n: number = Mystery { a: 1 }` | none — loads | (not driven) |

Controls (the gates that do exist fire; the gap is not a dead checker):

| # | fixture | static |
|---|---|---|
| c1 | `schema Point { x: number }` + `Point { x: 1, z: 3 }` | `theta/parse/extra-object-field`: `extra field 'z' on schema 'Point'` |
| c2 | `schema Point { x: number, y: number }` + `Point { x: 1 }` | `theta/parse/missing-object-field`: `missing field 'y' on schema 'Point'` |
| c3 | `let p = { x: 1 }` | `theta/parse/bare-object-literal`: `bare object literal not permitted in this position; name the schema (Schema { ... })` |
| c4 | `schema P { x: number }` + `let n: number = P { x: 1 }` | `theta/parse/let-rhs-type-mismatch`: `let binding 'n' initialiser type mismatch: expected number, got P` |
| c5 | `schema P { x: number }`, `schema Q { x: number }` + `let q: Q = P { x: 1 }` | `theta/parse/let-rhs-type-mismatch`: `let binding 'q' initialiser type mismatch: expected Q, got P` |
| c6 | `let a = Mystery` (no brace) | `theta/parse/unknown-identifier`: `unknown identifier 'Mystery'` |

Matched pairs isolate the variable:

- **c3 against u1** — writing any capitalised name before the brace silences the
  bare-literal rejection while supplying nothing the rejection exists to obtain.
- **c4 against u4, c5 against u2** — the typed-`let` sink check is live at this
  exact site and is dead only when the constructor name is unresolvable. Same
  site, same checker; the only variable is name resolution. (`let q: Q = Zed { x:
  1 }` with `Q` declared and `Zed` not: no diagnostics.)
- **c6 against u1** — one brace decides between `unknown-identifier` and
  silence.

A typo of a declared schema is likewise silent: `schema Point { x: number, y:
number }` + `let p = Pointt { x: 1, y: 2 }` reports nothing.

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

The paragraph defines two regimes over constructed objects: named constructors
get the field-set checks; nameless literals are rejected (two carve-outs aside).
Both regimes presuppose the name resolves to a declared schema — the stated
rationale ("the type is unambiguous from the syntax alone") is deliverable only
then. For an unresolvable name the implementation delivers neither regime and
the spec defines no third: the field-set checks cannot run (no declared shape),
the bare-literal rejection is bypassed (a name is syntactically present), and
what evaluates is the value the ban exists to prevent — an object of no schema.
Per [docs/bugs/README.md](./README.md), spec and implementation together failing
to deliver documented behaviour is a defect.

The same paragraph pins the enum case indirectly: it names `Schema { … }` as the
construction form for *schema-typed* values, and directs discriminated unions to
be constructed "via the variant schema name" (`expressions.md:214`). No reading
admits an `enum` name in constructor position.

[type-system.md §Unresolvable operands](../spec_topics/type-system.md#type-compatibility)
(`docs/spec_topics/type-system.md:48`) licenses skipping a static check only
where "the runtime AJV check is the safety net" — true at effect boundaries
(outbound tool/invoke/query validation,
[tool-calls.md](../spec_topics/tool-calls.md)), false for a value used purely
in-body (member reads, `==`, interpolation render), which never crosses one. An
unresolvable constructor name is not past the parser's static view in the sense
that paragraph contemplates: the author wrote the name in source and the
whole-file declaration set is in hand.

**What the spec does not say — stated honestly.**
No registry code today covers "constructor names an undeclared schema".
`theta/parse/unknown-identifier` (`code-registry-parse.md:60`) triggers on a
"bare identifier in call or value position", and [expressions.md §Identifier
resolution](../spec_topics/expressions.md#identifier-resolution) (:42–52)
defines resolution for call-position identifiers; a constructor name is arguably
neither, and the implementation's identifier walk excludes constructor-name
sites explicitly. The disposition is unspecified, not mis-specified, so the fix
is a [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) registry
amendment (spec change + implementation in lock-step), admissible within a 1.x
minor under the [GOV-15 diagnostic-registry
carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
— a trigger widening whose covered effect is exactly that previously
clean-loading inputs (u1–u4 above) gain the emission.

## Actual behaviour / root cause

1. **The defer arm has no reject case.** `refs.schemas` holds only same-file
   object-form `schema` declarations (`theta-document.ts:4746–4753`), so the
   defer arm (:5054–5060) must pass names it cannot see. It defers by lookup
   miss alone, so "declared elsewhere", "declared as something else" and
   "declared nowhere" are indistinguishable, and the latter two inherit the
   first's silence.
2. **No later phase revisits the name.** The identifier-resolution walk skips
   constructor sites by design (:3981–3991), inference emits the `named
   <typeName>` placeholder (`static-type-inference.ts:257–258`) whether or not
   the name exists, and the compat engine's `"unknown"` arm
   (`type-compat.ts:222–237`) converts the unresolvable placeholder into a skip
   at every sink — the same "defer to the runtime safety net" posture bug 0019
   found for `?` operands, in positions where no net exists.
3. **Runtime completes the silence.** Both hosts resolve the name once, for
   branding only (`statement-executor.ts:669–672`,
   `production-theta-producer.ts:5647–5650`): a miss produces the plain object
   with the name discarded — no diagnostic, no distinct value state.
   Downstream, the QRY-18 outbound render treats the unbranded value under the
   "safe no-rename default" (:5544–5551), and the AJV net fires only if the
   value happens to reach an effect boundary, where the error names the
   boundary, not the construction site.

The data the checker needs is already collected one function up. `checkStructural`
(`theta-document.ts:4734`) is called at `:755`, thirty lines after
`collectBodyTypes(statements)` at `:725` (defined `:1080–1119`) builds the
whole-file type-declaring name universe — body `schema` names with their field
sources or `undefined` for the alias/union form, body `enum` names, and imported
symbols (`FrontmatterBodyTypes`, `src/parser/frontmatter.ts:219–234`).
`checkStructural` takes no such parameter.

## Why it matters

- **The bare-object-literal ban is decorative.** Its documented purpose is that
  the type of every constructed object is knowable from the syntax. Any
  capitalised name — a typo (`Pointt`), a renamed schema's old name, an invented
  one — silences the ban and yields the untyped object it forbids. The natural
  authoring error (misspelling a schema name) produces zero signal at any phase.
- **An unresolvable name poisons every downstream static check.** u2/u4: the
  `named` placeholder degrades typed-`let`, fn-arg, and invoke-arg checks to
  `"unknown"`-skip, so the annotation the author wrote to catch this class of
  error is inert — even a primitive annotation. c4/c5 show the same checks
  firing on the same site the moment the name resolves.
- **The disposition contradicts the sibling position.** `unknown-identifier`
  fires for `Mystery` in value position (c6) and for `mystery(1)` in call
  position; the constructor position, which carries strictly more information
  about author intent, reports nothing.
- **An enum constructor is a decidable category error left undecided.** `Color {
  r: 1 }` names a declaration the parser has already recorded
  (`StructuralRefs.enums`), in a position no reading of the spec admits, and
  produces an unbranded plain object instead of a diagnostic.

## Fix

Give the defer arm a three-way classification instead of a lookup miss, and emit
the widened `theta/parse/unresolved-named-type` for the two rejected classes.

**Classification.** In `checkObjectExpr` (`theta-document.ts:5054–5060`),
against the whole-file resolution universe:

1. **Reject** a name that resolves to no declaration at all — no body `schema`
   (either form), no body `enum`, no imported symbol.
2. **Reject** a name that resolves to a declaration that is not
   brace-constructible. Today that is `enum`: the classification keys off
   `StructuralRefs.enums` (`:4703`), whose data the checker already carries.
   `refs.enums` is populated only for a declaration with variants (`:4749`), so
   a variant-less `enum` falls to `collectBodyTypes`'s `enums` set
   (`frontmatter.ts:221`), which has no such condition. Alias/union names join
   this arm if body-level alias declarations ever parse; they are unreachable
   from a `.theta` body today (`schema Animal = Cat | Dog` yields two
   `theta/parse/unsupported-feature` diagnostics, `stray '='` and `stray '|'` in
   statement position —
   [0033](./0033-body-level-schema-alias-unsupported.md)).
3. **Defer** only an imported `.thetalib` schema name. `MaterializedImport`
   (`src/runtime/lexical-environment.ts:117–125`) carries `kind: "schema"` but
   no field bodies, so the importer's parse has no shape to check the field set
   against. This is the one genuinely undecidable class.

**Registry.** Widen `theta/parse/unresolved-named-type`
(`docs/spec_topics/diagnostics/code-registry-parse.md:88`) from the `params:`
right-hand side to every `NamedType`-resolution position — `params:` RHS,
`@<T>` annotation, constructor name, schema-body fields. One row, one message
(`unresolved named type '<name>'`), one DIAG-2 amendment. The existing row
description already states the exact predicate this fix implements ("names no
in-scope `schema`/`enum` declaration or imported `.thetalib` symbol. Resolution
is whole-file"; the whole-file/forward-reference semantics are spelled out at
`docs/spec_topics/frontmatter/frontmatter-fields-a.md:58`). Do not mint a
per-site code and do not widen `theta/parse/unknown-identifier`. Severity stays
`E`, following the bug-0014 `empty-query-annotation` precedent; GOV-15's
diagnostic-registry carve-out admits the newly-rejected inputs within a 1.x
minor.

[0028](./0028-unresolved-annotation-silent-permissive-lowering.md) widens the
same row for the `@<T>` annotation and schema-body-field positions. The two
bugs share one registry amendment: whichever lands first writes the widened row,
and the second cites it rather than re-editing it. Both need the same
imported-symbol nuance, handled once by the row's whole-file predicate.

**Threading.** `checkStructural` (`:4734`) gains a resolution-universe
parameter, supplied at `:755` from the `collectBodyTypes(statements)` result
already computed at `:725`. Do not key off `collectIdentRoots`
(`:3919–3953`, called at `:765`): it folds in `params:` field names, resolved
`tools:` callable names, and the stdlib builtins, so `read { x: 1 }` would
classify as resolvable.
`collectBodyTypes` is the type-declaring-names-only view, and its
`schemas` / `enums` / `imports` triple is exactly the three-way split above.

**No runtime change.** `env.resolveSchema` (`lexical-environment.ts:517`) and
both brand sites stay as they are; the input never loads. A brand-site runtime
guard would catch these values later, in two hosts, for a site that is fully
static.

**Test witness — unit, offline, no live provider.** The whole fix is witnessable
at the `parseThetaDocument` boundary: `diagnostics` for u1–u4 and the c1–c6
controls, plus the prompt-mode harness with `schemaTagOf` for the runtime
observables. Nothing on this path crosses a provider, so no live test applies.
Constructor diagnostics live in `tests/e2e-s1-expr-diagnostics.test.ts` and
`tests/fix1-parser-structural.test.ts` (additive). No existing test pins the
buggy behaviour — no test in `tests/` constructs an unresolvable schema name —
and `tests/e2e-s4-never-emitted-diagnostics.test.ts:53–54` pins `let x =
doesNotExist` → `unknown-identifier`, which this fix leaves untouched by
widening a different row.

## Non-goals

- Constructor field-value typing: a *declared* schema constructor whose field
  values mismatch the declared field types (`Point { x: "not a number", y: true
  }`) loads clean and brands. Separate defect, separate data path
  (`StructuralRefs.schemas` carries field names only) —
  [0031](./0031-ctor-field-value-typing-unchecked.md). It also carries the
  array-literal sink threading for constructor fields and the
  `type-system.md:27` check-site enumeration amendment.
- Body-level type-alias and discriminated-union declarations: `schema Animal =
  Cat | Dog` in a theta body yields `theta/parse/unsupported-feature:
  unsupported syntactic feature: stray '=' in statement position` (and the same
  code for `stray '|'`), and `skipDeclarationShape`
  (`theta-document.ts:2269`) has no caller —
  [0033](./0033-body-level-schema-alias-unsupported.md). Alias- and union-named
  constructors are therefore unprobed here; this report's evidence covers
  undeclared and enum names only.
- Equality semantics of unbranded vs branded values (`Mystery { a: 1 } == Point
  { a: 1 }` is structural by the runtime value model; the brand is
  non-enumerable — bug 0020 territory, spec-conformant since 0.32.0).

## Provenance

- **Origin:** bug 0019 §Fix (0.31.0) residual paragraph
  ([0019](./0019-question-operand-bypasses-result-normalisation.md), "Adjacent
  pre-existing issue identified during review, out of scope, not filed here"),
  fix commit `655e4d39`; surfaced there while probing the member-route control,
  recorded as "a static-gate gap family distinct from ERR-18".
- **Evidence:** scratch vitest (deleted after probing) over the production
  prompt-mode binding harness pattern of `tests/result-value-privacy.test.ts`
  §"Shared harness" (:108); fixtures u1–u4 and controls c1–c6 probed at
  `4d645f4f`, all offline; verbatim outputs quoted in §Reproduction.
- **Implementation:** `src/parser/theta-document.ts` (:725, :755, :765,
  :1080–1119, :2269, :3919–3953, :3981–3991, :4701–4755, :5027–5081),
  `src/parser/static-type-inference.ts` (:257–258), `src/parser/type-compat.ts`
  (:222–237), `src/parser/frontmatter.ts` (:219–234),
  `src/parser/params.ts` (:130–138, the current `unresolved-named-type`
  emission), `src/runtime/statement-executor.ts` (:657–673),
  `src/runtime/lexical-environment.ts` (:109, :117–125, :517),
  `src/runtime/value.ts` (:207, :239),
  `src/extension/production-theta-producer.ts` (:5526–5566, :5636–5651), all at
  `4d645f4f`.
- **Spec measured against:**
  [expressions.md §Object construction](../spec_topics/expressions.md#object-construction)
  (`docs/spec_topics/expressions.md:209`, variant-construction sentence :214),
  §Identifier resolution (:42–52);
  [type-system.md §Type compatibility](../spec_topics/type-system.md#type-compatibility)
  (:27–52, TYPE-10 and the Unresolvable-operands paragraph at :48);
  [code-registry-parse.md](../spec_topics/diagnostics/code-registry-parse.md)
  rows :44–46 (`extra-object-field`, `missing-object-field`,
  `bare-object-literal`), :53 (`let-rhs-type-mismatch`), :60
  (`unknown-identifier`), :88 (`unresolved-named-type` — the row this fix
  widens);
  [frontmatter-fields-a.md:58](../spec_topics/frontmatter/frontmatter-fields-a.md)
  (whole-file `NamedType` resolution);
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)
  (`diagnostic-shape.md:72`);
  [GOV-15 diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`source-language-stability.md:25`).
- **Related bugs:**
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — same
  registry row, different `NamedType` position; the two fixes coordinate on one
  DIAG-2 amendment.
  [0031](./0031-ctor-field-value-typing-unchecked.md) — the field-value half of
  the constructor gate.
  [0033](./0033-body-level-schema-alias-unsupported.md) — the body-level
  alias/union declaration residual that keeps the alias arm of the
  classification unreachable.
  [0026](./0026-ctor-field-named-thetaschema-destroyed-by-brand.md) — shares
  both constructor evaluation sites (`statement-executor.ts:657–673`,
  `production-theta-producer.ts:5636–5651`), different root cause
  (`Object.defineProperty` clobbering a user field). Its citations
  `theta-document.ts:4709` and `:5035` fall inside doc comments; the code lines
  are `:4711` and `:5038` as cited here.
