# Bug 0277 — An unapplied generic-constructor head (`Result`, `array`) or a `Result` value constructor (`Ok`, `Err`) written in a type position derives from no `Type` production, yet is admitted at five of the nine type-reference captures and lowers to the empty type there: `let a: Result = 3` and `fn f(): Result { 3 }` load and register with the binding's own type check silently disabled, while the same four spellings draw `theta/parse/reserved-keyword-as-identifier` at the four captures whose reserved-keyword sink is unfiltered

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3 because no legal source moves and no value
  is wrong: an APPLIED head (`Result<integer, string>`, `array<integer>`) is
  silent at all nine captures because it never reaches the classification this
  report is about (§Reproduction, `APPLIED` rows), and the only inputs at issue
  are unapplied spellings that derive from no `Type` alternative. The silence is
  not inert, which is why it is not S4: a `let` annotation spelled `Result`
  lowers to the empty type and the position's own check stops firing —
  `let a: Result = 3` loads where `let a: integer = "s"` draws
  `theta/parse/let-rhs-type-mismatch`. Not S2: nothing correct is refused
  anywhere. D2 because the fix must reconcile three records that disagree —
  the type grammar, the withheld set bug 0274 landed
  (`src/parser/theta-document.ts:7486`) and the V20g-T conformance theta that
  drives `fn step(): Result` as legal source
  (`tests/conformance/production-conformance.test.ts:460`) — and the choice
  between narrowing the code and widening the grammar is itself the work.
- **Kind:** defect — source no production derives is accepted at five capture
  positions and refused at four, and at the five it disables the position's
  type check. `Type` has six alternatives
  (`docs/spec_topics/grammar.md:90`–`:95`): a bare `Result` is not a
  `PrimitiveType` (`:97`), not a `NamedType ::= Ident` (`:98` — a reserved
  keyword is not an `Ident`, `docs/spec_topics/lexical.md:20`), not a
  `GenericType` (`:99`–`:100`, each alternative spelling its own `"<" … ">"`),
  not an `ObjectType`, not a union and not a `LiteralType`. `docs/spec_topics/lexical.md:20`
  states the boundary directly: "keeping them reserved is what stops them
  matching `NamedType ::= Ident`, while the generic-application production in
  [Grammar Appendix — Type grammar] makes each reachable as a **parameterised**
  type". No `Type` production spells `Ok` or `Err` at all.
