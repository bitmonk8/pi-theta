# Bug 0232 — an inline object type whose string literal never closes is admitted at `params:` with zero diagnostics and lowers to the permissive `{}`, dropping every field the author declared, while all eight lexed `Type` positions refuse the same text

- **Status:** open
- **Sev/Diff estimate:** S1/D2 — S1 because a declared `params:` contract is
  deleted with nothing on any channel: `p: '{a as "w\": integer}'` reports `[]`
  and lowers `p` to `{}` inside
  `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}`,
  so the field accepts any JSON at all (§Reproduction A row A9, C row C1), and
  the loss is object-wide rather than entry-wide — a well-formed sibling field
  is dropped with the offending one (`{a as "w: integer, b: integer}` and
  `{b: integer, a as "w: integer}` both lower to `{}` where `{b: integer}`
  lowers to a `$ref` carrying `b`, §Reproduction B). One unterminated literal
  anywhere in the interior additionally withholds all four raw-key rows and the
  identifier rules for the WHOLE interior, so a duplicate, quote-led or
  non-identifier key beside it draws nothing either (§Reproduction D). D2
  because both candidate surfaces are shared: `isSingleEnclosingBraceGroup`
  (`src/parser/params.ts:1401`) has three call sites (`params.ts:1770`,
  `body-type-lowering.ts:318`, `:621`) and gates every position's inline-object
  hoist, and `isUnspellableTextRefusable` (`params.ts:1651`) is read by five
  positions, so narrowing its brace exemption moves refusals at all of them;
  a registry disposition (DIAG-2) and the normatively-stated brace exemption
  (`frontmatter-fields-a.md:58`, `code-registry-load.md:19`) are part of the
  same change.
- **Kind:** defect — implementation, against a normative lexical production and
  against the schema-subset lowering. Two elements.
  1. **The quote latch manufactures an unbalanced brace group.**
     `isSingleEnclosingBraceGroup` (`src/parser/params.ts:1401`) opens a quoted
     region at `"` (`:1417–1420`) and leaves it only on the closing quote
     (`:1409–1416`). In `{a as "w\": integer}` and `{a as "w: integer}` that
     quote never closes, so the author's own final `}` is read inside the
     literal, brace depth never returns to 0, and the function returns `false`
     (`:1430`). `lowerParamsFieldType`'s inline-object intercept
     (`:1770–1772`) is therefore not taken for a source the author wrote as one
     brace group.
  2. **Both fall-through paths are silent.** The type source falls to
     `lowerTypeExpr`, which lowers permissively and pushes the whole text into
     `lowerCtx.unspellable` (`:822`);
     `isUnspellableTextRefusable` (`:1651`) declines any text containing `{` or
     `}`, so `theta/load/params-type-not-expression` (`params.ts:266–279`)
     never fires. In parallel `parseTypeExpression` (`params.ts:212`,
     `type-grammar.ts:226`) tokenises the same text with a type tokeniser that
     has no unterminated-literal refusal, and the resulting object node spells
     no closing brace, so the raw-key gate (`type-grammar.ts:1057`) and the
     identifier gate (`:1021`) both withhold. The two outcomes compound: no
     diagnostic, and no field.
