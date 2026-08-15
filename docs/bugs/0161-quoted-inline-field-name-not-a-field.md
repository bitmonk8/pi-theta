# Bug 0161 — `grammar.md:101` spells `ObjectType ::= "{" Field ("," Field)* ","? "}"` with `Field` "per Schema Declarations" and `schemas.md:17` fixes a field name as an identifier, so the declaration spelling refuses `schema S { "a": string }` with `theta/parse/empty-schema-body`, while the inline spelling of the same text loads at eleven measured positions with zero diagnostics: `{"a": string, "a": integer}` contributes no name to `theta/parse/duplicate-inline-field-name`'s comparison and lowers ONE JSON Schema property whose key is the three-character source text `"a"` — quote characters included — beside `required: ["\"a\"","\"a\""]`, which the hoisting positions compile and enforce against provider payloads and which the `@<T>` annotation root hands `ajv.compile` as `schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)`

- **Status:** fixed (0.93.0), on this report's own §Fix **route B** terms — the
  duplicate closes and the quoted-key question is re-filed rather than left
  implicit (§Fix B2). Residual 3 of the bug 0052 fix (0.84.0, commit
  `f856fd33`), recorded in that fix's `## Fix (0.84.0)` *Residuals* item 3 —
  "*A quoted field name is not a `Field`.* `` {"a": string, "a": integer} `` is
  silent and lowers one property keyed `"a"` beside a two-item `required` — the
  defect's own shape at a position the row excludes" — and pinned as cell d5 of
  the witness that fix shipped
  (`tests/inline-object-duplicate-field-name.test.ts:802–837`). §Fix is
  constraint-pinned, not settled: the two admissible routes are enumerated with
  their measured consequences and the disposition is left to the run, because
  the question is which production the inline field-name slot answers to, and
  that is a DIAG-2 adjudication before it is code. Ordering: nothing blocks this
  report from starting. It shares one route and one registry row with **0159**
  and **0160**, filed in the same batch against the same HEAD; the three
  adjudications must agree, and whichever lands first fixes the *Trigger*
  wording the other two inherit (§Fix, *Coordination*).
- **Sev/Diff estimate:** S1/D3 — S1 because a spelling the spec refuses at the
  declaration position loads with no diagnostic at eleven inline positions and
  mints a JSON Schema property name carrying literal quote characters plus a
  duplicate `required` entry on the ordinary load path, where AJV either
  enforces the malformed key against a provider payload (the hoisting
  positions, measured) or refuses the compiled document outright after the query
  turn is spent (the `@<T>` root, measured); D3 because closing it needs a
  DIAG-2 decision on whether the inline field-name slot admits a non-identifier
  at all, its spec edits land in the same commit across the registry and two
  mirrors, the one candidate placeholder (`<field>`) is fixed as
  identifier-shaped by `placeholder-rendering-b.md:10` and the subject text is
  not, and the fix re-pins cell d5 of the 49-cell witness bug 0052 shipped in
  the commit this report is filed from, while coordinating one route with two
  concurrently-filed reports.
- **Kind:** spec gap — a production the corpus defers to but never spells at
  this position — plus the implementation half that follows from it. Three
  elements, all measured at HEAD.
  1. **The grammar refers the inline field to a form the declaration position
     enforces and the inline position does not.**
     `docs/spec_topics/grammar.md:101` spells
     `ObjectType ::= "{" Field ("," Field)* ","? "}"` with the trailing comment
     "*inline anonymous object type; `Field` per Schema Declarations*", and
     `:109` repeats it in prose: an `ObjectType`'s fields "reuse the same
     `Field` form as an object-schema body and carry the same field semantics".
     The referent is `SchemaShape`'s object form at `:172`, whose `Field` has no
     production of its own anywhere in `docs/` — `rg 'Field\s*::='` over
     `docs/spec_topics/` matches only `ToolField` (`grammar.md:66`). The
     enforceable statement of it is
     `docs/spec_topics/schemas.md:17`: "Field names are identifiers." A quoted
     string is not an identifier, and the only production that admits a quoted
     string next to a field name is the `as "WireName"` rename (`schemas.md:23`),
     which is a distinct clause written after the identifier. There is no
     production under which `{"a": string}` is a `Field`.
  2. **The two positions disagree over identical text.**
     `schema S { "a": string }` draws
     `error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated.`
     — the row's declaration clause for "a body whose first token is not a plain
     `ident: Type` field list"
     (`docs/spec_topics/diagnostics/code-registry-parse.md:86`). The inline
     spelling of the same two tokens reports `[]` at every `Type` position
     probed (§Reproduction (a)), including every one of them that lowers.
  3. **The silence has a wire consequence, and it is not a diagnostic.** The
     two lowerers key a property on the raw pre-colon text between the commas,
     so the quotes enter the JSON Schema key: `{"a": string, "a": integer}`
     lowers `{"type":"object","properties":{"\"a\"":{"type":"integer"}},"required":["\"a\"","\"a\""],"additionalProperties":false}`
     at every position that lowers. That fragment is the schema handed to
     providers (`schemas.md:36`) and the contract the runtime validates against
     (`:37`). At the hoisting positions a real `AjvSchemaValidator` compiles
     it with no throw and no diagnostic and then requires the payload to carry a
     property spelled `"a"` with its quotes, rejecting `{"a": 1}` as an
     additional property; at the `@<T>` annotation root the same fragment is the
     compiled document's root, where AJV's meta-schema validation applies, and
     `ajv.compile` throws
     `schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)`
     — bug 0052's A2 outcome, reproduced at this spelling (§Reproduction (c)).
