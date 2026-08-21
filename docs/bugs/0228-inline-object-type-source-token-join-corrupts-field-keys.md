# Bug 0228 — the three type-source captures in `theta-document.ts` rebuild a `Type`'s text by joining lexer token texts with no separator (`parseType`'s `parts.join("")` at `:3554`, the `@<T>` capture at `:5085`, the `invoke<T>` capture at `:4924`), so at every `Type` position except `params:` an inline object's interior loses the author's inter-token whitespace before any rule or lowerer sees it: `{a b: integer}` arrives as `{ab:integer}` and loads with zero diagnostics at every position, minting the wire property name `ab` — a field the author never declared — while the same text at `params:` mints `a b`; `{a b: integer, ab: string}` draws `theta/parse/duplicate-inline-field-name` naming `'ab'` at ten of the eleven positions and loads clean at `params:`; and `{A b: integer}` draws `theta/parse/binding-case-mismatch` at those ten and nothing at `params:`

- **Status:** open. Finding (a) of the bug
  [0160](./0160-inline-object-wire-name-rename-unparsed.md) fix
  (0.172.0): that record's route rationale item 1 measured the join, ruled
  route 1 out on it ("a prototype of route 1 … emitted at one position out of
  eleven"), and its *Residuals* item 2 records that the capture — not the
  post-type `as` skip — is the real cause of the family 0160 documented. It also
  absorbs bug [0154](./0154-inline-object-type-field-name-rules-unenforced.md)
  `## Fix (0.165.0)` *Residuals* item 1 (row w2, the case rule blind at a
  renamed field name), which 0160's discharge note re-measured, left open, and
  attributed to this capture. §Fix here is constraint-pinned, not settled: the
  routes are enumerated with their measured consequences and the disposition is
  left to the run. **Ordering:** nothing blocks this report from starting. It
  moves the raw-key basis of four landed rules, so five shipped witness files
  assert bytes this fix changes deliberately (§Affected, §Fix (e)).
- **Sev/Diff estimate:** S1/D3 — S1 by the letter: `{a b: integer}` derives
  from no `ObjectType` production (`grammar.md:101`, `Field per Schema
  Declarations`; `schemas.md:17` "Field names are identifiers";
  `lexical.md:13`'s `Ident` admits no space), and it is accepted with zero
  diagnostics at every `Type` position measured (§Reproduction (c)) while the
  wire schema the binder and the model receive carries the fabricated property
  name `ab` (`production-theta-producer.ts:2672`, `:3834`, `:822`). Values are
  also corrupted across positions: one source text mints `ab` at ten positions
  and `a b` at `params:` (§Reproduction (c)), against
  `type-system.md:15`. S2 conduct sits beside it (§Reproduction (b), (d): an
  `E` refusal whose message names a key the source does not contain, present at
  ten positions and absent at the eleventh), but the silent-acceptance face
  carries the score. D3 because §Fix needs in-run adjudication and touches a
  shared path across positions with pinned-byte coordination: the capture feeds
  every `Type` position through one function (`theta-document.ts:3444`), the
  four raw-key inline rules (0052, 0176, 0160) and 0154's identifier pass all
  read the text it produces, both lowerers key `properties` and `required` on
  it, two shipped registry *Trigger*s state the join as normative
  (`code-registry-parse.md:98`, `:100`), and five witness files pin the current
  bytes (`tests/inline-object-field-name-comparison-key.test.ts` group (H)
  exists to assert exactly this capture).
- **Kind:** defect — implementation, three elements on one capture.
  1. *The captured type source is not the author's text.* `parseType`
     (`src/parser/theta-document.ts:3444`) accumulates token texts into `parts`
     and returns `parts.join("")` (`:3554`); `consumeInlineObjectType`
     (`:3562`) pushes an inline object's tokens into the same array (`:3574`).
     The `@<T>` capture (`:5085`) and the `invoke<T>` capture (`:4924`) join the
     same way. Inter-token whitespace is deleted; string-literal interiors
     survive, because they are one token (§Reproduction (a)). `params:` alone
     hands its YAML scalar to `parseTypeExpression` verbatim
     (`src/parser/params.ts:212`).
  2. *Two adjacent identifiers in a field-name position fuse into one
     identifier, and the fused name is then well-formed.* `{a b: integer}`
     becomes `{ab:integer}`, so `tokeniseType` (`type-grammar.ts:342`) and
     `parseObject` (`:603`) read one legal `Field`, `interiorSource` (`:680`)
     holds `ab:integer`, `inlineObjectFieldKeys` (`:718`) yields the key `ab`,
     and every rule reading that key — `duplicate-inline-field-name` (`:1024`),
     `quoted-inline-field-name` (`:1042`), `renamed-inline-field-name`
     (`:1079`) and 0154's `binding-case-mismatch` pass over `fieldNames`
     (`:963–979`) — is satisfied. The input loads and both lowerers mint the
     property name `ab` (§Reproduction (c)).
  3. *Every verdict computed on the fused key is position-dependent.* The same
     source text yields a different key at `params:`, so the emission set
     differs by position: §Reproduction (b) refuses
     `{a b: integer, ab: string}` at ten positions and admits it at `params:`;
     §Reproduction (d) refuses `{A b: integer}` at ten positions and admits it
     at `params:`. `type-system.md:15` states one type grammar for every
     type-annotation position.
- **Related:**
  - [0160](./0160-inline-object-wire-name-rename-unparsed.md) — **fixed
    (0.172.0)**, the origin. Its `## Fix (0.172.0)` measured the join twice: as
    the reason a parse-level rename parse "fires at `params:` only" (route
    rationale item 1) and as the correction to its own root-cause reading
    (*Residuals* item 2). Its shipped row
    `theta/parse/renamed-inline-field-name` is written AROUND this defect: the
    predicate `INLINE_FIELD_RENAME` (`type-grammar.ts:144`) matches the
    verbatim `a as "w"` and the joined `aas"w"` alike and renders its capture
    group rather than the raw key, precisely so one rule answers alike at
    positions whose captures differ. That row's *Trigger*
    (`code-registry-parse.md:100`) states the join as normative. This report
    claims the capture; it does not re-open the rename refusal.
  - [0154](./0154-inline-object-type-field-name-rules-unenforced.md) —
    **fixed (0.165.0)**, whose *Residuals* item 1 (row w2,
    `{ Ys as "w": string }` drawing no `binding-case-mismatch`) 0160's
    discharge note re-homed here: `Ysas"w"` is not `Ident ":"`, so `Ys` never
    enters `fieldNames` at ten positions. That row is now refused by 0160's
    rule, so the residual's harm is bounded; the mechanism is this report's.
    0154's identifier pass is a consumer of `fieldNames` and moves with any
    route taken here.
  - [0052](./0052-inline-object-duplicate-field-names-silent-last-wins.md) —
    **fixed (0.84.0)**, the origin of the `fieldNames` retention and of the
    duplicate rule this report measures firing on a fused key. Its registry
    row's *Trigger* (`code-registry-parse.md:98`) contains the sentence a fix
    here makes false: "where a position reconstructs its type-source text from
    lexer tokens rather than reading it verbatim, the two agree on that
    reconstruction too".
  - [0159](./0159-inline-field-name-stop-masks-duplicate.md) — **fixed
    (0.93.0)**, which re-keyed the duplicate rule onto `interiorSource` and
    wrote group (H) of `tests/inline-object-field-name-comparison-key.test.ts`
    to pin this capture in both directions. That group's header states the
    consequence narrowly — "only the rendered subject differs" — which
    §Reproduction (b) and (d) contradict: the VERDICT differs too. Any fix here
    re-pins cells H1 and H2 and corrects that comment.
  - [0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) —
    **fixed (0.161.0)**, the quoted-key rule, a third consumer of the same raw
    key. Its first-character trigger is unaffected by the join (a quote is one
    token either way, §Reproduction (e) row B4), but its *Trigger*'s
    agreement-by-construction claim rests on the same text.
  - [0035](./0035-params-rhs-inline-object-under-emission.md) — **fixed
    (0.44.0)** — and
    [0039](./0039-inline-object-annotation-root-phantom-fields-and-silent-nested-walk.md)
    — **fixed (0.49.0)** — own the `params:` lowering byte freeze
    (`tests/params-inline-object-lowering.test.ts`, 37 cells). `params:` is the
    one position whose capture is already verbatim, so a route that makes the
    other ten verbatim leaves that freeze untouched, and a route that joins
    `params:` too moves it.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    adjudicated do-not-chase class for the positional drift any fix here
    induces in `theta-document.ts` and `type-grammar.ts`.
- **Affected** (every citation verified at HEAD `758e3c0d`, 0.173.0):
  - **The three captures.** `src/parser/theta-document.ts:3444` — `parseType`,
    whose own doc comment at `:3394` describes it as "joining its tokens";
    `:3554` — `return parts.join("")`, the join; `:3562` —
    `consumeInlineObjectType`, which pushes an inline object's token texts into
    the same `parts` array (`:3574`) so a brace-balanced interior is joined with
    the rest. `:5062` — `parseQuery`; `:5068` — the comment claiming the
    annotation is "captured verbatim as the annotation"; `:5085` —
    `schema = parts.join("").trim()`. `:4924` — the `invoke<T>` capture's
    `parts.join("").trim()`, assigned to `returnSchema`
    (`InvokeExpr.returnSchema`, `:206`).
  - **The one position that does not join.** `src/parser/params.ts:212` — the
    `params:` field's `parseTypeExpression(field.typeSource, …)` call over the
    YAML scalar as written; `:1259` — `hoistInlineObjectType`, whose split
    (`:1266`) and pre-colon slice (`:1271`) then see the author's spacing.
  - **The raw-key substrate the join feeds.**
    `src/parser/type-grammar.ts:207` — `parseTypeExpression`, which tokenises
    the captured string (`:213`); `:342` — `tokeniseType`; `:603` —
    `TypeParser.parseObject`; `:680` — the `interiorSource` slice off
    `TypeToken.start` offsets; `:718` — `inlineObjectFieldKeys`. Three comments
    describe `interiorSource` as carrying the author's bytes — `:308–320` ("the
    raw source text … so quoting and inter-token whitespace survive verbatim"),
    `:464`, `:488` ("directly off the original bytes") — true of the string
    handed to `parseTypeExpression` and false of the author's source at ten of
    the eleven positions.
  - **The four consumers.** `type-grammar.ts:963–979` — 0154's identifier pass
    over `node.fieldNames`; `:1024` — `theta/parse/duplicate-inline-field-name`;
    `:1042` — `theta/parse/quoted-inline-field-name`; `:1079` —
    `theta/parse/renamed-inline-field-name`, with its predicate at `:144`
    written to match both captures.
  - **The two lowerers.** `src/parser/body-type-lowering.ts:173` —
    `lowerInlineObject`; `src/parser/params.ts:1259` —
    `hoistInlineObjectType`. Both key `properties` and `required` on the same
    pre-colon text, so at ten positions they mint the fused name.
  - **The wire surfaces.** `src/extension/production-theta-producer.ts:2672` —
    `lowerQueryResponseSchema(expr.schema, …)`, the single typed-query lowering
    feeding validation, respond-tool registration and the QRY-15 template;
    `:3834` — the same call over `invoke<T>`'s `returnSchema` before the return
    validator compiles; `:822` — `paramsSchema: params.loweredSchema` into the
    binder envelope (the verbatim-capture position).
  - **The precedent for a raw slice at this parser.**
    `theta-document.ts:5130–5140` — the query template's body text is sliced
    off `this.bodyText` with `positionToOffset` (`:5191`) precisely because
    "the tokens are a lossy, space-joined view — they collapse the author's
    spacing"; the fallback `parts.join(" ")` is used only when the raw slice is
    unavailable. The same two inputs are in scope at every type capture.
  - **The spec sentences.** `docs/spec_topics/grammar.md:101` — `ObjectType
    ::= "{" Field ("," Field)* ","? "}"`, `Field per Schema Declarations,
    minus the wire-name rename`; `:109` — §"Inline object types", which states
    all four inline rules over "the entries the body spells between its
    top-level commas, on the text before each entry's own top-level colon,
    taken as written"; `docs/spec_topics/schemas.md:17` — "Field names are
    identifiers"; `docs/spec_topics/lexical.md:13` — `Ident` is
    `[A-Za-z_][A-Za-z0-9_]*`; `docs/spec_topics/type-system.md:15` — one type
    grammar in every type-annotation position, and the four
    `*-type-not-expression` codes for text deriving from no `Type` production;
    `docs/spec_topics/schema-subset.md:78` — `properties` and `required` keyed
    by wire names.
  - **The registered rows whose *Trigger*s state the join.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:98` (0052's row —
    "where a position reconstructs its type-source text from lexer tokens
    rather than reading it verbatim, the two agree on that reconstruction
    too"), `:99` (0176's row), `:100` (0160's row — "at ten of the eleven
    `Type` positions the surrounding document reconstructs the type source by
    joining lexer tokens with no separator"), `:19`
    (`theta/parse/binding-case-mismatch`, whose *Trigger* names a field-name
    position with no spelling qualifier). Mirrors:
    `docs/reference/diagnostics.md`.
  - **The witness cells this report's fix moves.**
    `tests/inline-object-field-name-comparison-key.test.ts:1020–1096` — group
    (H), cells H1 and H2, which assert the joined capture at three positions
    and the raw capture at `params:` as CONTROLS, and whose header comment
    states the consequence as "only the rendered subject differs".
    `tests/inline-object-duplicate-field-name.test.ts` (1702 lines),
    `tests/inline-object-quoted-field-name-refusal.test.ts` (1053),
    `tests/inline-object-field-name-case.test.ts` (836), and
    `tests/inline-object-wire-name-rename-refusal.test.ts` (1440, 25 tests / 67
    list cells, 22 position cells) each assert whole diagnostic lists over
    interiors this capture reaches; 0160's file is the fresh witness whose
    position rows a capture change re-derives.
    `tests/params-inline-object-lowering.test.ts` (1178, 37 cells) is 0035's
    byte freeze at the one verbatim position.
    `tests/committed-fixture-parse-gate.test.ts` is the zero-diagnostic gate
    over committed fixtures.
  - **The corpus.** `git ls-files -- '*.theta' '*.thetalib'` is 34 files. No
    committed theta spells two identifiers in an inline field-name position: a
    scan for an inline object interior whose pre-colon text contains a space
    returns zero hits outside test strings, so no committed source moves under
    any route here.
- **Observed at:** `0.173.0` (HEAD `758e3c0d`). Offline, deterministic; no live
  model, no provider. Every diagnostic row is the whole unfiltered
  `doc.diagnostics` in emission order, rendered `<severity> <code>: <message>`,
  through `parseDoc` (`tests/helpers/e2e-s1.ts`) driving the shipped
  `parseThetaDocument`, with frontmatter `---\nmode: prompt\n---` and a
  `let a = 1` + `a` tail; the `.thetalib` row passes `path = "lib.thetalib"`
  with no frontmatter. Capture rows are read straight off the parsed AST —
  `LetStmt.annotation`, `QueryExpr.schema`, `InvokeExpr.returnSchema` — so they
  are the strings the checker and the lowerers receive, ahead of any rule.
  `params:` lowerings are `doc.frontmatter.params.loweredSchema` verbatim;
  annotation-root lowerings are `lowerQueryResponseSchema(<captured text>, [],
  [])`, the same call `production-theta-producer.ts:2672` makes on
  `expr.schema`. Three scratch vitest files over those entry points, run on the
  outputs quoted below, then deleted; the tracked tree is identical to HEAD.
  One untracked scratch file from a sibling session
  (`tests/scratch-0226-declared-head-fields.test.ts`) was present throughout
  and is not this filing's. `src/`, `tests/`, `docs/bugs/README.md` and every
  other bug document are unmodified by this filing.

## Summary

At ten of the eleven `Type` positions the document reconstructs a type's source
text by joining lexer token texts with no separator. `parseType`
(`theta-document.ts:3444`, join at `:3554`) serves the `let` / `let mut`
annotation, the `fn` parameter and return slots, a `schema` body field, a
`schema X = …` right-hand side, and every nesting depth beneath them; the
`@<T>` capture (`:5085`) and the `invoke<T>` capture (`:4924`) join the same
way. `params:` alone passes its YAML scalar through (`params.ts:212`).

Whitespace inside a string literal survives — a literal is one token — so the
join is invisible for every well-formed interior. It is not invisible where the
author's spacing separates two tokens in a field-name position:
`{a b: integer}` arrives as `{ab:integer}`, `{a b c: integer}` as
`{abc:integer}`, `{mut a: integer}` as `{muta:integer}`, and
`{ p: { a b: integer, ab: string } }` as `{p:{ab:integer,ab:string}}`.

Three consequences, each measured. **An interior that derives from no
`ObjectType` production is accepted, and the fused name reaches the wire.**
`{a b: integer}` loads `[]` at every position; the annotation root and
`invoke<T>` lower `{"properties":{"ab":{"type":"integer"}},"required":["ab"]}`,
so the schema handed to the binder, the respond tool and the return validator
names a field the author never declared. **The verdicts computed on the fused
key are position-dependent.** `{a b: integer, ab: string}` — two distinct field
names in the source — draws `error theta/parse/duplicate-inline-field-name:
duplicate field name 'ab' within one inline object type` at ten positions,
including the `.thetalib` spelling, and loads `[]` at `params:`, where the
lowering mints two properties (`a b`, `ab`). `{A b: integer}` draws
`theta/parse/binding-case-mismatch` at those ten and nothing at `params:`,
whose lowering keys on `A b`. **The information no rule can recover is the
author's field-name spelling.** After the join, `ab` is a well-formed
identifier: no rule at those ten positions can refuse the interior the author
wrote, and a message that renders the key names text the source does not
contain — including the shipped `let-rhs-type-mismatch` rendering
(`expected { ab: integer, a: string }`).

This is the defect bug 0160's fix record names as the reason a parse-level
rename parse "fires at `params:` only", and the reason bug 0154's residual 1
(the case rule blind at `{ Ys as "w": string }`) could not be closed at its own
leaf: `Ysas"w"` is not `Ident ":"`, so `Ys` never enters `fieldNames`.

## Reproduction

Offline, deterministic, at HEAD `758e3c0d`. Whole unfiltered diagnostic lists in
emission order; capture rows read off the parsed AST.

### (a) The capture, at the three capture sites

Each interior written at a `let` annotation, at `@<…>` and at `invoke<…>`; all
three captures agree byte-for-byte on every row.

| # | source interior | captured text |
|---|---|---|
| A1 | `{ a: integer, b: string }` | `{a:integer,b:string}` |
| A2 | `{a b: integer, ab: string}` | `{ab:integer,ab:string}` |
| A3 | `{A b: integer}` | `{Ab:integer}` |
| A4 | `{let b: integer}` | `{letb:integer}` |
| A5 | `{mut a: integer}` | `{muta:integer}` |
| A6 | `{a b c: integer}` | `{abc:integer}` |
| A7 | `{_a b: integer}` | `{_ab:integer}` |
| A8 | `{ p: { a b: integer, ab: string } }` | `{p:{ab:integer,ab:string}}` |
| A9 | `{a: "x y" \| "z"}` | `{a:"x y"\|"z"}` |
| A10 | `{a: integer b: string}` | `{a:integerb:string}` |

A1 is the bound: a well-formed interior loses only spacing that no rule and no
lowerer reads. A9 is the second bound: a string literal is one token, so its
interior spacing survives. A8 shows the join reaching an interior nested one
level down (`consumeInlineObjectType` pushes into the same array).

### (b) The same source text, refused at ten positions and admitted at the eleventh

Fixture `{a b: integer, ab: string}` — two distinct field names in the source.

| # | position | diagnostics |
|---|---|---|
| B1 | `let x: {…} = 1` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'ab' within one inline object type` |
| B2 | `let mut x: {…} = 1` | same |
| B3 | `fn f(p: {…}) { 1 }` | same |
| B4 | `fn f(): {…} { 1 }` | same |
| B5 | `schema S { p: {…} }` | same |
| B6 | `schema T = {…}` | same |
| B7 | `let r = @<{…}>` + backtick body | same |
| B8 | `let r = invoke<{…}>("./x.theta")` | same |
| B9 | B5 written in `lib.thetalib`, no frontmatter | same |
| B10 | `let x: { q: {…} } = 1` (nested) | same |
| B11 | `params:` → `p: '{…}'` | `[]` |

B11's lowering is
`$defs.__inline_de3255fd680bc2b0` =
`{"type":"object","properties":{"a b":{"type":"integer"},"ab":{"type":"string"}},"required":["a b","ab"],"additionalProperties":false}`
— two properties, no repeat, so the position that reads the author's text has
nothing to refuse. `array<{a b: integer, ab: string}>` is silent at every
position: the generic-argument carve-out all three raw-key rules share
withholds them, and the capture is joined there too.

### (c) Fabricated field names, accepted everywhere, minted differently by position

Each row loads `[]` at the annotation root, at `invoke<T>`, at the `let`
annotation's own `schema`-free spelling and at `params:`. "joined lowering" is
`lowerQueryResponseSchema(<captured text>)` — the call
`production-theta-producer.ts:2672` makes; "`params:` lowering" is
`frontmatter.params.loweredSchema`'s `$defs` member.

| # | source interior | joined lowering — properties / required | `params:` lowering |
|---|---|---|---|
| C1 | `{a b: integer}` | `{"ab":{"type":"integer"}}` / `["ab"]` | `{"a b":{"type":"integer"}}` / `["a b"]` |
| C2 | `{a b c: integer}` | `{"abc":…}` / `["abc"]` | `{"a b c":…}` / `["a b c"]` |
| C3 | `{_a b: integer}` | `{"_ab":…}` / `["_ab"]` | `{"_a b":…}` / `["_a b"]` |
| C4 | `{mut a: integer}` | `{"muta":…}` / `["muta"]` | `{"mut a":…}` / `["mut a"]` |
| C5 | `{let b: integer}` | `{"letb":…}` / `["letb"]` | `{"let b":…}` / `["let b"]` |
| C6 | `{a b: integer, a: string}` | `{"ab":…,"a":…}` / `["ab","a"]` | `{"a b":…,"a":…}` / `["a b","a"]` |
| C7 | `{a: integer, b c: void}` | `{"a":…,"bc":{}}` / `["a","bc"]` | `{"a":…,"b c":{}}` / `["a","b c"]` |

C5 fuses a reserved keyword into the name, so
`theta/parse/reserved-keyword-as-identifier` and the case rule both see the
identifier `letb` and stay silent. C7's `void` still draws
`theta/parse/void-in-non-return-position` at the joined positions and nothing
at `params:` — a second position-dependent emission on the same row.

The joined name also reaches shipped diagnostic text: at a `let` annotation
over an `integer` initialiser, C1 renders
`let binding 'x' initialiser type mismatch: expected { ab: integer }, got
integer`, C5 renders `expected { letb: integer }`, and C6 renders
`expected { ab: integer, a: string }` — field names the source does not
contain.

### (d) 0154's identifier pass, refusing at ten positions and silent at the eleventh

Fixture `{A b: integer}`.

| # | position | diagnostics |
|---|---|---|
| D1 | `let x: {A b: integer} = 1` | `error theta/parse/binding-case-mismatch: binding name must start with a lowercase letter or _` (+ the `let-rhs-type-mismatch` row naming `{ Ab: integer }`) |
| D2 | `fn f(p: {A b: integer}) { 1 }` | `error theta/parse/binding-case-mismatch: …` |
| D3 | `schema S { p: {A b: integer} }`, `.theta` and `.thetalib` | `error theta/parse/binding-case-mismatch: …` |
| D4 | `let r = @<{A b: integer}>` + body | `error theta/parse/binding-case-mismatch: …` |
| D5 | `let x: array<{A b: integer}> = 1` | `error theta/parse/binding-case-mismatch: …` (the pass over `fieldNames` carries no generic-argument carve-out) |
| D6 | `params:` → `p: '{A b: integer}'` | `[]`, lowering `{"A b":{"type":"integer"}}` / `["A b"]` |

The refused name `Ab` appears in no source. The uppercase name the author did
write, `A`, is refused at ten positions by accident and admitted at the
eleventh, where the lowering also leaks it to the wire — the leak 0154 §Kind
element 3 measures for its own spelling.

### (e) Bounds

| # | source | observable |
|---|---|---|
| E1 | `{ a: integer, b: string }` at all eleven positions | `[]`; `params:` and joined lowerings agree byte-for-byte on `{"a":…,"b":…}` / `["a","b"]` |
| E2 | `{a: "x y"}` | `[]` at every position; captured `{a:"x y"}`, spacing inside the literal intact |
| E3 | `{a: integer b: string}` (missing comma) | `error theta/parse/annotation-type-not-expression` at a `let` annotation, `theta/parse/query-annotation-type-not-expression` at `@<…>`, `theta/load/params-type-not-expression` at `params:` — the fused `integerb` derives from no `Type`, so this shape is refused at every position |
| E4 | `{"a b": integer}` | `error theta/parse/quoted-inline-field-name: quoted field name '"a b"' within one inline object type; field names are identifiers` at all eleven positions including `params:` — a quote is one token, so 0176's first-character trigger is position-invariant |
| E5 | `{a: integer, a : string}` | `error theta/parse/duplicate-inline-field-name: duplicate field name 'a' …` at all eleven positions — the duplicate rule's `trim()` absorbs padding around a key, so whitespace OUTSIDE a key is not this defect |

E1 and E5 are why every table of 0159's group (A) is uniform across positions:
the join is observable only where spacing separates two tokens inside a key or
a type.

### (f) The corpus

`git ls-files -- '*.theta' '*.thetalib'` → 34 files. No committed theta spells
an inline object interior whose pre-colon text contains a space; the shape
appears only inside TypeScript test strings. No committed source moves under
any route in §Fix, and `tests/committed-fixture-parse-gate.test.ts` takes no
new refusal.

## Expected behaviour

`type-system.md:15` states that the same type grammar applies in every
type-annotation position, and that text deriving from none of its forms "is
refused at load or parse time rather than admitted as a nominal reference".
`grammar.md:101` derives an `ObjectType` field from `Field per Schema
Declarations`; `schemas.md:17` fixes a field name as an identifier and
`lexical.md:13` gives `Ident` as `[A-Za-z_][A-Za-z0-9_]*`, which admits no
space. Two identifiers separated by a space in a field-name position therefore
derive from no `Field`, and `{a b: integer}` derives from no `ObjectType`.

From that, three statements:

- **The text a `Type` position hands the checker and the lowerers is the text
  the author wrote.** A capture that deletes inter-token whitespace makes the
  effective grammar of ten positions wider than the written one and different
  from the eleventh's. Rows A2–A8 should capture their source spelling.
- **`{a b: integer}` is refused, at every position, with one code.** Whether
  that code is the position's own `*-type-not-expression` row (as row E3's
  fused shape already draws) or a new inline row is the adjudication §Fix (c)
  leaves to the run; what is not admissible is loading it, and minting a
  property name — `ab` at ten positions, `a b` at `params:` — that no author
  wrote. `schema-subset.md:78` keys `properties` and `required` by wire names,
  and neither `ab` nor `a b` is one.
- **Every rule reading an inline object's raw key answers alike at all eleven
  positions.** Rows B1–B11 should be one verdict, and rows D1–D6 should be one
  verdict. The four inline rules are stated over "the entries the body spells
  between its top-level commas, on the text before each entry's own top-level
  colon, taken as written" (`grammar.md:109`); "as written" is the author's
  text, not a reconstruction of it.

Row E1's bytes do not move under that reading: a well-formed interior's keys
and lowered property names are identical before and after.

## Actual behaviour / root cause

**One function joins, and it serves ten positions.** `parseType`
(`theta-document.ts:3444`) accumulates each consumed token's `text` into
`parts` and returns `parts.join("")` (`:3554`). Its own doc comment describes
the design — "Consume a type expression, joining its tokens until a delimiter"
(`:3394`) — and `consumeInlineObjectType` (`:3562`) feeds an inline object's
tokens into the same array (`:3574`), so a brace-balanced interior is joined
with everything around it. The `let` / `let mut` annotation (`:2165`), the `fn`
parameter (`:2481`) and return (`:2534`) slots, the `schema X = …` right-hand
side (`:2742`) and a `schema` body field (`:2964`) all call it. The `@<T>`
annotation capture builds its own `parts` and joins identically (`:5085`),
under a comment that calls the result "captured verbatim as the annotation"
(`:5068`); so does the `invoke<T>` capture (`:4924`).

**`params:` is the exception, and that is what makes the defect visible.** A
`params:` field type is a YAML scalar handed straight to
`parseTypeExpression` (`params.ts:212`), so the author's spacing survives to
`tokeniseType`, to `interiorSource`, to `inlineObjectFieldKeys` and to
`hoistInlineObjectType`'s `properties` / `required` writes (`:1266`, `:1271`).

**Downstream, "raw" means raw relative to the capture.** `parseObject`
(`type-grammar.ts:603`) slices `interiorSource` off `TypeToken.start` offsets
(`:680`) rather than rebuilding it from token texts, so quoting and inter-token
whitespace survive — of the string it was given. Three comments state that
property in absolute terms (`:308–320`, `:464`, `:488`), and 0052's registry
row generalises it: "where a position reconstructs its type-source text from
lexer tokens rather than reading it verbatim, the two agree on that
reconstruction too" (`code-registry-parse.md:98`). Agreement between the rule
and the lowerer does hold at each position, because both read the same string.
What does not hold is agreement with the source, or between positions.

**A fused key is a well-formed key.** `{a b: integer}` becomes `{ab:integer}`,
which `tokeniseType` reads as one `ident` `ab` followed by
`:`, so `parseObject` parses one legal field, pushes `ab` into `fieldNames`
(the list 0154's pass reads, `:963–979`) and leaves `interiorSource` =
`ab:integer`. `inlineObjectFieldKeys` (`:718`) yields `["ab"]`. The duplicate
rule (`:1024`) finds no repeat, the quoted rule (`:1042`) sees a letter first,
0160's rename predicate (`:144`, emission `:1079`) matches no `as` clause, and
the case rule sees a lowercase first letter. Nothing is left to refuse, and
`lowerInlineObject` (`body-type-lowering.ts:173`) mints `ab`.

**Where two source names fuse into one, the fused key manufactures a repeat.**
`{a b: integer, ab: string}` becomes `{ab:integer,ab:string}`: two entries, one
key, so the duplicate rule fires and renders `'ab'` (rows B1–B10). At
`params:`, the same source is two keys and the rule is silent (row B11). The
divergence is not in the rule — it is one rule over two different strings.
`{A b: integer}` is the same mechanism one rule to the side: `Ab` enters
`fieldNames` and 0154's pass refuses it at ten positions (rows D1–D5) while
`params:` admits `A b` and lowers it (row D6).

**The lost information is unrecoverable at the leaf.** After the join there is
no witness in the token stream that the author wrote two tokens. This is why
bug 0160's route-1 prototype "emitted at one position out of eleven" and was
withdrawn, why its shipped predicate had to match `aas"w"` as well as
`a as "w"`, and why bug 0154's residual 1 stayed open at its own leaf: `Ys`
never reaches `fieldNames` because `Ysas"w"` is one identifier followed by no
colon. The same parser already solves the same problem for a query template by
slicing the raw source instead of joining tokens (`:5130–5140`, with
`positionToOffset` at `:5191`), under a comment naming the tokens "a lossy,
space-joined view".

## Why it matters

- **Inputs the grammar does not derive load, at every position, and mint wire
  property names no author wrote.** Rows C1–C7. The lowered document is the
  binder envelope's `paramsSchema` (`production-theta-producer.ts:822`), the
  typed query's response schema and respond-tool schema (`:2672`) and
  `invoke<T>`'s return validator input (`:3834`). A model answering that schema
  must emit `{"ab": …}` for a field the theta calls `a b`.
- **One source text has two meanings.** The same interior lowers `abc` at ten
  positions and `a b c` at `params:` (row C2), against `type-system.md:15`. A
  theta that moves an inline object from a `params:` field to a `let`
  annotation changes its wire contract silently.
- **Two shipped `E` rows fire on manufactured evidence.** Rows B1–B10 refuse a
  source with no repeated field name and name a key (`ab`) that appears nowhere
  in it; rows D1–D5 refuse `Ab`. A diagnostic that renders source-derived text
  must render text from the source (`placeholder-rendering-b.md`
  §"Source-derived placeholders" is what governs those two rows' `<field>`
  carve-outs).
- **The defect blocks the closure of two filed residuals.** 0160's *Residuals*
  item 2 and 0154's *Residuals* item 1 both terminate here: no parse-level rule
  at those ten positions can see a field-name spelling the capture has already
  destroyed. Every future rule at this slot inherits the same ceiling, and
  0160's fix had to shape its predicate and its `<field>` rendering around it.
- **Two registry *Trigger*s and four source comments state the join as a
  property of the design.** `code-registry-parse.md:98` and `:100`,
  `type-grammar.ts:308–320`, `:464`, `:488`, and
  `theta-document.ts:5068`'s "captured verbatim". They are consistent with the
  code and inconsistent with `type-system.md:15`; whichever way the run
  disposes of the capture, some of that prose changes.
- **Closing it costs no committed source.** §Reproduction (f).

## Fix

Not settled. The routes below are constraint-pinned; the run selects, states its
choice, and records the disposition of the prose the choice falsifies.

**(a) Where the text comes from.**

- *Route 1 — slice the raw source.* Give each of the three captures the
  treatment the query template already has (`theta-document.ts:5130–5140`):
  record the first and last token of the capture and slice `this.bodyText`
  between their offsets with `positionToOffset` (`:5191`), keeping
  `parts.join("")` only as the fallback the template arm already uses (no
  closing delimiter, or no body source threaded through). This is the only
  route that makes the eleven positions carry one text. Consequences to
  pre-measure, not discover: the four raw-key rules and 0154's pass change
  their keys at ten positions for every interior carrying inter-token
  whitespace inside a key or a type; rows B1–B10 stop refusing;
  rows C1–C7 and D1–D5 change their keys to the author's; row E1 must not
  move; `params:` must not move at all (0035's 37-cell freeze).
- *Route 2 — normalise the eleventh position instead.* Join the `params:`
  scalar the same way the other ten are joined. Position invariance is then
  reached by making every position lossy: rows B1–B11 and D1–D6 become
  uniform, fabricated keys stay, and the `params:` lowered bytes move for
  every interior with spacing inside a key — 0035's byte freeze and 0039's
  `params:` freeze both re-pin. Admissible only if stated as a deliberate
  narrowing of what the wire can express.
- *Route 3 — a rule over the joined text.* Not available: the join is not
  injective on field-name positions, and `ab` is a well-formed key. No rule at
  those ten positions can distinguish `{a b: integer}` from `{ab: integer}`.
  Stated so the run does not re-derive it.

**(b) Whether the interior is refused, and by which code.** Route 1 makes
`a b` a key that reaches every rule; nothing refuses it today. Either the
position's own `*-type-not-expression` row covers it — row E3 shows a fused
shape already drawing that code, so the boundary is between "no top-level
colon after the fused head" and "a key containing a space" — or a new inline
row is minted (DIAG-2: the row, its *Trigger*, and the
`docs/reference/diagnostics.md` mirror in the same commit). The run must pick
one and state why the other is wrong; `{A b: integer}` (row D4) and
`{let b: integer}` (row C5) are the two spellings whose disposition changes
with that pick.

**(c) The prose the choice falsifies, corrected in the same change.** Under
route 1: `code-registry-parse.md:98`'s reconstruction sentence and `:100`'s
"at ten of the eleven `Type` positions …" clause, including 0160's stated
rationale for rendering its predicate's capture rather than the raw key (the
row's *Message* may keep that rendering, but the reason changes);
`type-grammar.ts:308–320`, `:464` and `:488`'s absolute "original bytes"
claims; `theta-document.ts:5068`'s "captured verbatim"; `:3394`'s "joining its
tokens". Under route 2: `type-system.md:15`'s position-invariance sentence
needs no change, but 0035's and 0039's freeze records do.

**(d) Ordering.** Nothing blocks this report. A fix here is the precondition
0154's *Residuals* item 1 names for any parse-level rule at the inline
field-name slot, and it is the measurement 0160's route rationale rests on; a
later report reusing either must cite this record rather than re-deriving the
capture.

**(e) Witness obligations, and the pinned bytes this fix moves.**

- **`tests/inline-object-field-name-comparison-key.test.ts` group (H)
  (`:1020–1096`) is re-pinned**, and its header comment — which states the
  consequence as "only the rendered subject differs" — is corrected in the same
  commit with rows B1–B11 and D1–D6 as the counter-evidence.
- **The four rule witnesses are re-derived, not edited by search**:
  `tests/inline-object-duplicate-field-name.test.ts`,
  `tests/inline-object-quoted-field-name-refusal.test.ts`,
  `tests/inline-object-field-name-case.test.ts`, and 0160's
  `tests/inline-object-wire-name-rename-refusal.test.ts` (25 tests, 67 list
  cells, 22 position cells — the file whose position rows exist because of this
  capture). Every cell whose fixture carries inter-token whitespace inside a
  key or a type is in scope; every other cell must be proven unmoved by hash.
- **`tests/params-inline-object-lowering.test.ts` (37 cells) must not move
  under route 1** and is re-pinned under route 2. Prove it by hash, not by
  reading.
- **A new witness file carries this report's rows** on the shape of the
  existing ones: whole-list ordered `toEqual` over unfiltered
  `doc.diagnostics`, every *Message* through `parseRegistry` / `registryMessage`
  (DIAG-4), `parseDoc` from `tests/helpers/e2e-s1.ts`. Minimum rows: every
  capture row of (a) read off the AST at all three capture sites; (b) at all
  eleven positions including `.thetalib` and the generic-argument carve-out;
  (c)'s joined-versus-`params:` lowered bytes; (d)'s six positions; and every
  bound of (e), E1 and E2 as the no-move controls.
- **Both directions proven.** Neutralise the capture change and confirm the new
  rows red and only they; restore and confirm green by hash.

**(f) Blast radius.** Zero committed `.theta`/`.thetalib` files spell the
shape (§Reproduction (f)), so
`tests/committed-fixture-parse-gate.test.ts` takes no new refusal. Every input
in §Reproduction except B1–B10, D1–D5 and E3–E5 loads with no `E`-severity
diagnostic at 0.173.0, so the newly-refused set is disposed of by the
[diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out);
the newly-ADMITTED set (rows B1–B10 and D1–D5, which stop refusing under route
1) is the one to state explicitly, since it removes emissions that landed with
0052, 0154 and 0159.

## Non-goals

- **The inline wire-name rename.** Refused at every position by
  [0160](./0160-inline-object-wire-name-rename-unparsed.md) (0.172.0) and not
  re-opened here. This report claims the capture that made that row's predicate
  match two spellings, not the row's disposition.
- **The escaped-quote class.** `{a as "w\"x": integer}` drops the field
  silently because the shared split's quote tracking is escape-blind; that is
  0160's *Residuals* item 1, filed as
  [0229](./0229-escaped-quote-wire-name-drops-inline-field.md). The join is not
  its cause.
- **The plain-spelling duplicate, quoted-key and identifier rules themselves.**
  0052's, 0176's and 0154's rows keep their triggers and their emission sets on
  every interior with no inter-token whitespace inside a key (rows E1, E4, E5).
  A fix here changes the string they read, not the questions they ask.
- **The `params:` lowering freeze.** 0039's and 0035's frozen bytes are a
  constraint here, not a subject; route 1 must leave them byte-identical.
- **Whitespace outside a key.** Padding around an entry's pre-colon text is
  absorbed by `trim()` at every position (row E5) and is not this defect.
- **The missing-comma shape.** `{a: integer b: string}` (row E3) is refused at
  every position today; whether the fused `integerb` is the right reason for
  that refusal is not claimed here.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `theta-document.ts` and `type-grammar.ts`; that is
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class.

## Provenance

- Origin: the bug [0160](./0160-inline-object-wire-name-rename-unparsed.md) fix
  (0.172.0). Its `## Fix (0.172.0)` route rationale item 1 measured the join as
  the reason a parse-level rename parse "fires at `params:` only", item 2 named
  the wire-name semantics unrecoverable "downstream of that capture", and its
  *Residuals* item 2 corrected that document's own root-cause reading to name
  the capture. The same fix's discharge note re-measured bug
  [0154](./0154-inline-object-type-field-name-rules-unenforced.md)
  `## Fix (0.165.0)` *Residuals* item 1 (row w2) and attributed it here.
  Bug [0159](./0159-inline-field-name-stop-masks-duplicate.md)'s 0.93.0 fix
  first pinned the capture, in group (H) of
  `tests/inline-object-field-name-comparison-key.test.ts`.
- Independently measured at HEAD `758e3c0d` for this filing, not copied: the
  capture rows of §Reproduction (a) are read off `LetStmt.annotation`,
  `QueryExpr.schema` and `InvokeExpr.returnSchema`; the eleven positions of (b),
  the seven lowering pairs of (c), the six positions of (d) and the five bounds
  of (e) are new measurement. Three scratch vitest files over `parseDoc`
  (`tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema` and
  `frontmatter.params.loweredSchema`, run on the outputs quoted above, then
  deleted.
- Spec: `docs/spec_topics/grammar.md` (`:101`, `:109`);
  `docs/spec_topics/schemas.md:17`; `docs/spec_topics/lexical.md:13`;
  `docs/spec_topics/type-system.md:15`;
  `docs/spec_topics/schema-subset.md:78`;
  `docs/spec_topics/diagnostics/code-registry-parse.md` (`:19`, `:98`, `:99`,
  `:100`); `docs/spec_topics/diagnostics/placeholder-rendering-b.md`
  §"Source-derived placeholders";
  `docs/spec_topics/governance/source-language-stability.md`
  (diagnostic-registry carve-out).
- Implementation evidence at `758e3c0d`: `src/parser/theta-document.ts`
  (`:206`, `:2165`, `:2481`, `:2534`, `:2742`, `:2964`, `:3394`, `:3444`,
  `:3554`, `:3562`, `:3574`, `:4924`, `:5062`, `:5068`, `:5085`, `:5130–5140`,
  `:5191`); `src/parser/type-grammar.ts` (`:144`, `:207`, `:213`, `:308–320`,
  `:342`, `:464`, `:488`, `:603`, `:680`, `:718`, `:963–979`, `:1024`, `:1042`,
  `:1079`); `src/parser/params.ts` (`:212`, `:1259`, `:1266`, `:1271`);
  `src/parser/body-type-lowering.ts:173`;
  `src/runtime/query-schema-lowering.ts:153`;
  `src/extension/production-theta-producer.ts` (`:822`, `:2672`, `:3834`).
- Test evidence at `758e3c0d`:
  `tests/inline-object-field-name-comparison-key.test.ts:1020–1096` (group (H),
  cells H1 and H2); `tests/inline-object-duplicate-field-name.test.ts` (1702
  lines); `tests/inline-object-quoted-field-name-refusal.test.ts` (1053);
  `tests/inline-object-field-name-case.test.ts` (836);
  `tests/inline-object-wire-name-rename-refusal.test.ts` (1440, 25 tests);
  `tests/params-inline-object-lowering.test.ts` (1178, 37 cells);
  `tests/committed-fixture-parse-gate.test.ts`.
