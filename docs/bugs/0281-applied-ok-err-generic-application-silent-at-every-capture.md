# Bug 0281 — An APPLIED `Ok<…>` / `Err<…>` spelling derives from no `Type` production at any arity, yet the type-application seam reads its head as an arbitrary constructor name and refuses nothing: `let a: Ok<integer> = "not-an-integer"`, `fn f(): Err<string> { 3 }` and `schema S { f: Ok<integer> }` load clean and register at all nine type-reference captures, with the annotation lowered to the empty type so the position's own check stops firing

- **Status:** fixed (0.277.0).
- **Sev/Diff estimate:** S3/D2 — S3 because no legal source moves: no committed
  `.theta` / `.thetalib` spells `Ok<…>` or `Err<…>` (34 files, `git ls-files`
  + `grep`), the legal applied heads `Result<T, E>` and `array<T>` are untouched
  by the head the defect is about, and the inputs at issue derive from no `Type`
  alternative. Not S4, because the silence is not inert: the annotation lowers
  to `{}`, so `let a: Ok<integer> = "not-an-integer"` loads where
  `let a: integer = "s"` draws `theta/parse/let-rhs-type-mismatch`
  (§Reproduction, inert table). Not S2: nothing correct is refused. D2 because
  the head is admitted at two independent seams — the type-grammar application
  parse (`src/parser/type-grammar.ts:766`–`:769`) and `lowerTypeExpr`'s
  generic-application arm (`src/parser/params.ts:769`–`:812`) — and because the
  code the refusal answers to is a decision the fix owes rather than inherits:
  the not-expression family has no wired emitter at two of the nine captures
  (§Fix), and bug 0277's witness group (K) pins the current silence as a
  control and must be re-founded under this document's authority.
- **Kind:** defect — source no production derives is admitted at every capture
  and, at the five value-side captures, silently replaces the author's
  annotation with a type that constrains nothing. `Type` has six alternatives
  (`docs/spec_topics/grammar.md:90`–`:95`); `GenericType` has two, each
  spelling its own head (`:99`–`:100` — `"array" "<" Type ">"` and
  `"Result" "<" Type "," Type ">"`). `docs/spec_topics/grammar.md:107` states
  the closure directly: "`GenericType` is a closed set in theta 1.0: `array`
  (arity 1) and `Result` (arity 2). No other identifier is parameterisable".
  `docs/spec_topics/lexical.md:20` reaches the constructor keywords only "as a
  **parameterised** type" and names exactly `array` and `Result` as doing so.
  No `Type` production spells `Ok` or `Err` at any arity, applied or unapplied.
