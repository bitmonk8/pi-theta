# Bug 0140 — `collectIdentRoots` folds every declared `schema` / `enum` name into the identifier root scope (`theta-document.ts:4611–4614`), so a bare schema reference at a value position resolves for the parse gate and for nothing else: `let out = g(P)` draws no `theta/parse/unknown-identifier` against a four-arm resolution list that names no declaration form, the theta registers, and the runtime's own resolver (`lexical-environment.ts:405`) answers `unresolved` and hands the position `null` — measured as `1` returned out of a `string`-annotated parameter, `"nullx"` out of a `string`-annotated return, and a `theta/runtime/null-member-access` panic on the first field read

- **Status:** fixed (0.122.0). §Fix's two open questions are adjudicated in
  §Fix (0.122.0) below: the code identity is a minted sibling of
  `theta/parse/function-as-value` (`theta/parse/type-as-value`), and the spec
  silence is closed on `expressions.md` §Identifier resolution. The route's
  emission site moved within route (a)(2) — to the identifier-resolution walk
  itself rather than the structural walk — on measured evidence; the §Fix
  record states it.
- **Sev/Diff estimate:** S1/D3 — a theta naming no value at a value position
  loads cleanly, registers, and runs, and the runtime substitutes `null`
  silently (measured: `1` returned out of a `string`-annotated parameter,
  `"nullx"` and `"v=null"` out of `string`-annotated returns, `null` bound by a
  `let mut` reassign), with the first field read on that `null` aborting the
  theta at `theta/runtime/null-member-access`; D3 because §Fix must choose
  between reusing a registered code and minting one under DIAG-2, must close
  the spec silence in the same commit, and must preserve the two positions the
  same walk licenses through the same root set (`Enum.Variant`'s receiver at
  `theta-document.ts:4836–4839`, and the whole-file type-name universe the
  structural walk reads).
