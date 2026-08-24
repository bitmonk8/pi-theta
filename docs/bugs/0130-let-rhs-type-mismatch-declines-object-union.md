# Bug 0130 — An inline object type in a `let` annotation converts to an unresolvable pseudo-`named` reference, so `theta/parse/let-rhs-type-mismatch` declines to fire at that position for every initialiser form: `let x: {a: integer} | null = 1` loads with zero diagnostics where the named twin `let x: S | null = 1` and the primitive `let x: string | null = 1` both refuse, the `⊑` engine answers `incompatible` when handed the same pair directly, and no runtime check exists at that position — plus, where an `array<…>` wrapper does make the check fire, `<expected>` renders `array<{a:integer}>` against `placeholder-rendering-a.md:21`

- **Status:** fixed (0.160.0). §Fix was constraint-pinned, not settled: the
  constraints are stated with their measured consequences and the route was
  chosen at fix time (§Fix (0.160.0), route R1/R2/R3). No
  ordering dependency in either direction — the three coordination points
  ([0129](./0129-empty-object-field-type-draws-two-diagnostics.md) on a second
  line for one written mistake,
  [0124](./0124-parsetype-trailing-punctuation-leniency.md) on the annotation
  source this conversion parses, and
  [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) on the
  reassignment position) each leave this report's input class and disposition
  question intact.
- **Sev/Diff estimate:** S1/D3 — a program the `⊑` relation refuses loads with
  zero diagnostics on the production parse path and the deferral it takes names
  a runtime net that does not exist at that position; D3 because the fix moves a
  conversion five checks across four files share, engages GOV-15 in the
  refusing direction against a committed H9a fixture, and must deliberately
  update landed pinned cells in two witness files.
- **Kind:** defect against existing normative text, two elements on one root
  cause (`src/parser/type-layer-checks.ts:503`).
  1. **A registered check declines to fire on input its *Trigger* covers.**
     `annotationToCompatType` maps every `ObjectType` annotation to
     `{ kind: "named", name: <the annotation source text> }` — a name no
     `TypeEnv` can resolve — so `checkCompatible` answers `"unknown"` and
     `checkLetRhsCompat` takes the arm reserved for
     [type-system.md:48](../spec_topics/type-system.md) *Unresolvable
     operands*. Measured: every initialiser form that refuses under a primitive
     annotation is silent under `{a: integer}`; the engine answers
     `incompatible` for `literal integer ⊑ {a: integer}` when the shape is
     passed directly. TYPE-8 (`type-system.md:42`) defines the relation for
     inline object types, and `grammar.md:109` admits `ObjectType` in any
     `Type` position, so the operand is not past the parser's static view.
  2. **Where the check does fire, the type renders non-conformantly.**
     `placeholder-rendering-a.md:21` fixes category-1 placeholders
     (`<expected>`, `<actual>`, `<element>`) to render an inline anonymous
     object type as `{ f₁: T₁, f₂: T₂ }`, "single space after each `:` and
     after each `,`". Measured, `let x: array<{a: integer}> = 1` renders
     `expected array<{a:integer}>`, and `x.join(",")` on that binding renders
     `got array<{a:integer}>` — the pseudo-name's raw text, through
     `displayType`'s `named` arm. `displayType`'s `object` arm
     (`src/parser/type-compat.ts:330–331`) already renders the conformant form
     and is unreachable for the same reason as element 1.
- **Related:**
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) —
    **fixed (0.74.0)**, the origin. Its widened `parseType` capture is what
    makes `let x: {} | null = 1` record its initialiser at all; before it, the
    statement split into four diagnostics and this check had no subject. Its
    §Non-goals (`:640–644`) states the disposition it reached: "Once
    `let x: {} | null = 1` records its initialiser, whatever that check says
    about `1` against an object union is the check's own disposition, **reached
    for the first time rather than altered**." Its fix record's residual (i)
    (`:1009–1014`) records the measurement and the reason given — "the row is
    scoped to a statically resolvable right-hand-side type" — and surfaces it
    unfiled. This report is that disposition, and it does not sustain the
    reason: the object union is the **annotation** `T`, and the *Trigger*'s
    resolvability clause is on the RHS type (§Expected behaviour).
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **fixed (0.57.0)**, the adjacent rule at the same positions. It refuses an
    empty inline object at every `Type` position, which is why
    `let x: {} | null = 1` and `let x: {} = 1` each draw one
    `theta/parse/empty-schema-body` line today. It is disjoint from this
    report: its rule keys on emptiness and fires from the type-grammar walk,
    while this defect is in the type-**layer** conversion and reaches every
    inline object type including non-empty ones. Its witness carries two of the
    landed pins §Fix (e) must update.
  - [0083](./0083-let-annotation-discarded-from-recorded-binding-type.md) —
    **fixed (0.55.0)**, and it does bear on this report. Its §Fix made the `let`
    arm record the declared annotation in TYPE-11-transparent form
    (`src/parser/type-layer-checks.ts:640–643`), and its own comment states the
    limit: "`unfoldAlias` leaves an object-schema `named` nominal (TYPE-10) and
    an unresolvable `named` intact" (`:638–639`). For an inline-object
    annotation the recorded type is therefore the pseudo-name, so the
    downstream gates 0083 exists to feed read a name they cannot resolve.
    Measured: `let x: {a: integer} = 1` then `x[0]` draws `[]`, where the named
    twin draws `theta/parse/non-string-object-index`. 0083's witness pins the
    `undefined` fallback and the `named` mapping for a declared **name**
    (`tests/let-annotation-recorded-binding-type.test.ts:303–321`) and pins
    nothing about an inline object type, so its landed cells do not constrain
    the shape this conversion returns.
  - [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md) —
    **open**, the same family at the reassignment position, and the two differ
    in what is missing. There the obligation (`bindings.md:12`) has no emitter
    and the registry has no row, so the fix needs a DIAG-2 row decision; here
    the row exists (`code-registry-parse.md:54`), the emitter exists
    (`type-compat.ts:403–442`) and fires for primitive, named, alias and
    `array<…>` annotations, and one conversion line withholds its input.
    They compose on one fixture: `let mut x: {a: integer} = 1` then `x = "s"`
    draws `[]`, the initialiser silence by this defect and the write silence by
    0115. Neither fix reaches the other's site.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **open**,
    the coordination named in §Fix (a). Its subject is two `E` lines for one
    written mistake where 0045's inline rule already refuses `{}`. If this fix
    converts `{}` to an inline object type with an empty field set, `let x: {} = 1`
    gains a second `E` line beside the one 0045 emits — the same shape 0129 is
    adjudicating. Measured here: `literal integer ⊑ {}` (empty field set)
    answers `incompatible`.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, the
    input to the conversion. `annotationToCompatType` parses the token-joined
    annotation **string** `parseType` captured, and 0124's subject is that the
    capture joins trailing punctuation into it. A field-set parser added here
    inherits whatever that string admits; neither report's input class overlaps
    the other's.
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **open**, the same class one position over: a registered `type`-phase row
    whose emitter no input reaches. There the emitter has no caller; here the
    caller runs and the operand model empties the question. Different code,
    different row.