- **Affected** (every citation re-derived at HEAD `8b39e071`;
  `src/parser/type-grammar.ts` is 1745 lines and `src/parser/params.ts` 2221
  lines at HEAD):
  - `src/parser/type-grammar.ts:766`–`:769` — the head-agnostic application
    fallback in `TypeParser.parsePrimary`: after the closed-set test at `:762`
    (`name in GENERIC_ARITY && this.peek()?.text === "<"`) declines, any
    identifier followed by `<` is still parsed as an application
    (`if (this.peek()?.text === "<") { return this.parseGeneric(name); }`). Its
    comment states the intent — "so the arity check fires" — which holds only
    for a head the arity table knows.
  - `src/parser/type-grammar.ts:475`–`:478` — `GENERIC_ARITY`, frozen at
    `{ array: 1, Result: 2 }`. `Ok` and `Err` are absent, which is why the
    fallback's arity check is a no-op for them.
  - `src/parser/type-grammar.ts:777`–`:800` — `parseGeneric`, which records the
    head verbatim (`return { kind: "generic", ctor, args }`, `:800`) with no
    membership test.
  - `src/parser/type-grammar.ts:1498`–`:1512` — `walkType`'s `"generic"` arm,
    the only place a generic node is judged: `GENERIC_ARITY[node.ctor]` at
    `:1500`, and the arity diagnostic at `:1503`–`:1509` guarded by
    `expected !== undefined`. An unknown head yields `undefined` and the arm
    emits nothing about the head itself; `:1510` scopes
    `theta/parse/result-in-schema-position` to `node.ctor === "Result"`.
    `:1741` is the walk's `default: return`, so no other arm reaches the head.
  - `src/parser/type-grammar.ts:220`–`:240` — `parseTypeExpression`, the shared
    entry every capture's position check runs through, and `:198`–`:208` — the
    `"inline-object-shape"` rule set that withholds `generic-arity-mismatch`,
    which is why the `invoke<Type>` ascription is silent for a wrong-arity
    `Result` too (§Reproduction, controls).
  - `src/parser/params.ts:769`–`:812` — `lowerTypeExpr`'s generic-application
    arm: `const ctor = s.slice(0, lt).trim()` (`:772`), the `array` arity-1
    branch (`:791`), and the catch-all "Any other generic (e.g.
    `Result<T, E>`…): resolve nested named types best-effort, lower
    permissively" whose `return {}` stands at `:812`. `Ok<integer>` and
    `Err<string>` take that catch-all.
  - `src/parser/params.ts:815`–`:848` — the atom arm the applied spelling never
    reaches: `// Atom.` (`:815`), `RESERVED_KEYWORDS.has(s)` (`:819`), the sink
    push (`:846`) and the `NamedType ::= Ident` resolution at `:849`. This is
    the seam bug 0277's fix unfiltered, and the reason that fix cannot reach an
    applied spelling.
  - `docs/spec_topics/grammar.md:90`–`:100` — the six `Type` alternatives and
    the two `GenericType` productions; `:105` — the position list and the
    sentence assigning text that derives from none of the six alternatives to
    `theta/parse/annotation-type-not-expression` at the `let` annotation, the
    `fn` parameter type and the `fn` return type, and to
    `theta/parse/schema-type-not-expression`,
    `theta/load/params-type-not-expression` and
    `theta/parse/query-annotation-type-not-expression` at the schema field,
    alias/union arm, `params:` and author-written `@<T>` positions; `:107` —
    the closed constructor set and "No other identifier is parameterisable".
  - `docs/spec_topics/lexical.md:20` — the 32 reserved spellings, `Ok` and
    `Err` among them, and the parameterised-reachability sentence, which names
    `array` and `Result` alone.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:21` — the
    `theta/parse/reserved-keyword-as-identifier` row, whose *Trigger* is
    position-free; `:65` — `theta/parse/generic-arity-mismatch`, scoped by its
    own *Trigger* to "the closed `GenericType` set (`array` arity 1, `Result`
    arity 2)", so an unknown head is outside it as registered; `:106`, `:107`,
    `:108` — the three parse-phase not-expression rows; `:112` — the
    `theta/parse/unresolved-named-type` row, whose subject is a `NamedType`
    head, not a constructor head.
  - `docs/spec_topics/diagnostics/code-registry-load.md:20` —
    `theta/load/params-type-not-expression`, the `params:` position's member of
    the same family.
  - `tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:691`–`:721`
    — bug 0277's witness group (K), which pins the four applied-spelling cells
    K1–K4 and the unfiltered K5 (`schema S { f: Ok<integer> }`) as SILENT and
    registering, stating in its own header comment that "What an applied value
    constructor SHOULD mean in a type position is no part of this report's
    subject". Those five cells are this document's subject and flip under any
    fix here.
  - `docs/bugs/0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`
    §Fix (0.275.0) residual 1 — the handover quoted under §Provenance.
- **Observed at:** HEAD `8b39e071`, v0.275.0, `main`, by one offline
  provider-free scratch probe over `parseDoc` (`tests/helpers/e2e-s1.ts`) and
  `lowerTypeExpr` (`src/parser/params.ts`), token `b0281scratch`, removed after
  measurement; sweep clean.

## Summary

An applied spelling carries an argument list, so it is consumed structurally
rather than as an atom: `TypeParser.parsePrimary` reads any identifier followed
by `<` as a generic application (`type-grammar.ts:766`–`:769`) and
`lowerTypeExpr`'s generic-application arm reads the text before the `<` as a
constructor name (`params.ts:772`). Neither seam tests that name against the
closed set. The only judgement a generic node then receives is `walkType`'s
arity check, which is keyed on `GENERIC_ARITY` and returns silently for a head
the table does not hold (`type-grammar.ts:1500`).

`Ok` and `Err` are heads the table does not hold, and no `Type` production
spells either at any arity. Measured at HEAD, `Ok<integer>` and `Err<string>`
draw nothing at eight of the nine type-reference captures and register — the
five that bug 0277 unfiltered (`let` annotation, `fn` parameter type, `fn`
return type, `invoke<Type>` ascription, the `@<T>` capture's `E` argument) and
three of the four that were never filtered (`schema` body field type, `@<T>`
response part, `params:` right-hand side). The ninth, the `schema X = …` alias,
refuses for an unrelated reason: the alias parser reads `Ok` as the declaration
head before any type-side pass runs, so the cell draws
`theta/parse/empty-schema-body` and two `theta/parse/unsupported-feature`, and
says nothing about the type.

The silence is not inert. `lowerTypeExpr("Ok<integer>")` returns `{}` with both
sinks empty, so a `let` annotation spelled that way constrains nothing:
`let a: Ok<integer> = "not-an-integer"` loads and registers, where
`let a: integer = "s"` draws `theta/parse/let-rhs-type-mismatch`. The author
writes an annotation and gets no annotation — the same consequence bug 0277
measured for the unapplied head, reached by a different seam.

Bug 0277's fix deleted an atom-arm filter. An applied spelling never reaches
the atom arm (`params.ts:815`), which is why that fix does not and cannot reach
this class, and why its witness pins these cells as a control (group (K),
`tests/b0277-…test.ts:691`).

## Reproduction

Offline, provider-free. Parse each source through `parseDoc`
(`tests/helpers/e2e-s1.ts`, the shipped whole-file entry point wrapped in inert
deps) and read the unfiltered `doc.diagnostics`. Registration is the
composition root's own gate mirrored: a document carrying an error-severity
`theta/parse/…` diagnostic is not registered (`hasLoadParseError`,
`src/extension/production-composition.ts:3011`, consulted at `:1570`).

Every source carries the frontmatter `---\nmode: prompt\n---`, so the body
starts at line 4, and a `"ok"` tail where one is required. Bodies, one per
position (`SP` is the spelling under test):

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

**The subject, 9 × 2.** `SILENT` is the empty diagnostic list; `reg=Y` means
the document registers.

| `SP` | query-T-head | query-E-arg | fn-return | fn-param | let-annot | invoke-ascr | schema-field | schema-alias | params-field |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Ok<integer>` | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | `empty-schema-body` `@4:1–4:11` + `unsupported-feature` `@4:14–4:15`, `@4:22–4:23`, reg=N | SILENT, reg=Y |
| `Err<string>` | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | `empty-schema-body` `@4:1–4:11` + `unsupported-feature` `@4:15–4:16`, `@4:22–4:23`, reg=N | SILENT, reg=Y |

