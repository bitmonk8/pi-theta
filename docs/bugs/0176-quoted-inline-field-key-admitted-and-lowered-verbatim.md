# Bug 0176 — `grammar.md:101` refers the inline field to a `Field` form the corpus spells nowhere and `schemas.md:17` fixes as an identifier, so a SINGLE quoted field name loads with zero diagnostics at eleven measured `Type` positions and lowers a JSON Schema property whose name is the three characters `"a"` — quote characters included — a name `lexical.md:13`'s identifier production cannot spell and `schemas.md:39` reserves to the `as "WireName"` clause; AJV then enforces it against the model, so a payload naming the field the author wrote draws `must have required property '"a"'` beside `must NOT have additional properties` and the typed query spends its whole three-attempt repair budget before returning `Err(ValidationError { cause: "schema_validation" })`, while a payload copying the schema's own key validates in one attempt and binds a value whose only property no theta expression can read

- **Status:** open. This is the re-filing
  [0161](./0161-quoted-inline-field-name-not-a-field.md) §Fix **B2** prescribed
  and the 0159 fix run recorded as owed: 0161 closed `fixed (0.93.0)` on its own
  route-B terms — "*If route B is chosen, this report closes on the duplicate and
  the quoted-key question is re-filed rather than left implicit*" (§Fix B2) —
  and route B is what landed. The open half is the SINGLE quoted key:
  `{"a": string}` still loads at every `Type` position and still lowers
  `properties['"a"']`. §Fix is constraint-pinned, not settled: the two admissible
  directions are enumerated with their measured consequences, because the
  question is which production the inline field-name slot answers to, and that is
  a DIAG-2 adjudication before it is code. Ordering: nothing blocks this report
  from starting. One boundary binds — a refusal keyed on "the key is not
  identifier-shaped" also refuses `a as "w"`, which is
  [0160](./0160-inline-object-wire-name-rename-unparsed.md)'s open subject
  (§Fix A3, §Fix *Coordination*).
- **Sev/Diff estimate:** S1/D3 — S1 because a spelling the declaration position
  refuses loads with no diagnostic at eleven inline positions and mints the
  provider-facing schema from it, and both runtime outcomes are wrong on a
  production path: measured through the real `AjvSchemaValidator` and the real
  respond-repair loop, a model answering with the field the author wrote is
  rejected twice over and the typed query returns
  `Err(ValidationError { cause: "schema_validation", attempts: 3 })` after
  spending every follow-up in the default budget, while a model copying the
  schema's own escaped key validates in ONE attempt and binds a value whose sole
  property is unreachable from theta — `lexical.md:13`'s identifier production
  admits no `"`, and there is no static check anywhere that names either
  outcome; D3 because §Fix needs an in-run adjudication (which production the
  slot answers to, then a new registry row versus a widened one), the registry
  landscape it must answer to moved at 0.93.0 (the *Trigger* now keys on raw
  pre-colon text and `<field>` carries a row-scoped carve-out naming `"a"` as a
  reachable key), the natural detection site refuses `a as "w"` with it and so
  touches 0160's subject, and the fix re-pins cell G2 of the 18-cell witness
  shipped in the commit this report is filed from.
- **Kind:** spec gap — a production the corpus defers to but never spells at this
  position — plus the implementation half that follows from it. Three elements,
  all measured at HEAD `e54338a7`.
  1. **The grammar refers the inline field to a form only the declaration
     position enforces.** `docs/spec_topics/grammar.md:101` spells
     `ObjectType ::= "{" Field ("," Field)* ","? "}"` with the trailing comment
     "*inline anonymous object type; `Field` per Schema Declarations*", and
     `:109` repeats it in prose: an `ObjectType`'s fields "reuse the same `Field`
     form as an object-schema body and carry the same field semantics". The
     referent is `SchemaShape`'s object form (`:172`). `Field` has no production
     of its own anywhere in `docs/` — `rg 'Field\s*::=' docs/` matches
     `ToolField` (`grammar.md:66`, `docs/reference/grammar.md:554`,
     `docs/rfcs/0002-computed-tool-arguments.md:73`) and `WithField`
     (`docs/reference/grammar.md:253`), nothing else. The enforceable statement
     of it is `docs/spec_topics/schemas.md:17`: "Field names are identifiers."
     The one production that puts a quoted string beside a field name is the
     rename, written *after* the identifier (`:23`). No production derives
     `{"a": string}`.
  2. **The two positions disagree over identical text.**
     `schema S { "a": string }` draws
     `error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated.`
     — the row's declaration clause for "a body whose first token is not a plain
     `ident: Type` field list"
     (`docs/spec_topics/diagnostics/code-registry-parse.md:88`). The inline
     spelling of the same two tokens reports `[]` at all eleven `Type` positions
     probed, including every one of them that lowers (§Reproduction (a), (b)).
  3. **The silence has a wire consequence, and it is not a diagnostic.** Both
     lowerers key a property on the raw pre-colon text between the commas, so
     the quotes enter the JSON Schema key: the annotation root's lowering of
     `{"a": string}` is
     `{"type":"object","properties":{"\"a\"":{"type":"string"}},"required":["\"a\""],"additionalProperties":false}`,
     and every hoisting position mints the same bytes under one content-addressed
     `$defs` name (§Reproduction (c)). That fragment is the schema handed to
     providers (`schemas.md:36`) and the contract the runtime validates against
     (`:37`). A real `AjvSchemaValidator` compiles it with no throw and no
     diagnostic, then requires a property spelled `"a"` with its quotes
     (§Reproduction (d)); driven through the real respond-repair loop, the
     honest payload burns the whole attempts budget and ends in
     `Err(ValidationError { cause: "schema_validation" })`, and the payload that
     satisfies it binds a property theta cannot address (§Reproduction (e)).
