# Bug 0042 — Same-line residue after a grammatically complete `schema X = …` right-hand side is consumed with no diagnostic: `schema X = Cat Cat` registers a one-arm alias and severs the author's second name into a no-op statement, `schema X = Cat |` drops the dangling arm inside the declaration, and `schema X = -1` keeps a junk `"-"` arm that lowers to the permissive `{}` — while the identical missing separator inside an object body is rejected

- **Status:** fixed (0.52.0).
- **Kind:** defect — silent partial consumption of a malformed declaration.
  Two elements: what the capture's boundary leaves unreported, and the
  disagreement between the two `Type` positions over the same defect.
  1. *Ungrammatical declarations load clean.* `AliasRhs ::= Type ("|" Type)*`
     (`grammar.md:175`) admits neither two adjacent `Type` atoms with no
     intervening `|` nor a trailing `|` with no arm behind it, and
     `LiteralType ::= STRING | NUMBER | BOOLEAN | NULL` (`:102`) has no
     unary-minus alternative. At HEAD all three arrangements produce zero
     diagnostics at any severity, so each is inside the
     [GOV-15 loads-cleanly set](../spec_topics/governance/source-language-stability.md#gov-15-loads-cleanly)
     (`:9`). What the author wrote is half-kept: `schema X = Cat Cat` keeps
     `arms: ["Cat"]` and turns the second `Cat` into an expression statement;
     `schema X = Cat |` keeps `arms: ["Cat"]` and drops the empty segment
     behind the `|`; `schema X = -1` keeps `arms: ["-"]`, severs the `1`, and
     lowers `$defs.X` to `{}`.
  2. *The two `Type` positions disagree on a missing separator.* Inside an
     object body, two field types with no comma between them raise
     `theta/parse/unsupported-feature: unsupported syntactic feature: schema
     fields must be comma-separated`
     (`src/parser/theta-document.ts:2424–2431`), whose comment (`:2408–2416`)
     states the reason: a swallowed brace-body newline otherwise "coalesces two
     fields into one malformed field with no diagnostic (silent data-shape
     corruption)". The alias right-hand side has no such rule, so
     `schema S { f: Cat Cat }` is rejected and `schema X = Cat Cat` is not.
- **Related:** [0033](./0033-body-level-schema-alias-unsupported.md) — the fix
  (0.45.0) that made the alias/union declaration parse, and the origin of
  this report. Its §Fix (0.45.0) *Residuals* (i) records this input class as
  "pinned as observed" with the rationale quoted in §Fix below, and its
  witness file `tests/schema-alias-union-decl.test.ts` pins the three
  arrangements as cells n11 (`:1857`), n24 (`:2193`) and n29 (`:2334`, whose
  first spelling `schema X = -1` is the silent one). This report holds the
  disposition 0033 deferred; it changes nothing 0033 landed.
- **Affected** (citations verified at HEAD `f959f8de`, 0.45.0):
  - `src/parser/theta-document.ts:2294–2312` — `finishAliasSchema`. One
    `this.parseType(true, false, true)` capture over the whole right-hand side
    (`:2295`), then `splitTopLevel(rhsSource, "|")` (`:2296`). The capture ends
    where the declaration grammatically ends; whatever the stop leaves is not
    the declaration's problem. The zero-arm path recovers to
    `theta/parse/empty-schema-body` (`:2297–2308`); the arms-bearing path
    returns with no check on what follows (`:2310–2311`).
  - `src/parser/theta-document.ts:2816–2826` — the field-boundary stop, shared
    with the object form: at depth 0, a value-ish token (`ident` / `keyword` /
    `string` / `number`) whose predecessor is not `|` ends the capture. This is
    the stop that ends the arm at the second `Cat` of `schema X = Cat Cat` and
    at the `1` of `schema X = -1`.
  - `src/parser/theta-document.ts:2772–2781` — the `-` stop, scoped to
    `armComplete && !atArmStart`. At an arm start `-` is captured instead, which
    is what produces the `"-"` arm; the doc comment at `:2722–2725` records
    that disposition as pinned by n29.
  - `src/parser/theta-document.ts:2202–2211` — `parseSchema`'s own record of
    this residual: "a same-line token that is part of no shape at all … There
    it takes the language's ordinary disposition for that statement: silent
    when the name resolves … Recorded, not repaired".
  - `src/parser/theta-document.ts:1646–1669` — the statement loop's
    no-progress arm. It raises `theta/parse/unsupported-feature: … stray
    '<t>' in statement position` for a `punct` token only (`:1651–1665`). A
    severed `ident`, `keyword`, `string` or `number` starts a legal expression
    form, so `parseForm` returns non-`null` and this arm never runs — which is
    why the same-line residue of exactly the tokens the field-boundary stop
    fires on is the silent case.
  - `src/parser/theta-document.ts:1687–1702` — tail promotion requires
    `last.lineStart`. A severed residue never starts a line, so a body whose
    last line is `schema X = Cat 42` has `tail: null` and, per
    `grammar.md:129`, the final value `null`. This is shared with any
    same-line statement pair (§Non-goals), not specific to the residue.
  - `src/parser/params.ts:616–673` — `splitTopLevel`: "Empty segments are
    dropped" (`:619`, dropped at `:658–662`). This is the whole mechanism of
    the dangling `|`: the `|` is consumed *inside* the declaration's range and
    the empty segment behind it disappears, so no token reaches the statement
    loop and no statement-level disposition applies.
  - `src/parser/body-type-lowering.ts:238–245` — the alias arm lowering:
    `lowerTypeSource(decl.arms.join(" | "), …)`. `lowerTypeSource`
    (`:131–154`) tries the literal forms and otherwise calls `lowerTypeExpr`,
    which answers `{}` for a source it does not recognise. `"-"` takes that
    path, so the junk arm reaches AJV as the permissive `{}`.
  - `src/parser/theta-document.ts:2408–2431` — the object body's comma rule,
    element 2's control. `:2424–2431` is the emission against the boundary
    token; `:2408–2416` is the rationale.
  - `src/lexer/lexer.ts:38–59` — `Token.range` carries
    `start.line` / `start.column`. The discrimination §Fix constraint (ii)
    needs is available at the stop: the stopped-on token's line is in hand.
  - `tests/schema-alias-union-decl.test.ts:1856–1898` (group (n), cells n11
    and its unresolvable half), `:2192–2219` (group (s), cell n24 and the
    field control), `:2315–2386` (group (u), cell n29 and the field control) —
    the three pins, each asserting an empty diagnostic list. Any change to the
    disposition reds these cells.
- **Observed at:** `0.45.0` (`f959f8de`). Offline, deterministic, no live
  model: scratch vitest driving `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts` (the shipped load path with inert seams) over the
  fixtures below, reading `doc.diagnostics`, `doc.body.statements`,
  `doc.body.tail`, each declaration's `arms` and `range`, and
  `doc.frontmatter.params.loweredSchema`; written, run, deleted.

## Summary

0033's fix bounds the alias-RHS capture so it ends where the declaration
grammatically ends. Three arrangements put tokens on the *same source line*
that no production of the declaration can hold. All three load with zero
diagnostics:

- **`schema X = Cat Cat`** (with `Cat` declared) — the field-boundary stop
  ends the arm at the second `Cat`, which re-enters the statement loop as a
  bare declared-name expression statement. The declaration keeps one arm; the
  author's second name is a no-op.
- **`schema X = Cat |`** — the trailing `|` is consumed by the capture and its
  empty segment is dropped by `splitTopLevel`, leaving a one-arm alias.
  Nothing reaches the statement loop.
- **`schema X = -1`** — `-` at an arm start is captured, the field-boundary
  stop severs the `1`, and the declaration carries the arm `"-"`, which lowers
  to `{}`. The alias constrains nothing.

The unresolvable arrangements stay loud: `schema X = Ghost Ghost` raises
`theta/parse/unresolved-named-type` for the arm and
`theta/parse/unknown-identifier` for the residue. So does the next-line
arrangement: `schema X =` followed by `let a = 1` raises
`theta/parse/empty-schema-body`. And so does the `.thetalib` spelling, through
a misattributed code — the severed residue is a top-level statement there, so
`schema X = Cat Cat` in a `.thetalib` raises
`theta/parse/thetalib-top-level-statement: top-level statement not permitted
in .thetalib file; move into a fn body`, a complaint about statement placement
for a declaration's severed tail.

Field-position parity holds for one of the three and fails for another.
`schema S { a: string | }` is equally silent (and lowers the field to `{}`);
`schema S { f: Cat Cat }` is rejected by the object body's comma rule, where
the alias position accepts the same missing separator; `schema S { a: -1 }`
raises `theta/parse/empty-schema-body`, where the alias position raises
nothing.

## Reproduction

Offline at HEAD `f959f8de`. Every fixture is `mode: prompt` frontmatter plus
the body shown. `arms` is the named declaration's captured arm list, `stmts`
the top-level statement kinds, `tail` the body's tail expression, `$defs.X`
the lowered fragment when the body is reached through a `params:` field
`a: X`.

```
@@ 1  schema Cat { a: string } / schema X = Cat Cat / let a = 1 / a
   arms   :: ["Cat"]
   stmts  :: ["schema:Cat","schema:X","expr","let:a"]
   diags  :: []
   ranges :: decl X ends line 5 col 15; the `expr` starts line 5 col 16
   $defs.X (params a: X) :: {"$ref":"#/$defs/Cat"}
@@ 1a CONTROL — the same statement on its own line
      schema Cat { a: string } / Cat / let a = 1 / a
   stmts  :: ["schema:Cat","expr","let:a"]       diags :: []
@@ 1b CONTROL — three atoms.  schema Cat {…} / schema X = Cat Cat Cat
   arms   :: ["Cat"]
   stmts  :: ["schema:Cat","schema:X","expr","expr","let:a"]   diags :: []
@@ 1c CONTROL — unresolvable.  schema X = Ghost Ghost / let a = 1 / a
   arms   :: ["Ghost"]
   diags  :: ["error theta/parse/unresolved-named-type: unresolved named type 'Ghost'"
              (line 4 col 1–17),
              "error theta/parse/unknown-identifier: unknown identifier 'Ghost'"
              (line 4 col 18–23)]
@@ 1d CONTROL — object-field analogue.  schema Cat {…} / schema S { f: Cat Cat }
   diags  :: ["error theta/parse/empty-schema-body: 'S' has no fields; an empty
               schema cannot be validated.",
              "error theta/parse/unsupported-feature: unsupported syntactic
               feature: schema fields must be comma-separated"]
@@ 1e CONTROL — the comma present.  schema S { f: Cat, g: Cat }
   diags  :: []
@@ 1f CONTROL — .thetalib spelling of fixture 1
   diags  :: ["error theta/parse/thetalib-top-level-statement: top-level
               statement not permitted in .thetalib file; move into a fn body"]
      and the residue-free control `schema X = Cat` in a .thetalib :: []
@@ 2  schema Cat { a: string } / schema X = Cat | / let a = 1 / a
   arms   :: ["Cat"]
   stmts  :: ["schema:Cat","schema:X","let:a"]   (no residue statement)
   diags  :: []
   ranges :: decl X spans line 5 col 1–17, i.e. the `|` is inside it
   $defs.X (params a: X) :: {"$ref":"#/$defs/Cat"}
@@ 2a CONTROL — field position.  schema S { a: string | } / let a = 1 / a
   fields :: [{name:"a", typeSource:"string|"}]   diags :: []
   $defs.S (params a: S) :: {"type":"object","properties":{"a":{}},
                             "required":["a"],"additionalProperties":false}
@@ 3  schema X = -1 / let a = 1 / a
   arms   :: ["-"]
   stmts  :: ["schema:X","expr","let:a"]
   diags  :: []
   ranges :: decl X ends line 4 col 13; the `expr` (the `1`) is line 4 col 13–14
   $defs.X (params a: X) :: {}
@@ 3a CONTROL — the union spelling is loud.  schema X = -1 | null
   arms   :: ["-"]   stmts :: ["schema:X","expr","expr","let:a"]
   diags  :: ["error theta/parse/unsupported-feature: unsupported syntactic
               feature: stray '|' in statement position" (line 4 col 15)]
@@ 3b CONTROL — field position.  schema S { a: -1 } / let a = 1 / a
   diags  :: ["error theta/parse/empty-schema-body: 'S' has no fields; an empty
               schema cannot be validated."]
@@ 4  CONTROL — the NEXT-LINE arrangement is loud.  schema X = / let a = 1 / a
   arms   :: absent
   diags  :: ["error theta/parse/empty-schema-body: 'X' has no fields; an empty
               schema cannot be validated."]
@@ 5  further same-line members, all silent
   schema X = string 1        arms ["string"]           diags []   $defs.X {"type":"string"}
   schema X = string "junk"   arms ["string"]           diags []
   schema X = string | integer 7
                              arms ["string","integer"] diags []
   schema Cat {…} / schema X = Cat Dog  (both declared)
                              arms ["Cat"]             diags []
@@ 6  tail promotion, declaration last
   schema Cat { a: string } / schema X = Cat 42     stmts 3, tail null, diags []
   CONTROL  schema Cat { a: string } / 42           stmts 1, tail number
   CONTROL  42 43                                   stmts 2, tail null, diags []
```

Reading the table:

- **Fixtures 1, 2, 3 are the defect**, one per arrangement. Each keeps part of
  what the author wrote, discards the rest, and reports nothing.
- **1c bounds it to resolvable text.** Two unresolved names raise two codes.
- **1d and 3b are the position asymmetry.** The same missing separator and the
  same `-1` are rejected in the object body's field-type position.
- **2a is the parity that does hold.** The dangling `|` is silent at both
  positions; the field's lowering degrades further, to `{}`.
- **4 shows the parser already discriminates the two arrangements' outcomes.**
  The next-line residue leaves the capture with zero arms and draws
  `empty-schema-body`; only the same-line residue is silent.
- **1f shows the silence is `.theta`-specific**, and that the `.thetalib`
  diagnostic names statement placement rather than the declaration.
- **6 shows the tail-promotion consequence is the general one.** A severed
  residue is not tail-promotable, exactly as the second statement of any
  same-line pair is not.

## Expected behaviour (what the spec says)

- [Grammar Appendix](../spec_topics/grammar.md) `:171–176`:
  `SchemaDecl ::= "schema" Ident SchemaShape`, with
  `AliasRhs ::= Type ("|" Type)*` and `UnionRhs ::= Type ("|" Type)+`. Two
  `Type` atoms with no `|` between them are not an `AliasRhs`; a trailing `|`
  with nothing behind it is not one either.
- `grammar.md:102`: `LiteralType ::= STRING | NUMBER | BOOLEAN | NULL`. `-1`
  is a `PrimitiveLit` of the value sublanguage, whose `"-" NUMBER` alternative
  (`:20–24`, the unary-minus row at `:22`) has no counterpart in `LiteralType`.
  `schema X = -1` therefore has no `AliasRhs` at all, and the captured `"-"`
  corresponds to no production in either grammar.
- [Schema Declarations](../spec_topics/schemas.md) `:50–60` defines the `=`
  form as a top-level type alias that "composes with every shape from the type
  grammar". It states what the right-hand side may be; it states nothing about
  text that follows a complete one.
- `grammar.md:199` and `:212`: "Statements are separated by newlines … The
  trigger set is closed", and "When no trigger holds, the newline closes the
  statement. There is no semicolon escape". Under `ThetaBody ::= Stmt* Expr?`
  (`:120`) a second statement on the same line therefore has no derivation,
  and the expression statement the parser manufactures for the residue is one.
- Under [DIAG-1](../spec_topics/diagnostics/diagnostic-shape.md#diag-1) and
  [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2) (`:71`,
  `:72`) the registry is the closed authority for what the implementation
  emits. No row's trigger names residue after a complete declaration shape.
  `theta/parse/empty-schema-body` (`code-registry-parse.md:86`) triggers on a
  shape that "yields no usable content (neither fields nor alias arms)" —
  these declarations yield arms. `theta/parse/unsupported-feature` (`:27`)
  triggers on "A theta 1.0-deferred or non-Theta syntactic construct".

The spec therefore prescribes no diagnostic here and does not authorise the
current acceptance either: it defines the declaration's extent and the
statement separator, and the implementation honours neither at this
boundary. Which of the two dispositions the corpus should carry is the
question §Fix pins.

## Actual behaviour / root cause

The capture is bounded by the declaration's own grammar, and nothing owns what
the bound leaves behind.

1. **The stop is silent by construction.** `finishAliasSchema`
   (`theta-document.ts:2294–2312`) makes one `parseType` call and splits it.
   The field-boundary stop (`:2816–2826`) breaks at a depth-0 value-ish token
   whose predecessor is not `|`. Breaking is the whole action: the token is
   left at the cursor, and the function returns a declaration carrying the
   arms it did get.
2. **The residue lands in the one statement-loop arm that reports nothing.**
   The loop's no-progress arm (`:1646–1669`) raises
   `unsupported-feature: … stray '<t>' in statement position` for a `punct`
   token. The tokens the field-boundary stop fires on are precisely the four
   value-ish kinds, each of which starts a legal expression form, so
   `parseForm` returns a form and the arm is not reached. The residue becomes
   an ordinary expression statement, which the parser accepts on any line —
   including the line it shares with the declaration (fixture 6's `42 43`
   control).
3. **The dangling `|` never becomes a statement.** It is consumed by the
   capture, and `splitTopLevel` (`params.ts:616–673`) drops empty segments
   (`:619`, `:658–662`). There is no token left for any statement-level
   disposition to see, which is why this arrangement's only comparison is the
   field position — where the trailing `|` survives into `typeSource`
   (`"string|"`) and is dropped by the same split at lowering.
4. **`-` at an arm start is captured deliberately.** The `-` stop
   (`:2772–2781`) is scoped to `armComplete && !atArmStart`, because at an arm
   start a `-` stop would empty the right-hand side and route the declaration
   to `empty-schema-body`. The arm-start capture yields `"-"`;
   `lowerTypeSource` (`body-type-lowering.ts:131–154`) recognises neither a
   literal nor a type expression in it and returns `{}`, so a declaration the
   grammar does not spell lowers to the fragment that admits every JSON value.
5. **The object body has the rule the alias position lacks.**
   `parseSchemaObjectBody` (`:2408–2431`) requires a comma between fields and
   raises against the boundary token when one is missing, for the reason its
   comment gives: a swallowed newline inside the brace body would otherwise
   coalesce two fields silently. The alias right-hand side has one separator
   (`|`) and no rule requiring it, so the analogous coalescence — two arms
   written with no `|` — is unreported.

## Why it matters

- The declaration the author wrote is not the declaration that loads, and
  nothing says so. `schema X = Cat Cat` yields the alias `Cat`; the second
  name contributes nothing. `schema X = Cat |` yields a one-arm alias where
  the `|` says a second arm was intended.
- `schema X = -1` lowers to `{}`, so a `params:` field or `@<T>` annotation
  naming `X` validates nothing. That is the accept-anything outcome
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) narrowed
  and 0033's lowering work removed for every arm shape the lowerer recognises;
  this arm shape is not one, and the input reaches it with no diagnostic.
- Three inputs the grammar does not admit are inside the GOV-15 loads-cleanly
  set (`source-language-stability.md:9`), which means a later decision to
  reject them is a stability question rather than a bug fix, and needs the
  [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
  (`:25`).
- Before 0033's fix the whole shape reached the statement loop, so the `=` hit
  the no-progress arm and drew an error-severity `stray '='`: 0033
  §Reproduction records "A single-type alias (`schema Name = string`) fires
  `stray '='` alone", and the witness file's pre-fix signature table
  (`tests/schema-alias-union-decl.test.ts:80–106`, probed at `b1caedf8` /
  0.44.0) records `NAME  stray '=' alone` at `:85`. These three fixtures were
  not themselves probed pre-fix; the mechanism that made them loud is the one
  those rows record. The fix moved them from rejected-for-the-wrong-reason to
  accepted-in-part.
- The same declaration text is loud in a `.thetalib` and silent in a `.theta`,
  and the `.thetalib` code (`thetalib-top-level-statement`) names statement
  placement rather than the declaration.
- The two `Type` positions answer differently for the same defect, so an
  author cannot transfer what the object form taught them to the alias form.

## Non-goals

- **The general same-line statement permissiveness.** The parser accepts two
  statements on one line at every position — `42 43`, `Cat Cat`, `let a = 1 a`
  all load clean, and in each the second statement loses tail promotion
  (`theta-document.ts:1687–1702`) — where `grammar.md:199`/`:212` separate
  statements by newlines with a closed trigger set and no semicolon escape.
  That class is pre-existing, wider than this boundary, and unfiled. It is the
  factual basis of 0033's residual rationale, quoted in §Fix, and this report
  does not propose changing it.
- **Whether a negative numeric literal should be a `Type`.** No `Type`
  position in the implementation carries one (`schema S { a: -1 }` drops the
  field list), and `grammar.md:102` gives `LiteralType` no unary-minus
  alternative. Making `-1` capture whole is a grammar change in a shared path.
  In scope here is only that `schema X = -1` reports nothing about the arm it
  did keep.
- **0033's other recorded residuals.** (ii) generic union arms keeping the
  permissive `{}` at field parity — filed as
  [0043](./0043-union-nonprimitive-arm-lowers-permissive.md), which owns the
  lowering of a well-formed arm the lowerer mishandles, where this report owns
  a declaration whose arm list is malformed; (iii) the
  `unknown-identifier` / `unresolved-named-type` double emission for
  keyword-shaped names; (iv) `grammar.md:109`'s inline-`{}`
  `empty-schema-body` rule; and (v) the two spec-undecided `by` shapes. All are
  distinct classes, recorded in
  [0033](./0033-body-level-schema-alias-unsupported.md) §Fix (0.45.0) and not
  covered by the fixtures here.

  The `{}` of fixture 3 (`schema X = -1`) is not 0043's frame: it comes from
  `lowerTypeSource` receiving the single junk arm `"-"`, not from a union split
  that captured a generic arm whole.
- **The `stray '<t>' in statement position` rendering itself.** The
  `<construct>` placeholder of `theta/parse/unsupported-feature` renders from
  the closed token-name table of
  [placeholder-rendering-a.md](../spec_topics/diagnostics/placeholder-rendering-a.md)
  §3 (`:43–68`), which lists neither `stray '<t>' in statement position` nor
  `schema fields must be comma-separated`. Neither string occurs anywhere under
  `docs/spec_topics/` (`rg "stray '"`, `rg "in statement position"`,
  `rg "must be comma-separated"` are all empty; the only registered code whose
  name contains "stray" is `theta/parse/stray-backslash`,
  `code-registry-parse.md:16`). That mismatch is pre-existing at both emission
  sites and unfiled. It bears on §Fix constraint (i) and is not this report's
  subject.

## Fix (0.52.0)

The §Fix below leaves the disposition open between rejecting the residue and
keeping the pinned silence, and settles the constraints either way. The
disposition taken is **rejection**, inside those four constraints. Line anchors
are at the fix commit.

**Why rejection.** Keeping the silence is a no-op against the tree, and the
evidence §Fix records for the other side is the evidence this report adds: the
declaration's own content is malformed in fixtures 2 and 3 (a dropped arm, a
`"-"` arm lowering to `{}`) and fixture 2 reaches no statement at all, so
0033's rationale — that the residue reduces to the language's silent no-op
expression-statement class — holds for fixture 1's severed token and for
nothing else; the object-body position rejects the same missing separator
(fixture 1d) and the same `-1` (3b); and the next-line arrangement (fixture 4)
is already loud. Constraint 2's discrimination is what makes the narrow rule
reachable, so the general same-line statement permissiveness §Non-goals
excludes stays untouched: `42 43` still loads clean.

**The code.** `theta/parse/malformed-alias-rhs` (E, parse) is registered in
`code-registry-parse.md` immediately before `theta/parse/empty-enum-body` and
mirrored in `docs/reference/diagnostics.md` — a DIAG-2 same-commit landing
covered within a 1.x minor by the GOV-15 diagnostic-registry carve-out.
Constraint 1's two candidates were both refused as §Fix requires:
`empty-schema-body`'s trigger is a shape yielding neither fields nor alias
arms, and these declarations yield arms; `unsupported-feature` would need a
third freeform tail in the closed `<construct>` table of
`placeholder-rendering-a.md` §3, which is a GOV-7 / GOV-8 table edit that would
also have to reconcile the two tails already emitted unlisted (§Non-goals). The
*Message* uses only `<X>`, the established category-7 identifier-shaped
placeholder `empty-schema-body` already renders, so the closed placeholder
surface is untouched. The owning spec sentence is `schemas.md` §Type-alias /
union schema, mirrored in `docs/reference/schema-subset.md`.

**The rule, in two shapes.** `finishAliasSchema` splits the captured
right-hand side once and reads the split two ways: `splitTopLevelSegments`
(`params.ts`) returns every top-level `|`-delimited segment INCLUDING the empty
ones, and `splitTopLevel` is now its non-empty filter, so the arm granularity
`lowerTypeSource` re-derives is unchanged by construction.

- *Empty arm position* — the segment count exceeds the arm count, i.e. a
  top-level `|` had no `Type` on one of its sides (`schema X = Cat |`,
  `= | Cat`, `= Cat || Cat`). Anchored at the declaration's own range: the
  empty segment was never a token, so there is nothing else to point at.
- *Same-line residue* — otherwise, the token at the cursor is one the capture's
  own stops fire on (`isAliasResidueHead`: an `ident`, `keyword`, `string` or
  `number`, or a punct among `@`, a backtick, `(`, `[`, `!` and `-`) and it
  begins on the same source line as the declaration's last consumed token.
  Anchored at that token, mirroring the object body's own boundary-token
  emission. The line comparison is constraint 2's discrimination, read off
  `Token.range.start.line`; the next-line arrangement stays silent whether the
  newline survives (`schema X = Cat` + a next-line `let`) or a trailing `>` /
  `=` continuation swallowed it (`schema X = array<integer>` + a next-line
  `let`), because in the second case the right-hand side still ends at its last
  arm ahead of that line's first token.

The empty-arm shape is tested first, so `schema X = Cat || Cat` — which is
both, the lexer emitting `||` as one token — emits exactly once.

**Nothing else moved.** The declaration keeps the arms it captured and its
range, the severed residue keeps whatever statement-loop disposition it already
had, tail promotion is untouched, and lowering is untouched — the junk `"-"`
arm of fixture 3 still lowers to `{}` (0043's frame, refused here at parse
rather than repaired downstream). This is not incidental: it is what puts the
change inside the carve-out, whose in-scope condition is that an edit's only
effect is the appearance of a code's emission. The verifier's branch-partition
neutralisation is the evidence — with the emission disabled, 26 of the 108
witness cells red and the remaining 82, which pin arms, ranges, statement
kinds, tail promotion, lowered `$defs` and every pre-existing diagnostic, stay
green.

**The inputs moved out of the GOV-15 loads-cleanly set** (constraint 3, whose
set is defined post-hoc over the diff) are named by the registry *Trigger* and
are: fixtures 1, 1b, 2, 3, 5a–5d, 6, and the same arrangement at the `by`
spelling, the inline-object arm, the generic arm, the `params:` spelling, the
`.thetalib` spelling, the leading and doubled `|`, and the six punct residue
heads. Fixtures 1c and 3a were never in the set — they already carried
error-severity diagnostics — and gain the new code beside their existing ones.
Fixture 4 keeps `empty-schema-body` alone. The *Trigger* also names what stays
outside the row, verified in both directions: a stray `,` / `)` / `=` / `}` at
the boundary keeps `theta/parse/unsupported-feature`, a `{` keeps
`theta/parse/bare-object-literal`, and an operator absorbed into the arm
(`schema X = Cat +`) leaves no boundary token and is not this row's subject
(*Residuals* (i)).

**The witness pins were rewritten, not deleted** (constraint 4). Cells n11
(both halves), n24 and n29 of `tests/schema-alias-union-decl.test.ts` carry new
expected lists and new assertion messages stating the reasoning that now holds;
the file's `it` count is unchanged at 77 and every control — the bare declared
name, the field dangling `|`, the field `-1` — is untouched and green. The
field-position controls (fixtures 1d, 2a, 3b) are unmoved, as constraint 4
requires: the object body's behaviour is byte-identical.

**Reproduction re-derived at the fix baseline** (`3027a1d9`, 0.51.0, after
0038/0039/0040/0041): every fixture byte-identical to the recorded 0.45.0 table
— **zero drift** in arms, statement kinds, spans, diagnostics, tail promotion
and lowered `$defs`. Only source anchors drifted: `finishAliasSchema`
`:2294–2312` → `:2386`, `parseSchema`'s residual paragraph `:2202–2211` →
`:2298`, the field-boundary stop `:2816–2826` → `:2960`, the `-` stop
`:2772–2781` → `:2943`, `splitTopLevel` `params.ts:616–673` → `:745`.

**Post-fix acceptance set.** Fixtures 1, 1b, 2, 3, 5a–5d and 6: exactly one
error-severity `theta/parse/malformed-alias-rhs`, and the theta is refused.
Fixture 1c keeps its `unresolved-named-type` and `unknown-identifier` and gains
the code between them; 3a keeps its `stray '|'` and gains the code; 1f keeps
`thetalib-top-level-statement` and gains it. Fixtures 1a, 1d, 1e, 2a, 3b, 4,
6a and 6b are byte-identical.

**Gates.** Full default suite 242 files / 3212 tests, typecheck and lint clean.
Both witness files proven red per shape by targeted neutralisation restored
byte-exact (blob hash `1e8d31ff` before and after): the segment-count branch
reds 5 cells, the cursor branch reds 21, disjointly, and the whole emission
reds 26. Live: H8a 7/7 and H9a acceptance 11/11 green, plus a scratch H9a probe
over the real `pi -p` load path — a well-formed control registering and
driving, both malformed shapes refused — green with the fix, red with it
neutralised (`B42 OFFENDER LOADED` against the expected `B42 OFFENDER
REFUSED`), then deleted. No committed `.theta` / `.thetalib` in the repo emits
the code, so `tests/fixtures/h7a/permitted-codes.json` was correctly left
alone — verified by the H9a run.

**Residuals.** (i) An operator with no operand behind it is absorbed INTO the
arm rather than left at the boundary, so `schema X = Cat +` keeps the junk arm
`"Cat+"`, lowers to `{}` and stays silent, where `schema X = Cat + 1` fires at
the severed `1` — out of this report's frame (a capture that completes and
leaves text behind), and closed here only by the *Trigger* naming it as outside
the row; the general case is arm-text validation against the type grammar,
which is shared by all four `Type` positions. (ii) The field position keeps its
own dispositions unchanged — `schema S { a: string | }` is still silent and
still lowers the field to `{}`, and `schema S { a: -1 }` still draws
`empty-schema-body` — so the two `Type` positions still answer differently for
the dangling `|`, in the opposite direction from the one this report opened
with. (iii) `grammar.md` §Newline continuation's closed trailing-trigger table
omits the bare `=` the lexer implements; pre-existing, and no clause of this
fix relies on it. (iv) The `stray '<t>' in statement position` and `schema
fields must be comma-separated` tails remain absent from
`placeholder-rendering-a.md` §3's closed table (§Non-goals); this fix coined no
third tail, choosing a new code instead.

