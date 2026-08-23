# Bug 0128 — An explicit `by <field>` clause whose field resolves in every variant to a type that is not a single literal loads with zero diagnostics, while the identical variants without the clause are refused `theta/parse/missing-discriminator`: no registered code's *Trigger* describes the explicit-path input, `schemas.md:104`'s not-a-literal-union rule is stated over detection alone, and bug 0096's corrected classifier routes a second input class — a field typed `{a: X} | {b: Y}` — into the same silence the moment bug 0095 widens the schema-field capture — the residual bug 0096 §Non-goals declined to settle

- **Status:** fixed (0.157.0). The disposition this report asked for is settled in
  §Fix (0.157.0) below: Reading A, refusal, under a newly minted
  `theta/parse/non-literal-discriminator`. The §Fix section above is the
  candidate analysis the adjudication was made from and is left as filed.
  Coordination — [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)
  landed first (0.74.0), so, per §Fix (d), this fix rewrote the witness cell it
  inherited from bug 0096 item 4.
- **Sev/Diff estimate:** S1/D3 — measured, `schema Animal by kind = Cat | Dog`
  over `kind: string` in both variants loads with zero diagnostics and lowers
  `Cat` and `Dog` to byte-identical `$defs` under one `anyOf`, which is the
  discriminator-less object union `schemas.md:109` refuses by name and refuses on
  the same input without the clause; D3 because the disposition, the registry
  route and the GOV-15 direction are all adjudicated in-run, two landed witness
  cells assert the current silence, and the second input class is gated behind an
  in-flight sibling fix.
- **Kind:** spec gap — one predicate state, reached by two input classes. The
  state is `presentInAll && !allLiteral && !anyNested` in
  `evaluateOccurrences`' `FieldEvaluation`
  (`src/parser/schema-declarations.ts:496–499`): the `by` field resolves in
  every variant and its type is neither a single literal nor a single enclosing
  brace group. All three gates of `checkExplicitDiscriminator` are conjoined
  with `anyNested` or `allLiteral` (`:620`, `:634`, `:639–645`), so the function
  returns `[]` (`:647`).
  1. *Reachable at HEAD.* A field typed `"a" | "b"`, `string`, an `enum` name,
     `integer`, `array<string>` or `"cat" | null` in every variant.
     `classifyDiscriminatorFieldType` answers `{}` for each
     (`src/parser/theta-document.ts:5968–5989`), and its own doc comment calls
     such a type "never a discriminator candidate" (`:5931–5932`).
  2. *Reachable once 0095 lands.* A field typed `{a: X} | {b: Y}` — or any
     brace-rooted top-level union, e.g. `{ type: "x" } | "cat"`. Today the
     schema-field capture destroys the input before the classifier sees it
     (measured: `theta/parse/empty-schema-body` naming the declaration, bug
     0095 element 1). Bug 0096 made the classifier answer `{}` for it instead of
     a false `{ nested: true }`, so from 0095's commit forward it lands in the
     same silence as class 1 — measured below with 0095's §Fix applied as a
     temporary probe.

  Neither class is a divergence from a stated rule. `schemas.md:104` states
  detection rule 2 — "Be a single **string** literal type in every variant (one
  literal value per variant; not a literal-union)" — inside a numbered list
  introduced by "The **detected** field must" (`:101`); `:107` shares only the
  string-ness half of that rule with the explicit form by name; `:109`'s
  `missing-discriminator` is stated over detection ("If none qualify"); and the
  registry scopes that code the same way (`code-registry-parse.md:96`,
  "Discriminated-union detection finds no candidate field"). No sentence
  disposes of an explicit `by` over a resolved non-literal field, and **no
  registered code's *Trigger* describes the input** (§Actual behaviour). The
  implementation records the silence rather than inventing a code.
- **Related:**
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — **open**, and
    the report this one must be read against: its title names the same clause and
    the same silence. It is a different input set, and the separation is
    measurable rather than argued — see *Why this is not bug 0046* in §Summary.
    In one line: 0046's two classes are `presentInAll === false` (an explicit
    `by` naming a field at least one variant does not declare) and a `by` over a
    ≥2-arm union whose arms are not all object schemas. This report's class is
    `presentInAll === true` over arms that **are** all declared object schemas.
    0046 excludes present-in-all inputs from its class 1 in terms — of its own
    fixture A10 it writes "A10's field is present in both variants — it is not a
    member of the class" — and its class-1 witness cell states its subject as
    "an explicit by-clause naming no theta-side field of any variant"
    (`tests/schema-alias-union-decl.test.ts:1462`). One coordination hazard, not
    an overlap: 0046 §Fix candidate 4 drafts blessing text reading that a `by`
    clause suppresses detection "whether or not its field resolves", which would
    settle this class by side effect and in the silence direction. §Fix (c)
    binds the two dispositions to be jointly consistent.
  - [0096](./0096-discriminator-field-classifier-naive-brace-test.md) — **fixed
    (0.73.0)**, the origin. Its §Non-goals declines this question by name ("The
    disposition of a resolved but non-literal `by` field … Whether that silence
    is the right end state is a spec question about `schemas.md:99–121`, adjacent
    to but not inside [0046]'s two classes. Not settled here"), and its §Fix
    (0.73.0) *Residuals* (i) repeats it. This report is that adjudication. 0096
    is also what makes class 2 land in the silence rather than in a false
    `theta/parse/nested-discriminator`: before it, the classifier's positional
    brace test answered `{ nested: true }` for `{a: X} | {b: Y}`.
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) — **open**,
    the reachability gate for class 2 and the ordering constraint. Its §Fix
    deletes `parseType`'s leading-brace early return
    (`src/parser/theta-document.ts:2963–2966`) and makes the arm-start brace
    branch unconditional, so a schema-body field captures the whole
    `Type ("|" Type)*` extent. It inherits 0096 §Fix witness item 4 — a
    `parseDoc` cell for `Cat { kind: {a: integer} | {b: string}, … }` under
    `schema Animal by kind = Cat | Dog` asserting a clean load, with
    `kind: "a" | "b"` beside it as the parity control. Both halves of that cell
    are this report's subject.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — **fixed (0.45.0)**,
    which made `schema X by <field> = A | B` parse and reach the checkers. Before
    it the form failed on re-parsed residue, so neither class was reachable as a
    clean load. 0033's residual (v) is 0046; this report is not on 0033's
    residual list.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **open**,
    the sibling filing of bug 0096 residual (ii): `schema Cat { kind: {}, … }`
    under an explicit `by` draws bug 0045's inline
    `theta/parse/empty-schema-body` and then `theta/parse/nested-discriminator`.
    Disjoint input: `{}` is a single enclosing brace group, so it classifies
    `{ nested: true }` and takes the nested gate this report's class cannot
    reach. 0129's subject is whether the *second* line is owed; this report's is
    whether a *first* line is owed at all.
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **fixed (0.57.0)**, whose inline `{}` rule is 0129's first line. `{}` is
    outside this report's class; see §Non-goals.