- **Related:**
  - **0161** —
    [`0161-quoted-inline-field-name-not-a-field.md`](./0161-quoted-inline-field-name-not-a-field.md),
    **fixed (0.93.0)**, the parent. It owned the DUPLICATE spelling
    `{"a": string, "a": integer}` and closed on its §Fix route B, whose B2
    constraint states the terms this report exists under: "A SINGLE quoted field
    draws nothing under route B and still lowers `properties['"a"']` … If route B
    is chosen, this report closes on the duplicate and the quoted-key question is
    re-filed rather than left implicit." Its `## Fix (0.93.0)` *Residual* item
    repeats it and names the pin. This report is that filing and claims that half
    alone: everything 0161 measured about the duplicate is closed and stays
    closed (§Reproduction (g)).
  - **0159** —
    [`0159-inline-field-name-stop-masks-duplicate.md`](./0159-inline-field-name-stop-masks-duplicate.md),
    **fixed (0.93.0)**, the fix that closed the duplicate face and pinned this
    subject as deliberately open. Its route (a) re-keyed
    `theta/parse/duplicate-inline-field-name` onto the lowerers' own tokenisation
    — `splitTopLevel(interior, ",", "angle-and-brace")` plus `topLevelColon`,
    raw pre-colon text after `trim()` — so a quoted key is now a key like any
    other for the purpose of comparison, and is refused when it repeats. Its
    witness carries this report's subject as cell **G2** of
    `tests/inline-object-field-name-comparison-key.test.ts` (`:919–942`), which
    asserts BOTH the silence and the lowered bytes and states the re-pin
    condition in advance: "the report that closes it reds exactly here." Its fix
    report (`.pi/tmp/fixes/0159-report.md` *Residuals* item 1) records the filing
    as owed to the parent.
  - **0160** —
    [`0160-inline-object-wire-name-rename-unparsed.md`](./0160-inline-object-wire-name-rename-unparsed.md),
    **open**, narrowed by an append-only coordination note at 0.93.0. It owns the
    wire-name SEMANTICS of the `as "WireName"` clause inside an inline body: the
    clause is not parsed, no inline field record carries a `wireName`, so
    `theta/parse/wire-name-collision` and `theta/parse/redundant-wire-name`
    cannot fire there (its §Reproduction (a) rows G1/G2/G4) and the whole
    pre-colon text — `a as "w"`, or `aas"w"` at the seven positions that collapse
    inter-token whitespace — becomes the lowered property name (its rows L1–L6).
    **The separating observable is what stands at the field-name position, and
    what the lowered key then contains.** 0160's position holds an IDENTIFIER
    with an unparsed clause behind it: `TypeParser.parseObject` consumes `a` as a
    field-name candidate, `eatPunct(":")` fails against `as` and the loop breaks
    (`type-grammar.ts:569–571`), and the minted key is the whole pre-colon text —
    measured `aas"w"` at the annotation root and `a as "w"` at `params:`. This
    report's position holds no identifier at all — a `kind: "str"` token — which
    the loop consumes and skips at `:565–568` before any colon test, and the
    minted key is the author's quoted text itself. Neither report's subject moves
    the other's rows: `{a as "w": integer}` and `{"a": string}` both load
    silently today, and refusing one does not refuse the other unless the refusal
    is keyed on the LOWERED key's shape, which is the one route that touches both
    (§Fix A3).
  - **0045** —
    [`0045-inline-empty-object-type-missing-empty-schema-body.md`](./0045-inline-empty-object-type-missing-empty-schema-body.md),
    **fixed (0.57.0)**, the reservation this report answers for one shape only.
    Its §Non-goals names `{ a }`, `{ "a": string }` and `{ a: }` in one sentence
    as malformed-but-non-empty interiors that "drop their field through
    `parseObject`'s tolerant recovery and stay silent", each needing its own spec
    decision. 0161's §Fix A3 kept the quoted shape distinct from the other two
    and this report keeps that distinction, on a measured observable: `{ a }` and
    `{ a: }` mint NO property (the root lowering is
    `{"type":"object","properties":{},"required":[],"additionalProperties":false}`),
    while the quoted spelling mints one whose name carries quote characters
    (§Reproduction (h)). 0045 also fixes the placeholder precedent route A leans
    on: `<X>`'s literal-`{}` carve-out for the inline arm of
    `theta/parse/empty-schema-body` (`placeholder-rendering-b.md:55`).
  - **0052** —
    [`0052-inline-object-duplicate-field-names-silent-last-wins.md`](./0052-inline-object-duplicate-field-names-silent-last-wins.md),
    **fixed (0.84.0)**, the origin of the family. Its §Expected forbids a
    fragment carrying a repeated `required` entry; this report's subject carries
    none — a single quoted field repeats nothing — so what is claimed here is the
    property NAME, not the repeat. Its cell d5
    (`tests/inline-object-duplicate-field-name.test.ts:811`) was re-pinned to a
    refusal by the 0159 fix and is not this report's to move.
  - **0154** —
    [`0154-inline-object-type-field-name-rules-unenforced.md`](./0154-inline-object-type-field-name-rules-unenforced.md),
    **open**, the same slot and a disjoint question. 0154 owns the identifier
    RULES at the inline field-name position (the lowercase-first and
    reserved-keyword rules, both unenforced there); its subject text IS an
    identifier that breaks a rule, and it rebases onto the `fieldNames` retention
    the 0159 fix deliberately kept. This report's subject is a token that is not
    an identifier, so `parseObject` records nothing and no identifier rule can
    reach it. Whichever lands first decides where a non-identifier field-name
    position is detected; the other reuses that site rather than adding a second.
  - **0133** —
    [`0133-field-list-discard-recovery-unsettled.md`](./0133-field-list-discard-recovery-unsettled.md),
    **open**, the recovery space no route here may enter. It owns
    `parseSchemaObjectBody` / `skipBraceRemainder` and the truth of the
    `'S' has no fields` message over a body that declares one — the line
    §Reproduction (b) measures. Those five rows are this report's control group.
  - **0134** —
    [`0134-params-shift-induced-stale-citations.md`](./0134-params-shift-induced-stale-citations.md),
    **open**, the adjudicated do-not-chase class for positional drift.
    `src/parser/type-grammar.ts` grew 835 → **923** lines at the 0159 fix, so
    every pre-0.93.0 citation into it below the insertion points is stale; the
    sibling docs' `code-registry-parse.md:87` and
    `docs/reference/diagnostics.md:136` are `:89` and `:138` at this HEAD. Every
    volatile position below is named by symbol beside its line.