## Fix

Not yet decided. The settled question is the disposition — reject same-line
residue loudly, or keep the pinned silence — and the constraints below are
settled either way.

0033's recorded rationale for the silence is that the residue reduces to an
existing class: its §Fix (0.45.0) *Residuals* (i) reads "Same-line resolvable
residue after a complete declaration loads silently (n11/n24's family, incl.
`schema X = -<number>` yielding a junk `"-"` arm) — pinned as observed; a
later loud disposition needs the GOV-15 carve-out", and the parser states the
same at `theta-document.ts:2202–2211`: the residue "takes the language's
ordinary disposition for that statement: silent when the name resolves (a bare
declared-name expression statement is a no-op wherever it is written) …
Recorded, not repaired: a code raised for the residue here would have to be
raised for the same statement everywhere else." The witness cell n11
(`tests/schema-alias-union-decl.test.ts:1857`) carries the same reasoning, and
fixture 6's `42 43` control confirms the class is real and general.

0033's review round 3 recorded the counter-consideration (finding F3 of that
round in the fix run's records; the per-round review files are not in the tree
— §Provenance): the two cases are distinguishable, because the stop token sits
on the same source line as the last captured token, and pre-fix these inputs
at least drew a loud `stray '='`. The evidence above adds three points on that side — the
declaration's own content is malformed in fixtures 2 and 3 (a dropped arm, a
`"-"` arm lowering to `{}`) and never reaches the statement loop at all in
fixture 2; the object-body position rejects fixtures 1d and 3b; and the
next-line arrangement (fixture 4) is already loud.