- **Kind:** two elements, carrying different standing.
  1. **Missing diagnostic — defect against
     `docs/spec_topics/expressions.md:44–51` read with
     `docs/spec_topics/diagnostics/code-registry-parse.md:61`.** The registered
     *Trigger* is "Bare identifier in call or value position resolves to
     nothing in scope", and its *Rule* link is
     [Expressions — Identifier resolution], whose resolution list has exactly
     four arms (`:46–49`) — a local `let` / parameter, a top-level `fn`, an
     imported symbol, a callable-set name. A `schema` or `enum` declaration is
     none of them. `collectIdentRoots` (`src/parser/theta-document.ts:4604–4641`)
     adds both as a fifth source (`:4611–4614`), so `emitUnknownIdentifier`'s
     scope test (`:4697`) passes and the code is never emitted.
     `docs/spec_topics/imports.md:50` states the code's reach in terms —
     `theta/parse/unknown-identifier` "is scoped to bare identifiers in
     expression position" — so the value position is inside the registered
     row's own scope, not outside it.
  2. **Spec silence — no sentence assigns a bare schema or enum name a meaning
     at expression position.** `expressions.md`'s supported-forms list admits a
     schema name only inside the constructor form (`:21`, "Schema constructors:
     `Schema { field: expr, ... }`") and an enum name only inside variant access
     (`:22`, "Enum variant access: `Enum.Variant`"). `:8` lists "Identifiers
     (variables, parameters, function names, schema **constructors**)" — the
     parenthetical is not a licence, because "function names" appears in it and
     a function name outside call position is
     `theta/parse/function-as-value` (`docs/spec_topics/functions.md:20`).
     `docs/spec_topics/schemas.md:3` states what a `schema` introduces — "a
     named type" — and `:97` assigns `Enum.Variant` a static type while saying
     nothing about a bare `Enum`. **No page states the static type or the
     runtime value of a bare schema / enum reference**, and closing that
     silence is part of this report's deliverable.
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the filing origin. Its fix report residual 6 records
    this measurement in one sentence ("A bare schema reference at a value
    position draws no `theta/parse/unknown-identifier`. `let out = g(P)` with
    only `schema P` declared loads clean — `checkUnknownIdentifiers` folds
    declared `schema` names into its root scope. Measured."), created no bug
    document, and left the runtime half unmeasured. **0050 does not own this
    defect and its fix does not reach it.** 0050 wired
    `theta/parse/fn-arg-type-mismatch`'s caller; its witness cell u9d
    (`tests/fn-arg-type-mismatch-wired.test.ts:1656–1676`, fixture `:737`)
    deliberately **withholds** on this read, on the ground stated at
    `:1673–1674`: "a schema name at a value position is not a value of that
    schema; the minted read is the identifier's spelling and proves nothing
    about what the position holds". That cell asserts the absence of
    `fn-arg-type-mismatch` only (`expectNoFnArgMismatch`, `:652–657`), so the
    argument-type judgement is settled and the unknown-identifier question is
    not. The u9d comment routes this question to bug 0051; **that routing names
    a report with a different subject** — see the 0051 entry below.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, and **not the owner of this defect**. Its subject is the *case
    rule* at `NamedType` **type**-reference positions: whether a lowercase head
    (`let a: nope = 3`) should draw `theta/parse/schema-case-mismatch` at any of
    sixteen probed positions. Every position it probes is a type position; this
    report's position is an expression position, its name is PascalCase and
    correctly declared, and no case rule is engaged. The two do not overlap and
    neither fix reaches the other.
  - [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
    — **fixed (0.48.0)**, the `TypeEnv`-prototype-hazard family, and the reason
    group (c) below reports what it does. Its fix null-prototyped the record and
    own-key-guarded `resolveNamed`, so a `named` whose name matches a
    declaration resolves through the author's declaration and nothing else.
    Here the fabricated read is `named "P"` and a `schema P` **is** declared, so
    the resolution is a hit and the type layer judges the value position against
    the schema's own type — measured as `got P` in four registered messages
    (c1–c4) and as an `"object"` receiver classification in c6. 0038's class is
    the mint; this report's subject is that the identifier reaches the mint at
    all.
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **open**, the same substrate one arm over.
    `#typeExpr`'s `ident` arm answers
    `bindings.get(node.name) ?? { kind: "named", name: node.name }`
    (`src/parser/static-type-inference.ts:211–216`), which is what makes group
    (c)'s messages say `P`. **Neither fix reaches the other**: 0136 changes what
    the `member` arm returns; this report changes whether the identifier is
    admitted by the unknown-identifier walk, which runs in a different pass
    (`theta-document.ts:857`) and reads no `TypeEnv`. A fix here removes group
    (c)'s inputs by refusing them earlier; a fix there leaves them untouched.
  - [0126](./0126-plain-for-binds-no-loop-variable.md) — **open**, the same
    `ident` arm reached through a missing binder rather than a declaration
    name. Cited for the arm, not as a dependency.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
    and binding on §Fix (d): the committed-fixture parse gate filters `.theta`
    only, so the corpus sweep in §Reproduction (f) was run from a scratch probe
    over `git ls-files -- '*.theta' '*.thetalib'` rather than from the gate.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The defect site** — `src/parser/theta-document.ts:4604–4641`,
    `collectIdentRoots`. The fold is `:4611–4614`:

    ```ts
    case "fn":
    case "schema":
    case "enum":
      roots.add(s.name);
      break;
    ```

    One `switch` arm covers three declaration kinds. Its header comment
    (`:4597–4603`) states the intent — "every name visible everywhere in the
    body regardless of source order — hoisted top-level `fn` names, `schema` /
    `enum` names, imported symbols, `params:` field names, resolved `tools:`
    callable names, and the stdlib builtins" — and `checkUnknownIdentifiers`'s
    own doc comment repeats it (`:4671–4672`: "not a `params:` field, `let`
    binding, `fn`, imported name, `schema` / `enum`, resolved `tools:`
    callable, or builtin"). The extra source is deliberate in the
    implementation and absent from the four-arm list it cites at `:4669`.
  - `src/parser/theta-document.ts:4680–4688` — `checkUnknownIdentifiers`;
    `:4690–4707` — `emitUnknownIdentifier`, whose whole test is
    `name.length === 0 || name === "_" || scope.has(name)` (`:4697`);
    `:851–861` — the call site, whose comment names REQ-EXPR-7 and
    `expressions.md` §"Identifier resolution".
  - `src/parser/theta-document.ts:4800–4810` — `walkIdentExpr`; `case "ident"`
    (`:4808–4810`) is the value-position site this report reports, `case "call"`
    (`:4811–4813`) the call-position site group (d) measures.
  - **The two positions the same root set licenses**, which any fix preserves —
    `:4836–4839`, `case "member"`: "The receiver is an identifier-resolution
    site; the `.field` name is not", so the head of `Enum.Variant` is checked
    through this walk and needs the enum name in scope (b3); and `:4840–4843`,
    `case "index"`. The constructor head is **not** an identifier site
    (`:4677–4678`), so `P { a: 1 }` does not depend on the fold (b2).
  - **The precedent one `switch` arm away** —
    `src/parser/theta-document.ts:6377–6387`, the structural walk's
    `case "ident"`. It tests `refs.fnNames.has(e.name)` (`:6378`) and emits
    through `checkFunctionReference` (`:6381–6384`,
    `src/parser/functions.ts:107–122`), which is how a bare `fn` name at a value
    position draws `theta/parse/function-as-value` (b1). `StructuralRefs`
    already carries the schema and enum sets in the same object, built beside
    `fnNames` in `checkStructural` — `fnNames` `:5671`, `enums` `:5675`,
    `schemas` `:5678`, the whole-file `typeNames` universe `:5691–5695`,
    assembled at `:5696`. No arm tests any of them at this position.
  - **The static read the type layer then makes** —
    `src/parser/static-type-inference.ts:211–216`, `#typeExpr`'s `ident` arm:
    `bindings.get(node.name) ?? { kind: "named", name: node.name }`. For a bare
    `P` the map holds nothing, so the read is `named "P"`, which resolves
    against the `TypeEnv` to the author's own `schema P` — the cause of group
    (c)'s four messages and its `"object"` receiver classification.
  - **The runtime resolver, which implements the four-arm list and only it** —
    `src/runtime/lexical-environment.ts:376–406`. Its header comment names the
    order ("local > `fn` > import > callable"), the arms are `:381–387`,
    `:389–393`, `:394–400`, `:401–404`, and the fall-through is `:405`,
    `return { arm: "unresolved" }`. A `schema` / `enum` name reaches no arm:
    declarations are registered on a separate surface read by `resolveSchema`
    (`:517`) and `resolveEnumVariant` (`:526`).
  - **The value the runtime substitutes** —
    `src/extension/production-theta-producer.ts:5803–5805`, the pure host's
    `ident` arm:
    `return resolution.arm === "local" ? resolution.value ?? null : null;`.
    Its doc comment (`:5786–5793`) states the disposition for the other arms:
    "a bare `fn` / callable name, or an unresolved name … has no first-class
    readable value and yields `null` (the expressions.md runtime safety net)
    rather than throwing out of the executor". The host is wired into every
    execute-deps construction — `:1465`, `:1729`, `:2246`.
  - `src/runtime/statement-executor.ts:766` — the executor's fall-through
    `deps.host.evaluatePure(expr, env)` for a non-checkpointed pure node, which
    is the only path an `ident` takes (`evalExpr`, `:609`, has no `ident` arm);
    `:395–435` — `evalUserFnCall`, which evaluates each argument through
    `evalExpr` (`:412`) and binds it positionally (`:416`), so the `null`
    reaches the parameter slot with no further test.
  - `src/runtime/runtime-panics.ts:331–340` — `evaluateMemberAccess`; `:332–334`
    raises `NullMemberAccessPanic` on a `null` target, which is the disposition
    `docs/spec_topics/errors-and-results/error-model.md:69` registers and `:82`
    gives the message for. This is what turns the substituted `null` into an
    abort at the first field read (e4, e5).
  - `src/runtime/statement-executor.ts:926–940` — `applyStdlibMethod`; the
    fall-through `return null` (`:939`) is why `P.keys()` answers `null` rather
    than panicking (e10).
  - `src/extension/production-composition.ts:2045–2052` — `hasLoadParseError`.
    Every row of groups (a), (b2)–(b5), (c7)–(c10), (d) and (e) carries no
    `error`-severity diagnostic at all, so registration is not denied and the
    theta runs. This is what makes the exposure a load hazard rather than a
    diagnostic-correctness question.
  - `docs/spec_topics/expressions.md:42` — the §Identifier resolution heading;
    `:44` — "A bare identifier in call position (`name(args)`) resolves in this
    order, first match wins"; `:46–49` — the four arms; `:51` — "No match is
    `theta/parse/unknown-identifier`"; `:53` — the `shadowed-callable-call`
    rule, the one further sentence the section states. `:8` — the
    supported-forms identifier bullet; `:21` — schema constructors; `:22` —
    enum variant access; `:25–27` — the §Not supported header and its
    `theta/parse/unsupported-feature` default.
  - `docs/spec_topics/imports.md:50` — "This error is distinct from
    `theta/parse/unknown-identifier`, which is scoped to bare identifiers in
    expression position". The one sentence that states the code's reach beyond
    the call position `:44` names.
  - `docs/spec_topics/schemas.md:3` — "A `schema` declaration introduces a named
    type."; `:97` — the `Enum.Variant` static-type sentence.
    `docs/spec_topics/functions.md:20` — FN-1: "closures and first-class
    function values are not part of theta 1.0, so function names appear only in
    call position. A function name used as a value (bound to `let`, passed as an
    argument) surfaces as `theta/parse/function-as-value`."
  - `docs/spec_topics/diagnostics/code-registry-parse.md:61` — the
    `theta/parse/unknown-identifier` row (`E`, *Trigger* "Bare identifier in
    call or value position resolves to nothing in scope", *Rule*
    [Expressions — Identifier resolution], *Message* `unknown identifier
    '<name>'`); `:83` — the `theta/parse/function-as-value` row (`E`, *Trigger*
    "Function name used outside call position (bound to `let`, passed as
    argument, etc.)"). The five rows group (c) fires: `:36`
    (`mixed-plus-operands`), `:39` (`non-string-object-index`), `:54`
    (`let-rhs-type-mismatch`), `:63` (`unknown-method`), `:64`
    (`non-array-iterand`); `:89` (`unknown-variant`), the b4 control. Mirrors
    without a *Trigger* column: `docs/reference/diagnostics.md:107`, `:132`.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; a code addition or trigger change is a spec change landing in the
    same commit); `:74` — DIAG-4 (the *Message* column is normative).
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15; `:9`
    — the loads-cleanly predicate; `:25` — the diagnostic-registry carve-out,
    which dispositions a trigger change "as an addition for inputs newly brought
    into the code's emission set".
  - **Existing coverage: the silence is pinned in one direction only.**
    `tests/fn-arg-type-mismatch-wired.test.ts:1656–1676` (cell u9d) asserts that
    the fixture at `:737` draws no `theta/parse/fn-arg-type-mismatch`; its group
    comment (`:1546–1579`) states at `:1576–1578` that "none of them draws any
    other diagnostic at this HEAD — each loaded cleanly before the guard". No
    assertion in that file, or anywhere else, names
    `theta/parse/unknown-identifier` for this input.
    `tests/e2e-s1-expr-diagnostics.test.ts:16–23` covers REQ-EXPR-7 for a free
    lowercase name (`let x = missing_binding`) and reaches no declaration name.
    **No test covers a bare schema or enum reference at a value position**, and
    none covers the runtime disposition of one.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. Parse rows through the shipped `parseThetaDocument` with
  frontmatter `---\nmode: prompt\n---\n` prepended; runtime rows through
  `parseThetaDocument` → `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`, the harness shape
  `tests/non-object-receiver-gate.test.ts:198–292` establishes, with a throw
  framed through `surfaceUnexpectedThrow`. One scratch vitest file plus its own
  config under a gitignored directory, run on the outputs quoted below, then
  deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.

## Summary

`checkUnknownIdentifiers` resolves each identifier the walk reaches against a
scope seeded by `collectIdentRoots`, and that seed folds every top-level
`schema` and `enum` name into the value namespace
(`src/parser/theta-document.ts:4611–4614`). `expressions.md:46–49` lists four
resolution arms and names no declaration form; the runtime's resolver
implements those four arms exactly and answers `{ arm: "unresolved" }` for a
schema name (`src/runtime/lexical-environment.ts:405`). The name therefore
resolves for the parse gate and for nothing else.

Measured: `schema P { a: number }` + `fn g(s: string): number { 1 }` +
`let out = g(P)` reports `[]` — no diagnostic of any severity. The control with
an undeclared `Q` in the same position reports
`theta/parse/unknown-identifier: unknown identifier 'Q'`. The same silence
holds at every value position probed: a `let` RHS, a tail expression, a
`let mut` reassign, an array element, a `fn` return, an `==` operand, and an
argument. A bare `enum` name and a bare alias-schema name behave identically.

**The theta registers and runs.** Nothing in the group carries an
`error`-severity diagnostic, so `hasLoadParseError`
(`src/extension/production-composition.ts:2045–2052`) has nothing to act on.
The pure host substitutes `null` for any non-`local` resolution arm
(`src/extension/production-theta-producer.ts:5803–5805`), and the executor
binds it positionally with no further test
(`src/runtime/statement-executor.ts:416`). Measured outcomes: `g(P)` against
`s: string` returns `1` with `s` bound to `null`; `fn g3(s: string): string { s
+ "x" }` called as `g3(P)` returns `"nullx"`; `"v=" + s` returns `"v=null"`;
`let out = P` binds `null`; `let mut z = 1` + `z = P` rebinds `z` to `null`.
Where the callee reads a field, the theta aborts:
`fn g(x: Q): string { x.b }` called as `g(P)` raises
`theta/runtime/null-member-access` (`null member access: .b`), the disposition
`error-model.md:69` registers for a `null` receiver.

**A bare `fn` name in the same position is refused.** `fn h(): number { 1 }` +
`let out = h` draws `theta/parse/function-as-value`, emitted from the structural
walk's `case "ident"` arm one file over
(`theta-document.ts:6377–6387`), which tests `refs.fnNames` and no other
declaration set. FN-1 (`functions.md:20`) is the sentence behind it. There is no
corresponding sentence for a schema name, and no corresponding test.

**The type layer does judge the read, against the schema's own declaration.**
`#typeExpr`'s `ident` arm mints `named "P"`
(`static-type-inference.ts:211–216`), which resolves to the author's `schema P`,
so four registered messages report the schema name where a value was expected —
`let binding 'out' initialiser type mismatch: expected string, got P`,
`'+' has mixed operand types: P and integer`,
`unknown method 'frobnicate' on type P`,
`'for' expects array<T> after 'in'; got P` — and `P[0]` draws
`theta/parse/non-string-object-index`, which fires only for an **object-value**
receiver. Each of those messages is emitted about an expression that holds no
value at all.

**The spec does not say what a bare schema name is at expression position.**
`expressions.md`'s supported-forms list admits a schema name inside `Schema { …
}` (`:21`) and an enum name inside `Enum.Variant` (`:22`), and nowhere else;
`schemas.md:3` calls a `schema` declaration a named **type**. No page assigns
the bare reference a static type or a runtime value. What is written is the
registry *Trigger* (`code-registry-parse.md:61`, "call or value position …
resolves to nothing in scope"), its four-arm *Rule* (`expressions.md:46–49`),
and the scope sentence at `imports.md:50` — three lines that together place this
input inside `theta/parse/unknown-identifier`'s registered reach.

## Reproduction

Offline, at `3efdb4ac`. Parse rows: the shipped `parseThetaDocument`, with
`---\nmode: prompt\n---\n` prepended and a trailing final value supplied.
`codes` is the whole aggregated `diagnostics` code list, unfiltered. Runtime
rows: the production executor harness named in §Observed at.

### (a) The reported shape, and its control

```
@@ a1  schema P { a: number } / fn g(s: string): number { 1 } / let out = g(P) / out
   codes :: []
@@ a2  [control] the same with an UNDECLARED Q in the argument position
   codes :: ["theta/parse/unknown-identifier"]
   msgs  :: ["unknown identifier 'Q'"]
@@ a3  schema P { a: number } / let out = P / out
   codes :: []
@@ a4  [control] let out = Zzz / out
   codes :: ["theta/parse/unknown-identifier"]
   msgs  :: ["unknown identifier 'Zzz'"]
@@ a5  enum C { Red, Blue } / let out = C / out
   codes :: []
@@ a6  schema L = string / let out = L / out
   codes :: []
@@ a7  schema P { a: number } / P                                  [tail position]
   codes :: []
@@ a8  schema P { a: number } / let mut z = 1 / z = P / z          [reassign]
   codes :: []
@@ a9  schema P { a: number } / let out = [P] / out                [array element]
   codes :: []
@@ a10 schema P { a: number } / fn f(): number { P } / let out = f() / out
   codes :: []
@@ a11 schema P { a: number } / let out = P == 1 / out             [== operand]
   codes :: []
```

a1 and a2 differ by one character in the argument and by whether the name is
declared. The declared one is the silent one. a3/a4 show the same pair with no
call involved. a5 and a6 extend it to the other two declaration forms the same
`switch` arm folds. a7–a11 are five further value positions, all silent.

### (b) The contrast: a `fn` name is refused, and the licensed positions work

```
@@ b1  fn h(): number { 1 } / let out = h / out
   codes :: ["theta/parse/function-as-value"]
   msgs  :: ["function 'h' used outside call position; functions are not first-class in theta 1.0"]
@@ b2  schema P { a: number } / let out = P { a: 1 } / out         [constructor]
   codes :: []
@@ b3  enum C { Red } / let out = C.Red / out                      [variant access]
   codes :: []
@@ b4  enum C { Red } / let out = C.Blue / out                     [control]
   codes :: ["theta/parse/unknown-variant"]
   msgs  :: ["unknown variant 'Blue' on enum 'C'"]
@@ b5  schema P { a: number } / fn f(x: P): number { x.a } / let p = P { a: 1 } / let out = f(p) / out
   codes :: []
```

b1 is the same syntactic position as a3 with a `fn` name instead of a schema
name, and it draws a registered code. b2, b3 and b5 are the positions a fix must
leave silent: the constructor head (not an identifier-resolution site,
`theta-document.ts:4677–4678`), the `Enum.Variant` receiver (an
identifier-resolution site, `:4836–4839`, so it depends on the fold), and an
ordinary type annotation. b4 shows the variant checker is unaffected and answers
correctly.

### (c) The read the type layer makes of the silent identifier

```
@@ c1  schema P { a: array<string> } / for y in P { y } / 1
   codes :: ["theta/parse/non-array-iterand"]
   msgs  :: ["'for' expects array<T> after 'in'; got P"]
@@ c2  schema P { a: number } / let out: string = P / out
   codes :: ["theta/parse/let-rhs-type-mismatch"]
   msgs  :: ["let binding 'out' initialiser type mismatch: expected string, got P"]
@@ c3  schema P { a: number } / let out = P + 1 / out
   codes :: ["theta/parse/mixed-plus-operands"]
   msgs  :: ["'+' has mixed operand types: P and integer"]
@@ c4  schema P { a: number } / let out = "x" + P / out
   codes :: ["theta/parse/mixed-plus-operands"]
   msgs  :: ["'+' has mixed operand types: string and P"]
@@ c5  schema P { a: number } / let out = P.frobnicate() / out
   codes :: ["theta/parse/unknown-method"]
   msgs  :: ["unknown method 'frobnicate' on type P"]
@@ c6  schema P { a: number } / let out = P[0] / out
   codes :: ["theta/parse/non-string-object-index"]
   msgs  :: ["object index must be string; got integer"]
@@ c7  schema P { a: number } / let out = P.a / out
   codes :: []
@@ c8  schema P { a: number } / let out = P["a"] / out
   codes :: []
@@ c9  schema P { a: number } / schema Q { b: string } / fn g(x: Q): number { 1 } / let out = g(P) / out
   codes :: []
@@ c10 schema P { a: number } / fn g2(s: P): number { 1 } / let out = g2(P) / out
   codes :: []
```

Every message in c1–c5 names the schema. c6 is the sharpest of the six: the
receiver classification that produces `non-string-object-index` fires only for
an **object-value** receiver (`code-registry-parse.md:39`), so the check has
concluded that `P` holds an object. c7 and c8 read a declared field off it and
report nothing — the parse-clean route into e4's runtime abort.

c9 is bug 0050's committed cell u9d verbatim
(`tests/fn-arg-type-mismatch-wired.test.ts:737`). Its `[]` is the withholding
0050 landed: the read is `named "P"` and the parameter is annotated `Q`, so a
mismatch emission would assert that the argument **is** a `P` value, which no
phase established. c10 is the same shape with the parameter annotated `P`;
it is silent for the same reason. Both are argument-type judgements and neither
is the missing code this report claims.

### (d) The call position, where the four-arm list is the written rule

```
@@ d1  schema P { a: number } / let out = P() / out
   codes :: []
@@ d2  enum C { Red } / let out = C() / out
   codes :: []
```

`expressions.md:44` scopes its four arms to "a bare identifier in call position
(`name(args)`)", and `:51` states the disposition for no match. A `schema`
declaration matches no arm, so d1 is the position where the resolution list is
written and the implementation still admits the name — `walkIdentExpr`'s
`case "call"` (`theta-document.ts:4811–4813`) resolves the callee against the
same folded root scope. e9 below records what the runtime does with it.

### (e) The runtime — what the silence reaches

`parse` is the pass's code list; `run` is `executeBody`'s outcome, or the
diagnostic a throw carries.

```
@@ e1  schema P { a: number } / fn g(s: string): number { 1 } / let out = g(P) / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":1}
@@ e2  schema P { a: number } / let out = P / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":null}
@@ e3  schema P { a: number } / fn g3(s: string): string { s + "x" } / let out = g3(P) / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":"nullx"}
@@ e3b schema P { a: number } / fn g5(s: string): string { "v=" + s } / let out = g5(P) / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":"v=null"}
@@ e4  schema P { a: number } / let out = P.a / out
   parse :: []
   run   :: THREW panic=true :: theta/runtime/null-member-access :: null member access: .a
@@ e5  schema P { a: number } / schema Q { b: string } / fn g(x: Q): string { x.b } / let out = g(P) / out
   parse :: []
   run   :: THREW panic=true :: theta/runtime/null-member-access :: null member access: .b
@@ e6  [control] schema P { a: number } / let out = P { a: 1 } / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":{"a":1}}
@@ e7  enum C { Red, Blue } / let out = C / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":null}
@@ e8  schema L = string / let out = L / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":null}
@@ e9  schema P { a: number } / let out = P() / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":{"ok":false,"error":{"kind":"code_tool",
            "message":"code-side call names no resolvable host tool 'P'","tool_name":"P","cause":"execution"}}}