- **Affected** (every citation verified against the tree at HEAD `e54338a7`,
  v0.93.0; symbols named beside lines per 0134):
  - **The field loop that drops the token.** `TypeParser.parseObject`
    (`src/parser/type-grammar.ts:533`), loop at `:558–599`. At `:562–568` the
    token standing at a field-name position is read and, when its `kind` is not
    `"ident"`, consumed and skipped with no record: `this.next(); continue;`.
    `tokeniseType` (`:272`) gives a quoted run `kind: "str"` (`:286–305`, the
    push at `:303`), so the `"a"` and the `:` behind it are consumed one token at
    a time and neither `fieldNames` (`:579`) nor `fieldTypes` gains an entry.
    That branch is unchanged by the 0159 fix.
  - **The source slice the rule now reads instead.** `interiorSource`
    (`:610–613`) — the raw text between this node's own `{` and the depth-0 `}`
    `interiorClosingBraceIndex` (`:357`) finds, sliced off `TypeToken.start`
    offsets so the bytes are exactly what the lowerers' split would see.
    `inlineObjectFieldKeys` (`:647`) is the 0159 fix's comparison key: every
    entry of `splitTopLevel(interiorSource, ",", "angle-and-brace")`, keyed on
    its own raw pre-colon text after `trim()`, skipping an entry with no
    top-level `:` and an entry whose key trims to empty. For `{"a": string}` it
    returns exactly one key, the three characters `"a"` — which is why the
    duplicate rule is silent (nothing repeats) and why a shape test at this site
    is the cheapest detection point (§Fix A1).
  - **The rule that finds no repeat.** `walkType`'s `object` arm (`:784`); the
    two gates at `:813` (`!insideGenericArgument && node.closingBraceSpelled`,
    both satisfied here); the `Set`-based scan at `:814–824` and the emission at
    `:825–831`. One key occurring once passes through it silently by
    construction.
  - **The single entry point that runs the walk.** `parseTypeExpression`
    (`:137`), called at nine sites: `src/parser/params.ts:211`,
    `src/parser/theta-document.ts:5943`, `:6231`, `:6306`, `:6312`, `:6396`,
    `:6619`, `:6714`, and `src/parser/schema-subset-gate.ts:123`. The
    `"inline-object-shape"` rule set (`type-grammar.ts:126`) is selected at
    `theta-document.ts:6623`.
  - **The two lowerers, which key on raw pre-colon text and so keep the
    quotes.** Neither reads `fieldNames`.
    - `hoistInlineObjectType` (`src/parser/params.ts:849`) — the shared hoist for
      the `params:` field, the `schema` body field, the alias right-hand side and
      the nested cases. Split at `:856`, `topLevelColon` at `:857`,
      `entry.slice(0, colon).trim()` at `:861`, `properties[fieldName]` at
      `:866`, `required.push(fieldName)` at `:867`.
    - `lowerInlineObject` (`src/parser/body-type-lowering.ts:156`) — the
      annotation root's lowerer. Split at `:165`, colon at `:166`,
      `entry.slice(0, colon).trim()` at `:170`, returning through
      `lowerObjectFields` (`:110`), whose writes are `:122` and `:131`.
    - Both splitters are quote-aware, which is what carries the quotes intact
      into the key instead of perturbing the split. `topLevelColon`
      (`params.ts:1122`) and `splitTopLevel` (`:1245`) are the functions
      `inlineObjectFieldKeys` imports, so the rule's key and the lowered key are
      the same text by construction.
  - **The annotation root's own lowering.** `lowerQueryResponseSchema`
    (`src/runtime/query-schema-lowering.ts:113`) — the seam that returns the
    inline body AS the compiled document root rather than a `$ref` wrapper.
  - **The compile seam.** `AjvSchemaValidator` (`src/seams/schema-validator.ts`):
    the instance at `:112` (`new Ajv({ strict: false, allErrors: true, logger: false })`),
    `compile` at `:116`, `#build` at `:148` and `this.#ajv.compile(schema)` at
    `:149`. A single quoted field mints no duplicate `required`, so this class
    never reaches the meta-schema throw 0052's A2 and 0161's row v1 measured —
    it compiles cleanly and enforces.
  - **The runtime path that then enforces it against the model.**
    `buildTypedQueryValidation` (`src/runtime/typed-query-validation.ts:168`),
    `validateAgainst` (`:318`), `runRespondRepair` (`:223`);
    `runRespondRepairLoop` (`src/runtime/query-respond-repair.ts:201`), its
    terminal-exhaustion return (`:271`) and `terminalValidationError` (`:282`).
    The default budget is three follow-ups
    (`docs/spec_topics/frontmatter/frontmatter-fields-a.md:17`, `:45`).
  - **The declaration path, untouched and the contrast.** `checkObjectSchema`
    (`src/parser/schema-declarations.ts:87`) is never reached for a quoted-key
    body; the declaration's refusal comes from `parseSchemaObjectBody`'s recovery
    through `emptySchemaBodyDiagnostic` (`:63`), 0133's subject.
  - **The `params:`-position guards any emission there must sit behind.** The
    bug-0059 type-half suppression (`src/parser/params.ts:349`) and the
    one-diagnostic-per-field precedence at `:402–404`, whose registered statement
    is the third precedence rule of
    `docs/spec_topics/diagnostics/code-registry-load.md:19`.
  - **The registered rows.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:89` —
    `theta/parse/duplicate-inline-field-name`, whose *Trigger* was rewritten at
    0.93.0 and now states the comparison key as the entries of a brace-and-angle
    aware split "keyed on each entry's own text before its own top-level `:`,
    taken verbatim after `trim()`", naming `"a"`, `'a'` and `a as "w"` as "the
    keys they are written as"; its *Message* is
    `duplicate field name '<field>' within one inline object type`. `:88` —
    `theta/parse/empty-schema-body`, whose inline clause is "An empty inline
    object type (`{}`) in any `Type` position" and whose declaration clause
    covers a body "whose first token is not a plain `ident: Type` field list".
  - **The placeholder constraints on any message a fix renders.**
    `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10` — `<field>` is
    identifier-shaped and rendered unquoted on fourteen rows, and carries the
    0.93.0 ROW-SCOPED carve-out on `duplicate-inline-field-name` alone, under
    which it "renders that text as written (`"a"`, `'a'`, `a as "w"`, or `""`)".
    `:11` and `:129` — `<key>` is the category-5 placeholder that double-quotes a
    key when a runtime `^[A-Za-z_][A-Za-z0-9_]*$` test fails. `:55` — `<X>`
    renders the literal `{}` on `empty-schema-body`'s empty-inline-object trigger
    and identifier form everywhere else.
  - **The mirrors that move in lock-step with any registry edit.**
    `docs/reference/grammar.md:203–208` (the `ObjectType` bullet naming both
    codes and the re-keyed comparison) and `docs/reference/diagnostics.md:138`
    (the `duplicate-inline-field-name` row; the reference table carries no
    *Trigger* column).
  - **Spec anchors.** `docs/spec_topics/grammar.md:101`, `:109`, `:172`;
    `docs/spec_topics/schemas.md:17` (field names are identifiers), `:23` (the
    rename clause's position), `:34` (theta-side access is by the identifier),
    `:36`/`:37` (the two places a wire name appears), `:39` (the rename is "the
    only mechanism for expressing schemas whose property names are not
    theta-identifier-compatible"), `:43` (a wire name is a string literal);
    `docs/spec_topics/lexical.md:13` (`[A-Za-z_][A-Za-z0-9_]*`);
    `docs/spec_topics/type-system.md:15` (one type grammar in every annotation
    position); `docs/spec_topics/schema-subset.md:73` (the `__inline_<slug>`
    hoist); `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
    (DIAG-4);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  - **The landed witness this fix re-pins.**
    `tests/inline-object-field-name-comparison-key.test.ts:919–942` — cell G2,
    which asserts the silence AND the lowered bytes of `{"a": string}` and whose
    comment authorises the re-pin in advance. `:892–917` — cell G1, the five
    declaration controls, which no route may move.
    `tests/inline-object-duplicate-field-name.test.ts:811` — cell d5, 0052's
    quoted-duplicate cell, re-pinned to a refusal at 0.93.0 and not this
    report's.
- **Observed at:** v0.93.0 (HEAD `e54338a7`). Offline, deterministic,
  provider-free; every row below re-derived for this filing through `parseDoc`
  (`tests/helpers/e2e-s1.ts`), the shipped lowerers, a real `AjvSchemaValidator`
  and the real `buildTypedQueryValidation` / respond-repair loop with a scripted
  follow-up drive, in three scratch vitest probes that were run and then deleted.
  No live run is needed: the load path is parse-and-lower, and both runtime
  seams are driven in-process.

## Summary

`ObjectType` defers its field form to the object-schema `Field`, and
`schemas.md:17` fixes a field name there as an identifier. The declaration
position enforces that — `schema S { "a": string }` is refused. The inline
position does not: `TypeParser.parseObject` consumes a non-identifier token at a
field-name position and continues with no record, so no diagnostic site ever sees
the quoted name.

