# Bug 0282 — An UNKNOWN identifier written as a generic head (`Nope<integer>`, `Ghost<string>`, `Foo<integer>` for a declared object schema `Foo`) derives from no `Type` production, yet the head-agnostic application arm in `TypeParser.parsePrimary` consumes it structurally and `walkType`'s only judgement of a generic node is a `GENERIC_ARITY` table lookup that misses: the spelling loads SILENT and registers at all nine type-reference positions, lowered to `{}`, while the same bare name refuses at every one of them under bug 0262's landed `theta/parse/unresolved-named-type` rule

- **Status:** fixed (0.280.0).
- **Sev/Diff estimate:** S3/D2 — S3 because no legal source moves (the 34
  committed `.theta` / `.thetalib` files spell exactly two applied heads,
  `array<` and `Result<`, both inside the closed set) and because the silence
  drops constraints the author wrote: with `schema Foo { m: string }` declared,
  `let a: Foo = "mismatch"` draws `theta/parse/let-rhs-type-mismatch`
  `@5:1–5:24` and `let a: Foo<integer> = "mismatch"` is SILENT and registers
  (§Reproduction, inert table), and `array<Nope>` refuses where
  `array<Nope<integer>>` does not (§Reproduction, nesting). Not S4: nothing
  in the shipped corpus or in any pinned legal spelling changes verdict. Not
  S2: nothing correct is refused. D3 (raised from D2 on 2026-08-25 — see the
  dated note at the end of this document) because the head is admitted at two
  independent seams — the application parse
  (`src/parser/type-grammar.ts:773`–`:777` at HEAD `42226b1e`) and
  `lowerTypeExpr`'s generic-application arm
  (`src/parser/params.ts:769`–`:826` at that HEAD) — because the code the
  refusal answers to needs a *Trigger* decision measured against the registry
  (§Fix), and because the fix re-founds eleven pinned cells across six witness
  files owned by six other reports (0164, 0217, 0231, 0236, 0256, 0281) plus
  the two cells this document already owned
  (`tests/schema-alias-union-decl.test.ts:369`–`:370`, asserted at `:1846`),
  each owing a coordination note in the owning document.
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
- The eleven cells enumerated in the dated note **Flip-authority widening
  (pre-fix, operator-directed)** at the end of this document: eight
  scaffolding-head cells in the five witness files owned by bugs 0164, 0217,
  0231, 0236 and 0256, and the three cells of group (D) in
  `tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts`,
  which pin this document's subject as measured controls. Each carries a
  re-derived site, the quoted pinned text, and a disposition. A coordination
  note in each owning document is owed in the same commit.
- Nothing else. The fix lane's authority is exactly §Reproduction's 9 × 2
  matrix and its inert and nesting tables, the two `Ghost<1,2>` cells above,
  and the eleven enumerated cells of that note. The earlier enumeration bullet
  `rg "Nope<|Ghost<" tests/` was measurably incomplete — it misses the
  scaffolding spellings `pair<`, `map<` and lowercase `result<` — and is
  superseded by the sweep recorded in the note. `git ls-files '*.theta'
  '*.thetalib'` (34 files) still yields no applied head outside `array<` and
  `Result<`, re-run at HEAD `42226b1e`.
- Bug 0281's witness group (K)
  (`tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts`) is
  NOT in this document's authority: 0281's fix landed narrow at 0.277.0 and
  re-founded that group under its own authority.

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

## Flip-authority widening (pre-fix, operator-directed) — 2026-08-25

Recorded at HEAD `42226b1e`, v0.278.0, `main`, before any fix lane takes this
report. Every site, line number and quotation below is re-derived at that HEAD;
none is copied from bug 0281's measurement.

**Why this note exists.** Bug 0281's fix lane implemented the WIDE gate first —
"head not in `GENERIC_ARITY`", the gate §Fix route (a) above describes — and
measured it before choosing. It flips eight pinned cells across five witness
files owned by bugs 0164, 0217, 0231, 0236 and 0256, which use `pair<…>`,
`map<…>` and a lowercase `result<…>` as inert scaffolding. That lane stopped
and landed the narrow reserved-spelling gate instead (0.277.0,
`./0281-applied-ok-err-generic-application-silent-at-every-capture.md` §Fix
record), and recorded this document's enumeration as stale
(`.pi/tmp/fixes/0281-report.md`, residual 1). This document's own enumeration
searched two literal spellings (`rg "Nope<|Ghost<" tests/`) and reached none of
those cells. The enumeration below replaces it.