Constraints on any resolution:

1. **A rejection needs an honestly-triggered code.** Assess candidates against
   the registry, not against convenience.
   `theta/parse/empty-schema-body` (`code-registry-parse.md:86`) does not fit:
   its trigger is a shape yielding "neither fields nor alias arms", and these
   declarations yield arms. `theta/parse/unsupported-feature` (`:27`) is a
   governance question rather than a drop-in: its `<construct>` placeholder
   renders from the closed token-name table of `placeholder-rendering-a.md`
   §3 (`:43–68`), and that page's opening paragraph (`:5`) states the table
   "carr[ies] the same GOV-7 / GOV-8 governance posture as the
   category-to-placeholder map itself", with `:7` making any new placeholder
   or category move "a spec-versioned breaking change governed by **GOV-7**
   and **GOV-8**". A new freeform tail is therefore a table edit under those
   rules — and the two tails already emitted in this area
   (`stray '<t>' in statement position`,
   `schema fields must be comma-separated`) are absent from the table, so the
   edit has to reconcile them rather than add a third unlisted tail
   (§Non-goals). A new code is a DIAG-2 operation
   (`diagnostic-shape.md:72`).
2. **The same-line / next-line discrimination is implementable.** `Token.range`
   carries `start.line` (`src/lexer/lexer.ts:38–59`), and the ranges in
   fixtures 1 and 3 show the discrimination in the parsed output: the
   declaration ends and the residue begins on one line (line 5 col 15 → col 16;
   line 4 col 13 → col 13). 0033's review round 3 (F3) recorded this. A
   disposition scoped to the same-line case therefore does not require the
   wider statement-separator change §Non-goals excludes.