- **Related:**
  - **0052** —
    [`0052-inline-object-duplicate-field-names-silent-last-wins.md`](./0052-inline-object-duplicate-field-names-silent-last-wins.md),
    **fixed (0.84.0)**, the filing origin. Its fix refuses a repeated field name
    inside an inline object body at parse; its registered *Trigger*
    (`code-registry-parse.md:87`) states the comparison key as "the field-name
    positions the interior spells as `Ident ":"`" and excludes this spelling
    twice over — "a field-name position holding anything other than an
    identifier contributes no name", and "the interior stops at an identifier it
    does not follow with a `:`". This report claims the shape that exclusion
    leaves alive, and nothing else about that row: the plain-name defect 0052
    owned is closed and stays closed (§Reproduction (e) row c1). 0052's own
    §Fix constraint 4 names the closing route this report inherits (§Fix,
    route B).
  - **0159** —
    [`0159-inline-field-name-stop-masks-duplicate.md`](./0159-inline-field-name-stop-masks-duplicate.md),
    filed in the same batch from the same fix's *Residuals* item 1. It owns the
    **stop cascade**: a field-name position the interior cannot read as
    `Ident ":"` ends the comparison for its own body and for every body
    enclosing it, masking later plain-name repeats. The mixed spelling
    `{"a": string, a: integer, a: boolean}` is that report's, not this one's —
    measured silent here, lowering `required: ["\"a\"","a","a"]`, and pinned by
    0052 as cell k2
    (`tests/inline-object-duplicate-field-name.test.ts:1306–1326`). The boundary
    is: 0159 owns what a stop does to names behind it; this report owns whether
    a quoted field-name position is a `Field` at all. 0159 states the same split
    from its side. They meet at one route — re-keying the comparison onto the
    lowerers' own `splitTopLevel`/`topLevelColon` tokenisation, which closes
    both shapes with one change (§Fix, route B) — so neither may re-key without
    the other's disposition, and the three *Trigger* rewrites must be one
    rewrite.
  - **0160** —
    [`0160-inline-object-wire-name-rename-unparsed.md`](./0160-inline-object-wire-name-rename-unparsed.md),
    filed in the same batch from that fix's *Residuals* item 2, the
    `as "WireName"` rename spelling (`{a as "w": integer, a as "w": string}`,
    cell d4). Its subject and this one's are the two non-identifier spellings
    the same comparison key excludes: 0160's field-name position holds an
    identifier whose `as` clause is unparsed, this one's holds no identifier at
    all. Route B closes both; route A closes only this one.
  - **0045** —
    [`0045-inline-empty-object-type-missing-empty-schema-body.md`](./0045-inline-empty-object-type-missing-empty-schema-body.md),
    **fixed (0.57.0)**, the reservation this report answers. Its §Non-goals
    (`:766–772`) names this exact spelling: "**Malformed but non-empty
    interiors.** `{ a }`, `{ "a": string }` and `{ a: }` drop their field
    through `parseObject`'s tolerant recovery and stay silent at the inline
    positions … Widening the inline rule to these shapes needs its own spec
    decision." This report is that decision for the quoted spelling, and only
    for it. 0045 also fixes the one placeholder constraint route A must work
    around: its carve-out binds `theta/parse/empty-schema-body`'s `<X>` to the
    literal text `{}` for the inline arm (`placeholder-rendering-b.md:55`).
  - **0154** —
    [`0154-inline-object-type-field-name-rules-unenforced.md`](./0154-inline-object-type-field-name-rules-unenforced.md),
    **open**, the same slot and a disjoint question. 0154 owns the identifier
    RULES at the inline field-name position — the lowercase-first rule
    (`lexical.md:16`) and the reserved-keyword rule (`:20`), both unenforced
    there. Its subject text is an identifier that breaks a rule; this report's
    is a token that is not an identifier, so `parseObject` never records it and
    no identifier rule can reach it. The two rebase onto the same retention:
    0154's §Status already records the `fieldNames` shape 0052 built. Whichever
    lands first decides where a non-identifier field-name position is detected,
    and the other reuses that site rather than adding a second.
  - **0133** —
    [`0133-field-list-discard-recovery-unsettled.md`](./0133-field-list-discard-recovery-unsettled.md),
    **open**, the recovery space this report must not enter. 0133 owns
    `parseSchemaObjectBody` / `skipBraceRemainder`
    (`src/parser/theta-document.ts`) — the DECLARATION-side recovery that
    produces the `empty-schema-body` line §Reproduction (b) measures, and whose
    subject is that the line's `'S' has no fields` message is false of bodies
    that declare fields. A fix here must not change that emission: the
    declaration rows of §Reproduction (b) are this report's control group, and
    0133 may move them later.
  - **0039** —
    [`0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md`](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md),
    **fixed (0.49.0)**, the origin of the shared hoist. Its §Fix part B factored
    `hoistInlineObjectType` out so one arm serves the hoisting positions, which
    is why the quoted key appears byte-identically at all four of them
    (§Reproduction (d)) rather than at one.
