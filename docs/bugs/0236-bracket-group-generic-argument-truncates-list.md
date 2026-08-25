# Bug 0236 — `TypeParser.parsePrimary` skips the `[` of a bracket group as unexpected punctuation (`type-grammar.ts:606–608`) and never leaves it, so the ENCLOSING generic application loses every argument behind the group: `Result<enum["a", "b"], string>` draws `theta/parse/generic-arity-mismatch` "got 1" for a two-argument spelling, `array<enum["a", "b"], string>` draws NOTHING and registers at the `fn` parameter, `fn` return, `let` and query positions where `array<{a: integer}, string>` is refused for arity, and `Result<enum["a", "b"], void>` loses its own `theta/parse/void-in-non-return-position`

- **Status:** fixed (0.214.0) — §Fix route (a) Route 1 landed; see
  §Fix (0.214.0). Filed with §Fix constraint-pinned, not settled: two routes with
  their measured costs, the choice left to the run because the recovery point
  is in the one type parser every `Type` position shares and because bug
  [0217](./0217-nested-inline-enum-in-generic-argument-draws-nothing.md)'s
  landed lowering-side treatment already owns the same construct at the
  schema-feeding positions. **Ordering:** no report blocks this one. Bug
  [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md) is fixed
  (0.189.0) and its `skipMalformedEntry()` resync never reaches this class; bug
  [0235](./0235-malformed-inline-field-truncates-generic-argument-list.md) is
  discharged by that landing and hands this class over (§Provenance).
