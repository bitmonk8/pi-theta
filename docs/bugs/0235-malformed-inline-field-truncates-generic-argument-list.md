# Bug 0235 — `TypeParser.parseObject`'s malformed-field `break` (`type-grammar.ts:694`–`:696`) leaves the shared cursor inside the interior, so the ENCLOSING generic application loses every argument behind it: `Result<{a b: integer}, string>` draws `theta/parse/generic-arity-mismatch` "got 1" for a two-argument spelling, `array<{a b: integer}, string>` draws NOTHING where `array<{a: integer}, string>` is refused for arity, and a `void` in the swallowed tail (`Result<{a b: integer}, void>`) loses its own refusal

- **Status:** fixed (0.189.0) — discharged by bug 0231's fix; see the note
  below. Originally: open, blocking on
  [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md), which
  names the same `break` at `type-grammar.ts:694`–`:696`: its route selection
  decides whether the rows here still stand (§Fix (d)).

> **Discharged by bug 0231's fix (0.189.0)** — parent-gate adjudication,
> measured at `fe3c53cf`: 0231's route 1 (`skipMalformedEntry()` + resync at
> the next depth-0 comma) closed all three faces. Element 1: a1/a2/a9/a11–a15
> → `[]`, a10 → `got 3` (true count). Element 2: c1/c3/c5/c6/c7/c9/c10 all
> draw `array … got 2/3`. Element 3: d1 draws `void-in-non-return-position`
> identical to control d2. Lowerings e1–e3 byte-identical (0204 invariant
> intact). The `theta-document.ts:5942`–`:5944` peel-count-agreement claim is
> now TRUE for every row this report cited (peel 2/3/2 = parser 2/3/2) — no
> correction owed. NOT covered (filed separately, see bug 0236): the
> bracket-group carrier class — `Result<enum["a","b"], string>` still
> miscounts (`got 1` for 2 written) because `parsePrimary` stops at `[`,
> which neither of this report's §Fix routes reaches; the peel claim remains
> false for that class only. Evidence: `.pi/tmp/fixes/0235-report.md`
> §Residuals 1 (pre-measured table).
- **Sev/Diff estimate:** S1/D3 — S1 because the truncation deletes arguments
  from the count and their subtrees from the walk, so inputs two registered
  rows refuse are accepted with no diagnostic and register:
  `array<{a b: integer}, string>` (an arity-1 constructor applied to two
  written arguments) reports `[]` at every position measured including
  `params:`, the `.thetalib` spelling and the query annotation
  (§Reproduction (c)), where the byte-neighbour `array<{a: integer}, string>`
  draws `theta/parse/generic-arity-mismatch`; and the second argument of
  `Result<{a b: integer}, void>` is never walked, so
  `theta/parse/void-in-non-return-position` does not fire where the same
  argument in `Result<{a: integer}, void>` draws it (§Reproduction (d)). The
  reported-count face is S2 on its own: the diagnostic names a count
  (`got 1`) the author's own source contradicts (`got 1` for two, three, and
  four written arguments — rows a1, a10, a15). D3 because the defect sits in
  the tolerant recovery of the one type parser every `Type` position shares,
  the fix adjudicates where the recovery resynchronises against three
  independent argument counters that already disagree (§Actual behaviour), and
  it moves pinned bytes in five witness files including bug 0233's row f2 and
  bug 0227's cells h8/h9.
- **Kind:** defect — implementation, one recovery point, three consequences.
  1. **The count is wrong.** `TypeParser.parseObject`'s malformed-field
     `break` (`src/parser/type-grammar.ts:694`–`:696`) leaves the parser's
     shared `pos` on the offending token, before the interior's own `}`, so
     `braceClosed = this.eatPunct("}")` (`:726`) is false and control returns
     to `parseGeneric` (`:626`) with the tokens `b : integer } , string >`
     unconsumed. Its argument loop asks `this.eatPunct(",")` (`:634`), sees
     `b`, and stops with one argument recorded. `walkType`'s generic arm then
     reports `node.args.length` verbatim (`:959–:966`), so
     `Result<{a b: integer}, string>` draws "expects 2 type argument(s); got
     1" (§Reproduction (a)).
  2. **A registered arity refusal is lost.** The same truncation makes an
     over-applied `array` count as one argument, which MATCHES its declared
     arity, so `array<{a b: integer}, string>` and
     `array<{a b: integer}, string, integer>` draw nothing at all and register
     (§Reproduction (c)). The registry row's own example shape (`array<T, U>`,
     `code-registry-parse.md:64`) is unenforced whenever the first argument
     holds a malformed inline field.
  3. **The dropped arguments' subtrees are never walked.** `walkType`
     descends `node.args` alone (`:985–:986`), and the truncated arguments are
     not in that list, so every rule they would draw is withheld:
     `Result<{a b: integer}, void>` draws the arity line alone where
     `Result<{a: integer}, void>` draws
     `theta/parse/void-in-non-return-position` (§Reproduction (d)).
