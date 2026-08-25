# Bug 0282 — An UNKNOWN identifier written as a generic head (`Nope<integer>`, `Ghost<string>`, `Foo<integer>` for a declared object schema `Foo`) derives from no `Type` production, yet the head-agnostic application arm in `TypeParser.parsePrimary` consumes it structurally and `walkType`'s only judgement of a generic node is a `GENERIC_ARITY` table lookup that misses: the spelling loads SILENT and registers at all nine type-reference positions, lowered to `{}`, while the same bare name refuses at every one of them under bug 0262's landed `theta/parse/unresolved-named-type` rule

- **Status:** open.
- **Sev/Diff estimate:** S3/D2 — S3 because no legal source moves (the 34
  committed `.theta` / `.thetalib` files spell exactly two applied heads,
  `array<` and `Result<`, both inside the closed set) and because the silence
  drops constraints the author wrote: with `schema Foo { m: string }` declared,
  `let a: Foo = "mismatch"` draws `theta/parse/let-rhs-type-mismatch`
  `@5:1–5:24` and `let a: Foo<integer> = "mismatch"` is SILENT and registers
  (§Reproduction, inert table), and `array<Nope>` refuses where
  `array<Nope<integer>>` does not (§Reproduction, nesting). Not S4: nothing
  in the shipped corpus or in any pinned legal spelling changes verdict. Not
  S2: nothing correct is refused. D2 because the head is admitted at two
  independent seams — the application parse
  (`src/parser/type-grammar.ts:765`–`:769`) and `lowerTypeExpr`'s
  generic-application arm (`src/parser/params.ts:769`–`:812`) — because the
  code the refusal answers to needs a *Trigger* decision measured against the
  registry (§Fix), and because two committed cells pin the current silence as
  a control and flip under any fix here
  (`tests/schema-alias-union-decl.test.ts:369`–`:370`, asserted at `:1846`).
- **Kind:** defect — source that derives from no `Type` production is admitted
  at every type-reference position and replaces the author's annotation with a
  type that constrains nothing. `Type` has six alternatives
  (`docs/spec_topics/grammar.md:90`–`:95`); `GenericType` has two, each
  spelling its own head (`:99`–`:100`). `docs/spec_topics/grammar.md:107`:
  "`GenericType` is a closed set in theta 1.0: `array` (arity 1) and `Result`
  (arity 2). No other identifier is parameterisable". `Nope`, `Ghost` and a
  user-declared `Foo` are identifiers; `NamedType ::= Ident` (`:98`) admits
  each unapplied, and no production admits any of them with an angle list.