- **Related:**
  - [0229](./0229-escaped-quote-wire-name-drops-inline-field.md) — **fixed
    (0.182.0)**, the origin. Its `## Fix (0.182.0)` *Residuals* item 1 records
    this class as a bound of the route it took ("the unterminated-literal
    keyless entry still drops silently at `params:`") and declines route §Fix
    (b), which would have covered it. **Not a duplicate:** 0229 is closed on
    the escaped-quote spelling `{a as "w\"x": integer}`, which now refuses at
    every position including `params:`; this report claims the spelling whose
    literal never closes. One statement of that record is narrowed here: the
    residual attributes the params: silence to an entry that "spells no key",
    and measurement shows the entry loop is never reached at all — the hoist
    intercept declines the whole source first (§Actual behaviour).
  - [0176](./0176-quoted-inline-field-key-admitted-and-lowered-verbatim.md) —
    **fixed (0.161.0)**, and one of the rows this class withholds:
    `{"q": integer, y as "w: integer}` draws nothing where `{"q": integer}`
    draws `theta/parse/quoted-inline-field-name` (§Reproduction D).
  - [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md) —
    **fixed (0.179.0)**, the raw-capture change and the fourth raw-key row
    `theta/parse/inline-field-name-not-identifier`. Measured here: that row
    does NOT catch this class at any position, because the interior yields no
    key list at all once the closing brace is unspelled.
  - [0160](./0160-inline-object-wire-name-rename-unparsed.md) — **fixed
    (0.172.0)**, the rename row whose input set this spelling sits outside.
  - [0059](./0059-params-scalar-nontype-text-recorded-and-permissive.md) — the brace
    exemption in `isUnspellableTextRefusable` that keeps the fall-through
    silent, and the normative statement of it.
- **Affected** (every citation verified at HEAD `4c157bcc`, v0.183.0):
  - **The intercept predicate** — `src/parser/params.ts:1401`
    (`isSingleEnclosingBraceGroup`), **the defect site**: `:1406` the `quote`
    state, `:1409–1416` the in-quote branch (escape-aware since 0.182.0's
    sibling work, but with no unterminated-literal arm), `:1417–1420` the quote
    open, `:1421–1428` the brace depth and the single-group return, `:1430` the
    `false` this class takes. Call sites: `params.ts:1770`
    (`lowerParamsFieldType`, `:1761`), `src/parser/body-type-lowering.ts:318`
    and `:621`.
  - **The silent fall-through at `params:`** — `src/parser/params.ts:1773`
    (`lowerBraceGroupUnionArms`, declines), `:1777` the `lowerTypeExpr` return,
    `:822` the `unspellable` push, `:1651` (`isUnspellableTextRefusable`) whose
    `!text.includes("{") && !text.includes("}")` declines the text, `:254` the
    filter over it and `:266–279` the withheld
    `theta/load/params-type-not-expression` emission.
  - **The type-grammar pass at the same position** — `src/parser/params.ts:212`
    (the `parseTypeExpression` call), `src/parser/type-grammar.ts:226`
    (`parseTypeExpression`; `:232` the type tokenisation, which raises no
    lexical diagnostic), `:748` (`closingBraceSpelled`), `:1021` the identifier
    rules' gate and `:1057` the four raw-key rows' gate, `:1058`
    (`inlineObjectFieldKeys` call) and `:776–790` the key loop.
  - **The entry loops that are never reached for this class** —
    `src/parser/params.ts:1259` (`hoistInlineObjectType`; the colon skip at
    `:1267–1270`, the `required.length === 0` bare-`{}` arm at `:1281–1283`) and
    `src/parser/body-type-lowering.ts:173` (`lowerInlineObject`, the skip at
    `:183–186`). Called directly on the interior, `lowerInlineObject` drops the
    offending entry alone and keeps `b` (§Reproduction C row C6) — the params:
    path never gets that far.
  - **The lexer that refuses the same text everywhere else** —
    `src/lexer/lexer.ts:522` (the unclosed-scan branch), `:529`
    (`theta/parse/literal-newline-in-string`, the arm all eight lexed positions
    take) and `:537` (`theta/parse/unterminated-string`, the EOF arm).
  - **The normative prose** — `docs/spec_topics/lexical.md:26`: string
    literals are "**Single-line only**", a literal newline inside one is
    `theta/parse/literal-newline-in-string`, and "EOF inside an unterminated
    string literal is `theta/parse/unterminated-string`";
    `docs/spec_topics/grammar.md:109` (an inline object's fields carry
    object-schema field semantics and each is required by default);
    `docs/spec_topics/schema-subset.md:78` (`properties` over the wire names,
    `required` carrying every one of them);
    `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (the `params:`
    type side, including the brace exemption and its named examples
    `{junk}` and the unterminated `{a: string`).
  - **The registry rows** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:13`
    (`literal-newline-in-string`), `:14` (`unterminated-string`),
    `docs/spec_topics/diagnostics/code-registry-load.md:19`
    (`params-type-not-expression`, whose *Trigger* states the brace exemption
    and names the unterminated `p: '{a: string'` as admitted), and the four
    raw-key rows at `code-registry-parse.md:98`, `:99`, `:100`, `:101`, each
    of whose *Triggers* states the closing-`}` requirement this class defeats.
    Mirrors: `docs/reference/diagnostics.md:59`, `:60`.
  - **The locks** — `tests/escaped-quote-inline-field-name-refusal.test.ts`
    (0229's witness, 12 tests, 33 inventory cells, its header recording this
    class as a bound at `:42–50`),
    `tests/inline-object-quoted-field-name-refusal.test.ts` (0176's 16 tests),
    `tests/params-inline-object-lowering.test.ts` (0035/0039's 37-cell
    `params:` byte freeze), `tests/inline-object-wire-name-rename-refusal.test.ts`
    (25), `tests/inline-object-field-name-case.test.ts` (43) and
    `tests/committed-fixture-parse-gate.test.ts`. All green at HEAD (133
    passed across the first five).
- **Observed at:** v0.183.0 (`4c157bcc`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns. Four scratch vitest probes
  (written, run, deleted; tree swept) driving the real `parseThetaDocument`
  through `tests/helpers/e2e-s1.ts`'s `parseDoc`, plus direct
  `lowerParamsFieldType`, `lowerQueryResponseSchema`, `lowerInlineObject`,
  `parseTypeExpression`, `splitTopLevel`, `topLevelColon`,
  `isSingleEnclosingBraceGroup` and `isUnspellableTextRefusable` calls. Every
  value below is that run's output verbatim. `src/`, `tests/`, other bug
  documents and `docs/bugs/README.md` are unmodified by this filing.

## Summary

A string literal in theta is single-line and must close (`lexical.md:26`).
Write an inline object type whose wire-name literal never closes —
`{a as "w\": integer}`, the spelling 0229's fix recorded as a residual, or the
plainer `{a as "w: integer}` — and every position that lexes theta source
refuses it: eight of the eleven `Type` positions draw
`theta/parse/literal-newline-in-string` and the theta does not register. At
`params:` the type half is a YAML scalar that reaches no theta lexer, and the
two passes that do read it are both silent. The document reports `[]` and the
theta registers with `p` lowered to `{}` — a parameter that accepts any JSON.

The loss is wider than one entry. Because `isSingleEnclosingBraceGroup`
(`params.ts:1401`) reads the author's closing `}` as literal text inside the
unclosed quote, the source is not a single brace group at all, so the
inline-object hoist is never entered and no field of the interior is lowered:
`{a as "w: integer, b: integer}` and `{b: integer, a as "w: integer}` both
lower `p` to `{}`, where `{b: integer}` lowers to a `$ref` on
`__inline_8cc8cb1e7074a3af` carrying `b`. A well-formed field is deleted
because a sibling's quote is unbalanced.

The same unspelled closing brace withholds the interior's own rules.
`{x: integer, x: integer}` draws `theta/parse/duplicate-inline-field-name`;
append `, y as "w: integer}` and the whole interior draws nothing. The same
holds for `theta/parse/quoted-inline-field-name` and for the identifier rules
(`theta/parse/binding-case-mismatch`). One unterminated literal suppresses
every inline judgement over the interior it sits in.

Nothing else on the `params:` path compensates. `lowerTypeExpr` pushes the text
into `lowerCtx.unspellable` (`params.ts:822`), and
`isUnspellableTextRefusable` (`:1651`) declines any text carrying a brace, so
`theta/load/params-type-not-expression` does not fire — the exemption that
correctly admits the genuinely unbalanced `{a: string`
(`frontmatter-fields-a.md:58`) also admits a source whose braces the author DID
balance.

## Reproduction

All at HEAD `4c157bcc`. `diagnostics` is the whole unfiltered list. Every
fixture carries `mode: prompt`; body fixtures end `let a = 1` + `a`. `params:`
fixtures write the type as a single-quoted YAML scalar (single quotes doubled),
so the interior double quote and any backslash reach the theta type grammar
intact.

### (A) Every lexed position refuses; `params:` does not

`U1` is `{a as "w\": integer}` (0229 residual 1's spelling); `U2` is
`{a as "w: integer}`; `CTL` is `{a as "w\"x": integer}`, the spelling 0229's fix
closed. `U1` and `U2` measure identically at every row.

| # | position | source | `U1` / `U2` diagnostics | `CTL` diagnostics |
|---|---|---|---|---|
| A1 | query annotation | `let r = @<T>` + `` `hi` `` | `error theta/parse/literal-newline-in-string` | `error theta/parse/renamed-inline-field-name` |
| A2 | `let` annotation | `let x: T = 1` | `error theta/parse/let-without-initialiser`, `error theta/parse/literal-newline-in-string` | `error theta/parse/renamed-inline-field-name` |
| A3 | `schema` body field | `schema S { p: T }` | `error theta/parse/literal-newline-in-string` | same one line |
| A4 | `fn` parameter | `fn f(p: T) { 1 }` | `error theta/parse/fn-param-list-unclosed`, `error theta/parse/literal-newline-in-string` | same one line |
| A5 | `fn` return | `fn f(): T { 1 }` | `error theta/parse/literal-newline-in-string` | same one line |
| A6 | nested body | `let r = @<{q: T}>` + `` `hi` `` | `error theta/parse/literal-newline-in-string` | same one line |
| A7 | generic argument | `let r = @<array<T>>` + `` `hi` `` | `error theta/parse/literal-newline-in-string` | `[]` (the withheld gate, `type-grammar.ts:1057`) |
| A8 | `.thetalib` `fn` parameter | `fn f(p: T) { 1 }` in `s.thetalib` | `error theta/parse/fn-param-list-unclosed`, `error theta/parse/literal-newline-in-string` | rename line + two `thetalib-top-level-statement` |
| A9 | `params:` | `params:` → `p: 'T'` | **`[]`** | `error theta/parse/renamed-inline-field-name: wire-name rename on field 'a' within one inline object type` |

Row A9's `frontmatter.params.loweredSchema` for `U1` and `U2`:
`{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}`.
For `CTL`: `null` (refused, never lowered).

### (B) At `params:`, a well-formed sibling field is dropped too

All rows: `doc.diagnostics` is `[]` and the theta registers.

| # | `params:` → `p: 'T'` | `loweredSchema.properties.p` |
|---|---|---|
| B1 | `{a as "w\": integer}` | `{}` |
| B2 | `{a as "w: integer, b: integer}` | `{}` |
| B3 | `{b: integer, a as "w: integer}` | `{}` |
| B4 | `{"w: integer}` | `{}` |
| B5 | `{a as 'w: integer}` | `{}` |
| B6 | `{q: {a as "w: integer}}` | `{}` |
| B7 | `array<{a as "w: integer}>` | `{"type":"array","items":{}}` |
| B8 | control `{b: integer}` | `{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}`, that member carrying `b` |
| B9 | control `{a as "w\"x": integer}` | not lowered — the document is refused (row A9) |

B2 and B3 against B8 are the field-loss claim: two sources declaring `b` and
one declaring `b` alone, and only the last mints it.

### (C) The mechanism, measured directly

`isSingleEnclosingBraceGroup(s)`, `splitTopLevel(interior, ",", "angle-and-brace")`,
`topLevelColon` per segment, `lowerParamsFieldType(s, ctx)` with a live
`unspellable` sink, and `lowerInlineObject(interior, new Map())`.

| # | source | single brace group | segments | colons | `lowerParamsFieldType` | `unspellable` after filter | `lowerInlineObject(interior)` |
|---|---|---|---|---|---|---|---|
| C1 | `{a as "w\": integer}` | `false` | 1 | `[-1]` | `{}` | `[]` (declined) | `{"type":"object","properties":{},"required":[],"additionalProperties":false}` |
| C2 | `{a as "w: integer}` | `false` | 1 | `[-1]` | `{}` | `[]` | same as C1 |
| C3 | `{"w: integer}` | `false` | 1 | `[-1]` | `{}` | `[]` | same as C1 |
| C4 | `{a as "w: integer, b: integer}` | `false` | 1 | `[-1]` | `{}` | `[]` | same as C1 |
| C5 | `{b: integer, a as "w: integer}` | `false` | 2 | `[1,-1]` | `{}` | `[]` | `properties {"b":{"type":"integer"}}`, `required ["b"]` |
| C6 | `{a as "w\"x": integer}` | `true` | 1 | `[11]` | `{"$ref":"#/$defs/__inline_68a87e995fbc02c1"}` | `[]` | the property `a as "w\"x"`, required |
| C7 | `{b: integer}` | `true` | 1 | `[1]` | `{"$ref":"#/$defs/__inline_8cc8cb1e7074a3af"}` | `[]` | `b`, required |

The `unspellable` sink is non-empty for C1–C5 — it holds the whole source text —
and empties under `isUnspellableTextRefusable`'s brace exemption, which is why
no `theta/load/params-type-not-expression` is raised. C5 is the sharpest cell:
the split and the colon scan both read `b: integer` correctly, and the field is
still lost, because the intercept that would consume those segments is never
entered.

### (D) The unspelled closing brace withholds every inline row

Direct `parseTypeExpression(T, "schema-feeding", site)` — the pass `params:`
runs at `params.ts:212` — reporting codes.

| # | source | codes |
|---|---|---|
| D1 | `{x: integer, x: integer}` | `theta/parse/duplicate-inline-field-name` |
| D2 | `{x: integer, x: integer, y as "w: integer}` | `[]` |
| D3 | `{"q": integer}` | `theta/parse/quoted-inline-field-name` |
| D4 | `{"q": integer, y as "w: integer}` | `[]` |
| D5 | `{X: integer}` | `theta/parse/binding-case-mismatch` |
| D6 | `{X: integer, y as "w: integer}` | `[]` |
| D7 | `{}` | `theta/parse/empty-schema-body` |
| D8 | `{a as "w: integer}` | `[]` |

D8 also settles the 0228 question: `theta/parse/inline-field-name-not-identifier`
does not catch this class, because the interior contributes no key list at all.

### (E) The boundary: what `params:` does refuse

| # | `params:` → `p: 'T'` | diagnostics | `properties.p` |
|---|---|---|---|
| E1 | `???` | `error theta/load/params-type-not-expression` | not lowered |
| E2 | `{a: integer` (no closing brace) | `[]` | `{}` |

E1 shows the text stage works at this position. E2 is the genuinely unbalanced
spelling the brace exemption names normatively
(`frontmatter-fields-a.md:58`, `code-registry-load.md:19`) and is NOT claimed
here; this report's inputs close their braces in source.

### (F) The committed corpus — the GOV-15 baseline

`git ls-files -- '*.theta' '*.thetalib'` → 34 files. No line in any of them
carries an odd number of `"` characters, so no committed source carries an
unterminated string literal and none is in this class's input set. A refusal
here takes no new refusal in `tests/committed-fixture-parse-gate.test.ts`.

## Expected behaviour

`docs/spec_topics/lexical.md:26` makes a string literal single-line and
requires it to close: a literal newline inside one is
`theta/parse/literal-newline-in-string` and EOF inside one is
`theta/parse/unterminated-string`. Text carrying an unterminated literal
therefore derives from no production of the type grammar at any position, and
the eight lexed positions of §Reproduction (A) report exactly that. A `params:`
field's type half is parsed by the same type grammar
(`frontmatter-fields-a.md:58`: "the same grammar used in every other
type-annotation position"), so row A9 should refuse the field and withhold the
lowered schema, as row A9's `CTL` column already does for a spelling refused on
different grounds.

Whatever answers the diagnostic, the artefact must not lose fields the author
declared. `docs/spec_topics/schema-subset.md:78` lowers an object to
`properties` over the wire names with `required` carrying every one of them, and
`grammar.md:109` makes each inline field required by default. Rows B1–B7 are
neither refusal nor faithful lowering: B2 and B3 declare `b` and mint nothing,
and B1 registers a parameter whose declared one-field object accepts any JSON
value.

The interior's own rules are not optional either. The four raw-key rows'
closing-`}` gate (`code-registry-parse.md:98`, `:99`, `:100`, `:101`) exists for
an interior the author never closed; rows D2, D4 and D6 write a closing `}` and
still lose the row a sibling key earns (D1, D3, D5).

The brace exemption's stated subject is unchanged: row E2's `{a: integer` is
named normatively as admitted with a permissive lowering, and no expectation
here moves it.

## Actual behaviour / root cause

**The quote latch turns a closed brace group into an unbalanced one.**
`isSingleEnclosingBraceGroup` (`src/parser/params.ts:1401`) requires the source
to start `{`, end `}`, and reach depth 0 exactly at the final character
(`:1421–1428`). It skips quoted regions, consuming a backslash and the
character behind it inside one (`:1409–1416`) — but it has no arm for a region
that never closes. In `{a as "w: integer}` the region opens at `"` and runs to
the end of the string, so the final `}` is counted as literal text, depth never
returns to 0, and the predicate returns `false` (`:1430`). The author's braces
balance; the predicate's do not.

**The intercept the predicate gates is where the fields would be lowered.**
`lowerParamsFieldType` (`:1761`) tries the literal sublanguage, then this
predicate (`:1770`), then the brace-group union arms (`:1773`), then
`lowerTypeExpr` (`:1777`). With the predicate false and no `|` in the source,
the third and fourth steps run: `lowerBraceGroupUnionArms` declines and
`lowerTypeExpr` reaches its catch-all, returning `{}` and pushing the whole
source into `lowerCtx.unspellable` (`:822`). `hoistInlineObjectType` (`:1259`)
is never called, which is why the entry loop's own skip (`:1267–1270`) and its
bare-`{}` arm (`:1281–1283`) are not this class's site — §Reproduction C row C5
shows the split and the colon scan producing the correct two segments for text
that is never handed to them. It also explains why a well-formed sibling is
lost: field lowering happens per entry INSIDE the intercept, so declining the
whole source declines every field.

**The refusal that would report the fall-through declines brace-carrying
text.** `parseParams` filters the sink through `isUnspellableTextRefusable`
(`:254`, predicate at `:1651`), which returns `false` for any text containing
`{` or `}` — the brace-frame exemption bug 0059 landed, stated normatively at
`frontmatter-fields-a.md:58` and `code-registry-load.md:19`. Every source in
this class carries braces, so the filtered list is empty (§Reproduction C) and
`theta/load/params-type-not-expression` (`:266–279`) is withheld. The exemption
is correct on its named subject — `{junk}`, the unbalanced `{a: string` — and
over-broad here only because the intercept it defers to declined.

**The parallel type-grammar pass has no lexical refusal to contribute.**
`parseTypeExpression` (`params.ts:212`, `type-grammar.ts:226`) tokenises the
type text with the type tokeniser (`:232`), which raises no diagnostic for an
unterminated literal; the theta lexer's two arms (`lexer.ts:529`, `:537`) are
never reached, because a `params:` scalar's recovered text is not lexed as
theta source. The unterminated literal token then swallows the closing `}`, so
`closingBraceSpelled` (`type-grammar.ts:748`) is false and both interior gates
withhold — the identifier rules at `:1021` and the four raw-key rows at
`:1057`. That is §Reproduction (D): the interior loses its own rules for the
whole object, not only for the offending entry.

**The eight lexed positions are loud for a different reason.** There the type
text is part of theta source, the lexer's unclosed-scan branch (`lexer.ts:522`)
sees a newline behind the unterminated literal and raises
`theta/parse/literal-newline-in-string` (`:529`), and the document is refused
before any of the above matters. `params:` is the only measured position where
the text reaches a lowering without first reaching a lexer.

## Why it matters

- **A declared parameter contract is replaced by "any JSON" with nothing on any
  channel.** Row A9 reports `[]`; row B1 lowers `p` to `{}`. The binder
  validates invocation arguments against these bytes, so the AJV safety net
  admits every payload for a field the author constrained.
- **A well-formed field is deleted because a sibling's quote is unbalanced.**
  Rows B2 and B3 against B8: two sources declaring `b` mint no `b` at all, and
  the lowered bytes are indistinguishable from a source that declared nothing.
- **Three landed refusals stop applying to the interior.** Rows D2, D4 and D6
  lose `duplicate-inline-field-name`, `quoted-inline-field-name` and
  `binding-case-mismatch` respectively, so one unterminated literal is a
  general suppressor over the interior it sits in rather than a defect confined
  to its own entry.
- **The same input is refused at eight positions and admitted at the ninth.**
  §Reproduction (A) makes the disposition depend on the position rather than on
  the text, against `frontmatter-fields-a.md:58`'s statement that the `params:`
  type half is parsed by the same grammar as every other annotation position.
- **The corpus is clean, so closing it costs no committed source.**
  §Reproduction (F): no committed `.theta` / `.thetalib` line carries an odd
  number of `"`, so GOV-15's disposition is the addition arm of the
  diagnostic-registry carve-out
  (`docs/spec_topics/governance/source-language-stability.md:25`) over an
  in-repo input set that is empty.

## Non-goals

- **The brace exemption's named subject.** `{junk}` and the genuinely
  unbalanced `{a: string` are admitted with a permissive lowering by normative
  statement (`frontmatter-fields-a.md:58`, `code-registry-load.md:19`;
  §Reproduction E row E2). This report claims text whose braces balance in
  source, and no route may move E2's disposition without editing that prose in
  the same commit.
- **The raw-key adjudication.** That an inline field's key is the raw pre-colon
  text after `trim()`, unquoted and unnormalised, is LANDED LAW (bug 0159's
  route (a), restated in all four *Triggers* at `code-registry-parse.md:98`,
  `:99`, `:100`, `:101`, and relied on by the agreement between the rows' keys
  and the property names both lowerers mint). No fix here re-opens it.
- **Wire-name semantics inline.** Bug 0160 settled that inline `as "WireName"`
  is refused rather than parsed, and bug 0229 extended the refusal to the
  escaped spelling. This report claims the unterminated spelling's disposition,
  not a lowering keyed on a wire name.
- **`topLevelColonIndex` (`src/parser/type-layer-checks.ts`).** 0229's
  *Residuals* item 2 owns that scanner's quote-blindness. Not measured here.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/params.ts` and `src/parser/type-grammar.ts`; that is
  [0134](./0134-params-shift-induced-stale-citations.md)'s adjudicated
  do-not-chase class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one and
states its choice.

**Constraint 1 — the raw-key adjudication is landed law and is not re-opened.**
The key stays the entry's raw pre-colon text after `trim()`, and the rows' keys
stay the property names both lowerers mint (bug 0159 route (a);
`code-registry-parse.md:98`–`:101`). Whatever a route changes, `'a'`, `"a"` and
`a` remain three keys.

**Constraint 2 — the brace exemption's named subject does not move silently.**
`frontmatter-fields-a.md:58` and `code-registry-load.md:19` both name `{junk}`
and the unterminated-brace `{a: string` as admitted with a permissive
lowering. A route that narrows `isUnspellableTextRefusable` must state row E2's
disposition explicitly and correct both prose sites in the same commit if it
changes.

**Constraint 3 — the eight lexed positions keep their current codes and
counts.** §Reproduction (A) rows A1–A8 refuse today, some with a second
recovery diagnostic. A route must state that each row's ordered code sequence
is unchanged, or name the change as intended.

**Constraint 4 — the LOCKS.** Green at HEAD:
`tests/escaped-quote-inline-field-name-refusal.test.ts` (0229's witness, 12
tests, **33** inventory cells, whose header at `:42–50` records this class as a
bound of that route and must be corrected in the same change),
`tests/inline-object-quoted-field-name-refusal.test.ts` (**16** tests, bug
0176), `tests/params-inline-object-lowering.test.ts` (**37** cells, bugs
0035/0039's `params:` byte freeze),
`tests/inline-object-wire-name-rename-refusal.test.ts` (25, bug 0160),
`tests/inline-object-field-name-case.test.ts` (43, bug 0154) and
`tests/committed-fixture-parse-gate.test.ts`. A route that refuses at `params:`
withholds the lowered schema for the refused document, so the byte freeze holds
by construction — the run states that by hash rather than assuming it.

**(a) Unterminated-literal detection.** Refuse a type source whose string
literal never closes, at the position that reads it. The registry already
carries both codes — `theta/parse/literal-newline-in-string`
(`code-registry-parse.md:13`) and `theta/parse/unterminated-string` (`:14`,
the EOF arm, which is what a `params:` scalar's recovered text hits) — so this
route may mint no row at all, and the run must state which code the position
raises and why, plus the *Trigger* edit (DIAG-2) that brings a `lex`-phase row
into a `params:` load-time position. It must also state whether the detection
lives in the type tokeniser (`type-grammar.ts:232`, which would answer every
caller of `parseTypeExpression` at once) or in the `params:` type-half stage
alone, and what the eight lexed positions then report (Constraint 3): a
detection in the shared tokeniser risks a second diagnostic beside the lexer's
at those positions, against the one-diagnostic-per-offending-field precedence
`code-registry-load.md:19` states.

**(b) Refuse the keyless entry / narrow the brace exemption.** Leave the
lexical question alone and make the fall-through loud: either narrow
`isUnspellableTextRefusable` (`params.ts:1651`) so a brace-carrying fragment
whose brace group does not close under the quote-aware scan is refusable, or
raise `theta/load/params-type-not-expression` from the intercept's decline
directly. This mints no new row and reuses the position's own registered
refusal, but it touches a predicate four call sites read (`params.ts:254`,
`theta-document.ts:7069` and `:7536`, `type-layer-checks.ts:1148`), covering
the `params:` field type, a `schema` alias right-hand side, a `schema` body
field type, an `@<T>` query ascription, a `let` annotation and an `fn`
parameter / return type, so the run
must enumerate what each of them newly refuses, and it must dispose of row E2
under Constraint 2.

Either route must state the disposition of §Reproduction (D): whether the
interior's four raw-key rows and the identifier rules stay withheld for a
refused source (one diagnostic per field, the likely reading) or start
reporting.

**Registry (DIAG-2).** Whatever route settles lands in the same commit as the
code (`diagnostic-shape.md:72`) with `docs/reference/diagnostics.md` in
lock-step. No *Message* is reworded (DIAG-4).

**Witness obligations.** A new witness file on the shape of the landed
siblings: whole-list ordered `toEqual` over unfiltered `doc.diagnostics`, every
expected *Message* read through `parseRegistry` / `registryMessage` (DIAG-4),
`parseDoc` from `tests/helpers/e2e-s1.ts`. Minimum rows: every position of
§Reproduction (A) with its `CTL` column; §Reproduction (B)'s nine lowering
cells including B2/B3 against B8; §Reproduction (D)'s six suppression cells;
and §Reproduction (E)'s two boundary cells, E2 asserted UNCHANGED. Both
directions proven: neutralise the new behaviour, confirm the new rows red and
only they, restore and confirm green byte-exact.

**Fix ordering.** Nothing blocks this report from starting. It is 0229's
*Residuals* item 1, so a fix here appends a discharge note to
[0229](./0229-escaped-quote-wire-name-drops-inline-field.md) and corrects that
record's attribution (§Related) plus the bound recorded in its witness header.

## Provenance

- Origin: the bug 0229 fix (0.182.0). Its `## Fix (0.182.0)` *Residuals* item 1
  names this class ("the unterminated-literal keyless entry still drops
  silently at `params:`"), records it as a bound of route §Fix (a) with route
  §Fix (b) declined, and leaves the report to be filed.
- Independently re-measured at HEAD `4c157bcc` (v0.183.0) for this filing, not
  copied: row B1 reproduces 0229's residual verbatim (`[]` and the permissive
  `p`), and every other row is new measurement — the nine positions of (A) with
  their controls, (B)'s nine lowering cells including the multi-field and
  nested/generic spellings, (C)'s seven internal-state cells over
  `isSingleEnclosingBraceGroup` / `splitTopLevel` / `topLevelColon` /
  `lowerParamsFieldType` / `lowerInlineObject` / `isUnspellableTextRefusable`,
  (D)'s eight suppression cells, (E)'s two boundary cells and (F)'s census.
  Four scratch vitest files, run on the outputs quoted above, then deleted and
  the tree swept.
- Corrections by measurement: 0229's *Residuals* item 1 describes this class as
  an entry that "spells no key"; the entry loop is never reached, because the
  hoist intercept declines the whole source first (§Actual behaviour). 0229's
  §Fix (b) rationale states that "an unterminated literal
  (`{a as "w\": integer}`) draws `theta/parse/literal-newline-in-string` from
  the lexer at every lexed position" — confirmed at all eight (§Reproduction
  A) — and the suppression of the interior's own rows at `params:`
  (§Reproduction D) is measured here for the first time.
- Spec: `docs/spec_topics/lexical.md:26`; `docs/spec_topics/grammar.md:109`;
  `docs/spec_topics/schema-subset.md:78`;
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:13`, `:14`, `:98`,
  `:99`, `:100`, `:101`;
  `docs/spec_topics/diagnostics/code-registry-load.md:19`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2), `:74`
  (DIAG-4);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:25`
  (diagnostic-registry carve-out). Mirrors: `docs/reference/diagnostics.md:59`,
  `:60`.
- Implementation evidence at `4c157bcc`: `src/parser/params.ts` (`:212`,
  `:254`, `:266–279`, `:822`, `:1259`, `:1267–1270`, `:1281–1283`, `:1401`,
  `:1409–1416`, `:1417–1420`, `:1421–1430`, `:1651`, `:1761–1777`, `:1790`);
  `src/parser/type-grammar.ts` (`:226`, `:232`, `:748`, `:776–790`, `:1021`,
  `:1057`, `:1058`); `src/parser/body-type-lowering.ts` (`:173`, `:183–186`,
  `:318`, `:621`); `src/lexer/lexer.ts` (`:522`, `:529`, `:537`);
  `src/parser/theta-document.ts:7069`, `:7536`;
  `src/parser/type-layer-checks.ts:1148`.
- Test evidence at `4c157bcc`:
  `tests/escaped-quote-inline-field-name-refusal.test.ts` (`:42–50` the header
  recording this class as a bound; 12 tests, 33 inventory cells, green),
  `tests/inline-object-quoted-field-name-refusal.test.ts` (16, green),
  `tests/params-inline-object-lowering.test.ts` (37, green),
  `tests/inline-object-wire-name-rename-refusal.test.ts` (25, green),
  `tests/inline-object-field-name-case.test.ts` (43, green),
  `tests/committed-fixture-parse-gate.test.ts`.