- **Affected** (every citation re-derived at HEAD `0b4d1621`;
  `src/parser/theta-document.ts` is 9296 lines and `src/parser/params.ts` 2224
  lines at HEAD):
  - `src/parser/params.ts:822` — `if (RESERVED_KEYWORDS.has(s))`, the atom
    arm's reserved branch. It is reached only after the generic-application arm
    has declined the text (no `<…>` was written), and it stands immediately
    ahead of the `IDENTIFIER.test(s)` arm at `:852` that resolves
    `NamedType ::= Ident`. That adjacency is what settles the registry
    question below: the text IS read where an `Ident` is read.
  - `src/parser/params.ts:849` — `lowerCtx.reservedKeywords?.push(s)`, the
    optional out-parameter that publishes the class, and `:850` — `return {}`,
    the empty lowered type the position keeps when the caller discards the
    class. `{}` constrains nothing, which is the inert-annotation half of this
    report.
  - `src/parser/params.ts:681` — `RESERVED_KEYWORDS = reservedKeywords()`, read
    from the lexer's own set, and `:819` — the `PRIMITIVE_TYPES` test ahead of
    it, which is why `string` / `number` / `integer` / `boolean` / `null` never
    reach the branch.
  - `src/parser/theta-document.ts:7486` —
    `WITHHELD_TYPE_HEAD_KEYWORDS = new Set(["Result", "array", "Ok", "Err"])`,
    bug 0274's a-scoped withhold, and `:7493`–`:7495` — the
    `admittedReservedKeywords` filter that applies it.
  - The five captures that apply the filter and therefore stay silent:
    `:8177`–`:8178` (`let` annotation), `:8292`–`:8293` (`fn` parameter type),
    `:8336`–`:8337` (`fn` return type), `:8764`–`:8765` (`invoke<Type>`
    ascription), `:8948`–`:8952` (the `@<T>` query capture's `E` argument).
  - The four captures that emit the class unfiltered and therefore refuse:
    `:7837` (`schema X = …` alias/union right-hand side), `:8442` (`schema`
    body field type), `:8917`–`:8918` (the `@<T>` query capture's RESPONSE
    part), and `src/parser/params.ts:240`–`:248` (the `params:` right-hand
    side, which builds the diagnostic itself rather than through
    `reservedKeywordAsIdentifierDiagnostic`).
  - `src/parser/theta-document.ts:7460`–`:7462` — the comment stating that
    `Result` "is never tested as an atom (`lowerTypeExpr`'s
    generic-application arm reads a `ctor` name structurally, never through the
    identifier-resolution arm), so admitting it here is inert". Measured true
    for the APPLIED spelling and false for the unapplied one: an unapplied
    `Result` reaches the atom arm, which is the only reason the withhold has an
    effect at all.
  - `src/parser/theta-document.ts:6486` —
    `reservedKeywordAsIdentifierDiagnostic`, the shared builder; no *Message*
    byte is at issue.
  - `docs/spec_topics/grammar.md:97`–`:100` — the `PrimitiveType`, `NamedType`
    and `GenericType` productions; `:105` — "A bare `Type` appears in `let`
    annotations, `fn` parameter types, schema field types, `params:` field
    types, generic type arguments, union arms, and `invoke<Type>` /
    type-ascription contexts"; `:107` — the closed constructor set, "Applying a
    constructor with a type-argument count other than its declared arity (e.g.
    `array<T, U>` or `Result<T>`) is `theta/parse/generic-arity-mismatch`", and
    "`Result` remains admitted in every other `Type` position". None of the
    three sentences describes a head written with no argument list.
  - `docs/spec_topics/lexical.md:20` — the 32 reserved spellings (`Ok`, `Err`,
    `Result` and `array` among them) and the parameterised-reachability
    sentence quoted under **Kind**.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:21` — the
    `theta/parse/reserved-keyword-as-identifier` row. Its *Trigger* is
    position-free: "Reserved keyword used in an identifier position."
  - `docs/spec_topics/diagnostics/code-registry-parse.md:112` — the
    `theta/parse/unresolved-named-type` row's sentence "A reserved-keyword
    spelling read where a `NamedType` is read is
    `theta/parse/reserved-keyword-as-identifier`'s to report at every position
    alike", which the five silent captures falsify for these four spellings.
  - `tests/conformance/production-conformance.test.ts:454`–`:471` — the V20g-T
    cell whose theta writes `fn step(): Result {` at `:460`. It is the only
    corpus witness for an unapplied head anywhere in the tree.
  - `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts` —
    bug 0274's 14-cell witness. Group (X) (`:594`, `:610`) pins the silence
    this report is about; any fix under route (a) reds it by construction.
  - `docs/examples/personas.thetalib:7` and `docs/examples/summarise-doc.theta:10`
    — the committed corpus's only constructor-head spellings, both APPLIED
    (`Result<integer, QueryError>`, `array<string>`); covered by
    `tests/committed-fixture-parse-gate.test.ts`.
- **Observed at:** HEAD `0b4d1621`, v0.272.0, `main`, by one offline
  provider-free scratch probe over `parseDoc` (`tests/helpers/e2e-s1.ts`),
  token `b0277scratch`, removed after measurement; sweep clean.

## Summary

Four reserved spellings — `Result`, `array`, `Ok`, `Err` — reach the atom arm
of `lowerTypeExpr` only when written with no argument list, because the
generic-application arm consumes every spelling that carries one. At the atom
arm they are classified as reserved keywords read where an `Ident` is read
(`params.ts:822`) and lowered to the empty type (`:850`), and the class is
published through an optional out-parameter (`:849`).

Nine captures consume that out-parameter. Four render it unfiltered and refuse:
the `schema` alias/union right-hand side, the `schema` body field type, the
`@<T>` query annotation's response part, and the `params:` right-hand side.
Five render it through `admittedReservedKeywords`, whose withheld set holds
exactly these four spellings (`theta-document.ts:7486`), and therefore stay
silent: the `let` annotation, the `fn` parameter type, the `fn` return type,
the `invoke<Type>` ascription, and the query capture's `E` argument.

The withheld set was derived for the APPLIED heads — `array<T>` and
`Result<T, E>` are legal, and the committed corpus spells both. Measured, the
set has no effect on those: an applied head never reaches the atom arm, so it
is silent at all nine captures including the four that filter nothing. The set
therefore withholds only the unapplied spellings, which are the ones no `Type`
production derives.

The silence carries a second consequence. Because the unapplied head lowers to
`{}`, the annotation constrains nothing: `let a: Result = 3` and
`let a: Ok = 3` load and register, where `let a: integer = "s"` draws
`theta/parse/let-rhs-type-mismatch`. The author writes an annotation and gets
no annotation.

One record disagrees with the grammar reading: the V20g-T conformance theta
writes `fn step(): Result {` (`:460`). Measured at HEAD, the same theta loads
clean when the annotation is spelled `Result<integer, QueryError>` and when it
is dropped entirely, so that cell's coverage does not depend on the unapplied
spelling.

## Reproduction

Offline, provider-free. Parse each source through `parseDoc`
(`tests/helpers/e2e-s1.ts`, the shipped whole-file entry point wrapped in inert
deps) and read the unfiltered `doc.diagnostics`. Registration is the
composition root's own gate mirrored: a document carrying an error-severity
`theta/parse/…` diagnostic is not registered (`hasLoadParseError`,
`src/extension/production-composition.ts:1570`).

Every source below carries the frontmatter `---\nmode: prompt\n---`, so the
body starts at line 4. Bodies, one per position:

| position | body |
| --- | --- |
| `query-T-head` | ``let r = @<SP>`q` `` |
| `query-E-arg` | ``let r = @<Result<integer, SP>>`q` `` |
| `fn-return` | `fn step(): SP { Ok(1) }` |
| `fn-param` | `fn step(p: SP): integer { 1 }` |
| `let-annot` | `let a: SP = Ok(1)` |
| `invoke-ascr` | `let r = invoke<SP>("./x.theta", "hi")` |
| `schema-field` | `schema S { f: SP }` |
| `schema-alias` | `schema S = SP` |
| `params-field` | frontmatter `params:\n  p: 'SP'` |

`RESERVED` below is `theta/parse/reserved-keyword-as-identifier`. `reg=N` means
the document is not registered.

| `SP` | query-T-head | query-E-arg | fn-return | fn-param | let-annot | invoke-ascr | schema-field | schema-alias | params-field |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Result` | RESERVED `@4:9–4:21`, reg=N | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | RESERVED `@4:1–4:23`, reg=N | RESERVED `@4:1–4:18`, reg=N | RESERVED `@4:6–4:14`, reg=N |
| `array` | RESERVED `@4:9–4:20`, reg=N | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | RESERVED `@4:1–4:22`, reg=N | RESERVED `@4:1–4:17`, reg=N | RESERVED `@4:6–4:13`, reg=N |
| `Ok` | RESERVED `@4:9–4:17`, reg=N | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | RESERVED `@4:1–4:19`, reg=N | `theta/parse/empty-schema-body` `@4:1–4:11`, reg=N | RESERVED `@4:6–4:10`, reg=N |
| `Err` | RESERVED `@4:9–4:18`, reg=N | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | RESERVED `@4:1–4:20`, reg=N | `theta/parse/empty-schema-body` `@4:1–4:11`, reg=N | RESERVED `@4:6–4:11`, reg=N |
| APPLIED `Result<integer, string>` | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | `result-in-schema-position`, reg=N | `result-in-schema-position`, reg=N | `result-in-schema-position`, reg=N |
| APPLIED `array<integer>` | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y |

The `Ok` / `Err` `schema-alias` cells are the alias parser reading the spelling
as a declaration head before the type side runs; the other eight cells of those
two rows behave as the `Result` row does. The two APPLIED rows are the control:
the refusals they draw at the three lowered-schema positions are
`theta/parse/result-in-schema-position`'s, an unrelated row, and nothing they
draw is the keyword class. Every diagnostic listed carries
`reserved keyword '<SP>' cannot be used as an identifier` — the registry's
*Message* for the row, unmodified.

**The never-legal contrast, same nine bodies.** `match` and `return` draw
RESERVED at all six of the non-schema positions listed above (`@4:9` at
`query-T-head`, `query-E-arg` and `invoke-ascr`; `@4:1` at `fn-return`,
`fn-param` and `let-annot`), each `reg=N`. Those are the cells bug 0274
landed. The four spellings in the table are the only ones the withhold
separates from them.

**The annotation is inert, not merely unrefused.**

| source | diagnostics | registered |
| --- | --- | --- |
| `let a: Result = 3` | SILENT | yes |
| `let a: Result = "s"` | SILENT | yes |
| `let a: Ok = 3` | SILENT | yes |
| `let a: Err = 3` | SILENT | yes |
| `let a: array = 3` | SILENT | yes |
| `let a: integer = "s"` (control) | `theta/parse/let-rhs-type-mismatch` `@4:1` | no |
| `fn f(): Result { 3 }` | SILENT | yes |
| `fn f(): array { 3 }` | SILENT | yes |

**The arity contrast.** An applied head of the wrong arity IS refused at the
five filtered captures, so the silence is specific to the zero-argument
spelling: `fn f(): Result<integer> { Ok(1) }`,
`fn f(): array<integer, string> { [1] }` and `let a: Result<integer> = Ok(1)`
each draw `theta/parse/generic-arity-mismatch` `@4:1`, `reg=N`.

**The nesting contrast.** The head inside a legal application is silent at the
filtered captures too: `fn step(): array<Result> { Ok(1) }` and
`let a: array<Ok> = [1]` are SILENT and register, while
`schema S { f: array<Result> }` draws RESERVED `@4:1` at the unfiltered
capture. `let a: Result | null = Ok(1)` is SILENT and registers.

**The conformance theta, three spellings.** The V20g-T source
(`fn step(): Result {\n  let x = Ok(41)?\n  Ok(x + 1)\n}\nstep()`) is SILENT at
HEAD; so is the same theta with the annotation spelled
`Result<integer, QueryError>`, and so is the same theta with no return
annotation at all (`fn step() {`). FN-3's inference wraps a `?`-carrying body in
`Result<T, QueryError>` regardless (`docs/spec_topics/functions.md:16`, `:28`).

## Expected behaviour

`Type` has six alternatives and an unapplied `Result`, `array`, `Ok` or `Err`
derives from none of them, so the reading of such a spelling does not depend on
which capture holds it. One reading, all nine captures.

The registered row that reading falls under is
`theta/parse/reserved-keyword-as-identifier`, whose *Trigger* names no
position: "Reserved keyword used in an identifier position"
(`code-registry-parse.md:21`). The spelling satisfies that *Trigger* at each of
the nine, and for the same structural reason at each: the generic-application
arm has already declined it, so `params.ts` classifies it in the branch
(`:822`) that stands immediately ahead of the `NamedType ::= Ident` resolution
(`:852`) — the position where an identifier is read. The four unfiltered
captures already report exactly this.

`code-registry-parse.md:112` states the same expectation from the neighbouring
row: a reserved spelling read where a `NamedType` is read is that row's to
report "at every position alike".

A type annotation constrains the position it annotates. A `let` annotation that
lowers to `{}` and silently suppresses `theta/parse/let-rhs-type-mismatch` is
not an annotation the author wrote, whichever verdict the head itself earns.

## Actual behaviour / root cause

The class is computed once and rendered under two policies.

`collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts:608`) walks a
captured type text and publishes reserved spellings through the optional
`reservedKeywords` out-parameter that `params.ts:849` pushes into. Nine call
sites in `src/parser/theta-document.ts` and `src/parser/params.ts` pass a sink.
Four render every entry:

- `theta-document.ts:7837` — `schema X = …` alias/union arms.
- `theta-document.ts:8442` — `schema` body field types.
- `theta-document.ts:8917`–`:8918` — the `@<T>` query annotation's response
  part.
- `params.ts:240`–`:248` — the `params:` right-hand side.

Five render `admittedReservedKeywords(hits)` (`theta-document.ts:7493`), which
drops every member of `WITHHELD_TYPE_HEAD_KEYWORDS` (`:7486` —
`["Result", "array", "Ok", "Err"]`): `:8178` (`let`), `:8293` (`fn` parameter),
`:8337` (`fn` return), `:8765` (`invoke<Type>`), `:8952` (query `E` argument).

The withheld set is spelling-keyed with no argument-list condition, and that is
the whole of the defect. The set was derived to protect the legal APPLIED heads
— `docs/bugs/0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md`
§Fix (0.272.0), "at those five sites it admits only reserved spellings the type
grammar never admits as a type head". Measured at HEAD, it protects none of
them: an applied head is consumed structurally by the generic-application arm
and never reaches `params.ts:822` at all, which is why
`Result<integer, string>` and `array<integer>` are silent at the four captures
that filter nothing (§Reproduction, APPLIED rows). Everything the set actually
withholds is a zero-argument spelling, and the grammar derives none of those:
`GenericType`'s two alternatives each spell their own `"<" … ">"`
(`grammar.md:99`–`:100`), and `lexical.md:20` says the constructor keywords are
reachable "as a **parameterised** type".

The same file's own comment at `:7460`–`:7462` states the structural fact and
draws the opposite conclusion from it — that admitting `Result` is "inert". It
is inert for the applied spelling only.

The empty lowered type is the second half. `params.ts:850` returns `{}` for
every spelling that reaches the reserved branch. At the four unfiltered
captures that value is never consumed, because the refusal denies registration.
At the five filtered ones it is the annotation the position keeps, so the
position's own checks run against a type that admits everything —
`let a: Result = 3` (§Reproduction).

`Ok` and `Err` sit in the same set for a different reason: no `Type` production
spells either, at any arity, so they are not heads the grammar admits anywhere.
Bug 0274 §Fix records them as withheld under "the ruling's conservative
enumeration rather than a grammar clause".

**Where the behaviour sits against each owning record.**

- `docs/bugs/0274-…` §Fix (0.272.0) owns the withheld set and states the
  a-scoping as deliberate: "the four already-wired callers are behaviourally
  byte-identical, so `@<Result>` and `@<match>` refuse exactly as they did …
  and finding (4) is not repaired in passing". Its residual 1 records the split
  and hands it here. Recorded, not owned.
- `code-registry-parse.md:21`'s *Trigger* is position-free and its own
  neighbour at `:112` says "at every position alike". Nothing in either
  sentence excludes a type-legal-looking spelling from an identifier position,
  and the seam confirms the position IS the identifier position. No registry
  edit is owed under this report either; five positions entering the emission
  set makes the behaviour match the row as registered, exactly as the four
  prior widenings of that row's emission set did (0044 v0.54.0, 0148 v0.81.0,
  0153 v0.194.0, 0249 v0.240.0, none of which edited the row).