- **Affected** (every citation verified at HEAD `76dfde5c`, 0.74.0):
  - `src/parser/type-layer-checks.ts:503` — **the defect site**, the last
    statement of `annotationToCompatType`: `return { kind: "named", name: text };`.
    Every annotation source that is not a top-level union, an `array<…>`
    application or a primitive name lands here, including every `ObjectType`.
    The function's own doc comment states the behaviour as intended
    (`:474–481`): "every other shape (a `NamedType`, an inline object type)
    resolves to a nominal `named` reference — the same shape the `⊑` engine
    treats as deferred."
  - `src/parser/type-layer-checks.ts:482–504` — the whole conversion. The
    parameter is a `string` (`:482`), so the field set TYPE-8 needs is not in
    scope as a structure. `:488–493` splits a top-level union and converts each
    arm through the same function, which is why one brace-rooted arm makes the
    whole union answer `"unknown"`; `splitTopLevelUnion` (`:512–529`) tracks
    `<…>` depth only, so a `|` inside a brace group would also split — no
    committed input spells one.
  - `src/parser/type-layer-checks.ts:593–623` — `walkStmt`'s `case "let"`. The
    RHS type at `:595`, the annotation conversion at `:601–604`, the
    `annotation !== undefined` gate at `:605`, and the `checkLetRhsCompat` call
    at `:608–616`. The check IS reached for every fixture below; nothing
    short-circuits before it.
  - `src/parser/type-layer-checks.ts:640–643` — bug 0083's recorded declared
    type, `unfoldAlias(annotation, this.env)`, with the limit stated at
    `:638–639`. `:627–639` is the comment naming the gates that read this map by
    `kind`: "the `for` / `par for` iterand contract, the `array.join` element
    precondition".
  - `src/parser/type-layer-checks.ts:458–472` — `collectSchemaFields`, which
    maps each declared schema field's `typeSource` through the same conversion,
    so `theta/parse/object-field-type-mismatch` inherits the same silence
    (measured below). `:1428–1444` — the `array.join` element gate's call into
    `checkArrayJoin`.
  - `src/parser/type-compat.ts:403–442` — `checkLetRhsCompat`, the row's sole
    emitter. `:411` computes the relation; `:412–415` returns no diagnostic for
    `"compatible"` **or** `"unknown"`, the second arm commented "statically
    unresolvable — the latter defers to the runtime AJV safety net
    (type-system.md §"Unresolvable operands")".
  - `src/parser/type-compat.ts:139–146` (`checkCompatible`), `:180` (`decide`).
    `:195–208` — TYPE-5 on the right: a union answers `"unknown"` if no arm is
    compatible and any arm answered `"unknown"`. `:219–247` — TYPE-8's
    field-wise arm, which requires `sup.kind === "object"`. `:249–264` —
    TYPE-10's nominal arm. `:266–269` — the unresolvable-`named`-sub deferral,
    which sits **after** the TYPE-8 arm; the ordering is measurable
    (§Reproduction, block E).
  - `src/parser/type-compat.ts:61–64` — `CompatType`'s `object` arm (the union is
    `:55–64`), documented at `:52–53` as "an inline anonymous object type
    `{ f: T, … }`, field-wise with an exact field set (TYPE-8)". No production
    code constructs it: `rg 'kind: "object"'`
    over `src/parser/type-layer-checks.ts`, `src/parser/type-compat.ts` and
    `src/parser/static-type-inference.ts` matches the type declaration at
    `type-compat.ts:62` and an `Expr` narrowing at `type-layer-checks.ts:981`,
    nothing else.
  - `src/parser/type-compat.ts:318–333` — `displayType`. The `named` arm
    (`:324–325`) returns the raw name, which is the pseudo-name's source text;
    the `object` arm (`:330–331`) renders `{ a: integer }` per
    `placeholder-rendering-a.md:21` and is unreachable.
  - `src/parser/static-type-inference.ts:202–262` — `#typeExpr`, the RHS side.
    No arm returns an `object`: literals resolve at `:203–210`, an in-scope
    identifier reads the recorded binding type at `:211–216`, an array literal
    at `:217–223`; `:242–262` maps `member`, `index`-off-a-non-array, `call`,
    `invoke`, `query`, `object` (a bare object literal), `result-ctor` and
    `method-call` each to a pseudo-`named` reference naming a field, callee,
    path, schema source, constructor or method. So no expression in theta types
    as an inline object type today — §Fix (b)'s constraint.
  - `src/parser/type-grammar.ts:125–158`, `:379` — `TypeNode`, the structured
    type AST 0045's walk uses. Its `object` arm (`:132–157`) carries
    `fieldTypes: TypeNode[]` plus `interiorHasTokens` / `braceClosed`, and **no
    field names**, so it cannot supply TYPE-8's declared field set as it stands
    either.
  - `src/parser/query-schema-resolve.ts:470–491` — `checkLetMismatch`, which
    converts both the `@<T>` ascription and the `let` annotation through this
    same function and compares them; `:518–527` (`annotationToInferred`) and
    `:530–557` (`compatToInferred`), whose `named` arm (`:537–546`) rests on the
    current mapping in terms: "`annotationToCompatType` maps any unrecognised
    text to `named`, so a non-identifier "name" is really an inline object
    (`{a: string}`), a union (`A|B`), or another shape `InferredSchema` cannot
    represent". `:519–525` guards on `source.trim().startsWith("{")` for the
    same reason. Both comments expire under a fix that mints an `object`.
  - `src/extension/invoke-static-checks.ts:807–881` — the callee-`params:`
    argument check for a `.theta`-callable call site
    (`theta/parse/tool-arg-type-mismatch`, `code-registry-parse.md:115`;
    emitted by `checkToolCallArguments`, `src/runtime/tool-call.ts:241–263`),
    which converts each declared field type through this function (`:833`) and deliberately evaluates it under an **empty**
    `TypeEnv` (`:827`) so that "a `named` expected type is unresolvable, so
    `checkCompatible` answers `"unknown"` and the site defers", while "a
    structurally-decidable slot such as `array<Named>` still rejects a
    non-array argument". An `object` expected type is structurally decidable, so
    an inline-object `params:` field type would begin refusing here.
  - `src/runtime/stdlib-array.ts:100–123` — `checkArrayJoin`, the second
    reachable site of element 2: `:120–122` interpolates `<element>` through
    `displayType`.
  - `src/runtime/statement-executor.ts:1457–1468` — the runtime `let` arm. It
    evaluates the initialiser and calls `env.defineLocal`; it never reads
    `stmt.annotation` and validates nothing. The deferral at
    `type-compat.ts:412–415` therefore names no net at this position for a
    non-query initialiser.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:54` — the
    `theta/parse/let-rhs-type-mismatch` row, quoted verbatim in §Expected
    behaviour; `:53` — `theta/parse/let-without-initialiser`, the neighbour
    0095's capture removed from this input; `:86` —
    `theta/parse/empty-schema-body`, whose *Trigger* names "An empty inline
    object type (`{}`) in any `Type` position, at any nesting depth" (bug
    0045's widening); `:39` and `:43` — `theta/parse/non-string-object-index`
    and `theta/parse/non-string-array-join`, the two downstream rows measured
    below; `:46` — `theta/parse/object-field-type-mismatch`, the sibling row
    the same conversion feeds.
  - `docs/spec_topics/type-system.md:27` — the sentence binding "the RHS of a
    typed `let`" to the single relation `T₁ ⊑ T₂`; `:29` — the *Operational
    definition*, "the parser is required to recognise the structural cases
    enumerated below without falling back to it [AJV], so that compatibility
    failures surface as parse errors at the offending source span rather than
    as runtime validation errors at a downstream call site"; `:31` — the
    closure sentence, "anything outside it that the parser cannot decide
    statically is reported as a type mismatch … unless the position is one
    where a runtime AJV check is documented as the safety net"; `:35–42` —
    TYPE-1…TYPE-8, with `:39` TYPE-5 (union-widening), `:41` TYPE-7 and `:42`
    TYPE-8 (field-wise on inline object types, "This rule covers inline object
    types only"); `:44` — "Rules outside this list are deliberately **not**
    part of theta 1.0 compatibility"; `:48` — *Unresolvable operands*, the
    carve-out this implementation takes and the two examples it gives; `:50` —
    TYPE-9, which names this row and states the condition as "a static failure
    (`T₁ ⋢ T₂`, both operands statically resolvable)"; `:52` — TYPE-10, "an
    inline-object value is **not** `⊑` a named schema with the same field
    shape"; `:54` — TYPE-11; `:15` — "The same type grammar applies in every
    type-annotation position".
  - `docs/spec_topics/bindings.md:12` — "The same compatibility relation
    governs the initialiser of every `let` (typed or inferred) and is the
    canonical referent of every "same rules as `let`" cross-link elsewhere in
    the spec"; `:10` — the initialiser requirement.
  - `docs/spec_topics/grammar.md:77` (`LetStmt ::= "let" "mut"? Pattern (":" Type)? "=" Expr`),
    `:94` (`Type "|" Type`), `:101` (`ObjectType`), `:105` (the bare-`Type`
    position list, which includes `let` annotations), `:109` ("`ObjectType`
    admits an anonymous object type `{ field: T, ... }` in any `Type`
    position"). `docs/spec_topics/schemas.md:17` — field types "are any
    expression from the [Type System] grammar" and every declared field is
    required.
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:9–26` — category 1
    *Static-type placeholders*, with `:11` naming `<expected>`, `<actual>` and
    `<element>` and `:21` fixing the inline-object rendering. `:5` binds the
    comparison basis to GOV-15.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the
    registry is closed; a *Trigger* change is a spec change landing in the same
    commit); `:74` — DIAG-4 (the *Message* column is normative; a reword is
    deferred to theta 2.0).
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15 and
    its observable (b), "ordered diagnostic-code sequences", the observable any
    new refusal moves.
  - `docs/reference/diagnostics.md:100` — the *Message* mirror for this row; it
    carries no *Trigger* column. `docs/reference/type-system.md:46` (TYPE-5),
    `:49` (TYPE-8), `:59–62` (*Unresolvable operands*), `:64–69` (TYPE-9),
    `:70–75` (TYPE-10) — the user-facing mirrors a spec edit would reach. No
    `docs/reference/` page mirrors the placeholder-rendering rule.
  - `tests/live/acceptance/fixtures/acc-typed-inline.theta:14` —
    ``let r: { ok: boolean, label: string } = @`…`?``, the **only** occurrence of
    an inline object type in any `Type` position across the 34 tracked
    `.theta` / `.thetalib` files (`git ls-files '*.theta' '*.thetalib' | xargs
    grep -n ': *{\|@<{\|invoke<{'` matches this line and nothing else; the
    untracked `.pi/theta/smoke.theta` has none). Measured: it parses with `[]`.
    `tests/live/acceptance/harness.ts:236–246` — H9a area (c)
    (`typed-query-inline`), whose invariants are `noErrorExit: true`,
    `permittedCodesSubset: true` and `typedQuerySchema: INLINE_REPLY_SCHEMA`.
  - `tests/fixtures/h7a/permitted-codes.json` — 11 entries, every one
    `theta/load/*`, `theta/runtime/*` or `theta/host/*`; no `theta/parse/*`
    code is admissible today. `tests/live/acceptance/harness.ts:115–116`,
    `:328–336` (the loader), `:468–479` (`ACCEPTANCE_STDERR_ALLOWLIST`, empty,
    with the rule that "An entry is admissible ONLY when it appears in a
    baseline RE-RECORDED in the bug document"), `:534–546`
    (`assertStderrClean`, the empty-capture gate).
  - **Landed pins asserting the current silence**, all of which a fix must
    update deliberately:
    `tests/brace-rooted-union-arm-capture.test.ts:517–539` (bug 0095 cell 2a,
    quoted in §Expected behaviour), `:541–557` (cell 2b,
    `let x: {a: integer} | null = 1` → `diagnostics: []`), `:559–574`
    (control 2c, `let x: integer | null = 1` → `[]`, which must stay silent);
    `tests/inline-empty-object-type.test.ts:403–413` (cell a7,
    `let x: {} = 1`, whose comment reads "The initialiser mismatch check is
    silent for this annotation today and stays silent, so the whole list is the
    one line") and `:876–923` (cell g3, whose table rows `let r: {} = 1`,
    ``let r: {} = @`hi` `` and `let r: {} = invoke("./x.theta")` each expect the
    single inline line).
  - `tests/type-compat.test.ts:54–56`, `:212–235`, `:331` — TYPE-8's unit
    coverage, over `obj(...)` values the test file builds by hand. This is the
    only place a `kind: "object"` `CompatType` exists anywhere in the repo, so
    TYPE-8 is exercised as a relation and has no end-to-end reach.
  - **Test coverage of this defect: none.** No test asserts that a
    `let`-annotation inline object type either refuses or admits an
    incompatible initialiser. The pinned cells above assert the silence as the
    expected list.
- **Observed at:** `0.74.0` (HEAD `76dfde5c`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving the real `parseThetaDocument`
  through `parseDoc` (`tests/helpers/e2e-s1.ts:39`, the shipped load path
  behind the standard inert `parseDeps` double), plus direct calls to the
  exported `annotationToCompatType` and `checkCompatible`. Written, run,
  deleted; no file in `src/` or `tests/` was modified.

## Summary

`theta/parse/let-rhs-type-mismatch` is the TYPE-9 check on a typed binding's
initialiser. It runs for every annotated `let` and fires for a primitive, named,
alias or `array<…>` annotation. It does not fire for an inline object type at
that position — for any initialiser.

The cause is one line. `annotationToCompatType`
(`src/parser/type-layer-checks.ts:482–504`) parses the captured annotation
**string** and recognises top-level unions, `array<…>` applications and the five
primitive names; everything else falls through `:503` to
`{ kind: "named", name: text }`. For `{a: integer}` the "name" is the literal
source text, which no `TypeEnv` resolves, so `decide` answers `"unknown"`
(`type-compat.ts:266–269`) and `checkLetRhsCompat` returns no diagnostic through
the arm reserved for `type-system.md:48`'s unresolvable operands
(`type-compat.ts:412–415`). Inside a union the same collapse propagates: TYPE-5
on the right answers `"unknown"` when no arm is compatible and one arm answered
`"unknown"` (`type-compat.ts:195–208`), so `1 ⊑ {} | null` and
`1 ⊑ {a: integer} | null` both come back deferred.

The relation itself is not in doubt. `CompatType` carries an `object` arm
(`type-compat.ts:61–64`), `decide` implements TYPE-8 over it
(`:219–247`), and handed the shapes directly the engine answers
`literal integer ⊑ {a: integer}` = `incompatible` (measured). No production code
constructs that arm, so TYPE-8's implementation and `displayType`'s conformant
object rendering are both unreachable outside `tests/type-compat.test.ts`.

The consequence is a program the relation refuses loading clean:
`let x: {a: integer} | null = 1` parses with `[]`, while the named twin
`let x: S | null = 1` and the primitive `let x: string | null = 1` each draw the
row. The runtime adds nothing back — `statement-executor.ts:1457–1468` never
reads the annotation — so the deferral's stated safety net does not exist at this
position for a non-query initialiser. Where a structurally decidable wrapper does
reach the check (`array<{a: integer}>`), the message renders the pseudo-name
verbatim (`array<{a:integer}>`), which `placeholder-rendering-a.md:21` does not
admit.

This is bug 0095's residual (i). That fix widened `parseType`'s capture so
`let x: {} | null = 1` records its initialiser, reaching this check's
disposition for the first time; its §Non-goals declined to settle whether the
silence is right and its report gave the reason as the row being "scoped to a
statically resolvable right-hand-side type", with "an object union is not one".
The row's clause is on the RHS type, and the RHS is the integer literal `1`.

## Reproduction

Offline, at `76dfde5c`. Six scratch vitest files — blocks A and D share one, each
other block is one — with every parse cell one `parseDoc` call over a
`mode: prompt` document whose body is the statement plus the tail `let a = 1` /
`a` (the fixture shape `tests/brace-rooted-union-arm-capture.test.ts:188–194`
uses). `diags` is the document's whole ordered `diagnostics` array, unfiltered,
rendered `<severity> <code>: <message>`; `⏎` separates statements of one
multi-statement fixture. Blocks D and E call the exported functions directly.

### A — the boundary across annotation shapes, one initialiser (`1`)

```
@@ let x: {} | null = 1
   annotation :: "{}|null"   hasInit :: true
   diags :: ["error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated."]
@@ let x: string | null = 1
   annotation :: "string|null"   hasInit :: true
   diags :: ["error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected string | null, got integer"]
@@ let x: integer | null = 1
   annotation :: "integer|null"   hasInit :: true
   diags :: []
@@ let x: {a: integer} | null = 1
   annotation :: "{a:integer}|null"   hasInit :: true
   diags :: []
@@ let x: {} = 1
   annotation :: "{}"   hasInit :: true
   diags :: ["error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated."]
@@ let x: {a: integer} = 1
   annotation :: "{a:integer}"   hasInit :: true
   diags :: []
@@ let x: boolean | null = 1
   annotation :: "boolean|null"   hasInit :: true
   diags :: ["error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected boolean | null, got integer"]
@@ let x: {} | string = 1
   annotation :: "{}|string"   hasInit :: true
   diags :: ["error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated."]
@@ let x: string | {} = 1
   annotation :: "string|{}"   hasInit :: true
   diags :: ["error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated."]
@@ let x: array<{a: integer}> = 1
   annotation :: "array<{a:integer}>"   hasInit :: true
   diags :: ["error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected array<{a:integer}>, got integer"]
```

Six readings:

1. **`{a: integer} | null` loads with zero diagnostics.** Nothing about it is
   malformed, no other rule has anything to say, and the integer initialiser is
   not compatible with the annotation.
2. **The primitive union with the same shape refuses.** `string | null` and
   `boolean | null` draw the row; `integer | null` correctly does not, because
   TYPE-5 admits `1 ⊑ integer`. So the check is live at this position for these
   inputs and the annotation shape is the only variable.
3. **The brace arm's position in the union is irrelevant** — `{} | string` and
   `string | {}` behave identically. One deferred arm suffices, per TYPE-5's
   `sawUnknown` accumulation.
4. **Union-ness is irrelevant.** The bare inline object `{a: integer}` is
   equally silent, so the disposition is not about unions; 0095's fixture
   happened to be a union because that is where its capture defect lived.
5. **`{}`'s line is bug 0045's, not this row's.** The empty spelling draws
   `empty-schema-body` for its emptiness, at the type-grammar walk, and still
   draws no mismatch line.
6. **An `array<…>` wrapper makes the same annotation fire.** TYPE-7's arm
   (`type-compat.ts:212–218`) refuses a non-array sub before the element type
   is consulted, so the inline object's collapse is never reached. The
   `<expected>` rendering is `array<{a:integer}>`.

### B — the annotation shape, not the initialiser form, decides

Each column holds the annotation constant and varies the initialiser.

```
@@ let r: string = 1
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected string, got integer"]
@@ let r: string = true
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected string, got boolean"]
@@ let r: integer = "s"
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected integer, got string"]
@@ schema S { a: integer } ⏎ let r: string = S { a: 1 }
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected string, got S"]
@@ let r: string = [1]
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected string, got array<integer>"]

@@ let r: {a: integer} = true          diags :: []
@@ let r: {a: integer} = "s"           diags :: []
@@ let r: {a: integer} = [1]           diags :: []
@@ schema S { a: integer } ⏎ let r: {a: integer} = S { a: 1 }
                                       diags :: []
@@ let r: {a: integer} | null = "s"    diags :: []
@@ let r: {a: integer} | integer = "s" diags :: []
```

Five initialiser forms — an integer literal (block A), a boolean literal, a
string literal, an array literal and a schema constructor — draw the row under a
primitive annotation and are silent under `{a: integer}`. The row's scope clause
is about the RHS type, and these RHS types are exactly the ones the check
resolves elsewhere in the same run.

The ctor row is the TYPE-10 case in terms: `type-system.md:52` states "an
inline-object value is **not** `⊑` a named schema with the same field shape" and
the converse, and names this row as where the cross-form mismatch surfaces. Here
it does not surface.

### C — the same type, three spellings

```
@@ schema S { a: integer } ⏎ let x: S | null = 1
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected S | null, got integer"]
@@ schema S { a: integer } ⏎ let x: S = 1
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected S, got integer"]
@@ schema S { a: integer } ⏎ let x: {a: integer} | null = 1
   diags :: []
@@ schema X = {a: integer} | null ⏎ let x: X = 1
   diags :: []
@@ schema X = string | null ⏎ let x: X = 1
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected X, got integer"]
@@ let x: Nope = 1                                                    [control]
   diags :: []

@@ schema T { f: {a: integer} } ⏎ let y = T { f: 1 }
   diags :: []
@@ schema S { a: integer } ⏎ schema T { f: S } ⏎ let y = T { f: 1 }
   diags :: ["error theta/parse/object-field-type-mismatch: field 'f' on schema 'T' type mismatch: expected S, got integer"]
```

The named spelling refuses and the inline spelling admits. The alias row shows
the collapse survives TYPE-11: `collectTypeEnv` builds an alias RHS through the
same conversion (`type-layer-checks.ts:307`), so `schema X = {a: integer} | null`
unfolds to a union carrying the pseudo-name and defers, while the
primitive-armed alias refuses. The last row is the control: `Nope` is a name the
environment genuinely cannot resolve, and `type-system.md:48` is the rule that
makes it silent. The defect is that a written inline object type is treated as
that same input class.

The last pair is the sibling row: `collectSchemaFields`
(`type-layer-checks.ts:458–472`) maps a declared schema field's type through the
same conversion, so `theta/parse/object-field-type-mismatch` inherits the same
silence for an inline-object field type while the named field type fires. §Fix (f)
carries it; this report does not adjudicate that row.

### D — one layer down: the conversion and the relation

Direct calls to the two exported functions, `env = {}`, sub = the integer
literal's static type.

```
## annotationToCompatType("{}|null") = {"kind":"union","arms":[{"kind":"named","name":"{}"},{"kind":"prim","name":"null"}]}
   display :: {} | null
   checkCompatible(integer-literal, it, {}) :: unknown
## annotationToCompatType("string|null") = {"kind":"union","arms":[{"kind":"prim","name":"string"},{"kind":"prim","name":"null"}]}
   display :: string | null
   checkCompatible(integer-literal, it, {}) :: incompatible
## annotationToCompatType("integer|null") = {"kind":"union","arms":[{"kind":"prim","name":"integer"},{"kind":"prim","name":"null"}]}
   display :: integer | null
   checkCompatible(integer-literal, it, {}) :: compatible
## annotationToCompatType("{a:integer}|null") = {"kind":"union","arms":[{"kind":"named","name":"{a:integer}"},{"kind":"prim","name":"null"}]}
   display :: {a:integer} | null
   checkCompatible(integer-literal, it, {}) :: unknown
## annotationToCompatType("{a:integer}") = {"kind":"named","name":"{a:integer}"}
   display :: {a:integer}
   checkCompatible(integer-literal, it, {}) :: unknown
## annotationToCompatType("{}") = {"kind":"named","name":"{}"}
   display :: {}
   checkCompatible(integer-literal, it, {}) :: unknown
```

The conversion's output names the defect exactly: `{ kind: "named", name:
"{a:integer}" }`. `display` also shows element 2's origin — the pseudo-name is
what `<expected>` renders.

### E — the engine, handed the shapes directly

```
@@ literal integer ⊑ {a: integer} :: incompatible
@@ prim null ⊑ {a: integer} :: incompatible
@@ named UNRESOLVABLE ⊑ {a: integer} :: incompatible
@@ named UNRESOLVABLE ⊑ {a: integer} | null :: unknown
@@ {a: integer} ⊑ {a: integer} :: compatible
@@ {a: integer} ⊑ {a: number} :: compatible
@@ named UNRESOLVABLE ⊑ string :: unknown                             [control]
@@ literal integer ⊑ {} (empty field set) :: incompatible
```

Row 1 settles the question the row's *Trigger* asks: `1 ⋢ {a: integer}`, decided
statically, with no AJV involved. Rows 5 and 6 confirm TYPE-8 and TYPE-2 inside
a field. Row 3 is the ordering §Fix (b) turns on: an unresolvable `named` **sub**
against an inline-object **sup** answers `incompatible`, not `unknown`, because
TYPE-8's arm (`:219`) precedes the `sub.kind === "named"` deferral (`:267`) —
while row 4 shows the union spelling still defers, through the `null` arm. Row 7
is the control that an unresolvable name against a primitive does defer.

### F — the committed corpus fixture, and the silence controls

```
@@ tests/live/acceptance/fixtures/acc-typed-inline.theta
   diags :: []
@@ let r: { ok: boolean, label: string } = @`x`?      diags :: []
@@ let r: { ok: boolean, label: string } = 1          diags :: []
@@ let r: integer = @`x`?                             diags :: []
@@ let x: {a: integer} | null = null                  diags :: []      [control]
@@ let x: integer | null = 1                          diags :: []      [control]
@@ let x: {a: integer} = { a: 1 }
   diags :: ["error theta/parse/bare-object-literal: bare object literal not permitted in this position; name the schema (Schema { ... })"]
```

The first row is the GOV-15 exposure: H9a area (c)'s fixture is the only
committed source carrying an inline object type in a `Type` position, and it
loads clean. Row 4 shows a typed query's RHS defers even under a resolvable
annotation, which is why row 2 is silent for two reasons rather than one. The
two controls must stay silent after any fix (TYPE-5 admits both). The last row
is why §Fix (b) matters: the one expression form that could denote an inline
object value is refused at this position by
`theta/parse/bare-object-literal`.

### G — the same collapse downstream of bug 0083's recorded binding type

```
@@ let x: {a: integer} = 1 ⏎ let y = x[0]
   diags :: []
@@ schema S { a: integer } ⏎ let x: S = 1 ⏎ let y = x[0]
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected S, got integer",
             "error theta/parse/non-string-object-index: object index must be string; got integer"]