@@ e10 schema P { a: number } / let out = P.keys() / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":null}
@@ e11 schema P { a: number } / let mut z = 1 / z = P / z
   parse :: []
   run   :: outcome=success result={"present":true,"value":null}
@@ e12 schema P { a: number } / schema Q { b: string } / fn g(x: Q): number { 1 } / let out = g(P) / out
   parse :: []
   run   :: outcome=success result={"present":true,"value":1}
```

e1 is the reported shape end to end: no diagnostic, a registered theta, a `null`
delivered into a `string`-annotated parameter, and a successful outcome. e3 and
e3b are the substituted `null` reaching a `string`-annotated **return** through
JS `+` coercion. e4 and e5 are the abort: the first field read on the
substituted `null` raises the panic `error-model.md:69` registers, so the same
defect produces either a wrong value or a terminated run depending on whether
the callee touches a field. e9 shows the call-position route dispatching the
schema name as a host tool and failing at runtime with a `code_tool`
`QueryError`, where `expressions.md:51` states the answer is a parse
diagnostic. e10 is `applyStdlibMethod`'s `null` fall-through
(`statement-executor.ts:939`). e6 is the control that shows the harness executes
and that the constructor form is unaffected.

### (f) The committed corpus at HEAD — the GOV-15 baseline

All 34 tracked `.theta` and `.thetalib` files parsed through the shipped
`parseThetaDocument`, then walked for an `ident` node whose name is a
top-level `schema` or `enum` declared in the same file:

```
@@ CORPUS FILES :: 34
@@ BARE SCHEMA/ENUM IDENT HITS :: 0
```

**Measured GOV-15 blast radius against the committed corpus: zero.** No shipped
`.theta` or `.thetalib` names a declared schema or enum at an identifier
position. That does not discharge GOV-15 — §Reproduction (a)'s programs load
cleanly today and would be refused after a fix — it bounds the corpus half of
the sweep (§Fix (d)). The sweep was run from a scratch probe rather than from
`tests/committed-fixture-parse-gate.test.ts`, which filters `.theta` only
([0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md)).

## Expected behaviour

**The resolution list is four arms and states no fifth.**
`expressions.md:44–49`:

> A bare identifier in call position (`name(args)`) resolves in this order,
> first match wins:
>
> 1. A local `let` binding or function parameter currently in scope.
> 2. A top-level `fn` declaration in the same `.theta` or `.thetalib` file.
> 3. A symbol imported from a `.thetalib` file (see [Imports]).
> 4. A name registered in the theta's callable set (Pi tool or `.theta`
>    callable; see [Tool Calls]).

`:51` states the disposition: "No match is `theta/parse/unknown-identifier`." A
`schema` or `enum` declaration matches no arm. The runtime resolver is the
implementation of exactly this list — `lexical-environment.ts:376–406`, whose
header comment names the order and whose four arms are `:381–404` — and it
answers `{ arm: "unresolved" }` (`:405`) for a schema name.

**The registered *Trigger* covers the value position, and one further sentence
says so.** `code-registry-parse.md:61` reads "Bare identifier in call or value
position resolves to nothing in scope", and `imports.md:50` states the code "is
scoped to bare identifiers in expression position". So the value position is
inside the row's reach even though `:44`'s sentence names only the call
position; d1 is the row's own written position, and it is equally silent.

**"Resolves to nothing in scope" is answered by the four arms, not by the
declaration set.** The reading that makes a1 correct requires a `schema`
declaration to put its name "in scope" as a value. Three things refuse that
reading, none of which depends on a missing sentence:

1. **The runtime disagrees with the parse gate.** The same document's identifier
   resolves at parse time and fails to resolve at run time
   (`lexical-environment.ts:405`), and the value the position receives is the
   `null` the host substitutes for exactly the arms that carry no readable value
   (`production-theta-producer.ts:5786–5793`). A name that is "in scope" for the
   gate and yields no value at run time makes the gate's judgement unrelated to
   the program's meaning.
2. **The parallel case is refused, by a written sentence.** `functions.md:20`:
   "closures and first-class function values are not part of theta 1.0, so
   function names appear only in call position. A function name used as a value
   (bound to `let`, passed as an argument) surfaces as
   `theta/parse/function-as-value`." A `fn` name is in the resolution list —
   arm (2) — and is still refused at a value position, because being resolvable
   as a callee is not being a value. A `schema` name is not even in the list.
   b1 measures the `fn` case firing on the same syntactic position where a3 is
   silent.
3. **Nothing in the corpus makes a type a value.** `schemas.md:3`: "A `schema`
   declaration introduces a named type." `expressions.md:21` admits the name as
   the head of a constructor and `:22` admits an enum name as the head of a
   variant access; `:8`'s parenthetical says "schema **constructors**", not
   schema names. The supported-forms list contains no bare-declaration-name
   form.

**What the spec does not state.** No page assigns a bare schema or enum
reference a static type or a runtime value. `expressions.md:9`'s member-access
bullet, `:10`'s indexed-access bullet and `schemas.md:97`'s variant-access
sentence each state a result type for their own form; there is no counterpart
for the bare name. The silence has one consequence a fix must handle: `null` is
the value the implementation currently produces, and it is produced by a
fall-through comment that calls itself a "safety net"
(`production-theta-producer.ts:5791–5792`), not by a rule. A fix that refuses
the input at parse time makes the silence unreachable; a fix that admits it must
write the missing sentence.

**GOV-15 ranges over these inputs and the carve-out covers the change.** Every
row of groups (a), (b2)–(b5), (c7)–(c10), (d) and (e) emits no `E`, so each
satisfies the loads-cleanly predicate
(`source-language-stability.md:9`) and sits inside the equivalence promise's
input set. Adding a diagnostic to them is a DIAG-2 trigger change, which
`source-language-stability.md:25` dispositions "as an addition for inputs newly
brought into the code's emission set" — carve-out-covered within theta 1.x. The
corpus measurement in (f) is what bounds the practical reach: zero shipped files
are affected.

## Actual behaviour / root cause

**One `switch` arm, three declaration kinds.** `collectIdentRoots`
(`theta-document.ts:4604–4641`) builds the whole-file identifier scope and folds
`fn`, `schema` and `enum` names through a single fall-through arm
(`:4611–4614`). `checkUnknownIdentifiers` (`:4680–4688`) seeds its walk with
that set, and `emitUnknownIdentifier` (`:4690–4707`) tests nothing but
membership (`:4697`). A declared schema name is therefore indistinguishable from
a `let` binding at every site the walk reaches.

The fold is deliberate and recorded twice: `collectIdentRoots`'s header comment
(`:4597–4603`) enumerates the six sources, and `checkUnknownIdentifiers`'s doc
comment (`:4669–4678`) repeats them while citing "expressions.md §"Identifier
resolution"; REQ-EXPR-7" at `:4669`. The cited section lists four sources. The
comment names six.

**The `fn` case is separated out one file over, and only the `fn` case.** The
structural walk's `case "ident"` (`theta-document.ts:6377–6387`) tests
`refs.fnNames.has(e.name)` and emits `theta/parse/function-as-value` through
`checkFunctionReference` (`src/parser/functions.ts:107–122`). `StructuralRefs`
carries the declared schema field sets, the declared enum variant sets, and the
whole-file `bodyTypes` name universe in the same object; no arm consults them at
an identifier position. So the language already distinguishes "declared, but not
a value" from "undeclared" — for one of the three kinds the root scope folds.

**The type layer then reads the name as the schema.** `#typeExpr`'s `ident` arm
(`static-type-inference.ts:211–216`) answers
`bindings.get(node.name) ?? { kind: "named", name: node.name }`. The walk's
`bindings` map holds nothing for a bare `P`, so the read is `named "P"`, which
resolves against the `TypeEnv` to the author's own declaration — the mechanism
bug 0038 hardened for prototype names and left intact for declared ones. Group
(c) is the consequence: four registered messages naming the schema, and a
receiver classification (`non-string-object-index`, c6) that fires only for an
object value. The judgement is about a declaration; the expression holds no
value.