- `grammar.md`'s `Type` productions admit no unapplied head, and `:107`'s
  arity sentence covers only a head written WITH an argument list. The one
  sentence a reader might stretch — "`Result` remains admitted in every other
  `Type` position" — is about `result-in-schema-position`'s scope, not about
  arity, and §Reproduction's APPLIED rows show that admission is intact.
- V20g-T's pin (`tests/conformance/production-conformance.test.ts:460`) is the
  only record on the other side. It asserts a runtime outcome (`?` unwraps
  `Ok(41)`, the fn returns `Ok(42)`) and reaches it identically under an
  applied annotation and under no annotation, so the pin's subject is not the
  unapplied spelling.
- `docs/bugs/0044-unresolved-named-type-fires-for-keyword-shaped-text.md`
  §Fix (0.54.0) landed the classification that keyword-shaped text is not a
  `NamedType` and must be dispositioned before resolution — the ordering at
  `params.ts:819`–`:852` this report reads. Its scope is which ROW a keyword
  spelling answers to, not which positions render it, so the five silent
  captures are outside what it settled.

## Why it matters

An author writes `fn step(): Result` or `let a: Result` — the shape the
conformance corpus itself spells — and gets a theta that registers with the
annotation discarded. Every check that annotation exists to drive stops firing
at that position: `let a: Result = "s"` and `fn f(): Result { 3 }` both load.
The author's evidence that the annotation means something is that the file
loads.