@@ let x: array<{a: integer}> = 1 ⏎ let y = x.join(",")
   diags :: ["error theta/parse/let-rhs-type-mismatch: … expected array<{a:integer}>, got integer",
             "error theta/parse/non-string-array-join: array.join requires a string element type; got array<{a:integer}>"]
@@ let mut x: {a: integer} = 1 ⏎ x = "s"
   diags :: []
@@ let mut x: integer = 1 ⏎ x = "s"
   diags :: []
```

Row 1 against row 2: the recorded declared type is the pseudo-name, so
`classifyIndexReceiver` (`type-compat.ts:366–392`) answers `"unknown"` where the
named twin answers `"object"` and the index gate fires. Row 3 is element 2's
second reachable site: `<element>` renders `{a:integer}`. Rows 4 and 5 are bug
0115's position, silent for every annotation and outside this report.

## Expected behaviour

The registry row (`docs/spec_topics/diagnostics/code-registry-parse.md:54`),
*Trigger* verbatim:

> The RHS initialiser of a typed binding `let x: T = expr` has a static type
> that is not compatible with the annotation `T` under [Type System — Type
> compatibility](../type-system.md#type-compatibility), where the RHS type is
> statically resolvable.

**The measured input falls inside it, on the row's own words.** Three clauses,
each satisfied by `let x: {} | null = 1` and by `let x: {a: integer} | null = 1`:

1. *A typed binding `let x: T = expr`.* Both are, and after bug 0095's fix both
   record the annotation and the initialiser (measured, block A: `annotation ::
   "{a:integer}|null"`, `hasInit :: true`). `grammar.md:77` gives the annotation
   slot one `Type`; `grammar.md:105` and `:109` make an `ObjectType` — and by
   `:94` a union with one — a legal inhabitant of it.
2. *A static type that is not compatible with `T` under Type compatibility.*
   TYPE-5 (`type-system.md:39`) reduces `1 ⊑ {a: integer} | null` to
   `1 ⊑ {a: integer}` or `1 ⊑ null`. TYPE-8 (`:42`) relates an inline object
   type only to another inline object type; no rule in the closed TYPE-1…TYPE-8
   list relates an `integer` to either arm, and `:44` states that rules outside
   the list are "deliberately **not** part of theta 1.0 compatibility". So
   `1 ⋢ {a: integer} | null`. The implementation agrees when it is given the
   shape: block E row 1.
3. *Where the RHS type is statically resolvable.* The RHS is the integer
   literal `1`, typed `integer` by TYPE-3 and by
   `static-type-inference.ts:203–204`. The clause governs the **RHS** type, not
   the annotation. Bug 0095's report reads it as scoping the annotation ("that
   row is scoped to a statically resolvable right-hand-side type, and an object
   union is not one" — `0095-…-destroys-context.md:810–811`, and "the row is
   scoped to a statically resolvable right-hand-side type" at `:1012`); the
   object union is `T`. Block B settles the reading
   independently: the five RHS forms that fire under a primitive annotation are
   the same RHS forms that are silent under `{a: integer}`, so no property of
   the RHS explains the difference.

**The *Trigger* is accurate and needs no widening.** The alternative reading —
that the type system genuinely cannot resolve an inline object type, making this
a spec gap about compatibility over object types — is not supported. TYPE-8
defines the relation and `type-system.md:31` states the posture: the parser
"must recognise" the structural cases "without invoking AJV", and `:29` gives
the reason, "so that compatibility failures surface as parse errors at the
offending source span rather than as runtime validation errors at a downstream
call site". `type-system.md:15` adds that "The same type grammar applies in
every type-annotation position", and `grammar.md:109` admits `ObjectType` in
any of them, so an inline object type is not an operand shape the spec leaves
undefined at the `let` annotation.

**The `type-system.md:48` carve-out does not reach this input.** Its subject is
an operand "past the parser's static view", and both its examples are values
whose type depends on something not present at parse time — "an inferred binding
whose RHS depends on a Pi-tool call whose registered schema is not visible at
parse time", and "an `invoke` against a callee that produced
`theta/load/callee-has-errors`". A written `{a: integer}` is present in the
source, in full, at the position the check reads. Its field set is exactly what
TYPE-8 needs. `let x: Nope = 1` (block C, last row) is what this carve-out
covers, and it stays silent.

**The silence is also not the deferral it claims to be**, because the net named
at the deferral site does not exist here. `type-compat.ts:412–415` defers "to
the runtime AJV safety net"; the runtime `let` arm
(`statement-executor.ts:1457–1468`) evaluates the initialiser and defines the
binding without reading `stmt.annotation`. For the typed-query initialiser the
model's response is AJV-validated against the lowered annotation, but that
validates a model response, not an arbitrary expression against the annotation
— measured, `let r: { ok: boolean, label: string } = 1` produces no diagnostic
at parse and no check at run.

On the measured inputs, therefore:

- `let x: {a: integer} | null = 1` emits one `theta/parse/let-rhs-type-mismatch`
  at the `let` statement's range, `<name>` = `x`, `<actual>` = `integer`, and
  `<expected>` rendered per `placeholder-rendering-a.md:21` —
  `{ a: integer } | null`, with ` | ` joining the arms (`:17`) and a single
  space after the field's `:` (`:21`).
- `let x: {a: integer} = 1`, `= true`, `= "s"`, `= [1]` and
  `= S { a: 1 }` each emit the row, the last by TYPE-10's cross-form rule.
- `let x: {a: integer} | null = null` and `let x: integer | null = 1` stay
  silent: TYPE-5 admits an arm in each.
- `let x: array<{a: integer}> = 1` keeps its one line and renders
  `array<{ a: integer }>`.
- `let x: Nope = 1` stays silent (`type-system.md:48`).
- Whether `let x: {} = 1` and `let x: {} | null = 1` gain a mismatch line beside
  bug 0045's `empty-schema-body` line is the one sub-case this report does not
  settle: the annotation is already refused for its emptiness, and a second `E`
  line for one written mistake is
  [0129](./0129-empty-object-field-type-draws-two-diagnostics.md)'s open
  question. §Fix (a) carries it.

## Actual behaviour / root cause

**One fallthrough carries every inline object type.**
`annotationToCompatType` (`src/parser/type-layer-checks.ts:482–504`) recognises
three shapes and defaults everything else to a nominal reference whose name is
the source text:

```ts
  if (PRIMITIVE_NAMES.has(text)) {
    return { kind: "prim", name: text as PrimitiveName };
  }
  return { kind: "named", name: text };          // :503 — the defect site