The 0159 fix (0.93.0) re-keyed `theta/parse/duplicate-inline-field-name` onto the
lowerers' own tokenisation, which closed the DUPLICATE spelling: `{"a": string,
"a": integer}` is now one key written twice and is refused at every `Type`
position. It says nothing about one quoted key written once. `{"a": string}`
loads with zero diagnostics at all eleven positions measured and lowers a JSON
Schema property whose name is the three characters `"a"` — the quotes are part of
the key — under `required: ["\"a\""]` and `additionalProperties: false`. The same
bytes appear at every hoisting position under one content-addressed `$defs` name.

That fragment is the provider-facing schema, and both of its runtime outcomes are
wrong. A real `AjvSchemaValidator` compiles it with no throw and no diagnostic.
A payload naming the field the author wrote — `{"a": "hello"}` in ordinary JSON,
which supplies the property `a` — draws two errors,
`must have required property '"a"'` and `must NOT have additional properties`;
driven through the real respond-repair loop at the default budget, all three
follow-ups fail identically and the query returns
`Err(ValidationError { cause: "schema_validation", attempts: 3 })`. A payload
that copies the schema's own escaped key — `{"\"a\"": "hello"}` — validates on
the first attempt, and the value bound into body scope carries one property no
theta expression can address: `lexical.md:13`'s identifier production admits no
quote character, and `schemas.md:39` names `as "WireName"` as the only mechanism
for a property name that is not theta-identifier-compatible.

The question this report exists to settle is which production the inline
field-name slot answers to. If it is `Field`, the quoted spelling is refused at
parse and no fragment is minted. If instead the quoted text is admitted as a wire
name, the slot acquires wire-name semantics it does not have today — which is
0160's open subject, and a change to the lowered bytes of inputs that load
cleanly. §Fix pins both directions and their measured consequences.

## Reproduction

All rows measured at HEAD `e54338a7`. `parseDoc` renders each diagnostic
`<severity> <code>: <message>`; `[]` is a clean load. Every body fixture carries
`mode: prompt` frontmatter and a `let a = 1` / `a` tail, so no
`theta/load/missing-mode` noise is present. `Q` abbreviates `{"a": string}`.

### (a) The inline spelling is silent at every measured position

| row | position | source | reported |
|---|---|---|---|
| q1 | `@<T>` annotation root | ``let r = @<Q>`hi` `` | `[]` |
| q2 | `let` annotation | `let x: Q = 1` | `[]` |
| q3 | `schema` body field | `schema S { p: Q }` | `[]` |
| q4 | `fn` parameter | `fn f(p: Q) { 1 }` | `[]` |
| q5 | `fn` return | `fn f(): Q { 1 }` | `[]` |
| q6 | alias right-hand side | `schema S = Q` | `[]` |
| q7 | `params:` field | a `params:` block whose one entry is `p: 'Q'` | `[]` |
| q8 | `invoke<T>` annotation | `let r = invoke<Q>("./x.theta")` | `[]` |
| q9 | union arm | `@<Q \| null>` | `[]` |
| q10 | nested one level | `@<{p: Q}>` | `[]` |
| q11 | `.thetalib` | `schema S { p: Q }` in a `.thetalib` | `[]` |

Row q7 uses the single-quoted YAML scalar so the interior double quotes reach the
theta type grammar; the unquoted flow-mapping spelling resolves one layer earlier
as a frontmatter subject (0052's cell a11,
`tests/inline-object-duplicate-field-name.test.ts:521`; §Non-goals).

### (b) The declaration spelling of the same text is refused

| row | source | reported |
|---|---|---|
| b1 | `schema S { "a": string }` | `error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated.` |
| b2 | `schema S { "a": string, "a": integer }` | same single line |
| b3 | `schema S { "a": string, b: integer }` | same single line |
| b4 | `schema S { b: integer, "a": string }` | same single line |
| b5 | `schema S { a: string }` | `[]` |
| b6 | `schema S { a as "w": string }` | `[]` |

b5 and b6 bound b1–b4 to the quoted NAME: an identifier field and a rename whose
wire name is quoted both load at the declaration position. b4 adds that a quoted
name anywhere in the body discards the whole field list, not only a body whose
first token is quoted. The `'S' has no fields` message over a body that declares
one is 0133's subject; this report claims only that the two positions disagree
about the text. Rows b1–b3, b5 and b6 are cell G1 of the landed witness and are a
control group here; b4 is measured for this filing and is not in that cell.

### (c) The lowered bytes, at every position that lowers

The annotation root's own lowering, read back from the type-source text the
`@<T>` position captures:

```
{"type":"object","properties":{"\"a\"":{"type":"string"}},"required":["\"a\""],"additionalProperties":false}
```

| row | seam driven | result |
|---|---|---|
| L1 | `lowerQueryResponseSchema(Q, [], [])` | the fragment above, AS the document root |
| L2 | `@<{p: Q}>` (nested one level) | `{"type":"object","properties":{"p":{"$ref":"#/$defs/__inline_ab25cb236d1e93a1"}},"required":["p"],"additionalProperties":false,"$defs":{"__inline_ab25cb236d1e93a1":{"type":"object","properties":{"\"a\"":{"type":"string"}},"required":["\"a\""],"additionalProperties":false}}}` |
| L3 | the `params:` document's own `loweredSchema` | byte-identical to L2 |
| L4 | `schema S { p: Q }` lowered through the body-type map | byte-identical to L2 |
| L5 | `schema S = Q` (alias arm) | `{"$ref":"#/$defs/__inline_ab25cb236d1e93a1","$defs":{ … the same fragment … }}` |
| L6 | `@<Q \| null>` (union arm) | `{"anyOf":[{"$ref":"#/$defs/__inline_ab25cb236d1e93a1"},{"type":"null"}],"$defs":{ … the same fragment … }}` |
| L7 | `@<{p: Q, q: Q}>` | two properties, ONE `$defs` entry — `p` and `q` both `$ref` `#/$defs/__inline_ab25cb236d1e93a1` |

`__inline_ab25cb236d1e93a1` is the canonical hash of the quoted-key fragment
(`schema-subset.md:73`), so every position addresses one entry. The type-source
text the `@<T>` position captures is `{"a":string}` — the seven non-`params:`
positions rebuild it by joining lexer token texts with no separator (0159 fix
report, residual 2) — and the KEY is unaffected, because this subject carries no
inter-token whitespace inside its key.

### (d) AJV, driven through the production seam

A real `AjvSchemaValidator` over the L1 fragment. `emitted` is the diagnostic
list the seam produced.

| row | payload | result |
|---|---|---|
| v1 | — (compile only) | compiles, no throw, `emitted: []` |
| v2 | `{"a": "s"}` — ordinary JSON naming the field the author wrote | `ok: false`, TWO errors: `must have required property '"a"'` (`params.missingProperty` = `"a"`) and `must NOT have additional properties` (`params.additionalProperty` = `a`) |
| v3 | `{"\"a\"": "s"}` — the schema's own escaped key | `ok: true` |
| v4 | `{}` | `ok: false`, one `must have required property '"a"'` |
| v5 | the L2 document against `{"p": {"a": "s"}}` | `ok: false`, the same two errors at `instancePath` `/p` |
| v6 | the L2 document against `{"p": {"\"a\"": "s"}}` | `ok: true` |
| v7 | the `params:` document (L3) against `{"p": {"a": "s"}}` | `ok: false`, the same two errors at `/p` |

There is no meta-schema throw in this class: one quoted field repeats nothing, so
`required` carries no duplicate item and the fragment is a valid JSON Schema
document. It is valid and it is unsatisfiable by any payload that spells the
author's field name.

### (e) The end-to-end typed-query drive

The real `buildTypedQueryValidation` over the L1 fragment, `attempts: 3` (the
declared default), `maxRounds: 4`, with a scripted `driveFollowUp`. No provider
is involved; the drive returns a fixed reply text.

| row | the follow-up drive returns | observed |
|---|---|---|
| r1 | `{"a": "hello"}` every time | 3 follow-ups driven, then `{kind:"validation", error:{kind:"validation", cause:"schema_validation", message:"typed query response failed schema validation", attempts:3, validation_errors:[{path:"",message:"must have required property '\"a\"'",schema_keyword:"required"},{path:"",message:"must NOT have additional properties",schema_keyword:"additionalProperties"}], raw_response:"{\"a\":\"hello\"}"}}` |
| r2 | `{"\"a\"": "hello"}` | 1 follow-up driven, then `{kind:"value", value:{"\"a\"":"hello"}, attemptsUsed:1}` |

The opening validation of `{"a": "hello"}` reports the same two issues. The first
follow-up prompt the loop renders is, verbatim to its first line break:

```
Your previous response did not match the required schema. Validation errors:  must NOT have additional properties;  must have required property '"a"'. Return your final answer using the `__theta_respond_5b35769b36884b75` tool, conforming to this schema:
```

followed by the pretty-printed fragment, in which the property name appears as
`"\"a\""`. So the repair loop's own instruction is to produce a key carrying
quote characters, and r2 shows a model that obeys it is accepted: the value
bound into body scope is `{"\"a\"": "hello"}`.

### (f) Quote style and the empty spelling behave alike