The same four spellings refuse at four other captures, so moving the identical
text into a `schema` field, a `schema` alias, a `params:` field or an `@<T>`
response part turns a clean load into a refused one. A reader who learns the
rule at one position learns it wrong for the other.

`Ok` and `Err` are the sharper case: they are not type heads at any arity, so
`let a: Ok = 3` and `fn f(p: Err): integer { 1 }` are text with no reading at
all, admitted silently.

Both effects are on inputs the grammar does not derive, which is what keeps
this below the wrong-behaviour band: no legal source changes verdict either
way.

## Non-goals

- **Bug 0274's landed a-scoped wiring is not reopened.** The five captures now
  emit the keyword class, the twenty admitted spellings refuse there
  (`match` / `return` measured above), and the seven authorized tripwire flips
  at 0.272.0 — cells D3a–D3d in
  `tests/b0262-unresolved-named-type-reference-positions.test.ts`, e10 in
  `tests/fn-param-name-reserved-keyword.test.ts`, r5 in
  `tests/inline-object-field-name-case.test.ts`, h5's two fixtures in
  `tests/reserved-keyword-type-position.test.ts` — stay flipped. Only the
  withheld set's membership condition is at issue.
- **The never-legal keyword class is settled.** The twenty spellings
  `admittedReservedKeywords` admits are not revisited; their disposition is
  0274's and, at the other positions, 0044's, 0148's, 0153's and 0249's.