```

The function's contract states this as intended (`:474–481`): "every other shape
(a `NamedType`, an inline object type) resolves to a nominal `named` reference —
the same shape the `⊑` engine treats as deferred." The two shapes are not
equivalent, though: an unresolved `NamedType` is a name whose declaration may
sit outside the parser's view, and `type-system.md:48` covers it; an
`ObjectType` carries its whole field set in the annotation and TYPE-8 decides
it. Collapsing them makes the second inherit the first's deferral.

**The collapse survives the union split and the alias unfold.** `:488–493`
splits a top-level union and converts each arm through the same function, so
`{a: integer}|null` becomes a union whose first arm is the pseudo-name. TYPE-5's
arm (`type-compat.ts:195–208`) returns `"unknown"` when no arm is compatible and
one answered `"unknown"`, which is the whole union's answer. `collectTypeEnv`
builds an alias declaration's RHS through the same conversion
(`type-layer-checks.ts:307`), so TYPE-11's unfold reproduces the collapse for
`schema X = {a: integer} | null` (block C).

**The check then takes the deferral arm.** `checkLetRhsCompat`
(`type-compat.ts:403–442`) treats `"compatible"` and `"unknown"` alike
(`:412–415`), which is correct for the input class `type-system.md:48` describes
and wrong for this one. Nothing downstream re-asks the question: the `let` arm
pushes the checker's diagnostics and moves on (`type-layer-checks.ts:608–616`).

**No production code constructs the shape the engine needs.** `CompatType`'s
`object` arm exists and is documented against TYPE-8 (`type-compat.ts:61–64`),
`decide` implements the rule (`:219–247`), `displayType` renders it per
`placeholder-rendering-a.md:21` (`:330–331`), and `tests/type-compat.test.ts`
exercises the relation over hand-built values (`:212–235`). The only two
conversions that could mint it do not:
`annotationToCompatType` returns the pseudo-name, and `#typeExpr`
(`static-type-inference.ts:202–262`) has no `object` arm at all — a bare object
literal types as `named "object"` (`:257–258`), a ctor call as `named <Schema>`
(via `:257–258`'s `typeName`), a `call` as `named <callee>` (`:251–252`), a
`query` as `named <schema source>` (`:255–256`). So **no expression in theta
types as an inline object type**, which is the second half of the same
representation gap and the reason §Fix (b) cannot move one side alone.

**The structured type AST cannot supply the field set either.**
`type-grammar.ts:125–158` defines the `TypeNode` the 0045 walk uses; its
`object` arm carries `fieldTypes: TypeNode[]`, `interiorHasTokens` and
`braceClosed`, and no field **names** (`:379`). Both models therefore lack what
TYPE-8's exact-field-set rule reads.

**Element 2 is the same collapse on the rendering path.** `displayType`'s
`named` arm returns the name verbatim (`:324–325`), and the pseudo-name is the
token-joined annotation source — interior spaces already removed by
`parseType`'s join (block A: `annotation :: "array<{a:integer}>"`). Two sites
render it today: `<expected>` for this row when an `array<…>` wrapper makes the
check fire, and `<element>` at `theta/parse/non-string-array-join`
(`src/runtime/stdlib-array.ts:120–122`). `placeholder-rendering-a.md:21`
requires `{ a: integer }`.

**Reach of the conversion.** Five checks read it, and the same silence follows
wherever the annotation shape is an inline object type:

| consumer | row | measured today |
|---|---|---|
| `type-layer-checks.ts:601–616` (`let` arm) | `let-rhs-type-mismatch` | silent for every RHS form (blocks A, B) |
| `type-layer-checks.ts:640–643` (recorded declared type, bug 0083) | the structural gates | `x[0]` silent where the named twin fires (block G) |
| `type-layer-checks.ts:458–472` (`collectSchemaFields`) | `object-field-type-mismatch` | `schema T { f: {a: integer} }` / `T { f: 1 }` → `[]`; the named field type fires (block C) |
| `invoke-static-checks.ts:833` (callee `params:` field) | `tool-arg-type-mismatch` | deliberately env-less, so a `named` expected type defers (`:815–826`) |
| `query-schema-resolve.ts:478–479` (`checkLetMismatch`) | `@<T>`-against-annotation | both operands converted through the same function |

**Nothing in the suite scores the defect.** The four landed cells that touch
the input class assert the silence as the expected list — bug 0095's 2a and 2b
(`tests/brace-rooted-union-arm-capture.test.ts:517–557`) and bug 0045's a7 and
g3 (`tests/inline-empty-object-type.test.ts:403–413`, `:876–923`) — and a7's
comment states it as permanent: "The initialiser mismatch check is silent for
this annotation today and stays silent, so the whole list is the one line."

## Why it matters

- **A program the relation refuses loads clean, on the production parse path.**
  Measured: `let x: {a: integer} | null = 1` produces `[]` — no error, no
  warning, no note. `type-system.md:29` states the reason the parser is required
  to decide these cases without AJV: so the failure "surface[s] as parse errors
  at the offending source span rather than as runtime validation errors at a
  downstream call site". Here it surfaces nowhere.
- **The deferral's safety net does not exist at this position.** The runtime
  `let` arm never reads the annotation (`statement-executor.ts:1457–1468`), so
  for a non-query initialiser the value is bound unchecked and the declared type
  is a comment.
- **The implementation admits more through the inline spelling than through the
  named one, which inverts TYPE-10.** `type-system.md:52` makes the inline form
  strictly *less* related — "an inline-object value is **not** `⊑` a named
  schema with the same field shape" — and names this row as where the cross-form
  mismatch is reported. Measured, the inline annotation accepts every
  initialiser the named annotation rejects, including the ctor of a schema with
  the identical field list.
- **Two annotation spellings of one type get two dispositions, with no basis in
  any spec sentence.** `S | null` refuses, `{a: integer} | null` admits;
  `schema X = string | null` refuses, `schema X = {a: integer} | null` admits.
  `grammar.md:109` and `type-system.md:15` state the opposite — position and
  spelling invariance.
- **The bare inline object annotation is affected, not only 0095's union.**
  Anyone reaching for an anonymous object type at a `let` — the spelling
  QRY-22's typed queries use, and the one committed corpus source uses
  (`acc-typed-inline.theta:14`) — gets no initialiser checking at all.
- **The recorded declared type carries the same pseudo-name**, so bug 0083's
  fix delivers less at this annotation shape than at any other: measured,
  `x[0]` on an inline-object-annotated binding draws nothing where the named
  twin draws `non-string-object-index`.
- **Where the check does fire, the message is non-conformant.** `<expected>`
  and `<element>` render `{a:integer}`; `placeholder-rendering-a.md:21`
  requires `{ a: integer }`, and `:5` binds the comparison to byte identity.
  Both sites are reachable today.
- **TYPE-8 has unit coverage and no end-to-end reach.** The relation is tested
  over hand-built values (`tests/type-compat.test.ts:212–235`) and no
  production conversion ever produces its operand shape, so the rule cannot be
  observed to hold or fail on any source.

## Non-goals

- **The reassignment position.** `bindings.md:12`'s obligation on a
  reassignment's RHS is
  [0115](./0115-reassignment-type-compat-unchecked-no-registry-row.md)'s
  subject, and it is silent for every annotation shape (block G, rows 4–5). A
  fix here does not reach it, and 0115's fix does not reach the initialiser.
- **The RHS side's pseudo-`named` inference.**
  `static-type-inference.ts:242–262` types a `call`, `invoke`, `query`,
  `member`, `method-call`, `result-ctor` and bare object literal as
  unresolvable nominal references, which is why `fn f(): integer { 1 }` /
  `let r: string = f()` is silent (measured) — against a **resolvable**
  annotation, so it is independent of this defect. §Fix (b) states the coupling
  that makes the query arm a constraint on this fix; adjudicating that arm's
  own correctness is separate work.
- **`theta/parse/object-field-type-mismatch` and
  `theta/parse/tool-arg-type-mismatch`.** Both read the same conversion; the
  first is measured silent for an inline-object field type (block C's last pair,
  `schema T { f: {a: integer} }` / `T { f: 1 }` → `[]`) and the second defers on
  any `named` expected type by design (`invoke-static-checks.ts:815–826`). Their
  dispositions are named in §Fix (f) as blast radius, not adjudicated here.
- **`{}`'s own refusal.** Bug 0045 owns the empty-inline-object rule and it is
  fixed; whether an additional mismatch line is owed beside it is 0129's
  question, carried into §Fix (a) as a constraint rather than answered.
- **`parseType`'s capture.** Bug 0095 is fixed and its capture is what makes
  this input reachable. Nothing here changes what the annotation string
  contains; the leniency of that string is
  [0124](./0124-parsetype-trailing-punctuation-leniency.md)'s subject.
- **The content of `⊑`.** TYPE-1…TYPE-11 are unchanged. This report asks that
  an operand the relation already defines be presented to it; it admits no new
  pair and refuses no pair the relation admits.
- **`InferredSchema`'s object limit.** That a query at an indirect position
  under an object sink stays untyped is the documented advanced-position limit
  (`query-schema-resolve.ts:518–527`). §Fix (f) requires the two comments that
  rest on the current mis-read to be re-derived; the limit itself stands.

## Fix

**Not settled. This report pins the disposition and the constraints; the route
is not chosen here.** The disposition §Expected behaviour establishes is that
the *Trigger* already covers the input and the check owes an emission. Seven
constraints (a)–(g) bound any implementation of it, and two further constraints
follow them.

**(a) Where does the field set come from — and what happens to the malformed
interiors?** TYPE-8 reads an exact declared field set, and neither model in the
tree carries one for an inline object type: `annotationToCompatType` takes a
`string` (`type-layer-checks.ts:482`) and `TypeNode`'s `object` arm carries
field *types* without names (`type-grammar.ts:132–157`, `:379`). Two routes,
each with a cost. Parsing the brace group inside the string conversion keeps one
entry point and inherits every interior the capture admits — bug 0045's own key
enumerates them (`type-grammar.ts:141–144`: `{ a }`, `{ "a": string }`,
`{ a: }`), and `tests/inline-empty-object-type.test.ts:808–817` pins
`let x: { a } = 1` silent today, so a malformed interior must not mint a bogus
field set. Threading the structured node to the check keeps the parse in one
place but crosses a layer boundary and needs `TypeNode` to carry names. The
empty spelling `{}` is the third sub-case: measured, `literal integer ⊑ {}`
answers `incompatible`, so converting it makes `let x: {} = 1` draw a second `E`
line beside bug 0045's — the shape
[0129](./0129-empty-object-field-type-draws-two-diagnostics.md) is adjudicating,
and this fix must state whether `{}` converts or stays deferred rather than
letting the choice fall out of the code.

**(b) The annotation side cannot move alone.** Measured (block E, row 3): an
unresolvable `named` **sub** against an inline-object **sup** answers
`incompatible`, because TYPE-8's arm (`type-compat.ts:219`) precedes the
`sub.kind === "named"` deferral (`:267`). Every expression that is not a
literal, an in-scope identifier or an array literal types as an unresolvable
pseudo-`named` (`static-type-inference.ts:242–262`), and no expression types as
an inline object type at all. So minting an `object` for the annotation while
leaving the RHS side untouched turns **every** initialiser under an inline
object annotation into a refusal, including the typed query
``let r: { ok: boolean, label: string } = @`…`?`` — which is the QRY-22 surface
the annotation form exists for, and the one committed corpus source (F). The fix
must therefore either move the RHS side in the same commit (a query whose
schema is the annotation types as that shape; a ctor keeps TYPE-10's nominal
form), or reorder / guard the engine so an unresolvable sub defers against an
object sup, or scope the new emission to RHS types it can decide. Each choice
has a different observable set, and this report does not choose.

**(c) GOV-15 is engaged in the refusing direction, and the corpus exposure is
one file.** `source-language-stability.md:5` names observable (b), "ordered
diagnostic-code sequences", and this fix adds codes to programs that load
cleanly today. Measured: `tests/live/acceptance/fixtures/acc-typed-inline.theta`
parses with `[]` and is the only inline object type in a `Type` position across
the 34 tracked corpus files; it is H9a area (c)'s fixture
(`tests/live/acceptance/harness.ts:236–246`) with `noErrorExit: true` and
`permittedCodesSubset: true`. Under (b)'s naive route it refuses. Two further
GOV-15 arrivals are measured silent today and must be dispositioned explicitly
rather than discovered: `let x: {a: integer} = null` (TYPE-8 refuses a `null`
sub — block E row 2) and `let x: {a: integer} = S { a: 1 }` (TYPE-10's
cross-form rule). The blast-radius demonstration bug 0095's fix ran over the
whole corpus in both directions is the precedent to reuse
(`tests/committed-fixture-parse-gate.test.ts`, plus a walk that covers
`.thetalib`, which that gate does not —
[0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md), open, owns that
blindness; neither committed `.thetalib` carries an inline object type, so it
bounds the demonstration rather than this report's input class).

**(d) The H9a gates any newly-reachable code has to clear.**
`theta/parse/let-rhs-type-mismatch` is not on
`tests/fixtures/h7a/permitted-codes.json` (11 entries, all `theta/load/*`,
`theta/runtime/*`, `theta/host/*`), and the list is loaded and enforced at
`tests/live/acceptance/harness.ts:115–116`, `:328–336`. Admitting an entry
requires a baseline re-recorded in the bug document, not a reaction to a first
red (`:468–479` states the rule for the sibling stderr allowlist). The
empty-capture stderr gate (`assertStderrClean`, `:534–546`) scores the delivery
mechanism separately and admits zero lines. Bug 0095's fix record is the
precedent for the reasoning that a parse-phase code un-registers the caller
rather than reaching the shipped-extension stderr surface — that reasoning has
to be re-derived here against a real H9a run, because this fix can change
whether area (c)'s fixture registers at all.

**(e) DIAG-2, and which mirrors move.** On the reading §Expected behaviour
argues, the *Trigger* at `code-registry-parse.md:54` already admits the
emission, so no widening is owed and no spec edit is required to make the check
fire. If the fix instead narrows the row — declaring an inline-object annotation
outside it — that is a *Trigger* change and DIAG-2
(`diagnostic-shape.md:72`) requires the spec edit in the same commit, with the
user-facing mirrors: `docs/reference/type-system.md:49` (TYPE-8), `:59–62`
(*Unresolvable operands*), `:64–69` (TYPE-9), `:70–75` (TYPE-10).
`docs/reference/diagnostics.md:100` carries the *Message* only and no *Trigger*
column, so a *Trigger* edit does not reach it. DIAG-4 (`:74`) forbids rewording
the *Message*, and `let binding '<name>' initialiser type mismatch: expected
<expected>, got <actual>` renders correctly under every route here — element 2
is a placeholder-**rendering** correction under
`placeholder-rendering-a.md:21`, not a message reword, and no
`docs/reference/` page mirrors that rule. No new code is required and no closed
set is extended.

**(f) The four other consumers of the conversion move together or are held
deliberately.** Changing `annotationToCompatType`'s output for an `ObjectType`
changes, in one edit: `collectSchemaFields` → `object-field-type-mismatch`
(measured silent for an inline-object field type, its named twin firing);
`invoke-static-checks.ts:807–881`, whose empty-`TypeEnv` design defers on a
`named` expected type and refuses on a structurally decidable one — an `object`
is decidable, so an inline-object `params:` field type starts refusing arguments
at a `.theta`-callable call site (`theta/parse/tool-arg-type-mismatch`,
`code-registry-parse.md:115`); `query-schema-resolve.ts:470–491`
(`checkLetMismatch`), which converts both the `@<T>` ascription and the
annotation; and `compatToInferred` / `annotationToInferred` (`:518–557`), whose
`named` arm and `startsWith("{")` guard both state the current mis-read as their
reason and whose comments expire even though the outcome (the sink stays untyped,
through the `object` arm at `:551–555`) does not change. Each of the five
consumers either moves with a stated disposition or is held with a stated reason.

**(g) Bug 0083's recorded declared type, and the gates that read it by `kind`.**
The `let` arm records `unfoldAlias(annotation, env)`
(`type-layer-checks.ts:640–643`), so an inline object annotation would begin
recording an `object` instead of the pseudo-name. `:627–639` names the gates
that read the recorded `kind` directly — the `for` / `par for` iterand contract
and the `array.join` element precondition — and `classifyIndexReceiver`
(`type-compat.ts:366–392`) reads it too. Measured before-state: `x[0]` on an
inline-object-annotated binding draws `[]`, where the named twin draws
`theta/parse/non-string-object-index`. That code, and the `non-string-object-index`
/ `non-indexable-receiver` pair generally, become newly reachable at this
annotation shape. Bug 0083's landed pins do not constrain the shape
(`tests/let-annotation-recorded-binding-type.test.ts:303–321` pins the
`undefined` fallback and the declared-**name** mapping only), so the constraint
is to disposition the new reach, not to preserve a byte.

Two further constraints on any implementation:

- **The landed pins must be updated deliberately, not discovered.** Bug 0095's
  cell 2a (`tests/brace-rooted-union-arm-capture.test.ts:517–539`) pins this
  report's subject as measured, and its comment states the reasoning this
  report does not sustain:

  > MEASURED, not assumed: with the widening applied this fixture draws the
  > single inline `'{}'` line and NOTHING else. `let-rhs-type-mismatch` has no
  > subject here — the annotation is an object union, whose compatibility
  > against the integer `1` is not statically resolvable
  > (code-registry-parse.md:54 scopes the row to a resolvable RHS type), so
  > that check's disposition for this input is silence (§Non-goals leaves the
  > question to the check itself; this cell pins what it answers).

  A fix here changes cell 2a's expected list and must rewrite that comment
  rather than leave it asserting a rule that no longer holds; cell 2b
  (`:541–557`, `let x: {a: integer} | null = 1` → `diagnostics: []`) changes
  with it, and control 2c (`:559–574`) must stay byte-identical. Bug 0045's
  cell a7 (`tests/inline-empty-object-type.test.ts:403–413`) carries the same
  obligation — its comment says the check "stays silent" — as do the three
  `{}`-annotated rows of cell g3 (`:876–923`) under (a)'s decision. The same
  file's control f4 (`:808–817`, `let x: { a } = 1` → `[]`) is (a)'s
  malformed-interior boundary and must stay silent. 0095's own §Non-goals
  (`:640–644`) records the disposition as "reached for the first time rather
  than altered", so this report is the first place it is judged; a fix should
  add the discharge note to 0095 that the residual is settled.
- **Witness — offline, provider-free, plus one real H9a pass.** Every parse cell
  of §Reproduction settles inside one `parseDoc` call and blocks D and E inside
  one exported-function call, so the harness is the existing
  `tests/helpers/e2e-s1.ts` shape both witness files already use, with
  messages read from the registry through `parseRegistry` / `registryMessage`
  per DIAG-4. Required: block A's ten annotation shapes; block B's two columns,
  which are what red if a fix keys on the RHS form instead of the annotation;
  block C's named / inline / alias triple and the `Nope` control; block E's
  branch-order rows, which pin (b)'s ordering; block F's controls and the corpus
  fixture; block G's downstream pair. The `<expected>` and `<element>`
  renderings must be asserted as bytes against
  `placeholder-rendering-a.md:21`'s form. A real H9a run decides
  `permitted-codes.json` and area (c), as bug 0095's fix did for its own codes.

## Provenance

- Origin: the bug 0095 fix (0.74.0, commit `75af7646`), which reached this
  disposition and declined to settle it. Its §Non-goals
  (`0095-brace-rooted-union-arm-capture-destroys-context.md:640–644`):
  "`let x: string | null = 1` draws it today and `let x: integer | null = 1`
  does not; both are unchanged here. Once `let x: {} | null = 1` records its
  initialiser, whatever that check says about `1` against an object union is
  the check's own disposition, reached for the first time rather than altered."
  Its §Actual behaviour (`:808–811`) and its fix record's residual (i)
  (`:1009–1014`) record the measurement — the check "declines to fire" — and
  the reason, that the row "is scoped to a statically resolvable
  right-hand-side type, and an object union is not one"; residual (i) marks it
  "pinned as measured, surfaced not filed", and `.pi/tmp/fixes/0095-report.md`
  §Residuals item 2 repeats it. This report is that filing, and it adds what
  the deferral does not state: the *Trigger* clause reading (the resolvability
  clause governs the RHS, and the RHS is the integer literal); the boundary
  across annotation shapes and across initialiser forms, measured with
  controls; the named / inline / alias contrast; the conversion output and the
  relation one layer down; the engine's answer when handed the shapes directly,
  including the branch order; the absent runtime net; the second element
  (the non-conformant `<expected>` / `<element>` rendering) with its two
  reachable sites; the five consumers of the shared conversion; the corpus and
  H9a exposure; and the seven lettered §Fix constraints with the two closing
  ones.
- Spec: `docs/spec_topics/diagnostics/code-registry-parse.md:54` (the row —
  the anchor), `:53`, `:86`, `:39`, `:43`, `:46`;
  `docs/spec_topics/type-system.md:15`, `:27`, `:29`, `:31`, `:35–42` (TYPE-1…8;
  `:39` TYPE-5, `:41` TYPE-7, `:42` TYPE-8), `:44`, `:48` (*Unresolvable
  operands*), `:50` (TYPE-9), `:52` (TYPE-10), `:54` (TYPE-11);
  `docs/spec_topics/bindings.md:10`, `:12`;
  `docs/spec_topics/grammar.md:77`, `:94`, `:101`, `:105`, `:109`;
  `docs/spec_topics/schemas.md:17`;
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:5`, `:9–26`
  (category 1; `:11` the placeholder list, `:17` the union join, `:21` the
  inline-object form);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4); `docs/spec_topics/governance/source-language-stability.md:5`
  (GOV-15). User-facing mirrors: `docs/reference/diagnostics.md:100`;
  `docs/reference/type-system.md:46`, `:49`, `:59–62`, `:64–69`, `:70–75`.
- Implementation evidence at `76dfde5c`:
  `src/parser/type-layer-checks.ts:307` (the alias RHS conversion),
  `:458–472` (`collectSchemaFields`), `:474–504` (**`annotationToCompatType`**,
  the contract at `:474–481`, the union split at `:488–493`, the array arm at
  `:495–499`, the primitive arm at `:500–502`, **the defect site at `:503`**),
  `:512–529` (`splitTopLevelUnion`), `:591–643` (`walkStmt`'s `case "let"`: the
  RHS type at `:595`, the conversion at `:601–604`, the gate at `:605`, the
  check at `:608–616`, bug 0083's record at `:627–643`), `:1428–1444` (the
  `join` element gate);
  `src/parser/type-compat.ts:61–64` (`CompatType`'s `object` arm), `:139–146`
  (`checkCompatible`), `:155–172` (`unfoldAlias`), `:180–293` (`decide`:
  `:181–193` TYPE-6, `:195–208` TYPE-5, `:210–218` TYPE-7, `:219–247` TYPE-8,
  `:249–264` TYPE-10, `:266–269` the unresolvable-`named`-sub deferral),
  `:300–311` (`decidePrimitive`), `:318–333` (`displayType`; `:324–325` the
  `named` arm, `:330–331` the conformant `object` arm), `:366–392`
  (`classifyIndexReceiver`), `:403–442` (**`checkLetRhsCompat`**, the deferral
  at `:412–415`);
  `src/parser/static-type-inference.ts:197–262` (`#typeExpr`; `:203–210` the
  literal arms, `:211–216` the identifier arm, `:217–223` the array arm,
  `:242–262` the seven pseudo-`named` arms);
  `src/parser/type-grammar.ts:125–158`, `:379` (`TypeNode`'s `object` arm, no
  field names);
  `src/parser/query-schema-resolve.ts:470–491` (`checkLetMismatch`), `:518–527`
  (`annotationToInferred` and its `startsWith("{")` guard), `:530–557`
  (`compatToInferred`);
  `src/extension/invoke-static-checks.ts:807–881` (the empty-`TypeEnv` design
  and the conversion at `:833`);
  `src/runtime/stdlib-array.ts:100–123` (`checkArrayJoin`, the `<element>`
  rendering at `:120–122`);
  `src/runtime/statement-executor.ts:1457–1468` (the runtime `let` arm, which
  reads no annotation).