| row | source | reported | lowered property name |
|---|---|---|---|
| f1 | `{"a": string}` | `[]` | `"a"` (three characters) |
| f2 | `{'a': string}` | `[]` | `'a'` (three characters) |
| f3 | `{"": string}` | `[]` | `""` (two characters) |
| f4 | `{"a-b": string}` | `[]` | `"a-b"` |
| f5 | `{"a" : string}` | `[]` | `"a"` — the padding never reaches the key: the annotation root's capture joins token texts (`{"a":string}`) and the `.trim()` absorbs it at `params:` |
| f6 | `{"a": string, b: integer}` | `[]` | two properties, `"a"` and `b` |
| f7 | `{a: integer, "a": string}` | `[]` | two DISTINCT properties, `a` and `"a"`, `required: ["a","\"a\""]` |

Rows f2 and f3 re-measure, after the 0.93.0 re-key, the two spellings 0161 pinned
only in DUPLICATE form (its §Reproduction (f) rows f3 and f4): the single-key
admission is identical across quote styles and for the empty string. AJV behaves
alike on each — `{'a': string}` rejects `{"a":"s"}`
with `must have required property ''a''` and accepts `{"'a'":"s"}`;
`{"": string}` rejects `{"":"s"}` with `must have required property '""'` and
accepts `{"\"\"":"s"}`. Row f7's two properties are the same value under two
names, neither of which the author can select between from theta.

Row f2 at the `params:` position needs the DOUBLE-quoted YAML scalar
(`p: "{'a': string}"`) — measured `[]`, lowering property `'a'` under
`__inline_24ab9554df5b5eae`. The single-quoted YAML scalar cannot carry a
single-quoted theta spelling: the frontmatter resolves first and the file draws
`theta/load/missing-mode`. `{"": string}` at `params:` under the single-quoted
YAML scalar is `[]`, lowering `""` under `__inline_40828e8e0669da40`.

### (g) The duplicate face is closed, and stays closed