**The runtime substitutes `null`, at one line.** An `ident` node reaches no arm
of `evalExpr` (`statement-executor.ts:609`) and falls through to
`deps.host.evaluatePure` (`:766`). The production host's `ident` arm is
`production-theta-producer.ts:5803–5805`:

```ts
case "ident": {
  const resolution = env.resolve(expr.name);
  return resolution.arm === "local" ? resolution.value ?? null : null;
}
```

`env.resolve` returns `{ arm: "unresolved" }` (`lexical-environment.ts:405`), so
the expression's value is `null`. `evalUserFnCall` then binds it positionally
(`statement-executor.ts:416`) with no test. The doc comment above the host arm
(`:5786–5793`) states the intent for the non-`local` arms — "no first-class
readable value … yields `null` (the expressions.md runtime safety net) rather
than throwing out of the executor" — which is a safety net written for inputs a
parse gate was expected to have refused. For a bare `fn` name the gate does
refuse first (b1); for a schema name it does not, and the safety net becomes the
semantics.

**Downstream, the `null` is either consumed or fatal.** `s + "x"` coerces to
`"nullx"` (e3) because the JS `+` is applied to the substituted value;
`applyStdlibMethod`'s fall-through returns `null` for a `null` receiver
(`statement-executor.ts:926–940`, `:939`), so `P.keys()` answers `null` (e10);
`evaluateMemberAccess` raises `NullMemberAccessPanic` (`runtime-panics.ts:332–334`)
on the first field read, aborting the theta (e4, e5). Which of the three an
author gets depends on what the callee does with the parameter, not on anything
at the call site.