- **Sev/Diff estimate:** S1/D3 — S1 because a registered refusal does not fire
  on input its own row names and the theta registers:
  `array<enum["a", "b"], string>` and `array<enum["a", "b"], string, integer>`
  apply an arity-1 constructor to two and three written arguments and draw `[]`
  at the `fn` parameter, `fn` return and query-annotation positions
  (§Reproduction (b) rows b1, b3, b5, b7), where the byte-neighbour
  `array<{a: integer}, string>` draws
  `theta/parse/generic-arity-mismatch` at every one of them; and
  `Result<enum["a", "b"], void>` loses the
  `theta/parse/void-in-non-return-position` its neighbour
  `Result<{a: integer}, void>` draws (§Reproduction (c)). The reported-count
  face is S2 on its own: `got 1` is emitted for two, three and
  two-plus-trailing-comma written arguments (rows a1, a2, a9). D3 because the
  recovery point is `parsePrimary`'s tolerant punctuation skip, reached from
  every `Type` position and from four productions (`parseUnion`, `parseGeneric`,
  `parseObject`'s field types, `parse()`), the fix adjudicates between three
  argument counters that disagree for this class (parser 1, angle split 3,
  `"angle-and-brace"` peel 3 — §Actual behaviour), and it must leave bug 0217's
  cut-bracket-group refusal and every lowered byte unmoved.
- **Kind:** defect — implementation, one recovery point, three consequences.
  1. **The count is wrong.** `parsePrimary` (`src/parser/type-grammar.ts:585`)
     has no arm for `[`: the token falls to "Unexpected punctuation: skip it to
     stay tolerant" (`:606–608`), which consumes one token and recurses, so the
     group's contents are read as ordinary type tokens and its interior commas
     are consumed as ARGUMENT separators by `parseGeneric`'s loop
     (`:642`) — until the group's `]`, also skipped, is followed by tokens the
     loop stops on. `parseGeneric` returns with one argument recorded and
     `walkType`'s generic arm reports `node.args.length` verbatim
     (`:1020–:1029`), so `Result<enum["a", "b"], string>` draws "expects 2 type
     argument(s); got 1" (§Reproduction (a)).
  2. **A registered arity refusal is lost.** The same truncation makes an
     over-applied `array` count as one argument, which MATCHES its declared
     arity, so `array<enum["a", "b"], string>` draws nothing and registers at
     the four positions that carry no lowering-side refusal —
     `fn` parameter, `fn` return, `let` annotation and query annotation
     (§Reproduction (b)). At the three schema-feeding positions (`schema` field
     type, alias arm, `params:`) the input is refused, by bug 0217's
     `theta/parse/schema-type-not-expression` /
     `theta/load/params-type-not-expression` and not by the arity row.
  3. **The dropped arguments' subtrees are never walked.** `walkType` descends
     `node.args` alone (`:1045–:1047`), and the truncated arguments are not in
     that list, so every rule they would draw is withheld:
     `Result<enum["a", "b"], void>` draws the arity line alone where
     `Result<{a: integer}, void>` draws
     `theta/parse/void-in-non-return-position` (§Reproduction (c)).
- **Related:**
  - [0235](./0235-malformed-inline-field-truncates-generic-argument-list.md) —
    **fixed (0.189.0), discharged**, the origin. It filed the same three
    consequences for the INLINE-OBJECT carrier (`Result<{a b: integer},
    string>`), whose recovery point is `parseObject`'s malformed-field break;
    bug 0231's landed `skipMalformedEntry()` closed every row it cited. Its
    §Reproduction row f4 measured this class and its §Non-goals and §Fix (c)
    disagreed about whose it was. That contradiction is resolved here: **this
    report owns the bracket-group carrier**, at every position and for both
    constructors. 0235 owns nothing that remains open.
  - [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md) —
    **fixed (0.189.0)**. Its `skipMalformedEntry()` (`type-grammar.ts:790`)
    resynchronises `parseObject`'s FIELD loop at the next depth-0 comma and
    stops without consuming a depth-0 `}` or `>`. It is not reached by this
    class: no field loop runs for `Result<enum["a", "b"], string>`, and the
    skip tracks `{`/`<` depth only, so a `[` opens nothing it counts. Its
    64-cell witness `tests/inline-object-malformed-entry-resync.test.ts`
    (`TOTAL_LIST_CELLS` at `:628`) is a lock here.
  - [0233](./0233-generic-argument-inline-field-key-rules-withheld.md) —
    **fixed (0.196.0)**, which widened the four inline raw-key rules into
    generic arguments. It is why `let x: Result<{a b: integer}, string> = 1`
    now draws `theta/parse/inline-field-name-not-identifier` and no arity line
    (§Reproduction (d) row d5) — a shift since 0235's discharge measurement.
    It moves nothing on this report's class: a bracket group carries no inline
    object key. Its 76-cell witness
    `tests/generic-argument-inline-field-key-rules.test.ts`
    (`TOTAL_LIST_CELLS` at `:575`) is a lock here.
  - [0217](./0217-nested-inline-enum-in-generic-argument-draws-nothing.md) —
    **fixed (0.148.0)**, which owns the same construct on the LOWERING side:
    `findCutBracketGroupText` (`src/parser/params.ts:1120`) recovers the source
    text of a bracket group the angle-only argument split cut, and §Fix (b)(2)
    pushes it into `theta/parse/schema-type-not-expression`'s sink once, which
    is why rows b4, b6 and b8 of §Reproduction (b) are refused. That treatment
    is confined to the three schema-feeding positions and to the refusal sink;
    it computes no argument count and reaches no `fn`, `let` or query position.
    Its witness `tests/nested-inline-enum-generic-argument-refusal.test.ts` is
    a lock here.
  - [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) —
    **fixed (0.139.0)**, the second counter: `lowerTypeExpr`'s generic arm
    splits on angle depth alone (`params.ts:713`), kept angle-only by its
    §Fix (b)(3). For this class the split answers three where the parser
    answers one, so `array<enum["a", "b"], string>` lowers to the permissive
    `{}` (§Reproduction (e)) — measured GROUND, not a claim of this report.
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, which settled `walkType`'s emission sequence and whose
    `tests/type-grammar.test.ts` group `V2a-T` (`:48–:83`) is the pinned arity
    and `void` witness both faces move against.
  - [0162](./0162-inline-enum-trigger-misses-params-position.md) — **open**,
    which owns `theta/parse/inline-enum`'s trigger set. That row is anchored at
    the START of a schema field type or alias arm
    (`code-registry-parse.md:113`) and never fires one level down inside a
    generic argument; nothing here changes which positions raise it.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    do-not-chase class for the positional drift any fix here induces in
    `src/parser/type-grammar.ts` citations.
- **Affected** (cited by symbol; every line number verified at HEAD
  `30c0cb67`, 0.197.0, and subject to 0134's drift class):
  - **The recovery point** — `src/parser/type-grammar.ts`: `parsePrimary`
    (`:585`), its `punct` arm (`:594`) with a branch for `-` (`:595–:602`) and
    for `{` (`:603–:605`, `return this.parseObject()`) and no branch for `[`;
    the fall-through skip (`:606–:608`, comment "Unexpected punctuation: skip
    it to stay tolerant") that consumes one token and recurses.
  - **The count** — `parseGeneric` (`:634`), its `this.eatPunct("<")` (`:635`),
    argument loop `while (this.eatPunct(","))` (`:642`) and closing
    `this.eatPunct(">")` (`:649`); `GENERIC_ARITY` (`:451`, `array` 1 /
    `Result` 2); `walkType` (`:992`) and the generic arm's emission over
    `node.args.length` (`:1020–:1029`), with `result-in-schema-position` beside
    it (`:1030–:1039`).
  - **The unwalked tail** — the argument descent `for (const arg of node.args)`
    (`:1045–:1047`), the only route by which an argument's own subtree is
    judged.
  - **The recovery that does NOT cover this class** — `skipMalformedEntry`
    (`:790`), bug 0231's resync, whose depth counter tracks `{`/`<` and `}`/`>`
    only (`:801–:804`); `interiorClosingBraceIndex` (`:475`), the independent
    brace scan, likewise bracket-blind.
  - **The second counter** — `src/parser/params.ts`: `lowerTypeExpr`'s generic
    arm and its `splitTopLevel(interior, ",")` (`:713`, angle-only by bug 0204
    §Fix (b)(3)); `findCutBracketGroupText` (`:1120`), bug 0217's recovery of a
    cut bracket group's own source text; `splitTopLevelSegments` (`:1918`) and
    `splitTopLevel` (`:1976`) with its `"angle-and-brace"` mode
    (`TypeSplitNesting`, `:1901`), which tracks `<…>` and `{…}` and not `[…]`.
  - **The third counter, and the comment that claims agreement** —
    `src/parser/theta-document.ts`: `queryResponseAnnotation` (`:6390`) and the
    doc block above it, whose closing sentence states that the
    `"angle-and-brace"` peel "must agree with the parser computing
    `theta/parse/generic-arity-mismatch` about the ARGUMENT COUNT"
    (`:6193–:6195`). Bug 0235's discharge made that sentence true for the
    inline-object carrier; it is FALSE for this class, where the peel counts
    three and `parseGeneric` counts one (§Reproduction (f)).
  - **The registered rows and their prose** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:65`
    (`theta/parse/generic-arity-mismatch`, trigger "A generic-type application
    whose type-argument count does not match the constructor's declared arity
    … e.g. `array<T, U>` or `Result<T>`"); `:104`
    (`theta/parse/schema-type-not-expression`, whose cut-group paragraph states
    bug 0217's last-resort push and the `array<enum["a", "b"], ???>` case);
    `:113` (`theta/parse/inline-enum`, anchored at the start of a schema field
    type or alias arm only); `docs/spec_topics/grammar.md:107`
    (§"Generic-application constructors" — the closed set, the arities, and
    "Applying a constructor with a type-argument count other than its declared
    arity … is `theta/parse/generic-arity-mismatch`");
    `docs/spec_topics/schemas.md:93` ("`enum` is **top-level only** — there is
    no inline `enum["a", "b"]` form", stated with no depth qualifier).
  - **The witness locks** — `tests/type-grammar.test.ts` group `V2a-T`
    (`:48–:83`, bug 0044's arity and `void` cells);
    `tests/inline-object-malformed-entry-resync.test.ts` (bug 0231's 64-cell
    resync witness, `TOTAL_LIST_CELLS` at `:628`);
    `tests/generic-argument-inline-field-key-rules.test.ts` (bug 0233's 76-cell
    generic-argument witness, `TOTAL_LIST_CELLS` at `:575`);
    `tests/nested-inline-enum-generic-argument-refusal.test.ts` (bug 0217's
    five groups, `:472`, `:666`, `:864`, `:957`, `:1055`);
    `tests/generic-argument-shredded-group-refusal.test.ts` and
    `tests/generic-argument-literal-lowering.test.ts` (bug 0204's lowering
    side); `tests/committed-fixture-parse-gate.test.ts`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files and
    `git grep -nE '(array|Result)<[^>]*\['` over them returns zero hits, so no
    committed source moves under either route in §Fix.
- **Observed at:** `0.197.0` (HEAD `30c0cb67`). Offline, deterministic; no live
  model, no provider. Every row through `parseDoc` (`tests/helpers/e2e-s1.ts`)
  driving the shipped `parseThetaDocument`, frontmatter
  `---\nmode: subagent\n---` on lines 1–3 so the source under test sits on
  line 4; the `.thetalib` rows pass `path = "lib.thetalib"` with no
  frontmatter; the `params:` rows pass the whole document verbatim. Diagnostic
  cells are the whole unfiltered `doc.diagnostics` in emission order rendered
  `<severity> <code>: <message>`; "registers" is the house definition (no
  error-severity `theta/parse/` or `theta/load/` code), so a `[]` cell
  registers by construction. Lowerings are
  `lowerQueryResponseSchema(<annotation>, [], [])` and
  `doc.frontmatter.params.loweredSchema` verbatim; argument counts are
  `splitTopLevel` (`src/parser/params.ts:1976`) called directly. One scratch
  vitest file over those entry points, run on the outputs quoted below, then
  deleted.

## Summary

`TypeParser.parsePrimary` recognises five token shapes and skips anything else
one token at a time (`type-grammar.ts:606–608`). `[` is in the skipped set, and
nothing puts the cursor past the group's `]`. Inside a generic application the
group's own top-level commas are therefore read as ARGUMENT separators by
`parseGeneric`'s loop (`:642`), and the application ends with a single argument
recorded: `Result<enum["a", "b"], string>` parses as `Result` applied to one
argument, and `array<enum["a", "b"], string>` likewise.

Two registered rows read that list. The arity row prints its length verbatim
(`:1020–:1029`), so the two-argument `Result` spelling draws "expects 2 type
argument(s); got 1" (§Reproduction (a)). The same truncation silences the row in
the other direction: `array<enum["a", "b"], string>` counts one argument,
matches `array`'s arity, and draws nothing at the `fn` parameter, `fn` return,
`let` and query positions, where `array<{a: integer}, string>` is refused at all
four (§Reproduction (b)). And because `walkType` descends `node.args` alone
(`:1045–:1047`), the dropped arguments are never judged:
`Result<enum["a", "b"], void>` loses the
`theta/parse/void-in-non-return-position` its neighbour draws
(§Reproduction (c)).

The class is the BRACKET as carrier, not `enum`: `Result<[integer], string>`
reports the same false count (row a5). It is also not the inline-object carrier
bug 0235 filed — that one broke `parseObject`'s field loop, and bug 0231's
`skipMalformedEntry()` (`:790`) closed it in 0.189.0. That resync counts `{`
and `<` depth only and runs only inside a field loop, so it never reaches a
bracket group. Bug 0217 treats the same construct at the lowering, recovering
the cut group's source text (`params.ts:1120`) so the three schema-feeding
positions refuse it; that treatment computes no argument count and does not
reach the four positions above.

Three counters exist for one argument list and they disagree. `parseGeneric`
sees one; `lowerTypeExpr`'s angle-only split sees three, which is why row e1
lowers to `{}`; `queryResponseAnnotation`'s `"angle-and-brace"` peel
(`theta-document.ts:6390`) also sees three, and its doc block states that the
mode exists so the peel "must agree with the parser computing
`theta/parse/generic-arity-mismatch` about the ARGUMENT COUNT"
(`:6193–:6195`). For this class it does not (§Reproduction (f)).

## Reproduction

Offline, deterministic, at HEAD `30c0cb67`. Whole unfiltered diagnostic lists in
emission order. `ARITY(n)` abbreviates `error
theta/parse/generic-arity-mismatch: generic type 'Result' expects 2 type
argument(s); got n`; `ARITY-array(n)` the same message with `'array'` and
`expects 1`.

### (a) The reported count, at the `let` annotation

Source is `let x: <F> = 1`.

| # | `<F>` | args written | diagnostics |
|---|---|---|---|
| a1 | `Result<enum["a", "b"], string>` | 2 | `ARITY(1)` |
| a2 | `Result<enum["a", "b"], string, integer>` | 3 | `ARITY(1)` |
| a3 | `Result<enum["a", "b"], void>` | 2 | `ARITY(1)` |
| a4 | `Result<string, enum["a", "b"]>` | 2 | `[]` |
| a5 | `Result<[integer], string>` | 2 | `ARITY(1)` |
| a6 | `Result<{a: enum["x"]}, string>` | 2 | `ARITY(1)` |
| a7 | `Result<enum["a"], string>` | 2 | `ARITY(1)` |
| a8 | `Result<enum["a", "b"] \| integer, string>` | 2 | `ARITY(1)` |
| a9 | `Result<enum["a", "b"], string,>` | 2 + trailing `,` | `ARITY(1)` |
| a10 | `Result<array<enum["a", "b"]>, string>` | 2 | `ARITY(1)` |
| a11 | `Result<enum["a", "b"], enum["c"]>` | 2 | `ARITY(1)` |
| a12 | `Result<enum["a", "b"]>` | 1 | `ARITY(1)` |
| a13 | `Result<{a: integer}, string>` (control) | 2 | `[]` |
| a14 | `enum["a", "b"]` (bare control) | — | `[]` |

Row a7 is the discriminator for the carrier: a comma-free `enum["a"]` still
truncates, so the defect is the unclosed skip and not the interior comma. Row a4
puts the group in the LAST argument, where truncation removes nothing. Row a12
reports the right count by accident — one argument is written. Row a14 records
that a bare bracket group at a `let` annotation draws nothing today
(bug 0162's territory, §Non-goals).

### (b) The lost refusal, by position

`<A>` is `array<enum["a", "b"], string>`; `<C>` the control
`array<{a: integer}, string>`.

| # | position | `<A>` | `<C>` | `<A>` registers |
|---|---|---|---|---|
| b1 | `fn f(p: <T>): integer { 1 }` | `[]` | `ARITY-array(2)` | yes |
| b2 | `fn f(p: array<enum["a", "b"], string, integer>): integer { 1 }` | `[]` | — | yes |
| b3 | `fn f(): <T> { 1 }` | `[]` | `ARITY-array(2)` | yes |
| b4 | `schema S { a: <T> }` | `error theta/parse/schema-type-not-expression: 'S' declares a type that is not a theta type expression` | `ARITY-array(2)` | no |
| b5 | `let x: <T> = 1` | `error theta/parse/let-rhs-type-mismatch: …expected array<enum["a","b"],string>, got integer` | `ARITY-array(2)`, then the same `let-rhs-type-mismatch` | no (the RHS gate refuses; the arity line is absent) |
| b6 | `schema T = <T>` | `schema-type-not-expression: 'T' …` | `ARITY-array(2)` | no |
| b7 | `let r = @<<T>>` + backtick body | `[]` | `ARITY-array(2)` | yes |
| b8 | `params:` → `p: '<T>'` | `error theta/load/params-type-not-expression: 'params:' field 'p' right-hand side is not a theta type expression`; `loweredSchema` null | `ARITY-array(2)`; `loweredSchema` null | no |
| b9 | `schema T = <T>` in `lib.thetalib` | `schema-type-not-expression: 'T' …` | `ARITY-array(2)` | n/a |

Rows b4, b6, b8 and b9 are bug 0217's landed refusal at the schema-feeding
positions: the input is refused, by a different row than the one its arity
violates. Rows b1, b2, b3 and b7 have no such backstop and register. Row b5
draws the position's own RHS gate and not the arity line, where the control
draws both.

The same split by constructor, `<R>` = `Result<enum["a", "b"], string>`:

| # | position | diagnostics |
|---|---|---|
| b10 | `fn f(p: <R>): integer { 1 }` | `ARITY(1)` |
| b11 | `fn f(): <R> { 1 }` | `ARITY(1)` |
| b12 | `schema S { a: <R> }` | `ARITY(1)`, `error theta/parse/result-in-schema-position: …` |
| b13 | `schema T = <R>` | `ARITY(1)`, `result-in-schema-position` |
| b14 | `let r = @<<R>>` + backtick body | `[]` |

`Result` is arity 2, so the truncated count is a violation rather than a match:
the false number is reported instead of nothing. Row b14 is the peel path
(§(f)).

### (c) The unwalked tail

| # | source | diagnostics |
|---|---|---|
| c1 | `let x: Result<enum["a", "b"], void> = 1` | `ARITY(1)` |
| c2 | `let x: Result<{a: integer}, void> = 1` | `error theta/parse/void-in-non-return-position: 'void' is only permitted as a function or theta return type` |
| c3 | `let x: Result<string, void> = 1` | same `void-in-non-return-position` |
| c4 | `fn f(p: Result<enum["a"], void>): integer { 1 }` | `ARITY(1)` |
| c5 | `fn f(p: Result<{a: integer}, void>): integer { 1 }` | `void-in-non-return-position` |

The second argument is identical across each pair. In c1 and c4 it is not in
`node.args`, so `walkType` never reaches it.

### (d) Neighbours and bounds

| # | source | observable |
|---|---|---|
| d1 | `fn f(p: enum["a", "b"]): integer { 1 }` | `[]` — a bare bracket group at a `fn` parameter draws nothing today (bug 0162's row, §Non-goals) |
| d2 | `fn f(p: array<enum["a"]>): integer { 1 }` | `[]` — one argument written, no arity violation to lose |
| d3 | `schema S { a: array<enum["a", "b"]> }` | `schema-type-not-expression: 'S' …` — bug 0217's landed cell, unmoved |
| d4 | `schema T = array<{a: integer}, string>` in `lib.thetalib` | `ARITY-array(2)` — the inline-object carrier refuses where the bracket carrier does not |
| d5 | `let x: Result<{a b: integer}, string> = 1` | `error theta/parse/inline-field-name-not-identifier: field name 'a b' within one inline object type is not an identifier` — bug 0233's widened key rule; the inline-object carrier's false `ARITY(1)` is gone (bug 0235, discharged) |
| d6 | `git ls-files -- '*.theta' '*.thetalib'` | 34 files; `git grep -nE '(array\|Result)<[^>]*\['` over them → zero hits |

### (e) What lowers

`lowerQueryResponseSchema(<annotation>, [], [])`.

| # | annotation | lowered |
|---|---|---|
| e1 | `array<enum["a", "b"], string>` | `{}` |
| e2 | `array<enum["a", "b"]>` | `{}` |
| e3 | `Result<enum["a", "b"], string>` | `{}` |
| e4 | `params:` → `p: 'array<enum["a", "b"], string>'` | null (refused, row b8) |

Row e1 is the second counter answering three where the diagnostic answered one:
the angle-only split yields three segments, `array`'s single-argument arm does
not match, and the form lowers to the permissive `{}` bug 0204 keeps. The
registered rows b1, b3 and b7 therefore carry no arrayness claim on the wire —
the harm is the missing refusal, not a wrong fragment.

### (f) The three counters

`splitTopLevel(interior, ",", mode)` called directly on the application's own
interior, beside `parseGeneric`'s `node.args.length` as reported by the arity
message.

| interior | `"angle-and-brace"` | `"angle"` | parser |
|---|---|---|---|
| `enum["a", "b"], string` | 3 | 3 | 1 |
| `enum["a", "b"], string, integer` | 4 | 4 | 1 |
| `[integer], string` | 2 | 2 | 1 |

The `"angle-and-brace"` column is the query peel's mode. Its doc block states
that the mode exists to agree with the arity parser
(`theta-document.ts:6193–:6195`); for this class the two disagree by two on the
first row. Neither split tracks `[…]`, so the peel is not merely off by the
parser's truncation — it also cuts the group.

## Expected behaviour

`grammar.md:107` fixes the closed constructor set with its arities and states
that applying a constructor with a type-argument count other than its declared
arity is `theta/parse/generic-arity-mismatch`; `code-registry-parse.md:65`
gives the row's trigger as "a generic-type application whose type-argument count
does not match the constructor's declared arity", with `array<T, U>` as an
example, and its `<actual>` placeholder is an integer type-argument count
(`placeholder-rendering-a.md:89`). `schemas.md:93` states that no inline
`enum["a", "b"]` form exists, with no depth qualifier, and
`code-registry-parse.md:104` records bug 0217's disposition: a closed `[…]`
group inside a generic argument derives from no `Type` alternative and is
pushed to `theta/parse/schema-type-not-expression` once, as a last resort, when
nothing else in the argument list is refusable.

From that, one statement per element:

- **`<actual>` is the count of type arguments the source spells.** Rows a1, a2
  and a5–a11 spell two or three; each reports one. Whatever else the bracket
  group draws, the count in the message is the author's.
- **An arity violation is refused whether or not an argument derives from
  `Type`.** Rows b1, b2, b3 and b7 apply an arity-1 constructor to two or three
  arguments and draw nothing; the same violation with a derivable first
  argument is refused at each of those positions. One non-derivable argument
  does not withdraw the constructor's own row.
- **Every argument the source spells is judged.** Row c1's second argument is
  `void` in a non-return position, which c2 and c3 refuse in the same
  constructor at the same position. Losing a rule because an EARLIER argument
  was a bracket group is the recovery leaking across argument boundaries.

Rows a4, a12, a13 and a14 do not move. Rows b4, b6, b8, b9 and d3 keep bug
0217's refusal as their whole output, or gain an arity line beside it — which
of those two holds is §Fix's to state, and `code-registry-parse.md:104`'s
last-resort sentence is the text that decides it.

## Actual behaviour / root cause

**`parsePrimary` has no bracket arm and the skip does not close the group.**
The `punct` arm (`type-grammar.ts:594`) branches on `-` (a negative numeric
literal) and on `{` (`parseObject`). Everything else takes `this.next()` and
recurses (`:606–:608`, "Unexpected punctuation: skip it to stay tolerant"). For
`enum["a", "b"]` the head `enum` is an ident with no following `<`, so it
returns a `named` node; the caller (`parseGeneric`, through `parseUnion`) then
resumes with the cursor on `[`. That token is skipped, `"a"` is consumed by the
recursive `parsePrimary` as a literal, and control returns to `parseGeneric`'s
loop at `:642`, which reads the group's interior comma as an ARGUMENT
separator. The next argument parse consumes `"b"`, and the loop stops at `]` —
one argument list, one recorded argument for a source that wrote two.

**Both faces follow from the length.** `walkType`'s generic arm prints
`node.args.length` as `<actual>` (`:1020–:1029`) and descends that list alone
(`:1045–:1047`). A count too low reads as a violation for `Result` (arity 2)
and as CONFORMANCE for `array` (arity 1), and the arguments not in the list are
not walked, so row c1 loses its `void` line.

**The two landed recoveries for this shape do not reach it.** Bug 0231's
`skipMalformedEntry()` (`:790`) is called from `parseObject`'s field loop only,
and its depth counter increments on `{`/`<` and decrements on `}`/`>`
(`:801–:804`), so a `[` is depth-neutral to it; no field loop runs for a
bracket group written directly as a generic argument. Bug 0217's
`findCutBracketGroupText` (`params.ts:1120`) runs on the LOWERING side, over
the interior STRING, and feeds one refusal sink; it computes no argument count
and is reached only from the three schema-feeding positions, which is exactly
the difference between rows b4/b6/b8 and rows b1/b3/b7.

**Three counters, two answers, and a comment asserting one.** The lowering
splits the same interior on angle depth alone (`params.ts:713`), which bug 0204
§Fix (b)(3) keeps deliberately, and gets three (row e1's `{}`).
`queryResponseAnnotation` (`theta-document.ts:6390`) splits with
`"angle-and-brace"` and also gets three, because neither mode tracks `[…]`
(`TypeSplitNesting`, `params.ts:1901`). The doc block above the peel states the
mode exists so the peel agrees with the arity parser (`:6193–:6195`). Bug 0235's
discharge made that sentence true for the inline-object carrier; this class is
the remaining input for which it is false.

## Why it matters

- **A registered refusal does not fire on the input its own row names.**
  `array<enum["a", "b"], string>` is `array<T, U>` with a non-derivable `T`;
  rows b1, b2, b3 and b7 register it at the `fn` parameter, `fn` return and
  query positions, where the derivable neighbour is refused.
- **A diagnostic states a number the source contradicts.** Rows a1, a2 and a9
  report `got 1` for two, three, and two-plus-trailing-comma written arguments.
  The message is the author's only report of the problem and directs attention
  to the argument count rather than to the bracket group that caused the
  miscount.
- **A rule is lost because a NEIGHBOUR is a bracket group.** Row c1 versus c2:
  one `void` refusal disappears. The class is every rule `walkType` would apply
  to a truncated argument's subtree, not `void` alone.
- **The truncation is silent.** No diagnostic anywhere reports that `, string>`
  was consumed by nothing; the truncation is observable only through the wrong
  count, and at rows b1, b3 and b7 through nothing at all.
- **Two counters disagree and the tree documents the opposite.**
  `theta-document.ts:6193–:6195` states that the query peel's split mode exists
  to agree with the arity parser. Bug 0235's discharge left that sentence true
  for every input but this class; any change to either counter is made against
  it.
- **Closing it costs no committed source.** Row d6: zero committed theta files
  write a bracket group inside a generic argument.

## Non-goals

- **Whether an inline `enum[…]` is admitted at all, and at which positions
  `theta/parse/inline-enum` fires.** `code-registry-parse.md:113` anchors that
  row at the start of a schema field type or alias arm and states it never
  fires one level down; bug 0162 owns its trigger set at `params:`. Rows a14
  and d1 measure today's silence at the `let` and `fn` positions as GROUND. No
  route here raises `inline-enum` anywhere new.
- **Bug 0217's landed disposition for the cut group.** Rows b4, b6, b8, b9 and
  d3 draw `theta/parse/schema-type-not-expression` /
  `theta/load/params-type-not-expression` and keep drawing it; the
  last-resort push and its "exactly once" property
  (`code-registry-parse.md:104`) are not reopened. §Fix must state whether an
  arity line joins that refusal at those positions, which is a question about
  this report's row, not about 0217's.
- **The lowering's angle-only argument split and its permissive `{}`.** Bug
  0204 §Fix (b)(3) keeps `params.ts:713` angle-only on stated grounds. Every
  cell of §Reproduction (e) is measured ground and no route here changes a
  lowered byte.
- **`Result`'s arity going unreported at the query annotation** (row b14, and
  bug 0235's rows f2–f3, which measure the same silence with no bracket group
  involved). The peel's own path owns it.
- **`theta/parse/result-in-schema-position`** (rows b12, b13) and the `let` RHS
  gate (row b5). Both are the positions' own rows; no route here changes
  either.
- **The inline-object carrier.** Bug 0235's rows are discharged and bug 0233's
  key rules landed in 0.196.0; row d5 records the current answer. This report
  claims the bracket carrier alone.
- **An UNCLOSED bracket group** (`array<enum["a", "b">`), which
  `code-registry-parse.md:104` explicitly leaves under-refused with its pieces.
  Not measured here and not claimed.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-grammar.ts` — bug 0134's do-not-chase class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one,
states it, and corrects the prose the choice falsifies. Both are anchored by two
settled facts: the lowering-side split stays angle-only with its lowered bytes
unchanged (bug 0204 §Fix (b)(3)), so §Reproduction (e) holds byte-for-byte after
the fix; and bug 0217's cut-group refusal keeps firing exactly once at the three
schema-feeding positions (`code-registry-parse.md:104`).

**(a) Where the count comes from.**

- *Route 1 — consume the group in `parsePrimary`.* Give the `punct` arm a `[`
  branch (`type-grammar.ts:594–608`) that consumes the balanced bracket group
  whole — tracking `[`/`]` depth the way `interiorClosingBraceIndex` (`:475`)
  tracks braces — and returns a node the walk treats as one argument.
  `parseGeneric` then counts the arguments the author wrote, `walkType` walks
  all of them, rows a1–a3 and a5–a11 report the true count, rows b1–b3 and b7
  gain their arity refusal, and row c1 gains its `void` line. The route must
  state what the recovery does when the group never closes (the
  `code-registry-parse.md:104` under-refusal class, unmeasured here), what node
  kind the group yields — a kind the walk already has, or a new one, with the
  consequence for `void`, arity, `Result` and the four raw-key rules stated per
  position — and must measure every other production reading the same cursor
  (`parseUnion` `:569`, `parseObject`'s field types, `parse()`), because the
  change is to a parser every `Type` position shares.
- *Route 2 — count the arguments independently of the cursor.* Leave
  `parsePrimary` as it is and derive the application's argument count from a
  token scan of its own `<…>` span at bracket-, brace- and angle-depth, the way
  `interiorClosingBraceIndex` derives the interior. This confines the change to
  the count (and, if the scan also yields argument spans, to the walk) and
  leaves every other cursor consumer untouched. Its cost is a second
  segmentation of the same list: §Reproduction (f) and
  `theta-document.ts:6193–:6195` already record that multiplicity as a hazard,
  so the route must state which counter is authoritative and reduce the three
  to two rather than add a fourth.

**(b) Binding under either route.** The count reported by
`theta/parse/generic-arity-mismatch` equals the number of type arguments the
source spells at every position of §Reproduction (b), and an arity violation is
refused whether or not an argument derives from `Type` — rows b1, b2, b3 and b7
stop registering. Every argument the source spells is walked, so row c1 draws
the `void` refusal c2 draws. `theta-document.ts:6193–:6195`'s agreement claim is
either made true for this class or rewritten in the same change; leaving it as
prose while the counters still disagree does not close element 1. Whether an
arity line joins bug 0217's refusal at rows b4, b6, b8 and b9 is stated
explicitly, with `code-registry-parse.md:104`'s last-resort sentence corrected
in the same change if the answer widens it.

**(c) Reach.** The disposition holds at all nine positions of
§Reproduction (b), for both constructors, for a bracket group that is not an
`enum` head (row a5), nested inside a brace interior (row a6), inside a union
arm (row a8) and inside a nested application (row a10). One diagnostic per
application, in `walkType`'s existing emission order beside
`result-in-schema-position`.

**(d) Locks.** Fresh inline witnesses for every row of §Reproduction, as whole
ordered unfiltered `toEqual` lists with every *Message* through `parseRegistry`
/ `registryMessage` (DIAG-4). The pinned bytes are:
`tests/type-grammar.test.ts` group `V2a-T` (`:48–:83`), bug 0044's arity and
`void` witness, whose cells must stay green and gain the bracket-carrier cells;
`tests/inline-object-malformed-entry-resync.test.ts` (bug 0231's 64-cell
resync witness, `TOTAL_LIST_CELLS` at `:628`), which must not move — no route
here edits `skipMalformedEntry` or `parseObject`'s field loop;
`tests/generic-argument-inline-field-key-rules.test.ts` (bug 0233's 76-cell
witness, `TOTAL_LIST_CELLS` at `:575`), whose generic-argument key cells must
neither gain nor lose a rule;
`tests/nested-inline-enum-generic-argument-refusal.test.ts` (bug 0217's five
groups at `:472`, `:666`, `:864`, `:957`, `:1055`), the cut-group refusal and
its exactly-once property, which stand;
`tests/generic-argument-shredded-group-refusal.test.ts` and
`tests/generic-argument-literal-lowering.test.ts` (bug 0204's lowering side)
and `tests/committed-fixture-parse-gate.test.ts`, all proven unmoved by hash.

## Provenance

Filed as the hand-off recorded in bug
[0235](./0235-malformed-inline-field-truncates-generic-argument-list.md)'s
discharge note and in `.pi/tmp/fixes/0235-report.md` §Residuals 1, which
measured this class at `fe3c53cf` (0.189.0) and named it "the one measured shape
in the document that 0231's landing does not discharge". Bug 0235's own text
contradicted itself on ownership — its §Non-goals assigned row f4 to bug 0217
("whether an inline enum is admitted in a generic argument is bug 0217's,
fixed") while its §Fix (c) Reach asserted its own disposition covered "the
bracket-group carrier (row f4)". The contradiction is resolved by this filing:
the truncation of a generic argument list by a bracket group, at every position
and for both constructors, is this report's; bug 0217 owns whether the group
itself is admitted and its landed schema-feeding refusal, which rows b4, b6, b8,
b9 and d3 measure as standing.

Independently re-measured at HEAD `30c0cb67` (0.197.0), not copied from that
record: one scratch vitest file over `parseDoc` (`tests/helpers/e2e-s1.ts`),
`lowerQueryResponseSchema` (`src/runtime/query-schema-lowering.ts:153`),
`doc.frontmatter.params.loweredSchema` and `splitTopLevel`
(`src/parser/params.ts:1976`), covering the fourteen annotations of
§Reproduction (a), the fourteen position rows of (b), the five tail rows of (c),
the six bounds of (d), the four lowerings of (e) and the three interiors of (f);
the corpus census over `git ls-files -- '*.theta' '*.thetalib'`. The scratch
file was deleted; `git status --short` afterwards lists this document and the
scratch files of sibling sessions, none of them written by this filing.

Two rows moved since the 0235 record was taken, both by bug 0233's landing in
0.196.0: `let x: Result<{a b: integer}, string> = 1` now draws
`theta/parse/inline-field-name-not-identifier` (row d5) where that record's
table showed `[]`, and `Result<{a: enum["x"]}, string>` (row a6) keeps its
`ARITY(1)` with no key rule beside it. Every other row of the pre-measured table
reproduces unchanged.

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing.

## Fix (0.214.0)

- **Route selected:** §Fix (a) *Route 1 — consume the group in `parsePrimary`*.
  `TypeParser.parsePrimary` consumes a CLOSED `[…]` bracket group whole, at both
  of the two places the cursor can meet one: as the primary itself
  (`[integer]`, and the bare group at a fresh type position) and as a postfix
  standing directly BEHIND a primary the head arm already returned
  (`enum["a", "b"]`, whose head is an `Ident`). The group yields a
  `bracket-group` leaf `TypeNode` carrying nothing — it derives from no `Type`
  alternative at any depth (`schemas.md:93`, stated with no depth qualifier) —
  so `walkType` judges nothing about it through its existing `default` arm; the
  node's whole purpose is that the cursor ends past the group's `]`, which is
  what stops the group's own interior commas from being read as an enclosing
  `parseGeneric` argument list's separators. Route 2 (a second, independent
  token scan of the `<…>` span) was declined on §Fix (a)'s own stated cost: it
  would add a FOURTH segmentation of one argument list where §Reproduction (f)
  and `theta-document.ts`'s peel doc already record the multiplicity as the
  hazard; Route 1 instead makes the parser's own count the count the source
  spells and leaves the other two counters where bug 0204 §Fix (b)(3) put them.
- **The two decisions §Fix left to the run, stated:**
  1. **An UNCLOSED group is never consumed.** `closedBracketGroupEnd` requires
     the matching `]`, on a `[`/`{` frame stack mirroring bug 0217's
     `findCutBracketGroupText` (`./params`) rather than a bare bracket counter,
     so a `{…}` inside the group cannot close it. When no `]` closes the group
     nothing is advanced and the input keeps the tolerant skip-and-recurse
     recovery byte-for-byte: `array<enum["a", "b">` is unmoved at all eight
     measured positions (§Non-goals, "An UNCLOSED bracket group";
     `code-registry-parse.md:104`'s authorized under-refusal, restated on the
     parse side for the same reason 0217 states on the lowering side — an
     unclosed group's extent is unknowable, so no scan can name it).
  2. **At the schema-feeding positions the arity line REPLACES bug 0217's
     cut-group refusal rather than joining it** (§Reproduction rows b4, b6, b8,
     b9). This is not a new disposition and reopens nothing: it is the
     precedence already registered on
     `code-registry-parse.md`'s `theta/parse/schema-type-not-expression` row
     ("a field or declaration that already carries an error-severity diagnostic
     from its own walk — a position rule (`void`, generic arity, `Result`, an
     inline `enum[...]`) … keeps that diagnostic alone and draws no refusal"),
     mirrored for `params:` by `code-registry-load.md`'s
     `theta/load/params-type-not-expression` row. The same precedence is
     already visible at the filing HEAD in this document's own rows b12 and
     b13, where `Result<enum["a", "b"], string>` in a schema field draws the
     arity line and `result-in-schema-position` and NO refusal — which is why
     §Expected's binary ("keep bug 0217's refusal as their whole output, or
     gain an arity line beside it") is falsified by this document's own table:
     a walk-owned error has always suppressed the push, so once the count is
     right the third outcome is forced. The subject stays REFUSED at every one
     of those positions; only the code changes, and it converges on the
     control's. The last-resort push itself is untouched and still fires
     wherever no walk error pre-empts it: bug 0217's own registry examples are
     measured UNMOVED — `array<enum["a", "b"], ???>` keeps its refusal on
     `???` (the `???` argument yields no node, so the count stays 1 and no
     arity violation arises), `pair<{a: string}, enum["x", "y"]>` keeps its
     refusal (`pair` is outside `GENERIC_ARITY`), and the one-argument
     `array<enum["a", "b"]>` keeps the push as its whole output (row d3). **No
     `code-registry-parse.md` correction is therefore owed**: no sentence and
     no example of that row is falsified, and the row's own precedence clause
     already describes the outcome. No diagnostic code is minted, no registry
     row is added, `docs/reference/diagnostics.md` needs no amendment and
     `tests/fixtures/h7a/permitted-codes.json` is byte-unchanged (the real live
     runs surfaced no unpermitted code).
- **GOV-15.** The newly refused inputs are exactly §Reproduction rows b1, b2,
  b3 and b7 — an over-applied constructor carrying a bracket group at the `fn`
  parameter, `fn` return and query-annotation positions, which registered
  before. Each is inside the already-registered *Trigger* of
  `theta/parse/generic-arity-mismatch` (`code-registry-parse.md:65`, "a
  generic-type application whose type-argument count does not match the
  constructor's declared arity … e.g. `array<T, U>`"), so no row states the old
  behaviour and none needed amending. No committed source moves: 34 committed
  `.theta`/`.thetalib` files, zero hits for
  `git grep -nE '(array|Result)<[^>]*\['` (row d6, re-confirmed).
- **What shipped:**
  - `src/parser/type-grammar.ts` — the `bracket-group` leaf `TypeNode`; the
    `[`-as-primary arm in `parsePrimary`'s punct branch, ahead of the tolerant
    skip; the postfix consumption of a closed group trailing a primary; and
    `closedBracketGroupEnd` / `consumeClosedBracketGroup`, the parse-side
    sibling of `interiorClosingBraceIndex`'s scan. Bug 0231's
    `skipMalformedEntry`, bug 0237's `,`-decline and `parseObject`'s field loop
    are byte-unchanged.
  - `src/parser/theta-document.ts` — comment-only, discharging §Fix (b)'s last
    clause. The peel-agreement claim above `unresolvedNamedTypeDiagnostic`, and
    its restatement in `queryResponseAnnotation`'s own doc block, said the
    `"angle-and-brace"` mode exists so the peel agrees with the parser
    computing `theta/parse/generic-arity-mismatch` about the ARGUMENT COUNT.
    That could not be made TRUE for this class — the split lives in
    `./params`, which bug 0204 §Fix (b)(3) keeps as it is — so both sites are
    rewritten to name the residual: the peel stays bracket-blind and counts
    three where the parser now counts two, takes its non-arity-2 path, and
    `Result`'s arity goes unreported at the query annotation for that spelling
    (§Non-goals; row b14, which stays `[]`).
  - `tests/generic-argument-bracket-group-truncation.test.ts` — the §Fix (d)
    witness, new. 95 whole-ordered unfiltered `toEqual` diagnostic cells in six
    groups plus a ledger group that recomputes the inventory from the tables:
    (A) rows a1–a14 at the `let` annotation, (B) the nine positions of
    §Reproduction (b) in three columns (`<A>` subject, `<C>` brace control,
    `<R>` `Result`) plus the `params:` lowering pair, (C) the unwalked tail
    c1–c5 against its brace and primitive controls, (D) the five bounds,
    (E) §(e)'s lowerings and §(f)'s `splitTopLevel` counts as the
    tripwire that no lowered byte moved, (R) §Fix (c) Reach for rows a5, a6, a8
    and a10 one position over at the `fn` parameter, and (F) the 42-cell fence
    — the unclosed class at eight positions, bug 0217's four registry examples,
    and the bare group at eight positions.
  - `tests/live/generic-argument-bracket-group-truncation-live-cell.test.ts` —
    the H8a live cover, new. A theta whose `fn` parameter declares
    `array<enum["a", "b"], string>` must NOT register through the real
    discovery→registration path (it registered before), while its legal
    literal-union sibling registers and drives a turn.
  - `tests/type-grammar.test.ts` — five bracket-carrier cells added to bug
    0044's `V2a-T` group at the direct `parseTypeExpression` seam, as §Fix (d)
    requires. Additions only, zero deletions; every pre-existing cell is
    byte-unmoved.
  - `tests/nested-inline-enum-generic-argument-refusal.test.ts` — bug 0217's
    witness, 17 cell EXPECTATIONS updated under §Fix (b)'s authority
    (enumerated below). Nothing deleted, re-subjected or weakened; the file
    still runs 190 tests.
- **Gates:** witness
  `npx vitest run tests/generic-argument-bracket-group-truncation.test.ts` →
  `Test Files 1 passed (1) / Tests 10 passed (10)` (at HEAD `ce2c412b`, before
  the fix: `Tests 4 failed | 6 passed (10)`); full default suite `npm test` →
  `Test Files 397 passed (397) / Tests 8235 passed (8235)`;
  `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) → clean;
  `npm run lint` (`eslint … "src/**/*.ts"`) → clean. Live, under the shared
  lock: the new H8a cell → `1 passed`, bug 0233's neighbouring live cell →
  `1 passed`, and the H8a acceptance cell naming this construct at one argument
  (`live-production-acceptance.test.ts -t "bug 0217 cell 74"`) → `1 passed`,
  confirming the one-argument spelling is unmoved on the real
  discovery→registration path.
- **Review:** two rounds. Round 1 (deep) returned two findings — a `fidelity`
  blocker, §Fix (d)'s "V2a-T … must gain the bracket-carrier cells" clause
  having been dropped without a stated deviation, and a `prose` defect (a fence
  banner claiming 46 cells where the ledger and `TOTAL_LIST_CELLS` say 42) —
  and independently endorsed the route's fidelity, the 17 authorized flips, the
  `theta-document.ts` correction, every protected lock and the
  arity-replaces-refusal disposition, re-measuring bug 0217's registry examples
  as unmoved. Round 2 (fast), over the remediation only, returned CLEAN with
  one `test` residual (residual 2 below).
- **Verification:** SOLID. The witness genuinely reds: with
  `closedBracketGroupEnd` neutralised to always report "no group", groups A, B,
  C and R red with the document's own symptom (`generic type 'Result' expects 2
  type argument(s); got 1`) while D, E, F and the ledger stay green, and four
  of the five new `V2a-T` cells red too (the unclosed-fence cell correctly does
  not, being unaffected by design); the mutation was reverted by writing the
  fixed bytes back and `git hash-object src/parser/type-grammar.ts` re-verified
  as `1f0cc2cf…`, after which both files are green again. Full default suite
  green on four independent runs. Live: three real runs, all green, under the
  lock protocol, no unpermitted diagnostic code, no stochastic-class symptom.
  Lint and typecheck clean. Protected locks re-run and green individually: bug
  0231's resync witness, bug 0233's 76-cell witness, bug 0217's 190-test
  witness, bug 0204's two lowering files, bug 0044's `type-grammar.test.ts`,
  bug 0237's 127-cell witness, the committed-fixture parse gate, the
  registry closed-set corpus gate and the citation symbol-form gate.
- **The 17 authorized cell updates** (all in
  `tests/nested-inline-enum-generic-argument-refusal.test.ts`, all on
  `array<enum["a", "b"], integer>` or `array<enum["a", "b"], Cat +>` — an
  arity-1 constructor applied to two arguments the source spells; subject,
  position, cell id and DIAG-4 message-through-the-registry form preserved in
  every one, and each failure prose rewritten to state the post-0236 contract
  in both directions):
  - c7 (schema field, alias, `params:`) — the schema-feeding refusal →
    `theta/parse/generic-arity-mismatch: generic type 'array' expects 1 type
    argument(s); got 2` alone.
  - c8 (the same three positions) — "codes must NOT include
    `generic-arity-mismatch`" → "codes MUST include it".
  - d3 (the same three positions) — the refusal on `Cat +` → the arity line
    alone.
  - f7 and f10 (`let`, `fn` parameter, `fn` return, query annotation, ×2
    subjects) — `[]` (or the `let` RHS gate alone) → the arity line (at `let`,
    the arity line then the RHS gate). These are §Reproduction rows b1, b3 and
    b7 ceasing to register, which §Fix (b) requires by name. The prose those
    cells carried — that a red there means bug 0124's decline was narrowed —
    was inapplicable and is corrected: `annotationSourceIsNotTypeExpression` is
    untouched, and the line these positions gain is the arity POSITION rule,
    not a type-text refusal.
- **Residuals:**
  1. *The three counters are now two-and-a-half, not one.* `parseGeneric`
     counts the arguments the source spells; `lowerTypeExpr`'s angle-only split
     and `queryResponseAnnotation`'s `"angle-and-brace"` peel both remain
     bracket-blind and still count three for `enum["a", "b"], string`
     (§Reproduction (f), measured byte-identical after the fix). Closing that
     gap means changing a split in `src/parser/params.ts`, which bug 0204
     §Fix (b)(3) keeps angle-only on stated grounds and which is outside this
     report's reach; the disagreement is now NAMED in both
     `theta-document.ts` doc blocks instead of denied by them. Its whole
     observable consequence is the one §Non-goals already pins: `Result`'s
     arity goes unreported at the query annotation for a bracket-carrying
     spelling (row b14, `[]` before and after).
  2. *Three of the five new `V2a-T` cells assert the arity code is ABSENT
     rather than asserting the whole diagnostic list.* Measured non-vacuous
     today (the real lists are `[]`), and it is the established shape of that
     group's sibling cells, but it would not catch a future regression adding a
     DIFFERENT diagnostic beside a correctly-absent arity code. Round 2 raised
     it as a `test` residual, not a finding.
  3. *One non-reproducing suite red.* A single heavily-loaded `npm test` run
     reported `1 failed | 8234 passed` and the failing test's name was lost to
     an output-tail capture. Six subsequent full runs of the identical tree
     were `397 files / 8235 tests` green. Round 2's reviewer found nothing
     order- or load-sensitive in this diff's blast radius and named the suite's
     pre-existing long-running subagent spawn tests as the likelier candidates.
     Recorded, unattributed, unreproduced.
- **Discharge notes appended:** none. Bug 0235 was already discharged by bug
  0231's landing and handed this class over in its own §Provenance; this
  document is the hand-off's terminus, so no sibling document needed a note.
  Bug 0217's landed treatment stands and is unreopened — its witness moved only
  under §Fix (b)'s own authority, enumerated above.
- **Pinned dispositions / non-goals:** every §Non-goals clause holds as
  written. `theta/parse/inline-enum`'s trigger set is untouched (bug 0162);
  rows a14 and d1 still measure silence at the `let` and `fn` positions. Bug
  0204's angle-only split and every lowered byte of §Reproduction (e) are
  byte-identical. `theta/parse/result-in-schema-position` (rows b12, b13) and
  the `let` RHS gate (row b5) are unchanged rows drawn by unchanged code. The
  UNCLOSED bracket group stays under-refused with its pieces. Citation drift in
  `src/parser/type-grammar.ts` is bug 0134's do-not-chase class and was not
  chased; every citation added by this change is in symbol form.

## Coordination note (2026-08-25, bug 0282 0.280.0's flip authority)

Bug 0282 0.280.0 landed the constructor-head gate its dated note
"Flip-authority widening (pre-fix, operator-directed)" measured against this
document's witness, `tests/generic-argument-bracket-group-truncation.test.ts`,
cell `f2b` ("non-constructor head beside a cut group",
`pair<{a: string}, enum["x","y"]>`) — one of `theta/parse/schema-type-not-expression`'s
own four published registry examples, quoted verbatim, so the SPELLING did
not move. `pair` is outside `GENERIC_ARITY` and `Ident`-shaped, so
`lowerTypeExpr`'s new constructor-head gate now refuses it before the
last-resort push this report's route added ever runs, at all five positions
the cell's tuple covers (schema body field, alias RHS, `.thetalib` alias RHS,
`params:` field, and the `let` annotation — the last of which was silent at
HEAD and now also refuses). The cell moved from
`theta/parse/schema-type-not-expression` / `theta/load/params-type-not-expression`
(or silence at the `let` annotation) to `theta/parse/unresolved-named-type`
naming `pair`. The inventory constant `EMPTY_LIST_CELLS` (declared count of
cells whose specified list is empty) dropped from 47 to 46 to match. The
cell's SUBJECT is preserved: it still measures what a non-constructor head
draws at each position, which is now the gate's decision rather than the
best-effort loop's silence.
