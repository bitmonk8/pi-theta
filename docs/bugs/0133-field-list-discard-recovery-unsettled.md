# Bug 0133 — `parseSchemaObjectBody`'s three recovery arms discard every field the body has already captured, so `finishObjectSchema` reports `theta/parse/empty-schema-body` against the declaration for a body whose FIRST token is a plain `ident: Type` field — outside every clause of the row's *Trigger*, with a *Message* asserting `'S' has no fields` over a source that declares up to three; the same discard suppresses the `by-on-object-schema` line the body earns, turns a same-file declaration into `theta/parse/unresolved-named-type` at a constructor site, and on an unbalanced body consumes the rest of the file — the recovery bug 0095's §Non-goals left unsettled

- **Status:** fixed (0.203.0). §Fix was not settled at filing: this report existed
  to pin the disposition of the recovery before any code landed, and the
  disposition was adjudicated in-run — route **(a)**, Reading A, with the
  no-prefix family preserved (see §Fix (0.203.0) below). No ordering dependency in
  either direction. Its parent
  [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) is **fixed
  (0.74.0)** and closed the one route that fed this arm well-formed input; the
  arm itself is untouched and, measured below, is reached by twelve distinct
  token classes at the field-name position, by its two other arms, and by four
  unbalanced-brace bodies. No open report edits `parseSchemaObjectBody`
  (`src/parser/theta-document.ts:2534–2616`) or `skipBraceRemainder` (`:2619`).
- **Sev/Diff estimate:** S2/D3 — a wrong diagnostic subject on refused input
  plus a second misattributed code at a constructor site (`unresolved-named-type`
  for a schema declared two lines up), and a suppressed correctly-attributed
  line (`by-on-object-schema`); no value is corrupted and the load is refused
  either way, so the cost is misdirection rather than silent wrong behaviour.
  D3 because the disposition, the DIAG-2 *Trigger* question and the choice
  between reusing a code and minting one are adjudicated in-run, and four landed
  witnesses across three files pin the current dispositions as expected output.