- **The APPLIED heads stay admitted everywhere the grammar admits them.**
  `array<T>` at all nine captures and `Result<T, E>` outside the three
  lowered-schema positions are legal, spelled by the committed corpus
  (`docs/examples/personas.thetalib:7`,
  `docs/examples/summarise-doc.theta:10`) and covered by
  `tests/committed-fixture-parse-gate.test.ts`. No route here touches them.
- **`theta/parse/result-in-schema-position` is not in scope.** It is the row
  the APPLIED rows draw at the three lowered-schema positions and it is
  correct there.
- **A `Result` application of the WRONG arity is silent at the `@<T>` query
  annotation** — `@<Result<integer>>` and
  `@<Result<integer, string, boolean>>` are both SILENT and register, where
  `@<array<integer, string>>` draws `theta/parse/generic-arity-mismatch`
  `@4:9` and the same `Result<integer>` text draws it at a `let` annotation and
  an `fn` return. Measured at HEAD during this report's sweep. It is the
  response-annotation peel's behaviour, not the keyword class's, and is a
  separate subject; no document exists for it yet.

## Fix

One reading for one spelling at all nine captures. Two routes; each is
adjudicable against the constraints below, and the choice is which record
moves — the code or the grammar.

**Route (a) — the grammar reading stands; the withhold goes.** Make
`admittedReservedKeywords` the identity (delete
`WITHHELD_TYPE_HEAD_KEYWORDS` and the filter, `theta-document.ts:7486`–`:7495`,
and render each of the five sinks directly, as the four unfiltered captures at
`:7837`, `:8442`, `:8918` and `params.ts:240` already do). Every unapplied
`Result` / `array` / `Ok` / `Err` then draws
`theta/parse/reserved-keyword-as-identifier` at all nine, at each site's
existing sibling range, and no registration decision for legal source changes.
No code is minted and no *Message* byte moves — the row's *Trigger* is
position-free.