- **Affected** (every citation verified at HEAD `04504288`, 0.73.0; a sibling's
  in-flight 0095 fix shifts every `src/parser/theta-document.ts` position below
  `:2966` by −4 lines, so resolve that file by symbol):
  - `src/parser/schema-declarations.ts:596–648` —
    `checkExplicitDiscriminator`, **the defect site**. `:613–616` resolves the
    author's theta-side name per variant through `thetaNamedFieldInVariant`
    (`:425–430`) and evaluates the occurrences. The three gates then all
    decline for this predicate state: `:620` tests `evaluation.anyNested`,
    `:634` tests `allLiteral && !allString && firstNonStringKind !== undefined`,
    `:639–645` tests `allLiteral && allString && firstDuplicateValue !==
    undefined`. `:647` returns `[]`. There is no gate on `allLiteral` alone.
  - `src/parser/schema-declarations.ts:601–612` — the comment in that function
    recording an undecided disposition. It records **0046's** class 1 only ("A
    `by` naming NO theta-side field of the variants resolves to nothing … That
    disposition is UNDECIDED by the specification … No code is invented for it
    here"). This report's class — a field that *does* resolve, to a non-literal
    — is not recorded anywhere in the source.
  - `src/parser/schema-declarations.ts:492–532` — `evaluateOccurrences`, which
    fixes the predicate state. `:496` `presentInAll = occurrences.every((o) => o
    !== undefined)` — **true** for this class. `:497` `anyNested =
    occurrences.some((o) => o?.nested === true)` — false. `:498–499` `allLiteral
    = presentInAll && occurrences.every((o) => o?.literal !== undefined)` —
    false, because the classifier attached no `literal`. `:501–505` derive
    `allString` and `firstNonStringKind` from the literals of an `allLiteral`
    evaluation only, so both non-string and duplicate-value gates are
    unreachable. `:461–471` is the `FieldEvaluation` shape; no member records
    "resolved but not a literal" as distinct from "absent".
  - `src/parser/schema-declarations.ts:497` — the `.some` that decides this
    class's **boundary**. A present occurrence that is nested raises
    `nested-discriminator` even when the other occurrences are non-literal
    (measured A12), so `by kind` over `{ type: "x" }` / `"a" | "b"` is refused
    while `by kind` over `"a" | "b"` / `"dog"` is silent. The asymmetry is bug
    0046 §Fix constraint 2's subject and is untouched by 0096; a resolution there
    that makes `anyNested` an `.every` moves A12 into this report's silence.
  - `src/parser/schema-declarations.ts:535–593` — `detectImplicitDiscriminator`,
    the control path and the contrast. Its candidate filter is `presentInAll &&
    allLiteral` (`:539–541`), so a resolved non-literal field is filtered out
    and the terminal branch is reached: `theta/parse/missing-discriminator`
    (`:584–592`). This is the diagnostic the same variants draw without the
    clause, on every row of §Reproduction's suppression column.
  - `src/parser/schema-declarations.ts:392–402` —
    `checkDiscriminatedUnion`'s dispatch. `:398` routes on `decl.by !==
    undefined` alone; the implicit path is not consulted as a fallback when the
    named field resolves to something that cannot be a discriminator.
  - `src/parser/schema-declarations.ts:620–630` — the sole emission site of
    `theta/parse/nested-discriminator` in the tree; every other occurrence of the
    code string under `src/` is a comment (`schema-declarations.ts:343`, `:390`;
    `theta-document.ts:5931`). The code is
    therefore reachable **only** from the explicit `by` path: the implicit path
    never reads `nested`. §Expected behaviour argues from this.
  - `src/parser/schema-declarations.ts:362–367` —
    `DiscriminatorCandidateField`; `literal` (`:365`) present iff the field type
    is a single literal `const`, `nested` (`:366`) for a nested object. A field
    of this report's class carries neither, which is the same encoding an
    *absent* field's `undefined` collapses to at every gate.
  - `src/parser/schema-declarations.ts:684–702` — `ByClauseDecl`'s comment, and
    `:710–729` `checkByClause`, which returns `undefined` for `form === "union"`
    (`:718–719`). The clause is admitted here on the arm count alone, which is
    correct: this report's arms are two declared object schemas.
  - `src/parser/theta-document.ts:5961–5990` —
    `classifyDiscriminatorFieldType`, which produces the classification. `:5965`
    the `isSingleEnclosingBraceGroup` guard (bug 0096's substitution) returning
    `{ nested: true }`; `:5968–5970` the top-level-`|` split returning `{}`;
    `:5971–5988` the five literal tests; `:5989` the terminal `return {}` for
    every other source, which is the arm a bare `string`, `integer`,
    `array<string>` or `enum` name takes.
  - `src/parser/theta-document.ts:5926–5960` — that function's doc comment.
    `:5931–5932` names the third outcome "neither (a non-literal type — never a
    discriminator candidate)"; `:5949–5959` states detection rule 2 as the
    reason the `|` split exists ("A LITERAL UNION is not a literal.
    schemas.md §Discriminated unions, detection rule 2, requires the field to
    'be a single string literal type in every variant (one literal value per
    variant; NOT a literal-union)', so `kind: "a" | "b"` is no candidate at
    all"). The comment states the rule the explicit path does not enforce.
  - `src/parser/theta-document.ts:5916–5924` —
    `discriminatorCandidateFields`, the classifier's sole caller (`:5922`);
    `:5887–5907` `buildUnionVariantSchemas`, the sole caller of that, which
    declines any union with fewer than two arms (`:5891–5893`), any arm that is
    not a bare identifier (`:5897–5899`), and any identifier that is not a
    declared object-form schema (`:5900–5903`). This report's declarations pass
    all three, which is what puts them outside 0046's class 2.
  - `src/parser/theta-document.ts:5717–5830` — `checkSchemaDeclarationGraph`.
    `:5741` `objectFields.set(s.name, s.fields)`, the map's only feed; `:5767`
    the object-form `checkByClause` call; `:5799` `const byForm = s.arms.length
    >= 2 ? "union" : "object"`; `:5819` the union-form `checkByClause` call;
    `:5821–5829` the gated `checkDiscriminatedUnion` call, with `by` forwarded at
    `:5825`.
  - `src/parser/theta-document.ts:2963–2966` — `parseType`'s leading-brace early
    return, bug 0095's subject and the upstream mask on class 2. It ends a
    schema-body field capture at the first balanced group; the residue
    `| {b: Y}` then trips `parseSchemaObjectBody`'s non-field-name recovery and
    the whole field list is discarded (measured: `Cat` captures zero fields).
  - `src/parser/body-type-lowering.ts:208–238` —
    `isSingleEnclosingBraceGroup`, the predicate bug 0096 wired into the
    classifier; `:201–206` its re-derived closing paragraph, which records the
    classifier as a caller beyond the type-lowering dispatches.
    `src/parser/params.ts:932` — `splitTopLevel`, the other production unit the
    classification composes.
  - `docs/spec_topics/schemas.md:99–121` — §Discriminated unions in full.
    `:101` the all-object definition and "the discriminator field is normally
    **detected implicitly**"; `:103–105` the three numbered properties of "The
    detected field", with `:104` carrying the not-a-literal-union parenthetical;
    `:107` `non-string-discriminator` and its sharing clause ("The rule applies
    equally to implicit detection and to the explicit `by <field>` form below");
    `:109` `ambiguous-` / `missing-discriminator`, both stated over qualification
    ("If exactly one field qualifies… If none qualify…"), plus the rationale
    "Discriminator-less object unions are rejected because they degrade
    structured-output quality at every major provider"; `:111–115` the explicit
    form and its example; `:117` the `by`-on-object-body rule; `:119`
    `duplicate-discriminator-value` and the top-level rule with
    `nested-discriminator`, both stated of "the discriminator field" without
    naming detection; `:121` mixed unions.
  - `docs/spec_topics/schemas.md:93` — "For inline enumerations use
    literal-union: `severity: "low" | "medium" | "high"`." The corpus recommends
    the spelling that silences the gate.
  - `docs/spec_topics/schemas.md:46` — §Wire-name renaming: the explicit form
    "accepts the theta-side name — the only name visible in code". The rule that
    fixes *which* name resolves; measured working for this class (A10, a
    wire-renamed field whose theta-side name resolves and whose value is a
    literal union).
  - `docs/spec_topics/schema-subset.md:88` — Lowering Algorithm step 6:
    "**Discriminator detection** runs on the lowered `anyOf` form, examining each
    variant's `properties` for a single `const`-typed field that is unique across
    variants. Detection is a parse-time sanity check; the lowered schema has no
    extra discriminator marker." This fixes the clause's whole force as the
    parse-time gate, which is what this class bypasses.
  - `docs/spec_topics/grammar.md:94`, `:101` — `Type "|" Type` over
    `ObjectType`, which makes class 2's field type a two-arm union rather than a
    nested object; `:105` the bare-`Type` position enumeration, schema field
    types among them; `:109` §Inline object types. `:168–179` §`schema X by
    <field>`: `:174` the `"by" Ident "=" UnionRhs` alternative, `:176`
    `UnionRhs ::= Type ("|" Type)+`, `:179` the object-body rule. Nothing in the
    grammar constrains a `by` field's *type*.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:95–99` — the five
    discriminator rows, quoted and assessed against this input in §Actual
    behaviour. `:95` `ambiguous-discriminator` ("Discriminated-union detection
    finds more than one candidate field"); `:96` `missing-discriminator`
    ("Discriminated-union detection finds no candidate field"); `:97`
    `duplicate-discriminator-value`; `:98` `nested-discriminator`
    ("Discriminator field is not at the top level of each variant (e.g. `kind: {
    type: "x" }`)"); `:99` `non-string-discriminator` ("Discriminator field's
    per-variant literal type is not `string` — i.e. a numeric or boolean literal
    `const`. Applies equally to implicit detection and to the explicit `by
    <field>` form").
  - `docs/spec_topics/diagnostics/code-registry-parse.md:56` —
    `by-on-object-schema`'s *Trigger*, whose cut is "the declaration's shape —
    object body, or arm count — so a right-hand side of two or more arms is
    outside this row's emission set whatever its arms are, and whether such a
    union then needs a discriminator is the discriminator rows' subject". That
    sentence hands this input to the discriminator rows, and none of them takes
    it. `:86` — `empty-schema-body`, the code class 2 draws today.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1, one range per
    site — the declaration's, which `checkExplicitDiscriminator` already holds),
    `:72` (DIAG-2: the registry is closed; a code addition or *Trigger* change is
    a spec change landing in the same commit), `:74` (DIAG-4: the *Message*
    column is normative and a reword is deferred to theta 2.0).
  - `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` — §Closure, the
    closed eight-category placeholder surface;
    `placeholder-rendering-b.md:5` (category 5, `<field>`), `:51` (category 7,
    `<X>` and `<kind>`). A new code's *Message* can be built from placeholders
    that already exist.
  - `docs/spec_topics/governance/source-language-stability.md:9` — the
    [loads-cleanly predicate](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
    (no `error`-severity diagnostic); `:25` — the
    [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out),
    which disposes a *Trigger* change "as an addition for inputs newly brought
    into the code's emission set". Every fixture of §Reproduction's two classes
    is in the loads-cleanly set today, so a refusing disposition relies on this
    carve-out.
  - `docs/reference/schema-subset.md:86–99` — the user-facing mirror of
    §Discriminated unions. `:88–90` states the three properties as detection's
    ("it must be present in every variant, a single **string** literal type per
    variant, and unique across variants") and `:94` states the explicit form
    "overrides detection", with no rule for a named field's type. Any spec edit
    lands here in the same commit.
  - `docs/reference/diagnostics.md:144–148` — the *Message* mirror of the five
    discriminator rows. Its header is `| Code | Sev | Phase | Message |`
    (`:55`), so it carries no *Trigger* column and a *Trigger* widening does not
    reach it; a **new code** does. `docs/reference/grammar.md:314` mirrors the
    `by` alternative.
  - `tests/discriminator-field-classifier-brace-group.test.ts` — bug 0096's
    9-cell witness, which must stay green. **Two of its cells assert this
    report's silence.** `:501–513` drives the exported
    `checkDiscriminatedUnion` with `Cat.kind` classified `{}` under `by kind` and
    asserts `[]`, with the in-cell reason "a union-typed `by` field is not a
    discriminator candidate, so no gate fires and the declaration loads clean".
    `:832` and `:869–876` are the end-to-end row: `animalDoc("D — literal
    union, by kind", '"a" | "b"', true)` expected `diagnostics: []`, labelled in
    the cell as "the parity control: the literal-union spelling of the same shape
    loads clean under an explicit `by`, which is the disposition §Fix brings the
    object-union spelling to once the field survives capture". Both are pinned as
    the current disposition, not as a specified one. `:515–529` pins the implicit
    path's two rows **equal to each other**, which is the invariant a fix here
    must not disturb. `:40–56` records the two masks; `:66–73` records that the
    classifier stays module-private and forbids a test-only export;
    `:475–486` is the `animalVariants` builder; `:580–594` `catOnly` /
    `animalDoc`.
  - `tests/schema-alias-union-decl.test.ts:1370–1420` — group (h), "a
    literal-union field is no discriminator candidate", which pins the **same
    field type on the implicit path** to `missing-discriminator`, citing
    detection rule 2 in its header (`:1370–1375`). Cell h1 (`:1378–1387`) drives
    `F_LITERAL_UNION_TAGS` (`:296–298`, `kind: "a" | "b"` / `kind: "c" | "d"`,
    no clause) and asserts exactly `missing-discriminator`; h2 (`:1389–1405`)
    the shared-literal-union spelling (`:299–301`); control h3 (`:1407–1420`) a
    quoted `|`. Together with the 0096 cell above, two landed cells give one
    field type opposite dispositions, selected by whether the author wrote the
    clause.
  - `tests/schema-alias-union-decl.test.ts:1431–1449` — cell i1, the positive
    control that the theta-side resolution and the shared value constraints do
    bind once the field resolves to a literal (`by kind` over `kind as "Kind":
    1` raises `non-string-discriminator`). `:1451–1464` — cell i2, bug 0046
    class 1's pin, whose subject line reads "an explicit by-clause naming no
    theta-side field of any variant"; `:1466` — control i3;
    `:2132–2156` — group (q) and cell n22, bug 0046 class 2's pin
    (`schema X by f = string | integer`). These three are the disjointness
    evidence, in-tree.
  - `tests/disc-unions-recursion.test.ts:173–196` — the seam-level
    `nested-discriminator` cell, hand-built with `nested: true` in both variants
    under `by kind`; `:200–216` the `checkByClause` cell, both forms. Neither
    covers a resolved non-literal field.
  - `tests/committed-fixture-parse-gate.test.ts` — the zero-diagnostics walk over
    committed fixtures. **No committed `.theta` or `.thetalib` carries a `by`
    clause at all**: `rg 'schema [A-Za-z_]+ by ' --glob '*.theta' --glob
    '*.thetalib'` over the tree is empty, so this gate never witnesses either
    class.
  - `tests/fixtures/h7a/permitted-codes.json` — blob
    `a4a8da04209f90e13d815edd92c1fc682e2a2236`, eleven entries, all
    `theta/load/*`, `theta/runtime/*` or `theta/host/*`; **no `theta/parse/*`
    code**. `tests/live/acceptance/harness.ts:115–117` is its path constant;
    `:468–494` is the empty-capture stderr gate whose allowlist ships empty. No
    H9a fixture drives a `by` clause, so neither surface reaches this input
    today.
  - **Test coverage of this defect as a defect: none.** The two cells that touch
    it assert the silence. No cell anywhere drives `by <f>` over a field typed
    `string`, an `enum` name, `integer`, `array<string>` or a named schema.
- **Observed at:** `0.73.0` (HEAD `04504288`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts` (the shipped load path with inert seams), reading
  `doc.diagnostics`, each declaration's captured `fields`
  (`name` / `typeSource`) and `doc.frontmatter.params.loweredSchema`. Classes 1
  and 2 were measured in a throwaway `git worktree` detached at `04504288`, so
  the numbers are HEAD's and not an adjacent working tree's; class 2's
  post-0095 rows were measured in that same worktree with bug 0095's §Fix
  applied as a temporary probe (the two-hunk edit its §Fix specifies: delete the
  leading-brace early return, make the arm-start brace branch unconditional —
  5 insertions / 9 deletions). Written, run, worktree removed.

## Summary

`schema Animal by kind = Cat | Dog` resolves `kind` per variant by theta-side
name and evaluates the resolved occurrences. When the field resolves in **every**
variant but its type is not a single literal, the evaluation is well-formed and
every constraint is vacuous: `presentInAll` is true, `anyNested` is false, and
`allLiteral` is false, so `checkExplicitDiscriminator`'s nested gate, non-string
gate and duplicate-value gate all decline and the function returns `[]`. There is
no gate on `allLiteral` alone.

Measured at HEAD, `by kind` over these field types loads with **zero
diagnostics**: `"a" | "b"`, `string`, an `enum` name, `integer`,
`array<string>`, `"cat" | null`, and a named object schema. The same variants
without the clause are refused `theta/parse/missing-discriminator` — five
arrangements, one code, in both a `.theta` and a `.thetalib`. So the clause does
not merely fail to report: it removes the rejection the same variants draw
without it, and it does so for a field the author correctly named.

The sharpest arrangement is `kind: string` in both variants. It loads clean under
`by kind`, and its lowering is an `anyOf` of two **byte-identical** `$defs`
(measured): the declaration reaches a provider with no tag anywhere, which is the
state `schemas.md:109`'s rationale exists to prevent, and which that same
sentence refuses on the identical input without the clause.

The disposition is inconsistent with its immediate neighbours, all measured at
one HEAD under `by kind`:

| `Cat.kind` / `Dog.kind` | lowered `kind` fragment | with `by kind` | without |
| --- | --- | --- | --- |
| `1` / `2` | `{"const":1}` | `non-string-discriminator` | `non-string-…` |
| `{ type: "x" }` / `{ type: "y" }` | (hoisted object) | `nested-discriminator` | `missing-…` |
| `{ type: "x" }` / `"a" \| "b"` | mixed | `nested-discriminator` | `missing-…` |
| `"a" \| "b"` / `"dog"` | `{"type":"string","enum":["a","b"]}` | **clean** | `missing-…` |
| `string` / `string` | `{"type":"string"}` | **clean** | `missing-…` |
| `"cat"` / `"dog"` | `{"const":"cat"}` | clean (correct) | clean |

Row 1 is refused although the provider *can* tag-discriminate on it
(`const 1` / `const 2`); rows 4 and 5 are admitted although it cannot. Row 3
against row 4 shows the accept/refuse line inside this class is drawn by
`evaluateOccurrences`' `.some` on `anyNested` — which non-literal shape happens
to appear, not whether the field is a discriminator.

Bug 0096 (0.73.0) made the classification structurally correct, which is what
brings a second input class to the same place. A field typed `{a: X} | {b: Y}` is
a `Type "|" Type` over two `ObjectType` arms (`grammar.md:94`, `:101`), and the
classifier now answers `{}` for it rather than a false `{ nested: true }`. Today
the input never reaches the classifier — bug 0095's capture destroys the field
list first — but with 0095's §Fix applied as a temporary probe the whole chain
runs and `by kind` over `{a: integer} | {b: string}` loads clean, byte-identical
to the `"a" | "b"` parity row. 0096's §Non-goals and its fix record both name
this and decline to settle it, calling it "a spec question about
`schemas.md:99–121`, adjacent to but not inside bug 0046's two classes". This
report is that question, with the claim of adjacency verified rather than
inherited.

### Why this is not bug 0046

0046 owns two input classes. Both are stated in its own header, its fixture
tables and its landed witness cells, and both are decided by a predicate this
report's class fails.

**0046 class 1 — `presentInAll === false`.** Its header states it as "An
explicit `by` naming a field no variant declares"; its class-1 cell states its
subject as "an explicit by-clause naming no theta-side field of any variant"
(`tests/schema-alias-union-decl.test.ts:1462`); and its §Fix constraint 2 folds
the half-present arrangement into the same class ("The half-present arrangement
moves with class 1"). Every row of its class-1 table has at least one variant
lacking the field — including its A7 (`Cat = { kind: string }`,
`Dog = { name: string }`), the row that looks closest to this report and is a
member of 0046 because `Dog` has no `kind`. 0046 excludes present-in-all inputs
explicitly: of its A10 it writes "A10's field is present in both variants — it is
not a member of the class."

This report's class has **no absent occurrence**. Measured, both `Cat` and `Dog`
capture a `kind` field in every row, and the two states are distinguishable at
one line of source: `presentInAll` (`schema-declarations.ts:496`) is false for
0046 class 1 and true here. The mechanisms differ accordingly — 0046 class 1 is a
resolution that finds nothing, this is a resolution that finds something the
language cannot use as a tag — and so do the spec sentences at stake. 0046 class
1 turns on `:103` (detection property 1, present in every variant) and on
`:109`'s detection-scoped `missing-discriminator`. This class turns on `:104`
(property 2's single-literal half) and on `:107`'s partial sharing of it. A
disposition for one does not determine the other: a rule that an explicit `by`
must name a field every variant declares leaves this class exactly as it is.

**0046 class 2 — arms not all object schemas.** Its fixture is
`schema X by f = string | integer`, and its mechanism is that
`buildUnionVariantSchemas` declines the union so `checkDiscriminatedUnion` never
runs. This report's declarations have two arms, both bare identifiers, both
resolving to declared object-form schemas, so all three of that gate's exits are
passed and `checkExplicitDiscriminator` does run — measured, since its
`nested-discriminator` gate fires on the neighbouring input (A11).

**One asymmetry 0046 does not have.** In 0046 class 2 the clause suppresses
nothing (the same unions without a `by` are equally clean). In 0046 class 1 and
here the clause suppresses a live rejection, but the two suppressions are not the
same defect: there the author misspelled the field and the file's only error is
the misspelling; here the author named the right field and the file's only error
is the field's *type*, which the corpus recommends writing that way
(`schemas.md:93`).

**Two coordination points, not overlaps.** (i) 0046 §Fix constraint 2's
`.some`/`.every` asymmetry decides this class's boundary: A12 is refused today
because `anyNested` is a `.some`, and an `.every` would move it into this
silence. (ii) 0046 §Fix candidate 4 drafts blessing text reading that a `by`
clause suppresses detection "whether or not its field resolves"; that wording
settles this class in the silence direction as a side effect, without this
class's evidence. §Fix (c) binds both.

**Conclusion: this report is not a duplicate and should be filed.** The input
sets are disjoint, the deciding predicate differs at one named line, the
governing spec sentences differ, and 0046's own witness cells state their
subjects narrowly enough to exclude this one.

## Reproduction

Offline, in a `git worktree` detached at `04504288`. Scratch vitest over
`parseDoc` (`tests/helpers/e2e-s1.ts`, the real `parseThetaDocument` with inert
seams). Every `.theta` body is preceded by `---\nmode: prompt\n---` and followed
by `let a = 1` and the tail `a`. Diagnostics are rendered
`<severity> <code>: <message>`; `[]` is a clean load with no diagnostic at any
severity. `MISSING` abbreviates the full `theta/parse/missing-discriminator`
line: `error theta/parse/missing-discriminator: Animal is a union of object
schemas with no shared single-literal discriminator field. Add a 'kind' (or
similar) field to each variant, or declare explicitly with 'by <field>'.`

### Class 1 — the field resolves in every variant and is not a single literal

`Dog` is `{ kind: "dog", name: string }` unless the row says otherwise; `Animal`
is `schema Animal by kind = Cat | Dog`. The `'` rows are the same two variants
under `schema Animal = Cat | Dog`.

```
A1   Cat.kind = "a" | "b"                          -> []
A1'  same, no clause                               -> [MISSING]
A2   Cat.kind = "a" | "b", Dog.kind = "c" | "d"    -> []
A2'  same, no clause                               -> [MISSING]
A3   Cat.kind = string                             -> []
A3'  same, no clause                               -> [MISSING]
A4   Cat.kind = string, Dog.kind = string          -> []
A4'  same, no clause                               -> [MISSING]
A5   enum K { A, B }; kind: K in both              -> []
A5'  same, no clause                               -> [MISSING]
A6   kind: integer in both                         -> []
A7   kind: array<string> in both                   -> []
A8   Cat.kind = "a" | "b", + Fish { kind: "fish" } -> []      (3 arms)
A9   Cat.kind = "cat" | null                       -> []
A10  Cat.kind = "a" | "b" written kind as "Kind"   -> []
A11  CONTROL  kind: { type: "x" } / { type: "y" }
     -> ["error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal"]
A12  MIXED  Cat.kind = { type: "x" }, Dog.kind = "a" | "b"
     -> ["error theta/parse/nested-discriminator: … of Animal"]
A12' same, no clause                               -> [MISSING]
A13  CONTROL  kind: "cat" / "dog"                  -> []      (a valid discriminator)
A14  CONTROL  kind: 1 / 2
     -> ["error theta/parse/non-string-discriminator: discriminator 'kind' on Animal must be a string-literal type; got integer"]
```

A1–A10 are the class. A11/A12 are its boundary: a *nested* non-literal is
refused, and A12 shows one nested occurrence is enough (`anyNested` is a
`.some`). A13 and A14 are the controls that fix what the explicit path does
enforce once the field resolves to a literal — the string-literal constraint
binds (A14) and a well-formed discriminator loads clean (A13).

The clause is what changes the outcome, not the field type: every `'` row's
variants are byte-identical to the row above it.

### Class 1 — the captured field types, so the classification is not in doubt

Read off `doc.body.statements`. `parseType` joins token texts with no separator.

```
kind: "a" | "b"                -> [["kind","\"a\"|\"b\""],["name","string"]]
kind: string                   -> [["kind","string"],["name","string"]]
kind: K                        -> [["kind","K"],["name","string"]]
kind: integer                  -> [["kind","integer"],["name","string"]]
kind: array<string>            -> [["kind","array<string>"],["name","string"]]
kind: "cat" | null             -> [["kind","\"cat\"|null"],["name","string"]]
kind: { type: "x" }            -> [["kind","{type:\"x\"}"],["name","string"]]
kind: {a: integer} | {b: string} -> []                                  [class 2]
```

The first six take `classifyDiscriminatorFieldType`'s `{}` arms — the
top-level-`|` split at `theta-document.ts:5968` for rows 1 and 6, the terminal
`return {}` at `:5989` for rows 2–5. Row 7 takes the brace guard at `:5965` and
is the A11 control. Row 8 captures **nothing**: that is bug 0095's element 1 and
the upstream mask on class 2.

### Class 1 in a `.thetalib`

No frontmatter and no trailing `let` — declarations are permitted top-level
forms there.

```
Cat { kind: "a" | "b", … }, Dog, schema Animal by kind = Cat | Dog  -> []
same three declarations with `schema Animal = Cat | Dog`            -> [MISSING]
```

### Class 1 — what reaches the provider

Read as `$defs` of a `params:` document whose one field is `a: Animal`.

```
A4  by kind, kind: string in both
    Animal -> {"anyOf":[{"$ref":"#/$defs/Cat"},{"$ref":"#/$defs/Dog"}]}
    Cat    -> {"type":"object","properties":{"kind":{"type":"string"},"name":{"type":"string"}},
               "required":["kind","name"],"additionalProperties":false}
    Dog    -> identical bytes to Cat                                   [measured true]
A1  by kind, Cat.kind = "a" | "b"
    Cat    -> …"kind":{"type":"string","enum":["a","b"]}…
    Dog    -> …"kind":{"const":"dog"}…
    whole lowered document identical with and without the clause       [measured true]
```

A4 is an `anyOf` over two byte-identical object schemas: the union carries no
information that could select a variant, in a document that loaded with zero
diagnostics. The single-field fragments, measured on their own, are
`kind: 1` → `{"const":1}`, `kind: "cat"` → `{"const":"cat"}`,
`kind: string` → `{"type":"string"}`,
`kind: "a" | "b"` → `{"type":"string","enum":["a","b"]}`,
`kind: K` → `{"$ref":"#/$defs/K"}` — so the two shapes theta refuses (A11, A14)
are the two that carry a `const`, and the shapes it admits are the ones that do
not.

`schema-subset.md:88` is why the clause changes no byte: the lowered schema
carries no discriminator marker, so the clause's whole force is the parse-time
gate this class removes.

### Class 2 — with bug 0095's §Fix applied as a temporary probe

Same worktree, 0095's two-hunk edit applied and then discarded with the
worktree. `Dog` is `{ kind: "dog", name: string }`; `Animal` is
`schema Animal by kind = Cat | Dog`.

```
B1   Cat.kind = {a: integer} | {b: string}   -> []
     capture: [["kind","{a:integer}|{b:string}"],["name","string"]]
B1'  same, no clause                         -> [MISSING]
B2   Cat.kind = { type: "x" } | "cat"        -> []
     capture: [["kind","{type:\"x\"}|\"cat\""],["name","string"]]
B3   Cat.kind = {a: integer} | null          -> []
B4   CONTROL  kind: { type: "x" } / { type: "y" }
     -> ["error theta/parse/nested-discriminator: … of Animal"]
B5   PARITY   Cat.kind = "a" | "b"           -> []
```

B1 is bug 0096 §Fix witness item 4's fixture and B5 is its parity control; both
are green, and B1 against B1' is the same suppression class 1 shows. B4 is the
byte-unchanged single-group control. Without the probe, B1, B2 and B3 all render
`error theta/parse/empty-schema-body: 'Cat' has no fields; an empty schema
cannot be validated.` and capture no fields — measured at HEAD.

### The two in-tree cells that already pin the silence

Both green at HEAD; neither asserts a rule.

```
tests/discriminator-field-classifier-brace-group.test.ts:509–512
  checkDiscriminatedUnion(Cat.kind = {}, by "kind")  ->  []
tests/discriminator-field-classifier-brace-group.test.ts:832, :869–876
  parseDoc(Cat.kind = "a" | "b", by kind)            ->  diagnostics: []
tests/schema-alias-union-decl.test.ts:1378–1387  (cell h1)
  parseDoc(Cat.kind = "a" | "b", Dog.kind = "c" | "d", NO clause)
                                                    ->  exactly missing-discriminator
```

One field type, two dispositions, both landed, selected by the presence of the
clause.

## Expected behaviour

Undefined by the spec for both classes. Two readings are available, and which
governs is the adjudication this report owes.

**Reading A — detection rule 2 binds a named `by` field, so the declaration is
refused.** `schemas.md:104` requires the discriminator to "be a single **string**
literal type in every variant (one literal value per variant; not a
literal-union)". That is one property with two halves — there must be a literal,
and it must be a string. `:107` shares the string half with the explicit form by
name. `:119` shares the top-level rule and the uniqueness rule with no
qualification, and both are implemented on the explicit path (A11; and 0046's
duplicate-value control). So three of the four constraints the section states
already bind a named field; property 2's single-literal half is the only one that
does not, and no sentence exempts it. `:109`'s rationale —
"Discriminator-less object unions are rejected because they degrade
structured-output quality at every major provider" — is a property of the lowered
document, and A4's lowering is exactly a discriminator-less object union.

**Reading B — the silence is intended, because the explicit form removes
qualification.** `:101` introduces the three properties as those of "The
**detected** field", under a sentence about implicit detection; `:111` then says
"The explicit form overrides detection". On this reading the numbered list is a
*selection* procedure, not a validity test, and the author's naming replaces it.
`:107`'s existence supports the reading: the corpus knows how to share a rule
with the explicit form and does so in one place, so rules not marked that way are
detection-only. The registry agrees for the two selection codes —
`code-registry-parse.md:95` and `:96` both read "Discriminated-union detection
finds …".

**Reading A is better supported.** Four reasons, three of them measured:

1. **`theta/parse/nested-discriminator` exists only for the explicit form.** Its
   sole emission site is `schema-declarations.ts:620–630`, inside
   `checkExplicitDiscriminator`; `detectImplicitDiscriminator` never reads
   `nested` (0096's downstream-mask finding, pinned at
   `tests/discriminator-field-classifier-brace-group.test.ts:515–529`).
   Measured: A11 raises it under `by kind` and the same variants without the
   clause raise `missing-discriminator` instead. So the corpus already has a
   discriminator-shape rule that applies to a *named* field and to nothing else.
   Under Reading B its existence is unexplained: a nested field is a special case
   of a non-literal field, and Reading B has to say why "not a literal because it
   is an object" is refused while "not a literal because it is a union, or a bare
   type name" is admitted. Reading A explains both with one rule.
2. **Reading B admits strictly worse inputs than it refuses.** Measured: `kind:
   1` / `kind: 2` under `by kind` is refused `non-string-discriminator`, and its
   lowered fragments are `{"const":1}` / `{"const":2}` — a tag a provider decoder
   can select on, refused because `:107` judges non-string `const` a
   decoding-quality risk. `kind: string` in both variants is admitted, and its
   lowered fragments are identical to each other. A rule set that refuses the
   weaker failure and admits the stronger one is not a reading of `:107`'s
   rationale; it is the absence of a rule.
3. **`:104`'s parenthetical has no work to do under Reading B, and it is the
   half that decides this class.** The implementation implements it — the
   top-level-`|` split at `theta-document.ts:5968` exists for it, and the
   function's own comment cites detection rule 2 verbatim as its reason
   (`:5949–5959`). The in-tree cell that scores it (`h1`) is written at the
   implicit position only. Reading B leaves the corpus asserting a rule that
   applies to one of the two spellings of the same declaration, with no sentence
   saying so.
4. **`schema-subset.md:88` makes the clause's only force the parse-time gate.**
   The lowered schema carries no discriminator marker, and this report measures
   the lowering byte-identical with and without the clause. Under Reading B a
   `by` clause over a non-literal field is a construct with no effect on any
   observable and a suppressing effect on one diagnostic — which is a statement
   the corpus would have to make, since an author cannot derive it from `:111`'s
   "overrides detection".

Reading A does not make the text complete. `:101`'s list is introduced as
detection's criteria and no sentence states that a *named* field must satisfy
properties 1 and 2, nor which code says so. One sentence is owed — at `:107`, or
beside `:117` where the explicit form is defined — before code lands. That
sentence is what this report asks for.

Under Reading A, on the measured input:

- The declaration draws one error-severity diagnostic at the declaration's own
  range (DIAG-1, `diagnostic-shape.md:71`; `checkExplicitDiscriminator` already
  holds that range), naming the field and the schema.
- A11 and A14 keep their present codes and messages: the nested and non-string
  rules already cover their inputs, and both are more specific.
- A13 and 0046's control i3 stay clean: a named field that is a unique string
  literal in every variant, wire-renamed or not, is a valid discriminator.
- The implicit path is unchanged at every input: `missing-discriminator`
  continues to answer for the no-clause column, which is the disposition group
  (h) already pins.
- Class 2 converges on class 1 rather than on 0096's removed
  `nested-discriminator`: `{a: X} | {b: Y}` is a union type, not a nested object,
  under either disposition.

Under Reading B the corpus must state, in author-visible terms, that an explicit
`by` clause admits a field of any type and that the discriminator requirement of
`:109` is therefore opt-out-able by writing `by <the field you already have>` —
and it must reconcile that with `nested-discriminator`, which would then be the
one shape the opt-out does not cover.

## Actual behaviour / root cause

**One missing gate, in a function whose other three gates all presuppose a
literal.** `checkExplicitDiscriminator`
(`src/parser/schema-declarations.ts:596–648`) resolves the field
(`:613–616`) and then tests three conditions:

```ts
if (evaluation.anyNested) { … }                                    // :620
if (evaluation.allLiteral && !evaluation.allString && …) { … }      // :634
if (evaluation.allLiteral && evaluation.allString && …) { … }       // :639
return [];                                                          // :647
```

`allLiteral` is `presentInAll && every occurrence has a literal` (`:498–499`).
For this class `presentInAll` is true and no occurrence has a literal, so
`allLiteral` is false and gates two and three are unreachable; `anyNested` is
false, so gate one is too. Nothing tests `allLiteral` on its own, and
`FieldEvaluation` (`:456–471`) carries no member that separates "resolved but
not a literal" from "absent" — both arrive at every gate as the same falsehood.

**The classification is correct; the consumer has no arm for it.**
`classifyDiscriminatorFieldType` (`theta-document.ts:5961–5990`) returns exactly
three shapes: `{ literal: … }`, `{ nested: true }`, and `{}`. Its own comment
names the third "a non-literal type — never a discriminator candidate"
(`:5931–5932`). Two of the three have a gate on the explicit path. The third has
none. Bug 0096 did not create this: it moved `{a: X} | {b: Y}` from the second
shape to the third, which is where `"a" | "b"` already was.

**The explicit path replaces detection instead of specialising it.**
`checkDiscriminatedUnion` (`:392–402`) routes on `decl.by !== undefined` alone
(`:398`). `detectImplicitDiscriminator` filters candidates on `presentInAll &&
allLiteral` (`:539–541`) and therefore has a terminal answer for "no field
qualifies" — `missing-discriminator` (`:584–592`). The explicit path has the
same filter's *predicate* available and no terminal answer. That asymmetry is
the same one 0046 identifies for an absent field; here it is the resolved-but-
non-literal case of the identical filter.

**The `.some` decides the class's own boundary.** `anyNested = occurrences.some(
(o) => o?.nested === true)` (`:497`) is the only property computed with `.some`.
Measured: A12 (`{ type: "x" }` in one variant, `"a" | "b"` in the other) raises
`nested-discriminator`, while A1 (`"a" | "b"` in one, `"dog"` in the other) raises
nothing — both are "not a single literal in every variant". Which side of the
line an arrangement falls on is decided by whether any occurrence happens to be
brace-shaped. The asymmetry is bug 0046 §Fix constraint 2's subject and is
untouched by 0096.

**No registered code's *Trigger* describes the input.** Each row read as
written (`docs/spec_topics/diagnostics/code-registry-parse.md`):

- `:98` `nested-discriminator` — "Discriminator field is not at the top level of
  each variant (e.g. `kind: { type: "x" }`)." A field typed `"a" | "b"` or
  `string` **is** at the top level of each variant; its value is not an object.
  For class 2, 0096 established the same in terms: `{a: X} | {b: Y}` is a union,
  not a nested value, so the row never described that emission either.
- `:99` `non-string-discriminator` — "Discriminator field's per-variant literal
  type is not `string` — i.e. a numeric or boolean literal `const`." Presupposes
  a literal type. A `string`-typed, union-typed or `enum`-typed field has none.
- `:96` `missing-discriminator` — "Discriminated-union detection finds no
  candidate field." The explicit path runs no detection. Its *Message* is also
  false of part of the class: measured, `by name` over `name: string` while
  `kind: "cat"` / `kind: "dog"` are present loads clean, and there a shared
  single-literal discriminator field does exist.
- `:95` `ambiguous-discriminator` — detection-scoped, and nothing is ambiguous.
- `:56` `by-on-object-schema` — its *Trigger* cuts on the declaration's shape and
  states that "a right-hand side of two or more arms is outside this row's
  emission set whatever its arms are", handing the question to "the discriminator
  rows' subject". None of those rows takes it.

So the input is described by no row, which is the DIAG-2 question §Fix (b)
answers.

**Class 2's reachability, precisely.** `parseType`'s leading-brace early return
(`theta-document.ts:2963–2966`) ends a schema-body field capture at the first
balanced group; the residue `| {b: Y}` is not a field name, so
`parseSchemaObjectBody`'s recovery discards the whole list; the declaration never
enters `objectFields` (`:5741`); `buildUnionVariantSchemas` declines the union
(`:5900–5903`); `checkDiscriminatedUnion` is never called. Measured: `Cat`
captures zero fields and the load ends on `empty-schema-body` naming `Cat`.
0095's §Fix removes exactly that early return, and the measured post-probe result
is `[]`.

**The clause has no other reader.** `s.by` is consumed at
`theta-document.ts:5767` (object form), `:5819` and `:5825` — the two checkers —
and nowhere else. The lowering path takes `decl.arms` only, and
`schema-subset.md:88` states the lowered schema carries no discriminator marker.
Measured: the whole lowered document is byte-identical with and without the
clause. So the silence is total — no diagnostic, no lowered byte, no type-layer
answer records that a discriminator was requested and not provided.

## Why it matters

- **A refusal becomes a clean load, on a correctly-spelled field.** Measured:
  five arrangements (A1'–A5') that draw `theta/parse/missing-discriminator`
  produce zero diagnostics under `by kind`. The author named a field that exists;
  the only thing wrong with the file is that field's type, and nothing reports it.
- **The admitted state is the one `:109` refuses by name.** `kind: string` in
  both variants loads clean and lowers to an `anyOf` of two byte-identical
  `$defs` — a discriminator-less object union, which `:109` rejects "because they
  degrade structured-output quality at every major provider" and which the
  identical source without the clause is refused for.
- **The corpus recommends the spelling that triggers it.** `schemas.md:93`: "For
  inline enumerations use literal-union: `severity: "low" | "medium" | "high"`."
  A variant tagged that way, named by an explicit `by`, is measured silent. So is
  `kind: K` over a declared `enum` — the other natural way to write a tag.
- **The remedy prose of two registered messages routes authors into it.**
  `ambiguous-discriminator` and `missing-discriminator` both end "Declare
  explicitly with 'by <field>'" (`code-registry-parse.md:95`, `:96`). Following
  that advice on a field whose type is a literal union, a bare `string` or an
  `enum` name silences the rejection instead of resolving it.
- **Neighbouring inputs are refused, including strictly better ones.** `kind: 1`
  / `kind: 2` is refused although both lower to a `const`; `kind: string` /
  `kind: string` is admitted although neither does. An author cannot derive the
  line from any spec sentence, and the measured line runs through
  `evaluateOccurrences`' `.some`.
- **Both classes are inside the
  [GOV-15 loads-cleanly set](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)**
  (`source-language-stability.md:9`) — zero error-severity diagnostics — so a
  later decision to refuse them needs the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`:25`), not an ordinary bug fix. The longer the disposition is open, the more
  author code depends on the silence.
- **Two landed cells assert the silence, and a third asserts the opposite for the
  same field type.** `tests/discriminator-field-classifier-brace-group.test.ts`
  pins `[]` at the seam (`:509–512`) and end to end (`:869–876`);
  `tests/schema-alias-union-decl.test.ts:1378–1387` pins
  `missing-discriminator` for `kind: "a" | "b"` without the clause, citing
  detection rule 2 in its group header. The corpus scores rule 2 on one spelling
  of the declaration and its negation on the other.
- **No gate scores it as a defect.** No committed `.theta` or `.thetalib` carries
  a `by` clause (`rg 'schema [A-Za-z_]+ by '` over both globs is empty), so
  `tests/committed-fixture-parse-gate.test.ts` never witnesses it, and no H9a
  fixture reaches it.
- **The second class is arriving.** 0095 is in flight and owes a cell that
  asserts the clean load for it. Once that lands, the silence is reachable by two
  input shapes and pinned green by three cells.

## Non-goals

- **Bug 0046's two classes.** An explicit `by` naming a field at least one
  variant does not declare (`presentInAll === false`), and a `by` over a ≥2-arm
  union whose arms are not all object schemas. Disjoint input sets, different
  deciding predicate, different spec sentences — argued and measured in §Summary.
  Their cells i2 (`tests/schema-alias-union-decl.test.ts:1451–1464`) and n22
  (`:2140–2156`) are untouched by any disposition here.
- **The `.some`/`.every` asymmetry itself.** `evaluateOccurrences:497` against
  `:496`/`:498–499` is bug 0046 §Fix constraint 2's subject. This report records
  that the asymmetry decides its own boundary (A12) and requires the two
  dispositions to be consistent (§Fix (c)); it does not propose changing the
  asymmetry.
- **The schema-field capture.** `parseType`'s early return
  (`theta-document.ts:2963–2966`) and `parseSchemaObjectBody`'s
  discard-the-whole-list recovery are bug 0095's subject. This report does not
  make class 2 reachable; it says what the answer should be when 0095 does.
- **The classifier's brace guard.** Bug 0096's fix
  (`isSingleEnclosingBraceGroup` at `theta-document.ts:5965`) is correct under
  either disposition here: `{a: X} | {b: Y}` is a union of two `ObjectType` arms
  (`grammar.md:94`, `:101`), never one nested object. Its 9-cell witness's
  predicate table and capture columns stay byte-identical; only the two cells
  that assert the *silence* are in scope (§Fix (e)).
- **`{}` as a field type drawing two diagnostics.** `schema Cat { kind: {}, … }`
  under an explicit `by` renders bug 0045's `empty-schema-body` naming `'{}'`
  followed by `nested-discriminator` (0096 residual (ii)), filed as
  [0129](./0129-empty-object-field-type-draws-two-diagnostics.md). `{}` is a
  single enclosing brace group under both predicates, so it classifies
  `{ nested: true }` and is outside this class.
- **The theta-side resolution rule.** `schemas.md:46` fixes that `by` names the
  theta-side identifier; measured working here (A10, a wire-renamed field whose
  theta-side name resolves and whose value is a literal union). Changing the
  resolution is a different question.
- **Implicit detection's own dispositions.** `ambiguous-` / `missing-` /
  `duplicate-` / `non-string-discriminator` on the implicit path are correct and
  stay byte-identical (§Fix (f)); group (h)'s three cells are the pins.
- **`by-on-object-schema`'s emission set.** The object body and the one-arm
  right-hand side keep their code and message.
- **The lowering of a literal-union or `enum`-typed field.**
  `{"type":"string","enum":["a","b"]}` and `{"$ref":"#/$defs/K"}` are the
  SUBS-1-correct fragments; nothing here proposes changing them. What is at stake
  is whether such a field may be *named as a discriminator*.
- **`theta/parse/nested-discriminator`'s and `non-string-discriminator`'s rows.**
  Accurate as written for the inputs they describe. A new code, if minted, does
  not reword either (DIAG-4, `diagnostic-shape.md:74`).

## Fix

**Not settled. This report exists to pin the spec disposition first**, which is
the posture bug 0096 §Non-goals left it in ("a spec question about
`schemas.md:99–121` … Not settled here"). Six questions have to be answered, and
(c) and (d) order the work against the two sibling reports.

**(a) Does detection rule 2 bind a field a `by` clause names?** This is the
spec adjudication and everything else follows from it. §Expected behaviour argues
Reading A on four grounds, of which the decisive one is
`theta/parse/nested-discriminator`: it is emitted from one site, on the explicit
path only, so the corpus already constrains a *named* field's shape, and the
constraint it applies is a special case of "must be a single literal". Whichever
way this lands, one sentence is owed in `schemas.md` — at `:107` (which already
carries the sharing vocabulary) or beside `:117` (which defines the explicit
form) — plus its mirror at `docs/reference/schema-subset.md:86–99`. Under Reading
A that sentence states which of `:103–105`'s properties bind a named field; under
Reading B it states that a `by` clause admits a field of any type and therefore
removes `:109`'s requirement, and it reconciles that with `:119`'s top-level
rule, which would then be the one shape the opt-out does not cover.

**(b) Which registry route, if the disposition refuses.** No row's *Trigger*
describes the input (§Actual behaviour), so there are three candidates.

1. **Mint a code** — a DIAG-2 addition (`diagnostic-shape.md:72`), covered by
   the GOV-15 carve-out as an addition for inputs newly brought into the
   emission set (`source-language-stability.md:25`). Its *Message* is buildable
   from placeholders that already exist: `<field>` is category 5
   (`placeholder-rendering-b.md:5`), `<X>` and `<kind>` are category 7 (`:51`),
   so the closed placeholder surface (`placeholder-rendering-a.md:7`) is not
   touched. The site is the declaration's range, which
   `checkExplicitDiscriminator` already passes (DIAG-1). Mirrors:
   `docs/reference/diagnostics.md:144–148` (a new row) and
   `docs/reference/schema-subset.md:86–99`.
2. **Widen `non-string-discriminator`'s *Trigger*** (`:99`). Its *Message* —
   `discriminator '<field>' on <X> must be a string-literal type; got <kind>` —
   is close to true of this class, and its `<kind>` slot would have to render a
   *type* rather than a literal kind. That is a rendering change to a placeholder
   on a row that already emits, so it is a DIAG-4 concern deferred to theta 2.0
   unless the widened set renders `<kind>` from the existing closed `<kind>` set
   for every new input. Assess before choosing; do not assume the message fits.
3. **Widen `missing-discriminator`'s *Trigger*** (`:96`). Rejected on the
   *Message*: its remedy clause instructs the author to "declare explicitly with
   'by <field>'", which is what they did, and its first clause is false of the
   sub-case measured as F1 (`by name` while `kind` is a valid shared
   single-literal field). Rewording is DIAG-4-deferred and every input that
   emits the code today would observe the new text. This is the same objection
   0046 raises for its own class 1, and it holds here for a second, independent
   reason.

   If the disposition instead blesses the silence, no registry edit is needed and
   the obligation is entirely (a)'s sentence.

**(c) Joint consistency with bug 0046 — binding.** Two named couplings, both
verified:

- **The boundary.** `evaluateOccurrences:497`'s `.some` is what refuses A12 and
  admits A1. 0046 §Fix constraint 2 owns that asymmetry and states that any rule
  about an absent field "must state whether 'absent' means absent from every
  variant or from any variant". A resolution there that makes `anyNested` an
  `.every` moves A12 into this report's silence, widening this class. Whichever
  report lands second states A12's disposition explicitly.
- **The blessing wording.** 0046 §Fix candidate 4 drafts text under which a `by`
  clause suppresses detection "whether or not its field resolves". If that
  wording lands as written it settles this class in the silence direction as a
  side effect. Either 0046's text is scoped to a field that does **not** resolve,
  or this report's disposition is decided in the same change. The two must not be
  settled independently in opposite directions.

  What is **not** coupled: 0046's class-2 disposition (a `by` over non-object
  arms) is reached by a gate that never calls `checkDiscriminatedUnion` and is
  free of this question entirely.

**(d) Ordering against bug 0095 — binding.**
[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) inherits bug
0096 §Fix witness item 4: a `parseDoc` cell for
`Cat { kind: {a: integer} | {b: string}, … }` under
`schema Animal by kind = Cat | Dog` asserting a **clean load**, with
`kind: "a" | "b"` beside it as the parity control. Both halves are this report's
subject, and under a refusing disposition both invert. So: **either this
disposition is settled first and 0095 writes that cell to it, or 0095 lands first
and this fix rewrites it.** 0095 must not be held for this adjudication — its
three elements (the destroyed field list, the split `let`, the phantom `fn`
parameters) are independent of it, and its stated §Fix produces the clean load as
the *removal of a misattributed diagnostic*, which is correct relief regardless
of what a discriminator rule later adds. State in whichever lands second which
cell moved and why.

**(e) The two silence pins move deliberately, never silently.** Bug 0096's
witness is 9 tests and stays green in every other respect. Under a refusing
disposition exactly two assertions change:
`tests/discriminator-field-classifier-brace-group.test.ts:509–512` (the seam's
`[]` for a `{}`-classified field under `by kind`) and `:869–876` (the end-to-end
`diagnostics: []` for `kind: "a" | "b"` under `by kind`). Neither may be reached
by deleting a cell; each carries an in-cell statement of what it asserts and why,
and each is rewritten with the citation that decides it. Untouched under either
disposition: item 1's predicate table and its refinement/crossing-set claims
(they concern a string predicate, not a disposition), item 2's implicit-path
equality cell, and item 3's `typeSource` capture columns. Also untouched:
`tests/schema-alias-union-decl.test.ts` cells h1/h2/h3 (the implicit position),
i1, i3, and 0046's i2 and n22.

**(f) The implicit path stays byte-identical, and the classifier stays
module-private.** Two constraints inherited from 0096.
`detectImplicitDiscriminator`'s filter (`presentInAll && allLiteral`,
`schema-declarations.ts:539–541`) reads no other property of a non-literal field,
and 0096's item-2 second cell asserts its two rows **equal to each other**
precisely so a later change cannot widen a defect's reach through it. A fix here
adds no `nested`- or non-literal-dependency to that path: the implicit
disposition (`missing-discriminator`) is already correct and is what group (h)
pins. Separately, `classifyDiscriminatorFieldType` is not exported and 0096 §Fix
forbids exporting it for a test; any new check belongs in
`schema-declarations.ts`, whose `checkDiscriminatedUnion` is already exported and
is already the seam 0096's item 2 drives.

**(g) GOV-15 runs in the refusing direction.** Every fixture of §Reproduction's
class 1 except A11, A12 and A14, and every class-2 fixture except B4, loads with
zero error-severity diagnostics
([loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly),
`source-language-stability.md:9`). Refusing any of them moves inputs out of that
set and relies on the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
(`:25`), whose in-scope input set is defined post-hoc over the release diff. The
resolution enumerates the inputs it moves — including the field types beyond
`"a" | "b"` (`string`, an `enum` name, `integer`, `array<string>`, `"cat" |
null`, a named object schema) and both class-2 spellings — rather than naming one
fixture and leaving the rest to inference. Blessing the silence moves no input
and engages no carve-out.

**Two further obligations on any implementation.**

- **Assess the H9a and committed-fixture surfaces explicitly.** A newly-reachable
  `theta/parse/*` code is what those gates exist for.
  `tests/fixtures/h7a/permitted-codes.json` (blob `a4a8da04…`) carries no
  `theta/parse/*` code at all, and the H9a empty-capture stderr gate's allowlist
  ships empty (`tests/live/acceptance/harness.ts:468–494`), so a parse-time
  refusal reaches neither unless a fixture is added that drives a `by` clause —
  and no committed `.theta` or `.thetalib` carries one today
  (`tests/committed-fixture-parse-gate.test.ts`; the `rg` over both globs is
  empty). State the measurement rather than the inference, as 0096's fix record
  does for the same two surfaces.
- **Source every expected message from the registry.** DIAG-4
  (`diagnostic-shape.md:74`) and the precedent of the two witness files here,
  both of which read messages through `parseRegistry` / `registryMessage` rather
  than copying prose.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `parseDoc` or one `checkDiscriminatedUnion` call, so the harness is the two
existing files extended, not a new mechanism. Required either way: the class-1
table A1–A10 with its no-clause column; the four controls A11–A14, which are what
red if a fix over-reaches into the nested, non-string or well-formed cases; the
`.thetalib` spelling; the captured `typeSource` for every field spelling, so a
later capture change cannot move a row unobserved; the A4 lowering with its
byte-identity assertion between `Cat` and `Dog`, which is the evidence the
admitted state is degenerate; and the F1 row (`by name` over `name: string` while
`kind` is a valid discriminator), which is the sub-case that decides (b)'s
candidate 3. Class 2's rows B1–B5 travel with whichever change carries 0095's
widened capture, as bug 0096 §Fix item 4 already assigns them.

## Fix (0.157.0)

- What shipped:
  - `src/parser/schema-declarations.ts` — §Fix (a) Reading A, §Fix (b)
    candidate 1: `checkExplicitDiscriminator` gains a fourth gate
    (`:645`, `evaluation.presentInAll && !evaluation.allLiteral`) emitting
    `theta/parse/non-literal-discriminator` through a `nonLiteralDiagnostic`
    helper (`:668`) at the declaration's own range (DIAG-1). Placed after the
    `anyNested` gate, so a nested occurrence keeps its more specific code, and
    before the non-string gate, which presupposes a literal this evaluation does
    not have. `evaluateOccurrences`, `FieldEvaluation`,
    `detectImplicitDiscriminator` and `checkByClause` are byte-unchanged (§Fix
    (f)); `theta-document.ts` is untouched, so the classifier stays
    module-private.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:109` — the DIAG-2
    same-commit registry row (E, parse). Its *Trigger* enumerates the emission
    set — a literal-union, a bare `string`, an `enum` name, `integer`,
    `array<string>`, `"cat" | null`, a named object schema, a brace-rooted union
    of `ObjectType` arms — and excludes bug 0046's absent-field class by name.
  - `docs/spec_topics/schemas.md` §Discriminated unions — the one sentence §Fix
    (a) owes, placed beside the explicit form and scoped to a field that
    **resolves in every variant**, so bug 0046's two classes stay unsettled.
  - `docs/reference/diagnostics.md`, `docs/reference/schema-subset.md` — the
    user-facing mirrors, identical *Message* bytes. `docs/reference/grammar.md`
    verified unaffected (it mirrors only the `by` grammar alternative).
  - Placeholder surface untouched and closed: the *Message* reuses `<field>`
    (placeholder-rendering-b.md §5, source-derived identifier sub-rule) and
    `<X>` (§7, identifier-shaped sub-rule). No new placeholder, no closed-enum
    table widened.
- Route settled on measurement, not preference. §Fix (b) candidate 2 (widening
  `non-string-discriminator`'s *Trigger*) is ruled out: that row's `<kind>` is a
  closed value table — `string`, `integer`, `number`, `boolean`, `null`, "the
  type-kind of the offending literal" (`placeholder-rendering-b.md` §7) — and
  this class carries no literal, so the widened set cannot render `<kind>`;
  extending a category-7 closed table is a GOV-7 / GOV-8 breaking change to the
  rendering surface even where the row is unchanged (§7's *Category 7 closed-enum
  closure*). Candidate 3 stays rejected on the *Message*, and the F1 row (`by
  name` over `name: string` while `kind` is a valid discriminator) is the witness
  cell that scores it. What remains is candidate 1.
- Gates: witness `npx vitest run tests/non-literal-by-field-refusal.test.ts` →
  `Test Files 1 passed (1) / Tests 12 passed (12)`; default suite `npm test` →
  `Test Files 350 passed (350) / Tests 6982 passed (6982)`;
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) clean;
  `npm run lint` (`eslint "src/**/*.ts"`) clean. Live, run for real and
  re-run independently after the review loop: H8a
  `npx vitest run --config config/vitest/vitest.live.config.ts
  tests/live/live-production-acceptance.test.ts -t "cell 78"` → 1 passed;
  H9a `… tests/live/acceptance/non-literal-discriminator-live.test.ts` →
  1 passed.
- Blast radius, premeasured before the witness was written: a prototype gate over
  the whole default suite reddened exactly four cells in two files, every one of
  them authorized by name — the two bug 0096 silence pins (§Fix (e)) and bug
  0095's inherited item-4 cell (§Fix (d)). No unauthorized flip, and no protected
  witness moved.
- Review: 2 rounds. Round 1 (deep) — six findings, none on the gate: one mirror
  sentence that cut on "not a single **string** literal" and so wrongly claimed
  the `kind: 1` case, a stale exhaustive enumeration on `checkDiscriminatedUnion`,
  two historical-narrative test comments, three stale line citations in the
  witness, one banned word, one orphaned source line. Round 2 (fast) — CLEAN, with
  every finding re-verified and the emitted / registry / mirror *Message* bytes
  re-compared independently.
- Verification: VERIFIED. (i) The witness reds without the fix — the gate
  neutralised in place, nine cells across the three affected files reading
  "expected `[theta/parse/non-literal-discriminator]`, observed `[]`", then the
  file restored by writing the original bytes back and the restore proved by
  `git hash-object` against the pre-edit capture. (ii) Default suite green,
  350/6982. (iii) Live coverage exists on both halves and was red-proven in both
  directions under the same neutralisation. (iv) Lint and typecheck clean.
  (v) The DIAG-2 closed-set reconciliation (`tests/code-registry.test.ts`, and
  the corpus-wide closing gate `tests/live-corpus-release-gate.test.ts` inside
  `npm test`) is green with the new row, so the row has an asserting test and the
  asserting tests have a row.
- Tests that lock it:
  - `tests/non-literal-by-field-refusal.test.ts` (new, 12 cells) — class 1 rows
    A1–A10 with their no-clause column, the `.thetalib` spelling, the four
    controls A11–A14 (A11/A12 keep `nested-discriminator`, A13 stays clean, A14
    keeps `non-string-discriminator`), the eight-row `typeSource` capture table,
    F1, class-2 rows B1–B5 with the post-0095 reachability asserted as a
    precondition, the A13 lowering, and three seam cells over the exported
    `checkDiscriminatedUnion` — including the **bug 0046 boundary**: an absent
    `by` field (`presentInAll === false`) still returns `[]`.
  - `tests/discriminator-field-classifier-brace-group.test.ts` — the two §Fix (e)
    pins rewritten in place, never deleted, each keeping its in-cell statement
    and now citing what decides it. Item 1's predicate table, item 2's
    implicit-path equality cell and item 3's `typeSource` columns are unchanged.
  - `tests/brace-rooted-union-arm-capture.test.ts` — bug 0095's inherited
    item-4 cell rewritten per §Fix (d); its describe/cell titles no longer claim
    "loads clean".
  - `tests/live/live-production-acceptance.test.ts` (H8a, cell `cell 78`) — the
    bad spelling does not register and the `theta-system-note` channel carries
    the registry-sourced fragment; the valid-discriminator sibling under the
    identical `by kind` clause registers **and drives** a real turn to a pinned
    sentinel with zero system notes.
  - `tests/live/acceptance/non-literal-discriminator-live.test.ts` (H9a,
    `cell 78`) — the same two spellings through the real `pi -p` binary.
- GOV-15 (§Fix (g)): the refusing direction moves inputs out of the
  [loads-cleanly set](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
  and relies on the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out).
  The moved set, enumerated rather than left to inference: class 1 rows A1–A10 —
  a `by` field typed `"a" | "b"`, `"a" | "b"` / `"c" | "d"`, `string`,
  `string` / `string`, a declared `enum` name, `integer`, `array<string>`, the
  three-arm spelling, `"cat" | null`, and the wire-renamed `kind as "Kind"`
  spelling — the `.thetalib` spelling of each, the F1 arrangement (`by name`
  over `name: string` while a valid `kind` exists), a `by` field typed as a
  named object schema, and class 2 rows B1–B3 and B5 (`{a: X} | {b: Y}`,
  `{ type: "x" } | "cat"`, `{a: X} | null`, and the `"a" | "b"` parity row).
  A11, A12, A14 and B4 were already outside the set and keep their codes.
- H9a and committed-fixture surfaces, measured rather than inferred: the H9a
  probe run's combined stdout+stderr was scanned with the same
  `parseSystemNoteCodes` regex the nine-area manifest scores, for
  `theta/parse/non-literal-discriminator` — observed empty, because a load
  diagnostic lands on the private `theta-system-note` channel and never on
  `pi -p` print-mode output. `tests/fixtures/h7a/permitted-codes.json` is
  therefore **unchanged** and still carries no `theta/parse/*` code. No
  committed `.theta` or `.thetalib` carries a `by` clause, so
  `tests/committed-fixture-parse-gate.test.ts` witnesses neither class and stays
  green over the shipped corpus.
- A12's disposition, stated explicitly as §Fix (c) requires: a mixed arrangement
  with one nested occurrence keeps `theta/parse/nested-discriminator`, because
  the `anyNested` gate is still asked first. This fix does not touch
  `evaluateOccurrences`' `.some`, so bug 0046 §Fix constraint 2 still owns that
  asymmetry; if it later becomes an `.every`, A12 moves into this row's emission
  set rather than into silence.
- Residuals: see `.pi/tmp/fixes/0128-report.md` §Residuals — the bug 0046
  coordination note this fix owes but did not write (0046 is open and owned
  elsewhere), the substituted lowering witness element, and one comment citation
  in a third file that this change's `docs/reference/schema-subset.md` rewrap
  shifted by four lines and that was deliberately not chased.
- Discharge notes appended: `0095` (its inherited item-4 cell moved here).
- Pinned dispositions / non-goals: bug 0046's two classes stay unsettled and
  their pins (`tests/schema-alias-union-decl.test.ts` i2, n22, and h1/h2/h3, i1,
  i3) are untouched; `{}` as a field type keeps both of its lines (bug 0129);
  `evaluateOccurrences`' `.some`/`.every` asymmetry is unchanged; the lowering of
  a literal-union or `enum`-typed field is unchanged; `nested-discriminator`'s
  and `non-string-discriminator`'s rows are not reworded (DIAG-4).

## Provenance

- Origin: the bug 0096 fix (0.73.0, commit `f505fc4a`), which deferred this
  question twice by name — its §Non-goals ("The disposition of a resolved but
  non-literal `by` field. After the fix, `by kind` over a field typed
  `{a: X} | {b: Y}` loads clean, which is the disposition `kind: "a" | "b"`
  already receives. Whether that silence is the right end state is a spec
  question about `schemas.md:99–121`, adjacent to but not inside bug 0046's two
  classes. Not settled here") and its §Fix (0.73.0) *Residuals* (i)
  ("Deliberately pinned, not filed as a defect"). The same item is recorded in
  the uncommitted local run artefact `.pi/tmp/fixes/0096-report.md` §Residuals as
  item 1, with the note "surfaced not filed". This report files it, and adds what
  those records do not carry: the verification that the class is outside bug
  0046's two classes rather than the assertion of it; the reachable-at-HEAD input
  set beyond `"a" | "b"` (a bare `string`, an `enum` name, `integer`,
  `array<string>`, `"cat" | null`, a named object schema); the suppression column
  measuring what the clause removes; the lowered-byte evidence, including the
  byte-identical `Cat` / `Dog` `$defs` under `kind: string`; the per-fragment
  lowering table showing that the two refused shapes are the two carrying a
  `const`; the registry-row-by-row demonstration that no *Trigger* describes the
  input; the `nested-discriminator`-is-explicit-only argument; the boundary at
  `evaluateOccurrences`' `.some`; and the two coordination couplings to bug 0046.
- Spec: `docs/spec_topics/schemas.md:46` (§Wire-name renaming — the theta-side
  resolution rule for `by`), `:93` (literal-union recommended for inline
  enumerations), `:99–121` (§Discriminated unions in full: `:101` the all-object
  definition and implicit detection, `:103–105` the three properties of "The
  detected field" with `:104` the not-a-literal-union parenthetical, `:107`
  `non-string-discriminator` and its explicit-form sharing clause, `:109`
  `ambiguous-` / `missing-discriminator` and the provider-quality rationale,
  `:111–115` the explicit form, `:117` the `by`-on-object-body rule, `:119`
  `duplicate-discriminator-value` and the top-level rule with
  `nested-discriminator`, `:121` mixed unions);
  `docs/spec_topics/grammar.md:94` (`Type "|" Type`), `:101` (`ObjectType`),
  `:105` (the bare-`Type` positions), `:109` (§Inline object types), `:168–179`
  (§`schema X by <field>`: `:174` the explicit alternative, `:176` `UnionRhs`,
  `:179` the object-body rule);
  `docs/spec_topics/schema-subset.md:88` (Lowering Algorithm step 6 — detection
  is a parse-time sanity check, no lowered marker);
  `docs/spec_topics/diagnostics/code-registry-parse.md:56`
  (`by-on-object-schema`'s shape-cut *Trigger* and its hand-off to the
  discriminator rows), `:86` (`empty-schema-body`, class 2's code today),
  `:95–99` (the five discriminator rows, quoted in §Actual behaviour);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72`
  (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (§Closure);
  `docs/spec_topics/diagnostics/placeholder-rendering-b.md:5` (category 5,
  `<field>`), `:51` (category 7, `<X>`, `<kind>`);
  `docs/spec_topics/governance/source-language-stability.md:9` (the
  loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  User-facing mirrors: `docs/reference/schema-subset.md:86–99`;
  `docs/reference/diagnostics.md:55` (the header, no *Trigger* column),
  `:144–148` (the five *Message* rows); `docs/reference/grammar.md:314`.
- Implementation evidence at `04504288`:
  `src/parser/schema-declarations.ts:333–353` (the V5b header comment
  enumerating the seven codes this leaf implements),
  `:362–367` (`DiscriminatorCandidateField`, `literal` `:365`, `nested` `:366`),
  `:369–373` (`UnionVariantSchema`), `:380–384` (`DiscriminatedUnionDecl`),
  `:392–402` (`checkDiscriminatedUnion`'s dispatch, `:398`), `:409–415`
  (`fieldInVariant`), `:417–430` (`thetaNamedFieldInVariant`), `:433` (`orderedWireNames`),
  `:461–471` (`FieldEvaluation`), `:473–479`
  (`evaluateField`), `:492–532` (**`evaluateOccurrences`** — `presentInAll`
  `:496`, `anyNested` `:497`, `allLiteral` `:498–499`, the literal-derived
  properties `:501–505`), `:535–593` (`detectImplicitDiscriminator`, the
  candidate filter `:539–541`, `missing-discriminator` `:584–592`), `:596–648`
  (**`checkExplicitDiscriminator`** — the 0046-class-1 comment `:601–612`, the
  resolution `:613–616`, the three gates `:620`, `:634`, `:639–645`, the clean
  return `:647`), `:620–630` (the sole `nested-discriminator` emission site),
  `:651` (`nonStringDiagnostic`), `:684–702` (`ByClauseDecl` and its arm-count
  comment `:690–696`), `:710–729` (`checkByClause`, the union arm `:718–719`);
  `src/parser/theta-document.ts:2963–2966` (`parseType`'s leading-brace early
  return, bug 0095's), `:5717–5830` (`checkSchemaDeclarationGraph` — the
  `objectFields` feed `:5741`, the object-form `checkByClause` `:5767`, the
  arm-count classification `:5799`, the union-form `checkByClause` `:5819`, the
  gated `checkDiscriminatedUnion` `:5821–5829`), `:5887–5907`
  (`buildUnionVariantSchemas` and its three declining exits `:5891–5893`,
  `:5897–5899`, `:5900–5903`), `:5916–5924` (`discriminatorCandidateFields`, the
  classify call `:5922`), `:5926–5960` (the classifier's doc comment — the
  "never a discriminator candidate" clause `:5931–5932`, the structural-guard
  paragraph `:5938–5947`, the literal-union paragraph `:5949–5959`),
  `:5961–5990` (**`classifyDiscriminatorFieldType`** — the brace guard `:5965`,
  the `|` split `:5968–5970`, the literal tests `:5971–5988`, the terminal
  `return {}` `:5989`);
  `src/parser/body-type-lowering.ts:201–206` (the re-derived scoping paragraph),
  `:208–238` (`isSingleEnclosingBraceGroup`); `src/parser/params.ts:932`
  (`splitTopLevel`).
- Test evidence at `04504288`:
  `tests/discriminator-field-classifier-brace-group.test.ts` (bug 0096's
  witness, 9 tests, verified green at HEAD; the two-masks header `:40–56`, the
  module-privacy constraint `:66–73`, `animalVariants` `:475–486`, the seam cell
  asserting `[]` `:501–513` with the assertion at `:509–512`, the implicit-path
  equality cell `:515–529`, `catOnly` / `animalDoc` `:580–594`, the end-to-end
  cell `:818–893` with the literal-union row observed at `:832` and expected at
  `:869–876`); `tests/schema-alias-union-decl.test.ts:296–301` (group (h)'s two
  literal-union fixtures), `:1370–1375` (group (h)'s header, citing detection
  rule 2), `:1378–1387` (h1), `:1389–1405` (h2), `:1407–1420` (control h3),
  `:1431–1449` (i1, the positive control), `:1451–1464` (i2 — bug 0046 class
  1's pin, subject line `:1462`), `:1466` (control i3), `:2132–2137` (group
  (q)'s header), `:2140–2156` (n22 — bug 0046 class 2's pin);
  `tests/disc-unions-recursion.test.ts:173–196` (the seam-level
  `nested-discriminator` cell), `:200–216` (the `checkByClause` cell);
  `tests/committed-fixture-parse-gate.test.ts` (no committed fixture carries a
  `by` clause); `tests/fixtures/h7a/permitted-codes.json` (blob
  `a4a8da04209f90e13d815edd92c1fc682e2a2236`, no `theta/parse/*` code);
  `tests/live/acceptance/harness.ts:115–117`, `:468–494` (the permitted-code
  path and the empty-capture stderr gate); `tests/helpers/e2e-s1.ts:39`
  (`parseDoc`).
- Reproduction: two scratch vitest files in a `git worktree` detached at
  `04504288` — the class-1 table A1–A14 with its five no-clause rows, the eight
  captured field types, the `.thetalib` pair, the `params:` lowerings read as
  `$defs` bytes with the `Cat`/`Dog` byte-identity check and the with/without-
  clause document comparison, the five single-field lowered fragments, and the
  seven-row F table (including `by name` over a non-literal while a valid
  discriminator exists, and the half-present row that belongs to bug 0046); then
  a third file with bug 0095's §Fix applied as a temporary probe (its two
  specified hunks, 5 insertions / 9 deletions) for class 2's rows B1–B5. Run on
  the outputs quoted above; the worktree and every file in it were removed. No
  file in the main tree was written by the probe. `src/`, `tests/`,
  `docs/bugs/README.md` and every other bug document are unmodified by this
  filing.

### Discharge note — bug 0046 (0.253.0)

§Fix (c)'s boundary is settled, in the refusing direction, by the report this
one is coupled to. [0046](./0046-by-clause-undecided-inputs-load-silently.md)
§Fix (0.253.0) mints `theta/parse/absent-discriminator-field` (E, parse) on
`!presentInAll`, gated one step earlier than this report's
`presentInAll && !allLiteral`, so a `by` clause naming a field at least one
variant does not declare is now refused rather than silent. Two consequences
here. This file's seam cell "an ABSENT `by` field still returns no diagnostic —
the bug 0046 boundary" was rewritten in that change to assert the new code; it
remains the boundary witness, now on the settled side. And the registry
sentence in `theta/parse/non-literal-discriminator`'s *Trigger* that fenced the
absent-field class out as "unsettled" now names the new row instead. Nothing
this report decided moved: the `presentInAll` half of the partition, its twelve
cells, and its *Message* bytes are unchanged.