Sixteen of the eighteen cells are silent and register. The two `schema-alias`
cells refuse the declaration, not the type: `schema S = Ok<integer>` is read as
an alias whose right-hand side never reaches a type-side pass, exactly as bug
0277 measured for the unapplied `Ok` / `Err` (`docs/bugs/0277-…md`
§Reproduction). Nothing in either cell names the head.

**Control 1 — the unapplied heads, refused at HEAD.** Bug 0277's landed
behaviour (0.275.0), re-measured here: `Ok` and `Err` draw
`theta/parse/reserved-keyword-as-identifier` at eight positions, each `reg=N`
— `@4:9–4:17` / `@4:9–4:18` (`query-T-head`), `@4:9–4:34` / `@4:9–4:35`
(`query-E-arg`), `@4:1–4:24` / `@4:1–4:25` (`fn-return`), `@4:1–4:30` /
`@4:1–4:31` (`fn-param`), `@4:1–4:18` / `@4:1–4:19` (`let-annot`),
`@4:9–4:38` / `@4:9–4:39` (`invoke-ascr`), `@4:1–4:19` / `@4:1–4:20`
(`schema-field`), `@4:6–4:10` / `@4:6–4:11` (`params-field`); `schema-alias`
draws `theta/parse/empty-schema-body` `@4:1–4:11`, `reg=N`. Adding an argument
list to the same head converts every one of those refusals into the silence in
the table above.

**Control 2 — the legal applied heads stay legal.** `array<integer>` is SILENT
and registers at all nine positions. `let a: Result<integer, string> = Ok(1)`
and `schema E { m: string }` + `fn f(): Result<integer, E> { Ok(1) }` are both
SILENT and register. `Result<integer, SomeError>` with `SomeError` undeclared
draws `theta/parse/unresolved-named-type` at the six value-side positions —
bug 0262's widening reading the error-side name — and, at the three
lowered-schema positions, `theta/parse/result-in-schema-position` beside it.
Neither row names the head.

**Control 3 — wrong arity on a head the table holds.** `Result<integer>` draws
`theta/parse/generic-arity-mismatch` at `query-T-head` `@4:9–4:30`,
`fn-return` `@4:1–4:37`, `fn-param` `@4:1–4:43`, `let-annot` `@4:1–4:31`,
`schema-field` `@4:1–4:32`, `schema-alias` `@4:1–4:27` and `params-field`
`@4:6–4:23`, all `reg=N`; it is SILENT at `query-E-arg` and `invoke-ascr`, the
two positions bug 0278's §Non-goals and the `"inline-object-shape"` rule set
(`type-grammar.ts:198`–`:208`) already account for. `Ok<integer>` and
`Err<string>` draw nothing at any of the nine, at any arity:
`let a: Ok<integer, string, boolean> = 3` is SILENT and registers.

**The annotation is inert, not merely unrefused.**

| source | diagnostics | registered |
| --- | --- | --- |
| `let a: Ok<integer> = "not-an-integer"` | SILENT | yes |
| `let a: Ok<integer> = 3` | SILENT | yes |
| `let a: Err<string> = 3` | SILENT | yes |
| `let a: Ok<integer, string, boolean> = 3` | SILENT | yes |
| `fn f(): Ok<integer> { "s" }` | SILENT | yes |
| `let a: Ok<integer> \| null = 3` | SILENT | yes |
| ``let r = @<Result<integer, Err<string>>>`q` `` | SILENT | yes |
| `let a: integer = "s"` (control) | `theta/parse/let-rhs-type-mismatch` `@4:1–4:21` | no |

**What the lowering yields.** `lowerTypeExpr` called directly with an empty
`bodyTypeMap` and both sinks empty:

