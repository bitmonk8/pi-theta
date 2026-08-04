# Bug 0129 — `{}` as a schema field type named by an explicit `by <field>` draws two `E`-severity diagnostics for one written mistake: bug 0045's inline `theta/parse/empty-schema-body` naming `'{}'`, and then `theta/parse/nested-discriminator`, whose *Trigger* describes a discriminator sitting one level down inside an object — a nesting `{}` does not contain — while no sentence in `diagnostic-shape.md` governs whether a second code may fire for a field type an earlier code already refused

- **Status:** open. §Fix is not settled: this report exists to pin the
  disposition of the second diagnostic before any code lands. No ordering
  dependency in either direction. The subject input's field survives capture at
  HEAD (measured: `Cat.kind` is captured with `typeSource` `{}`), so
  [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md)'s widening
  does not gate this fix and this fix does not gate 0095; the coordination the
  two owe each other is in §Fix (e).
- **Sev/Diff estimate:** S2/D3 — two `E`-severity lines for one written
  mistake, the second naming a nesting the source does not contain; no value is
  corrupted and the load is refused either way, so the cost is diagnostic
  quality rather than silent wrong behaviour. D3 because the disposition and a
  possible DIAG-2 *Trigger* narrowing are adjudicated in-run, and bug 0096's
  9-test witness pins the pair as expected output, so any route moves a sibling
  witness's asserted bytes deliberately.
- **Kind:** defect on the second emission, plus a spec gap on the count.
  1. *An emission whose registry row does not describe the input, on the
     better-supported reading.* `theta/parse/nested-discriminator`'s *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:98`) is
     "Discriminator field is not at the top level of each variant (e.g.
     `kind: { type: "x" }`)", and its home rule
     (`docs/spec_topics/schemas.md:119`) reads "The discriminator field must
     live at the **top level** of each variant; nested discriminators
     (`kind: { type: "x" }`) are `theta/parse/nested-discriminator`." Under
     `kind: {}` the field `kind` *is* at the top level of the variant and the
     brace group declares no field at any level, so there is no discriminator
     one level down for the rule to name. The rendered line —
     `discriminator field 'kind' must be at the top level of each variant of
     Animal` — directs the author to move a field that is already there. Under
     [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) the
     registry is the closed authority for what the runtime emits, so an
     emission outside the row as written is a defect against the row.
     §Expected behaviour argues this against the two competing readings; the
     adjudication is this report's deliverable.
  2. *No rule governs two codes for one root cause.*
     `docs/spec_topics/diagnostics/diagnostic-shape.md` carries two paragraphs
     about diagnostic multiplicity and neither reaches this shape: `:65`
     (*Multi-error reporting*) requires every parse pass to collect **all**
     errors before failing rather than fast-failing, and `:24` (*Re-scan
     deduplication*) forbids the renderer suppressing the **same** diagnostic
     recurring across watcher-triggered reloads. Neither states how many codes
     one written mistake may draw. The only "cascade" decision anywhere in the
     four registry pages is row-local — `theta/load/settings-value-out-of-range`
     (`code-registry-load.md:53`) states "no per-key cascade fires" for one of
     its own sub-cases — which shows the corpus deciding the question per row
     and never in general. That absence is part of this report.