- **Kind:** defect against the closed registry, plus a spec gap on what a
  diagnostic's subject is owed. Three elements, all measured at HEAD.
  1. *An emission outside its row's registered Trigger.*
     `theta/parse/empty-schema-body`'s *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:86`) is "A `schema`
     declaration whose shape yields no usable content (neither fields nor alias
     arms): an empty object body (`schema X { }`), a body whose first token is
     not a plain `ident: Type` field list, or no shape at all. An empty inline
     object type (`{}`) in any `Type` position, at any nesting depth." The
     operative words are *first token*.
     For `schema S { a: string, 42: integer }` the first token of the body IS a
     plain `ident: Type` field, the shape DOES yield usable content (the parser
     captured `a: string` and then threw it away), the body is not empty and the
     field type is not an inline `{}`. No clause describes the input.
     [DIAG-1](../spec_topics/diagnostics/diagnostic-shape.md#diag-1) requires
     every author-visible diagnostic to carry a registered code and
     [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) makes the
     *Trigger* the canonical condition, so the emission is a defect against the
     row. The implementation's own doc comment repeats the row's wording — "a
     body whose first non-sep token is not a plain `ident: Type` field is
     skipped … and yields `null`" (`:2528–2532`) — while the code applies the
     arm at **every** iteration of the field loop (`:2551–2558`).
  2. *The rendered subject contradicts the source.* The *Message* is
     `'<X>' has no fields; an empty schema cannot be validated.` and `<X>`
     renders the declaration's identifier, so the author of a three-field body
     reads `'S' has no fields`. Nothing in the emission names the offending
     token, the discarded fields or their count.
  3. *No rule governs the correspondence.*
     `docs/spec_topics/diagnostics/diagnostic-shape.md` carries no sentence
     requiring a diagnostic's `range` or its rendered subject to correspond to
     the offending construct. Its
     [located-site classification](../spec_topics/diagnostics/diagnostic-shape.md#located-site-classification)
     (`:44`, `:46`) fixes only which of `file` / `range` a category carries —
     "the emission site is a single token span in one source file" — and
     `:63`'s render format consumes whatever `range` is given. The closest
     normative sentence is in the placeholder surface:
     `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55` — "`<X>`
     renders the offending declaration's identifier, except on the
     empty-inline-object trigger of `theta/parse/empty-schema-body` … where the
     subject is an anonymous type carrying no name and the placeholder renders
     the literal two-character text `{}`". Whether a declaration whose captured
     fields the parser discarded is "the offending declaration" is the
     adjudication this report asks for; §Expected behaviour argues it is not.
- **Related:**
  - [0095](./0095-brace-rooted-union-arm-capture-destroys-context.md) —
    **fixed (0.74.0)**, the parent, and the report that fenced this question by
    name. Its §Non-goals reads: "**The tolerant recoveries themselves.**
    `parseSchemaObjectBody`'s discard-the-whole-list arm (`:2544–2548`),
    `skipBraceRemainder` and the `fn`-return body-absorption path stay as
    written. This fix stops feeding them well-formed input; whether discarding
    an already-captured field list is the right recovery for input that is
    genuinely mis-shaped is not settled here." (Its `:2544–2548` anchor is that
    report's 0.57.0 baseline; the arm is `:2551–2558` at this HEAD.) Its fix
    record repeats it as
    residual (ii): "The tolerant recoveries are untouched as §Non-goals
    requires, and whether discarding an already-captured field list is the right
    recovery for input that is genuinely mis-shaped remains unsettled — this fix
    stops feeding that arm well-formed input, nothing more."
    `.pi/tmp/fixes/0095-report.md` §Residuals item 2 states the same in its own
    words ("The tolerant recovery: whether discarding an already-captured field
    list is the right recovery for genuinely mis-shaped input is untouched and
    unsettled"). What 0095 changed is upstream: `parseType`'s arm-start `{`
    branch is reached at every `Type` position (`:3009–3017`), so
    `schema S { f: {} | null }` keeps its field and draws the inline `'{}'` line
    instead of the declaration line. This report is that residual, with the
    input classes that still reach the arm enumerated by measurement.
  - [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md) —
    **fixed (0.57.0)**, the owner of the **inline** half of the same code. Its
    rule lives at one construction point in the type-grammar walk
    (`src/parser/type-grammar.ts:467–477`, through
    `emptySchemaBodyDiagnostic` at `src/parser/schema-declarations.ts:63–74`)
    and fires for a brace interior that carried no token and closed. The two
    halves differ in three ways this report depends on. (i) *Subject.* The
    inline half renders the author's own two bytes `{}`; the declaration half
    renders the declaration's name, and after 0095 the schema-field position
    takes the inline half for a `{}` arm (measured:
    `schema S { a: string, f: {}, g: integer }` → one `'{}'` line, all three
    fields retained). (ii) *Anchor.* Neither half anchors at the field: the
    inline emission's `range` is the enclosing statement's, because
    `parseTypeExpression`'s `site` is the declaration site (measured
    `@4:1-4:42` for a field sitting mid-line). So 0095's "field-scoped" line is
    field-scoped in its **subject** only. (iii) *Recovery.* The inline field
    loop is tolerant without discarding: a non-`ident` field name is **skipped**
    and the loop continues (`type-grammar.ts:352–358`), a missing `:` breaks the
    loop (`:359–362`), and the surrounding capture keeps its text — so
    `schema S { a: string, b: {c: integer, 42: string} }` loads clean with both
    fields, while the same shape one level out costs the whole list. 0045
    §Non-goals reserves the inline tolerance deliberately ("Malformed but
    non-empty interiors … Widening the inline rule to these shapes needs its own
    spec decision"), and this report does not reopen it.
  - [0033](./0033-body-level-schema-alias-unsupported.md) — **fixed (0.45.0)**,
    which authored the *Trigger* clause this report reads. Its §Fix widened
    `empty-schema-body` to the declaration shapes ("Registry (three
    Trigger-only widenings, same commit; Messages untouched)") and converged the
    mis-shaped heads on `emitEmptySchemaBody`, and its §Affected states the
    subject class in the same terms as the row: "a body-less `schema X` head or
    a brace body whose **first token** is not an `ident: Type` field". Its
    landed cell e2 (`tests/schema-alias-union-decl.test.ts:1162–1171`) pins the
    no-prefix case `schema X { "a": string }` at the declaration subject, with
    the comment "a brace body that captures no field yields a field-less
    declaration". That case is inside the *Trigger*; this report's is not.
  - [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) — **open**,
    adjacent on the same code and the same absent rule. It records that
    `diagnostic-shape.md`'s only multiplicity paragraphs are `:65`
    (*Multi-error reporting*) and `:24` (*Re-scan deduplication*), neither of
    which reaches subject correspondence or cascade count. Its subject input
    keeps its field, so the two reports touch disjoint inputs; both need the
    corpus to say something it currently does not.
  - [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)
    — **open**, and it owns the vocabulary a report-against-the-token route
    would reach for. The `<construct>` token-name table
    (`docs/spec_topics/diagnostics/placeholder-rendering-a.md:50–68`, 15 rows)
    is closed, and the `schema fields must be comma-separated` tail this same
    loop already emits (`src/parser/theta-document.ts:2604–2611`) is in no row
    — 0063's second element. A route here that emits `unsupported-feature` with
    a new tail extends the same closed table.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    **open**, the inline half's other tolerance (duplicate field names accepted
    last-wins at every `Type` position). Disjoint code
    (`type-grammar.ts`/lowering against this report's document-level loop), same
    question shape: how much malformation a field list absorbs before it is
    refused.
- **Affected** (every citation verified at HEAD `76dfde5c`, 0.74.0):
  - `src/parser/theta-document.ts:2551–2558` — **defect site 1**, the
    non-field-name arm. `nameTok` is the token where a field name belongs
    (`:2551`), `isFieldName` admits `ident` or `keyword` (`:2552`), and any other
    kind takes `skipBraceRemainder(); return null` (`:2553–2558`). The `fields`
    array built at `:2583–2587` is dropped on the floor. The comment (`:2554–2555`)
    states the intent — "Not a plain `ident: Type` field list (a set-of /
    discriminated shape): consume the balance of the brace group and retain no
    field list" — and is written for the first iteration.
  - `src/parser/theta-document.ts:2568–2573` — **defect site 2**, the same
    discard when an `as` rename's wire name is not a string token
    (`schema S { a: string, b as 42: integer }`).
  - `src/parser/theta-document.ts:2577–2580` — **defect site 3**, the same
    discard when a field name is not followed by `:`
    (`schema S { a: string, b }`).
  - `src/parser/theta-document.ts:2619–2629` — `skipBraceRemainder`, the
    recovery all three arms run. It counts brace depth from 1 and consumes to
    the matching `}` **or to end of input** (`:2621`). Its only call sites are
    the three arms above; `rg 'this.skipBraceRemainder\(\)' src` returns exactly
    `:2556`, `:2571`, `:2578`. It is therefore not a separate subject from the
    discard — it is the discard's consumer — and its end-of-input reach is
    measured in §Reproduction as the third element.
  - `src/parser/theta-document.ts:2523–2533` — `parseSchemaObjectBody`'s doc
    comment, which describes the arm as first-token-only ("a body whose first
    non-sep token is not a plain `ident: Type` field").
  - `src/parser/theta-document.ts:2534–2616` — the loop as a whole: the `}`
    exit (`:2547–2550`), the field push (`:2583–2587`), and the comma rule
    (`:2588–2613`), whose emission at `:2604–2611` continues parsing "so the
    dropped field is NOT lost" — the one place in this function that recovers
    without discarding, and the model a retain-the-prefix route would follow.
  - `src/parser/theta-document.ts:2375–2383` — `finishObjectSchema`. `null`
    takes `emitEmptySchemaBody(name, range)` (`:2378–2379`) and returns a
    `schema` statement with **no** `fields` key and **no** `by` key (`:2380`),
    where the non-`null` path carries both (`:2382`). Its doc comment
    (`:2366–2374`) states the premise this report contests: "a `null` result
    here means the declaration yields no fields either way, so it takes the same
    `empty-schema-body` disposition as a truly empty `{ }` body."
  - `src/parser/theta-document.ts:2377` — `spanRange(kw.range,
    this.prevRange())`, the range every emission on this path carries. After a
    discard the last consumed token is `skipBraceRemainder`'s, so on an
    unbalanced body the range extends to the end of the file (measured).
  - `src/parser/theta-document.ts:2517–2521` — `emitEmptySchemaBody`, which
    synthesises `{ name, fields: [] }` and calls `checkObjectSchema`.
  - `src/parser/schema-declarations.ts:87–98` — `checkObjectSchema`'s
    zero-field arm (`:95–97`), which passes `decl.name`;
    `:55–74` — `emptySchemaBodyDiagnostic`, the sole construction point, whose
    header states the split ("`checkObjectSchema`'s zero-fields branch below
    passes the declaration's name, and `walkType` (type-grammar.ts) passes the
    literal two bytes `{}`") and renders the message at `:72`.
  - `src/parser/theta-document.ts:5769–5776` — the `by`-clause gate. It runs
    `checkByClause` only when `s.fields !== undefined` (`:5769`) and
    `s.by !== undefined` (`:5773`), and its comment says
    `finishObjectSchema` "retains the clause specifically so it reaches this
    check rather than being discarded". A discarded body loses both keys, so the
    check is unreachable for it. `src/parser/schema-declarations.ts:710–729` is
    the check; `:721–728` its emission.
  - `src/parser/theta-document.ts:6199–6212` — `walkStmt`'s `schema` arm, the
    checker-time `checkObjectSchema` call, also gated on
    `s.fields !== undefined` (`:6200`). The wire-name checks
    (`redundant-wire-name`, `wire-name-collision`) are unreachable for a
    discarded body for the same reason.
  - `src/parser/theta-document.ts:1171–1185` — `collectBodyTypes`, which
    records `schemas.set(stmt.name, stmt.fields)` (`:1184`) — `undefined` for a
    discarded body — building the universe the constructor check reads.
  - `src/parser/theta-document.ts:6286` — `checkObjectExpr`, and `:6302–6338` —
    its name-classification block. The `bodySchemas.has` arm (`:6325–6333`) emits
    `theta/parse/unresolved-named-type` for a name present in the whole-file
    schema set but absent from `refs.schemas`, on the reasoning in its comment:
    "`fields === undefined`: the alias/union form … or the head-only form.
    Either way the declaration has no object body and nothing to
    brace-construct." A discarded body is a **third** class that comment does
    not enumerate: a declaration that spells an object body. Measured, the arm
    fires for it.
  - `src/parser/theta-document.ts:2582` — the field-type capture
    (`this.parseType(true)`), and `:2963–2967` / `:3009–3017` / `:3019–3029` —
    `parseType`'s signature, the arm-start `{` branch 0095 made
    position-general, and the depth-0 stop set. This is the upstream 0095 fixed;
    it is unchanged here and is what closed the well-formed route into the arm.
  - `src/parser/type-grammar.ts:342–380` — `TypeParser.parseObject`, the inline
    half's field loop: the non-`ident` skip (`:352–358`), the missing-`:` break
    (`:359–362`), `interiorHasTokens` (`:348`) and `braceClosed` (`:378`);
    `:467–477` — `walkType`'s `object` arm and 0045's emission (`:474`);
    `:108` — `parseTypeExpression`, whose `site` argument fixes the inline
    emission's range.
  - `src/diagnostics/diagnostic.ts:107–127` — `assembleDiagnostics`, which
    sorts every diagnostic by `(file, line, col)` (`:116–126`); called at
    `src/parser/theta-document.ts:896`. Every ordered list quoted below is that
    order, not emission order.
  - `src/extension/production-composition.ts:1560` — `const registered =
    !diagnostics.some((d) => d.severity === "error")`. Every input that reaches
    the discard carries an `E`, so the theta does not register and the
    misattributed line is the author's only signal.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:86` — the row
    (*Trigger* and *Message*); `:56` — the `by-on-object-schema` row the
    discard suppresses; `:90` — the `unresolved-named-type` row the discard
    reaches; `:27` — the `unsupported-feature` row the comma rule uses.
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:44`, `:46` (located-site
    classification), `:63` (the rendered line format), `:65` (*Multi-error
    reporting*), `:71` (DIAG-1), `:72` (DIAG-2), `:74` (DIAG-4), `:80` (the
    column legend: "*Trigger* is the canonical condition").
  - `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55` — the `<X>`
    rendering rule ("the offending declaration's identifier");
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:50–68` — the closed
    `<construct>` table (bug 0063's subject).
  - `docs/spec_topics/schemas.md:17` — "Fields are comma-separated; the trailing
    comma is optional. Field names are identifiers"; `:19` — the empty-body rule
    and its rationale.
  - `docs/spec_topics/grammar.md:171–172` — `SchemaDecl` / `SchemaShape ::= "{"
    Field ("," Field)* ","? "}"`; `:101` — `ObjectType` reusing the same `Field`
    form; `:109` — the inline-object rule; `:179` — the `by`-on-object-body
    illegality. `Field` itself has no `::=` production anywhere in the corpus;
    its shape is prose at `schemas.md:17`.
  - `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15 and its
    three observables), `:9` (the loads-cleanly predicate: an input emitting an
    `E` is outside the promise's input set), `:25` (the diagnostic-registry
    carve-out).
  - `docs/reference/diagnostics.md:135` — the *Message* mirror (no *Trigger*
    column); `docs/reference/schema-subset.md:45` — "Empty body is
    `theta/parse/empty-schema-body`" (the empty clause only, no mis-shaped-body
    clause); `:71` — the no-arm alias clause; `docs/reference/grammar.md:204` —
    the inline clause.
  - `tests/brace-rooted-union-arm-capture.test.ts` — bug 0095's witness, 1240
    lines, 37 cells in 7 groups, every cell asserting the whole ordered
    diagnostic list AND the parsed shape. The cells adjacent to this arm: 1e
    (`:404–426`, a preceding field survives), 1f (`:428–449`, a following field
    survives), 1i (`:485–501`, the recovery's scoping across two declarations),
    4c (`:806–827`, the comma-missing recovery keeps both fields), 4e
    (`:849–872`, the `}` delimiter).
  - `tests/inline-empty-object-type.test.ts` — bug 0045's witness, 1063 lines.
    Its declaration-subject controls: e1 (`:697–704`, `schema S { }`), e2
    (`:706–715`, headless), e3 (`:717–728`, `schema X { "a": string }` — the
    no-prefix mis-shaped body, "the declaration is field-less, so the
    DECLARATION rendering applies"), e5 (`:739–755`, the absence of an `'S'`
    line for a declaration that declares a field), plus a2b (`:341–354`) and
    c1b (`:565–576`) at the schema-field position.
  - `tests/schema-alias-union-decl.test.ts:1162–1171` — bug 0033's cell e2, the
    second landed pin of the no-prefix disposition.
  - `tests/discriminator-field-classifier-brace-group.test.ts:878`, `:962`,
    `:967` — the three `empty-schema-body` expectations bug 0095 rewrote; all
    three now carry the `{}` subject, so no declaration-subject line for a
    discarded body survives in that file.
  - `tests/schema-declarations.test.ts:53–68` — the `schema X { }` control.
  - `tests/committed-fixture-parse-gate.test.ts:55` — the shipped gate, which
    filters `entry.name.endsWith(".theta")` and so does not walk either
    committed `.thetalib` (that blindness is
    [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md)'s subject;
    the corpus pass below covers both extensions).
  - `tests/live/acceptance/harness.ts:115–117` (`PERMITTED_CODES_PATH`), `:479`
    (`ACCEPTANCE_STDERR_ALLOWLIST`, empty), `:489` / `:534`
    (`acceptanceStderrOffenders` / `assertStderrClean`, the empty-capture gate);
    `tests/fixtures/h7a/permitted-codes.json` — 11 entries, all `theta/load/*`,
    `theta/runtime/*` or `theta/host/*`; no parse-phase code is listed.
  - **Test coverage of this defect: none.** No cell in the suite drives a schema
    body that captures a field and then hits a discard arm. `rg 'schema
    [A-Za-z]* *\{ *\\"' tests` returns the two no-prefix cells above and nothing
    else; the `as`-rename arm and the missing-`:` arm have no fixture at all.
- **Observed at:** `0.74.0` (HEAD `76dfde5c`). Offline, deterministic; no live
  model, no provider. Scratch vitest driving `parseDoc` (`tests/helpers/e2e-s1.ts`
  — the shipped lexer and `parseThetaDocument` behind an inert `parseDeps`
  double), reading `doc.diagnostics` and the parsed `doc.body`, plus one corpus
  pass over `git ls-files '*.theta' '*.thetalib'` through the same entry point.
  Written, run, deleted; `src/`, `tests/` and every other document are
  unmodified by this filing.

## Summary

A `schema X { … }` object body is parsed by one loop
(`src/parser/theta-document.ts:2534–2616`). The loop accumulates
`SchemaFieldSource` entries and has three exits that abandon the accumulation:
the token where a field name belongs is neither `ident` nor `keyword`
(`:2553`), an `as` rename's wire name is not a string (`:2570`), or a field name
is not followed by `:` (`:2577`). Each runs `skipBraceRemainder()` and returns
`null`, and `null` reaches `finishObjectSchema`, which reads it as "the
declaration yields no fields either way" (`:2366–2374`) and emits
`theta/parse/empty-schema-body` with the declaration's name as the subject.

The fields the loop had already captured are gone. Measured:
`schema S { a: string, b: integer, c: boolean, 42: string }` produces exactly
one diagnostic — `'S' has no fields; an empty schema cannot be validated.` — and
a `schema` statement with no `fields` key at all. Three of the four fields are
well-formed and the source spells them; nothing in the emission names them, the
offending token, or the loss.

The registry does not describe this. The row's declaration clauses cover an
empty body, a body whose **first** token is not a plain `ident: Type` field, and
no shape at all (`code-registry-parse.md:86`). Here the first token is a plain
field and the shape yields content the parser discarded. The implementation's
own comment (`:2528–2532`) reproduces the first-token wording while the code
applies the arm at every iteration.

Three consequences follow from the same `null`, because
`finishObjectSchema` also drops the `by` key: a `by` clause on a discarded body
never reaches `checkByClause`, so `schema S by kind { a: string, 42: integer }`
does **not** draw the `theta/parse/by-on-object-schema` line its well-shaped
twin draws; a constructor use of the declared name draws
`theta/parse/unresolved-named-type` where the well-shaped twin draws
`theta/parse/missing-object-field`; and when the body never closes its brace,
`skipBraceRemainder` consumes to end of input, so every following declaration
and the document tail disappear with no diagnostic naming them, while the
surviving `empty-schema-body` range grows to cover the whole remainder.

This is bug 0095's residual. That report closed the route that reached this arm
with **well-formed** input — a brace-rooted union arm, `schema S { f: {} | null }`
— by making `parseType`'s arm-start `{` branch position-general, and fenced the
recovery itself in §Non-goals: "whether discarding an already-captured field
list is the right recovery for input that is genuinely mis-shaped is not settled
here." Measured at HEAD, the arm is not dead. Twelve token classes reach it at
the field-name position — a number literal, a string literal, and a stray `:`,
`,`, `|`, `(`, `[`, `@`, `=`, `?`, `-` or `...` — and the other two arms are
reached by a field name without a `:` and by an `as` rename whose wire name is
not a string. Four unbalanced-brace bodies reach the same discard and cost the
rest of the file.

## Reproduction

Offline, at `76dfde5c`. Every fixture is a whole `.theta` source
(`---\nmode: prompt\n---\n<decl>\nlet a = 1\na\n`) driven through `parseDoc`.
`diags` is `doc.diagnostics` rendered `<severity> <code> @<range>: <message>` in
`(file, line, col)` order (`assembleDiagnostics`,
`src/diagnostics/diagnostic.ts:116–126`); `fields` reads the parsed `schema`
statement off `doc.body`, where `ABSENT` means the statement carries no `fields`
key. `E` abbreviates `error theta/parse/`. The declaration is on source line 4.

### The arm, with a field already captured

Body prefix `a: string,` in every row; the column is what follows it.

```
@@ schema S { a: string, 42: integer }
   diags  :: [E empty-schema-body @4:1-4:36: 'S' has no fields; an empty schema cannot be validated.]
   fields :: ABSENT
@@ schema S { a: string, "b": integer }
   diags  :: [E empty-schema-body @4:1-4:37: 'S' has no fields; an empty schema cannot be validated.]
   fields :: ABSENT
```

Ten further offending tokens produce the identical single line and the identical
`ABSENT`, differing only in the range's end column:

```
   : integer      |  , b: integer   |  | b: integer   |  (b): integer
   -b: integer    |  [b]: integer   |  @b: integer    |  = b: integer
   ? b: integer   |  ...
```

The arm fires at any iteration, not only the second, and the loss scales with
the prefix:

```
@@ schema S { a: string, b: integer, c: boolean, 42: string }
   diags  :: [E empty-schema-body @4:1-4:59: 'S' has no fields; …]
   fields :: ABSENT
@@ schema S { a: string,\n  b: integer,\n  42: string,\n  c: boolean }
   diags  :: [E empty-schema-body @4:1-7:15: 'S' has no fields; …]
   fields :: ABSENT
```

Three well-formed fields precede the offending token in the first row and two in
the second; each row draws one line and records no `fields`. The second row also
shows the range spanning the whole multi-line declaration, which is
`finishObjectSchema`'s `spanRange(kw.range, this.prevRange())` (`:2377`).

### No captured prefix — the disposition the registry does describe

```
@@ schema S { 42: integer }
   diags  :: [E empty-schema-body @4:1-4:25: 'S' has no fields; …]     fields :: ABSENT
@@ schema S { "a": string }
   diags  :: [E empty-schema-body @4:1-4:25: 'S' has no fields; …]     fields :: ABSENT
@@ schema S { | }
   diags  :: [E empty-schema-body @4:1-4:15: 'S' has no fields; …]     fields :: ABSENT
@@ schema S { }                                                        [control]
   diags  :: [E empty-schema-body @4:1-4:13: 'S' has no fields; …]     fields :: []
```

These are the row's second and first clauses, and the disposition bug 0033 chose
(cells `tests/schema-alias-union-decl.test.ts:1162–1171` and
`tests/inline-empty-object-type.test.ts:717–728`). The message is true of them:
the declaration yields no field. The one observable separating them from the
rows above is `fields: []` against `ABSENT` for the genuinely empty body — a
distinction no diagnostic carries.

### A keyword IS a field name, so the arm is not a keyword rule

```
@@ schema S { a: string, let: integer }      diags :: []   fields :: ["a: string","let: integer"]
@@ schema S { a: string, schema: integer }   diags :: []   fields :: ["a: string","schema: integer"]
@@ schema S { a: string, true: integer }     diags :: []   fields :: ["a: string","true: integer"]
@@ schema S { a: string, null: integer }     diags :: []   fields :: ["a: string","null: integer"]
```

`isFieldName` admits `keyword` (`:2552`), so a reserved word is captured as a
field name and the load is clean, against `schemas.md:17` ("Field names are
identifiers"). That is a separate question (§Non-goals) and bounds this report:
the arm fires on token **kind**, not on spelling legality.

### The other two discard arms

```
@@ schema S { a: string, b }                    [no `:` after the name]
   diags  :: [E empty-schema-body @4:1-4:26: 'S' has no fields; …]     fields :: ABSENT
@@ schema S { a: string, b integer }
   diags  :: [E empty-schema-body @4:1-4:34: 'S' has no fields; …]     fields :: ABSENT
@@ schema S { a: string, b = integer }
   diags  :: [E empty-schema-body @4:1-4:36: 'S' has no fields; …]     fields :: ABSENT
@@ schema S { a: string, b as 42: integer }     [non-string wire name]
   diags  :: [E empty-schema-body @4:1-4:41: 'S' has no fields; …]     fields :: ABSENT
@@ schema S { a: string, b as c: integer }
   diags  :: [E empty-schema-body @4:1-4:40: 'S' has no fields; …]     fields :: ABSENT
```

Same subject, same loss, two further arms. Neither has a fixture in the suite.

### What the discard costs beyond the field list

```
@@ schema S by kind { a: string, 42: integer }
   diags  :: [E empty-schema-body @4:1-4:44: 'S' has no fields; …]
   fields :: ABSENT                                     (no `by` key)
@@ schema S by kind { a: string, b: integer }                          [control]
   diags  :: [E by-on-object-schema @4:1-4:43: the 'by' clause applies only to
              discriminated-union schemas (schema X by f = A | B | …)]
   fields :: ["a: string","b: integer"]  by=kind
@@ schema S by kind { }                                                [control]
   diags  :: [E empty-schema-body @4:1-4:21, E by-on-object-schema @4:1-4:21]
   fields :: []  by=kind
```

The illegal `by` clause is reported for a well-shaped body and for a genuinely
empty one, and not for a discarded one: `finishObjectSchema` returns the
statement without the `by` key (`:2380`) and the gate at `:5769` / `:5773`
requires both keys. The author of the discarded body is told the schema has no
fields and is not told the `by` clause is illegal.

At a constructor site the discard produces a second misattributed line:

```
@@ schema S { a: string, 42: integer }\nlet p = S { a: "x" }\np
   diags  :: [E empty-schema-body @4:1-4:36: 'S' has no fields; …,
              E unresolved-named-type @5:9-5:21: unresolved named type 'S']
@@ schema S { a: string, b: integer }\nlet p = S { a: "x" }\np              [control]
   diags  :: [E missing-object-field @5:9-5:21: missing field 'b' on schema 'S']
@@ schema S { a: string, 42: integer }\nlet x: S = 1\nx
   diags  :: [E empty-schema-body @4:1-4:36: 'S' has no fields; …,
              E let-rhs-type-mismatch @5:1-5:13: let binding 'x' initialiser type
              mismatch: expected S, got integer]
@@ schema S { a: string, b: integer }\nlet x: S = 1\nx                      [control]
   diags  :: [E let-rhs-type-mismatch @5:1-5:13: … expected S, got integer]
```

`unresolved named type 'S'` names a schema declared two lines above it in the
same file. The emission is defensible against its row as written — `:90` says a
"`schema` without an object body … is not constructible and fires this code" —
because the recorded statement has no object body; the source does. The
annotation position is unaffected (`let x: S` still resolves `S`), so the
cascade is specific to the constructor arm at `:6325–6333`.

### The unbalanced body: the recovery consumes the rest of the file

```
@@ schema S { a: string, 42: integer }\nschema T { b: string }\nfn g() { 1 }
   diags  :: [E empty-schema-body @4:1-4:36: 'S' has no fields; …]
   stmts  :: [schema S fields=ABSENT, schema T fields=["b: string"],
              fn g, let a]                                   tail=present
@@ schema S { a: string, 42: integer\nschema T { b: string }\nfn g() { 1 }
   diags  :: [E empty-schema-body @4:1-8:2: 'S' has no fields; …]
   stmts  :: [schema S fields=ABSENT]                        tail=none
@@ schema S { a: string, b: { }\nschema T { b: string }
   diags  :: [E empty-schema-body @4:1-7:2: 'S' has no fields; …,
              E unsupported-feature @5:1-5:7: unsupported syntactic feature:
              schema fields must be comma-separated]
   stmts  :: [schema S fields=ABSENT]                        tail=none
```

With the brace balanced, the recovery is scoped and the following declarations
survive. With it unbalanced, `skipBraceRemainder`'s `!this.atEnd()` bound
(`:2621`) consumes the remainder: `schema T`, `fn g`, the `let` and the tail
expression are all gone, no diagnostic names any of them, and the surviving line
covers `@4:1-8:2` — text belonging to four other statements. In the third row
the comma rule also fires at line 5 column 1, which is the first token of the
**next statement** (`schema` of `schema T`), rendering the `<construct>` tail
bug 0063 reports as unlisted.

### The inline half, same shapes

```
@@ let x: {a: string, 42: integer} = 1     diags :: []   ann={a:string,42:integer} init=present
@@ let x: {a: string, "b": integer} = 1    diags :: []   ann={a:string,"b":integer}
@@ let x: {a: string, b} = 1               diags :: []   ann={a:string,b}
@@ let x: {a: string, b: } = 1             diags :: []   ann={a:string,b:}
@@ let x: {a: string, , b: integer} = 1    diags :: []   ann={a:string,,b:integer}
@@ schema S { a: string, b: {c: integer, 42: string} }
   diags  :: []      fields :: ["a: string","b: {c:integer,42:string}"]
@@ schema S { f: {a: string, 42: integer} }
   diags  :: []      fields :: ["f: {a:string,42:integer}"]
@@ fn f(p: {a: string, 42: integer}) { 1 }     diags :: []
@@ fn f(): {a: string, 42: integer} { 1 }      diags :: []
```

One level in, the identical malformation is silent and loses nothing: the
document-level capture keeps the text and `parseObject` skips the offending
token (`type-grammar.ts:352–358`). This is 0045 §Non-goals' reserved class.
Three rows sit in both halves and show where the inline subject applies:

```
@@ schema S { a: string, f: {}, g: integer }
   diags  :: [E empty-schema-body @4:1-4:42: '{}' has no fields; …]
   fields :: ["a: string","f: {}","g: integer"]
@@ schema S {\n  a: string,\n  f: {},\n  g: integer\n}
   diags  :: [E empty-schema-body @4:1-8:2: '{}' has no fields; …]
   fields :: ["a: string","f: {}","g: integer"]
@@ schema S { f: {} | null }                            [bug 0095's element 1]
   diags  :: [E empty-schema-body @4:1-4:26: '{}' has no fields; …]
   fields :: ["f: {}|null"]
```

The subject is the author's own two bytes and every field is retained — but the
**range** is the declaration's, not the field's, at both positions
(`parseTypeExpression`'s `site`). So the inline half fixes the subject and not
the anchor, and a route here that anchors at the offending token would be the
first emission on this code that does.

### Controls a fix preserves

```
@@ schema S { a: string, b: integer }        diags :: []   fields :: ["a: string","b: integer"]
@@ schema S { a: string, b: integer, }      diags :: []   fields :: ["a: string","b: integer"]
@@ schema S { a: string b: integer }
   diags  :: [E unsupported-feature @4:22-4:23: … schema fields must be comma-separated]
   fields :: ["a: string","b: integer"]                       [recovers, keeps both]
@@ schema S { a: string, b: }
   diags  :: []      fields :: ["a: string","b: "]            [empty type source, silent]
@@ schema S { a: string, b: integer } }
   diags  :: [E unsupported-feature @4:36-4:37: … stray '}' in statement position]
   fields :: ["a: string","b: integer"]
@@ schema S { f: {a: integer} | null }      diags :: []   fields :: ["f: {a:integer}|null"]
```

The comma-missing row is the loop's own non-discarding recovery. The `b: ` row
is a clean-loading neighbour: an unterminated field type does **not** reach any
discard arm; it records an empty `typeSource` and stays silent, so it sits inside
GOV-15's loads-cleanly set and any route that tightens field-type emptiness moves
it.

### The corpus

Every tracked `.theta` / `.thetalib` parsed through the same entry point: **34
files** (32 `.theta`, 2 `.thetalib`). 33 draw `[]`. The one exception is the
seeded-invalid `tests/fixtures/h7b-invalid/malformed.theta`, whose
`empty-schema-body` comes from `# schema lowering validation notes` — a headless
head, the row's third clause — not from a discard. Since every discard emits an
`E`, a file that parses clean cannot have reached one: no committed fixture and
no file under `docs/examples/` exercises this arm, and the shipped gate
(`tests/committed-fixture-parse-gate.test.ts`) never witnesses it.

## Expected behaviour

Three sentences bear on the input, and none of them prescribes the observed
emission.

`code-registry-parse.md:86`'s *Trigger* — the canonical condition per the column
legend (`diagnostic-shape.md:80`) — reads:

> A `schema` declaration whose shape yields no usable content (neither fields
> nor alias arms): an empty object body (`schema X { }`), a body whose first
> token is not a plain `ident: Type` field list, or no shape at all. An empty
> inline object type (`{}`) in any `Type` position, at any nesting depth.

Its *Message* reads:

> `'<X>' has no fields; an empty schema cannot be validated.`

For `schema S { a: string, 42: integer }` the head condition fails (the shape
yields a field, which the parser captured at `:2583` before abandoning it), the
first-token clause fails (the first token is `a: string`), the empty-body clause
fails, and the inline clause fails. The row does not describe the input, and
`placeholder-rendering-b.md:55` binds `<X>` to "the offending declaration's
identifier", which presupposes the declaration is the offending construct.

Two readings are available.

**Reading A — the offending construct is the token, and the declaration is not
offending.** `SchemaShape ::= "{" Field ("," Field)* ","? "}"`
(`grammar.md:172`) is a sequence, and what fails to derive is one element of it:
the text at the offending token is not a `Field`. The prefix derives. The
author's mistake is local, and the two things the diagnostic must convey are
which token is wrong and that the declaration is unusable — neither of which
`'S' has no fields` conveys. On this reading the observed emission is a defect
against the row on two counts (the *Trigger* does not admit it, and `<X>`'s
"offending declaration" does not name it), and the input needs a disposition of
its own: a diagnostic anchored at the offending token, with the prefix retained
so the declaration's other checks (`by-on-object-schema`, the wire-name checks,
the constructor field-set checks) run against what the author wrote.

**Reading B — a declaration the parser cannot use as a whole is field-less, and
the row's first-token clause is shorthand for that.** The registry clause was
authored by bug 0033 for a body whose first token disqualifies it, and its
intent — recorded in that report's §Fix as "the no-usable-content shapes" — was
that a declaration yielding nothing usable is refused under this code regardless
of the reason. A body containing one unparseable field is not usable: lowering it
would ship a schema the author did not write. On this reading the code is right
and only the wording is behind the implementation, so the fix is a *Trigger*
amendment describing the discard.

**Reading A is better supported.** Four reasons.

1. The clause says **first token**, and the same condition is stated twice more
   in the tree (`parseSchemaObjectBody`'s comment at `:2528–2532`; bug 0033's
   §Affected, "a body-less `schema X` head or a brace body whose first token is
   not an `ident: Type` field"). Three independent statements of a first-token
   condition are not shorthand for an any-token condition. Reading B has to read
   the word as decorative.
2. The row's head condition is a claim about the shape, and the shape's content
   is measurable: the parser holds the captured `SchemaFieldSource` array at the
   moment it discards it. "Yields no usable content" is false of the input at the
   point of the decision, and the *Message* DIAG-4 freezes asserts exactly that
   false thing. Under Reading B the *Message* stays false, which the route has to
   own rather than resolve (DIAG-4 defers a reword to theta 2.0).
3. The loop already has a non-discarding recovery for a sibling malformation,
   with the reason in its own comment: the comma-missing rule emits at the
   boundary token "then continue[s] parsing so the dropped field is NOT lost"
   (`:2595–2596`). Two malformations one token apart get opposite treatments —
   `schema S { a: string b: integer }` keeps both fields and names the boundary,
   `schema S { a: string, 42: integer }` keeps neither and names the
   declaration — and no spec sentence distinguishes them.
4. The consequences are not confined to one line. Under Reading B the discard
   also suppresses `by-on-object-schema` (measured), which is a registered
   `E`-severity row whose *Trigger* (`:56`) the input satisfies, and reaches
   `unresolved-named-type` at a constructor site for a name the file declares.
   Reading B has to accept a registered row silently not firing for an input
   inside it, which is a second registry defect rather than a wording gap.

Reading A does not make the corpus complete. Three sentences are owed before
code lands:

- **What the offending token's diagnostic is.** No registered row describes "a
  token where a `Field` must start". `unsupported-feature` (`:27`) covers
  "theta 1.0-deferred or non-Theta syntactic construct" and renders through the
  closed `<construct>` table (bug 0063), so it fits neither the input nor the
  vocabulary. Either the `empty-schema-body` row gains this input explicitly, or
  a code is minted (DIAG-2).
- **What survives.** `grammar.md:172` gives the declaration no way to hold a
  partial field list, and no sentence says what a declaration whose body is
  partly underivable records. The choice is visible: retaining the prefix makes
  the other declaration checks run and makes the constructor arm at `:6325–6333`
  see an object body.
- **Whether a subject-correspondence rule exists at all.**
  `diagnostic-shape.md` states none (§Kind element 3). One sentence there — that
  a diagnostic's rendered subject and `range` name the construct whose
  derivation failed — would convert this report, bug 0129's second element and
  the anchor asymmetry measured above from three quality complaints into
  violations of one rule. That sentence is what this report asks the
  adjudication to consider.

Under Reading A, on the measured input: the fields before the offending token
are retained; one diagnostic names the offending token and its range is that
token's; `by-on-object-schema` fires for `schema S by kind { a: string, 42:
integer }`; the constructor arm reports against the retained field set; the
no-prefix family (`schema S { 42: integer }`, `schema S { }`, the headless head)
keeps the declaration subject it has today, since for those the *Message* is
true; and the document remainder after an unbalanced body is not consumed in
silence.

## Actual behaviour / root cause

**Three returns, one recovery, no report of the loss.** The loop
(`:2534–2616`) accumulates into `fields` (`:2539`, pushed at `:2583–2587`) and
leaves it by `return null` at `:2557`, `:2572` and `:2579`. Each is preceded by
`skipBraceRemainder()`:

```ts
      const nameTok = this.peek();
      const isFieldName = nameTok.kind === "ident" || nameTok.kind === "keyword";
      if (!isFieldName) {
        // Not a plain `ident: Type` field list (a set-of / discriminated shape):
        // consume the balance of the brace group and retain no field list.
        this.skipBraceRemainder();
        return null;
      }
```

Nothing between the push and the return records that entries existed. `null` and
"the body was empty" are the same value, which is the conflation at the centre of
this report: `SchemaFieldSource[] | null` cannot distinguish "no field was
written" from "fields were written and discarded", and the caller reads `null` as
the former.

**The caller states the premise explicitly.** `finishObjectSchema`
(`:2375–2383`) is nine lines, and its doc comment (`:2371–2373`) reads: "a
`null` result here means the declaration yields no fields either way, so it
takes the same `empty-schema-body` disposition as a truly empty `{ }` body."
"Either way" is the premise Reading A denies. The same branch also drops the
`by` key, which is the second observable: the non-`null` return at `:2382`
spreads `by` and the `null` return at `:2380` does not.

**One construction point renders the declaration's name.**
`emitEmptySchemaBody` (`:2517–2521`) synthesises `{ name, fields: [] }` and
calls `checkObjectSchema`, whose zero-field arm
(`schema-declarations.ts:95–97`) passes `decl.name` into
`emptySchemaBodyDiagnostic`. That function is the sole construction point by
design (its header, `:55–62`) and is shared with 0045's inline rule, which
passes `"{}"`. The single construction point is a feature — the two subjects
cannot drift — and it means a subject change here is a change at the call site,
not at the constructor.

**The range is the declaration's whole extent, and grows.** `:2377` computes
`spanRange(kw.range, this.prevRange())` after the body parse, so the range ends
at the last token the recovery consumed. Balanced: the closing `}`. Unbalanced:
end of input — measured `@4:1-8:2` over four unrelated statements, because
`skipBraceRemainder`'s loop bound is `!this.atEnd() && depth > 0` (`:2621`) and
never re-synchronises on a statement separator or a declaration keyword.

**Two registered rows go missing, and one fires wrongly.** Both checker gates
key on the same absent field list: `checkByClause` runs only under
`s.fields !== undefined` (`:5769`), as does the checker-time `checkObjectSchema`
call (`:6200`) that owns `redundant-wire-name` and `wire-name-collision`. In the
other direction, `collectBodyTypes` records `schemas.set(stmt.name,
stmt.fields)` (`:1184`) with `undefined`, so `checkObjectExpr`'s `bodySchemas`
arm (`:6325–6333`) reports `unresolved-named-type` — a conclusion its own
comment justifies by enumerating the alias form and the head-only form, neither
of which the source is.

**Nothing downstream sees it.** Every discard input carries an `E`, so
`production-composition.ts:1560` refuses registration; the lowering of a
field-less object schema is not reached, and the parse-time list is the author's
only signal.

**Reach.** `parseSchemaObjectBody` has one caller (`finishObjectSchema`, `:2376`),
which has two (`parseSchema`'s `{` dispatch at `:2331` and its `by … {` dispatch
at `:2342`). So the arm serves exactly the object-body form of a `schema`
declaration, with and without a `by` clause. The `params:` frontmatter field
list is a different parser (`src/parser/params.ts`) and is out of scope. Bug
0095's fix removed the one route that reached the arm from a **well-formed**
`Type`; the input classes measured above reach it from genuinely mis-shaped
source, so the arm is live, not dead.

**`skipBraceRemainder` is not a separate subject.** Its three call sites are the
three discard arms and it has no other caller. Its one behaviour beyond
consuming a balanced group — running to end of input — is only observable through
those arms, and its observable there (statements silently lost, the range
extended over them) is produced together with the misattributed subject. It is
therefore in scope as this report's third element, not a sibling report.

**The `fn`-return body-absorption path does not share the shape, and is out of
scope.** 0095 §Non-goals fenced it alongside the discard, but the evidence
separates them. Measured at HEAD: `fn f(): integer | { 1 }` draws **no**
diagnostic, joins the block into the return type (`integer|{1}`) and absorbs the
following statements, leaving no document tail — which is bug 0095's fix record
residual (iii), dispositioned there as a GOV-15-class mover and pinned as cells
3f / 3g of its witness. There is no misattributed subject because there is no
diagnostic; the question that path raises is whether silent absorption owes one.
Bundling it here would put a silence and a misattribution under one §Fix.

## Why it matters

- **The author is sent to the wrong construct.** `'S' has no fields` for a body
  that spells three fields is a claim about the declaration, and the repair it
  implies (add fields) is not the repair (fix one token). The offending token
  appears nowhere in the emission: not in the message, not in the range.
- **The refusal is correct; the diagnostic is not.** Nothing here argues that
  mis-shaped input should load. The input is refused today and stays refused
  under every route in §Fix. What moves is which construct the diagnostic names.
- **A registered row silently does not fire.** `by-on-object-schema` is an
  `E`-severity row whose *Trigger* (`:56`) `schema S by kind { a: string, 42:
  integer }` satisfies, and the discard removes the key its gate reads. An author
  who fixes the token then meets a second refusal that was true all along.
- **A same-file declaration is reported as unresolved.**
  `unresolved named type 'S'` at a constructor site two lines below
  `schema S { … }` misdirects twice: it denies the declaration exists in a usable
  form, and it hides the field-set checks (`missing-object-field` /
  `extra-object-field`) that the well-shaped twin runs.
- **An unbalanced body loses the rest of the file in silence.** Measured: one
  missing `}` costs a second `schema`, an `fn`, a `let` and the document's tail
  expression, with one diagnostic whose subject is the first declaration and
  whose range covers all of them. Nothing reports the loss, and the theta is
  refused for a reason that names none of it.
- **The recovery is inconsistent one token away.** The comma-missing rule keeps
  both fields and names the boundary token; the discard keeps nothing and names
  the declaration. Both are recoveries in the same loop, written by different
  fixes, and no spec sentence chooses between them.
- **The inputs are ordinary typos.** A quoted key (JSON habit), a stray comma, a
  missing colon, a number-shaped key, an `as` rename with an unquoted wire name.
  All are reachable without any exotic construct, and all are silent about what
  was actually typed.
- **Nothing in the suite scores it.** No cell drives a discard with a captured
  prefix; the `as`-rename and missing-`:` arms have no fixture at all. The two
  landed cells that touch this code are the no-prefix family, which is inside
  the *Trigger*.

## Non-goals

- **The `fn`-return body-absorption path.** Separate concern, argued from
  measurement in §Actual behaviour: no diagnostic, so no misattribution. Bug
  0095's fix record residual (iii) holds its disposition and cells 3f / 3g of
  `tests/brace-rooted-union-arm-capture.test.ts` pin its bytes. Whether silent
  absorption owes a diagnostic is unsettled and unfiled.
- **The inline half's tolerant field loop.** `type-grammar.ts:352–362` skips a
  non-`ident` field name and breaks on a missing `:`, so `{a: string, 42:
  integer}` is silent at every `Type` position (measured). That is bug 0045
  §Non-goals' reserved class ("Widening the inline rule to these shapes needs its
  own spec decision"). This report measures the asymmetry as evidence and does
  not propose closing the inline side.
- **A keyword accepted as a field name.** `isFieldName` admits `keyword`
  (`:2552`), so `schema S { a: string, let: integer }` loads clean against
  `schemas.md:17` ("Field names are identifiers"). Measured, unfiled, and
  untouched here: it decides which tokens reach the arm, not what the arm does.
  A route that narrows `isFieldName` would move clean-loading inputs into the
  refused set, which is the opposite direction from this report's and needs its
  own GOV-15 argument.
- **The `<construct>` rendering vocabulary.** Whether `schema fields must be
  comma-separated` and `stray '<t>' in statement position` may be rendered at all
  is [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)'s
  subject. This report measures one route that reaches the first tail at a token
  in a following statement; it does not adjudicate the tail.
- **How many codes one mistake may draw.** The cascade measured above
  (`empty-schema-body` plus `unresolved-named-type`) raises the multiplicity
  question [0129](./0129-empty-object-field-type-draws-two-diagnostics.md) owns.
  This report's complaint is each line's subject, not the count.
- **An unterminated field type.** `schema S { a: string, b: }` records an empty
  `typeSource` and loads clean (measured). It reaches no discard arm and is a
  control here, not a subject.
- **The `params:` field list.** A different parser (`src/parser/params.ts`),
  frozen by bug 0039 §Fix, with its own reports
  ([0097](./0097-params-brace-union-rhs-one-field-list.md) among them).
- **Everything below the parse seam.** `parseTypeExpression`, `walkType` and
  every lowerer are unreached from these inputs: all carry an `E` and
  `production-composition.ts:1560` refuses registration.

## Fix

**Not settled. This report exists to pin the disposition first**, which is what
bug 0095 §Non-goals deferred by name. Three routes are available; none is
selected here. The choice turns on the Reading A / Reading B adjudication in
§Expected behaviour, and each route's registry obligations differ.

**(a) Retain the captured prefix and report against the offending token.**
Reading A implemented. The loop keeps `fields` and either stops at the offending
token or resynchronises past it, and one diagnostic is anchored at that token.
Consequences, all measurable at this baseline:

1. *A code is needed for "a token where a `Field` must start".* Reusing
   `empty-schema-body` is contradictory once the declaration keeps its fields —
   the *Message* asserts it has none. Reusing `unsupported-feature` requires a
   16th row in the closed `<construct>` table
   (`placeholder-rendering-a.md:50–68`), which is the GOV-7 / GOV-8 edit bug
   0063 holds and which would have to reconcile the two tails already emitted
   unlisted. Minting a code is a DIAG-2 addition: a row with *Trigger*,
   *Message*, *Hint* and *Spec rule*, a placeholder-category check for whatever
   the *Message* interpolates (a token rendering falls under
   `placeholder-rendering-a.md` §3's closed table if it uses `<construct>`, so a
   `<field>`- or `<token>`-shaped placeholder needs its own category
   determination), and the `docs/reference/diagnostics.md` mirror row.
2. *Three declaration checks start running for these inputs.* Retaining
   `fields` makes `checkObjectSchema` (`:6200`), `checkByClause` (`:5769`) and
   `checkObjectExpr`'s field-set arm reachable, so a discarded body's input can
   gain `by-on-object-schema`, `redundant-wire-name`, `wire-name-collision`,
   `missing-object-field` or `extra-object-field` beside the new line. Each is a
   registered row whose *Trigger* the retained field list satisfies, and each is
   a GOV-15 addition on inputs that were already refused. The measured
   `by kind` pair is the witness.
3. *The `unresolved-named-type` cascade disappears for these inputs* — the
   constructor arm at `:6325–6333` sees an object body. That is a code
   **removal** for those inputs under the diagnostic-registry carve-out
   (`source-language-stability.md:25`), admissible inside theta 1.x, and it also
   means the comment at `:6325–6332` (which enumerates two classes) needs no
   third class.
4. *Resynchronisation has to be stated, not left to `skipBraceRemainder`.*
   Stopping at the offending token and returning the prefix leaves the brace
   group unconsumed, which sends the body's remaining tokens into statement
   position and can draw stray-punct lines (bug 0063's other tail). Consuming to
   the matching `}` and returning the prefix keeps today's containment. On an
   unbalanced body the end-of-input reach stays unless the recovery gains a stop
   at a declaration keyword or a `stmt-sep`, which is a second decision with its
   own blast radius (`schema S { a: string, b: { }` currently absorbs everything
   after it).
5. *The no-prefix family must keep its disposition* or move deliberately — it
   is inside the *Trigger* and pinned twice (`inline-empty-object-type.test.ts:717–728`,
   `schema-alias-union-decl.test.ts:1162–1171`). A route that reports the
   offending token for `schema S { 42: integer }` **as well** replaces a true
   message with a more precise one and moves both cells; a route that keeps the
   declaration line there has to say what happens when the prefix is empty.

**(b) Keep `empty-schema-body` for the genuinely-nothing cases and give the
mis-shaped case its own disposition.** The registry-first shape of (a): the row
is narrowed to the three clauses it states (empty body, first token not a field,
no shape), and a second code owns a body that captures a field and then fails.
This is the option under which the *Trigger* edit is a DIAG-2 **narrowing plus
addition** landing in the same commit as the code, dispositioned by the
carve-out as a removal for the inputs leaving `empty-schema-body`'s emission set
and an addition for the inputs entering the new code's. It differs from (a) only
in whether the prefix survives — a variant that mints the code but still
discards keeps the field-list loss and the three suppressed checks, and buys
only the subject. This report names the variant to keep the two decisions
separable: *which construct is named* and *whether the fields survive* are
independent, and a route may take either alone.

**(c) Keep the discard and amend the row to describe it.** Reading B
implemented, and cheapest in code. The *Trigger* gains a clause naming a body
whose field capture is abandoned at any token, in the same commit per DIAG-2.
Two costs are unavoidable. The *Message* stays `'<X>' has no fields`, which is
false of the input, and DIAG-4 (`diagnostic-shape.md:74`) defers a reword to
theta 2.0 — so this route commits the corpus to a diagnostic whose text
contradicts the source it describes, and must say so rather than leave it
implied. And the two suppressed rows stay suppressed: the route has to state
that a `by` clause on a discarded body is not reported and that a constructor
use of the name is `unresolved-named-type`, because after the amendment those are
intended behaviour rather than fallout. `docs/reference/schema-subset.md:45`
carries only the empty-body clause and `docs/reference/diagnostics.md:135` carries
no *Trigger*, so the mirror obligation for this route is a check that neither
needs the new clause, recorded either way.

**Constraints every route satisfies.**

1. **Bug 0095's witness moves deliberately or not at all.**
   `tests/brace-rooted-union-arm-capture.test.ts` is 1240 lines and 37 cells,
   each asserting the whole ordered diagnostic list AND the parsed shape. None
   of its cells drives a discard arm — its group (1) inputs all keep their
   fields after 0095 — so the expected outcome is that every cell stays green,
   with 1e / 1f (`:404–449`, adjacent fields survive), 1i (`:485–501`, recovery
   scoping across two declarations), 4c (`:806–827`, the comma-missing recovery)
   and 4e (`:849–872`, the `}` delimiter) as the cells that red first if a route
   perturbs the loop. A route that does move one states which cell and why.
2. **Bug 0045's witness and the two no-prefix pins.**
   `tests/inline-empty-object-type.test.ts` (1063 lines) holds the three
   declaration-subject controls e1 / e2 / e3 (`:697–728`) and the
   schema-field-position cells a2b / c1b / e5 (`:341–354`, `:565–576`,
   `:739–755`). e3 and `tests/schema-alias-union-decl.test.ts:1162–1171` are the
   no-prefix disposition; both move together or neither moves. Expected messages
   stay sourced from the registry's *Message* column through the file's own
   helpers (DIAG-4), never copied prose.
3. **Bug 0096's witness stays green.**
   `tests/discriminator-field-classifier-brace-group.test.ts` asserts
   `empty-schema-body` at `:878`, `:962` and `:967`, all three with the `{}`
   subject after 0095's rewrite. No route here changes the inline half, so all
   three are controls.
4. **DIAG-2 and the mirrors.** Any *Trigger* edit — narrowing (a)/(b) or
   widening (c) — is a spec change landing in the **same commit** as the code
   (`diagnostic-shape.md:72`), and every amended spec page is checked for a
   `docs/reference/` mirror. For this row the mirrors are
   `docs/reference/diagnostics.md:135` (*Message* only, so unaffected unless a
   code is added), `docs/reference/schema-subset.md:45` and `:71`, and
   `docs/reference/grammar.md:204`. A new code also lands a
   `docs/reference/diagnostics.md` row and a *Spec rule* home — `schemas.md:19`
   is the incumbent home for this row and would gain the sentence.
   DIAG-4 forbids rewording the existing *Message*.
5. **GOV-15, per direction.** Every input that reaches a discard carries an `E`
   today, so all sit **outside** the loads-cleanly set
   (`source-language-stability.md:9`) and the equivalence promise does not range
   over them: a route that changes their diagnostic sequence is admissible in
   theta 1.x under the diagnostic-registry carve-out (`:25`), as an addition for
   inputs entering a code's emission set and a removal for inputs leaving it.
   Two directions need explicit argument. A route that lets any of these inputs
   load **clean** moves it out of the refused set entirely — no route above
   proposes that, and one that did would need the argument 0095's fix record
   made for its own movers. A route that tightens something the discard
   currently tolerates — `isFieldName`'s keyword arm, or the clean-loading
   `schema S { a: string, b: }` — moves inputs **into** the refused set from
   inside the loads-cleanly set, which is the carve-out's addition case and
   needs the corpus sweep repeated (measured here: 34 tracked files, 33 clean,
   and no committed file reaches the arm, so no shipped example moves in either
   direction).
6. **Newly reachable code against the live gates.** Anything newly emitted is
   assessed against H9a's empty-capture stderr gate
   (`tests/live/acceptance/harness.ts:479`, `:489`, `:534` — the allowlist ships
   empty, so any stderr line in any area reds) and against
   `tests/fixtures/h7a/permitted-codes.json`, whose 11 entries are all
   `theta/load/*` / `theta/runtime/*` / `theta/host/*`. The precedent to apply
   is 0095's, decided by a real H9a run rather than by assumption: a parse-phase
   code un-registers the caller and does not reach the shipped extension's
   stderr surface, so it needs no entry — and the measured corpus supports it
   here, since every H9a fixture parses clean and cannot reach this arm. The
   determination is made by running H9a, not by reading this paragraph.
7. **The registration boundary is unchanged.** `production-composition.ts:1560`
   refuses on any `E`, so no route may leave a mis-shaped body registering. The
   witness asserts the diagnostic list, not registration, at the parse seam.

**Witness — offline, provider-free.** Every row of §Reproduction settles inside
one `parseDoc` call, so the harness is the existing `tests/helpers/e2e-s1.ts`
pattern and the file shape is bug 0095's witness: one cell per fixture, each
asserting the **whole ordered diagnostic list AND the parsed shape** (`fields`
present/absent with names and type sources, the `by` key, the statement list and
`doc.body.tail`), with messages read from the registry (DIAG-4). Required cells:
the twelve offending token classes with a captured prefix; the three-field loss; the
multi-line range; the no-prefix family and the genuinely empty body as controls;
the keyword-name family; both other discard arms; the `by kind` pair; the
constructor cascade pair and its `let`-annotation control; the unbalanced-body
trio with the statement list and tail asserted (the only cells that can red on
the lost remainder); the comma-missing recovery and the `b: ` clean loader as
controls; the inline-half rows at four positions; and the corpus pass. The
range assertions are load-bearing: a route that changes the subject without the
anchor, or the anchor without the subject, must red on exactly one of them.

## Provenance

- Origin: the bug 0095 fix (0.74.0, commit `75af7646`), which deferred this
  recovery twice by name — §Non-goals ("**The tolerant recoveries themselves.**
  … whether discarding an already-captured field list is the right recovery for
  input that is genuinely mis-shaped is not settled here") and §Fix (0.74.0)
  residual (ii) ("The tolerant recoveries are untouched as §Non-goals requires,
  and whether discarding an already-captured field list is the right recovery
  for input that is genuinely mis-shaped remains unsettled — this fix stops
  feeding that arm well-formed input, nothing more"), restated as
  `.pi/tmp/fixes/0095-report.md` §Residuals item 2. This report is that
  adjudication, and adds what the deferral does not state: that the arm is live
  after 0095, with twelve token classes measured at the field-name position and
  both other arms measured for the first time; the `Trigger`-clause argument
  (the first-token wording against an any-iteration arm); the suppressed
  `by-on-object-schema` line; the `unresolved-named-type` cascade at a
  constructor site with its well-shaped control; the end-of-input reach of
  `skipBraceRemainder` and the range that grows with it; the proof that
  `skipBraceRemainder` has no caller outside the three arms; the measured
  separation of the `fn`-return absorption path from the misattribution shape;
  the anchor asymmetry between the inline and declaration halves; and the two
  readings with the three sentences the corpus still owes.
- Spec: `docs/spec_topics/diagnostics/code-registry-parse.md:86` (the row —
  *Trigger* and *Message*), `:56` (`by-on-object-schema`), `:90`
  (`unresolved-named-type`), `:27` (`unsupported-feature`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:44`, `:46` (located-site
  classification), `:63` (rendered line format), `:65` (multi-error reporting),
  `:71` ([DIAG-1](../spec_topics/diagnostics/diagnostic-shape.md#diag-1)), `:72`
  ([DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)), `:74`
  ([DIAG-4](../spec_topics/diagnostics/diagnostic-shape.md#diag-4)), `:80`
  (column legend); `docs/spec_topics/diagnostics/placeholder-rendering-b.md:55`
  (the `<X>` rule); `docs/spec_topics/diagnostics/placeholder-rendering-a.md:50–68`
  (the closed `<construct>` table); `docs/spec_topics/schemas.md:17` (field
  names are identifiers; comma separation), `:19` (the empty-body rule);
  `docs/spec_topics/grammar.md:101` (`ObjectType`), `:109` (inline object
  types), `:171–172` (`SchemaDecl` / `SchemaShape`), `:179` (the `by`-on-object
  illegality); `docs/spec_topics/governance/source-language-stability.md:5`
  ([GOV-15](../spec_topics/governance/source-language-stability.md#gov-15)),
  `:9` ([loads-cleanly](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)),
  `:25` ([diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)).
  User-facing mirrors: `docs/reference/diagnostics.md:135`;
  `docs/reference/schema-subset.md:45`, `:71`; `docs/reference/grammar.md:204`.
- Implementation evidence at `76dfde5c`: `src/parser/theta-document.ts:1171–1185`
  (`collectBodyTypes`), `:2331` / `:2342` (the two `finishObjectSchema`
  dispatches), `:2366–2383` (`finishObjectSchema` and its premise),
  `:2517–2521` (`emitEmptySchemaBody`), `:2523–2533` (the loop's doc comment),
  `:2534–2616` (**`parseSchemaObjectBody`**: the three discards at `:2553–2558`,
  `:2568–2573`, `:2577–2580`; the field push at `:2583–2587`; the comma rule at
  `:2588–2613`), `:2619–2629` (**`skipBraceRemainder`**), `:2582` (the field-type
  capture), `:2963–2967` / `:3009–3017` / `:3019–3029` (`parseType` after 0095),
  `:5769–5776` (the `by`-clause gate), `:6199–6212` (the checker-time
  `checkObjectSchema` gate), `:6286–6338` (`checkObjectExpr`, the
  `unresolved-named-type` arm at `:6325–6333`), `:896` (the
  `assembleDiagnostics` call); `src/parser/schema-declarations.ts:55–74`
  (`emptySchemaBodyDiagnostic`), `:87–98` (`checkObjectSchema`), `:710–729`
  (`checkByClause`); `src/parser/type-grammar.ts:108`
  (`parseTypeExpression`), `:342–380` (`parseObject`), `:467–477` (`walkType`'s
  `object` arm); `src/diagnostics/diagnostic.ts:107–127`
  (`assembleDiagnostics`); `src/extension/production-composition.ts:1560` (the
  registration gate).
- Test evidence at `76dfde5c`: `tests/brace-rooted-union-arm-capture.test.ts`
  (1240 lines, 37 cells; `:404–449`, `:485–501`, `:806–827`, `:849–872`);
  `tests/inline-empty-object-type.test.ts` (1063 lines; `:341–354`, `:565–576`,
  `:697–728`, `:739–755`); `tests/schema-alias-union-decl.test.ts:1162–1171`;
  `tests/discriminator-field-classifier-brace-group.test.ts:878`, `:962`,
  `:967`; `tests/schema-declarations.test.ts:53–68`;
  `tests/committed-fixture-parse-gate.test.ts:55`;
  `tests/live/acceptance/harness.ts:115–117`, `:479`, `:489`, `:534`;
  `tests/fixtures/h7a/permitted-codes.json`; `tests/helpers/e2e-s1.ts:38–42`
  (`parseDoc`).
- Reproduction: four scratch vitest files at `76dfde5c` over `parseDoc` — the
  discard fixtures with their twelve-token table, the no-prefix family, the
  keyword-name family, the two further discard arms, the `by kind` pair, the
  clean-loading neighbours, the unbalanced-body trio, the inline-half rows at
  four positions and the seam fed directly through `parseTypeExpression`, the
  constructor and annotation cascade pairs with their controls — plus one corpus
  pass over `git ls-files '*.theta' '*.thetalib'` (34 files) through
  `parseThetaDocument`. Run on the outputs quoted above, then deleted. No file
  in the tree was written by the probes; `src/`, `tests/`, `docs/bugs/README.md`
  and every other bug document are unmodified by this filing.
## Fix (0.203.0)

**Route (a) — Reading A, with the no-prefix family preserved.** §Fix was
unsettled at filing; §Expected behaviour's own adjudication ("**Reading A is
better supported**", four reasons) was taken as settled and §Fix (a) implemented
against it. Route (b)'s discard-but-mint variant was rejected because it buys
the subject and keeps the field-list loss and the three suppressed checks;
route (c) was rejected because it commits the corpus to a *Message* that
contradicts the source it describes, with DIAG-4 deferring the reword to theta
2.0, and leaves two registered rows intentionally silent for inputs inside them.

- **What shipped:**
  - `src/parser/theta-document.ts` — `parseSchemaObjectBody`'s three recovery
    arms converge on one new private helper, `recoverMalformedSchemaField`: it
    runs `skipBraceRemainder` (containment unchanged, §Fix (a)4's
    keep-today's-scoping option), returns `null` when the captured prefix is
    EMPTY, and otherwise emits one `theta/parse/malformed-schema-field` anchored
    at the offending token and returns the captured prefix. The offending token
    is the non-field-name token (arm 1), the non-string wire-name token (arm 2),
    and the FIELD-NAME token (arm 3) — not the token standing where `:` belongs,
    which for `schema S { f: Cat Cat }` is the closing `}` the author wrote
    correctly. `parseSchemaObjectBody`'s and `finishObjectSchema`'s doc comments
    restate the premise the fix narrows: `null` means the capture pushed no
    field, which is exactly the input the row's own first-token clause describes
    and whose *Message* is true.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the new
    `theta/parse/malformed-schema-field` row (E / parse), stating the three
    shapes, the partition with `theta/parse/empty-schema-body`, the
    offending-token anchor and the retention of the captured prefix (DIAG-2,
    same commit); plus the **correction** of the
    `theta/parse/schema-type-not-expression` row, whose sentence asserted that
    `schema S { a: -1 }` keeps `empty-schema-body` alone "because the malformed
    field list is dropped whole at parse time" — falsified by this route.
  - `docs/reference/diagnostics.md` — the mirror row (§Fix constraint 4).
  - `docs/spec_topics/schemas.md` — the *Spec rule* sentence, in the incumbent
    home of the `empty-schema-body` row.
  - `docs/reference/schema-subset.md` — the user-facing clause (§Fix constraint
    4's mirror check, which this page needed).
  - `tests/schema-field-discard-prefix-retention.test.ts` — the witness, 58
    cells in 10 groups, each asserting the whole ordered diagnostic list with
    exact ranges AND the parsed shape (`fields` present/absent with names,
    wire names and type sources, the `by` key, the statement list and
    `doc.body.tail`); messages read from the registry (DIAG-4).
  - `tests/live/schema-field-discard-recovery-live-cell-.test.ts` — the
    H8a live cell (this surface had none).
  - Twelve authorised re-pins in six files (table below).
- **Gates:** witness RED before (34/58 red at HEAD `f5d0d125`, of which 7 are
  registry-independent behaviour reds), GREEN after (58/58). Full default suite
  `npm test` → **388 files / 8066 tests passed** (baseline 387/8008; delta is
  exactly the new witness's 58 cells). `npm run typecheck` → clean.
  `npm run lint` → clean. Live: the new cell and its two named neighbours under
  `config/vitest/vitest.live.config.ts` → 3 files / 3 tests passed.
- **Review:** 1 round. `bug-fix-reviewer` returned 4 findings and 2 residuals:
  F1 the live obligation undischarged (`fidelity` — routed to verification, not
  to a fixer, and discharged there); F2 `docs/reference/schema-subset.md`'s new
  mirror sentence predicated the row on "a token no field can start from",
  which is false for arms 2 and 3 (`prose`); F3 five change-narration comments
  against CLAUDE.md's "no historical references" (`house-rule`); F4 a lost
  trailing newline (`test`). `bug-fix-fixer-light` fixed F2/F3/F4 and found two
  further F3 offenders. Every hunk of that round was comment, prose or
  whitespace — verified against the pre-polish executable content, which was
  byte-identical — so the confirmation review round was skipped under the
  post-polish gate-diff rule, with the gates re-run green.
- **Verification:** SOLID.
  - *The witness genuinely witnesses.* Neutralised `recoverMalformedSchemaField`
    to the unconditional discard: 33/58 red including all seven
    registry-independent group-(0) cells, each on the exact symptom (cell 0a:
    expected `malformed-schema-field @4:23-4:25`, received `empty-schema-body
    @4:1-4:36` with `fields: null`). Restored by writing the snapshot bytes
    back; `git hash-object` equal to the pre-mutation snapshot both times.
  - *Full default suite green* — 388/8066.
  - *A live test exercises the fixed path, run for real.* The new H8a cell boots
    the shipped extension against a live provider, asserts a well-formed control
    registers, asserts `schema S { a: string, 42: integer }` does NOT register,
    and asserts the discriminating pair on the `theta-system-note` channel read
    off the settled in-memory `SessionManager`: the new code's registry-sourced
    fragment present AND the declaration-subject `'S' has no fields` fragment
    absent. Both note assertions were proven able to red by two inverted-probe
    live runs, the first quoting the real channel contents —
    `b0133livecellf.theta:4:23: theta/parse/malformed-schema-field: malformed
    schema field; each field is 'name: Type' or 'name as "WireName": Type'` —
    which also confirms the offending-token anchor end to end. The cell reaches
    no RFC-0006 child launch (registration only, no drive), and the shared
    harness sets both child pins at module scope regardless. The live lock was
    acquired by `mkdir` and released by `rmdir` in one command on every run.
  - *Lint and typecheck* clean.
- **GOV-15.** Every input whose diagnostic set moved carries an error-severity
  diagnostic BEFORE and AFTER, so not one enters or leaves the loads-cleanly set
  (`source-language-stability.md` §GOV-15-loads-cleanly) and every flip sits
  inside the diagnostic-registry carve-out that §Fix constraint 5 names. No
  shipped source moves: `tests/committed-fixture-parse-gate.test.ts` — the
  authority for that corpus-wide claim — is green.
- **Protected locks, all green and unmoved:** bug 0095's 37-cell
  `tests/brace-rooted-union-arm-capture.test.ts` (§Fix constraint 1's predicted
  outcome — none of its cells drives a discard arm); bug 0045's
  `tests/inline-empty-object-type.test.ts` including the no-prefix pin e3, and
  bug 0033's `tests/schema-alias-union-decl.test.ts` cell e2 — the two pins §Fix
  (a)5 requires to keep their bytes, and both did; bug 0096's
  `tests/discriminator-field-classifier-brace-group.test.ts`; the 0128 / 0129 /
  0153 witnesses and registry rows.
- **The twelve authorised re-pins** (premeasured by prototype before the witness
  was written; the full suite reddened in exactly these six files and no other,
  plus `tests/registry-closed-set-corpus-gate.test.ts`, which the new registry
  and mirror rows clear). Each keeps its subject and its strength; several
  gained strength, asserting real lowered artefacts where they previously
  asserted the permissive `{}`.

  | file — cell | before → after | authority |
  |---|---|---|
  | `inline-object-quoted-field-name-refusal.test.ts` — B1's b4 row | `empty-schema-body` → `malformed-schema-field` | bug 0176 §Fix **A5**: "`checkObjectSchema` … and `emptySchemaBodyDiagnostic` … are not edited; **0133 owns that path**" |
  | `schema-body-nontype-text-refusal.test.ts` — f7, f8 | f7 gains `schema-type-not-expression` + `malformed-schema-field`, loses `empty-schema-body`; f8 keeps `unsupported-feature`, loses `empty-schema-body`, gains `malformed-schema-field` | §Fix (a)2 / (a)3 + constraint 5 |
  | `schema-alias-rhs-malformed.test.ts` — e2, e6 | as f8 / as f7 | §Fix (a)2 / (a)3 + constraint 5 |
  | `schema-alias-union-decl.test.ts` — n29 | as f7 | §Fix (a)2 / (a)3 + constraint 5 |
  | `params-literal-sublanguage-lowering.test.ts` — d12 | as f7 | §Fix (a)2 / (a)3 + constraint 5 |
  | `params-scalar-nontype-text-refusal.test.ts` — c1, c10, c13, c16, c19 | diagnostic sequence as f7, **plus** the lowered `$defs` / `properties` artefact moves from the permissive `{}` to a real one-property object shape | §Fix (a)2 (the gate it names) + §Fix (a)3 (`collectBodyTypes`) + constraint 5 |

- **Residuals:**
  1. **`skipBraceRemainder`'s end-of-input reach is NOT fixed.** §Fix (a)4 makes
     the resynchronisation stop "a second decision with its own blast radius",
     so this fix takes only the misattribution half of §Kind element 3: the
     surviving line anchors at the offending token instead of spanning four
     unrelated statements, but an unbalanced body still consumes the document
     remainder and the lost statements still draw no diagnostic naming them.
     Pinned as today's behaviour by witness cells 0g / 8b / 8c, which assert the
     statement list AND `doc.body.tail` and are labelled RESIDUAL in-file. A
     route that adds a stop at a declaration keyword or a `stmt-sep` reds
     exactly there.
  2. **An unclosed body at end of input, after a trailing comma, loads clean.**
     Measured during review: `schema S { a: string,` at EOF draws ZERO
     diagnostics — the field loop's `atEnd()` break returns the captured fields
     with no emission. Byte-identical at HEAD `f5d0d125`, outside all three
     recovery arms, and therefore outside this fix; adjacent to residual 1 and
     worth its own filing.
  3. **A zero-width anchor at end of input on arm 2.** `schema S { a: string,
     b as` at EOF draws `malformed-schema-field` at a zero-width EOF span.
     Inside the new row's *Trigger* and renderable, but no witness cell pins the
     EOF-token anchor shape. Follow-up cell material.
  4. **Three §Reproduction claims of this report are stale** and are pinned at
     their HEAD values as controls rather than at the report's quoted values:
     the keyword-name family draws `theta/parse/reserved-keyword-as-identifier`
     and retains its fields (bug 0153's arm) rather than loading clean;
     `schema S { a: string, b: }` draws `theta/parse/schema-type-not-expression`
     (bug 0061's arm) rather than loading clean, which *removes* a GOV-15
     obligation §Fix constraint 5 anticipated; and the inline-half row
     `schema S { a: string, b: {c: integer, 42: string} }` draws
     `theta/parse/inline-field-name-not-identifier` (bug 0176's family) rather
     than nothing. Every `src/parser/theta-document.ts` line citation in this
     report has also moved; the fix uses symbol-form citations throughout.
  5. **§Non-goals' "Everything below the parse seam" is falsified by this
     route**, and the falsification is named by §Fix (a) itself, so it is an
     internal inconsistency of this report rather than a scope extension. §Fix
     (a)2 authorises the gate — at this HEAD `checkObjectSchema`'s
     `if (s.fields !== undefined)` block in `walkStmt`'s `schema` arm is the
     SAME block that runs the per-field `parseTypeExpression` walk and bug
     0061's `schema-type-not-expression` last resort, so unlocking one unlocks
     the other in the same statement; and §Fix (a)3 relies on
     `collectBodyTypes` recording a real field list, which is what gives the
     lowering a non-empty `$defs` / `properties` fragment. The non-goal's
     rationale and consequence survive intact: every one of these inputs still
     carries an `E`, so the registration gate still refuses it and nothing below
     the seam is author-visible. Only the claim "unreached" is false. The five
     codes §Fix (a)2 lists are illustrative of the declaration checks, not an
     exhaustive fence on what the unlocked block emits.
- **Discharge notes appended:** none. Bug 0176 §Fix A5 already cedes this path
  to 0133 by name and needs no amendment; bugs 0095, 0045, 0033, 0096, 0129 and
  0153 keep every cell and every row this report names as theirs.
- **Pinned dispositions / non-goals:** unchanged. The `fn`-return
  body-absorption path, the inline half's tolerant field loop, a keyword
  accepted as a field name, the `<construct>` rendering vocabulary (bug 0063),
  the multiplicity question (bug 0129), an unterminated field type and the
  `params:` field list all stay out of scope exactly as §Non-goals fences them.
  The new *Message* is placeholder-free by design, so no placeholder-category
  determination arises and the closed `<construct>` table
  (`placeholder-rendering-a.md` §3) is untouched — bug 0063's subject is not
  entered. `tests/fixtures/h7a/permitted-codes.json` is unchanged: the
  determination stands on the measured fact that no H9a fixture declares a
  schema object body reaching any of the three arms, so the H9a acceptance
  surface is not on this fix's path.

## Coordination note (0.282.0, bug 0285)

Bug 0285's fix withholds the field-boundary comma-separation
`theta/parse/unsupported-feature` line when the captured field type ends no
`Type` atom or the stray tail cannot start a next field. Four `field`-position
cells of `tests/params-scalar-nontype-text-refusal.test.ts` (`c1`, `c10`,
`c13`, `c19`) — re-founded under this bug's §Fix (a) when the field-list
discard was settled — pinned that comma line only as riding emission
environment; under 0285 they pin the two-code sequence
`schema-type-not-expression` + `malformed-schema-field` via
`FIELD_JUNK_CODES_TYPE_REFUSAL_NO_COMMA`. Their subjects here (the retained
field's junk type reaching the checker-time field-type walk, and the
registration outcome) are unchanged; `c16` (`Triage Triage`) keeps the comma
line — its tail can start a next field. Ratified by the parent at 0285's merge
gate (vehicle-collateral class); full record in 0285's §Fix residual 1.