**At call position the name is dispatched as a host tool.** `walkIdentExpr`'s
`case "call"` (`:4811–4813`) resolves the callee against the same folded scope,
so `P()` passes the gate; `evalExpr`'s `call` arm finds no user `fn`
(`statement-executor.ts:628–638`) and the node reaches the effect path, which
fails at runtime with `code_tool` / `code-side call names no resolvable host
tool 'P'` (e9). `expressions.md:51` assigns that input a parse diagnostic.

## Why it matters

- **A program that names no value loads, registers, and runs.** a1's source
  emits nothing at any severity, so `hasLoadParseError` denies nothing and the
  theta executes. The author gets `1` back (e1), or `"nullx"` (e3), or a
  terminated run at the first field read (e5). The parse gate's job at this
  position is to refuse the input; it admits it.
- **A `null` crosses a typed parameter boundary with no check.** e1 binds `null`
  to `s: string` and e12 binds it to `x: Q`. Nothing between the argument
  expression and the parameter slot tests the value — `evalUserFnCall`
  (`statement-executor.ts:416`) writes it directly — so the annotation
  describes nothing about what the body will read.
- **The same defect produces a wrong value or an abort depending on the
  callee's body.** e12 and e5 differ only in whether the body reads `x.b`. One
  returns `1`; the other raises `theta/runtime/null-member-access`. Neither
  outcome is visible at the call site.