- **Affected** (every citation verified at HEAD `f856fd33`; symbols are named
  beside lines because `src/parser/type-grammar.ts` moved 567 → 835 lines in the
  commit this report is filed from, so every line number into it is one minor
  old):
  - **The field loop that drops the token.** `TypeParser.parseObject`
    (`src/parser/type-grammar.ts:504`), loop at `:524–565`. At `:528–534` the
    token standing at a field-name position is read and, when its `kind` is not
    `"ident"`, consumed and skipped with no record: `this.next(); continue;`.
    `tokeniseType` (`:263`) gives a quoted run `kind: "str"` (`:277–294`), so
    both the `"a"` and the `:` behind it are consumed one token at a time and
    neither `fieldNames` (`:545`) nor `fieldTypes` gains an entry. The push at
    `:545` is the sole writer of the list the rule compares.
  - **The stop the skipped field's type then trips.** `string` tokenises as
    `kind: "ident"` (`:305–312`; `PRIMITIVE_TYPES` at `:320` is a downstream
    classification, not a token kind), so after the quoted name and its colon
    are skipped, the quoted field's TYPE stands at the field-name position,
    `eatPunct(":")` fails against the following `,`, and the loop breaks at
    `:535–538`. `fieldNames` is therefore EMPTY for
    `{"a": string, "a": integer}` — not merely short by the quoted entries.
  - **The rule that finds nothing to compare.** `walkType`'s `object` arm
    (`:695`); the two gates at `:725` (`!insideGenericArgument &&
    node.closingBraceSpelled`, both satisfied here); the emission at `:737–743`.
    The `for (const name of node.fieldNames)` at `:728` iterates an empty list,
    so no line is produced. `closingBraceSpelled` is true for this source — the
    silence is the empty name list alone, not the brace gate.
  - **The two lowerers, which key on raw pre-colon text and so keep the
    quotes.** Neither reads `fieldNames`; both re-tokenise the source.
    - `hoistInlineObjectType` (`src/parser/params.ts:670`) — the shared hoist
      for the `params:` field, the `schema` body field, the alias right-hand
      side and the nested cases. `splitTopLevel(source.slice(1, -1), ",",
      "angle-and-brace")` at `:677`, `topLevelColon(entry)` at `:678`,
      `entry.slice(0, colon).trim()` at `:682`, `properties[fieldName] = …` at
      `:687`, `required.push(fieldName)` at `:688`.
    - `lowerInlineObject` (`src/parser/body-type-lowering.ts:154`) — the
      annotation root's lowerer. Same split at `:161`, same colon at `:162`,
      `entry.slice(0, colon).trim()` at `:166`, returning through
      `lowerObjectFields` (`:109`), whose writes are `:120` and `:128`.
    - Both splitters are quote-aware, which is what carries the quotes intact
      into the key instead of perturbing the split: `{"a:b": string, c: integer}`
      lowers two properties, one keyed `"a:b"` (§Reproduction (f) row f1).
  - **The compile seam that accepts one and refuses the other.**
    `AjvSchemaValidator` (`src/seams/schema-validator.ts`): the instance at
    `:112` (`new Ajv({ strict: false, allErrors: true, logger: false })` —
    `strict: false` does not disable meta-schema validation), `#build` at `:148`
    and `this.#ajv.compile(schema)` at `:149`. Meta-schema validation applies to
    the compiled ROOT, which is why the annotation root throws and a `$defs`
    member carrying the same duplicate `required` compiles (§Reproduction (c)).
  - **The declaration path, untouched and the contrast.** `checkObjectSchema`
    (`src/parser/schema-declarations.ts:87`) is never reached for a quoted-key
    body; the declaration's refusal comes from `parseSchemaObjectBody`'s
    recovery through `emptySchemaBodyDiagnostic` (`:63`), 0133's subject.
  - **The registered rows.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:87` —
    `theta/parse/duplicate-inline-field-name`, whose *Trigger* states both
    exclusions quoted above and whose *Message* is
    `duplicate field name '<field>' within one inline object type`. `:86` —
    `theta/parse/empty-schema-body`, whose inline clause is "An empty inline
    object type (`{}`) in any `Type` position" and whose declaration clause
    covers a body "whose first token is not a plain `ident: Type` field list".
  - **The placeholder constraints on any message this fix renders.**
    `docs/spec_topics/diagnostics/placeholder-rendering-b.md:10` — `<field>`
    is identifier-shaped and rendered unquoted. `:11` — `<key>` is the
    category-5 placeholder that double-quotes a key "when the key string is
    *not* identifier-shaped", by a runtime check on the string. `:55` — `<X>`
    renders `{}` on `empty-schema-body`'s empty-inline-object trigger and
    identifier form everywhere else.
  - **The mirrors that move in lock-step with any registry edit.**
    `docs/reference/grammar.md:203–208` (the `ObjectType` bullet naming both
    codes) and `docs/reference/diagnostics.md:136` (the
    `duplicate-inline-field-name` row; the reference table carries no *Trigger*
    column).
  - **The landed witness this fix re-pins.**
    `tests/inline-object-duplicate-field-name.test.ts:802–837` — cell d5,
    which asserts BOTH the silence and the lowered bytes, and whose comment
    states the re-pin condition in advance: "a fix widening the key to the raw
    source text between the commas reds by naming the shape it over-reached
    into". `:1306–1326` — cell k2, 0159's subject, adjacent and not this
    report's to move.
- **Observed at:** `0.84.0` (HEAD `f856fd33`). Offline, deterministic,
  provider-free; every row below re-derived for this filing through `parseDoc`
  (`tests/helpers/e2e-s1.ts`), the three lowerers and a real `AjvSchemaValidator`
  in scratch vitest probes, then deleted. No live run is needed: the code path is
  parse-and-lower, and the AJV rows drive the production seam directly.

## Summary

`ObjectType` defers its field form to the object-schema `Field`, and
`schemas.md:17` fixes a field name there as an identifier. The declaration
position enforces that: `schema S { "a": string }` is refused. The inline
position does not enforce it and does not refuse it — `TypeParser.parseObject`
consumes a non-identifier token at a field-name position and continues with no
record, so the quoted name reaches neither `fieldNames` nor `fieldTypes`, and
the quoted field's own type then stands at the next field-name position and
breaks the loop. `theta/parse/duplicate-inline-field-name` compares an empty
list and emits nothing.

The lowerers do not consult that list. They re-split the source on top-level
commas and take the text before the top-level colon as the property name, so
`{"a": string, "a": integer}` becomes one JSON Schema property keyed with the
three characters `"a"` — the quotes are part of the key — beside
`required: ["\"a\"","\"a\""]`. That is bug 0052's own defect shape: one
last-wins property and a duplicate `required`, arrived at through the spelling
its registered *Trigger* excludes. The fragment is the provider-facing schema.
At the hoisting positions AJV compiles it and enforces the malformed key
against payloads; at the `@<T>` annotation root it is the compiled root, where
the duplicate `required` fails meta-schema validation and `ajv.compile` throws.

The question this report exists to settle is which production the inline
field-name slot answers to. If it is `Field`, the quoted spelling is refused at
parse and no fragment is minted; if the comparison is instead re-keyed onto the
lowerers' own tokenisation, the duplicate is named but a single quoted field
still mints a quoted property name. §Fix pins both routes and their measured
consequences.

## Reproduction

All rows measured at HEAD `f856fd33`. `parseDoc` renders each diagnostic
`<severity> <code>: <message>`; `[]` is a clean load. Every fixture carries
`mode: prompt` frontmatter and a `let a = 1` / `a` tail, so no
`theta/load/missing-mode` noise is present. `Q` abbreviates
`{"a": string, "a": integer}`.

### (a) The inline spelling is silent at every measured position

| row | position | source | reported |
|---|---|---|---|
| q1 | `@<T>` annotation root | ``let r = @<Q>`hi` `` | `[]` |
| q2 | `let` annotation | `let x: Q = 1` | `[]` |
| q3 | `fn` parameter | `fn f(p: Q) { 1 }` | `[]` |
| q4 | `fn` return | `fn f(): Q { 1 }` | `[]` |
| q5 | `schema` body field | `schema S { p: Q }` | `[]` |
| q6 | alias right-hand side | `schema S = Q` | `[]` |
| q7 | `params:` field | a `params:` block whose one entry is `p: 'Q'` | `[]` |
| q8 | `invoke<T>` annotation | `let r = invoke<Q>("./x.theta")` | `[]` |
| q9 | nested one level | `@<{p: Q}>` | `[]` |
| q10 | union arm | `@<Q \| null>` | `[]` |
| q11 | `.thetalib` | `fn f(p: Q) { 1 }` in a `.thetalib` | `[]` |

Row q7 uses the YAML single-quoted scalar so the interior double quotes reach
the theta type grammar; the double-quoted YAML spelling is a frontmatter
subject, not an inline-object one (§Non-goals).

### (b) The declaration spelling of the same text is refused

| row | source | reported |
|---|---|---|
| b1 | `schema S { "a": string }` | `error theta/parse/empty-schema-body: 'S' has no fields; an empty schema cannot be validated.` |
| b2 | `schema S { "a": string, "a": integer }` | same single line |
| b3 | `schema S { "a": string, b: integer }` | same single line |
| b4 | `schema S { a: string }` | `[]` |
| b5 | `schema S { a as "w": string }` | `[]` |

b4 and b5 bound b1–b3 to the quoted NAME: an identifier field and a rename
whose wire name is quoted both load. b1's line is 0133's subject as a *message*
(the body declares one field), and this report claims only that the declaration
position refuses the text while the inline position does not.

### (c) AJV, driven through the production seam

| row | fragment compiled | result |
|---|---|---|
| v1 | the `@<T>` root's own lowering of `Q` | `ajv.compile` THROWS `schema is invalid: data/required must NOT have duplicate items (items ## 1 and 0 are identical)`; zero diagnostics emitted |
| v2 | the `params:` document (the same bytes inside `$defs`) | compiles, no throw, zero diagnostics emitted |
| v3 | v2's validator against `{"p": {"\"a\"": 1}}` | `ok: true` |
| v4 | v2's validator against `{"p": {"a": 1}}` | `ok: false` — TWO identical `must have required property '"a"'` errors, plus `must NOT have additional properties` naming `a` |
| v5 | v2's validator against `{"p": {}}` | `ok: false` — the same two identical `required` errors |
| v6 | the root lowering of `{"a": string}` (single quoted field) | compiles; validates `{"\"a\"": "s"}` and rejects `{"a": "s"}` |

v1 is bug 0052's A2 outcome reproduced at this spelling; that fix's §Residuals
item 3 does not record it. v4's doubled error is the duplicate `required`
surfacing twice at payload validation. v6 isolates the quoted key from the
duplicate: one quoted field mints a quoted property name with no duplicate
anywhere.

### (d) The lowered bytes, at every position that lowers

The fragment is byte-identical at every position measured that lowers — the
`params:` field, the `schema` body field, the alias right-hand side, a nested
inline body and the annotation root — and its content-addressed name is one
slug:

```
{"type":"object","properties":{"\"a\"":{"type":"integer"}},"required":["\"a\"","\"a\""],"additionalProperties":false}
```

| row | seam driven | result |
|---|---|---|
| L1 | `lowerQueryResponseSchema(Q, [], [])` | the fragment above, AS the document root |
| L2 | the `params:` document's `loweredSchema` | `properties.p.$ref` = `#/$defs/__inline_39aad6cb9f3db7b9`, `$defs` carrying the fragment |
| L3 | `lowerParamsFieldType(Q, ctx)` | `{"$ref":"#/$defs/__inline_39aad6cb9f3db7b9"}`, same `ctx.defs` |
| L4 | `hoistInlineObjectType(Q, ctx, lowerParamsFieldType)` | the same `$ref` and the same `defs` |
| L5 | `buildBodyTypeSchemas([{name:"S",fields:[{name:"p",typeSource:Q}]}], [])` | `S.properties.p.$ref` to the same slug, `$defs` carrying the fragment |
| L6 | the same over an alias arm | `S.$ref` to the same slug |
| L7 | `@<{p: {q: Q}}>` | two `$defs` entries, the inner one the fragment above |

`__inline_39aad6cb9f3db7b9` is the canonical hash of the duplicate-carrying
fragment (`schema-subset.md:73`), so every position addresses one entry.

### (e) Controls that must not move

| row | source | reported | note |
|---|---|---|---|
| c1 | `@<{a: integer, a: string}>` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'a' within one inline object type` | 0052's fix, closed and staying closed |
| c2 | `@<{"a": string, "b": integer}>` | `[]`, lowering two properties `"a"` and `"b"` | distinct quoted names — two quoted keys, no duplicate |
| c3 | `@<{a: integer, "a": string}>` | `[]`, lowering `properties.a` AND `properties['"a"']`, `required: ["a","\"a\""]` | two DISTINCT keys, so no duplicate `required` is minted here |
| c4 | `@<{"a": string, "a": integer, "a": boolean}>` | `[]`, one property, `required` naming `"a"` three times | multiplicity, for whichever route emits |
| c5 | `@<{"a": string, a: integer, a: boolean}>` | `[]`, `required: ["\"a\"","a","a"]` | **0159's** row, not this report's — quoted here only to fix the boundary |

### (f) Boundary facts any route-B key inherits

| row | source | lowered property names |
|---|---|---|
| f1 | `{"a:b": string, c: integer}` | `"a:b"` and `c` — the split is colon-aware inside quotes |
| f2 | `{"a,b": string, c: integer}` | `"a,b"` and `c` — and comma-aware inside quotes |
| f3 | `{'a': string, "a": integer}` | `'a'` and `"a"` — TWO properties; raw text makes the two quote styles distinct spellings of one wire name |
| f4 | `{"": string, "": integer}` | one property keyed `""`, `required: ["\"\"","\"\""]` |
| f5 | `{"a" : string, "a" : integer}` | one property keyed `"a"` — the `.trim()` absorbs the padding |

f3 is the row that separates the two routes: keyed on raw text, `'a'` and
`"a"` do not collide, so route B admits a source that declares one wire name
twice under two quote styles.

### (g) Corpus exposure

`git ls-files '*.theta' '*.thetalib'` is **34** files. A PCRE2 sweep for a
quoted token followed by `:` at any field-name position over all 34 matches
**zero** lines. No committed source moves under either route, and
`tests/live/acceptance/fixtures/acc-typed-inline.theta` — the only committed
inline object type — spells `{ ok: boolean, label: string }`.

## Expected behaviour

`grammar.md:101` and `:109` put the inline field inside the object-schema
`Field` form, and `schemas.md:17` makes a field name there an identifier. The
inline position therefore owes one of two things, and today it delivers
neither:

1. **A refusal.** `{"a": string}` is not a `Field`, so the document does not
   load, at every `Type` position and every nesting depth reachable through
   inline object fields and union arms — the same reach
   `theta/parse/duplicate-inline-field-name` and
   `theta/parse/empty-schema-body` already have. The declaration position
   already refuses the same text (§Reproduction (b)), and the corpus states no
   reason for the two positions to differ.
2. **Failing that, no wire artefact.** No lowered fragment carries a JSON
   Schema property name containing quote characters the author did not write as
   a wire name, and no fragment carries a repeated `required` entry. Bug 0052
   §Expected states the second half in those terms; this report adds the first,
   because a property keyed `"a"` is unreachable from theta code — the binder
   and the model both see a name no theta identifier can address.

Whichever is delivered, `schema S { "a": string }` and `let x: {"a": string}`
answer alike. Two positions that the grammar makes one form disagreeing over
identical text is the defect, independently of which answer is chosen.

## Actual behaviour / root cause

Three facts compose, in the order the source meets them.

**1. The token is dropped, not recorded.** `TypeParser.parseObject`
(`type-grammar.ts:504`) reads the token at each field-name position at `:528`.
When its `kind` is not `"ident"` the token is consumed and the iteration
restarts (`:531–534`) — no name, no type, no diagnostic, no marker that a field
position was passed over. `tokeniseType` (`:263`) classifies a quoted run as
`kind: "str"` (`:277–294`), so `"a"` takes that branch, and the `:` behind it,
being `kind: "punct"`, takes it on the next iteration.

**2. The dropped field's TYPE then trips a stop.** After the name and colon are
skipped, `string` stands at the field-name position. It tokenises as
`kind: "ident"` (`:305–312`), so it is taken as a field-name candidate;
`eatPunct(":")` then fails against the following `,` and the loop breaks
(`:535–538`) — the *Trigger*'s "the interior stops at an identifier it does not
follow with a `:`". For `{"a": string, "a": integer}` this happens at the first
quoted field, so `fieldNames` is empty rather than short.

**3. The rule reads that list; the lowerers read the source.** `walkType`'s
`object` arm passes both of its gates for this source — `insideGenericArgument`
is false and `closingBraceSpelled` is true (`:725`) — and then iterates an
empty `node.fieldNames` (`:728`), emitting nothing. `hoistInlineObjectType`
(`params.ts:670`) and `lowerInlineObject` (`body-type-lowering.ts:154`) never
consult that list: each re-splits the interior on top-level commas
(`params.ts:677`, `body-type-lowering.ts:161`), finds the top-level colon
(`:678`, `:162`) and takes `entry.slice(0, colon).trim()` as the property name
(`:682`, `:166`). Both splitters skip quoted regions (§Reproduction (f) rows
f1–f2), so the quotes are neither consumed nor escaped — they are part of the
key that is written at `params.ts:687`/`:688` and
`body-type-lowering.ts:120`/`:128`.

The result is the divergence bug 0052 §Fix constraint 4 was written to prevent:
the parse-time comparison key and the lowering's own key disagree, and every
shape in the gap between them lowers unremarked. This report's shape is the
extreme case — the parse key is EMPTY where the lowering key produces two
identical entries.

The declaration position never reaches this code. Its body is read by
`parseSchemaObjectBody` (`theta-document.ts`, 0133's subject), whose recovery
discards the body and yields `emptySchemaBodyDiagnostic`
(`schema-declarations.ts:63`), so `checkObjectSchema` (`:87`) — the only
field-name well-formedness check in the parser — is not reached either. The two
positions refuse and admit for unrelated reasons; nothing today makes them
agree.

## Why it matters

- **A spelling the spec refuses loads at eleven positions.** §Reproduction (a)
  against §Reproduction (b): the same two tokens are an error in a `schema`
  body and clean in every inline position, including every one of them that
  lowers and the `.thetalib` surface. `grammar.md:101` says the two are one
  form.
- **The lowered property name is not addressable from theta.** The key is the
  three characters `"a"`. No theta identifier spells it, so the field cannot be
  read, constructed or matched. `schemas.md:34` states that a renamed field is
  "accessed, constructed, and pattern-matched as the theta identifier" and that
  "every other corner of the language sees only that identifier", so the `as`
  clause is the one production that puts a quoted name on the wire. The author
  gets a required property no theta code can address.
- **AJV enforces it against the model.** §Reproduction (c) rows v3–v5: at the
  hoisting positions the compiled validator demands a payload property spelled
  `"a"` with quotes and rejects the unquoted `a`, reporting the same missing
  property twice. The schema is the one handed to providers (`schemas.md:36`),
  so the malformed name is what the model is asked to produce.
- **At the annotation root the failure lands after the turn is spent.** Row v1
  reproduces bug 0052's A2 throw for this spelling: the fragment is the compiled
  document root, the duplicate `required` fails meta-schema validation, and
  `ajv.compile` throws at payload-validation time — an internal error, not a
  diagnostic, after the query has been answered.
- **The shipped *Trigger* documents the hole as a boundary.** `code-registry-parse.md:87`
  states the two exclusions that leave this shape alive, so the row is
  currently correct about a behaviour that contradicts `grammar.md:101`. A
  reader of the registry cannot tell that the excluded spelling still mints the
  artefact the row exists to prevent. Whatever route is taken, that sentence
  moves.
- **No committed source moves.** §Reproduction (g) measures
  zero occurrences across all 34 committed `.theta`/`.thetalib`. The GOV-15
  disposition is the addition arm of the diagnostic-registry carve-out
  (`source-language-stability.md:25`) over an input set that is presently
  empty in-repo.

## Non-goals

- **The stop cascade.** A field-name position the interior cannot read as
  `Ident ":"` ends the comparison for its own body and for every enclosing one,
  masking plain-name repeats behind it (`{"a": string, a: integer, a: boolean}`
  → `[]`, `required: ["\"a\"","a","a"]`; §Reproduction (e) row c5). That is
  **0159**'s subject. This report claims the quoted position's own disposition
  and states the shared route; it does not adjudicate what happens to names
  behind a stop.
- **The `as "WireName"` rename inside an inline body.** Still unparsed —
  `{a as "w": integer, a as "w": string}` lowers one property named
  `a as "w"` beside a duplicate `required` (0052 §Fix (0.84.0) *Residuals* item
  2, pinned as cell d4). That is
  [0160](./0160-inline-object-wire-name-rename-unparsed.md)'s subject. A quoted
  name with no `as`
  is a different production question: the rename's identifier IS present and the
  clause behind it is unread, whereas here no identifier is written at all.
  0052 §Non-goals reserves the rename; this report does not touch it.
- **The other malformed interiors 0045 reserved.** `{ a }` and `{ a: }` are in
  the same §Non-goals sentence as `{ "a": string }` and are not claimed here.
  A route-A fix that keys on "the field-name position holds a non-identifier
  token" must state whether those two move with it or stay, and measure the
  answer rather than assume it.
- **The declaration position's own message.** `'S' has no fields` over a body
  that declares one is 0133's subject. §Reproduction (b) is a control group
  here: a fix must leave those five rows byte-identical.
- **The permissive generic-argument interior.** `array<{a: integer, a: string}>`
  is silent by 0052's settled reading (its cell d3), because the lowering never
  divides a generic argument's interior into fields. The quoted spelling inside
  a generic argument is not claimed here either.
- **A duplicate YAML key in `params:`.** The unquoted flow-mapping spelling
  resolves one layer earlier as `theta/load/missing-mode` with the frontmatter
  discarded (0052's cell a11, adjacent
  [0041](./0041-params-block-mapping-rhs-silent-permissive.md)). §Reproduction
  row q7 uses the single-quoted YAML scalar for that reason.
- **AJV's root-only meta-schema validation.** The asymmetry between rows v1 and
  v2 is a property of the validator seam. Neither route adds a `catch` at any
  AJV seam; route A removes the outcome by refusing the input.

## Fix

Not settled. The two routes below are constraint-pinned; the run selects one
and records the evidence that settled it. They are not equivalent: route A
refuses the spelling and mints no fragment, route B admits the spelling and
names only the repeat. Both edit the same registered row's *Trigger*, so both
are DIAG-2 spec changes landing in the same commit
(`diagnostic-shape.md:72`).

### Route A — the inline field-name slot admits an identifier only

`{"a": string}` is refused at parse, at every `Type` position and every nesting
depth reachable through inline object fields and union arms, before the body is
lowered. The duplicate question then does not arise: no fragment is minted, so
neither the quoted key nor the duplicate `required` exists.

- **A1 — the detection site is the token already being dropped.**
  `TypeParser.parseObject`'s `else` branch (`type-grammar.ts:531–534`) is the
  one place that sees a non-identifier standing at a field-name position. The
  fix records it there — the shape `fieldNames` (`:545`) already establishes —
  rather than adding a second scan of the interior. What is recorded must be
  distinguishable from "nothing was there": the loop reaches `:531–534` for every
  token it cannot use, including a stray `,` or `}` inside a malformed
  interior, and a refusal keyed on "any non-identifier token" without a
  position test widens into 0045's reserved family (§Non-goals).
- **A2 — the code is a new registry row, not a widened existing one.** Both
  reuse candidates fail on their *Message*.
  `theta/parse/empty-schema-body`'s message asserts `'<X>' has no fields` over
  a body that spells one, and `<X>`'s inline arm is bound by 0045's carve-out
  to the literal text `{}` (`placeholder-rendering-b.md:55`), so it cannot name
  this subject. `theta/parse/duplicate-inline-field-name`'s message names a
  duplicate that route A never lets exist, and its `<field>` is
  identifier-shaped and rendered unquoted (`:10`) while the subject text is not
  an identifier. A new row's subject placeholder is `<key>` (`:11`), which
  double-quotes a non-identifier-shaped key by a runtime check on the string —
  the only category-5 placeholder whose rule already covers this text. The row
  needs no placeholder-table carve-out under that choice; if the run picks a
  different placeholder it must state which and why.
- **A3 — the emission set must be stated before it is implemented.** The three
  spellings measured silent here — `{"a": string}`, `{'a': string}` and
  `{"": string}` — and the two shapes 0045 reserved (`{ a }`, `{ a: }`) sit on
  one code path. §Non-goals leaves the latter two open, so the *Trigger* must
  distinguish them by a stated property of the token, not by which fixtures were
  probed. Multiplicity and ordering follow 0052's settled convention: one line
  per offending position, in source order, a body's own before those of bodies
  nested in its field types.
- **A4 — the shipped *Trigger* loses its first exclusion.**
  `code-registry-parse.md:87`'s "a field-name position holding anything other
  than an identifier contributes no name" stops being a boundary of silence and
  becomes a boundary between two codes. That sentence is rewritten in the same
  commit, with `docs/reference/grammar.md:203–208` and
  `docs/reference/diagnostics.md:136` in lock-step, and
  `docs/spec_topics/grammar.md:109` gains the sentence naming the new code in
  the idiom of its two neighbours.
- **A5 — the declaration position does not move.** §Reproduction (b) rows
  b1–b5 are asserted byte-identical after the fix. `checkObjectSchema`
  (`schema-declarations.ts:87`) and `emptySchemaBodyDiagnostic` (`:63`) are not
  edited; 0133 owns that path and may move those rows later.
- **A6 — cell d5 is re-pinned deliberately, and cell k2 moves with it.**
  `tests/inline-object-duplicate-field-name.test.ts:802–837` inverts from
  silence-plus-bytes to a refusal; its comment already authorises the re-pin.
  `:1306–1326` (k2) is 0159's cell and route A moves it too — the quoted name
  there is refused before the stop cascade is reached — so route A cannot land
  without 0159's disposition (*Coordination* below).
- **A7 — GOV-15.** A code addition, in-scope for inputs that did not previously
  emit it (`source-language-stability.md:25`). Every newly-refused input
  carries no `E` today, so all of them are in the loads-cleanly set (`:9`) and
  leave it. The corpus census (§Reproduction (g)) must be **re-run at the fix
  HEAD**, not copied: sibling fixes land files.

### Route B — re-key the comparison onto the lowerers' own tokenisation

Bug 0052 §Fix constraint 4's SECOND branch, named in that fix's *Residuals*
item 1 as the closing route for the whole family: the rule compares the raw
pre-colon text `splitTopLevel`/`topLevelColon` produce, which is by
construction the text the lowerers key on. `{"a": string, "a": integer}` then
draws a duplicate line because both entries yield `"a"`.

- **B1 — it closes three reports' shapes with one change and no recovery
  edit.** This report's rows, 0159's stop-cascade rows and 0052's *Residuals*
  item 2 rename rows all come inside the emission set, without touching
  `parseObject`'s tolerant recovery — which is the reason 0052 declined the
  broader fix, since a resync there moves
  `theta/parse/void-in-non-return-position`,
  `theta/parse/generic-arity-mismatch` and
  `theta/parse/result-in-schema-position` on unmeasured inputs.
- **B2 — it leaves the quoted-property-name half open, and must say so.** A
  SINGLE quoted field draws nothing under route B and still lowers
  `properties['"a"']` (§Reproduction (c) row v6). The property name containing
  quote characters is the element (3) defect; route B addresses only the
  duplicate. If route B is chosen, this report closes on the duplicate and the
  quoted-key question is re-filed rather than left implicit.
- **B3 — `<field>` cannot render the new subject.** The key becomes raw source
  text, so `<field>` — identifier-shaped, rendered unquoted
  (`placeholder-rendering-b.md:10`) — would render `"a"` with its quotes
  through a placeholder whose rule forbids that shape. Either the row's
  placeholder changes (a DIAG-4 *Message* reword, deferred to theta 2.0 by
  `:74`) or the rendered subject is normalised, or the placeholder table gains a
  carve-out in the same commit. The run states which; this is the constraint
  that makes route B a spec change and not a refactor.
- **B4 — two spellings of one wire name stay distinct.** §Reproduction (f) row f3:
  `{'a': string, "a": integer}` yields keys `'a'` and `"a"`, so route B admits
  a body declaring one wire name twice. Row f5 shows padding is absorbed by the
  existing `.trim()` and row f4 shows the empty-string key collides with
  itself. The *Trigger* states the key exactly — raw pre-colon text after
  `trim()`, no unquoting, no normalisation — or the row is not computable from
  its text.
- **B5 — the emission must not move on well-formed sources.** The plain-name
  rows 0052 shipped (its groups (a)–(c)) are keyed on `Ident ":"` positions
  today; under route B they are keyed on pre-colon text. Those two keys agree
  for every well-formed body, and the fix asserts that agreement over 0052's
  existing 49 cells rather than reasoning about it. Cells d4 row 1 and d5 flip
  from silence to refusal — 0052's *Residuals* item 1 predicts exactly this
  pair — and group (k)'s cells flip with them, which is 0159's disposition to
  state rather than this report's. No cell outside those two sets may move.
- **B6 — the *Trigger* rewrite is one rewrite.** The comparison key, the three
  stops and the exclusion list at `code-registry-parse.md:87` are all restated,
  because the key change removes the stops' reason for existing.

### Coordination

- **0159 and 0160 are filed in the same batch against this HEAD.** Route B is
  the route 0159 names (its own §Fix says it "closes 0160 and 0161 too, because
  it keys on raw pre-colon text"); it closes this report's shape as a side
  effect, and route A closes 0159's quoted-name rows as a side effect. Neither
  may land a *Trigger* rewrite alone: the first to reach implementation states
  the chosen key and the other two rebase onto it. If the three are worked
  separately, the ordering is 0159 → 0161 → 0160 by route breadth, and the
  second and third runs assert their own rows against the first's shipped
  *Trigger* text rather than re-deriving it.
- **0154 shares the slot.** Route A's detection site (`type-grammar.ts:531–534`)
  is one branch away from where 0154's case and reserved-keyword rules must
  read. Whichever lands first owns the site; the second adds a rule at it and
  does not add a second scan.
- **0133 owns the declaration recovery.** No route touches
  `parseSchemaObjectBody` or `skipBraceRemainder`.

### Common obligations

- **Witness.** A new test file, offline and provider-free, with the
  registry-sourced *Message* oracle (DIAG-4) and whole-list `toEqual` on the
  unfiltered diagnostic list in every emission cell. It covers all eleven
  positions of §Reproduction (a), the five declaration controls of (b), the six
  AJV rows of (c) driven through the real `AjvSchemaValidator`, the lowering
  read-backs of (d), the five controls of (e) and the five key-boundary rows of
  (f). Red before, with the red set derived before it is measured, and the
  red direction proven by neutralisation for any cell that cannot red by
  removal alone.
- **Byte pins.** `src/parser/type-grammar.ts` is at **835** lines and is cited
  by line in this report and in 0044, 0045, 0061, 0081, 0093, 0094, 0095, 0124,
  0129, 0130, 0133, 0149 and 0154; `src/parser/params.ts` is at **1006**,
  `src/parser/body-type-lowering.ts` at **726**,
  `src/parser/schema-declarations.ts` at **819**. A fix that moves any of them
  states the new count so the citing reports can be re-derived.
- **Live.** The path is parse-and-lower with no provider turn. If the chosen
  route adds a code, `tests/fixtures/h7a/permitted-codes.json` is decided by a
  real H9a run plus a sweep of every live fixture and embedded theta source, on
  the 0045/0052 precedent — not assumed.

## Provenance

Filed as residual 3 of the bug 0052 fix (0.84.0, commit `f856fd33`). That fix's
report (`.pi/tmp/fixes/0052-report.md` §Residuals item 3) records the shape in
one sentence — "*A quoted field name is not a `Field`.*
`` {"a": string, "a": integer} `` is silent and lowers one property keyed `"a"`
beside a two-item `required` — the defect's own shape at a position the row
excludes. Pinned as d5." — and the same disposition is in 0052's own
`## Fix (0.84.0)` record. The
report's "Where the bug document turned out to be wrong" item 4 adds that this
lowering is not carried by 0052's §Reproduction.