Route (a) requires two same-commit edits, both bounded:

1. `tests/conformance/production-conformance.test.ts:460` — respell the V20g-T
   theta's annotation as `Result<integer, QueryError>` or drop it. Measured:
   the cell's assertions (`r.outcome === "success"`, `result.ok === true`,
   payload `42`) hold under both spellings and under no annotation, so the
   cell's subject (`?` propagation) is preserved rather than weakened.
2. `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`
   group (X) — the thirteen rows that lock the withhold (`:594`, `:610`) invert
   to refusals. That flip is a tripwire in another report's witness and needs
   the same authorization discipline 0274's seven flips carried, plus a dated
   coordination note in
   `./0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md`.

Route (a) leaves the inert-annotation half moot at these four spellings, since
a refused document does not register. It does not address `{}` as a lowering
for a refused atom in general — that is `params.ts:850`'s shared behaviour for
every keyword spelling and is already covered by the refusal at every position
route (a) reaches.

**Route (b) — the grammar admits the unapplied head.** Add a `Type`
alternative for a bare `Result` (and decide `array`, which has no defensible
element-free meaning), state what it constrains, and then wire the four
currently-unfiltered captures to admit it as well, so the reading is uniform in
the other direction. Route (b) owes:

1. `docs/spec_topics/grammar.md:99`–`:100` and `:107` — the new production and
   its arity rule's interaction with `theta/parse/generic-arity-mismatch`.