- **Affected** (every citation re-derived at HEAD `834c3334`;
  `src/parser/type-grammar.ts` is 1745 lines and `src/parser/params.ts` 2221
  lines at HEAD):
  - `src/parser/type-grammar.ts:762`–`:763` — the closed-set test
    (`name in GENERIC_ARITY && this.peek()?.text === "<"`), which declines for
    every head outside the table.
  - `src/parser/type-grammar.ts:765`–`:769` — the head-agnostic fallback that
    catches the decline: the comment "any non-generic head with a following
    `<`, is still parsed as an application so the arity check fires"
    (`:765`–`:767`) and the arm itself
    (`if (this.peek()?.text === "<") { return this.parseGeneric(name); }`,
    `:768`–`:769`). The stated reason holds only for a head the arity table
    knows.
  - `src/parser/type-grammar.ts:475`–`:478` — `GENERIC_ARITY`, frozen at
    `{ array: 1, Result: 2 }`.
  - `src/parser/type-grammar.ts:777`–`:800` — `parseGeneric`, which records the
    head verbatim (`return { kind: "generic", ctor, args }`, `:800`) with no
    membership test.
  - `src/parser/type-grammar.ts:1498`–`:1521` — `walkType`'s `"generic"` arm's
    `rules === "all"` block, the only place a generic node's own head is
    judged: the table lookup
    `GENERIC_ARITY[node.ctor]` (`:1500`), the arity diagnostic guarded by
    `expected !== undefined` (`:1501`), and the sole other rule, scoped by
    `node.ctor === "Result"` (`:1510`). An unknown head yields `undefined` and
    the arm emits nothing about the head. `:1741`–`:1742` is the walk's
    `default: return`, so no other arm reaches it.
  - `src/parser/type-grammar.ts:220` — `parseTypeExpression`, the shared entry
    every position's type-side check runs through; `:209` — the
    `TypeCheckRules` split (`"all"` / `"inline-object-shape"`) that leaves the
    `invoke<Type>` ascription and the `@<T>` capture's `E` argument outside the
    `"all"`-only checks.
  - `src/parser/params.ts:769`–`:812` — `lowerTypeExpr`'s generic-application
    arm: the split at the first `<` (`:770`), `const ctor = s.slice(0, lt).trim()`
    (`:772`), the `array` arity-1 branch (`:791`), and the catch-all "Any other
    generic (…): resolve nested named types best-effort, lower permissively"
    whose `return {}` stands at `:812`. Every unknown head takes that catch-all.
  - `src/parser/params.ts:815`–`:857` — the atom arm an applied spelling never
    reaches: `// Atom.` (`:815`), the reserved-keyword classification (`:819`),
    and the `NamedType ::= Ident` resolution whose failure pushes to
    `lowerCtx.unresolved` (`:854`) — the sink bug 0262's fix renders at ten
    reference positions.
  - `src/extension/production-composition.ts:3011` — `hasLoadParseError`,
    consulted at `:1570`: a document carrying an error-severity `theta/parse/…`
    diagnostic is not registered. This is the registration gate §Reproduction
    mirrors.
  - `docs/spec_topics/grammar.md:90`–`:95` — the six `Type` alternatives;
    `:98` — `NamedType ::= Ident`; `:99`–`:100` — the two `GenericType`
    productions; `:105` — the position list and the assignment of text
    deriving from none of the six alternatives to
    `theta/parse/annotation-type-not-expression` at the `let` annotation, the
    `fn` parameter type and the `fn` return type, and to
    `theta/parse/schema-type-not-expression`,
    `theta/load/params-type-not-expression` and
    `theta/parse/query-annotation-type-not-expression` at the schema field,
    the alias/union arm, `params:` and the author-written `@<T>` ascription;
    `:107` — the closed constructor set and "No other identifier is
    parameterisable".
  - `docs/spec_topics/diagnostics/code-registry-parse.md:112` — the
    `theta/parse/unresolved-named-type` row. Its *Trigger* opens "A `NamedType`
    that resolves to no declaration usable at the position it is written" and
    enumerates ten positions plus "every generic type argument, union arm,
    `Result` argument, and inline object field nested inside one of those ten".
    A head written with an angle list is a constructor head, not a `NamedType`,
    and is not a nested argument either, so the row as registered does not
    reach this class — the *Trigger* question §Fix owes.
  - `docs/spec_topics/diagnostics/code-registry-parse.md:65` —
    `theta/parse/generic-arity-mismatch`, whose *Trigger* is scoped to "the
    closed `GenericType` set (`array` arity 1, `Result` arity 2)"; `:106`,
    `:107`, `:108` — the three parse-phase not-expression rows;
    `docs/spec_topics/diagnostics/code-registry-load.md:20` —
    `theta/load/params-type-not-expression`.
  - `tests/schema-alias-union-decl.test.ts:369`–`:370` —
    `F_ALIAS_GHOST_APPLIED` (`schema X = Ghost<1,2>`) and
    `F_FIELD_GHOST_APPLIED` (`schema X { f: Ghost<1,2> }`), asserted at
    `:1846`–`:1851` under the `n10b` case (`:1835`) with the expected list
    `[]`, and pinned in the comment at `:1840`–`:1842` as measured-not-decided:
    "`Ghost<1,2>` — silent at both positions. `Ghost` is outside the closed
    `GenericType` set, so it declares no arity to violate, and the name walk
    does not descend an unknown application's head." Those two cells are this
    document's subject and flip under any fix here.
  - `docs/bugs/0281-applied-ok-err-generic-application-silent-at-every-capture.md`
    §Non-goals — the handover quoted under §Provenance, and the sibling filing
    whose §Fix route (a) would refuse this class in passing.