3. **Any change moves inputs out of the GOV-15 loads-cleanly set.** All three
   fixtures load with zero error-severity diagnostics today
   (`source-language-stability.md:9`), so making any of them reject relies on
   the
   [diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#diagnostic-registry-carve-out)
   (`:25`), which is "in-scope as an addition for inputs newly brought into
   the code's emission set". The carve-out's input set is defined post-hoc
   over the diff, so the resolution names the inputs it moves — including
   fixture 5's members, which are the same arrangement with other token kinds.
4. **The witness pins are updated deliberately, never silently.** Cells n11
   (`tests/schema-alias-union-decl.test.ts:1857`), n24 (`:2193`) and n29
   (`:2334`) each assert an empty diagnostic list and carry the reasoning for
   it in their assertion messages, and n11's and n24's controls pin the
   comparison positions. A resolution that rejects any arrangement rewrites
   those cells and their messages; one that keeps the silence leaves them and
   records the decision. Neither outcome may be reached by deleting a cell.
   The field-position controls (fixtures 1d, 2a, 3b) belong to the acceptance
   set either way: a change at the alias position that also moves the object
   body's behaviour is out of scope.

The fixtures above are the acceptance set for either disposition: 1c and 4
must keep their current diagnostics, and 1, 2, 3 and 5 must converge on one
disposition a rule names.

## Provenance

- Origin: bug 0033's review rounds 2–5 — round 2 finding F3 (the same-line
  resolvable-residue disposition), round 3's dangling-`|` observation and its
  finding on distinguishing the same-line stop, and round 5's residual list —
  landed as
  [0033](./0033-body-level-schema-alias-unsupported.md) §Fix (0.45.0)
  *Residuals* (i) and as the parser comment at
  `src/parser/theta-document.ts:2202–2211`. The uncommitted local run artefact
  `.pi/tmp/fixes/0033-report.md` records the review shape ("R2: 4 (punct
  absorption, per-arm checks, same-line residue disposition, seam docs)", five
  rounds with "4 residuals" recorded at R5) and the residual itself ("(i)
  same-line resolvable residue silent (incl. `= -<number>` junk arm)"). It
  also records the fix baseline (`b1caedf8`, 0.44.0) at which 0033's
  §Reproduction rows were re-derived. The per-round review files are not
  in the tree; the round attributions are as recorded in that artefact and in
  the witness file's group headers (`tests/schema-alias-union-decl.test.ts:359`
  "REVIEW ROUND 2, F3", `:2186–2190` round 3's dangling-`|` observation,
  `:2305` round 4's `-` boundary).
- Spec: `docs/spec_topics/grammar.md:102` (`LiteralType`), `:120`
  (`ThetaBody`), `:129` (empty-tail final value), `:171–176`
  (`SchemaDecl` / `SchemaShape` / `AliasRhs` / `UnionRhs`), `:199`–`:212`
  (§Newline continuation — the closed trigger set, newline separation, no
  semicolon escape); `docs/spec_topics/schemas.md:50–60` (§Type-alias / union
  schema); `docs/spec_topics/diagnostics/code-registry-parse.md:27`
  (`unsupported-feature`), `:61` (`unknown-identifier`), `:86`
  (`empty-schema-body`), `:89` (`unresolved-named-type`), `:108`
  (`thetalib-top-level-statement`);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1), `:72`
  (DIAG-2 and its GOV-15 carve-out disposition);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:5` (the closed
  token-name table's GOV-7 / GOV-8 posture), `:7` (§Closure — a new
  placeholder or category move is a GOV-7 / GOV-8 breaking change), `:43–68`
  (§3 Syntactic-construct placeholder and the closed `<construct>` table);
  `docs/spec_topics/governance/source-language-stability.md:9` (the
  loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
  User-facing reference: `docs/reference/grammar.md:278`,
  `docs/reference/schema-subset.md:56–58`.
- Implementation evidence at HEAD `f959f8de`:
  `src/parser/theta-document.ts:544–586` (`SchemaDecl`, `arms` at `:576`),
  `:1646–1669` (the punct-only no-progress arm), `:1687–1702` (tail promotion
  requires `lineStart`), `:2184–2212` (`parseSchema`'s doc comment, the
  residual paragraph at `:2202–2211`), `:2213–2250` (the four-way dispatch),
  `:2294–2312` (`finishAliasSchema`), `:2408–2431` (the object body's comma
  rule), `:2697–2726` (`parseType`'s doc comment on the field-boundary and
  arm-boundary stops), `:2772–2781` (the `-` completed-arm stop), `:2816–2826`
  (the field-boundary stop); `src/parser/params.ts:616–673`
  (`splitTopLevel`, empty segments dropped);
  `src/parser/body-type-lowering.ts:131–154` (`lowerTypeSource`), `:238–245`
  (the alias arm lowering call); `src/lexer/lexer.ts:38–59` (`Token.range`
  carries the line).
- Test evidence at HEAD: `tests/schema-alias-union-decl.test.ts:359–364`
  (group (n)'s fixtures), `:1846–1898` (group (n), cells n11 and its
  unresolvable half), `:2185–2219` (group (s), cell n24 and the field
  control), `:2305–2386` (group (u), cells n28 and n29 and the field control),
  `:414–421` (the `-` boundary fixtures: the two `-1` spellings at `:418–419`
  and the field control at `:421`).
- Reproduction: scratch vitest at HEAD over the fixtures quoted above (the
  three arrangements; the bare-name, three-atom, unresolvable, object-field,
  comma-present and `.thetalib` controls; the dangling-`|` and `-1` field
  controls; the next-line arrangement; the five further same-line members; the
  `params:` lowering of each declaration; and the tail-promotion pairs
  including the `42 43` general control), run on the signatures recorded
  above, then deleted per scratch policy.