| text | lowered | `reservedKeywords` | `unresolved` |
| --- | --- | --- | --- |
| `Ok<integer>` | `{}` | `[]` | `[]` |
| `Err<string>` | `{}` | `[]` | `[]` |
| `Result<integer, string>` | `{}` | `[]` | `[]` |
| `array<integer>` | `{"type":"array","items":{"type":"integer"}}` | `[]` | `[]` |
| `Ok` | `{}` | `["Ok"]` | `[]` |
| `integer` | `{"type":"integer"}` | `[]` | `[]` |

The applied spelling publishes nothing to either sink — no capture has anything
to render — and lowers to the empty type, which is what the `let` row above
measures downstream. The unapplied spelling publishes `Ok`, which is the sink
bug 0277's fix wired at all nine captures.

**Adjacency, measured and outside this report's subject.** An arbitrary
undeclared head with an argument list behaves identically: `Nope<integer>` is
SILENT and registers at all nine positions, while the unapplied `Nope` draws
`theta/parse/unresolved-named-type` `@4:1–4:16` at a `let` annotation, `reg=N`.
The admission is the head-agnostic application parse, not a property of the two
reserved spellings; see §Non-goals.

**Where the not-expression family is wired.** `integer--`, the canonical junk
this family names, draws `theta/parse/annotation-type-not-expression` at
`let-annot` and `theta/parse/schema-type-not-expression` at `schema-field`,
but is SILENT at `invoke-ascr` (`invoke<integer-->(…)`) and at `query-E-arg`
(``@<Result<integer, integer-->>`q` ``). Those two positions have no wired
emitter of that family at HEAD, which constrains the code choice in §Fix.

## Expected behaviour

`Ok<integer>` and `Err<string>` derive from no `Type` production. `GenericType`
has two alternatives, each spelling its own head (`grammar.md:99`–`:100`), the
constructor set is closed and "No other identifier is parameterisable"
(`:107`), and `lexical.md:20` makes the constructor keywords reachable only as
parameterised `array` / `Result`. `Ok` and `Err` appear in no `Type`
alternative at any arity.

Text with no reading is refused, and the reading does not depend on which
capture holds it — the same one-reading-nine-captures conclusion bug 0277
landed for the unapplied spelling. Each of the nine captures refuses
`Ok<…>` / `Err<…>` and denies registration, at that capture's existing sibling
range.

A type annotation constrains the position it annotates. A `let` annotation that
lowers to `{}` and silently suppresses `theta/parse/let-rhs-type-mismatch` is
not an annotation the author wrote.

The registry row the refusal answers to is a bounded decision this report does
not pre-empt, because the two candidates are each incomplete as registered and
§Reproduction measures why: `theta/parse/reserved-keyword-as-identifier`
(`code-registry-parse.md:21`) is wired at all nine captures and its *Trigger* is
position-free, but names an identifier position, while the applied head is read
in constructor-head position and never reaches the atom arm; the
not-expression family (`grammar.md:105`, rows at `code-registry-parse.md:106`,
`:107`, `:108` and `code-registry-load.md:20`) is the family the grammar
assigns to text deriving from none of the six alternatives, but has no wired
emitter at the `invoke<Type>` ascription or the `@<T>` capture's `E` argument.
`theta/parse/generic-arity-mismatch` is not a candidate: its *Trigger*
(`:65`) is scoped to the closed set, and `Ok` is not a member at any arity.

## Actual behaviour / root cause

The head is never tested against the closed set, at either seam that reads it.

**Seam 1 — the type-grammar application parse.** `TypeParser.parsePrimary`
tests the closed set first (`type-grammar.ts:762`), then falls through to a
head-agnostic application arm: any identifier followed by `<` is parsed as a
generic application (`:766`–`:769`), and `parseGeneric` stores the head
verbatim (`:800`). The fallback's own comment gives the reason — the arity
check should fire — but the arity check is a table lookup:
`GENERIC_ARITY[node.ctor]` (`:1500`) is `undefined` for `Ok` and `Err`, and the
diagnostic at `:1503`–`:1509` is guarded by `expected !== undefined`. The
`"generic"` arm's only other rule is scoped to `node.ctor === "Result"`
(`:1510`). `walkType`'s switch ends in `default: return` (`:1741`), so no arm
judges the head itself. The node is walked, its arguments are checked, and the
head is discarded.

**Seam 2 — the lowering.** `lowerTypeExpr` splits at the first `<`
(`params.ts:770`–`:772`), special-cases `array` at arity 1 (`:791`), and lowers
every other head "permissively", returning `{}` (`:812`). The atom arm below it
— the reserved-keyword classification at `:819` and the sink push at `:846`
that all nine captures now render — is reached only when the
generic-application arm declines, which an applied spelling never makes it do.

Bug 0277 removed the withhold sitting on that atom arm. That is a correct fix
for the class that reaches the atom arm and structurally cannot reach this one,
which is why its witness pins these cells as measured controls rather than as
targets (`tests/b0277-…test.ts:691`–`:721`, group (K)).