- **Related:**
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **fixed (0.57.0)**, and the owner of the **first** diagnostic, which is the
    correct half. Its fix put one rule at one construction point: `walkType`'s
    `object` arm raises `theta/parse/empty-schema-body` for a brace interior
    that carried no token and was closed (`src/parser/type-grammar.ts:467–477`),
    through the sole constructor `emptySchemaBodyDiagnostic`
    (`src/parser/schema-declarations.ts:63–74`), rendering the author's own two
    bytes as the `<X>` subject. The schema body field type is one of the
    positions `docs/spec_topics/grammar.md:105` enumerates and
    `:109` prescribes the rule for, and 0045's same-commit *Trigger* widening
    put the inline case in the row (`code-registry-parse.md:86`: "An empty
    inline object type (`{}`) in any `Type` position, at any nesting depth").
    Measured below: with no `by` clause that line is the whole disposition.
    This report does not reopen it. Its §Fix *Multiplicity* clause (`:212–220`)
    is the nearest thing to a count contract in the corpus — "One diagnostic
    per occurrence, in source order, no dedup" — and it is scoped to that one
    code, so it does not dispose of a second code for the same occurrence.
  - [0096](./0096-discriminator-field-classifier-naive-brace-test.md) —
    **fixed (0.73.0)**, the report whose re-derivation found this and whose
    witness pins it. This defect is **pre-existing and independent of that
    fix**: 0096 substituted the structural `isSingleEnclosingBraceGroup`
    (`src/parser/body-type-lowering.ts:208`) for the naive
    `s.startsWith("{") && s.endsWith("}")` at one classifier site, and `{}`
    answers `true` under **both** (measured — the predicate's own first
    statement at `:209` IS the naive test), so the classification of `{}` and
    every observable downstream of it are byte-identical either side of that
    commit. 0096's own §Fix (0.73.0) record states the finding at `:691–694`
    ("Two additions the report's tables do not carry: a `{}` field type draws
    bug 0045's `theta/parse/empty-schema-body` naming `'{}'` **in addition to**
    the discriminator outcome (`schema Cat { kind: {}, … }` under `by kind`
    renders `empty-schema-body` then `nested-discriminator`)") — a place that
    document is incomplete rather than wrong. Its witness pins the pair as
    expected output; §Fix (a) states what a fix must move.
  - [0093](./0093-let-annotation-query-position-double-emission.md) — **open**,
    the corpus's established duplicate-diagnostic report, and a **different
    mechanism** that does not own this instance. Its §Kind is "One occurrence in
    source, two entries in the document's diagnostic list", where the two
    entries carry the **same** code at two ranges because `parseLet` copies the
    annotation text onto the query node and two walk arms run the same
    `parseTypeExpression` pass over it; its own words are that "the duplication
    is a property of the check-site topology, not of any one rule", and its
    §Fix's routes are all edits to that propagated-annotation re-walk. Here
    there is one check-site per code, the two codes differ, the two ranges are
    two different declarations, and the second code is not a repeat of the first
    but a second rule reading the same captured field. Its §Non-goals confines
    it further ("This report does not re-decide the `TypePosition`
    classification … it settles how many times one occurrence is reported"), and
    it names its subject as the `let`-annotation-over-bare-query position
    throughout. So this is not a narrow instance of 0093: the two reports share
    only the observation that the corpus has no general count rule, which 0093
    also records (`diagnostic-shape.md:65` "states no count, so the count
    contract has to come from elsewhere"). Any route here that introduces a
    general count or cascade rule reaches 0093's subject too, which §Fix (c)
    records as a constraint rather than an invitation.
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) —
    **open**, in flight, and the adjacent input class. It widens
    `parseType`'s schema-field capture so a brace-rooted union arm no longer
    ends the field type at the first balanced group. Measured at HEAD:
    `kind: {} | null`, `kind: null | {}` and `kind: {a: integer} | {b: string}`
    all lose `Cat`'s whole field list and draw one `empty-schema-body` naming
    `'Cat'` — so none of them reaches this report's pair today. §Fix (e)
    reports what changes when 0095 lands, derived from measurement rather than
    predicted.
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — **open**, and
    the owner of two constraints this fix must not disturb. Its §Fix
    constraint 2 owns the `.some`/`.every` asymmetry in `evaluateOccurrences`
    (`anyNested` is a `.some`, `src/parser/schema-declarations.ts:497`, while
    `allLiteral` is conjoined with `presentInAll`, `:498–499`), which is why
    `{}` in **one** variant of a three-variant union fires for the whole union
    (measured). Its class 1 — an explicit `by` naming a field no variant
    declares — is also measured here as a control: `by ghost` over the same
    fixture draws the `empty-schema-body` line alone, the silence 0046 records.
    Its citation of the asymmetry (`schema-declarations.ts:480–481`) is stale at
    HEAD; the lines are `:496–499`.
- **Affected** (every citation verified at HEAD `04504288`, 0.73.0; symbols
  cited with their current lines):
  - `src/parser/schema-declarations.ts:596–648` — **defect site**,
    `checkExplicitDiscriminator`. The `anyNested` gate is `:620`; the
    `theta/parse/nested-discriminator` object is built inline at `:621–629`
    with the message at `:627`; the gate returns immediately, so this code and
    the two below it in the same function (`:634–636` non-string, `:639–645`
    duplicate-value) are mutually exclusive. This is the sole construction
    point for the code — no shared constructor, unlike `nonStringDiagnostic`
    (`:651`) and `duplicateValueDiagnostic`.
  - `src/parser/schema-declarations.ts:492–531` — `evaluateOccurrences`, the
    only producer of `anyNested` (`:497`, a `.some` over the per-variant
    occurrences). `FieldEvaluation.anyNested` is declared at `:464`.
  - `src/parser/schema-declarations.ts:392–401` — `checkDiscriminatedUnion`,
    the dispatch: `decl.by !== undefined` (`:398`) routes to
    `checkExplicitDiscriminator` (`:399`), otherwise to
    `detectImplicitDiscriminator` (`:535`). The implicit arm filters on
    `presentInAll && allLiteral` (`:541`) and never reads `nested`, so a
    `{ nested: true }` classification and an empty `{}` classification are
    indistinguishable on that path.
  - `src/parser/theta-document.ts:5961–5986` — `classifyDiscriminatorFieldType`,
    which decides `nested`. The structural guard runs first (`:5965`) and
    returns `{ nested: true }` (`:5966`) ahead of the top-level-`|` split
    (`:5968`); the ordering and the substituted predicate are bug 0096's
    subject and its doc comment records both (`:5926–5960`, the
    structural-versus-positional paragraph at `:5938–5947`). The function is
    **module-private** and has one caller.
  - `src/parser/body-type-lowering.ts:208` — `isSingleEnclosingBraceGroup`, the
    guard. Its own first statement (`:209`) is the naive two-ended test, so it
    is a conservative refinement of it and `{}` satisfies both. Its scoping
    paragraph (`:201–207`) names this classifier as a caller beyond the
    type-lowering dispatches and records `src/parser/params.ts:766` as the one
    remaining copy of the naive form, frozen by bug 0039 §Fix.
  - `src/parser/theta-document.ts:5916–5924` — `discriminatorCandidateFields`,
    the classifier's only caller, spreading its answer onto each field at
    `:5922`; `:5887–5905` — `buildUnionVariantSchemas`, which declines the whole
    union unless every arm is a bare identifier resolving to a captured
    object-form field list; `:5821–5829` — the gated `checkDiscriminatedUnion`
    call inside `checkSchemaDeclarationGraph` (`:5713`), with `objectFields`
    built at `:5730` and populated at `:5741`.
  - `src/parser/theta-document.ts:6188–6220` — `walkStatements`' `schema` arm,
    the **first** diagnostic's route. `checkObjectSchema` runs at `:6191`; the
    per-field loop opens at `:6206`; `parseTypeExpression(f.typeSource,
    "schema-feeding", { file, range: s.range })` at `:6214` is the call whose
    walk raises 0045's inline rule, ranged at the **declaration** because
    `SchemaFieldSource` carries no range of its own.
  - `src/parser/type-grammar.ts:467–477` — the first diagnostic's construction
    site: `walkType`'s `object` arm, keyed on `interiorHasTokens === false`
    (`:468`, set at `:348`) **and** `braceClosed === true` (`:473`, set at
    `:378`), pushing `emptySchemaBodyDiagnostic("{}", site)` at `:474`. The
    two-part key is 0045's — a malformed-but-non-empty interior and an
    unterminated `{` stay silent.
  - `src/parser/schema-declarations.ts:63–74` — `emptySchemaBodyDiagnostic`, the
    sole construction point for `theta/parse/empty-schema-body`, and its doc
    comment (`:55–62`) recording the two subjects: a declaration name from
    `checkObjectSchema`'s zero-field arm (`:95–98`) and the literal `{}` from
    `walkType`.
  - `src/parser/theta-document.ts:5679`, `:5694` — the two passes' order:
    `walkStatements` first, `checkSchemaDeclarationGraph` after. Emission order
    is therefore **not** the order the author sees.
  - `src/diagnostics/diagnostic.ts:107–127` — `assembleDiagnostics`, which
    flattens every group (`:111`) and sorts by `(file, line, col)`
    (`:116–126`), stable. This is why the pair's rendered order follows
    **declaration** order in the source rather than pass order, measured both
    ways below. `docs/spec_topics/implementation-notes.md:16` states the same
    contract.
  - `src/extension/production-composition.ts:2045–2052` — `hasLoadParseError`,
    the registration gate's predicate: any `error`-severity `theta/load/*` or
    `theta/parse/*` diagnostic blocks registration, and its doc comment
    (`:2039–2044`) states "Warnings never block registration". Call sites:
    `:2092` inside `parseDiscoveredTheta` (`:2079`, the discovered-theta path),
    `:1329` (`resolveCalleeArity`), `:1933` (`parseCalleeTheta`). Both codes
    here are severity `E`, so both lines are load-refusing.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:98` — the
    `theta/parse/nested-discriminator` row: severity `E`, phase `parse`, no
    *Hint*, *Message* `discriminator field '<field>' must be at the top level of
    each variant of <X>`, *Trigger* "Discriminator field is not at the top level
    of each variant (e.g. `kind: { type: "x" }`)". The *Trigger* under
    adjudication.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:86` — the
    `theta/parse/empty-schema-body` row, whose *Trigger* has carried the inline
    case since 0045's fix. `:96` — the `theta/parse/missing-discriminator` row,
    the implicit path's second line.
  - `docs/spec_topics/schemas.md:99–121` — §Discriminated unions. `:101` defines
    the construct and states detection is normally implicit; `:103–105` are the
    three detection rules (present in every variant, a single **string** literal
    type per variant, unique value); `:107` the non-string rejection; `:109` the
    ambiguous / missing dispositions; `:111–115` the explicit override
    (`schema Animal by species = Cat | Dog | Lizard`); `:117` `by` admitted only
    on the union form; `:119` the top-level requirement and the nested code.
    `:19` is the object-schema empty-body sentence `empty-schema-body`'s
    declaration subject answers to. Nothing in the section states what an
    explicit `by` naming a field whose type is an **empty** object draws, nor
    whether a field type already refused is still evaluated as a discriminator.
  - `docs/spec_topics/grammar.md:105` — the `Type`-position enumeration
    including schema field types; `:109` — §"Inline object types", the sentence
    prescribing `theta/parse/empty-schema-body` for `{}` in any `Type` position.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:65` — *Multi-error
    reporting*: every parse pass collects all errors and the theta "is rejected
    with the complete list in **one `pi.sendMessage` call per `.theta` file**",
    `details.diagnostics` carrying the structured array. This is why both lines
    reach the author and any structured consumer. `:24` — *Re-scan
    deduplication*, the one MUST NOT about suppressing duplicates, scoped to
    re-emission across reloads. `:71` — DIAG-1; `:72` — DIAG-2 (the registry is
    closed; a *Trigger* change is a spec change landing in the same commit);
    `:74` — DIAG-4 (the *Message* column is normative; a reword is deferred to
    theta 2.0).
  - `docs/spec_topics/diagnostics/code-registry-load.md:53` — the only
    cascade-suppression clause in the registry, row-local ("no per-key cascade
    fires"). Cited as the shape a per-row decision takes, not as authority here.
  - `docs/spec_topics/governance/source-language-stability.md:9` — the
    loads-cleanly predicate (no `E`-severity diagnostic); `:25` — the
    diagnostic-registry carve-out, which dispositions a *Trigger* change "as an
    addition for inputs newly brought into the code's emission set and as a
    removal for inputs taken out of it".
  - `docs/reference/diagnostics.md:147` and `:135` — the *Message*-only mirrors
    of the two rows. The page states at `:8–9` that the *Trigger* column "live[s]
    on the spec registry pages and [is] not restated here", so a *Trigger* edit
    does not reach this file.
  - `docs/reference/schema-subset.md:97` — the user-facing mirror that **does**
    restate the trigger in prose: "a non-top-level discriminator:
    `theta/parse/nested-discriminator`". `:45` and `:71`, plus
    `docs/reference/grammar.md:203–204` ("empty `{}` is
    `theta/parse/empty-schema-body`"), are the mirrors of the first code. Any
    *Trigger* narrowing reaches `schema-subset.md:97`.
  - `tests/discriminator-field-classifier-brace-group.test.ts` — bug 0096's
    witness, 894 lines, 9 tests, and **the only place in the tree that pins this
    pair**. Item 3's end-to-end cell asserts the two-line list verbatim:
    `label: "D — empty group, by kind"` with
    `diagnostics: [emptySchemaBodyLine("{}"), nestedDiscriminatorLine("kind",
    "Animal")]` (`:883–886`), beside the implicit twin
    `[emptySchemaBodyLine("{}"), missingDiscriminatorLine("Animal")]`
    (`:887–891`). The fixtures are built by `animalDoc` (`:586–594`) and read
    back by `loadRow` (`:571–578`) over `parseDoc`; the expected strings are
    sourced from the registry's *Message* column per DIAG-4
    (`nestedDiscriminatorLine` `:141–147`, `missingDiscriminatorLine`
    `:154–157`, `emptySchemaBodyLine` `:166–169`, the registry parse at `:100`).
    The single-declaration row for the same field type asserts the **one**-line
    list (`catOnly("B — an empty inline object type", "{}")` at `:675`, expected
    at `:803–804`), so the file already holds both dispositions and the
    difference between them is exactly this report's subject. That row also
    carries the only in-tree comment on the shape (`:798–802`): "An empty inline
    object type in a `Type` position draws `empty-schema-body` naming `{}` — the
    second half of that row's Trigger (code-registry-parse.md:86), independent
    of this fix and pinned as it stands, since `{}` is a single enclosing group
    under both predicates and keeps `{ nested: true }`." It records the
    independence from bug 0096's fix and the retained classification; it does not
    adjudicate the pair.
  - `tests/schema-alias-union-decl.test.ts:959–973` — RED b6, the **correct**
    case, `expectExactly` one `nested-discriminator` line over `F_NESTED`
    (`:258–260`, `kind: { type: "x" }` in both variants). `NESTED` is bound at
    `:175`. The cell must stay byte-identical under any route.
  - `tests/disc-unions-recursion.test.ts:173–190` — the seam-level nested cell,
    hand-building `{ name: "kind", nested: true }` for both variants
    (`:182–183`) and asserting the code fires. It drives
    `checkDiscriminatedUnion` directly with no field type at all, so it is
    unreachable by a fix keyed on the field's source text and reachable by one
    keyed on `anyNested`.
  - `tests/committed-fixture-parse-gate.test.ts:122` — the zero-diagnostics
    gate over every committed `.theta` / `.thetalib`. No committed file carries
    an empty inline object as a field type and none carries a `by` clause
    (`rg ':\s*\{\s*\}'` and `rg 'schema \w+ by '` over both globs are empty), so
    the gate never witnesses either shape. Neither code appears in
    `tests/fixtures/h7a/permitted-codes.json` (11 entries, none `theta/parse/*`).
  - **Test coverage of this defect as a defect: none.** The pair is asserted as
    expected output at `:883–886` and nowhere questioned.
- **Observed at:** `0.73.0` (HEAD `04504288`). Offline, deterministic; no live
  model, no provider. One scratch vitest file driving the shipped `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) plus the two exported production units the
  classifier composes (`isSingleEnclosingBraceGroup`, `splitTopLevel`,
  `src/parser/params.ts:932`) and the exported `checkDiscriminatedUnion` seam.
  Fifteen document fixtures, seven predicate rows, two seam rows and a
  twenty-iteration order-stability loop; written, run, deleted. No file in
  `src/`, `tests/` or any other bug document was modified.

## Summary

`schema Cat { kind: {}, name: string }` is one mistake: an empty inline object
written where a type belongs. On its own it draws one diagnostic, and that
diagnostic is right — bug 0045's inline rule, `theta/parse/empty-schema-body`
naming the author's own two bytes.

Add an explicit `by kind` over a union that includes `Cat` and the same source
draws a second `E`-severity line, `theta/parse/nested-discriminator`, saying
that `kind` "must be at the top level of each variant of Animal". `kind` is at
the top level of `Cat`. What the field lacks is a value: `{}` declares no field
at any depth, so there is no nested tag for the rule to name. The line the
author reads describes a source defect that is not there, and describes it
alongside the line that describes the one that is.

The mechanism is two independent readings of one captured field. The field
survives capture with `typeSource` `{}` (measured), so it reaches both:

1. `walkStatements`' `schema` arm sends the field's type source through
   `parseTypeExpression` at the `schema-feeding` position
   (`theta-document.ts:6214`), whose walk raises 0045's rule for a token-free,
   closed brace interior (`type-grammar.ts:467–477`).
2. `checkSchemaDeclarationGraph` classifies the same text for discriminator
   detection. `classifyDiscriminatorFieldType` (`theta-document.ts:5961`) asks
   `isSingleEnclosingBraceGroup` first; `{}` is a single enclosing group, so the
   field is marked `{ nested: true }` (`:5966`), `evaluateOccurrences` folds that
   into `anyNested` with a `.some` (`schema-declarations.ts:497`), and
   `checkExplicitDiscriminator`'s first gate (`:620`) emits.

Neither pass knows the other ran. Both codes are severity `E`, so
`hasLoadParseError` (`production-composition.ts:2045–2052`) refuses
registration on either alone, and `diagnostic-shape.md:65` puts both in one
batch — the author sees both lines and a structured consumer reads both entries.

This is **pre-existing and independent of bug 0096's fix (0.73.0)**. `{}` is a
single enclosing brace group under the naive two-ended test that fix removed and
under the structural predicate it installed (measured; the predicate's first
statement is the naive test), so nothing about this input moved. 0096's
orchestrator found it while re-deriving that report's baseline, recorded it in
the fix record at `:691–694`, noted it is absent from the bug document's own
tables, and pinned the behaviour as-is in the witness
(`tests/discriminator-field-classifier-brace-group.test.ts:883–886`). The
question this report asks — is the second diagnostic wrong, redundant, or
correct but noisy — was not asked there and is not settled by any spec sentence:
`diagnostic-shape.md` requires every error to be collected and forbids
suppressing repeats across reloads, and says nothing about two codes for one
root cause.

## Reproduction

Offline, at `04504288`. Every fixture is a whole source string driven through
`parseDoc` (`tests/helpers/e2e-s1.ts:39`), the shipped load path with the
standard inert `parseDeps` double. The frontmatter is `---\nmode: prompt\n---`
and each body ends with a tail expression, except the `.thetalib` row which
carries neither. `diags` is `doc.diagnostics` rendered
`<severity> <code>: <message>  @<line>:<col>-<line>:<col>` in list order.

### The pair

```
@@ A1 — the field type alone: schema Cat { kind: {}, name: string }
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @4:1-4:38

@@ A2 — the same, under an explicit `by kind`
       schema Cat { kind: {}, name: string }
       schema Dog { kind: "dog", name: string }
       schema Animal by kind = Cat | Dog
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @4:1-4:38
   error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal  @6:1-6:34
```

A1 is the whole disposition for the same field type when no `by` clause names
it. A2 adds the second line and changes nothing else: the first line's code,
message and range are byte-identical across the two.

### The order is stable, and it is source order — not a fixed pairing

Twenty parses of A2 produce **one** distinct rendering. The order is not a
property of the two checks, though: the first diagnostic is pushed by
`walkStatements` (`theta-document.ts:5679`) and the second by
`checkSchemaDeclarationGraph` (`:5694`), which runs after it, and
`assembleDiagnostics` (`src/diagnostics/diagnostic.ts:116–126`) then sorts the
flattened list by `(file, line, col)`. Moving the union declaration above the
variants inverts the rendered order while the emission order is unchanged:

```
@@ A9 — the union declared FIRST
       schema Animal by kind = Cat | Dog
       schema Cat { kind: {}, name: string }
       schema Dog { kind: "dog", name: string }
   error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal  @4:1-4:34
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @5:1-5:38
```

So the pair is deterministic and its rendered order is the declarations' source
order. A route that suppresses one line must name **which** line, not "the
second".

### The second line is specific to the `by`-named field

```
@@ A14 — `{}` on a field the `by` clause does NOT name
       schema Cat { kind: "cat", tag: {}, name: string }  +  by kind
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @4:1-4:50

@@ A8 — `by ghost`, naming a field no variant declares (bug 0046 class 1)
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @4:1-4:38

@@ A15 — control: a non-empty group on a field the clause does not name
       schema Cat { kind: "cat", tag: { a: string }, name: string }  +  by kind
   (no diagnostics)
```

### The controls that show the second rule working correctly

```
@@ A4 — a genuine nested discriminator: kind: { type: "x" }  +  by kind
   error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal  @6:1-6:34

@@ A5 — a literal union: kind: "a" | "b"  +  by kind
   (no diagnostics)
```

A4 is the input `code-registry-parse.md:98` names verbatim, and it draws exactly
one line — the same line A2 draws as its second. A2 and A4 are therefore
indistinguishable to an author reading only that line, while the sources differ
in whether any nested tag exists.

### The pair's arity is not one-to-one with the mistakes

```
@@ A7 — `{}` on BOTH variants: two written mistakes, three lines
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @4:1-4:38
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @5:1-5:38
   error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal  @6:1-6:34

@@ A13 — three variants, `{}` on the middle one only
       Cat { kind: "cat" }, Dog { kind: {} }, Cow { kind: "cow" }  +  by kind
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @5:1-5:38
   error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal  @7:1-7:40
```

A7 shows 0045's per-occurrence contract holding (two empties, two lines) beside
one union-scoped line. A13 shows one `{}` in one of three variants firing the
union-scoped line, which is the `.some` at `schema-declarations.ts:497` — bug
0046 §Fix constraint 2's subject, not this report's.

### Spelling and nesting variants

```
@@ A6  — whitespace interior `{   }`, by kind        -> the same two codes  @4:1-4:41  @6:1-6:34
@@ A10 — wire-renamed `kind as "Kind": {}`, by kind  -> the same two codes  @4:1-4:48  @6:1-6:34
@@ A11 — the same declarations in a `.thetalib`      -> the same two codes  @1:1-1:38  @3:1-3:34
@@ A12 — `kind: {a: {}}`, by kind
   error theta/parse/empty-schema-body: '{}' has no fields; an empty schema cannot be validated.  @4:1-4:43
   error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal  @6:1-6:34
```

Each of A6, A10 and A11 renders the two codes and messages of A2 verbatim; only
the first line's end column moves, tracking its declaration's own length. The
whitespace interior is refused because 0045's key is the absence of an interior
token, not the absence of bytes; the wire rename does not interact, because an
explicit `by` resolves by theta-side name (`schemas.md:46`,
`thetaNamedFieldInVariant` at `src/parser/schema-declarations.ts:425`, called at
`:615`); and the
`.thetalib` spelling carries no frontmatter and behaves identically.

A12 is the discriminating case for any route. `{a: {}}` carries **two** distinct
defects — a nested discriminator value (the field `a` sits one level down, so
`nested-discriminator`'s *Trigger* describes it) and an empty inline object at
the inner position (0045's rule). Both lines are earned. A suppression route
keyed on "the field type drew `empty-schema-body`" removes a correct line here.

### The classification itself, over the two exported production units

`classifyDiscriminatorFieldType` is module-private. Composing the two exported
units it wires together — `isSingleEnclosingBraceGroup`
(`body-type-lowering.ts:208`) and `splitTopLevel` (`params.ts:932`) — reproduces
its answer for each captured spelling:

```
   src="{}"                     isSEBG=true   splitTopLevel|=1  =>  {"nested":true}
   src="{   }"                  isSEBG=true   splitTopLevel|=1  =>  {"nested":true}
   src="{type:\"x\"}"           isSEBG=true   splitTopLevel|=1  =>  {"nested":true}
   src="{a:{}}"                 isSEBG=true   splitTopLevel|=1  =>  {"nested":true}
   src="{}|null"                isSEBG=false  splitTopLevel|=2  =>  {}
   src="null|{}"                isSEBG=false  splitTopLevel|=2  =>  {}
   src="{a:integer}|{b:string}" isSEBG=false  splitTopLevel|=2  =>  {}
```

`{}` and `{ type: "x" }` receive the same classification, which is why they
receive the same second diagnostic. The naive two-ended test bug 0096 removed
answers `true` for `{}` as well — the structural predicate's own first statement
(`:209`) is that test — so this row is unchanged by that fix in both directions.

### The seam, hand-fed

```
   nested:true under by kind              :: ["error theta/parse/nested-discriminator: discriminator field 'kind' must be at the top level of each variant of Animal"]
   no classification (`{}`) under by kind :: []
```

`checkDiscriminatedUnion` is the only thing standing between the classification
and the diagnostic: `{ nested: true }` on one variant's `kind` emits, an
unclassified field emits nothing. The whole of the second line's cause is that
`{}` classifies as nested.

### The capture, for the record

```
@@ A2 capture
   Cat    fields=[{kind, typeSource "{}"}, {name, typeSource "string"}]
   Dog    fields=[{kind, typeSource "\"dog\""}, {name, typeSource "string"}]
   Animal by="kind" arms=["Cat","Dog"] fields=[]
```

The field survives capture. That is what distinguishes this input from bug
0095's, where the field list is destroyed before either check sees it.

### Bug 0095's input classes, measured at HEAD

```
@@ kind: {} | null,                  by kind -> ["error theta/parse/empty-schema-body: 'Cat' has no fields; …"]   Cat fields=[]
@@ kind: null | {},                  by kind -> ["error theta/parse/empty-schema-body: 'Cat' has no fields; …"]   Cat fields=[]
@@ kind: {a: integer} | {b: string}, by kind -> ["error theta/parse/empty-schema-body: 'Cat' has no fields; …"]   Cat fields=[]
```

One line each, subject `'Cat'` not `'{}'`, and no field list — none of these
reaches this report's pair today. §Fix (e) states what changes when 0095 lands.

## Expected behaviour

Two sentences bear on the second line, and they are the whole of what the corpus
says about it.

`docs/spec_topics/schemas.md:119`:

> Duplicate discriminator values across variants are
> `theta/parse/duplicate-discriminator-value`. The discriminator field must live
> at the **top level** of each variant; nested discriminators
> (`kind: { type: "x" }`) are `theta/parse/nested-discriminator`.

`docs/spec_topics/diagnostics/code-registry-parse.md:98`'s row — the *Trigger*
DIAG-2 makes canonical:

> Discriminator field is not at the top level of each variant (e.g.
> `kind: { type: "x" }`).

Three readings of `kind: {}` against that *Trigger* are available.

**Reading A — the second diagnostic is wrong: `{}` is not an input the *Trigger*
describes.** The *Trigger*'s subject is a *discriminator field* that "is not at
the top level of each variant". Under `kind: {}` the field named by the clause is
`kind`, and `kind` is declared at the top level of `Cat` — measured, the capture
records it as a first-class field of the declaration with `typeSource` `{}`. The
worked example the row gives, `kind: { type: "x" }`, has a discriminator-shaped
tag (`type: "x"`) one level down; that is what "not at the top level" names.
`{}` has no field at any level, so there is no tag whose position the rule can
be about. `schemas.md:119`'s two clauses read the same way: the requirement is
about *where the discriminator lives*, and its named failure is a nested one.
What is actually wrong with `kind: {}` is that the field's **type** is not a
single string literal — which is detection rule 2 (`schemas.md:104`) — and that
the type is an empty inline object, which `grammar.md:109` refuses outright and
`empty-schema-body` reports. Neither of those is this row.

**Reading B — the second diagnostic is inside the *Trigger* but redundant.** An
empty object type is an object type, so a field typed `{}` is a field whose
value is "an object rather than a top-level literal" — the phrasing the
implementation's own comment uses (`schema-declarations.ts:618–619`). On this
reading the code fires legitimately and the objection is arity: one written
mistake, two `E` lines, the second adding no information the first does not
carry, since `empty-schema-body` already refuses the same two bytes and already
denies registration.

**Reading C — correct and noisy by design.** `diagnostic-shape.md:65` requires
every parse pass to collect **all** errors "rather than fast-failing on the
first error", so a second independent check reporting its own finding is the
stated contract, and the author is entitled to both. On this reading nothing is
owed but a possible message improvement, which DIAG-4 defers to theta 2.0.

**Reading A is better supported.** Four reasons.

1. The *Trigger*'s discriminating clause is positional — *top level* against
   nested — and the row supplies the example that fixes its referent. Under
   Reading B the clause reduces to "the field's type is brace-rooted", which is
   a different predicate and one the row does not spell. It is also the
   predicate `classifyDiscriminatorFieldType` actually applies, and the gap
   between the two is exactly bug 0096's subject on a different input: that
   report's whole argument is that a brace-rooted **union** is not a nested
   object even though a positional brace test says it is. `{}` is the other
   direction of the same conflation — a brace group with nothing nested in it.
2. The rendered *Message* is a statement about the source, and under Reading B
   it is a false one. `discriminator field 'kind' must be at the top level of
   each variant of Animal` instructs the author to hoist a field that is already
   top-level. DIAG-4 fixes that text character-for-character, so the row cannot
   be repaired by rewording within theta 1.x; the only lever is which inputs
   reach it.
3. Reading C proves too much. `diagnostic-shape.md:65` is about not
   fast-failing across *independent* findings, and the corpus is willing to
   suppress a second emission when one finding is already reported: `walkExpr`'s
   query arm skips an empty annotation because "bug 0014's
   `theta/parse/empty-query-annotation` already owns that interior, and a second
   diagnostic here would double up" (`src/parser/theta-document.ts:6497–6500`),
   and `code-registry-load.md:53` states "no per-key cascade fires" for a
   settings root that is not an object. So collect-everything is not a licence
   for a second code on an input the first has already refused.
4. Reading A leaves every correct emission in place, which the measurements
   confirm is a non-empty set: A4 (`kind: { type: "x" }`), A12's outer group
   (`kind: {a: {}}`) and `tests/schema-alias-union-decl.test.ts` b6 all describe
   real nesting and all keep their line under it.

**What the corpus does not say, and this report asks for.** No sentence
disposes of the count. `diagnostic-shape.md:65` mandates collection and `:24`
forbids suppressing repeats across reloads; neither addresses two distinct codes
for one root cause, and no other paragraph on that page or on the four registry
pages states a cascade rule. The nearest count contract in the corpus is bug
0045 §Fix's *Multiplicity* clause (`:212–220`), which is per-code by
construction. So even under Reading B or C the corpus asserts no rule the
implementation is violating, and a fix that suppresses a line is choosing a
disposition the spec has not stated. That is why this report pins the
disposition before any code lands.

Expected concretely, under Reading A: `schema Cat { kind: {}, name: string }`
under `schema Animal by kind = Cat | Dog` draws exactly one `E`-severity
diagnostic — `theta/parse/empty-schema-body` naming `'{}'`, at the declaration's
range — and the theta does not register. `kind: { type: "x" }` keeps its single
`nested-discriminator`; `kind: {a: {}}` keeps both of its lines, each earned;
`kind: "a" | "b"` keeps its clean load; `by ghost` keeps bug 0046's silence; and
the implicit-detection path is unchanged in every case.

## Actual behaviour / root cause

**One captured field, two independent readers, no shared state.** The field
survives `parseType`'s capture with `typeSource` `{}` (measured), and two passes
of `checkStructural` then read it:

- `walkStatements`' `schema` arm (`theta-document.ts:6188–6220`) calls
  `parseTypeExpression(f.typeSource, "schema-feeding", { file, range: s.range })`
  at `:6214`. The type-grammar walk's `object` arm sees an interior that carried
  no token (`type-grammar.ts:468`) and a consumed closing brace (`:473`), and
  pushes `emptySchemaBodyDiagnostic("{}", site)` (`:474`). This is bug 0045's
  inline rule at bug 0045's construction point, ranged at the declaration
  because `SchemaFieldSource` carries no range.
- `checkSchemaDeclarationGraph` (`:5713`) builds `objectFields` from the same
  captured lists (`:5730`, `:5741`), and for each union declaration whose arms
  all resolve to captured object schemas (`buildUnionVariantSchemas`,
  `:5887–5905`) hands `checkDiscriminatedUnion` one
  `DiscriminatorCandidateField` per field (`:5821–5829`,
  `discriminatorCandidateFields` `:5916–5924`). Each field's classification is
  `classifyDiscriminatorFieldType`'s (`:5961`), whose first arm answers the
  structural brace question and returns `{ nested: true }` (`:5965–5966`).

Neither pass records what the other found, and no value flows between them. The
first pass's output is a `Diagnostic` in a list; the second pass's input is the
field's source text, which the first pass did not modify.

**`nested` has exactly one reader, and the explicit path's first gate is it.**
`evaluateOccurrences` folds the per-variant classifications into `anyNested`
with a `.some` (`schema-declarations.ts:497`), and
`checkExplicitDiscriminator`'s first test is `if (evaluation.anyNested)`
(`:620`), which returns the `nested-discriminator` diagnostic immediately
(`:621–629`). The comment above it states the ordering reason — a nested value's
"value/type cannot otherwise be read" (`:618–619`) — which is sound for
`{ type: "x" }` and vacuous for `{}`, whose value is not merely unreadable but
absent.

**The implicit path never reads `nested`.** `detectImplicitDiscriminator`
(`:535`) filters candidates on `presentInAll && allLiteral` (`:541`), so a
`{ nested: true }` field and an unclassified field are both dropped and the
union reports `missing-discriminator` either way. Measured: `kind: {}` under
implicit detection draws `empty-schema-body` then `missing-discriminator` — also
two lines, but the second one is defensible on its own terms (the union genuinely
has no shared single-literal discriminator field, which is exactly what
`schemas.md:109` prescribes the code for). That asymmetry is why this report's
subject is the explicit path, and why §Fix constrains the implicit path to stay
byte-identical.

**The `.some` widens the union-scoped line to any single variant.** One `{}`
among three variants fires for the whole union (measured, A13). Whether absent
and nested occurrences should fold that way is bug 0046 §Fix constraint 2's
question, untouched here.

**Both lines refuse the load, so neither is a soft warning.** Both rows carry
severity `E` (`code-registry-parse.md:86`, `:98`), and `hasLoadParseError`
(`production-composition.ts:2045–2052`) treats any error-severity `theta/parse/*`
diagnostic as blocking; `parseDiscoveredTheta` (`:2079`) returns the dropped arm
at `:2092`. `diagnostic-shape.md:65` then delivers the complete list in one
`pi.sendMessage` per file with `details.diagnostics` carrying the structured
array. So the second line is not additional detail on a surviving load — the
theta was already refused by the first, and the second is a second refusal
reason presented with equal weight.

**Nothing observes the pair.** The two codes are constructed in different files
by different functions with no shared registry of what has already been reported,
and `assembleDiagnostics` (`src/diagnostics/diagnostic.ts:107–127`) is a flatten
plus a positional sort with no key on code or subject. There is no seam at which
"this field already drew a refusal" is a readable fact.

## Why it matters

- **The second line makes a false statement about the source.** Measured:
  `discriminator field 'kind' must be at the top level of each variant of
  Animal` renders for a `kind` that is at the top level of every variant. Under
  DIAG-4 the wording cannot be corrected within theta 1.x, so the only available
  repair is which inputs reach it.
- **It is indistinguishable from the correct emission.** A2's second line and
  A4's only line are byte-identical, including range shape, while the sources
  differ in whether any nested tag exists. An author who fixes the nesting the
  message names finds the message unchanged, because there was no nesting.
- **Two refusal reasons for one mistake, both load-refusing.** The first line
  already denies registration. The second adds a second reason of equal
  severity, and structured consumers reading `details.diagnostics` as an array
  (`diagnostic-shape.md:65`) count two independent parse defects where the
  source has one.
- **The disposition is decided by the presence of an unrelated clause.**
  Measured: the same field type draws one line with no `by`, one line when the
  `by` names a different field, one line when the `by` names no field at all
  (bug 0046 class 1), and two lines when the `by` names it. The count is a
  property of a clause on another declaration, and no spec sentence connects the
  two.
- **The corpus states no rule either way.** `diagnostic-shape.md` mandates
  collecting every error and forbids suppressing repeats across reloads, and
  nothing on that page or in the four registry pages disposes of two codes for
  one root cause. Whichever way this lands, it lands as a new statement rather
  than as conformance to an existing one — which is the reason to pin it in
  prose first.
- **The tree's regression net holds the pair as expected output.**
  `tests/discriminator-field-classifier-brace-group.test.ts:883–886` asserts the
  two-line list inside a `toEqual` over ten labelled rows, so a change that
  removed the second line reds that cell as a regression until the cell is moved
  deliberately. The same file's single-declaration row (`:803–804`) asserts the
  one-line list for the same field type, so the file already documents both
  dispositions without adjudicating between them.
- **No fixture reaches it.** No committed `.theta` / `.thetalib` carries an
  empty inline object field type or a `by` clause, so
  `tests/committed-fixture-parse-gate.test.ts:122` never witnesses the shape and
  neither code is in `tests/fixtures/h7a/permitted-codes.json`. The pair is
  reachable only from author-written source, which is where it will be seen.

## Non-goals

- **Bug 0045's inline rule.** The first line is correct and stays. Its rule,
  its two-part interior key (`type-grammar.ts:468`, `:473`), its sole
  construction point (`schema-declarations.ts:63–74`), its `'{}'` subject and
  its declaration-scoped range are all settled by that report's fix (0.57.0) and
  are not reopened. Any route here that removes or narrows it is out of scope by
  construction.
- **The implicit-detection path.** `kind: {}` under `schema Animal = Cat | Dog`
  draws `empty-schema-body` then `missing-discriminator` (measured). The second
  line there is the disposition `schemas.md:109` prescribes for a union with no
  qualifying field, and it is reached without reading `nested` at all
  (`schema-declarations.ts:541`). Whether that pair is also over-long is a
  distinct question about a different code; §Fix requires the path to stay
  byte-identical.
- **The `.some`/`.every` asymmetry in `evaluateOccurrences`**
  (`schema-declarations.ts:496–499`). Bug 0046 §Fix constraint 2's subject.
  It decides how absent and nested occurrences fold across variants, which
  changes A13's reach but not whether `{}` should classify as nested at all.
- **Bug 0046's two undecided `by` classes.** `by ghost` (measured silent here)
  and a `by` over a non-object ≥2-arm union are that report's spec gap.
- **`theta/parse/nested-discriminator`'s *Message*.** DIAG-4 fixes it
  character-for-character and defers rewording to theta 2.0
  (`diagnostic-shape.md:74`). This report argues about which inputs reach the
  row, never about how the row reads.
- **The brace-rooted union-arm capture.** `kind: {} | null` and its siblings lose
  the field list before either check runs (measured). That is bug 0095's element
  1; §Fix (e) is a coordination note, not a claim on it.
- **`classifyDiscriminatorFieldType`'s ordering and its guard.** Bug 0096
  settled both at 0.73.0: the structural predicate, and the guard running ahead
  of the top-level-`|` split so `{ type: "x" | "y" }` still reports nested.
  Neither is reopened; a route that reorders them re-opens 0096.
- **`params.ts:766`'s naive brace test.** Bug 0039 §Fix freezes the `params:`
  position's lowered bytes and `body-type-lowering.ts:201–207` records the
  freeze. Untouched.
- **A general cascade or duplicate-diagnostic rule for the language.** §Fix (c)
  records that any route which states one reaches bug 0093's subject, which owns
  its own mechanism and its own §Fix. Widening this report into that rule is a
  scope change, not a fix.

## Fix

**Not settled.** This report exists to pin the disposition of the second
diagnostic first: whether `theta/parse/nested-discriminator` may fire for a
field type an earlier `E`-severity code has already refused, and if not, where
the suppression lives. Three routes are available, each with a different blast
radius, and none is selected here.

**(a) Route 1 — suppress the discriminator check for a field type that already
drew `empty-schema-body`.** The narrowest statement of intent and the widest
plumbing. There is no seam today at which "this field already drew a refusal" is
readable: the two passes are `walkStatements` (`theta-document.ts:5679`) and
`checkSchemaDeclarationGraph` (`:5694`), they run in that order over the same
statement list, and the only thing crossing between them is the shared
`Diagnostic[]` accumulator. A route here either (i) tests the accumulated list
for an `empty-schema-body` at the declaration's range before running the union
checks — which couples a check to another check's output and is keyed on a range
that is the declaration's, not the field's, so it cannot distinguish two fields
of one declaration (A7 has two); or (ii) re-derives emptiness inside the
classifier, which is the cheapest test but decides Reading A by implementation
rather than by the registry; or (iii) threads a per-field "already refused" flag
from the first pass to the second, which is a new data path across two files for
one input class. **A12 bounds every variant of this route**: `kind: {a: {}}`
draws `empty-schema-body` for the inner `{}` and `nested-discriminator` for the
genuinely nested outer group, and both are earned, so the test cannot be "the
field type drew `empty-schema-body`" — it has to be "the field type **is** an
empty object", which is a different predicate.

**(b) Route 2 — narrow the *Trigger* so an already-refused empty object is
outside it.** The disposition lands in the registry, where DIAG-2 says it
belongs, and the implementation follows. This is Reading A stated normatively:
the row describes a discriminator that sits below the top level, and an empty
object type declares no discriminator to place. The costs are exact. DIAG-2
(`diagnostic-shape.md:72`) makes the *Trigger* edit a spec change landing in the
**same commit** as the code change. The GOV-15 diagnostic-registry carve-out
(`source-language-stability.md:25`) dispositions it as a **removal** for the
inputs taken out of the emission set, which is admissible inside theta 1.x for
exactly those inputs; every input this narrows loses an `E` diagnostic while
keeping another one, so none of them moves into or out of the loads-cleanly set
(`:9`) — they were refused before and stay refused. The mirrors: `docs/reference/
diagnostics.md` carries no *Trigger* column and says so at `:8–9`, so it does not
move; `docs/reference/schema-subset.md:97` **does** restate the trigger in prose
("a non-top-level discriminator: `theta/parse/nested-discriminator`") and moves
in lock-step. Whether `schemas.md:119` also needs a clause depends on whether the
narrowing is a clarification of "nested" or an added exclusion; the route must
say which.

**(c) Route 3 — accept both lines and document the pair as intended.** The
cheapest in code (nothing changes) and the most expensive in prose: it commits
the corpus to a position on a question `diagnostic-shape.md` currently does not
address. It needs a sentence somewhere stating that independent checks report
independently even when an earlier `E` code has already refused the same source
text — which is a **general** rule, and a general rule reaches
[0093](./0093-let-annotation-query-position-double-emission.md), whose subject is
one occurrence drawing the same code twice and whose §Fix is itself unsettled
across three routes. Landing a general cascade rule here would pre-decide that
report. A row-local statement is the alternative — the shape
`code-registry-load.md:53` uses for its own sub-case — and it would sit in
`nested-discriminator`'s *Trigger* as an explicit inclusion, which is still a
DIAG-2 edit with the same same-commit and mirror obligations as (b), in the
opposite direction. Under this route the second line's *Message* stays false for
this input (DIAG-4 forbids the reword), which the route has to state rather than
leave implied.

**Constraints any route satisfies.**

1. **Bug 0096's witness moves deliberately, not incidentally.**
   `tests/discriminator-field-classifier-brace-group.test.ts` is 894 lines and 9
   tests, and its item-3 end-to-end test asserts ten labelled rows inside one
   `toEqual`. Two of them are this report's:
   `"D — empty group, by kind"` → `[emptySchemaBodyLine("{}"),
   nestedDiscriminatorLine("kind", "Animal")]` (`:883–886`), and
   `"D — empty group, implicit"` → `[emptySchemaBodyLine("{}"),
   missingDiscriminatorLine("Animal")]` (`:887–891`). Routes (a) and (b) invert
   the first; **the second must not move** (see constraint 3). The other eight
   rows and the single-declaration row at `:803–804` stay byte-identical, and the
   file's expected strings stay sourced from the registry's *Message* column
   (DIAG-4) rather than copied. The cell's comment, which frames the table as
   "both dispatch arms" of one dispatch, is rewritten to record the split rather
   than left asserting a symmetry the fix removes.
2. **The classifier stays module-private; no test-only export.**
   `classifyDiscriminatorFieldType` (`theta-document.ts:5961`) is not exported
   and bug 0096 §Fix forbids exporting it for a test; that report's witness
   composes its classification columns from the two exported production units
   instead (`isSingleEnclosingBraceGroup`, `splitTopLevel`). A route that adds a
   classifier arm inherits that constraint: the new behaviour is witnessed
   through `parseDoc` and through the exported `checkDiscriminatedUnion` seam, or
   composed from exported units, never through a new export or an
   `@ts-expect-error` into `src`.
3. **The implicit-detection path never reads `nested` and stays byte-identical.**
   `detectImplicitDiscriminator` filters on `presentInAll && allLiteral`
   (`schema-declarations.ts:541`), so `{ nested: true }` and `{}` are already
   indistinguishable there. Every implicit-path observable — including the
   `empty-schema-body` + `missing-discriminator` pair measured above and pinned
   at `:887–891` — is unchanged, and a route that alters what `nested` is set to
   (rather than who reads it) must prove that with the implicit rows as controls.
   Bug 0096's witness asserts the two implicit-path seam rows **equal to each
   other** for exactly this reason; that assertion stays.
4. **DIAG-2 obligations, if the *Trigger* moves.** Route (b) — and route (c)'s
   row-local variant — is a spec change landing in the same commit
   (`diagnostic-shape.md:72`), with `docs/reference/schema-subset.md:97` edited
   in lock-step and `docs/reference/diagnostics.md` untouched (no *Trigger*
   column, `:8–9`). No new code is minted and no code is removed, so DIAG-1 and
   DIAG-3 are not engaged and the closed registry's membership is unchanged. The
   *Message* is untouched under every route (DIAG-4, `:74`). GOV-15's
   diagnostic-registry carve-out (`source-language-stability.md:25`) covers a
   *Trigger* narrowing as a removal on its in-scope inputs; the route names those
   inputs.
5. **Bug 0045's inline rule keeps firing — it is the correct half.** Every
   route leaves `theta/parse/empty-schema-body` naming `'{}'` in place at the
   schema-field position, with its construction point
   (`schema-declarations.ts:63–74`), its two-part interior key
   (`type-grammar.ts:468`, `:473`), its call site (`theta-document.ts:6214`) and
   its declaration-scoped range unchanged. The per-occurrence contract holds
   too: A7's two sibling empties keep two lines.
6. **The correct nested emissions keep theirs.** `kind: { type: "x" }` (A4),
   `kind: {a: {}}`'s outer group (A12) and
   `tests/schema-alias-union-decl.test.ts:959–973` (b6, `F_NESTED` at
   `:258–260`) are the inputs the row is for. `tests/disc-unions-recursion.test.ts:173–190`
   hand-builds `nested: true` with no field type at all, so it is unreachable by
   a route keyed on source text and reachable by one keyed on `anyNested`; a
   route of the latter kind states what happens to that cell.
7. **Bug 0046's questions stay open.** The `.some` at
   `schema-declarations.ts:497` keeps its semantics (constraint 2 of that
   report), and `by ghost`'s silence (measured) is unchanged. A route that
   touches `evaluateOccurrences` rather than the classifier or the gate must say
   why it does not settle 0046 by side effect.
8. **Emission order and count are stated, not inherited.** The rendered order
   follows declaration source order through `assembleDiagnostics`'
   `(file, line, col)` sort (`src/diagnostics/diagnostic.ts:116–126`), measured
   both ways (A2 against A9). A route that removes "the second" line names the
   **code** it removes, and states the resulting count for A7 (two empties, one
   union) and A13 (one empty in one of three variants).

**(e) Coordination — bug 0095, reported as a finding.**
[0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) is open and
widens `parseType`'s schema-field capture. It does not gate this report: the
subject input `kind: {}` already captures as a field with `typeSource` `{}`
(measured), so this report's pair is reachable at HEAD and its disposition does
not depend on 0095. What 0095 changes is the **adjacent** input class, and here
is the measured basis rather than a prediction.

- At HEAD, `kind: {} | null`, `kind: null | {}` and
  `kind: {a: integer} | {b: string}` each destroy `Cat`'s field list and draw one
  `empty-schema-body` naming `'Cat'` — not `'{}'` — and reach neither check of
  this report (measured above).
- 0095 §Fix states what replaces that: the field list survives, so the
  declaration-subject line disappears and the field's type source reaches
  `parseTypeExpression` at `schema-feeding`, whose walk descends union arms and
  raises 0045's inline rule against the empty arm — "the `'{}'` rendering".
- The classification of the surviving text is measurable now, from the two
  exported production units: `{}|null` and `null|{}` are **not** single
  enclosing brace groups and split into two top-level segments, so the
  classifier answers `{}` — no `nested`. So `anyNested` stays false and the
  explicit `by kind` gate (`schema-declarations.ts:620`) does not fire.
- **The expected consequence is therefore one line, not a longer list**:
  `kind: {} | null` under `by kind` would draw one `empty-schema-body` naming
  `'{}'`, and `kind: {a: integer} | {b: string}` would draw none, which is the
  clean load 0096's fix record establishes by offline probe and which 0095
  inherits as witness item 4. Neither spelling joins this report's input class.
- **What is not verified**: 0095 has not landed, so the above is derived from its
  §Fix text plus HEAD measurements of the units involved, not observed. Whichever
  of the two lands second re-derives the other's rows. If 0095 lands first, this
  report's §Reproduction gains the three union rows as controls showing they stay
  single-line; if this report's fix lands first, 0095's inherited witness item 4
  is unaffected, since it asserts a clean load and neither route here adds an
  emission.

**Witness — offline, provider-free, unit tier.** Every row of §Reproduction
settles inside one `parseDoc` call, one predicate call or one
`checkDiscriminatedUnion` call, so the harness is bug 0096's witness extended
rather than a new mechanism, with expected messages sourced from the registry
per DIAG-4. Required: the A1/A2 pair and its order-stability loop; A9, which
pins that the rendered order is declaration order and not a fixed pairing; A4
and b6's fixture as the correct-emission controls; A12 as the two-earned-lines
control that no route may collapse; A7 and A13 for the count; A14 and A8 for the
clause-scoping and bug 0046's silence; A6, A10 and the `.thetalib` spelling; the
implicit-path rows asserted unchanged and equal to their present bytes; and the
three bug-0095 input classes recorded at whichever HEAD the fix lands on. A
route that narrows the *Trigger* additionally asserts that no other input loses
an emission, by re-running the whole of bug 0096's item 3 unchanged.

## Provenance

- Origin: the bug 0096 fix (0.73.0, commit `f505fc4a`), whose orchestrator found
  this while re-deriving that report's baseline eleven releases past the tree it
  was written at. Recorded twice: in the bug document's own §Fix (0.73.0)
  *Baseline drift* section (`:691–694` — "Two additions the report's tables do
  not carry: a `{}` field type draws bug 0045's `theta/parse/empty-schema-body`
  naming `'{}'` **in addition to** the discriminator outcome (`schema Cat
  { kind: {}, … }` under `by kind` renders `empty-schema-body` then
  `nested-discriminator`)"), and in that fix's report as residual 2, which states
  the same finding plus its status — "Pre-existing and independent of this fix
  (`{}` is a single enclosing group under both predicates), pinned as-is in the
  witness. A place the bug document is incomplete rather than wrong." This report
  is the filing, and adds what neither record states: the full measured
  diagnostic lists with ranges for fifteen fixtures, the order-stability result
  and the source-order finding, the clause-scoping controls (A8, A14, A15), the
  two-earned-lines case A12 that bounds every suppression route, the arity
  results (A7, A13), the load-refusal confirmation on both codes, the argument
  from the *Trigger* across three readings, the absence of any cascade rule in
  `diagnostic-shape.md`, the separation from bug 0093's mechanism, and the three
  §Fix routes with their constraints.
- Spec: `docs/spec_topics/diagnostics/code-registry-parse.md:86` (the
  `empty-schema-body` row, inline case included since bug 0045's fix), `:96`
  (`missing-discriminator`), `:98` (`nested-discriminator` — the row under
  adjudication); `docs/spec_topics/schemas.md:19` (the object-schema empty body),
  `:99–121` (§Discriminated unions: `:101` the construct, `:103–105` the three
  detection rules, `:107` the non-string rejection, `:109` the ambiguous /
  missing dispositions, `:111–115` the explicit override, `:117` `by` on the
  union form only, `:119` the top-level requirement and the nested code);
  `docs/spec_topics/grammar.md:105` (the `Type`-position enumeration), `:109`
  (§"Inline object types", the `{}` rule);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:24` (*Re-scan
  deduplication*), `:65` (*Multi-error reporting*), `:71` (DIAG-1), `:72`
  (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/code-registry-load.md:53` (the one row-local
  cascade clause in the registry);
  `docs/spec_topics/governance/source-language-stability.md:9` (loads-cleanly),
  `:25` (the diagnostic-registry carve-out);
  `docs/spec_topics/implementation-notes.md:16` (the `(file, line, col)` sort).
  User-facing mirrors: `docs/reference/diagnostics.md:135`, `:147` and its
  no-*Trigger*-column statement at `:8–9`;
  `docs/reference/schema-subset.md:45`, `:71`, `:97`;
  `docs/reference/grammar.md:203–204`.
- Implementation evidence at `04504288`:
  `src/parser/schema-declarations.ts:63–74` (`emptySchemaBodyDiagnostic`, sole
  construction point; doc comment `:55–62`), `:87–98` (`checkObjectSchema` and
  its zero-field arm `:95–98`), `:392–401` (`checkDiscriminatedUnion`'s
  dispatch), `:461–471` (`FieldEvaluation`, `anyNested` at `:464`), `:492–531`
  (`evaluateOccurrences`, the `.some` at `:497`, `allLiteral` at `:498–499`),
  `:535–541` (`detectImplicitDiscriminator` and its `presentInAll &&
  allLiteral` filter), `:596–648` (`checkExplicitDiscriminator`, the
  `anyNested` gate `:620`, the emission `:621–629`, its message `:627`, and the
  two later gates `:634–636` / `:639–645`), `:651` (`nonStringDiagnostic`);
  `src/parser/theta-document.ts:5679` and `:5694` (the two passes' order),
  `:5713` (`checkSchemaDeclarationGraph`), `:5730` / `:5741` (`objectFields`),
  `:5821–5829` (the gated `checkDiscriminatedUnion` call), `:5887–5905`
  (`buildUnionVariantSchemas`), `:5916–5924` (`discriminatorCandidateFields`,
  the classifier call at `:5922`), `:5926–5960` (the classifier's doc comment,
  its structural-versus-positional paragraph at `:5938–5947`), `:5961–5986`
  (`classifyDiscriminatorFieldType`, the guard `:5965`, `{ nested: true }`
  `:5966`, the `|` split `:5968`), `:6188–6220` (`walkStatements`' `schema` arm,
  `checkObjectSchema` `:6191`, the field loop `:6206`, `parseTypeExpression`
  `:6214`), `:91` (the predicate's import);
  `src/parser/type-grammar.ts:46` (the constructor's import), `:348` / `:378`
  (`interiorHasTokens` / `braceClosed`), `:467–477` (`walkType`'s `object` arm,
  the emission `:474`);
  `src/parser/body-type-lowering.ts:201–207` (the predicate's scoping
  paragraph), `:208` (`isSingleEnclosingBraceGroup`), `:209` (its naive first
  statement); `src/parser/params.ts:766` (the frozen naive copy), `:932`
  (`splitTopLevel`); `src/diagnostics/diagnostic.ts:107–127`
  (`assembleDiagnostics`, the sort `:116–126`);
  `src/extension/production-composition.ts:2039–2052` (`hasLoadParseError` and
  its doc comment), `:2079` / `:2092` (`parseDiscoveredTheta` and its gate),
  `:1329`, `:1933` (the other two gate call sites).
- Test evidence at `04504288`:
  `tests/discriminator-field-classifier-brace-group.test.ts` (894 lines, 9
  tests — the pin at `:883–886`, its implicit twin `:887–891`, the
  single-declaration row `:675` with its expectation `:803–804` and its comment
  `:798–802`, the
  registry-sourced oracles `:141–147` / `:154–157` / `:166–169`, the registry
  parse `:100`, the fixture builders `:538–540` / `:571–578` / `:581–583` /
  `:586–594`, `capturedSchemas` `:556–563`);
  `tests/schema-alias-union-decl.test.ts:175`, `:258–260`, `:959–973` (b6, the
  correct case, `expectExactly` one line);
  `tests/disc-unions-recursion.test.ts:173–190` (the hand-built seam cell,
  `nested: true` at `:182–183`);
  `tests/committed-fixture-parse-gate.test.ts:122` (the zero-diagnostics gate;
  `rg ':\s*\{\s*\}'` and `rg 'schema \w+ by '` over `*.theta` / `*.thetalib`
  are both empty); `tests/fixtures/h7a/permitted-codes.json` (11 entries,
  neither code present); `tests/helpers/e2e-s1.ts:39` (`parseDoc`).
- Reproduction: one scratch vitest directory at `04504288` under `.pi/tmp/`
  (gitignored) with its own config — fifteen `parseDoc` fixtures with rendered
  ranges and captured field lists, a twenty-iteration order-stability loop over
  the subject fixture, seven predicate rows over
  `isSingleEnclosingBraceGroup` / `splitTopLevel`, and two hand-fed
  `checkDiscriminatedUnion` seam rows. Run on the outputs quoted above, then
  deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.