- Test evidence at `76dfde5c`:
  `tests/brace-rooted-union-arm-capture.test.ts:188–194` (the fixture shape),
  `:505–514` (group (2)'s header), `:517–539` (**cell 2a**, the pin this
  report judges), `:541–557` (cell 2b), `:559–574` (control 2c);
  `tests/inline-empty-object-type.test.ts:403–413` (cell a7 and its
  "stays silent" comment), `:808–817` (control f4, the malformed interior),
  `:876–923` (cell g3 and its table);
  `tests/type-compat.test.ts:45–59` (the hand-built constructors), `:212–235`
  (TYPE-8's three cells), `:331` (the cross-form cell) — the only `object`
  `CompatType` in the repo;
  `tests/let-annotation-recorded-binding-type.test.ts:303–321` (bug 0083's
  group (i) pins: the `undefined` fallback and the declared-name mapping);
  `tests/live/acceptance/fixtures/acc-typed-inline.theta:14` (the corpus
  fixture), `tests/live/acceptance/harness.ts:115–116`, `:236–246`, `:328–336`,
  `:468–479`, `:534–546` (area (c) and the two gates);
  `tests/fixtures/h7a/permitted-codes.json` (11 entries, no `theta/parse/*`);
  `tests/helpers/e2e-s1.ts:34` (`parseDeps`), `:39` (`parseDoc`) — the harness.
- Reproduction: six scratch vitest files at `76dfde5c` under a scratch config,
  seven tables in all — the annotation-shape boundary (13 cells) and the
  conversion-and-relation table over the exported functions (7 annotations) in
  one file, the initialiser-form pair of columns (13 cells), the named / inline /
  alias contrast plus the neighbouring rows (11 cells), the direct-relation table
  (8 pairs), the corpus fixture with its controls (6 cells), and the downstream
  gates (9 cells). Run on the outputs quoted above, then deleted. No file in
  `src/`, `tests/`, `docs/bugs/README.md` or any other bug document was modified
  by this filing.

## Coordination note — bug 0093 landed (0.160.0)

The other half of the QRY-4 pair this report shares with
[0093](./0093-let-annotation-query-position-double-emission.md) has shipped.
0093 §Fix (0.160.0) took its route 2: `parseLet` marks a query whose `schema`
arrived by its own direct `let x: T = @`…`` (or `?`-wrapped) propagation with
`QueryExpr.schemaFromLetAnnotation`, and `walkExpr`'s query arm withholds ONLY
its `parseTypeExpression(responseAnnotation, "value", …)` call for a marked
query. No other observable at that arm moved: the `TypePosition` stays
`"value"`, name resolution and the reserved-keyword loop keep running, the
bug-0124 / 0203 `annotation-type-not-expression` refusal is unreached for
propagated text because it gates on `ascriptionWritten === true`, and
`QueryExpr.schema` keeps its value for the lowering and typed-dispatch readers.

**The observable delta this leaves for this report.** The QRY-4
explicit-schema channel is untouched, and
`tests/annotation-nontype-text-refusal.test.ts` group (o) — which pins the
QRY-4 co-fire in BOTH directions and names 0093 and this report by number —
stayed GREEN through 0093's fix, all 251 cells of the file passing. The reason
is structural rather than incidental: group (o)'s subjects carry an explicit
`@<Schema>` ascription, so `parseLet`'s `init.schema === null` guard declines
to propagate and 0093's marker is never set on those queries. The residual that
group records — the QRY-4 check converting refused annotation source directly
rather than through the `annotation-type-not-expression` withhold — is
therefore entirely this report's to settle, and its direction remains witnessed
by the unflipped group (o) cells.

One narrowing is worth carrying into this report's route selection: the
`annotationToCompatType` conversion this report owns
(`src/parser/type-layer-checks.ts`) was not touched by 0093, and 0093's marker
lives on `QueryExpr`, not on the `let` statement, so a route here that keys on
the annotation's own source text does not collide with it. Status unchanged
(**open**).

## Fix (0.160.0)

- What shipped:
  - `src/parser/type-layer-checks.ts` — the conversion is split into a private
    `convertAnnotation(text, mintInlineObjects)`; `annotationToCompatType`
    keeps its exact behaviour (§Fix (f): the four other consumers, the
    alias-RHS site and the `fn`-param seed are HELD, each with the reason
    stated on its doc comment — the inline-object direction at those positions
    carries another bug's landed bound), and a new exported
    `letAnnotationToCompatType` mints `CompatType`'s documented `object` arm
    (TYPE-8) for a well-formed, non-empty inline object type, recursing
    through top-level union arms and `array<…>` elements. Its only call site is
    `walkStmt`'s `case "let"` annotation resolution, so the `let` annotation —
    and, through bug 0083's record, the binding type the downstream structural
    gates read — is the one position that moves. §Fix (a) is answered as a
    DECISION stated in code: an EMPTY interior (`{}`) does not convert, so
    `let x: {} = 1` keeps exactly bug 0045's single `empty-schema-body` line
    and bug 0129's open question is untouched; a malformed interior does not
    convert either (no top-level `:`, non-identifier key, duplicate key, a
    `void` atom — `void` is not a `Type`, grammar.md:89 — or a field-type tail
    that derives from no recognised `Type` shape), and every decline falls back
    to the deferring pseudo-`named`, never to a bogus field set. One
    grammar-admitted trailing comma (grammar.md:101) is stripped before the
    field split, so `{a: integer,}` and its comma-less twin get one
    disposition.
  - `src/parser/type-compat.ts` — §Fix (b) is answered by the third option it
    names: `decide`'s TYPE-8 arm gains the same sub-side deferral the TYPE-7
    array arm already carries, so an unresolvable `named` sub against an
    `object` sup answers `"unknown"`. No expression in theta types AS an inline
    object type, so without it every `call` / `invoke` / `query` /
    bare-object-literal initialiser would be refused on the sink's KIND alone —
    including the committed corpus fixture
    `tests/live/acceptance/fixtures/acc-typed-inline.theta`, which is §Fix
    (c)'s GOV-15 exposure. A RESOLVABLE `named` sub (a schema ctor) still
    refuses: TYPE-10's cross-form rule, §Expected behaviour's required row.
  - Element 2 falls out of the same edit: `displayType`'s conformant `object`
    arm is reachable for the first time, so `<expected>` renders
    `{ a: integer } | null`, `{ a: integer }` and `array<{ a: integer }>`, and
    `<element>` at `theta/parse/non-string-array-join` renders
    `array<{ a: integer }>`, per placeholder-rendering-a.md's category-1 form.
  - DIAG-2 / DIAG-4: no registry row, no *Trigger*, no `docs/spec_topics/**` or
    `docs/reference/**` file changed, and none is owed — §Fix (e)'s reading
    holds: the *Trigger* already admits this input, the fix narrows nothing,
    mints no code, extends no closed set, and element 2 is a placeholder
    **rendering** correction rather than a *Message* reword. The
    `annotation-type-not-expression` row's labelled QRY-4 exception (bug 0124
    §Fix (0.121.0)) is NOT moved: a refused annotation still refuses
    identically and still reaches this conversion the same way (measured —
    `let x: {a: !!!} = 1` is byte-identical before and after).
- Gates: witness `npx vitest run tests/let-annotation-inline-object-compat.test.ts`
  → `Test Files 1 passed (1) / Tests 51 passed (51)`; full default suite
  `npm test` → `Test Files 351 passed (351) / Tests 7035 passed (7035)`;
  `npx tsc --noEmit` → clean; `npm run lint` → clean. One full-suite run
  showed `tests/production-tools-load-resolution.test.ts` failing at
  collection — the repository's named contention class; isolated re-run
  `50 passed (50)`.
- Review: 2 rounds. Round 1 (deep) → DEFECTS (3): a junk field-type tail was
  minted anyway, so `let x: {a: integer>} = 1` refused and rendered a non-type
  (correctness); the grammar-admitted single trailing comma declined
  (fidelity); §Fix (g)'s newly-reachable gates were only partly dispositioned
  (test). All three fixed — a strict field-type recogniser, the one-comma
  strip, and six added witness cells. Round 2 (fast) → CLEAN, no
  deep-review recommendation, one disclosed non-blocking residual (the
  `|`-inside-brace shredding inherited from `splitTopLevelUnion`).
- Verification: SOLID. (1) Witness genuinely witnesses — with the two `src`
  files written back to HEAD content the witness reds `20 failed | 31 passed`
  with this bug's exact signature (silence where an emission is required, the
  `{a:integer}` rendering where the check does fire, the absent export), and
  green `51 passed` with the fix restored byte-exact (`git hash-object`
  quoted both ways). (2) Full default suite green, 351 files / 7035 tests.
  (3) Live, run for real under the lane's live lock: the H8a cell (token
  cell 80 in `tests/live/live-production-acceptance.test.ts`) is green with the
  fix and red without it, asserting on the real registration observable and the
  `theta-system-note` channel of the settled `SessionManager`; and a REAL H9a
  acceptance run (`tests/live/acceptance/**`, `Tests 11 passed (11)`) decided
  §Fix (d) rather than reacting to a first red — area (c)
  (`typed-query-inline`, the `acc-typed-inline.theta` fixture) passed with
  `noErrorExit` and `permittedCodesSubset` holding, so NO entry is owed to
  `tests/fixtures/h7a/permitted-codes.json` and the empty-capture stderr
  allowlist needed no change. (4) Lint and typecheck clean. The corpus-wide
  "no shipped source moves" claim is discharged by
  `tests/committed-fixture-parse-gate.test.ts` (`36 passed`), not by a scratch
  probe.