The empty lowered type is the second half. `{}` constrains nothing, so at the
five value-side captures the position's own checks run against a type that
admits everything: `let a: Ok<integer> = "not-an-integer"` loads. At the
lowered-schema captures the same `{}` is a permissive field schema, and the
`Result`-specific guard that would otherwise fire there
(`theta/parse/result-in-schema-position`, `type-grammar.ts:1510`) is keyed on
the head and so does not apply — `schema S { f: Ok<integer> }` registers with a
constraint-free field.

**Where the behaviour sits against each owning record.**

- `docs/bugs/0277-…md` §Fix (0.275.0) residual 1 records this class as measured
  and unreached, and its witness group (K) pins the five cells. Recorded, not
  owned: those cells state the current silence, so a fix here flips them and
  they need re-founding under this document's authority (§Fix).
- `docs/bugs/0274-…md` withheld `Ok` and `Err` as spellings; that set is
  deleted and the unapplied spellings refuse (§Reproduction, control 1). The
  applied spelling was never in that set's reach.
- `docs/bugs/0262-…md` §Fix widened `theta/parse/unresolved-named-type` to ten
  reference positions, whose subject the row states as "A `NamedType` that
  resolves to no declaration" (`code-registry-parse.md:112`). An applied head
  is a constructor head, not a `NamedType`, and is not read through the
  resolution arm (`params.ts:849`) at all — measured: `Nope<integer>` is silent
  where the bare `Nope` refuses. Whether that row should widen to constructor
  heads is a question this report leaves to §Fix's code choice rather than
  assuming.
- `docs/bugs/0278-…md` settled the `Result` arity gate at the query response
  ascription. Its subject is a head the closed set holds; `Ok` and `Err` are
  not heads at all, so no arity rule reaches them.

## Why it matters

`Ok<integer>` and `Err<string>` are the last spelling class the grammar cannot
derive that still registers at every capture. An author who reads `Ok(1)` in a
body and writes `fn f(): Ok<integer>` in a header gets a theta that loads, and
every check the return annotation exists to drive stops firing — the body
`"s"` is admitted under it. The evidence the author has that the annotation
means something is that the file loads.

The behaviour also contradicts the rule bug 0277 landed one version earlier at
the same seam-adjacent captures. `fn f(): Ok` refuses at all nine positions;
`fn f(): Ok<integer>` refuses at none. A reader who learns that `Ok` is not a
type head learns nothing that predicts the applied spelling, and the
correction — adding an argument list — is the edit that removes the diagnostic.

Both effects are on inputs no `Type` production derives, and no committed
`.theta` / `.thetalib` spells one, which is what keeps this out of the
wrong-behaviour band: no legal source changes verdict.

## Non-goals

- **Bug 0277's landed unapplied-head refusals are not reopened.** The nine
  captures render the reserved-keyword sink directly and the unapplied `Result`
  / `array` / `Ok` / `Err` refuse (§Reproduction, control 1). Only the applied
  spelling is at issue.
- **Bug 0278's arity gate is untouched**, as is the `"inline-object-shape"`
  rule set that leaves `invoke<Type>` outside the arity check
  (`type-grammar.ts:198`–`:208`).
- **The legal applied heads stay legal.** `array<T>` at all nine captures and
  `Result<T, E>` outside the three lowered-schema positions are the grammar's
  own (`grammar.md:99`–`:100`, `:107`), spelled by the committed corpus and
  covered by `tests/committed-fixture-parse-gate.test.ts`. No route here
  touches them.
- **Bug 0274's reserved-keyword class is settled** for the unapplied spellings
  at every position; this report adds no member to that class and mints no
  keyword.
- **An arbitrary undeclared head with an argument list (`Nope<integer>`,
  silent at all nine — §Reproduction, adjacency) is outside this report's
  subject.** `Ok` and `Err` are reserved spellings the grammar names; `Nope` is
  an undeclared identifier, whose disposition touches
  `theta/parse/unresolved-named-type`'s widened reach and owes its own GOV-15
  reading. No document covers it. A route here that gates the head against the
  closed set would refuse it in passing, which is a scope decision §Fix names
  rather than a side effect to be discovered.
- **`theta/parse/result-in-schema-position` is not in scope.** It is correct
  for the head it names.

## Fix

One reading for one spelling at all nine captures: an applied `Ok<…>` /
`Err<…>` refuses and denies registration. Two routes, and one code decision
that both owe.

**Route (a) — gate the head at the application seam.** The head is read in two
places and neither tests it: add the membership test at
`type-grammar.ts:766`–`:769` (or, equivalently, in `walkType`'s `"generic"` arm
at `:1498` where `GENERIC_ARITY[node.ctor]` is already consulted, `:1500`) and
at `lowerTypeExpr`'s generic-application arm (`params.ts:769`–`:812`). One
judgement then covers every capture at once, because all nine run their
position checks through `parseTypeExpression` (`type-grammar.ts:220`) and their
lowering through `lowerTypeExpr`. Route (a) pins these observables: every cell
of §Reproduction's 9 × 2 table refuses except the two `schema-alias` cells,
which keep the declaration-level refusal they already draw; the inert table's
seven silent rows become refusals; control 2 and control 3 are byte-unchanged,
since neither `array` nor `Result` leaves the closed set.