- **Related:**
  - [0233](./0233-generic-argument-inline-field-key-rules-withheld.md) —
    **open**, the origin. Its row f2 measures
    `let x: Result<{a b: integer}, string> = 1` reporting one argument, records
    `Result<{ a as "w": integer }, string>` behaving alike and
    `Result<{ a: integer, b: string }, string>`, `Result<{ 3: string }, string>`
    and `Result<{ "a": integer }, string>` drawing `[]`, and claims the shape in
    its §Non-goals ("its cause is the argument parse rather than this
    carve-out. Unclaimed here"). This report is that filing, re-derived at HEAD
    and extended to the two faces f2 does not measure (elements 2 and 3).
  - [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md) —
    **open**, the same `break` measured INSIDE the interior: the fields behind
    the malformed entry are absent from `fieldNames` and `fieldTypes`, so their
    own rules — including a field TYPE's own
    `theta/parse/generic-arity-mismatch`, as in
    `{a b: integer, zs: array<string, integer>}` — are withheld. That report's
    subject is what the interior loses; this one's is what the ENCLOSING
    application loses, which no array of `parseObject`'s carries: the cursor.
    One fix site, two consequence sets; the ordering is stated in §Fix (d) —
    0231's route 1 (resynchronise the field loop) would move rows a1–a15,
    c1–c10 and d1 here, its route 2 (drive the starved passes off
    `interiorSource`) would leave every one of them standing.
  - [0204](./0204-bracket-blind-split-shreds-inline-object-in-generic.md) —
    **fixed (0.139.0)**. Its shred is NOT the substrate here: 0204 owns the
    LOWERING-side split (`params.ts:703`, `splitTopLevel(interior, ",")` in
    `lowerTypeExpr`'s generic arm), which its §Fix (b)(3) deliberately keeps
    angle-only, and this report's count comes from the TOKEN parser
    (`parseGeneric`, `node.args.length`) where no string split runs. The two
    are load-bearing together in one place only: they disagree about how many
    arguments `array<{a b: integer}, string>` has (2 for the lowering, 1 for
    the diagnostic), which is why row c1 registers and row e1 lowers to `{}`
    rather than to an `array` fragment.
  - [0217](./0217-nested-inline-enum-in-generic-argument-draws-nothing.md) —
    **fixed (0.148.0)**, the precedent for a construct a generic argument
    swallowed, closed at the lowering. `Result<enum["a", "b"], string>` reports
    "got 1" through this report's mechanism rather than 0217's
    (§Reproduction (f) row f4).
  - [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) —
    **fixed (0.54.0)**, which settled `walkType`'s emission sequence and whose
    `tests/type-grammar.test.ts` group `V2a-T` (`:58–:83`) is the pinned arity
    witness both faces move against.
  - [0228](./0228-inline-object-type-source-token-join-corrupts-field-keys.md) —
    **fixed (0.179.0)**, which made `TypeParser`'s `source` the author's own
    bytes for a brace-group interior so `interiorSource` slices are exact. Its
    witness `tests/inline-object-type-source-capture.test.ts` pins those slices
    and is a lock here: `interiorClosingBraceIndex` (`type-grammar.ts:467`)
    scans `tokens` independently of `pos`, so the capture survives this
    report's truncation and must keep doing so under any fix.
  - [0093](./0093-let-annotation-query-position-double-emission.md) —
    **fixed**, which owns `generic-arity-mismatch`'s emission COUNT at the
    `let`-annotation/query pair. This report changes which arity line is
    computed, not how many times a position computes it.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) —
    **fixed (0.121.0)**, the adjudicated home of trailing text a type parse
    does not consume. The tail this report loses is INTERIOR text, not trailing
    text, and draws no row of 0124's.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    do-not-chase class for the positional drift any fix here induces in
    `src/parser/type-grammar.ts` citations.
- **Affected** (every citation verified at HEAD `4c157bcc`, 0.183.0; cited by
  symbol, the line numbers being 0134's class):
  - **The recovery point** — `src/parser/type-grammar.ts`:
    `TypeParser.parseObject` (`:645`); the field loop's malformed-field `break`
    (`:694`–`:696`, comment "Malformed field; stop to stay tolerant" at
    `:695`), reached when a
    field-name `ident` is not followed by `:`; `braceClosed = this.eatPunct("}")`
    (`:726`), false whenever that `break` fires before the interior's own brace.
  - **The count** — `TypeParser.parseGeneric` (`:626`), its argument loop
    `while (this.eatPunct(","))` (`:634`) and its closing `this.eatPunct(">")`
    (`:641`); `GENERIC_ARITY` (`:443`, `array` 1 / `Result` 2); `walkType`
    (`:930`) and the generic arm's emission over `node.args.length`
    (`:959–:966`), plus the `result-in-schema-position` emission beside it
    (`:969–:979`).
  - **The unwalked tail** — the argument descent `for (const arg of node.args)`
    (`:985–:986`), the only route by which an argument's own subtree is judged;
    the field and union descents (`:1169`, `:1175`); the raw-key gate
    `!insideGenericArgument && node.closingBraceSpelled` (`:1057`), bug 0233's
    subject, which is why the first argument's own key rule is silent at the
    same time.
  - **The independent capture that does NOT truncate** —
    `interiorClosingBraceIndex` (`:467`) and the `interiorSource` slice
    (`:738–:742`), which scan `tokens` from the interior's start rather than
    from `pos`.
  - **The second counter** — `src/parser/params.ts`: `lowerTypeExpr` (`:668`),
    its generic arm's `splitTopLevel(interior, ",")` (`:703`, angle-only by bug
    0204 §Fix (b)(3)), `classifyGenericArgumentSegments` (`:975`),
    `lowerGenericArgument` (`:935`), `splitTopLevelSegments` (`:1866`) and
    `splitTopLevel` (`:1924`) with its `"angle-and-brace"` mode.
  - **The third counter, and the comment that claims agreement** —
    `src/parser/theta-document.ts`: `queryResponseAnnotation` (`:6139`) and its
    doc block (`:6123–:6138`), which peels a `Result` annotation's `T` side
    with an `"angle-and-brace"` split precisely so it "agree[s] with the parser
    computing `theta/parse/generic-arity-mismatch` about the ARGUMENT COUNT"
    (`:5942–:5944`); measured, the two disagree for every row of
    §Reproduction (a) that draws the false count (§Reproduction (f) rows
    f1–f3).
  - **The registered row and its prose** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:64`
    (`theta/parse/generic-arity-mismatch`, trigger "A generic-type application
    whose type-argument count does not match the constructor's declared arity
    … e.g. `array<T, U>` or `Result<T>`"); `:66`, its neighbour
    `theta/parse/result-in-schema-position`;
    `docs/spec_topics/grammar.md:107` (§"Generic-application constructors" —
    the closed set, arities, and "Applying a constructor with a type-argument
    count other than its declared arity … is
    `theta/parse/generic-arity-mismatch`"); `:109` (§"Inline object types",
    `ObjectType` in any `Type` position);
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:89` and
    `placeholder-rendering-b.md:72` (`<expected>` / `<actual>` render integer
    type-argument COUNTS). Mirrors: `docs/reference/grammar.md:233`,
    `docs/reference/diagnostics.md:110`.
  - **The witness locks** — `tests/type-grammar.test.ts` group `V2a-T`
    (`:58`, the two arity cells `array<T, U>` at `:59` and `Result<T>` at
    `:71`);
    `tests/inline-object-field-name-case.test.ts` (bug 0227's 62-cell witness,
    LEDGER at `:100`, cells h8/h9 at `:1022`);
    `tests/inline-object-type-source-capture.test.ts` (0228's capture);
    `tests/generic-argument-shredded-group-refusal.test.ts` and
    `tests/generic-argument-literal-lowering.test.ts` (0204's and 0217's
    lowering side); `tests/let-annotation-query-double-emission.test.ts`
    (0093's emission count); `tests/params-inline-object-lowering.test.ts`;
    `tests/committed-fixture-parse-gate.test.ts`.
  - **The corpus** — `git ls-files -- '*.theta' '*.thetalib'` is 34 files and
    `git grep -nE '(array|Result)<[^>]*\{'` over them returns zero hits, so no
    committed source moves under any route in §Fix.
- **Observed at:** `0.183.0` (HEAD `4c157bcc`). Offline, deterministic; no live
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
  `doc.frontmatter.params.loweredSchema` verbatim. Three scratch vitest files
  over those entry points, run on the outputs quoted below, then deleted.

## Summary

`TypeParser` is one tolerant recursive-descent parser shared by every `Type`
position. `parseObject`'s field loop breaks when a field-name `ident` is not
followed by `:` (`type-grammar.ts:694`–`:696`) — the recovery bug 0154, 0159 and 0228
all build on — and that break leaves the parser's shared `pos` on the offending
token rather than past the interior's `}`. Every enclosing production then
resumes inside the abandoned interior: `parseGeneric`'s argument loop
(`:634`) asks for a `,`, finds an identifier, and returns with the arguments
behind the malformed one dropped from `node.args`.

Two registered rows read that list. The arity row reports its length verbatim
(`:959–:966`), so `Result<{a b: integer}, string>` — two arguments in the
source — draws "expects 2 type argument(s); got 1", and so do the three- and
four-argument spellings (§Reproduction (a)). The same truncation silences the
row in the other direction: `array<{a b: integer}, string>` counts one
argument, matches `array`'s arity, and draws nothing at any of the seven
positions measured, where `array<{a: integer}, string>` is refused at all of
them (§Reproduction (c)). And because `walkType` descends `node.args` alone
(`:985–:986`), the dropped arguments are never judged:
`Result<{a b: integer}, void>` loses the
`theta/parse/void-in-non-return-position` its well-formed neighbour draws
(§Reproduction (d)).

Three counters exist for one argument list and they disagree. `parseGeneric`
sees one; `lowerTypeExpr`'s angle-only split (`params.ts:703`, kept angle-only
by bug 0204) sees two, which is why row c1 lowers to `{}` rather than to an
`array` fragment; `queryResponseAnnotation`'s `"angle-and-brace"` peel
(`theta-document.ts:6139`) also sees two arguments, takes `{a b: integer}` as the
response type and walks it as a ROOT — so at the query annotation the same
source draws `theta/parse/inline-field-name-not-identifier` and no arity line
at all (§Reproduction (b) row b7, (f) row f1). That peel's doc block states its
split mode exists so it "agree[s] with the parser computing
`theta/parse/generic-arity-mismatch` about the ARGUMENT COUNT"
(`theta-document.ts:5942–:5944`); for every row of §Reproduction (a) it does
not.

## Reproduction

Offline, deterministic, at HEAD `4c157bcc`. Whole unfiltered diagnostic lists
in emission order. `ARITY(n)` abbreviates
`error theta/parse/generic-arity-mismatch: generic type 'Result' expects 2 type
argument(s); got n`.

### (a) The reported count, at the `let` annotation

| # | source (after `let x: `, before ` = 1`) | args written | diagnostics |
|---|---|---|---|
| a1 | `Result<{a b: integer}, string>` | 2 | `ARITY(1)` |
| a2 | `Result<{a as "w": integer}, string>` | 2 | `ARITY(1)` |
| a3 | `Result<{a: integer}, string>` | 2 | `[]` |
| a4 | `Result<{a: integer, b: string}, string>` | 2 | `[]` |
| a5 | `Result<{"a": integer}, string>` | 2 | `[]` |
| a6 | `Result<{3: string}, string>` | 2 | `[]` |
| a7 | `Result<{"a,b": integer}, string>` | 2 | `[]` |
| a8 | `Result<string, {a b: integer}>` | 2 | `[]` |
| a9 | `Result<{a b: integer}, {c d: string}>` | 2 | `ARITY(1)` |
| a10 | `Result<{a b: integer}, string, integer>` | 3 | `ARITY(1)` |
| a11 | `Result<{p: {a b: integer}}, string>` | 2 | `ARITY(1)` |
| a12 | `Result<array<{a b: integer}>, string>` | 2 | `ARITY(1)` |
| a13 | `Result<{a b: integer} \| integer, string>` | 2 | `ARITY(1)` |
| a14 | `Result<{a b: array<string>}, string>` | 2 | `ARITY(1)` |
| a15 | `Result<{a b: integer}, string,>` | 2 + trailing `,` | `ARITY(1)` |
| a16 | `Result<{a b: integer}>` | 1 | `ARITY(1)` |
| a17 | `Result<{a b: integer, string>` (unclosed) | — | `ARITY(1)` |
| a18 | `{a b: integer}` (bare control, no generic) | — | `error theta/parse/inline-field-name-not-identifier: field name 'a b' within one inline object type is not an identifier` |

The discriminator is which token the field loop's `break` lands on. Rows a1,
a2, a9–a15 break on a token INSIDE the interior (`b`, `as`), so the interior's
`}` is unconsumed and every later argument is lost. Rows a5–a7 taint the entry
instead and the loop reaches the `}` (`{"a": integer}` breaks with `pos` ON the
brace, which `eatPunct("}")` then consumes), so the count is right and the
source registers. Row a8 puts the malformed interior in the LAST argument,
where truncation removes nothing. Row a16 reports the right count by accident.
Row a18 is what the same interior draws where no generic argument encloses it —
the refusal rows a1 and a2 replace with an arity claim.

### (b) The same source at eight positions

Fixture `Result<{a b: integer}, string>` (row a1's spelling).

| # | position | diagnostics | registers |
|---|---|---|---|
| b1 | `let x: <F> = 1` | `ARITY(1)` | no |
| b2 | `fn f(p: <F>): integer { 1 }` | `ARITY(1)` | no |
| b3 | `fn f(): <F> { 1 }` | `ARITY(1)` | no |
| b4 | `schema S { a: <F> }` | `ARITY(1)`, `error theta/parse/result-in-schema-position: …` | no |
| b5 | `schema T = <F>` | `ARITY(1)`, `result-in-schema-position` | no |
| b6 | `params:` → `p: '<F>'` | `ARITY(1)`, `result-in-schema-position`; `loweredSchema` null | no |
| b7 | `let r = @<<F>>` + backtick body | `error theta/parse/inline-field-name-not-identifier: field name 'a b' …` | no |
| b8 | b4 written in `lib.thetalib`, no frontmatter | `ARITY(1)`, `result-in-schema-position` | n/a |

Row b7 is the one position that does not report the arity at all: the query
annotation peels the `Result` before the type parse and walks
`{a b: integer}` as a root (§(f) row f1), where bug 0233's raw-key gate does
not withhold. Every other position reports the false count.

### (c) The lost refusal: an over-applied `array`

| # | source | args written | diagnostics | registers |
|---|---|---|---|---|
| c1 | `schema T = array<{a b: integer}, string>` | 2 | `[]` | yes |
| c2 | `schema T = array<{a: integer}, string>` | 2 | `error theta/parse/generic-arity-mismatch: generic type 'array' expects 1 type argument(s); got 2` | no |
| c3 | `fn f(p: array<{a b: integer}, string>): integer { 1 }` | 2 | `[]` | yes |
| c4 | `fn f(p: array<{a: integer}, string>): integer { 1 }` | 2 | `ARITY`-array, got 2 | no |
| c5 | `fn f(): array<{a b: integer}, string> { 1 }` | 2 | `[]` | yes |
| c6 | `schema T = array<{a b: integer}, string, integer>` | 3 | `[]` | yes |
| c7 | `params:` → `p: 'array<{a b: integer}, string>'` | 2 | `[]` | yes |
| c8 | `params:` → `p: 'array<{a: integer}, string>'` | 2 | `array` got 2 | no |
| c9 | `let r = @<array<{a b: integer}, string>>` + body | 2 | `[]` | yes |
| c10 | `schema T = array<{a b: integer}, string>` in `lib.thetalib` | 2 | `[]` | n/a |
| c11 | `schema S { a: array<{a b: integer}> }` | 1 | `[]` | yes |

Rows c2, c4 and c8 are the attribution: the identical arity violation with a
conformant first argument is refused at the same positions. Row c11 is bug
0233's row b3, the single-argument control whose silence that report owns; the
rows above it add an arity violation to the same silence.

### (d) The unwalked tail

| # | source | diagnostics |
|---|---|---|
| d1 | `let x: Result<{a b: integer}, void> = 1` | `ARITY(1)` |
| d2 | `let x: Result<{a: integer}, void> = 1` | `error theta/parse/void-in-non-return-position: 'void' is only permitted as a function or theta return type` |

The second argument is identical in both rows. In d1 it is not in `node.args`,
so `walkType` never reaches it and its own row is withheld — the arity line is
the whole output.

### (e) What lowers

`lowerQueryResponseSchema(<annotation>, [], [])` and, for `params:`,
`doc.frontmatter.params.loweredSchema` verbatim.

| # | annotation | lowered |
|---|---|---|
| e1 | `array<{a b: integer}, string>` | `{}` |
| e2 | `array<{a: integer}, string>` | `{}` (refused, so not registered) |
| e3 | `array<{a b: integer}>` | `{"type":"array","items":{}}` |
| e4 | `params:` → `p: 'array<{a b: integer}, string>'` | `{"type":"object","properties":{"p":{}},"required":["p"],"additionalProperties":false}` |
| e5 | `params:` → `p: 'Result<{a b: integer}, string>'` | null (refused) |

Row e1 is the second counter answering two where the diagnostic answered one:
the angle-only split yields two segments, `array`'s single-argument arm does
not match, and the form lowers to the permissive `{}` bug 0204 keeps. So the
registered row c1/c7 carries no arrayness claim on the wire — the harm is the
missing refusal, not a wrong fragment.

### (f) Bounds and measured neighbours

| # | source | observable |
|---|---|---|
| f1 | `let r = @<Result<{a: integer, a: string}, string>>` + body | `error theta/parse/duplicate-inline-field-name: duplicate field name 'a' within one inline object type` — the peel took the `T` side and walked it as a root, so a raw-key rule fires at a position bug 0233's gate would withhold it at |
| f2 | `let r = @<Result<{a: integer}>>` + body | `[]` — a genuine `Result` arity violation draws nothing at this position, peel or no peel |
| f3 | `let r = @<Result<string, integer, boolean>>` + body | `[]`; `let r = @<array<string, integer>>` + body draws `array` got 2 |
| f4 | `let x: Result<enum["a", "b"], string> = 1` | `ARITY(1)` — the same truncation for a bracket group: `parseGeneric` stops at `[`. Bug 0217's construct, this report's mechanism |
| f5 | `let x: array<{a b: integer}> = 1` | `error theta/parse/let-rhs-type-mismatch: let binding 'x' initialiser type mismatch: expected array<{a b: integer}>, got integer` — the position's own RHS gate, bug 0233's row b8 |
| f6 | `git ls-files -- '*.theta' '*.thetalib'` | 34 files; `git grep -nE '(array\|Result)<[^>]*\{'` over them → zero hits |

Rows f2 and f3 are `Result`'s arity going unreported at the query annotation
for reasons independent of this report (no malformed field is involved);
claimed in §Non-goals.

## Expected behaviour

`grammar.md:107` fixes the closed constructor set with its arities and states
that applying a constructor with a type-argument count other than its declared
arity is `theta/parse/generic-arity-mismatch`;
`code-registry-parse.md:64` gives the row's trigger as "a generic-type
application whose type-argument count does not match the constructor's declared
arity", with `array<T, U>` as an example, and its `<actual>` placeholder is an
integer type-argument count (`placeholder-rendering-a.md:89`).
`grammar.md:109` admits `ObjectType` in any `Type` position, so a `Type`
argument may be an inline object, and `type-system.md:15` states one type
grammar in every type-annotation position.

From that, one statement per element:

- **`<actual>` is the count of type arguments the source spells.** Rows a1, a2
  and a9–a15 spell two, three or two-plus-a-trailing-comma; each reports one.
  Whatever else the malformed first argument draws, the count in the message is
  the author's.
- **An arity violation is refused whether or not an argument is well-formed.**
  Rows c1, c3, c5, c6, c7, c9 and c10 apply an arity-1 constructor to two or
  three arguments and draw nothing; the same violation with a conformant first
  argument is refused (c2, c4, c8). One malformed argument does not withdraw
  the constructor's own row.
- **Every argument the source spells is judged.** Row d1's second argument is
  `void` in a non-return position, which row d2 refuses at the same position
  in the same constructor. Losing a rule because an EARLIER argument was
  malformed is the recovery leaking across argument boundaries.

Row a8 does not move: a malformed LAST argument truncates nothing. Rows a5–a7
do not move. Row a18's bare refusal and rows c11, f5 stay as they are —
whether the first argument's own key rule fires there is bug 0233's question,
not this report's.

## Actual behaviour / root cause

**One shared `pos`, one break, no resynchronisation.** `TypeParser` holds a
single cursor (`type-grammar.ts:525–:526`). `parseObject`'s field loop reads
`Ident ":"` at each entry; when the name token is an `ident` whose successor is
not `:` — `{a b: …}`, `{a as "w": …}` — it takes the tolerant `break` at `:696`
with `pos` still on `b` / `as`. `braceClosed = this.eatPunct("}")` (`:726`)
therefore fails, and `parseObject` returns a node whose `interiorSource` and
`closingBraceSpelled` are nonetheless correct, because
`interiorClosingBraceIndex` (`:467`) rescans `tokens` from the interior's start
and is immune to `pos`. Nothing performs the same repair for the CURSOR: no
step advances `pos` past the depth-0 `}` the scan already located.

**`parseGeneric` reads the cursor, not the scan.** Back at `:634` the loop asks
`this.eatPunct(",")`, sees `b`, and exits; `this.eatPunct(">")` (`:641`) fails
likewise; the node returns with `args.length === 1` and the tokens
`b : integer } , string >` unconsumed by any production. `walkType`'s generic
arm (`:959–:966`) prints that length as `<actual>`, and its descent
(`:985–:986`) visits that list alone. Both faces follow mechanically: a count
too low reads as a violation for `Result` (arity 2) and as CONFORMANCE for
`array` (arity 1), and the arguments not in the list are not walked.

**Three counters, two answers.** The lowering counts the same interior with
`splitTopLevel(interior, ",")` on angle depth alone (`params.ts:703`), which
bug 0204 §Fix (b)(3) keeps deliberately: brace-aware splitting there would
present `array<{a: string, b: integer}>` as one argument and lower
`{"type":"array","items":{}}`, asserting arrayness over an undivided interior.
So the lowering sees two arguments where the parser sees one (row e1's `{}`).
`queryResponseAnnotation` (`theta-document.ts:6139`) counts with
`"angle-and-brace"` and peels the response type, and its doc block gives the
reason as agreement with the arity parser (`:5942–:5944`) — the one claim in the
tree about these counts agreeing, and false for every row of §Reproduction (a):
the peel finds two arguments and hands `{a b: integer}` to the walk as a root,
which is why row b7 draws a raw-key refusal and no arity line while rows b1–b6
and b8 draw the reverse.

**The recovery's own comment scopes it to one field, not one argument list.**
`:695` says "Malformed field; stop to stay tolerant", and the surrounding
machinery (the `namesStopped` latch at `:669`, the `entryTainted` latch at
`:681`, `carriesUnclosedInterior` at `:511`) all treat an abandoned interior as a
question about which FIELD NAMES may still be contributed. None of them
addresses the enclosing production's cursor, which is where the arity count and
the argument walk come from.

## Why it matters

- **A registered refusal does not fire on the input its own row names.**
  `array<{a b: integer}, string>` is `array<T, U>` with a malformed `T`; rows
  c1, c3, c5–c7, c9 and c10 register it at every position including `params:`
  and the `.thetalib` spelling.
- **A diagnostic states a number the source contradicts.** Rows a1, a10 and
  a15 report `got 1` for two, three, and two-plus-trailing-comma. The message
  is the author's only report of the problem, and it directs attention to the
  argument count rather than to the malformed key that caused the miscount —
  which, at every position but b7, draws nothing of its own (bug 0233).
- **A rule is lost because a NEIGHBOUR was malformed.** Row d1 versus d2: one
  `void` refusal disappears when an earlier argument breaks the field loop.
  The class is every rule `walkType` would apply to a truncated argument's
  subtree, not `void` alone.
- **The tail is dropped silently.** No diagnostic anywhere reports that
  `, string>` was consumed by nothing; the truncation is observable only
  through the wrong count.
- **Three argument counters disagree and one of them documents the opposite.**
  `theta-document.ts:5942–:5944` states that the query peel's split mode exists
  to agree with the arity parser. Any change to either counter must be made
  against that sentence, which today is false.
- **Closing it costs no committed source.** Row f6: zero committed theta files
  write an inline object inside a generic argument.

## Non-goals

- **The fields the interior itself loses behind the malformed entry.** Bug
  [0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md) owns
  every verdict `fieldNames` and `fieldTypes` starve of, including a field
  TYPE's own arity line. This report claims only what leaves the interior: the
  cursor, the enclosing application's argument count, and the arguments
  `walkType` never visits.
- **Whether the malformed key itself draws a rule inside a generic argument.**
  Bug [0233](./0233-generic-argument-inline-field-key-rules-withheld.md) owns
  the raw-key carve-out at `type-grammar.ts:1057` and its four withheld rows.
  This report claims the argument COUNT and the argument WALK; the key rules'
  disposition is 0233's, and every row above is measured with today's
  carve-out in force. A fix here that restores the count while leaving the key
  silent is admissible; the two reports compose.
- **The lowering's angle-only argument split and its permissive `{}`.** Bug
  0204 §Fix (b)(3) keeps `params.ts:703` angle-only on stated grounds, and
  bug 0164 owns the permissive lowering. Row e1's `{}` is measured GROUND here;
  no route in §Fix changes a lowered byte.
- **`Result`'s arity going unreported at the query annotation** (rows f2, f3).
  Measured and recorded; it needs no malformed field and its cause is the
  peel's own path, which bug 0093 adjudicated for emission counts. Unclaimed
  here.
- **The inline `enum[…]` construct** (row f4). The truncation is this report's;
  whether an inline enum is admitted in a generic argument is bug 0217's,
  fixed.
- **`theta/parse/result-in-schema-position`** (rows b4–b6, b8) and the `let`
  RHS gate (row f5). Both are the positions' own rows; no route here changes
  either.
- **Recovery for a malformed field OUTSIDE a generic argument.** Row a18 draws
  its refusal today and does not move.
- **The unclosed-interior class** (row a17). The truncation there coincides
  with a source that spells no closing brace; bug 0227 group (J) owns the
  silence of the rules at that arm, and the arity count for an unterminated
  interior is not adjudicated by this report.
- **Citation drift.** Any fix here shifts absolute line numbers in
  `src/parser/type-grammar.ts` — bug 0134's do-not-chase class.

## Fix

Not settled. The routes below are constraint-pinned; the run selects one,
states it, and corrects the prose the choice falsifies. Both are anchored by
one settled fact: the lowering-side split stays angle-only with its lowered
bytes unchanged (bug 0204 §Fix (b)(3)), so no route here divides a generic
argument's interior into lowered properties, and every cell of
§Reproduction (e) holds byte-for-byte after the fix.

**(a) Where the count comes from.**

- *Route 1 — resynchronise the cursor at the abandoned interior.*
  `parseObject` already knows the token index of its own depth-0 `}`
  (`interiorClosingBraceIndex`, `type-grammar.ts:467`, read at `:727` for the
  `interiorSource` slice). On the malformed-field `break` path, advance `pos`
  to one past that index before returning, so every enclosing production
  resumes where the source says the interior ended. `parseGeneric` then counts
  the arguments the author wrote, `walkType` walks all of them, and rows a1,
  a2, a9–a15 report the true count while rows c1, c3, c5–c7, c9, c10 gain
  their arity refusal and row d1 gains its `void` line. The route must state
  what the recovery does when no depth-0 `}` exists (row a17's unterminated
  interior, where the index is `-1` and there is nothing to resynchronise to),
  and must measure the effect on every OTHER enclosing production that reads
  the same cursor — union arms (`parseUnion`, `:561`), object field lists
  (`parseObject`'s own loop for a nested interior, rows a11 and c11's shape),
  and the `fn` parameter list — because the change is to a parser every `Type`
  position shares.
- *Route 2 — count the arguments independently of the cursor.* Leave the
  recovery as it is and derive `node.args`' arity from a token scan of the
  application's own `<…>` span at brace-and-angle depth, the way
  `interiorClosingBraceIndex` derives the interior. This confines the change to
  the count (and, if the scan also yields the argument spans, to the walk),
  leaving every other consumer of the cursor untouched. Its cost is a second
  segmentation of the same list, which is exactly the multiplicity
  §Reproduction (f) and `theta-document.ts:5942–:5944` already record as a
  hazard: the route must state which counter is authoritative and reduce the
  three to two, not add a fourth.

**(b) Binding under either route.** The count reported by
`theta/parse/generic-arity-mismatch` equals the number of type arguments the
source spells at every position of §Reproduction (b), and an arity violation is
refused whether or not an argument is well-formed (§Reproduction (c)). Every
argument the source spells is walked, so row d1 draws the `void` refusal its
neighbour d2 draws. `theta-document.ts:5942–:5944`'s agreement claim is either
made true or rewritten in the same change; leaving it as prose while the
counters still disagree does not close element 1.

**(c) Reach.** The disposition holds at all eight positions of
§Reproduction (b), for both constructors, at every nesting depth (rows a11–a14)
and for the bracket-group carrier (row f4). One diagnostic per application, in
`walkType`'s existing emission order beside `result-in-schema-position` — bug
0093's per-position emission count does not change.

**(d) Ordering.** This report BLOCKS on
[0231](./0231-well-formed-field-behind-malformed-entry-unchecked.md)'s route
selection, both reports naming the same `break`. If 0231 lands its route 1 —
resynchronise the field loop to the next top-level `,` — the cursor reaches the
interior's `}` and every row of §Reproduction must be re-measured BEFORE any
change is made here; several may close outright. If 0231 lands its route 2 —
compute the starved passes from `interiorSource` and leave the recovery
untouched — every row stands and route 1 or 2 of §(a) applies unchanged. No fix
here edits `parseObject`'s recovery while 0231's disposition is open, that
being the one line both reports would rewrite.

**(e) Ordering against 0233.** This report does not block on 0233 and 0233 does
not block on it: 0233 owns the raw-key gate (`type-grammar.ts:1057`) and this report owns
the cursor and the count. Whichever lands second re-measures the other's cells
at the shared position, because a fix here changes what
`Result<{a b: integer}, string>` draws (row a1) and 0233's row f2 pins today's
answer.

**(f) Locks.** Fresh inline witnesses for every row of §Reproduction, as whole
ordered unfiltered `toEqual` lists with every *Message* through `parseRegistry`
/ `registryMessage` (DIAG-4). The pinned bytes are:
`tests/type-grammar.test.ts` group `V2a-T` (`:58–:83`), bug 0044's arity
witness, whose two cells must stay green and gain the malformed-argument cells;
bug 0233's row f2, which this fix falsifies and which must be corrected in the
same change if 0233 is still open;
`tests/inline-object-field-name-case.test.ts` (bug 0227's 62-cell witness,
cells h8/h9 at `:1022`) and the four raw-key witnesses, whose generic-argument
cells assert 0233's silence and must not gain a key refusal from this fix;
`tests/inline-object-type-source-capture.test.ts` (bug 0228's capture), which
pins `interiorSource` for exactly the interiors this fix resynchronises past —
the slices must not move;
`tests/generic-argument-shredded-group-refusal.test.ts` and
`tests/generic-argument-literal-lowering.test.ts` (0204's and 0217's lowering
side), `tests/params-inline-object-lowering.test.ts` and
`tests/committed-fixture-parse-gate.test.ts`, all proven unmoved by hash. Bug
0231's three pinned witnesses —
`tests/inline-object-field-name-case.test.ts`,
`tests/inline-object-type-source-capture.test.ts` and
`tests/escaped-quote-inline-field-name-refusal.test.ts` — are the shared
surface: any cell whose fixture puts a malformed inline field inside a generic
argument is in both reports' scope and is re-derived once, by whichever fix
lands second.

## Provenance

Filed as the forward filing of bug
[0233](./0233-generic-argument-inline-field-key-rules-withheld.md)'s
§Reproduction row f2 and its matching §Non-goals bullet, which measure
`let x: Result<{a b: integer}, string> = 1` reporting one argument, name the
cause as "the argument parse rather than this carve-out", and leave the shape
unclaimed.

Independently re-derived at HEAD `4c157bcc` (0.183.0): three scratch vitest
files over `parseDoc` (`tests/helpers/e2e-s1.ts`), `lowerQueryResponseSchema`
(`src/runtime/query-schema-lowering.ts:153`) and
`doc.frontmatter.params.loweredSchema`, covering the eighteen annotations of
§Reproduction (a), the eight positions of (b), the eleven `array` rows of (c),
the two tail rows of (d), the five lowerings of (e) and the six bounds of (f);
the corpus census over `git ls-files -- '*.theta' '*.thetalib'`. All three
scratch files were deleted; the tracked tree carries this document alone.

Three facts 0233's row f2 does not state, added by this measurement: the
truncation silences `generic-arity-mismatch` for `array` as well as
misreporting it for `Result` (§Reproduction (c)); the dropped arguments'
subtrees are never walked, so their own rules are lost (§Reproduction (d)); and
the tree contains a written claim that the query peel's argument count agrees
with the arity parser's (`src/parser/theta-document.ts:5942–:5944`), which
these rows falsify.

`src/`, `tests/`, `docs/bugs/README.md` and every other bug document are
unmodified by this filing. `git status --short` at the end of it lists six
untracked bug documents and nothing else: this one and five belonging to
sibling sessions (`0230`, `0231`, `0232`, `0233`, `0234`), so the `0231` and
`0233` cross-references above point at files not yet in HEAD.