- **The parse gate and the runtime disagree about the same name.** The gate
  resolves it (`theta-document.ts:4697`); the runtime does not
  (`lexical-environment.ts:405`). Two implementations of the same four-arm list
  that disagree make the list's conformance claim untestable for this input.
- **Five registered messages describe an expression that holds no value.** c1–c6
  each name the schema — `got P`, `P and integer`, `on type P` — and c6's code
  fires only for an object-value receiver. An author reading `expected string,
  got P` is told the position holds a `P`; e2 shows it holds `null`.
- **The parallel case is already closed, so the asymmetry is arbitrary.** A `fn`
  name at a value position draws `theta/parse/function-as-value` (b1) from an
  arm that sits beside the sets a schema check would read
  (`theta-document.ts:6377–6387`). The language distinguishes "declared, not a
  value" for one of the three kinds its root scope folds and for neither of the
  other two.
- **Nothing in the suite scores it.** u9d
  (`tests/fn-arg-type-mismatch-wired.test.ts:1656–1676`) pins that this input
  draws no `fn-arg-type-mismatch` and asserts nothing else; no test names
  `theta/parse/unknown-identifier` for a declaration name, and no test executes
  one. A regression that widened the fold further would red nothing.

## Non-goals

- **The argument-type judgement.** Whether `g(P)` should draw
  `theta/parse/fn-arg-type-mismatch` is settled and settled the other way: bug
  0050's cell u9d withholds, on the ground that the minted read is the
  identifier's spelling and proves nothing about the position's contents. This
  report claims the identifier-resolution code, not a type mismatch. A fix here
  removes the input from u9d's reach by refusing it earlier; §Fix (e) states
  what that owes the cell.
- **What `#typeExpr`'s `ident` arm should return.** The `named <name>` mint
  (`static-type-inference.ts:211–216`) is bug 0136's and bug 0126's substrate,
  and group (c) is cited here to show what the silent identifier reaches — not
  to claim the mint. A fix that refuses the identifier makes group (c)'s inputs
  unreachable; it does not change what the arm returns for the inputs that
  remain.
- **The case rule at type-reference positions.** Bug 0051's subject. Every name
  in this report is PascalCase and correctly declared.
- **The `theta/runtime/null-member-access` panic itself.** e4 and e5 are the
  disposition `error-model.md:69` registers for a `null` receiver, correct for
  their input. They are cited as the consequence of the substituted `null`, not
  as a second defect.
- **The pure host's `null` fall-through as a general policy.**
  `production-theta-producer.ts:5803–5805` answers `null` for the `fn`,
  `import` and `callable` arms as well; for those the parse gate refuses the
  input first (b1). Whether the fall-through should throw instead is a separate
  question this report does not open.
- **`theta/parse/unsupported-feature` as the code.** `expressions.md:27` scopes
  that default to the forms enumerated under §Not supported, and a bare
  identifier is not one of them. Named here to record that it was considered and
  is out.

## Fix

**Not settled.** Two routes close the same input set with different governance
costs, and the choice turns on one question §Expected behaviour leaves open:
whether a declared-but-not-a-value name deserves its own message. The
constraints below bind either route.

**(a) The two routes.**

1. **Reuse `theta/parse/unknown-identifier`.** Stop folding `schema` / `enum`
   names into the value scope at `theta-document.ts:4611–4614`, and re-admit
   them at the two positions the walk licenses (below). No registry edit: the
   *Trigger* at `code-registry-parse.md:61` already reads "call or value
   position resolves to nothing in scope", and the four-arm *Rule* at
   `expressions.md:46–49` already excludes declarations, so this is the
   implementation moving to match a written row. Cost: the message is
   `unknown identifier 'P'` for a name the author declared three lines up, which
   misdescribes the defect in the same way `function-as-value` was minted to
   avoid.