Independently re-derived at HEAD `f856fd33` for this filing, not copied from
0052's measurements: four scratch vitest probes over `parseDoc`
(`tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`,
`lowerParamsFieldType`, `hoistInlineObjectType`, `buildBodyTypeSchemas` and a
real `AjvSchemaValidator`, covering every row of §Reproduction (a)–(f), plus
the `git ls-files` census and PCRE2 sweep in (g). All probes were run and then
deleted. Every `src/`, `tests/` and spec citation above was verified against the
tree at HEAD by `rg` or `Read`; symbols are named beside line numbers because
the commit this report is filed from grew `src/parser/type-grammar.ts` from 567
to 835 lines.

Three facts this filing measured that the 0052 fix report does not record:
the `@<T>` annotation root reproduces the A2 meta-schema throw for the quoted
spelling (§Reproduction (c) row v1); the hoisting positions compile the same bytes
without a throw and then enforce the quoted key against a payload, reporting
the duplicate `required` twice (rows v2–v5); and the declaration spelling of
the same text draws `theta/parse/empty-schema-body`, quoted verbatim in
§Reproduction (b), which is the contrast element (2) rests on.

Sibling reports 0159 and 0160 were being filed concurrently against the same
HEAD. Both landed in `docs/bugs/` during this session and are linked above; the
only text taken from either is one clause of 0159's §Fix, quoted and attributed
in §Fix *Coordination*. Their scratch probe files were present in the working
tree during part of this measurement session and were neither read as evidence
nor touched. The tracked tree was verified identical to HEAD before and after
every measurement (`git status --short` showing untracked bug documents and
scratch files only).

## Fix (0.93.0)

Closed on §Fix **route B**, landed inside bug 0159's commit. This report shipped
no code of its own: route B is one change to one rule, and
[0159](./0159-inline-field-name-stop-masks-duplicate.md) `## Fix (0.93.0)`
carries the full record — the two adjudications verbatim, the settled key, the
DIAG-2 *Trigger* rewrite, the `<field>` placeholder disposition with its
rejected alternatives, the GOV-15 set and the census. Cite that record rather
than re-deriving any of it.

- **The adjudication that closes this report.** §Fix *Coordination* required
  that the three reports agree on one key and that "the first to reach
  implementation states the chosen key and the other two rebase onto it". 0159
  landed first with route (a), which is this report's route B: the comparison is
  re-keyed onto `splitTopLevel(interior, ",", "angle-and-brace")` plus
  `topLevelColon` — raw pre-colon text after `trim()`, no unquoting, no
  normalisation, exactly as §Fix B4 requires — so `{"a": string, "a": integer}`
  is one key written twice and is refused at every `Type` position. Route A was
  not taken; the inline field-name slot still admits a non-identifier token, and
  what changed is that two entries sharing one raw key are now compared.
- **What closes here (§Fix B1).** §Reproduction (a)'s eleven positions no longer
  load the duplicate spelling; §Reproduction (c) rows v1–v5 become unreachable
  for it, because no fragment is minted for a refused source; §Reproduction (d)
  rows L1–L7 are not built for that text; and §Reproduction (e) row c4
  (`{"a": string, "a": integer, "a": boolean}`) draws exactly one line, the
  multiplicity 0052 settled.
- **What stays exactly as measured.** §Reproduction (e) rows c2
  (`{"a": string, "b": integer}`) and c3 (`{a: integer, "a": string}`) still
  load: two distinct raw keys are two properties, not a repeat. §Fix B4's key
  boundary is shipped as stated — row f1 (`"a:b"`) and row f2 (`"a,b"`) keep
  their quote-aware split, row f3 (`{'a': string, "a": integer}`) stays ADMITTED
  because the two quote styles are two distinct spellings of one wire name, row
  f4 (`{"": string, "": integer}`) is refused because the empty-string key
  collides with itself, and row f5 (`{"a" : string, "a" : integer}`) is refused
  because the padding is absorbed by the trim. §Reproduction (b)'s five
  declaration controls b1–b5 are byte-identical: `checkObjectSchema` and
  `emptySchemaBodyDiagnostic` were not edited, and
  [0133](./0133-field-list-discard-recovery-unsettled.md) still owns that path.
- **The placeholder (§Fix B3).** B3 named three admissible dispositions; the one
  taken is the third, "the placeholder table gains a carve-out in the same
  commit" — a ROW-SCOPED carve-out on `<field>` at
  `placeholder-rendering-b.md:10`, on the precedent of `<X>`'s `{}` carve-out at
  `:55`, so the subject renders verbatim and the *Message* does not move
  (DIAG-4). §Fix A2's `<key>` candidate was raised for route A and is rejected
  here with its measurement; 0159's record states why.
- **Cells (§Fix A6, B5).** Cell d5
  (`tests/inline-object-duplicate-field-name.test.ts`) inverts from
  silence-plus-bytes to a refusal, as its own comment authorised in advance, and
  its lowering read-back is reframed as what the refusal prevents. Cell k2 —
  0159's cell, which A6 predicted route A would move and which route B moves for
  the same reason — moves with it, under 0159's disposition. §Fix B5's
  agreement obligation is discharged by assertion rather than by argument: the
  plain-name rows 0052 shipped (its groups (a)–(c)) were re-run unflipped and
  green, and the whole 49-cell witness is green with exactly nine cells re-pinned
  and no cell outside the two predicted sets moved.
- **Byte pins (§Fix *Common obligations*), re-measured.**
  `src/parser/type-grammar.ts` 835 → **923**. `src/parser/params.ts` (1253),
  `src/parser/body-type-lowering.ts` (763) and
  `src/parser/schema-declarations.ts` (819) are UNCHANGED by this fix; the
  counts differ from this report's 1006 / 726 / 819 because sibling fixes landed
  between the filing and this commit.
- **Live (§Fix *Common obligations*).** No code was added, so
  `tests/fixtures/h7a/permitted-codes.json` was decided by a real H9a run rather
  than assumed, and is BYTE-UNCHANGED (`git hash-object` = `git rev-parse HEAD:`
  = `a4a8da04209f90e13d815edd92c1fc682e2a2236`). H8a 35/35, H9a 11/11.
- **Residual, owed to this report and re-filed rather than left implicit
  (§Fix B2).** A SINGLE quoted field still loads and still lowers a JSON Schema
  property name carrying quote characters: `{"a": string}` draws nothing at
  every `Type` position and mints `properties['"a"']`, a key no theta identifier
  can address. That is this report's element (3), which route B does not reach.
  It is pinned as a measured fact rather than a claim by cell G2 of
  `tests/inline-object-field-name-comparison-key.test.ts` (the silence AND the
  lowered bytes), and by §Reproduction (c) row v6 and (d) rows L1–L7 above. The
  parent files the re-filing; the run that landed this fix created no bug
  document.
- **Not closed here.** The inline/declaration asymmetry on non-identifier field
  names in general (route A's subject) is not settled: the inline slot still
  admits `{"a": string}` where `schema S { "a": string }` is refused. The
  `as "WireName"` rename's wire-name semantics remain
  [0160](./0160-inline-object-wire-name-rename-unparsed.md)'s open subject, and
  the identifier RULES at this slot remain
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md)'s.