- **Observed at:** HEAD `834c3334`, v0.275.0, `main`, by one offline
  provider-free scratch probe over `parseDoc` (`tests/helpers/e2e-s1.ts`) and
  `lowerTypeExpr` (`src/parser/params.ts`), token `b0282scratch`, removed after
  measurement; sweep clean.

## Summary

An identifier followed by `<` is consumed structurally rather than as an atom.
`TypeParser.parsePrimary` tests the closed set first (`type-grammar.ts:762`)
and, when that declines, still parses the spelling as an application
(`:765`–`:769`); `parseGeneric` stores the head verbatim (`:800`). The only
judgement a generic node then receives is `walkType`'s arity check, keyed on
`GENERIC_ARITY` (`:1500`), which returns silently for a head the table does not
hold. `lowerTypeExpr` reads the same text before the `<` as a constructor name
(`params.ts:772`) and lowers every head other than `array` to `{}` (`:812`).

`Nope`, `Ghost` and a user-declared `Foo` are heads the table does not hold.
Measured at HEAD, `Nope<integer>` and `Ghost<string>` draw nothing and register
at **all nine** type-reference positions — the five bug 0277's fix filtered
(`let` annotation, `fn` parameter type, `fn` return type, `invoke<Type>`
ascription, the `@<T>` capture's `E` argument) and the four that were never
filtered (`@<T>` response part, `schema` body field type, `schema X = …` alias,
`params:` right-hand side). The alias position is silent here, unlike bug
0281's `Ok<integer>`, whose reserved head breaks the declaration parse before
any type-side pass runs.

The same bare names refuse at all nine: `Nope` draws
`theta/parse/unresolved-named-type` with the message
`unresolved named type 'Nope'` and denies registration at every one, under bug
0262's landed widening. Adding an argument list to the identifier removes the
refusal.

The silence is not inert. `lowerTypeExpr("Nope<integer>")` returns `{}` with
both sinks empty, so `let a: Nope<integer> = "mismatch"` loads and registers.
The declared head measures this directly: with `schema Foo { m: string }`
in the file, `let a: Foo = "mismatch"` draws
`theta/parse/let-rhs-type-mismatch`, and `let a: Foo<integer> = "mismatch"` is
silent. A constraint the author wrote, and which the file supports, is dropped
by writing the head with an angle list. The same holds one level down:
`array<Nope>` refuses and `array<Nope<integer>>` does not.

## Reproduction

Offline, provider-free. Parse each source through `parseDoc`
(`tests/helpers/e2e-s1.ts`, the shipped whole-file entry point wrapped in inert
deps) and read the unfiltered `doc.diagnostics`. Registration mirrors the
composition root's gate: a document carrying an error-severity `theta/parse/…`
diagnostic is not registered (`hasLoadParseError`,
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
| `Nope<integer>` | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y |
| `Ghost<string>` | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y | SILENT, reg=Y |

Eighteen of eighteen cells are silent and register. Arity is irrelevant to the
outcome: `Nope<integer, string, boolean>` is silent at `let-annot` too.

**Control 1 — the bare name refuses at every one of the nine.** `Nope`,
undeclared, draws `theta/parse/unresolved-named-type`
(`unresolved named type 'Nope'`), `reg=N`, at `query-T-head` `@4:9–4:19`,
`query-E-arg` `@4:9–4:36`, `fn-return` `@4:1–4:26`, `fn-param` `@4:1–4:32`,
`let-annot` `@4:1–4:20`, `invoke-ascr` `@4:9–4:40`, `schema-field`
`@4:1–4:21`, `schema-alias` `@4:1–4:16` and `params-field` `@4:6–4:12`. This
is bug 0262's landed rule (`code-registry-parse.md:112`). Adding an argument
list converts every one of those refusals into the silence in the table above.

**Control 2 — a DECLARED schema head, applied.** With
`schema Foo { m: string }` in the same file, `Foo<integer>` is SILENT and
registers at all eight body positions and at `params:`. Bare `Foo` resolves and
is likewise silent — but it constrains, and the applied spelling does not (see
the inert table below). `grammar.md:107` makes both readings of the applied
spelling wrong for the same reason: `Foo` is not parameterisable, so
`Foo<integer>` is neither a legal application nor a reference to `Foo`. At HEAD
it is admitted as a third thing — an application with a discarded head.

**Control 3 — the closed set stays itself.** `array<integer>` is SILENT and
registers at all nine positions. `Result<integer, string>` is SILENT and
registers at the six value-side positions and draws
`theta/parse/result-in-schema-position` at `schema-field` `@4:1–4:40`,
`schema-alias` `@4:1–4:35` and `params-field` `@4:6–4:31`, all `reg=N` — the
spec's own rule for that head (`grammar.md:107`).

**Control 4 — the sibling class, cross-cited not re-owned.** `Ok<integer>` is
SILENT and registers at eight positions and draws
`theta/parse/empty-schema-body` `@4:1–4:11` plus two
`theta/parse/unsupported-feature` (`@4:14–4:15`, `@4:22–4:23`) at
`schema-alias`, `reg=N`, because the reserved head breaks the alias
declaration before a type-side pass runs. That class is
`./0281-applied-ok-err-generic-application-silent-at-every-capture.md`'s
subject. The one observable difference from this document's subject is that
ninth cell.

**The annotation is inert, not merely unrefused.**

| source | diagnostics | registered |
| --- | --- | --- |
| `let a: Nope<integer> = "mismatch"` | SILENT | yes |
| `let a: Nope<integer> = 3` | SILENT | yes |
| `let a: Nope<integer, string, boolean> = 3` | SILENT | yes |
| `fn f(): Nope<integer> { "s" }` | SILENT | yes |
| `let a: Nope<integer> \| null = 3` | SILENT | yes |
| `let a: Nope = "mismatch"` (control) | `theta/parse/unresolved-named-type` `@4:1–4:25` | no |
| `let a: integer = "s"` (control) | `theta/parse/let-rhs-type-mismatch` `@4:1–4:21` | no |
| `schema Foo { m: string }` + `let a: Foo<integer> = "mismatch"` | SILENT | yes |
| `schema Foo { m: string }` + `let a: Foo = "mismatch"` (control) | `theta/parse/let-rhs-type-mismatch` `@5:1–5:24` | no |

The last pair is the constraint-dropping measurement: the file declares `Foo`,
the bare annotation enforces it, and the applied spelling of the same head
enforces nothing.

**Nesting — the interior head is discarded too.**

| source | diagnostics | registered |
| --- | --- | --- |
| `let a: Result<integer, Nope<integer>> = Ok(1)` | SILENT | yes |
| `let a: Result<integer, Nope> = Ok(1)` | `unresolved-named-type` `@4:1–4:37` | no |
| `let a: array<Nope<integer>> = []` | SILENT | yes |
| `let a: array<Nope> = []` | `unresolved-named-type` `@4:1–4:24` | no |
| ``let r = @<Result<integer, Nope<integer>>>`q` `` | SILENT | yes |
| ``let r = @<Result<integer, Nope>>`q` `` | `unresolved-named-type` `@4:9–4:36` | no |
| `schema S { f: array<Nope<integer>> }` | SILENT | yes |
| `schema S { f: array<Nope> }` | `unresolved-named-type` `@4:1–4:28` | no |

A legal enclosing application does not restore the judgement: the interior
applied-unknown is silent everywhere the interior bare name refuses.

**What the lowering yields.** `lowerTypeExpr` called directly with an empty
`bodyTypeMap` and both sinks empty:

| text | lowered | `reservedKeywords` | `unresolved` |
| --- | --- | --- | --- |
| `Nope<integer>` | `{}` | `[]` | `[]` |
| `Ghost<string>` | `{}` | `[]` | `[]` |
| `Foo<integer>` | `{}` | `[]` | `[]` |
| `Nope` | `{}` | `[]` | `["Nope"]` |
| `Result<integer, string>` | `{}` | `[]` | `[]` |
| `array<integer>` | `{"type":"array","items":{"type":"integer"}}` | `[]` | `[]` |
| `integer` | `{"type":"integer"}` | `[]` | `[]` |

The applied spelling publishes nothing to either sink — no position has
anything to render — and lowers to the empty type. The bare spelling publishes
`Nope`, which is the sink bug 0262's fix renders at ten reference positions.

**Where the not-expression family is wired.** `integer--`, the canonical junk
this family names, draws `theta/parse/query-annotation-type-not-expression` at
`query-T-head` `@4:9–4:24`, `theta/parse/annotation-type-not-expression` at
`fn-return` `@4:1–4:31`, `fn-param` `@4:1–4:37` and `let-annot` `@4:1–4:25`,
`theta/parse/schema-type-not-expression` at `schema-field` `@4:1–4:26` and
`schema-alias` `@4:1–4:21`, and `theta/load/params-type-not-expression` at
`params-field` `@4:6–4:17`, each `reg=N`. It is SILENT and registers at
`query-E-arg` and `invoke-ascr` — the two positions with no wired emitter of
that family at HEAD, which constrains the code choice in §Fix.

**Pinned cells carrying this subject.**
`tests/schema-alias-union-decl.test.ts` `F_ALIAS_GHOST_APPLIED`
(`schema X = Ghost<1,2>`, `:369`) and `F_FIELD_GHOST_APPLIED`
(`schema X { f: Ghost<1,2> }`, `:370`) are re-measured SILENT, `reg=Y`, and are
asserted to an empty diagnostic list at `:1846`–`:1851`. The neighbouring
`F_ALIAS_GHOST_ELEMENT` (`schema X = array<Ghost>`, `:371`) draws
`theta/parse/unresolved-named-type` `@4:1–4:24`, `reg=N`, and is not this
document's subject.

## Expected behaviour

An unknown identifier written as a generic head derives from no `Type`
production. `GenericType`'s two alternatives spell their own heads
(`grammar.md:99`–`:100`), the set is closed, and "No other identifier is
parameterisable" (`:107`). `NamedType ::= Ident` (`:98`) admits `Nope` bare and
admits nothing with an angle list after it.

Each of the nine positions refuses `Nope<integer>`, `Ghost<string>` and
`Foo<integer>` and denies registration, at that position's existing sibling
range — the same one-reading-everywhere conclusion bug 0262 landed for the bare
name and bug 0277 landed for the unapplied constructor head. One written
mistake draws one diagnostic naming it, at whichever position it is written.

A declared head does not change the verdict. `Foo<integer>` with `schema Foo`
in scope is a written mistake about `Foo`, not a reference to it, and the
refusal names the head rather than silently lowering to a type that admits
everything.

An annotation constrains the position it annotates. An annotation lowering to
`{}` that suppresses `theta/parse/let-rhs-type-mismatch` is not the annotation
the author wrote.

The registry row the refusal answers to is a bounded decision this report does
not pre-empt, and §Fix states why: the natural candidate,
`theta/parse/unresolved-named-type`, has a *Trigger* whose subject is a
`NamedType` (`code-registry-parse.md:112`), and a head written with an angle
list is neither a `NamedType` nor a nested argument of one.
`theta/parse/generic-arity-mismatch` is not a candidate — its *Trigger* (`:65`)
is scoped to the closed set, which an unknown head is outside at any arity.

## Actual behaviour / root cause

The head is never tested against the closed set, at either seam that reads it.

**Seam 1 — the type-grammar application parse.** `TypeParser.parsePrimary`
tests the closed set (`type-grammar.ts:762`), and when that declines the
head-agnostic fallback takes the spelling anyway: any identifier followed by
`<` is parsed as an application (`:768`–`:769`), and `parseGeneric` stores the
head verbatim (`:800`). The fallback's comment gives the intent — "so the arity
check fires" (`:765`–`:767`) — and the arity check is a table lookup:
`GENERIC_ARITY[node.ctor]` (`:1500`) is `undefined` for every unknown head, and
the diagnostic is guarded by `expected !== undefined` (`:1501`). The
`"generic"` arm's only other rule is scoped to `node.ctor === "Result"`
(`:1510`), and `walkType` ends in `default: return` (`:1741`–`:1742`). The node
is walked, its arguments are checked — which is why `array<Nope>` refuses on
its argument — and the head is discarded.

Because the spelling parses as a `"generic"` node rather than a `"named"` one
(`:774` is the `named` return the application arm pre-empts), it never reaches
the name-resolution path bug 0262 widened, which is why the bare name refuses
at all nine positions and the applied one at none.

**Seam 2 — the lowering.** `lowerTypeExpr` splits at the first `<`
(`params.ts:770`–`:772`), special-cases `array` at arity 1 (`:791`), and lowers
every other head permissively, returning `{}` (`:812`). The atom arm below —
the reserved-keyword classification (`:819`) and the `NamedType` resolution
whose failure pushes to `lowerCtx.unresolved` (`:854`) — runs only when the
generic-application arm declines, which an applied spelling never makes it do.
Bug 0262's fix rendered that `unresolved` sink at ten positions; bug 0277's fix
removed a withhold on the reserved-keyword sink beside it. Both operate on the
atom arm, and both are structurally unreachable from an applied spelling.

The empty lowered type is the second half of the defect. `{}` constrains
nothing, so at the value-side positions the position's own checks run against a
type admitting everything (`let a: Foo<integer> = "mismatch"` loads where
`let a: Foo = "mismatch"` refuses), and at the lowered-schema positions the
registered field schema is constraint-free.

**Where the behaviour sits against each owning record.**

- `./0281-applied-ok-err-generic-application-silent-at-every-capture.md`
  §Non-goals records this class as measured, unowned and outside its subject,
  and its §Fix route (a) names a closed-set head gate that would refuse it in
  passing. Sibling, not owner — see §Fix's coordination clause.
- `./0262-unresolved-named-type-silent-at-nine-reference-positions.md` is
  fixed (0.266.0) and reaches the bare name at ten reference positions. Its
  row's subject is a `NamedType` (`code-registry-parse.md:112`); an applied
  head is not one and is not read through the resolution arm at all. Adjacency,
  not a regression of that fix.
- `./0277-unapplied-generic-head-admitted-and-inert-at-five-type-positions.md`
  is fixed (0.275.0) for the unapplied constructor heads. Its route removed an
  atom-arm filter; an applied spelling never reaches the atom arm.
- `./0278-result-arity-mismatch-silent-at-query-response-annotation.md` is
  fixed (0.273.0) for a head the closed set holds. No arity rule reaches a head
  the table does not hold.

## Why it matters

The correction for an unresolvable type name is to declare it or spell it
right. At HEAD, adding `<integer>` also removes the diagnostic, and removes it
at all nine positions at once — `let a: Nope = 3` refuses,
`let a: Nope<integer> = 3` loads and registers. A reader who learns bug 0262's
rule learns nothing that predicts the applied spelling.

The declared-head measurement is the second cost: an author who writes
`Foo<integer>` for a schema `Foo` that exists in the file gets a theta that
loads with the annotation silently replaced by one that admits everything, and
the mismatch the annotation existed to catch — a string assigned under it —
never draws. The same holds for a `params:` field, whose registered schema then
constrains no bound argument, and for a `schema` body field, which registers
constraint-free. The evidence the author has that the annotation means
something is that the file loads.

No committed source moves: `git ls-files '*.theta' '*.thetalib'` is 34 files
and the only applied heads in them are `array<` (2) and `Result<` (2), both
inside the closed set.

## Non-goals

- **Bug 0281's `Ok<…>` / `Err<…>` class is not re-owned here.** Those are
  reserved spellings the grammar names but never applies at that spelling;
  their eighth and ninth cells differ from this subject's (§Reproduction,
  control 4). This document owns heads nothing declares as a constructor
  anywhere — undeclared identifiers and declared non-parameterisable schema
  names.
- **Bug 0262's landed bare-name rule is not reopened.** `Nope` refuses at all
  nine positions and must keep refusing with the same code and ranges
  (§Reproduction, control 1).
- **Bug 0277's landed unapplied-head refusals and bug 0278's arity gate are
  untouched.** Neither reaches an unknown applied head, and no route here
  changes what either decided.
- **The closed set stays legal.** `array<T>` at all nine positions and
  `Result<T, E>` outside the three lowered-schema positions are the grammar's
  own (`grammar.md:99`–`:100`, `:107`), spelled by the committed corpus and
  covered by `tests/committed-fixture-parse-gate.test.ts`.
- **`theta/parse/result-in-schema-position` is not in scope.** It is correct
  for the head it names.
- **Introducing user-defined parameterised types is not in scope.** `Foo<T>`
  refuses because `grammar.md:107` closes the set, not because `Foo` is
  declared wrongly.

## Fix

One reading for one spelling at all nine positions: an unknown applied head
refuses and denies registration.

**Route (a) — gate the head at the application seam.** Add the membership test
where the head is read: at `type-grammar.ts:765`–`:769`, or equivalently in
`walkType`'s `"generic"` arm at `:1498` where `GENERIC_ARITY[node.ctor]` is
already consulted (`:1500`), and at `lowerTypeExpr`'s generic-application arm
(`params.ts:769`–`:812`). One judgement then covers every position, because all
nine run their type-side checks through `parseTypeExpression`
(`type-grammar.ts:220`) and their lowering through `lowerTypeExpr`. Route (a)
pins these observables: every cell of §Reproduction's 9 × 2 table refuses; both
declared-head rows of the inert table refuse; every silent row of the nesting
table refuses; controls 1, 3 and 4 are byte-unchanged.

**The code decision, owed under route (a).** Two candidates, and the measured
state of each:

1. `theta/parse/unresolved-named-type` (`code-registry-parse.md:112`). It is
   wired at all nine positions, its message names the head
   (`unresolved named type '<name>'`), and it is the row the bare spelling of
   the same identifier already draws — which makes the two spellings converge
   on one diagnostic, the outcome §Expected asks for. Its *Trigger* as
   registered does not cover this input: the subject is "A `NamedType` that
   resolves to no declaration", the nested clause reaches "every generic type
   argument, union arm, `Result` argument, and inline object field", and a
   name written AS a generic head is none of those. So this candidate requires
   a same-commit widening of that row's *Trigger* to name a head position
   explicitly — a GOV-15 diagnostic-registry carve-out whose in-scope input
   set is an unknown applied head at one of the nine positions and nothing
   else; every input in it loads cleanly at HEAD. The declared-head case
   (`Foo<integer>` with `schema Foo` in the file) needs its own sentence in
   that widening, since the name does resolve and the fault is the
   application: the *Trigger* must say the head is unresolvable AS A
   CONSTRUCTOR, not as a name.
2. The not-expression family (`grammar.md:105`; rows at
   `code-registry-parse.md:106`, `:107`, `:108` and
   `code-registry-load.md:20`). It is the family the grammar assigns to text
   deriving from none of the six alternatives, which this text is. It is wired
   at seven of the nine positions and has no emitter at `invoke-ascr` or
   `query-E-arg` (§Reproduction, last table), so choosing it means adding an
   emitter at those two — itself an emission-set widening for other junk
   there, to be measured before it is taken.

Neither is complete as registered; the choice is the fix's, made against these
measurements rather than assumed.

**Route (b) — refuse per position, at the rendering path.** Judge the captured
annotation text at each of the nine positions. It pins the same cells, owes
nine edits instead of two, owes the two unwired positions regardless of which
code is chosen, and re-introduces the per-position divergence bugs 0262 and
0277 removed. Strictly larger, with nothing route (a) does not give.

**Coordination with bug 0281 — both directions.** A closed-set head gate
landing under
`./0281-applied-ok-err-generic-application-silent-at-every-capture.md` §Fix
route (a) discharges this bug's nine cells too, because a gate written as "head
not in `GENERIC_ARITY`" refuses every unknown head in passing; that report
names taking the wider gate as conditional on this class being filed, which
this document does. Symmetrically, the gate described in route (a) above
refuses `Ok<…>` / `Err<…>` in passing and discharges bug 0281's subject. The
two are one edit at one seam under two authorities.

Whichever fix lands first, the other's witness cells flip only under enumerated
authority plus a dated coordination note in the other document:

- If 0281 lands first: this document's nine cells and both pinned
  `Ghost<1,2>` cells flip under 0281's commit, which must carry a dated note in
  this file recording that this subject is discharged and its witness cells
  re-founded there.
- If this lands first: bug 0281's group (K) cells (K1–K5, pinned in
  `tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts`) and
  its 9 × 2 table flip under this commit, which must carry a dated note in
  `./0281-applied-ok-err-generic-application-silent-at-every-capture.md`
  recording the same in the other direction.