| row | source | reported |
|---|---|---|
| c1 | `{"a": string, "a": integer}` | `error theta/parse/duplicate-inline-field-name: duplicate field name '"a"' within one inline object type` |
| c2 | `{'a': string, 'a': integer}` | the same code, subject `'a'` |
| c3 | `{"": string, "": integer}` | the same code, subject `""` |
| c4 | `{"a" : string, "a" : integer}` | the same code, subject `"a"` — padding absorbed by the trim |
| c5 | `{"a": string, 'a': integer}` | `[]` — two quote styles are two distinct raw keys (0159's settled key, its cell B1) |

c1 is refused at all eleven positions of §Reproduction (a). This report claims
nothing about these rows; they are quoted to fix the boundary, and c5 is the one
row where the settled key admits two spellings of one intended wire name.

### (h) Boundaries measured, not assumed

| row | source | reported | lowered |
|---|---|---|---|
| h1 | `{ a }` | `[]` | `{"type":"object","properties":{},"required":[],"additionalProperties":false}` — NO property |
| h2 | `{ a: }` | `[]` | the same — NO property |
| h3 | `{ a, b: integer }` | `[]` | one property `b` |
| h4 | `array<{"a": string}>` | `[]` | `{"type":"array","items":{}}` — the generic-argument interior is never divided into fields |
| h5 | `{a as "w": integer}` | `[]` at all eleven positions | one property named `aas"w"` at the annotation root and `a as "w"` at `params:` (0160's subject) |

h1–h3 are 0045's reserved shapes: they are silent like this report's subject and
mint no property at all, which is the observable that keeps the two classes
apart. h4 is 0052's settled generic carve-out. h5 is 0160's.

### (i) There is no static check on the theta side either

| row | source tail | reported |
|---|---|---|
| t1 | ``let r = @<{"a": string}>`hi` `` + `let v = r.a` | `[]` |
| t2 | `schema S { p: {"a": string} }` + ``let r = @<S>`hi` `` + `let v = r.p.a` | `[]` |
| t3 | ``let r = @<{a: string}>`hi` `` + `let v = r.zzz` (control) | `[]` |

t3 shows no field-existence check exists at this position for ANY name, so the
unaddressability of the minted key is not diagnosable today and is not claimed as
a missing check here. It is a grammar fact: `lexical.md:13` spells an identifier
`[A-Za-z_][A-Za-z0-9_]*`, which admits no quote character, so no theta expression
selects the property the fragment requires.

### (j) Corpus exposure

`rg --files -g '*.theta' -g '*.thetalib'` over the working tree is **34** files.
A PCRE2 sweep for a quoted token at a field-name position
(`[{,]\s*(["'])[^"']*\1\s*:`) over all 34 matches **zero** lines. The only
committed inline object type is
`tests/live/acceptance/fixtures/acc-typed-inline.theta:14`
(`{ ok: boolean, label: string }`), and the only `as "` hit in the corpus is the
English word inside a comment (`docs/examples/ralph-inline.theta:35`). No
committed source moves under any route below. The census must be **re-run at the
fix HEAD** rather than copied (§Fix *Common obligations*).

## Expected behaviour

`grammar.md:101` and `:109` put the inline field inside the object-schema `Field`
form, and `schemas.md:17` makes a field name there an identifier. The inline
position therefore owes one of two things, and today it delivers neither:

1. **A refusal.** `{"a": string}` is not a `Field`, so the document does not
   load, at every `Type` position and every nesting depth reachable through
   inline object fields and union arms — the same reach
   `theta/parse/duplicate-inline-field-name` and `theta/parse/empty-schema-body`
   already have (`type-system.md:15`; the eleven positions of §Reproduction (a)).
   The declaration position already refuses the same text, and the corpus states
   no reason for the two positions to differ.
2. **Failing that, no unaddressable wire artefact.** `schemas.md:39` states that
   the `as "WireName"` clause "is the only mechanism for expressing schemas whose
   property names are not theta-identifier-compatible", and `:34` that theta-side
   "the field is accessed, constructed, and pattern-matched as the theta
   identifier … every other corner of the language sees only that identifier".
   A quoted key mints exactly such a property name through a spelling that is not
   that mechanism, and leaves no theta-side identifier at all: the property is
   required, `additionalProperties: false` forbids any other, and no theta
   expression can construct or read it.

Consequently the runtime outcomes are both owed differently. A payload spelling
the author's field name must not be rejected for a key the author never wrote
(§Reproduction (d) row v2, (e) row r1), and a payload that satisfies the minted
key must not bind a value the body cannot address (row r2). Whichever answer is
chosen, `schema S { "a": string }` and `let x: {"a": string}` answer alike.

## Actual behaviour / root cause

Three facts compose, in the order the source meets them.

**1. The token is dropped, not recorded.** `TypeParser.parseObject`
(`type-grammar.ts:533`) reads the token at each field-name position at `:562`.
When its `kind` is not `"ident"` the token is consumed and the iteration restarts
(`:565–568`) — no name, no type, no diagnostic, no marker that a field position
was passed over. `tokeniseType` (`:272`) classifies a quoted run as `kind: "str"`
(`:286–305`), so `"a"` takes that branch and the `:` behind it, being
`kind: "punct"`, takes it on the next iteration. `fieldNames` (`:579`) stays
empty. The 0159 fix changed nothing here: it kept the retention for 0154 and
moved the duplicate rule off it.

**2. The rule that now reads the source finds nothing to report.** `walkType`'s
`object` arm (`:784`) passes both gates for this source and iterates
`inlineObjectFieldKeys(node.interiorSource)` (`:816`, the function at `:647`),
which yields exactly one key — the three characters `"a"`. The rule compares keys
for REPEATS (`:814–824`); a key occurring once is not a repeat, so nothing is
emitted. That is the shape 0161 §Fix B2 predicted and 0159's cell G2 pinned. No
other check
runs at this position: `parseTypeExpression` (`:137`) applies the `ObjectType`
shape rules and the position rules, and none of them asks what a key looks like.

**3. The lowerers key on the same text, and mint it as a property name.**
`hoistInlineObjectType` (`params.ts:849`) and `lowerInlineObject`
(`body-type-lowering.ts:156`) each re-split the interior on top-level commas
(`:856`, `:165`), find the top-level colon (`:857`, `:166`) and take
`entry.slice(0, colon).trim()` as the property name (`:861`, `:170`), writing it
at `params.ts:866`/`:867` and `body-type-lowering.ts:122`/`:131`. Both splitters
skip quoted regions, so the quotes are neither consumed nor escaped — they are
part of the key. Since 0.93.0 the rule and the lowerers share those two functions
by import, which is why the comparison agrees with the lowering by construction:
the agreement holds, and both agree on a key the grammar does not derive.

The consequence is not confined to the schema text. `AjvSchemaValidator`
(`schema-validator.ts:149`) compiles the fragment — it is a well-formed JSON
Schema document — and the validator then demands the quoted property. At the
`@<T>` root, `validateAgainst` (`typed-query-validation.ts:318`) turns that into a
`schema_validation` failure, `runRespondRepairLoop`
(`query-respond-repair.ts:201`) re-drives the model up to the declared budget
with a follow-up whose rendered schema shows the escaped key, and on exhaustion
`terminalValidationError` (`:282`) surfaces
`Err(ValidationError { cause: "schema_validation" })`. Each of those seams is
correct for the fragment it was handed; the fragment is of a form the position
was not supposed to admit.

The declaration position never reaches this code. Its body is read by
`parseSchemaObjectBody` (0133's subject), whose recovery discards the body and
yields `emptySchemaBodyDiagnostic` (`schema-declarations.ts:63`), so
`checkObjectSchema` (`:87`) — the only field-name well-formedness check in the
parser — is not reached either. The two positions refuse and admit for unrelated
reasons; nothing today makes them agree.

## Why it matters

- **A spelling the spec refuses loads at eleven positions.** §Reproduction (a)
  against (b): the same text is an error in a `schema` body and clean in every
  inline position, including every one that lowers and the `.thetalib` surface.
  `grammar.md:101` says the two positions are one form.
- **The typed query fails after spending its whole repair budget.**
  §Reproduction (e) row r1, measured through the real loop: three follow-ups, the
  same two AJV errors each time, then
  `Err(ValidationError { cause: "schema_validation", attempts: 3 })`. The author's
  defect is one quoted character pair in the source; the report is a runtime
  validation error naming a property name the author did not write. The budget is
  the declared default (`frontmatter-fields-a.md:17`), so the cost scales with
  whatever the theta configures.
- **The other outcome binds a value the body cannot read.** Row r2: a model that
  copies the schema's own escaped key validates in one attempt, and the value
  bound into body scope is `{"\"a\"": "hello"}`. `lexical.md:13` admits no quote
  character in an identifier, so no field access, construction or `match` pattern
  in theta selects that property (§Reproduction (i)), and no static check names
  the situation. That is a silent wrong value on a production path.
- **The lowered property name bypasses the corpus's only sanctioned mechanism
  for it.** `schemas.md:39` states the `as "WireName"` clause is "the only
  mechanism for expressing schemas whose property names are not
  theta-identifier-compatible". A quoted key produces exactly such a name with no
  rename written, and unlike a rename it leaves no theta-side identifier behind
  (`:34`).
- **The schema is what the provider is shown.** `schemas.md:36` makes the lowered
  `properties`/`required` keys the schema handed to providers, and the repair
  loop's own follow-up prompt renders `"\"a\""` back to the model
  (§Reproduction (e)). The model is being asked to produce a property name the
  author did not write.
- **The registry now documents the hole as a reachable key.** After 0.93.0,
  `code-registry-parse.md:89` names `"a"` and `'a'` among "the keys they are
  written as", and `placeholder-rendering-b.md:10`'s row-scoped `<field>`
  carve-out exists to render exactly those subjects. Both sentences are correct
  about a behaviour that contradicts `grammar.md:101`, and a reader of the
  registry cannot tell that the single-key spelling is admitted at all.
- **No committed source moves.** §Reproduction (j) measures zero occurrences
  across all 34 `.theta`/`.thetalib` in the working tree, so the GOV-15
  disposition of a refusal is the addition arm of the diagnostic-registry
  carve-out (`source-language-stability.md:25`) over an input set that is
  presently empty in-repo.

## Fix

Not settled. The two directions below are constraint-pinned; the run selects one
and records the evidence that settled it. They are not equivalent: route A
refuses the spelling and mints no fragment; route B admits it and changes the
bytes minted for an input that loads cleanly today, which is a different GOV-15
disposition and a different report's territory.

The labels are this report's own. Route A here is 0161's route A narrowed to the
single-key case; 0161's route B was the re-key that landed at 0.93.0 and is not
among the options below.

### Route A — the inline field-name slot admits an identifier only

`{"a": string}` is refused at parse, at every `Type` position and every nesting
depth reachable through inline object fields and union arms, before the body is
lowered. No fragment is minted, so neither runtime outcome of §Reproduction (e)
exists. This is 0161's route A scoped to the single-key case. Its constraints
carry over; three of them changed at 0.93.0 and are re-derived below — the
detection site (A1), the placeholder options (A2) and the *Trigger* consequences
(A4).

- **A1 — two admissible detection sites, and the second is new at 0.93.0.**
  (i) `TypeParser.parseObject`'s `else` branch (`type-grammar.ts:565–568`) is
  still the one place that sees a non-identifier token standing at a field-name
  position; a refusal keyed there on "any non-identifier token" without a
  position test widens into 0045's reserved family, because the loop reaches that
  branch for every token it cannot use. (ii) `inlineObjectFieldKeys` (`:647`) —
  the comparison key the 0159 fix installed — already produces exactly the list a
  shape test needs, and its two skips do the boundary work for free: an entry
  with no top-level `:` yields no key, so `{ a }` is invisible there
  (§Reproduction (h) row h1), and `{ a: }`'s key is the identifier `a`, so it is
  not refused either (row h2). Site (ii) therefore refuses the quoted spelling
  and leaves 0045's two shapes exactly as measured, without touching
  `parseObject`'s tolerant recovery. The run measures both and states which it
  took; whichever it is, 0154 shares the site (§Coordination).
- **A2 — the code is a new registry row, and its placeholder question is not the
  one 0161 asked.** `theta/parse/empty-schema-body`'s message asserts
  `'<X>' has no fields` over a body that spells one, and `<X>`'s inline arm is
  bound to the literal `{}` by 0045's carve-out
  (`placeholder-rendering-b.md:55`), so it cannot name this subject.
  `theta/parse/duplicate-inline-field-name`'s message names a repeat this
  spelling does not carry. A new row needs a subject placeholder, and the 0.93.0
  landscape changed the options: `<field>`'s verbatim rendering is a ROW-SCOPED
  carve-out on the duplicate row alone (`:10`), so a second row cannot inherit it
  without its own carve-out; `<key>` (`:11`, `:129`) double-quotes a
  non-identifier-shaped key by a runtime `^[A-Za-z_][A-Za-z0-9_]*$` test, which
  renders this subject `""a""`. The 0159 fix rejected `<key>` explicitly, but for
  the DUPLICATE row and on legibility grounds ("less legible than the source text
  it names"), so that rejection does not decide this row. The three admissible
  dispositions are: `<key>` with its doubled quoting, a second row-scoped
  `<field>` carve-out on the precedent of `:10` and `:55`, or a new placeholder.
  The run states which and why, and holds DIAG-4 by moving no existing *Message*.
- **A3 — the emission set must be stated before it is implemented, and it
  touches 0160.** The spellings measured admitted here — `{"a": string}`,
  `{'a': string}`, `{"": string}`, `{"a-b": string}`, `{"a" : string}` — sit on
  one code path with `{a as "w": integer}`, whose raw key `aas"w"` is equally
  non-identifier-shaped (§Reproduction (h) row h5). A refusal keyed on the key's
  SHAPE therefore refuses the rename spelling too, which is
  [0160](./0160-inline-object-wire-name-rename-unparsed.md)'s subject and its
  adjudication to make. Three admissible answers: refuse only a key whose first
  character is a quote (leaving 0160 untouched), refuse every non-identifier
  key (which pre-empts 0160 and must be agreed with it), or key the *Trigger* on
  the token at the field-name position rather than the lowered key (site (i),
  which never sees the rename because the identifier ahead of it is consumed
  first). The run picks one, states the measured consequence for h5, and does not
  leave it to be discovered. Multiplicity and ordering follow 0052's settled
  convention: one line per offending position, in source order, a body's own
  before those of bodies nested in its field types.
- **A4 — the *Trigger* consequences, re-read at 0.93.0.**
  `code-registry-parse.md:89`'s rewritten *Trigger* now names `"a"`, `'a'` and
  `a as "w"` as keys "they are written as" and states the split, the colon and
  the trim. Refusing those keys removes them from the row's reachable set, so the
  illustrative clause moves in the same commit, and the row-scoped `<field>`
  carve-out at `placeholder-rendering-b.md:10` — whose stated renderings are
  exactly `"a"`, `'a'`, `a as "w"` and `""` — must be re-examined for renderings
  the refusal makes unreachable. `docs/reference/grammar.md:203–208` and
  `docs/reference/diagnostics.md:138` move in lock-step, and
  `docs/spec_topics/grammar.md:109` gains the sentence naming the new code in the
  idiom of its two neighbours. All of it is DIAG-2 landing in one commit
  (`diagnostic-shape.md:72`).
- **A5 — the declaration position does not move.** All six rows of
  §Reproduction (b), five of which are cell G1 of the landed witness, are
  asserted byte-identical after the fix. `checkObjectSchema`
  (`schema-declarations.ts:87`) and `emptySchemaBodyDiagnostic` (`:63`) are not
  edited; 0133 owns that path.
- **A6 — cell G2 is re-pinned deliberately.**
  `tests/inline-object-field-name-comparison-key.test.ts:919–942` inverts from
  silence-plus-bytes to a refusal; its own comment authorises the re-pin ("the
  report that closes it reds exactly here"). Group (B)'s admitted rows — in
  particular `{a: integer, "a": string}` and `{"a": string, 'a': integer}`,
  admitted today as two distinct keys — flip with it if A3's answer is the broad
  one, and group (C)'s false-positive fence (`{: x, : y}`, `{ a }`, `{ a: }`)
  must stay green. Cell d5 of `tests/inline-object-duplicate-field-name.test.ts`
  (`:811`) is already a refusal and must not gain a second line.
- **A7 — GOV-15.** A code addition, in-scope for inputs that did not previously
  emit it (`source-language-stability.md:25`). Every newly-refused input loads
  cleanly today (`:9`) and leaves that set, so the fix ENUMERATES the newly
  refused spellings rather than leaving them to be discovered, and re-runs the
  census (§Reproduction (j)) at the fix HEAD.

### Route B — admit the quoted text as a wire name

The alternative reading: the quoted text at a field-name position is a WIRE name,
normalised at parse into the theta-side/wire-side split `schemas.md:23` already
defines, so `{"a": string}` behaves as `{a as "a": string}` and lowers
`properties.a`. It is recorded because it is the only route that keeps these
sources loading, and it carries two constraints that make it the harder direction.

- **B1 — it enters 0160's space by construction.** The rename clause is NOT
  parsed inside an inline body today: no inline field record carries a
  `wireName`, `theta/parse/wire-name-collision` and
  `theta/parse/redundant-wire-name` cannot fire there, and the whole pre-colon
  text becomes the property name (0160 §Reproduction (a) rows G1/G2/G4 and (c)
  rows L1–L6, unchanged at 0.93.0 by its coordination note). Route B needs
  exactly the machinery 0160 is open about, and a normalised `{"a": string}`
  would collide with a sibling `a: integer` under the rule 0160 owns. This route
  therefore cannot land before 0160's adjudication, and 0160's fix would decide
  most of it. **Stated as the boundary hazard it is:** enumerating this route
  does not claim 0160's subject; it records that route B is unavailable to this
  report alone.
- **B2 — it is not inside the diagnostic-registry carve-out.** Every source in
  §Reproduction (a) loads cleanly at HEAD and would keep loading with DIFFERENT
  lowered bytes: `properties['"a"']` becomes `properties.a`, the `$defs` slug
  changes with it, and the payload AJV accepts changes from `{"\"a\"": …}` to
  `{"a": …}`. That is a change to GOV-15 observable (a) — and to (c) wherever a
  validation message quotes the key — for inputs already in the promise's input
  set (`source-language-stability.md:9`), which the diagnostic-registry carve-out
  (`:25`) does not cover: that carve-out reaches the appearance or disappearance
  of a code's emission, not the artefact a cleanly-loading input mints. Under the
  corpus's own rule this is deferred to theta 2.0 unless the run can argue the
  input set is empty in practice (§Reproduction (j) measures it empty in-repo,
  which is evidence and not the rule).
- **B3 — the normalisation is not total.** `{"": string}` has no admissible
  theta-side name, and `{"a-b": string}` normalises to a wire name whose
  theta-side identifier cannot be derived (`a-b` is not an identifier), so route B
  still needs a refusal for the residue — i.e. it does not remove route A's
  decision, it shrinks it. The run states the refused residue explicitly.

### Common obligations

- **The 0059 guard and the one-diagnostic-per-field precedence bind any
  `params:`-position emission.** `src/parser/params.ts:349` keeps a field whose
  TYPE half is junk to its own diagnostic alone, and `:402–404` keeps the
  default-side checks to one; the registered statement is the third precedence
  rule of `code-registry-load.md:19`. A new refusal at the `params:` position
  belongs behind both, and the fix asserts the count rather than reasoning about
  it.
- **Immovables, measured here and asserted after.** §Reproduction (b) rows
  b1–b6; §Reproduction (g) rows c1–c5 (the settled duplicate key, including c5's
  admission of two quote styles); §Reproduction (h) rows h1–h4 unless the route
  states otherwise with a measurement; the generic-argument carve-out; the
  `{: x, : y}` fence (cell C1 of the landed witness); the whitespace-collapsing
  type-source capture (cells H1/H2), which no route may change.
- **Witness.** A new test file, offline and provider-free, with the
  registry-sourced *Message* oracle (DIAG-4) and whole-list `toEqual` on the
  unfiltered diagnostic list in every emission cell. It covers the eleven
  positions of §Reproduction (a), the declaration controls of (b), the lowering
  read-backs of (c), the AJV rows of (d) driven through the real
  `AjvSchemaValidator`, at least row r1 of (e) through the real respond-repair
  loop with a scripted drive, the quote-style rows of (f), the closed duplicate
  rows of (g) and the boundary rows of (h). Red before, with the red set derived
  before it is measured, and the red direction proven by neutralisation for any
  cell that cannot red by removal alone.
- **Byte pins.** At this HEAD `src/parser/type-grammar.ts` is **923** lines,
  `src/parser/params.ts` **1253**, `src/parser/body-type-lowering.ts` **763**,
  `src/parser/schema-declarations.ts` **819**,
  `src/runtime/typed-query-validation.ts` **349**,
  `src/runtime/query-respond-repair.ts` **304**,
  `src/seams/schema-validator.ts` **168**, and
  `tests/inline-object-field-name-comparison-key.test.ts` **1029**. A fix that
  moves any of them states the new count so the citing reports can be re-derived.
- **Live.** The path is parse-and-lower plus two in-process runtime seams, with
  no provider turn. If a code is added,
  `tests/fixtures/h7a/permitted-codes.json` is decided by a real H9a run plus a
  sweep of every live fixture and embedded theta source, on the 0045/0052/0159
  precedent — not assumed.

### Coordination

- **0160 is open and shares one route's key.** A refusal keyed on the lowered
  key's shape refuses `a as "w"` with the quoted key (§Fix A3); route B needs
  0160's wire-name machinery outright (§Fix B1). Whichever report lands first
  states the chosen key and the other rebases onto it; neither may rewrite
  `code-registry-parse.md:89`'s *Trigger* or the `<field>` carve-out at
  `placeholder-rendering-b.md:10` without recording the other's disposition, as
  0160's coordination note already does for 0159.
- **0154 shares the slot.** Route A site (i) is one branch away from where
  0154's case and reserved-keyword rules must read, and 0154 rebases onto the
  `fieldNames` retention the 0159 fix kept for it. Whichever lands first owns the
  site; the second adds a rule at it and does not add a second scan.
- **0133 owns the declaration recovery.** No route touches
  `parseSchemaObjectBody` or `skipBraceRemainder`.

## Non-goals

- **The duplicate spelling.** `{"a": string, "a": integer}` is refused at 0.93.0
  (§Reproduction (g)). The comparison key, its *Trigger* and the `<field>`
  carve-out are [0159](./0159-inline-field-name-stop-masks-duplicate.md)'s and
  are cited here, not re-opened.
- **The `as "WireName"` rename's semantics inside an inline body.** Unparsed
  clause, no `wireName` on any inline field record, the whole pre-colon text as
  the property name:
  [0160](./0160-inline-object-wire-name-rename-unparsed.md)'s subject. This
  report claims the field-name position that holds NO identifier; §Fix A3 states
  where the two routes touch.
- **The identifier RULES at this slot.** The lowercase-first and reserved-keyword
  rules are
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md)'s, over text
  that IS an identifier.
- **`{ a }` and `{ a: }`.** 0045's reserved shapes, measured silent and minting
  no property (§Reproduction (h)). A route that refuses them must say so and
  measure it; this report does not claim them.
- **The generic-argument interior.** `array<{"a": string}>` lowers
  `{"type":"array","items":{}}` — the interior is never divided into fields, so
  no quoted key is minted there. 0052's settled reading, unchanged.
- **The declaration position's own message.** `'S' has no fields` over a body
  that declares one is [0133](./0133-field-list-discard-recovery-unsettled.md)'s
  subject; §Reproduction (b) is a control group here.
- **The absence of a field-existence check on query results.**
  §Reproduction (i) row t3 shows `r.zzz` is silent against a plain
  `{a: string}` annotation, so no such check exists for any name at that
  position. This report measures the consequence of the minted key, not the
  missing check.
- **The type-source capture's whitespace collapse.** Seven of the eight positions
  rebuild the type text by joining lexer tokens with no separator (0159 fix
  report, residual 2; 0160's coordination note). It does not move this subject's
  key, which carries no inner whitespace, and no route here may change it.
- **The unquoted `params:` flow-mapping spelling.** It resolves one layer
  earlier as `theta/load/missing-mode` with the frontmatter discarded (0052's
  cell a11, adjacent
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md)); §Reproduction
  row q7 uses a quoted YAML scalar for that reason.
- **AJV's behaviour.** The seam compiles a valid document and enforces it. No
  route adds a `catch` at any AJV seam; route A removes the outcome by refusing
  the input.

## Provenance

Filed as the re-filing bug 0161 §Fix **B2** required and the bug 0159 fix run
recorded as owed. Two records name it:

- `.pi/tmp/fixes/0159-report.md` *Residuals* item 1 — "**The quoted-key SINGLE-field
  admission — 0161 §Fix B2's explicitly-open half. THE PARENT OWES A FILING.**
  `{"a": string}` still loads at every `Type` position and still lowers
  `properties['"a"']` — a JSON Schema property name carrying quote characters no
  theta identifier can address. Route B closes the duplicate and not this … **This
  run created no bug document, per its charter.**" It names the evidence bundle:
  0161 §Reproduction (c) row v6 and (d) rows L1–L7, "re-measured and pinned green
  as cell **G2** of `tests/inline-object-field-name-comparison-key.test.ts` (both
  the silence and the lowered bytes)".
- 0161's own `## Fix (0.93.0)` *Residual* item, which repeats the shape and
  states the closure terms this report continues: "this report closes on the
  duplicate and the quoted-key question is re-filed rather than left implicit"
  (§Fix B2).

**Taken from those records:** the subject spelling, the fact that route B does
not reach it, and cell G2 as the pin.

**Measured here at HEAD `e54338a7`, not copied:** the eleven-position load table
(§Reproduction (a)) and the declaration controls (b); every lowered fragment in
(c), read back through `lowerQueryResponseSchema`, the parsed document's own
`params:` `loweredSchema`, and the body-type map, including the shared
`__inline_ab25cb236d1e93a1` entry and the union and alias shapes; every AJV row
in (d) through a real `AjvSchemaValidator`, with the two error objects quoted
from the seam's own output; the whole end-to-end drive in (e) through the real
`buildTypedQueryValidation` and `runRespondRepairLoop` with a scripted follow-up,
including the follow-up prompt's first line and both terminal outcomes; the
quote-style and empty-key rows of (f) with their AJV verdicts and `$defs` slugs;
the closed duplicate rows of (g); the boundary rows of (h); the theta-side
accessibility rows of (i) including the control that shows no such check exists;
and the corpus census and PCRE2 sweep of (j). Five scratch vitest probes were
written, run and deleted; `ls tests | grep -i scratch` is empty afterwards and no
file remains.

Three corrections to the source records and to the sibling docs' framing,
verified:

1. **The corpus spells no `Field` production.** 0161 measured this at 0.84.0 and
   it holds at HEAD: `rg 'Field\s*::=' docs/` matches only `ToolField`
   (`grammar.md:66`, `docs/reference/grammar.md:554`,
   `docs/rfcs/0002-computed-tool-arguments.md:73`) and `WithField`
   (`docs/reference/grammar.md:253`). The enforceable statement of the inline
   field's form is `schemas.md:17` plus the rename clause at `:23`, not a spelled
   production, and this report words the claim that way.
2. **0161 §Reproduction (c) row v6 is confirmed and was under-specified.** It
   recorded that the root lowering of the single quoted field "compiles;
   validates `{"\"a\"": "s"}` and rejects `{"a": "s"}`". Confirmed at HEAD, with
   the rejection's content
   recorded here for the first time: TWO errors, `must have required property '"a"'`
   and `must NOT have additional properties` naming `a`. The runtime consequence
   of that verdict — the exhausted repair budget and the terminal
   `ValidationError` — is measured here and appears in neither record.
3. **0161 §Reproduction row q7's harness note is one spelling short.** The
   single-quoted YAML scalar carries the DOUBLE-quoted theta spelling; the
   single-quoted theta spelling needs the double-quoted YAML scalar, or the file
   draws `theta/load/missing-mode` (measured). §Reproduction (f) states both.

Every `src/`, `tests/`, spec, reference and bug-doc citation above was verified
against the tree at HEAD `e54338a7` by `rg` or `Read`; symbols are named beside
line numbers per [0134](./0134-params-shift-induced-stale-citations.md), because
the commit this report is filed from grew `src/parser/type-grammar.ts` from 835
to 923 lines and the registry row moved from `:87` to `:89`.