- Landed pins updated deliberately (the complete authorized set, premeasured
  before Phase 1; every other cell in the tree is byte-identical):
  `tests/brace-rooted-union-arm-capture.test.ts` cell 2b (`{a: integer} | null
  = 1` now draws the row) and control 4i (shape assertions byte-preserved,
  diagnostics list only), with cell 2a's comment re-derived to state §Fix (a)'s
  decision in place of the reasoning this report does not sustain (2a's
  expected list is unchanged, control 2c byte-identical);
  `tests/annotation-nontype-text-refusal.test.ts` cell g4
  (`let a: { b: integer } = 1`) and cell p2's `<expected>` bytes — group (o) is
  byte-identical, all 251 cells passing, so the QRY-4 co-fire pin did not flip
  in either direction; `tests/generic-argument-shredded-group-refusal.test.ts`
  cell d1's `<expected>` bytes, its "renders without spaces" sentence
  re-derived. Bug 0045's cells a7, g3 and control f4 and bug 0093's lock cell
  b2 (`{a: void}`) are byte-preserved BY DECISION (§Fix (a)'s declines), and
  re-asserted independently as this witness's cells e5/e6.
- Residuals:
  1. **The QRY-4 residual this report inherited from 0093 is NOT settled.**
     0093's coordination note above assigns it here — the QRY-4 check
     (`query-schema-resolve.ts`'s `checkLetMismatch`) converting refused
     annotation source directly rather than through the
     `annotation-type-not-expression` withhold. This route HOLDS
     `query-schema-resolve` on the unchanged conversion (§Fix (f)), so that
     residual survives untouched, witnessed by the unflipped group (o) cells.
     The QRY-4 pair's shared *Trigger* exception is therefore **not fully
     discharged**: 0093 closed the double-emission half and this fix closes the
     `⊑`-refuses-but-loads half, while the withhold-routing question stays
     open for a follow-up report.
  2. **The four held consumers keep the old silence** (§Fix (f), each with its
     reason in code): `theta/parse/object-field-type-mismatch` for an
     inline-object FIELD type, `theta/parse/tool-arg-type-mismatch` for an
     inline-object `params:` field type, and both `query-schema-resolve`
     readers. Pinned: witness cell c3 records that
     `schema X = {a: integer} | null` (the alias-RHS site) still defers, with
     the reason, so a later widening reds there deliberately.
  3. **A `|` inside a brace group still shreds.** `splitTopLevelUnion` tracks
     `<…>` depth only, so `let x: {a: integer|null} = 1` splits before the
     conversion is reached and stays deferred (status quo). Widening the
     shared splitter would move `../runtime/tool-call.ts`'s RFC-0002
     disjointness computation with it, which is separate work.
  4. **Grammar-admitted spellings the strict interior parser declines**, all in
     the SAFE direction (status-quo silence, never a wrong refusal): a quoted
     key (`{"a": string}`), an `as "WireName"` rename, a generic application in
     a field type (`Result<A, B>`). Each is measured and pinned silent.
  5. **New reach at the gates §Fix (g) names**, dispositioned rather than
     discovered, and each pinned with its pre-fix baseline: `x[0]` on an
     inline-object-annotated binding now draws
     `theta/parse/non-string-object-index` (matching the named twin);
     `theta/parse/non-array-iterand` renders `got { a: integer }` where it
     rendered the pseudo-name; `let z = [o, 1]` draws
     `theta/parse/array-no-common-type`; `let x: array<{a: integer}> = [1]`
     draws the ordered pair `let-rhs-type-mismatch` +
     `array-element-type-mismatch`; and `let mut x: {a: integer} = 1` / `x =
     "s"` draws `theta/parse/reassign-rhs-type-mismatch` — which also corrects
     §Reproduction block G rows 4–5: those were measured at 0.74.0 before bug
     0115 landed an emitter and a registry row, and are stale.
  6. **Stale `path:line` citations elsewhere.** This diff inserts lines into
     `src/parser/type-layer-checks.ts` and `src/parser/type-compat.ts`, so
     citations into those files from documents and witnesses this fix did not
     touch now point one shift late. Deliberately not chased (the citation-sweep
     class), and every such citation in this repository is written in the
     "at HEAD `<hash>`" convention pinned to its own commit.
- Discharge notes appended:
  `docs/bugs/0095-brace-rooted-union-arm-capture-destroys-context.md` —
  residual (i) is settled (the check's disposition at an object-union `let`
  annotation is an emission, not silence).
- Pinned dispositions / non-goals: `{}` stays deferred (bug 0129's question
  left open); the reassignment position is bug 0115's and is only reached here
  as new-reach blast radius; the RHS side's pseudo-`named` inference
  (`static-type-inference.ts`) is unchanged — R3's deferral is what makes that
  safe; TYPE-1…TYPE-11's content is unchanged, an operand the relation already
  defines is merely presented to it.

## Coordination note — bug 0222 landed (0.166.0)

§Fix (0.160.0) *Residuals* item 1 held this route on the unchanged conversion
and stated the disposition: the QRY-4 pair's shared *Trigger* exception is
"not fully discharged … while the withhold-routing question stays open for a
follow-up report". That report is
[0222](./0222-qry4-let-mismatch-reads-refused-annotation.md), fixed at 0.166.0,
and the exception is now discharged: `checkLetMismatch` consults
`annotationSourceIsNotTypeExpression` and returns before either conversion
runs, so the refusal fires alone at that site, and
`theta/parse/annotation-type-not-expression`'s *Trigger* loses the exception
paragraph naming this report and 0093 in the same commit. Item 1 stands as
written at 0.160.0 — the hold it records was deliberate and remains the
accurate account of what this route did.

This fix's own boundary is undisturbed, and 0222 verified it rather than
assuming it. `letAnnotationToCompatType` and `annotationToCompatType` are
byte-identical in body; the only edit to `src/parser/type-layer-checks.ts` is
one bullet of `annotationToCompatType`'s doc comment, recording that the
`checkLetMismatch` consumer is now gated by the recogniser and still reads
this unwidened conversion — so the five-consumer hold is not narrowed, and
*Residuals* item 2's four remaining held consumers keep the old silence.
`tests/let-annotation-inline-object-compat.test.ts` is byte-identical and all
51 cells pass, cell `c3` included, verified by `git hash-object` against the
fix baseline. Status unchanged (**fixed (0.160.0)**).

### Coordination note — bug 0262's reference-position widening (2026-08-24)

Bug [0262](./0262-unresolved-named-type-silent-at-nine-reference-positions.md)
widens `theta/parse/unresolved-named-type` to the `let` annotation, the `fn`
parameter type, the `fn` return type and the `invoke<T>` ascription. One cell of
this report's witness moves.

**What changed.** `tests/let-annotation-inline-object-compat.test.ts`, cell
`c5` (`it("c5 CONTROL: …")` at line 504 of that file). Old expectation: `[]` —
`let x: Nope = 1` loaded with zero diagnostics, and the cell asserted that
silence as `type-system.md`'s *Unresolvable operands* carve-out working. New
expectation, at line 530 of that file:
`[line("error", UNRESOLVED_NAME, [["<name>", "Nope"]])]`, with
`UNRESOLVED_NAME = "theta/parse/unresolved-named-type"` declared at line 188 of
the same file — the rendered line
`error theta/parse/unresolved-named-type: unresolved named type 'Nope'`, taken
from the live registry template through the file's own `line` helper (line 157),
so a DIAG-4 drift reds here. The cell's source, `let x: Nope = 1`, is
unchanged; the title and its comment now state the refusal. No other cell and no
other byte of the file moves: the diff against HEAD is the one `const` and the
one cell.

**Why.** The operator ruling (sixteenth set), clause (i), names this cell:

> subject-adjacent cells — 0130's let-silence row, 0045's invoke<T> no-name-walk
> control, 0127's three oracle cells, 0089's b12/b13 … — FLIP old→new under this
> ruling, each with a dated coordination note appended to the owning bug doc

and gives the ground:

> a provably-unresolvable WRITTEN name is a provable author error and is judged
> at the position it is written; a type merely withheld / past the parser's
> static view keeps the deferring disposition everywhere it holds today.

**This report's subject is unchanged.** The subject is
`theta/parse/let-rhs-type-mismatch` declining an object or union right-hand side
at a `let` annotation, because `annotationToCompatType` converts an inline object
type to an unresolvable pseudo-`named`. `c5` was never that subject: it fenced
the difference between a written `{a: integer}` and an unresolvable written
NAME. The fence still stands, with the name's side now carrying a refusal of its
own. Cells `c1`–`c4` — the named spelling refusing (line 464), the inline
spelling refusing (line 471), the alias residual staying silent (line 478) and
the primitive-armed alias refusing (line 495), all in
`tests/let-annotation-inline-object-compat.test.ts` — are byte-identical to
HEAD. The widening changes the INPUT CLASS that reaches this report's gate, by
refusing the annotation upstream at the position it is written; it moves neither
this report's *Trigger* nor its verdict for any inline-object or union
annotation.

**Measured.** `npx vitest run
tests/let-annotation-inline-object-compat.test.ts` at the current tree: 51 of 51
cells pass, `c5` included. Status unchanged (**fixed (0.160.0)**).