### Sweep record

Two sweeps at HEAD `42226b1e`, both scaffolding-aware.

1. **Committed corpus.** `rg -o -N '[A-Za-z_][A-Za-z0-9_]*<' $(git ls-files
   '*.theta' '*.thetalib')` over all 34 files: four hits, `array<` (2) and
   `Result<` (2). No applied head outside the derivable set. Unchanged from
   this document's original claim.
2. **All committed test sources** (`git ls-files 'tests/*.ts' 'tests/**/*.ts'
   'tests/**/*.theta' 'tests/**/*.thetalib' 'tests/**/*.json'), scanned by one
   throwaway Node script (token `b0282scratch`, outside the tree, deleted):
   extract every string literal — single, double and backtick — and report
   every `Ident<` head appearing inside one, with file and line. A plain `rg`
   over the same files is unusable: TypeScript's own type applications
   (`ReadonlyArray<…>`, `Record<…>`, `Promise<…>`) outnumber theta type text by
   an order of magnitude and sit outside string literals.

Triage of sweep 2 — 3819 head occurrences over 20 distinct heads:

| class | heads | occurrences | disposition |
| --- | --- | --- | --- |
| derivable heads | `array`, `Result` | 3375 | out — the closed set is legal |
| 0281-owned reserved spellings | `Ok`, `Err`, `integer`, `invoke` (incl. one line-wrapped `\ninvoke<string>` at `tests/schema-alias-union-decl.test.ts:402`) | 401 | out — already refuse under 0.277.0's landed gate, or are the `invoke<Type>` ascription production |
| this document's own subject | `Nope`, `Ghost`, `Foo` | 17 | in, already enumerated (`tests/schema-alias-union-decl.test.ts:369`–`:370`; group (D) below) |
| prose and TypeScript, not theta type text | `a` (`"a<LF>b"`), `gen` (`` `gen<N>-reload` ``), `_` (`` `__theta_respond_<slug>_<n>` ``), `_2__`, `ReadonlySet`, `Pick`, `Parameters` | 17 | out — none sits in a type-annotation position |
| scaffolding heads | `pair`, `map`, `result` | 9 (6 in code, 3 in comment prose) | in — the eight cells below |

The six code-bearing scaffolding spellings expand to eight pinned cells. No
further head survives triage: the sweep finds no ninth cell.

### The enumerated cells

Cell disposition is (a) the scaffolding spelling becomes a refusal the cell
expects, or (b) the cell re-vehicles onto a derivable head (`Result<…>` /
`array<…>`) so its original subject keeps being witnessed.

| # | site at HEAD `42226b1e` | pinned text, verbatim | disposition |
| --- | --- | --- | --- |
| 1 | `tests/generic-argument-bracket-group-truncation.test.ts:877`–`:880`, asserted at `:1009`; five position instances built at `:884`–`:903` | `"f2b non-constructor head beside a cut group",` / `'pair<{a: string}, enum["x","y"]>',` / `[SCHEMANOTEXPR("S")],` / `[],` (the trailing `[]` is the `b5 let annotation` instance's expectation) | (a) — the row is one of bug 0217's four registry examples, quoted verbatim from `theta/parse/schema-type-not-expression`'s published row, so the spelling cannot move without falsifying the quote; the cell's subject is what a non-constructor head draws at each position, which is what the gate decides |
| 2 | `tests/generic-argument-literal-lowering.test.ts:1127`–`:1130`, asserted at `:1139` | `"d10",` / `'map<"x" \| "y">',` / `{},` | (a) — the cell's subject IS the non-`array` head's own lowering; `Result` is the only other derivable head and cell d11 (`:1152`) already carries it, so a re-vehicle would duplicate d11 |
| 3 | `tests/inline-object-malformed-entry-resync.test.ts:499`, asserted at `:660` | `["b9 BOUND", "{a b: integer, zs: result<string>}", [NOTIDENT("a b")]],` | (b) — re-vehicle the field type onto a derivable head that likewise draws nothing (`array<string>`); the cell's subject is that a field TYPE with no emission of its own recovers nothing behind a malformed entry, and `result<string>` is incidental vehicle chosen only because it draws nothing at HEAD |
| 4 | `tests/inline-object-malformed-entry-resync.test.ts:500`, asserted at `:660`; counted at `:791`–`:795` | `["b9c control", "{a: integer, zs: result<string>}", []],` | (b) — same re-vehicle: it is b9's paired control, and the file's inventory assertion pins it as the ONLY cell expecting an empty list ("only b9's control expects nothing"), which a refusal here would break |
| 5 | `tests/inline-object-stranded-entry-refusal.test.ts:531`, asserted at `:536` (`[MALF]`) | `["c12", "map<string, {a: b c, d e}>"],` | (a) — the row is a `params:` row and its subject is which refusal a two-argument generic wrapper draws there; no derivable head spells a clean two-argument application at that position (`Result<…>` draws `theta/parse/result-in-schema-position`, `array<…, …>` draws `theta/parse/generic-arity-mismatch`), so a re-vehicle changes the shape rather than preserving it |
| 6 | `tests/inline-object-stranded-entry-refusal.test.ts:531`, asserted at `:549` (`loweredParams` is `"null"`) | same row | (a) — same row, second assertion: the lowering half stays "nothing lowers", and the head refusal is one more reason for it, so the subject survives on the refusal |
| 7 | `tests/nested-inline-enum-generic-argument-refusal.test.ts:794`–`:805` (cell b17; spelling constant at `:454`), asserted at `:819` | `"b17",` / `PAIR_BRACE_SIBLING,` / `["{a: string}", 'enum["x", "y"]'],` / `true,` where `const PAIR_BRACE_SIBLING = 'pair<{a: string}, enum["x", "y"]>';` | (a) — the head was chosen because "`pair` is an unknown constructor, so the arity rule has nothing to say about it" (`:449`–`:451`); under the gate no such head exists, and the sibling cell b18 (`:806`) already carries the derivable-head contrast with `array` |
| 8 | `tests/nested-inline-enum-generic-argument-refusal.test.ts:864`–`:871` (cell c9), asserted at `:877` over the three `SINK_POSITIONS` (`:261`) | `"c9",` / `PAIR_BRACE_SIBLING,` | (a) — the cell asserts EXACTLY ONE refusal per construct, which the head gate does not weaken; it moves only if the gate's code differs from the code that position already draws. Authority permits the move and does not require it: if the codes coincide, the cell stays byte-exact |
| 9 | `tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts:617` (group (D); spellings at `:600`) | `it("b0281-D: an unknown applied head stays silent and registering at all nine positions", …)` over `const UNKNOWN_SPELLINGS = ["Nope<integer>", "Ghost<string>"] as const;` | (a) — the group pins this document's subject as a measured control and inverts wholesale; its own comment (`:610`–`:614`) directs the re-widening to red here rather than in the five unrelated witnesses |
| 10 | same file, `:631`–`:669` | `it("b0281-D-declared: a DECLARED schema name written with an angle list keeps dropping its constraint", …)` over `'schema Foo { m: string }\nlet a: Foo<integer> = "mismatch"\n"ok"'` | (a) — this is §Reproduction's constraint-dropping measurement, and the fix is what removes the dropped constraint; the bare-`Foo` control beside it (`:648`–`:651`) does not move |
| 11 | same file, `:671`–`:706` | `it("b0281-D-nesting: an unknown applied head one level down stays silent where the bare name refuses", …)` over `'let a: array<Nope<integer>> = []\n"ok"'` and three siblings | (a) — §Reproduction's nesting table, same inversion; the bare-name controls (`:694`–`:704`) keep bug 0262's refusals unchanged |

Cells 9–11 are the further cells this sweep found beyond bug 0281's tabulation
of eight. That lane's report names them in prose (residual 1: "this fix's
witness adds a group of cells pinning the unknown-applied-head silence as a
measured control") without siting them.

The two cells this document already owned are unchanged in disposition:
`tests/schema-alias-union-decl.test.ts:369`–`:370`, asserted at `:1846`–`:1851`
with the pinning comment at `:1840`–`:1842`, both (a).

Coordination notes are owed, in the fix commit, to the owning report of each
re-founded cell: bugs 0164, 0217, 0231, 0236, 0256 and
`./0281-applied-ok-err-generic-application-silent-at-every-capture.md`. The
first five filenames are not resolved here; the fix lane resolves each against
`docs/bugs/README.md` before writing.

Cell 5/6 carries one consequence for the fix lane to restate rather than drop:
c12 is bug 0256's two-argument-generic Reach shape, and under the gate that
shape can no longer be witnessed at `params:` by a head drawing nothing of its
own. The re-founding says so in bug 0256's note.

### Citation drift measured at this HEAD

Bug 0281's fix (0.277.0) inserted its gate and exported `GENERIC_ARITY`, moving
lines this document cites against HEAD `834c3334`. The drift is
verdict-neutral, and is recorded rather than rewritten because §Affected is
anchored to the HEAD it names. At `42226b1e`:

- `src/parser/type-grammar.ts` — closed-set test `:762`–`:763` → `:770`;
  head-agnostic fallback `:765`–`:769` → `:773`–`:777`; `GENERIC_ARITY`
  `:475`–`:478` → `:483`–`:486`, now `export const`; `parseGeneric`
  `:777`–`:800` → `:785`–`:808`; `walkType`'s `"generic"` arm's table lookup
  `:1500` → `:1508`, its arity guard `:1501` → `:1509`, its `Result` scope
  `:1510` → `:1518`.
- `src/parser/params.ts` — the generic-application arm still opens at `:769`
  and splits at `:772`, and the `array` branch is still `:791`, but the
  catch-all `return {}` is `:812` → `:826` (0281's reserved-head gate occupies
  `:795`–`:808`); the atom arm's `// Atom.` `:815` → `:829`, the
  reserved-keyword classification `:819` → `:833`, the `unresolved` push
  `:854` → `:868`.
- `src/extension/production-composition.ts` — `hasLoadParseError` `:3011` →
  `:3053`, consulted at `:1570` (unchanged). Bug 0281's residual 3 reports the
  same drift.

### Severity / difficulty judgment

`S3/D2` → `S3/D3`, applied to the header. Severity is unchanged: no shipped
source moves and nothing correct is refused. Difficulty rises because the fix
is no longer a two-seam edit with two owned cells — it re-founds eleven pinned
cells across six witness files owned by six other reports, owes a coordination
note in each owning document, and still owes the *Trigger* decision §Fix names.
D3 is an estimate; the picking session re-scores.

## Fix (0.280.0)

- **Route adjudicated: §Fix route (a), CLOSED-SET width, one seam.** The
  membership test lands in `lowerTypeExpr`'s generic-application arm
  (`src/parser/params.ts`), not at the type-grammar application parse and not
  in `walkType`: an `Ident`-shaped head outside `GENERIC_ARITY` routes onto the
  `lowerCtx.unresolved` sink and lowers no further, which is the sink bug 0262's
  fix already renders at ten reference positions for the head's BARE spelling.
  One seam reaches every capture, measured before the tests were written: all
  eighteen cells of §Reproduction's 9 × 2 table, the `params:` position, both
  declared-head rows of the inert table, every silent row of the nesting table,
  and the two pinned `Ghost<1,2>` cells.
- **Route choice against bug 0281: BESIDE, not SUBSUMING.** The wide gate sits
  AFTER 0281's narrow reserved-spelling gate and after the `array` arity-1
  branch. That ordering keeps the sibling verdicts stable and is written into
  the gate's own comment: `Ok<integer>` / `Err<string>` keep drawing
  `theta/parse/reserved-keyword-as-identifier` (0281's landed code, not this
  row's), `Result<integer>` keeps drawing
  `theta/parse/generic-arity-mismatch` (bug 0278's gate order), and `array<T>`
  stays clean at all nine positions. No code any sibling witness draws moved.
- **What shipped:**
  - `src/parser/params.ts` — the closed-set constructor-head gate, beside and
    after 0281's, carrying the WHY for the identifier-shape test (this row's
    *Message* fills `<name>` with a name), for the early `return` (the
    construct's one refusal through this seam) and for the ordering.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` —
    `theta/parse/unresolved-named-type`'s *Trigger* widened in the same commit
    (DIAG-2): the constructor-head position named explicitly, the declared-head
    case given its own sentence, the reach stated at every depth beneath the ten
    positions rather than one level down, and the cover claim scoped to this
    row's own refusal through the lowering seam — an independent seam's
    judgement co-fires beside it (`theta/parse/malformed-schema-field`) or
    stands instead of it (`theta/parse/generic-arity-mismatch`). Marked a
    GOV-15 carve-out whose in-scope set is exactly this class.
  - Thirteen pinned cells re-founded, each keeping its subject: `n10b`'s two
    `Ghost<1,2>` cells and their pinning comment
    (`tests/schema-alias-union-decl.test.ts`); group (D)'s three cells
    (`tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts`);
    `f2b` (`tests/generic-argument-bracket-group-truncation.test.ts`); `d10`
    (`tests/generic-argument-literal-lowering.test.ts`); `b9` / `b9c`
    re-vehicled (`tests/inline-object-malformed-entry-resync.test.ts`); `c12`'s
    two assertions (`tests/inline-object-stranded-entry-refusal.test.ts`);
    `b17` and `c9`'s three positions
    (`tests/nested-inline-enum-generic-argument-refusal.test.ts`).
  - `tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts` —
    NEW offline witness, 11 cells over eight groups.
  - `tests/live/b0282live-unknown-applied-generic-head-registration.test.ts` —
    NEW live registration cell, 2 cells.
- **The code decision, discharged by measurement.**
  `theta/parse/unresolved-named-type` (`code-registry-parse.md:112`), borrowed
  and not minted, which is why `tests/fixtures/h7a/permitted-codes.json` is
  byte-unchanged (hash-verified `a4a8da04…` against HEAD). The row is wired at
  all nine positions, its *Message* names the head, and the bare spelling of the
  same identifier already draws it — the convergence §Expected asks for.
  Candidate 2, the not-expression family, stays rejected on the measurement
  §Reproduction records: no wired emitter at `invoke-ascr` or `query-E-arg`. The
  *Trigger* widening candidate 1 requires is in the same commit;
  `docs/reference/diagnostics.md:160` transcribes no *Trigger* column, so no
  reference mirror moves.
- **Flip containment, premeasured.** The gate was implemented once against the
  whole default suite BEFORE any witness was written, then reverted byte-exact.
  It flips exactly the dated note's enumeration — 12 tests across 7 files, no
  eighth file, no cell outside the eleven plus the two this document already
  owned. Cell 8 (`c9`) DID move, which the note permits without requiring:
  measured before → after is `theta/parse/schema-type-not-expression` →
  `theta/parse/unresolved-named-type` at the field and alias positions, and
  `theta/load/params-type-not-expression` → `theta/parse/unresolved-named-type`
  at `params:`.
- **One vehicle substitution inside an authorized cell.** Cells 3/4 (`b9`,
  `b9c`) re-vehicle onto `Result<string, integer>` rather than the note's
  suggested `array<string>`: a fully-resolved `array<string>` field makes the
  enclosing object type known and `b9c`'s right-hand side then draws
  `theta/parse/let-rhs-type-mismatch`, breaking the file's "only b9's control
  expects nothing" inventory. `Result<…>` is derivable, sits at a
  non-schema-feeding nested position, and draws nothing — the disposition's own
  requirement. Re-measured independently in review round 1 and recorded in bug
  0231's coordination note.
- **Gates:** witness 11/11 (6 of 11 red at HEAD for the filed reason — refusal
  expected, empty list received; the five control groups green at HEAD, so the
  file is not uniformly red); `npm test` 457 files / 9379 tests, zero reds;
  `npm run typecheck` clean; `npm run lint` clean; the live cell 2/2 green under
  the cross-lane live lock.
- **Review:** 3 rounds. Round 1 (`bug-fix-reviewer`) — three
  documentation-level findings, no correctness or fidelity finding, deep
  re-review NOT recommended: the widened *Trigger* over-claimed the cover rule
  and understated the reach (three measured counter-examples), it duplicated the
  row's reserved-keyword boundary sentence, and `c12`'s test title still said
  "one refusal each". Round 2 (`bug-fix-reviewer-fast`) — CLEAN, all three
  re-measured against the rewritten prose. Round 3 (`bug-fix-reviewer-fast`,
  narrow) — CLEAN over the live-cell repair below.
- **Verification:** SOLID. Witness red under neutralisation of the gate alone
  (17 of 392 red across the eight witness files, filed signature) and green on
  restore, `src/parser/params.ts` byte-exact both sides
  (`3cd22a5421704c07c3ebcf52988431032d67f86a`); default suite 457/457; lint and
  typecheck clean; every lock re-run green (b0262 26, b0273 10, b0274 14, b0277
  12, b0278 14, conformance 27, committed-fixture parse gate 36/36);
  `permitted-codes.json` hash-identical to HEAD. The live cell was run for real
  by the orchestrator under the lock in BOTH directions — green with the gate
  active, red under the same one-line neutralisation naming the registered
  carrier — and audited statically by the verifier against the AGENTS.md live
  conventions with no violation.
- **A vacuous live assertion, found and repaired.** The first live red-proof
  showed the `params:` carrier absent from the registered set with the gate
  NEUTRALISED too: a `params:`-declaring theta is not bypass-eligible, so its
  binder model must resolve at load (`classifyBinderBypass` /
  `resolveBinderModel`, `src/extension/production-composition.ts:994`,
  `:1019`–`:1035`; `src/binder/binder-model.ts:185`–`:200`), and the fixture
  declared no `bind_model:`. The carrier now carries the in-tree `bind_model:`
  convention, and a registrability precondition theta (`b0282liveparamsshape`,
  the same fixture shape with `array<integer>` at the same position) is asserted
  PRESENT before any absence assertion, so the class cannot recur silently.
- **Residuals:**
  1. A non-`Ident`-shaped applied head stays silent and registering at
     `params:` (`p: 'a b<integer>'`, `'Nope.Sub<integer>'`, `'1x<integer>'` —
     measured in review round 1). Unchanged by this fix and outside this
     document's subject, whose class is IDENTIFIERS written as heads; at the
     `let` annotation the same text already refuses. It belongs to the
     not-expression family's unwired-junk gap and owes its own filing.
  2. `let a: Nope<Result<integer>> = Ok(1)` draws
     `theta/parse/generic-arity-mismatch` alone and never names `Nope` — the
     walk-side judgement of the inner application is reached before the outer
     head reaches this sink. Measured, unchanged either side of the fix,
     registration denied either way, and now stated in the registry row rather
     than left implicit.
  3. `c12` is the one re-founded cell carrying TWO diagnostic lines rather than
     one (`theta/parse/malformed-schema-field` beside the head's refusal), from
     two independent seams. The test's title was corrected to state it and the
     registry row now describes the co-fire.
  4. Version is the literal placeholder `0.280.0` throughout this lane — in this
     record, in the test comments and in every coordination note; nothing is
     committed, and `package.json`, `CHANGELOG.md` and `docs/bugs/README.md` are
     untouched.
- **Discharge notes appended:** dated coordination notes to
  `./0164-generic-argument-literal-lowers-permissive.md` (d10),
  `./0217-nested-inline-enum-in-generic-argument-draws-nothing.md` (f2b, b17,
  c9), `./0231-well-formed-field-behind-malformed-entry-unchecked.md` (b9/b9c
  re-vehicle, with the measured ground for `Result<…>` over `array<…>`),
  `./0236-bracket-group-generic-argument-truncates-list.md` (f2b and the
  inventory recount),
  `./0256-generic-argument-stranded-entry-registers-permissive.md` (c12, and the
  restated consequence that its two-argument-generic Reach shape can no longer
  be witnessed at `params:` by a head drawing nothing of its own) and
  `./0281-applied-ok-err-generic-application-silent-at-every-capture.md` (group
  (D) flipped wholesale). Each names what moved, the authority (bug 0282's
  flip-authority widening, 0.280.0) and that the subject is preserved.
- **Pinned dispositions / non-goals:** bug 0262's bare-`NamedType` verdicts, bug
  0273's error-side verdicts, bug 0274's reserved-keyword class, bug 0277's
  unapplied-head refusals (every group including (K), which 0281 re-founded),
  bug 0278's arity gate and 0281's reserved-spelling codes are all unmoved, each
  locked green by its own witness. `theta/parse/result-in-schema-position` is
  untouched. Bare `Foo` legality is unchanged — only the APPLICATION refuses. No
  committed `.theta` / `.thetalib` moves: the corpus-wide claim is discharged by
  `tests/committed-fixture-parse-gate.test.ts` 36/36, not by a scratch probe.