Route (a) has a scope decision inside it. A gate written as "head not in
`GENERIC_ARITY`" also refuses `Nope<integer>` and every other unknown applied
head, which §Non-goals places outside this subject and which needs its own
GOV-15 in-scope input set. A gate written as "head is a reserved spelling that
is not a constructor keyword" refuses exactly `Ok<…>` / `Err<…>` (and the
other 30 reserved spellings written with an argument list) and leaves the
unknown-head class where it stands. The narrower gate is inside this report's
authority; the wider one is not, and taking it means filing the wider class
first.

**Route (b) — refuse per capture, at the rendering path.** Judge the captured
annotation text at each of the nine captures, as the not-expression family
already does at four of them. Route (b) pins the same subject cells but owes
nine edits instead of two, owes the two positions that have no wired emitter of
that family (`invoke<Type>`, the `@<T>` capture's `E` argument —
§Reproduction, last table), and re-introduces the per-capture divergence bug
0277 removed. It is strictly larger and offers nothing route (a) does not.

**The code decision, owed under either route.** §Expected states the two
candidates and why neither is complete as registered. Whichever is chosen, the
choice is a GOV-15 diagnostic-registry carve-out whose in-scope input set is an
applied `Ok<…>` / `Err<…>` at one of the nine captures and nothing else: every
input in it loads cleanly at HEAD. If
`theta/parse/reserved-keyword-as-identifier` is chosen, verify — do not assume
— that the row's *Trigger* covers a constructor-head position, and edit the row
or the grammar sentence it leans on if it does not. If the not-expression
family is chosen, the two unwired positions gain an emitter, which is itself an
emission-set widening for other junk at those positions and must be measured
before it is taken.

**Flip authority — the cells this report authorizes to move, enumerated.**

- `tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:691`–`:721`,
  group (K), cells K1–K5. They pin the current silence as a measured control
  and invert to refusals under either route. Re-founding them belongs to this
  report: restate the group in place under this document's authority, with a
  dated coordination note in
  `./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`
  recording that its residual 1 is discharged and its control group re-founded.
- No other pinned cell in the tree spells an applied `Ok<…>` / `Err<…>`:
  `git ls-files '*.theta' '*.thetalib'` (34 files) yields no hit for `Ok<` or
  `Err<`, and the only test file carrying either spelling is the b0277 witness
  above.

**Locks — all must stay green.**

- `tests/b0277-…test.ts` — 12 cells; every group but (K) unmoved.
- `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts` —
  14 cells, including X9 and X13, the two APPLIED-head rows.
- `tests/b0262-unresolved-named-type-reference-positions.test.ts` and
  `tests/b0273-query-result-error-side-unresolved-name.test.ts` — the
  name-resolution witnesses; a head gate must not move a `NamedType` verdict.
- `tests/conformance/production-conformance.test.ts` — 27/27, including V20g-T.
- `tests/committed-fixture-parse-gate.test.ts` — 36/36; the corpus-wide "no
  shipped source moves" claim is discharged here, not by a scratch probe.
- `tests/fixtures/h7a/permitted-codes.json` — byte-unchanged unless the code
  decision mints a row, which neither candidate requires.
- `npm test`, `npm run typecheck`, `npm run lint`.

**Ordering.** No blocking dependency. Bug 0277 is fixed at 0.275.0 and this
report's fix edits that report's witness group (K), so the coordination note
belongs in the same commit.

## Provenance

Bug 0277's fix record hands this subject over. Residual 1 of
`./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`
§Fix (0.275.0), quoted: "An APPLIED `Ok<…>` / `Err<…>` at any arity remains
SILENT at every capture, filtered and unfiltered alike — measured, not assumed,
and pinned as a control in the witness's group (K). Route (a) removes an
atom-arm filter, and an applied spelling never reaches the atom arm, so this
fix does not and cannot reach it. No `Type` production spells `Ok` or `Err` at
any arity, so the spelling is still text with no reading; it is a distinct
subject from this report's unapplied class and no document covers it yet." The
same report's §Reproduction APPLIED rows and its §Fix Non-goals record the
applied-head silence as measured and out of route.

Filed in the eighteenth fix-open-bugs session at HEAD `8b39e071`, v0.275.0.
Every citation above re-derived at that HEAD. All measurements are this
report's own, taken by one offline provider-free probe over `parseDoc` and
`lowerTypeExpr` (token `b0281scratch`, deleted after the sweep): the
nine-position × two-spelling subject matrix with codes, ranges and
registration; the unapplied-head control at the same nine positions; the legal
applied heads and the wrong-arity `Result` controls; the inert-annotation
table; the direct lowering table; the unknown-head adjacency; and the
not-expression family's wiring at four of the nine captures.