2. `docs/spec_topics/lexical.md:20` — the "parameterised type" sentence, which
   currently forecloses exactly this.
3. A defined checking behaviour, so `let a: Result = 3` refuses on the value
   side instead of loading (`params.ts:850` cannot keep returning `{}`).
4. A separate disposition for `Ok` / `Err`, which no `Type` production spells
   at any arity and which route (b) therefore does not legalise — they refuse
   under either route.
5. Flips at the four unfiltered captures' own witnesses, and a GOV-15 reading
   for every input those flips newly admit.

Route (b) is strictly larger and moves normative pages; route (a) moves one
conformance annotation and one witness group. Whichever is taken, `Ok` and
`Err` end up refused at all nine captures and
`code-registry-parse.md:112`'s "at every position alike" becomes true unedited.

**Locks — all must stay green, and the flips named above are the only cells
authorized to move.**

- `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts` —
  14 cells; groups (E), (F), (T) and (C) unmoved, group (X) flipped only under
  route (a) and only with the coordination note.
- `tests/live/b0274live-reserved-keyword-type-head-registration.test.ts` — the
  live registration cell. Its control theta spells `fn step(): Result { … }`
  and `let xs: array<integer> = [41]`; under route (a) the first must be
  respelled with an applied head, since the control's purpose is that a legal
  theta registers AND drives.
- `tests/b0273-query-result-error-side-unresolved-name.test.ts` — bug 0273's
  10-cell witness, and its live H8a cell 89 — the
  `E`-side name walk, its seen-set and its emission count.
- `tests/conformance/production-conformance.test.ts` — V20g-T, 27/27,
  including the `?`-propagation cell after any respelling.
- `tests/committed-fixture-parse-gate.test.ts` — 36/36; the corpus-wide "no
  shipped source moves" claim is discharged here, not by a scratch probe.
- The cells 0.272.0 flipped, all still flipped: D3a–D3d
  (`./0262-unresolved-named-type-silent-at-nine-reference-positions.md`), e10
  (`./0148-reserved-keyword-fn-parameter-position-silent.md`), r5
  (`./0154-inline-object-type-field-name-rules-unenforced.md`), h5
  (`./0044-unresolved-named-type-fires-for-keyword-shaped-text.md`).
- `tests/reserved-keyword-remaining-identifier-positions.test.ts` — bug 0153's
  76 cells.
- `tests/fixtures/h7a/permitted-codes.json` — byte-unchanged under either
  route; no code is minted.
- `npm test`, `npm run typecheck`, `npm run lint`.

**Ordering.** No blocking dependency. The report shares its seam with
`./0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md`,
which is fixed at 0.272.0; a fix here edits that report's landed set and its
witness group (X), so the coordination note belongs in the same commit.

## Provenance

Bug 0274's fix record hands this subject over: residual 1 of
`.pi/tmp/fixes/0274-report-ruled.md` ("Finding (4) — the parent files it") and
the same residual restated in
`./0274-reserved-keyword-in-result-error-argument-silent-at-query-capture.md`
§Fix (0.272.0). The premeasure `.pi/tmp/fixes/0274-report.md` recorded the
same asymmetry under an unscoped sink, where V20g-T redded. Residual 2 of both
reports hands over the `Ok` / `Err` half.

Filed in the seventeenth fix-open-bugs session at HEAD `0b4d1621`, v0.272.0.
Every citation above re-derived at that HEAD. All measurements are this
report's own, taken by one offline provider-free probe over `parseDoc` (token
`b0277scratch`, deleted after the sweep): the nine-position × six-spelling
matrix with diagnostics, ranges, messages and registration; the never-legal
`match` / `return` contrast; the inert-annotation table; the arity and nesting
contrasts; and the V20g-T theta under three annotation spellings. The
measurements restate bug 0274's residual 1 for the four wired captures it named
and extend it to the three it did not (`schema` field, `schema` alias,
`params:`), which is what shows the split is exactly filtered-versus-unfiltered
rather than a single anomalous capture.