- If the landing fix is the narrower one 0281 also describes ("head is a
  reserved spelling that is not a constructor keyword"), no cell of this
  document moves and no note is owed either way.

**Flip authority — the cells this report authorizes to move, enumerated.**

- `tests/schema-alias-union-decl.test.ts:369`–`:370`, asserted at
  `:1846`–`:1851` under `n10b` (`:1835`), with the pinning comment at
  `:1840`–`:1842`. Both cells spell an unknown applied head, are pinned as
  measured-not-decided, and invert to refusals under either route. Re-founding
  them, and the comment that explains the silence, belongs to this report.
- Any cell of bug 0281's witness group (K) that its own fix would flip, when
  the landing gate is the wider one — under that report's authority, with the
  dated note above.
- No other pinned cell in the tree spells an unknown applied head:
  `rg "Nope<|Ghost<" tests/` yields only the two constants above, and
  `git ls-files '*.theta' '*.thetalib'` (34 files) yields no applied head
  outside `array<` and `Result<`.

**Locks — all must stay green.**

- `tests/b0262-unresolved-named-type-reference-positions.test.ts` and
  `tests/b0273-query-result-error-side-unresolved-name.test.ts` — a head gate
  must not move a `NamedType` verdict.
- `tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts` —
  every group but (K) unmoved; (K) only under the coordination clause above.
- `tests/b0274-reserved-keyword-type-head-at-five-unwired-captures.test.ts`.
- `tests/schema-alias-union-decl.test.ts` — every cell but the two named above.
- `tests/conformance/production-conformance.test.ts`.
- `tests/committed-fixture-parse-gate.test.ts` — the corpus-wide "no shipped
  source moves" claim is discharged here, not by a scratch probe.
- `tests/fixtures/h7a/permitted-codes.json` — byte-unchanged unless the code
  decision mints a row, which neither candidate requires.
- `npm test`, `npm run typecheck`, `npm run lint`.

**Ordering.** No blocking dependency on bug 0281, and no ordering constraint
between them beyond the coordination clause: either may land first, and the
second to land carries the dated note.

## Provenance

Bug 0281's writer recorded this class as an unowned adjacent subject requiring
its own document before any closed-set head gate lands.
`./0281-applied-ok-err-generic-application-silent-at-every-capture.md`
§Non-goals, quoted: "**An arbitrary undeclared head with an argument list
(`Nope<integer>`, silent at all nine — §Reproduction, adjacency) is outside
this report's subject.** `Ok` and `Err` are reserved spellings the grammar
names; `Nope` is an undeclared identifier, whose disposition touches
`theta/parse/unresolved-named-type`'s widened reach and owes its own GOV-15
reading. No document covers it. A route here that gates the head against the
closed set would refuse it in passing, which is a scope decision §Fix names
rather than a side effect to be discovered." That report's §Fix route (a)
repeats the condition: "The narrower gate is inside this report's authority;
the wider one is not, and taking it means filing the wider class first."

Filed in the eighteenth fix-open-bugs session at HEAD `834c3334`, v0.275.0.
Every citation above re-derived at that HEAD. All measurements are this
report's own, taken by one offline provider-free probe over `parseDoc` and
`lowerTypeExpr` (token `b0282scratch`, deleted after the sweep): the
nine-position × two-spelling subject matrix with registration; the bare-name
control at the same nine positions with codes and ranges; the declared-schema
applied-head control; the closed-set and sibling-class controls; the
inert-annotation and nesting tables; the direct lowering table; the
not-expression family's wiring at seven of the nine positions; and the two
pinned `Ghost<1,2>` cells.