2. **Mint a sibling of `theta/parse/function-as-value`.** Add an arm to the
   structural walk's `case "ident"` (`theta-document.ts:6377–6387`) testing the
   declared schema / enum sets `StructuralRefs` already carries, emitting a code
   whose message says the name is a type and not a value. Cost: a code addition
   under DIAG-2 (`diagnostic-shape.md:72`) — the registry row, its *Trigger*,
   *Rule*, *Message*, and the `docs/reference/diagnostics.md` mirror, all in the
   same commit — plus the spec sentence element 2 of §Kind names. Benefit: the
   message names the actual defect, and the emission site is the one that
   already solves this problem for `fn` names, with the sets in hand.

   A third arrangement is available under either route and should be stated
   explicitly if taken: refuse the value position (route 2's message) and leave
   the call position to `unknown-identifier` (route 1), since d1's spec anchor
   (`expressions.md:44`) and a3's (`imports.md:50` plus the registry *Trigger*)
   are different sentences.

**(b) What a fix must not break**, each with a witness row above.

- **`Enum.Variant` keeps resolving.** `walkIdentExpr`'s `case "member"`
  (`:4836–4839`) treats the receiver as an identifier-resolution site, so
  removing enum names from the root set outright makes b3 draw
  `unknown-identifier`. The enum name must stay resolvable at that position, or
  the member arm must stop resolving it. b3 is the pin, b4 the control that the
  variant checker still fires.
- **The constructor head is untouched.** `P { a: 1 }` reaches the walk as an
  `object` node with a `typeName`, not as an `ident` (`:4677–4678`), so b2 is
  independent of the fold. A route that fences by name rather than by node kind
  must not reach it.
- **Type annotations are untouched.** b5 uses `P` at a type position and at a
  constructor head in a program that loads and runs. No identifier-resolution
  change reaches either.
- **`function-as-value` keeps firing.** b1 is the precedent and the shape;
  route 2 lands beside it and must not perturb it.
- **The undeclared control keeps its code and message.** a2 and a4 draw
  `theta/parse/unknown-identifier` today. A route that renames or reworks that
  emission is a DIAG-3 / DIAG-4 change deferred to theta 2.0
  (`diagnostic-shape.md:74`); neither route needs one.
- **The corpus stays clean.** (f) measures zero affected files at HEAD. Re-run
  the sweep after the change rather than assuming it, and run it over
  `git ls-files -- '*.theta' '*.thetalib'` rather than through
  `tests/committed-fixture-parse-gate.test.ts`, which cannot see either
  committed `.thetalib`
  ([0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md)).

**(c) The spec edits the fix carries.** Element 2 of §Kind is a silence, and
both routes close it in the same commit:

- One sentence stating the disposition of a bare `schema` / `enum` reference at
  expression position. Its natural home is `expressions.md` §Identifier
  resolution, beside `:51`'s "No match is `theta/parse/unknown-identifier`",
  parallel to the sentence `functions.md:20` already carries for `fn` names.
- Route 2 additionally: the registry row (`code-registry-parse.md`) with its
  *Trigger* / *Rule* / *Message*, and the `docs/reference/diagnostics.md`
  mirror, which carries the *Message* column and no *Trigger* column.
- Neither route edits an existing *Message*, so DIAG-4 is not engaged.

**(d) GOV-15.** Every affected input loads cleanly today
(`source-language-stability.md:9`), so the change is in scope of the equivalence
promise and is discharged through the diagnostic-registry carve-out (`:25`) as
an **addition** — the disposition bugs 0031, 0084 and 0102 established, applied
by measuring the corpus rather than predicting it. (f) is the measurement: 34
files, zero hits.

**(e) Coordination.**

- **Bug 0050's cell u9d** (`tests/fn-arg-type-mismatch-wired.test.ts:1656–1676`)
  asserts the absence of `fn-arg-type-mismatch` on a fixture that, after either
  route, also carries this report's code. `expectNoFnArgMismatch` (`:652–657`)
  filters to that one code, so **the cell stays green either way** — but its
  group comment claims at `:1576–1578` that "none of them draws any other
  diagnostic at this HEAD", and that sentence becomes false for u9d. Update the
  comment deliberately, with the reason, in the same commit.
- **Bugs 0136 / 0126 share the `ident` arm's substrate but not this file.**
  Neither proposes changing `collectIdentRoots` or the structural walk, and
  neither fix reaches the identifier-resolution pass. Independent.
- **Bug 0051 is not a prerequisite** and its fix does not reach any position
  here.

**Witness — offline, provider-free.** Groups (a)–(d) settle inside one
`parseThetaDocument` call, so they are an ordinary parse-diagnostic witness file
asserting the whole code list per row. Required rows: all of (a), so the fold's
three declaration kinds and the six value positions are each pinned with the
undeclared control beside them; all of (b), which are the constraints — b3 reds
if a fix removes enum names from the root set outright, b2 and b5 red if it
fences by name; (c1)–(c6) restated to whatever the fix leaves reachable, with
their reason; (c9) and (c10), which must stay free of
`fn-arg-type-mismatch` for 0050's reason; both rows of (d), stating explicitly
which code the call position draws. Group (e) needs the executor harness
(`tests/non-object-receiver-gate.test.ts:198–292`'s shape) and is owed for e1,
e3, e5 and e6 at minimum: e1 and e3 as the values the fix removes from
reachability, e5 as the abort, e6 as the control that the constructor path still
runs. A corpus row re-running (f) over `git ls-files` closes the GOV-15 sweep.
No live tier applies: nothing on this path crosses a provider, and every
observable is determined inside one parse plus one in-process execution.

## Provenance

- **Origin:** the bug 0050 fix (0.77.0, HEAD `3efdb4ac`), §Residuals item 6:
  "A bare schema reference at a value position draws no
  `theta/parse/unknown-identifier`. `let out = g(P)` with only `schema P`
  declared loads clean — `checkUnknownIdentifiers` folds declared `schema` names
  into its root scope. Measured." That residual created no bug document. This
  report adds what it does not state: the runtime half in full (group (e)), the
  enum and alias-schema rows, the six value positions, the call position, the
  `function-as-value` contrast, the type-layer reads in group (c), the corpus
  sweep, the four-arm-list and registry-*Trigger* reading, and the two routes.
- **Evidence:** one scratch vitest file and its own config under a gitignored
  directory at `3efdb4ac`, driving the shipped `parseThetaDocument` for the
  parse rows and `createProductionProducerDeps` → `bindPromptConversation` →
  `executeBody` for the runtime rows; every cell of groups (a)–(f) measured and
  quoted verbatim above; written, run, deleted. Cell c9 additionally reproduces
  as the committed `tests/fn-arg-type-mismatch-wired.test.ts` u9d fixture
  (`:737`).
- **Implementation, at `3efdb4ac`:** `src/parser/theta-document.ts:4597–4603`
  (the root-scope header comment), `:4604–4641` (`collectIdentRoots`;
  the fold `:4611–4614`), `:4669–4678` (`checkUnknownIdentifiers`'s doc
  comment), `:4680–4688` (the function), `:4690–4707`
  (`emitUnknownIdentifier`; the scope test `:4697`), `:851–861` (the call site),
  `:4800–4810` (`walkIdentExpr`; `case "ident"` `:4808–4810`), `:4811–4813`
  (`case "call"`), `:4836–4839` (`case "member"`), `:4840–4843`
  (`case "index"`), `:6377–6387` (the structural walk's `case "ident"`; the
  `fnNames` test `:6378`); `src/parser/functions.ts:107–122`
  (`checkFunctionReference`); `src/parser/static-type-inference.ts:211–216`
  (the `ident` arm); `src/runtime/lexical-environment.ts:376–406` (`resolve`;
  the four arms `:381–404`, the fall-through `:405`);
  `src/extension/production-theta-producer.ts:5786–5793` (the host doc comment),
  `:5803–5805` (the `ident` arm), `:1465`, `:1729`, `:2246` (the three
  `evaluatePure` wirings); `src/runtime/statement-executor.ts:609` (`evalExpr`),
  `:628–638` (its `call` arm), `:766` (the pure fall-through), `:395–435`
  (`evalUserFnCall`; the argument evaluation `:412`, the positional bind
  `:416`), `:926–940` (`applyStdlibMethod`; the `null` fall-through
  `:939`); `src/runtime/runtime-panics.ts:331–340` (`evaluateMemberAccess`; the
  panic `:332–334`); `src/extension/production-composition.ts:2045–2052`
  (`hasLoadParseError`).
- **Spec, at `3efdb4ac`:** `docs/spec_topics/expressions.md:8`, `:21`, `:22`,
  `:25–27`, `:42`, `:44`, `:46–49`, `:51`, `:53`;
  `docs/spec_topics/imports.md:50`; `docs/spec_topics/schemas.md:3`, `:97`;
  `docs/spec_topics/functions.md:20`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:36`, `:39`, `:54`,
  `:61`, `:63`, `:64`, `:83`, `:89`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/errors-and-results/error-model.md:69`, `:82`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`;
  `docs/reference/diagnostics.md:107`, `:132`.
- **Tests read, not modified:** `tests/fn-arg-type-mismatch-wired.test.ts:652–657`
  (`expectNoFnArgMismatch`), `:732`, `:737` (the fixtures), `:1546–1579` (the
  group comment), `:1656–1676` (cell u9d);
  `tests/e2e-s1-expr-diagnostics.test.ts:16–23` (the REQ-EXPR-7 coverage);
  `tests/non-object-receiver-gate.test.ts:198–292` (the executor harness shape).

## Fix (0.122.0)

- What shipped, keyed to §Fix:
  - **§Fix (a) route 2 — a minted sibling of `theta/parse/function-as-value`.**
    `theta/parse/type-as-value` (`E`, phase `parse`) refuses a bare `schema` /
    `enum` declaration name at a VALUE position, message
    `type '<name>' used as a value; a schema or enum declaration names a type,
    not a value`. Route 1 (reuse `unknown-identifier`) was rejected: it
    misdescribes a name the author declared, and it is the ground bug 0197's
    landed adjudication itself rejected.
  - **§Fix (a)'s third arrangement, taken explicitly.** The CALL position keeps
    `theta/parse/unknown-identifier` — the code `expressions.md:44`+`:51`
    already assign there and whose registered *Trigger* already reads "call or
    value position resolves to nothing in scope", so that row is BYTE-UNCHANGED
    and §Reproduction (d)'s two rows now report it instead of `[]`. e9's
    dispatch-a-schema-name-as-a-host-tool route is thereby unreachable, so
    group (d) is closed rather than deferred.
  - **Emission site — the identifier-resolution walk, not the structural walk.**
    The doc's route 2 named the structural walk's `case "ident"` arm (beside
    `function-as-value`). Measured: that arm carries no scope tracking and reds
    26 tests across 7 files, four of them protected witnesses, including two
    LANDED adjudications — bug 0126 group (d) ("a declaration sharing the loop
    variable's spelling changes nothing", §Fix (e) posture 1) and bug 0050's
    u13b/u13c — which pin a `for` variable / `match` binder spelled like a
    declaration as a LOCAL. The shipped judgement therefore lands in
    `checkUnknownIdentifiers`'s own walk, whose exact lexical scope makes those
    verdicts free: `collectIdentRoots` is called a SECOND time over the
    `schema`/`enum`-free statement list, so the walk seeds from the roots every
    value-binding source contributes, and `typeOnlyNames` is every declared
    name no such source also claims. `emitUnknownIdentifier` now judges three
    ways on an `IdentSite` — `"value"` → the new code, `"discarded"` → silent,
    `"call"` → the unchanged `unknown-identifier` — with its shadow early
    return untouched, which is what preserves every local-binder verdict.
  - **§Fix (b), each constraint measured:** `Enum.Variant` keeps resolving (the
    `member` arm licenses a declared-enum receiver — b3 green, b4's
    `unknown-variant` control unmoved); the constructor head is untouched (it
    is no `ident` node — b2); type annotations are untouched (b5);
    `function-as-value` is untouched at its own site (b1); the undeclared
    controls keep code AND message (a2/a4); the corpus stays clean (34 tracked
    `.theta`/`.thetalib`, zero hits — and post-0132 the committed-fixture parse
    gate walks `.thetalib`, so the gate is now the standing discharge).
  - **The no-op statement class stays silent.** A bare declared name as a
    DISCARDED expression statement draws nothing (`"discarded"`), which is the
    disposition bugs 0033 (n11 CONTROL) and 0042 (e1) pinned — "silent wherever
    it is written". An UNDECLARED name at that same position still draws
    `unknown-identifier`, so the licence is code-specific, not a position-wide
    exemption; the block/theta TAIL is not discarded and is inside the row.
  - **Spec, same commit (§Fix (c)):** `docs/spec_topics/expressions.md`
    §Identifier resolution gains the sentence closing §Kind element 2's
    silence, parallel to `functions.md:20`'s FN-1 sentence, folded ONTO the
    existing `:51` line so the file's line count does not move (~190 citations
    elsewhere in the tree point at `expressions.md:52+`).
    `docs/spec_topics/diagnostics/code-registry-parse.md` gains the DIAG-2 row
    beside `function-as-value`, with an exhaustive position enumeration and its
    exclusions, and `docs/reference/diagnostics.md` the *Message* mirror. No
    existing *Message* is edited, so DIAG-4 is not engaged.
- Gates: witness `tests/type-name-as-value-refusal.test.ts` 62/62 (25 RED at
  HEAD before the fix, right-reason); full default suite 324 files / 5876 tests
  passed; `tsc -p tsconfig.json --noEmit` clean; `eslint "src/**/*.ts"` clean.
  Live: H8a `tests/live/live-production-acceptance.test.ts` 59/59 real run
  (additive cell 59, zero model turns); real H9a both files 11/11
  (noninteractive-acceptance 10 + ctor-unresolved-load-refusal 1) with
  `tests/fixtures/h7a/permitted-codes.json` BYTE-UNCHANGED, decided on the real
  run (no fixture names a declaration at a value position — verified statically
  over all nine feature fixtures and empirically through each area's
  `assertCodesSubsetOfPermitted`).
- Review: 3 rounds. Round 1 (deep) — one blocking `spec` finding: the new row's
  Trigger enumerated its emission set as a closed disjunction that omitted four
  positions the code fires at; plus a prose residual on a stale u9d cell
  comment. Round 2 (fast) — clean; two residuals (four Trigger-named positions
  unwitnessed; the Trigger's `par for` clause overstated the mechanism).
  Round 3 (fast) — clean; two prose residuals (a stale group count, an
  imprecise line citation), closed by a comment-only polish pass whose diff
  touched no executable line (polish verified by gate-diff; confirmation round
  skipped).
- Verification: SOLID. (1) Both directions proven — with the `"value"` branch
  neutralised 39 of 62 cells red and the 23 that stay green are the fences
  (groups (r)/(b)/(g)/(f), e6) plus the four rows that arm cannot reach
  (a2/a4/d1/d2); restored blob-hash-verified byte-exact
  (`2ce669e66bdb9d8a60d8559e1eeac4f02032d18c`). (2) Full suite green. (3) The
  live cell was proven code-specific, not merely registration-shaped: because
  `hasLoadParseError` is severity-and-namespace-only, a registration boolean
  cannot tell this refusal from any other `theta/parse/*` error, so cell 59
  additionally asserts the `theta-system-note` channel carries this row's own
  DIAG-4 message, and was re-red-proven against the neutralisation. (4) Lint
  and typecheck clean.
- Residuals (each measured, none filed by this report):
  1. **A `${…}` template interpolation naming a declaration stays silent.**
     `checkUnknownIdentifiers`'s own doc comment states interpolations are not
     identifier-resolution sites in this walk; measured `[]` before and after,
     pinned by witness row g8 so a later widening is deliberate.
  2. **`par for` is outside the walk's REACH entirely.** Measured:
     `par for x in [1] { Zzz }` → `[]` where the plain-`for` control draws
     `unknown-identifier`; the iterand and the `max` operand escape too. That
     is bug 0118's subject (the same absent `par for` arm on the structural
     walk) and is pre-existing — this fix neither introduces nor widens it.
     Pinned by witness row g9 and stated in the registry row as a REACH fact,
     not as a rule this row makes.
  3. **An imported `schema` / `enum` symbol at a value position stays silent.**
     An imported symbol is resolution arm (3) — a genuine value — so
     `bodyTypes.imports` is deliberately outside `typeOnlyNames`; measured `[]`,
     pinned by row g7.
  4. **A callable-set or `params:`-field name colliding with a declaration stays
     silent at a value position** (row g6). The binder claims the name, which
     is `expressions.md:53`'s own shadow reading; whether a bare callable name
     at a value position is itself a defect is not this report's question.
  5. **Citation drift (bug 0134's class).** The +146-line growth of
     `src/parser/theta-document.ts` shifts `theta-document.ts:NNNN` citations in
     thirteen bug documents and three test files, and the registry insertion
     shifts `code-registry-parse.md:86+` / `reference/diagnostics.md:135+`
     citations by one — the same drift bug 0124's own landed row produced, and
     not swept here (a sweep into unowned files is out of this report's remit).
     `expressions.md` was deliberately kept line-count-stable to avoid adding a
     third class.
- Discharge notes appended: 0050's doc (§Residuals "bare schema reference at
  value position" — the filing origin, discharged); 0197's doc (the must-agree
  statement: its params-gate verdicts are preserved BY CONSTRUCTION);
  0191's doc (its shadow question stays NOT decided).
- Pinned dispositions / non-goals: `collectIdentRoots`'s executable body is
  BYTE-UNCHANGED and bug 0197's `checkParamsDefaultNames` still reads its
  unfiltered output, so that gate's verdicts do not move — the route-1
  alternative was measured to red six of its 28 witness cells and was rejected
  on that ground. No evaluator arm was touched (bug 0185's rejected route 2).
  `hoistEnumVariants` and the enum-vs-schema resolution order are untouched, so
  bug 0191's shadow question stays open: the new arm fires for a name declared
  as EITHER kind without adjudicating which declaration wins. The argument-type
  judgement stays withheld (bug 0050's u9d; `expectNoFnArgMismatch` filters to
  one code and the cell is unaffected — only its group comment moved, as
  §Fix (e) authorized). `#typeExpr`'s `ident` arm is unchanged (bug 0136 /
  0126's substrate); group (c)'s type-layer messages now arrive BESIDE the
  refusal rather than alone, which is what witness rows c1–c6 pin.