> Correction (2026-08-25, 0282 filing): the §Provenance sentence
> undercounts the not-expression family wiring — at HEAD 834c3334 the
> family draws at seven of the nine captures (only query-E-arg and
> invoke-ascr are unwired), not four; 0281 §Reproduction measured four
> cells. Measured by 0282 writer (integer-- probe, all nine).

## Fix (0.277.0)

- **Route adjudicated: §Fix route (a), NARROW variant.** §Fix offers the gate
  in two widths and decides the authority itself: "The narrower gate is inside
  this report's authority; the wider one is not, and taking it means filing the
  wider class first." The wider class IS filed
  (`./0282-unknown-applied-generic-head-silent-at-every-position.md`, at this
  HEAD), so the wide gate was implemented first and then MEASURED: written as
  "head not in `GENERIC_ARITY`" it flips eight pinned cells across five witness
  files owned by other reports — `tests/generic-argument-bracket-group-truncation.test.ts`,
  `tests/generic-argument-literal-lowering.test.ts`,
  `tests/inline-object-malformed-entry-resync.test.ts`,
  `tests/inline-object-stranded-entry-refusal.test.ts` and
  `tests/nested-inline-enum-generic-argument-refusal.test.ts`, which use
  `pair<…>`, `map<…>` and a lowercase `result<…>` as inert scaffolding for
  bugs 0164, 0217, 0231, 0236 and 0256. No enumerated flip authority reaches
  them: bug 0282 §Fix's own enumeration searches two spellings
  (`rg "Nope<|Ghost<" tests/`) and is measurably incomplete. The narrow gate
  was taken instead, which is the branch this report already owns.
- **Consequence for the sibling: bug 0282 is NOT discharged and stays open.**
  Its §Fix coordination clause governs this outcome directly — "If the landing
  fix is the narrower one 0281 also describes … no cell of this document moves
  and no note is owed either way." Its document,
  `tests/schema-alias-union-decl.test.ts` and
  `docs/spec_topics/diagnostics/code-registry-parse.md` are byte-unchanged
  against HEAD, hash-verified.
- **What shipped:**
  - `src/parser/params.ts` — one gate in `lowerTypeExpr`'s
    generic-application arm: a head that is a reserved spelling and is not one
    of the two constructor keywords routes onto the existing `reservedKeywords`
    sink and lowers to the empty type no further, so all nine captures refuse
    it through the render bug 0277's fix wired. The two constructor keywords
    are exempted by closed-set membership rather than by name, so the arity
    gate keeps winning for a head the set holds.
  - `src/parser/type-grammar.ts` — `GENERIC_ARITY` exported so both places
    that judge a generic head read one closed set. No behavioural line moves;
    the head-agnostic application fallback and `walkType`'s `"generic"` arm are
    untouched, because the narrow class always lowers and one seam therefore
    covers every capture (pressed as an attack in review round 1 and probed at
    thirteen further nesting and declaration shapes without finding a silent
    escape).
  - `tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts` —
    group (K), cells K1–K5, re-founded in place on the refusal under this
    report's "Flip authority" clause. The only enumerated flip taken; every
    other group is byte-identical.
  - `docs/bugs/0277-…md` — dated coordination note: residual 1 discharged,
    group (K) re-founded here, and an explicit paragraph recording that an
    unknown applied head is untouched.
- **The code decision, discharged:** `theta/parse/reserved-keyword-as-identifier`
  (`code-registry-parse.md:21`), borrowed and not minted. §Fix required this be
  verified rather than assumed: the row's *Trigger* is the single sentence
  "Reserved keyword used in an identifier position." — position-free — and a
  reserved spelling is read where an `Ident` is read (`NamedType ::= Ident`,
  `grammar.md:98`) before any `<` lookahead decides anything, so a
  constructor-head position is already inside it. No DIAG-2 widening is owed,
  no reference mirror moves (`docs/reference/diagnostics.md` transcribes no
  *Trigger* column), and `tests/fixtures/h7a/permitted-codes.json` is
  byte-unchanged. The not-expression family was rejected on measurement: it has
  no wired emitter at `invoke-ascr` or `query-E-arg` (seven of nine at HEAD,
  as the dated correction note above states), so choosing it would owe an
  emission-set widening at two positions.
- **Gates:** witness `tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts`
  14/14 (8 of 14 red at HEAD before the fix, for the filed reason: refusal
  expected, empty list received); `npm test` 455 files / 9359 tests, zero reds;
  `npm run typecheck` clean; `npm run lint` clean; live
  `tests/live/b0281live-applied-reserved-generic-head-registration.test.ts`
  2/2 green under the cross-lane live lock.
- **Review:** 1 round. Round 1 (`bug-fix-reviewer`) — CLEAN, no findings, no
  deep re-review recommended; it independently re-verified the *Trigger*
  reading, probed the early-`return {}` question and the second-seam question
  with its own offline probe, and hash-verified the byte-unchanged set. One
  earlier round was a ROUTE RE-ADJUDICATION, not a review round: the
  implementer stopped correctly on the wide gate's collateral and the
  conversion to the narrow gate was dispatched before review round 1.
- **Verification:** SOLID. Witness red under neutralisation of the gate alone
  and green on restore, `src/parser/params.ts` byte-exact both sides
  (`6e9555512b8d1d1d0a40ccc498258c8f3063865c`); default suite 455/455; lint and
  typecheck clean; the live cell audited statically against the live-suite
  conventions with no violation, and run for real by the orchestrator under the
  lock — green, and red under the same neutralisation naming the registered
  carrier (`b0281liveletannot`) with the applied-closed-set control still
  green.
- **Residuals:**
  1. Bug 0282 stays open and unaltered. Its §Fix "Flip authority" enumeration
     is stale against this tree in two ways its own fixer must widen before
     landing: the `rg "Nope<|Ghost<" tests/` command misses the scaffolding
     heads (`pair<`, `map<`, lowercase `result<`) in the five witness files
     named above, and this report's witness adds a further group of cells
     pinning the unknown-applied-head silence as a measured control. Recorded
     here rather than in that document because its own coordination clause
     states no note is owed under the narrow route.
  2. `Ok<Nope>` draws the head's refusal alone and not the argument's
     `unresolved-named-type`. Measured, not assumed, and it is the registered
     cover rule rather than a suppression: `code-registry-parse.md`'s
     `unresolved-named-type` row states a refusal already drawn over the
     capture's own construct is cover whichever other code it carries. No
     input in the class ends up silent.
  3. Two citation drifts measured against this HEAD and left in place, since
     they change no verdict: `hasLoadParseError` stands at
     `src/extension/production-composition.ts:3053`, not `:3011` as both
     documents cite; and §Reproduction control 3 undercounts the three
     schema-feeding cells, where `Result<integer>` draws
     `generic-arity-mismatch` AND `result-in-schema-position`, not the arity
     line alone.
- **Discharge notes appended:** `docs/bugs/0277-…md` (residual 1 discharged,
  group (K) re-founded). None to `docs/bugs/0282-…md` — none is owed under the
  narrow route, and that document is byte-unchanged.
- **Pinned dispositions / non-goals:** bug 0278's arity gate, bug 0274's
  reserved-keyword class, bug 0262's and bug 0273's `NamedType` verdicts, the
  `"inline-object-shape"` rule set and `theta/parse/result-in-schema-position`
  are all untouched, each locked green by its own witness. The unknown applied
  head keeps its permissive lowering.

## Coordination note (2026-08-25, bug 0282 0.280.0's flip authority — group (D))

Bug 0282 0.280.0 landed (§Fix candidate 1: `theta/parse/unresolved-named-type`,
borrowed, with a same-commit DIAG-2 *Trigger* widening naming the
constructor-head position). Its dated note "Flip-authority widening (pre-fix,
operator-directed)" named this document's own witness group (D) —
`tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts`,
cells `b0281-D` (all nine positions, `Nope<integer>` / `Ghost<string>`),
`b0281-D-declared` (`Foo<integer>` with `schema Foo` declared) and
`b0281-D-nesting` (the four nesting cells) — as measured controls pinning bug
0282's own subject, per its own header comment directing "a re-widening of
the gate reds here". All three inverted wholesale, under bug 0282's
authority, not this document's own:

- `b0281-D`: every one of the eighteen cells moved from `[]` / `reg=true` to
  `theta/parse/unresolved-named-type` naming the head / `reg=false`, at all
  nine positions including the alias — which, unlike this document's own
  reserved-head subject, was never a declaration-parse break, so its ninth
  column is the ordinary refusal.
- `b0281-D-declared`: the applied cell moved from `[]` / `reg=true` to
  `theta/parse/unresolved-named-type` naming `Foo` / `reg=false`; the bare
  `Foo` control (`:645`–`:665` in this file, re-derived after this note's own
  edits) is unmoved.
- `b0281-D-nesting`: the four interior-applied-head cells moved from `[]` /
  `reg=true` to `theta/parse/unresolved-named-type` naming `Nope` /
  `reg=false`; the bare-name nesting controls (`:694`–`:698`, re-derived) are
  unmoved, under bug 0262's landed rule.

Each cell's SUBJECT is preserved: group (D) still measures what an unknown
applied head (or a declared-but-non-parameterisable one) draws at the nine
type-reference positions and one level down inside them — the answer is now
bug 0282's refusal rather than the silence this document's narrow route left
standing. This document's own §Fix record ("bug 0282 is NOT discharged and
stays open... no cell of this document moves and no note is owed either
way") is UNCHANGED by this note: that record described the outcome under the
route actually landed for 0281 (the narrow gate), which remains what shipped
in 0.277.0. This note is bug 0282's own fix documenting the eventual flip of
the group its narrow route left standing, exactly as its coordination clause
anticipated ("If this lands first: bug 0281's group (K)... and its 9 × 2
table flip under this commit" — here, this document's own group (D), which
is the wider fix lane's addition beyond the original enumeration, per bug
0282's dated note residual bullet naming cells 9–11).
