# Bug 0262 — A `NamedType` that resolves to no declaration draws ZERO diagnostics at nine of the sixteen probed reference positions: `unresolvedNamedTypeDiagnostic`'s emitting call sites cover the `params:`, `@<T>`, `schema` field, alias/union, object-constructor and pattern-head captures only, so the `let` annotation, the `fn` parameter type, the `fn` return type and the `invoke<T>` ascription run no name-resolution pass at all — `let a: Nope = 3` loads clean, registers, and silently disables every type-layer check that annotation would have decided

- **Status:** open
- **Sev/Diff estimate:** S3/D2 — S3 because the silence is not merely a missing
  message: at the nine positions an unresolvable head makes `⊑` answer
  `"unknown"` (`src/parser/type-compat.ts:351–365`), so a mistyped type name
  turns off the checks the position would otherwise decide (measured: with the
  name declared, `let a: Nope = 3` draws
  `theta/parse/let-rhs-type-mismatch` and `f(3)` draws
  `theta/parse/fn-arg-type-mismatch`; with it undeclared, both are silent), and
  the file registers and runs. D2 because the emission builder and the
  resolution helper both already exist and the nine positions collapse to four
  captures, but widening is a DIAG-2 *Trigger* edit under a GOV-15
  diagnostic-registry carve-out and has to state its interaction with the
  deferral disposition bugs 0127 and 0144 settled. Seed S3/D2 retained.
- **Kind:** defect — an under-enforced resolution surface, uniform in case. The
  registry row `theta/parse/unresolved-named-type`
  (`docs/spec_topics/diagnostics/code-registry-parse.md:112`) states the
  trigger as "A `NamedType` that resolves to no declaration usable at the
  position it is written" and then closes the position list to six: the
  `params:` right-hand side, the `@<T>` query annotation, a `schema` body field
  type, a `schema X = ...` alias/union right-hand side, an object-constructor
  name, and a `match` object-pattern head. `docs/spec_topics/grammar.md:105`
  reaches the same `NamedType` production at seven further positions ("`let`
  annotations, `fn` parameter types, schema field types, `params:` field types,
  generic type arguments, union arms, and `invoke<Type>` / type-ascription
  contexts"). The head sentence and the position list therefore disagree about
  the same production, and the implementation follows the list.
- **Affected:**
  - **The emitting builder and its six covered captures.**
    `unresolvedNamedTypeDiagnostic` (`src/parser/theta-document.ts:6437`)
    mints `error theta/parse/unresolved-named-type: unresolved named type
    '<name>'`. Its call sites at HEAD: `parsePattern` (`:4870`, the `match`
    object-pattern head), `checkSchemaDeclarationGraph` (`:7570`, the
    alias/union right-hand side), `walkStatement`'s `"schema"` case (`:8076`,
    a `schema` body field type), `checkObjectExpr` (`:8170`, `:8180`, `:8185`,
    the object-constructor name), and `walkExpr`'s `"query"` case (`:8524`,
    the `@<T>` annotation). The `params:` right-hand side emits the same code
    and message inline from `parseParams` (`src/parser/params.ts`).
  - **The four captures that call no resolution pass.** `walkStatement`'s
    `"let"` case reads the annotation source at
    `src/parser/theta-document.ts:7862` and its `"fn"` case reads the parameter
    type at `:7947` and the return type at `:7962`; each runs
    `parseTypeExpression` plus `annotationSourceIsNotTypeExpression`, and
    neither calls `collectUnresolvedNamedTypes`
    (`src/parser/body-type-lowering.ts:608`). `walkExpr`'s `"invoke"` case
    (`:8354–8374`) states the gap in its own comment: "this position runs no
    other type-grammar pass and no name-resolution pass today".
  - **The doc comment that records the boundary, and is stale by one
    position.** `src/parser/theta-document.ts:6331–6340` calls the trigger "a
    closed five-position list" and enumerates five; the registry row lists six
    (the `match` pattern head, emitted at `:4870`, is absent from the comment).
    The same comment names the excluded set: "a `let` annotation, an `fn`
    parameter type, a generic argument, a union arm and `invoke<Type>` …
    are outside it, so `let x: Nope = 1` resolves nothing and fires nothing."
  - **What the unresolvable name does downstream.**
    `annotationToCompatType` (`src/parser/type-layer-checks.ts:906`) mints
    `{ kind: "named", name: text }` at `:974` for any text that is not a
    primitive or an inline object, with no resolvability test.
    `resolveNamed` (`src/parser/type-compat.ts:146`) answers `undefined` for
    the unresolvable name, and `decide`'s `named` arms return `"unknown"`
    (`:351`, `:355`, `:365`), so every check keyed on that answer defers.
  - **Case independence.** `resolveNamed`'s A–Z fence (`:147–150`, bug 0135's
    §Fix, 0.202.0) makes a lowercase head unresolvable by construction, and the
    six emitting positions run a resolution test rather than a case test. All
    sixteen probed positions are byte-identical for `nope` and `Nope`
    (§Reproduction).
  - **Not affected — the committed corpus.** No committed `.theta` or
    `.thetalib` carries a type atom at one of the nine positions that its own
    file does not declare or import (§Reproduction, corpus sweep), so
    `tests/committed-fixture-parse-gate.test.ts:172–178` stays green under a
    widening.
- **Related:**
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **fixed (0.202.0), discharged as superseded.** Its Parent adjudication note
    re-files the surviving defect — the position silence for ANY unresolvable
    head — to this number. Its Partial-discharge note carries the sixteen-row
    probe table this report re-derives.
  - [0028](./0028-unresolved-annotation-silent-permissive-lowering.md),
    [0025](./0025-ctor-unresolved-schema-name-passthrough.md),
    [0033](./0033-body-level-schema-alias-unsupported.md),
    [0035](./0035-params-rhs-inline-object-under-emission.md) — the fixes that
    built the covered position list one position at a time.
  - [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) — the
    `resolveNamed` read-seam case fence that makes this report's split
    case-independent.
  - [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md)
    and [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md) —
    both settled that an unresolvable named type DEFERS at a consuming gate
    rather than being judged. A widening here changes what reaches those gates:
    the annotation is refused at its own position instead of deferring
    downstream.
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — its witness
    (`tests/b0046-by-clause-undecided-inputs.test.ts`) pins `by`-clause rows
    over the same declaration walk this report's emitting sites sit in.
- **Observed at:** `0.258.0`, HEAD `a6816b96`. Offline and deterministic — no
  live model, no provider.

## Summary

`theta/parse/unresolved-named-type` fires at six captures and nowhere else. At
the other four — the `let` annotation, the `fn` parameter type, the `fn` return
type, the `invoke<T>` ascription — no name-resolution pass runs, so a
`NamedType` naming nothing draws nothing. Measured over the sixteen positions
bug 0051 probed: nine silent, seven diagnosing, and every row identical for
`nope` and `Nope`.

Silence is not the whole cost. The unresolvable name is minted as a `named`
`CompatType` and `⊑` answers `"unknown"` for it, so the checks the annotation
exists to drive stop deciding: `let a: Nope = 3` is silent where
`schema Nope { a: number }` + the same statement draws
`theta/parse/let-rhs-type-mismatch`, and `fn f(x: Nope)` + `f(3)` is silent
where the declared twin draws `theta/parse/fn-arg-type-mismatch`. A mistyped or
un-imported type name disables its position's checking and the theta registers.

## Reproduction

Offline at HEAD `a6816b96`. Harness: `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
over the shipped `parseThetaDocument`, driven from a scratch `npx tsx` script
(token `b0262scratch`) written, run, and deleted. Frontmatter
`description: d` / `mode: prompt`; body tail `"ok"` where required. `SILENT` is
the empty diagnostic list. Neither `nope` nor `Nope` is declared or imported in
any fixture. Every diagnostic below has severity `error`.

| # | position | fixture (`N` = the head) | `nope` | `Nope` | registers |
|---|---|---|---|---|---|
| r1 | `let` annotation | `let a: N = 3` | SILENT | SILENT | yes |
| r2 | `fn` parameter | `fn f(x: N): number { 1 }` + `let r = f(3)` | SILENT | SILENT | yes |
| r3 | `fn` return | `fn f(): N { 3 }` | SILENT | SILENT | yes |
| r4 | generic argument | `let xs: array<N> = [1]` | SILENT | SILENT | yes |
| r5 | `invoke<T>` | `let r = invoke<N>("./x.theta")` | SILENT | SILENT | yes |
| r6 | union arm in a `let` annotation | `let a: N \| number = 3` | SILENT | SILENT | yes |
| r7 | union arm in an `fn` parameter | `fn f(x: N \| number): number { 1 }` | SILENT | SILENT | yes |
| r8 | `Result` argument | `fn f(): Result<N, string> { Ok(1) }` | SILENT | SILENT | yes |
| r9 | inline object field in an `fn` parameter | `fn f(x: { g: N }): number { 1 }` | SILENT | SILENT | yes |
| r10 | inline object field under `params:` | `x: '{ g: N }'` | `unresolved-named-type: unresolved named type 'nope'` | same, `'Nope'` | no |
| r11 | `@<T>` query annotation | ``let r = @<N>`hi` `` | same | same | no |
| r12 | `schema` body field type | `schema S { f: N }` | same | same | no |
| r13 | `params:` right-hand side | `x: 'N'` | same | same | no |
| r14 | alias right-hand side | `schema A = N` + `let a: A = 3` | same | same | no |
| r15 | alias/union right-hand side | `schema A = N \| number` + `let a: A = 3` | same | same | no |
| r16 | object-constructor name | `let v = N { a: 1 }` | same | same | no |

Headline: **nine SILENT (r1–r9), seven diagnosing (r10–r16), sixteen of sixteen
case-identical.** "Registers" is the GOV-15 loads-cleanly reading
(`docs/spec_topics/governance/source-language-stability.md:9`): an `E` denies
registration, so the seven refuse and the nine load.

A seventeenth position, added since bug 0051's table — the `match`
object-pattern head, `match v { N { a } => 1, _ => 2 }` — diagnoses, for both
cases. Bug 0051's r10 spelling (the nested-map `params:` form) is a
`theta/load/params-type-not-expression` and reaches no type position; the
inline-object spelling above is the one that does, as its Partial-discharge
note records.

Derived rows, run once each, all `unresolved named type 'Nope'`:
`schema S { f: { g: Nope } }`, `schema S { f: array<Nope> }`,
``let r = @<array<Nope>>`hi` ``, and ``let r: Nope = @`hi` `` (a `let`
annotation over a bare query is propagated onto the query, so it reaches r11's
capture, not r1's).

**What the silence suppresses.** Same harness; the only delta is a declaration
of the name:

| fixture | diagnostics |
|---|---|
| `let a: Nope = 3` | SILENT |
| `schema Nope { a: number }` + `let a: Nope = 3` | `theta/parse/let-rhs-type-mismatch: let binding 'a' initialiser type mismatch: expected Nope, got integer` |
| `fn f(x: Nope): number { 1 }` + `let r = f(3)` | SILENT |
| `schema Nope { a: number }` + the same two statements | `theta/parse/fn-arg-type-mismatch: fn 'f' argument 0 ('x') type mismatch: expected Nope, got integer` |
| `schema Nope { a: number }` + `fn f(): Nope { 3 }` | SILENT |
| `schema Nope { a: number }` + `let r = invoke<Nope>("./x.theta")` | SILENT |

The last two rows bound the claim: at the `fn` return and `invoke<T>` captures
the position decides nothing even when the name resolves, so widening there
buys the refusal alone, not a recovered check.

**Corpus sweep.** `git ls-files '*.theta' '*.thetalib'` returns 34 files (33
shipped plus the seeded-invalid fixture;
`tests/committed-fixture-parse-gate.test.ts:59–60` pins 31 + 2). Every
non-primitive type atom at a `let` annotation, an `fn` parameter or return
type, or an `invoke<T>` in those files — `Progress`, `Verdict`, `Review`,
`Sentiment`, `Summary`, `Report`, `Reply`, `Author` — resolves against its own
file's declarations or its `.thetalib` import. Zero unresolvable atoms at the
nine positions.

## Expected behaviour

A `NamedType` is an `Ident` naming a `schema` or an `enum`
(`docs/spec_topics/grammar.md:98`). The registered code for one that names
nothing states its own trigger without qualification —
"A `NamedType` that resolves to no declaration usable at the position it is
written" (`code-registry-parse.md:112`) — and the corpus supplies no sentence
saying that a `let` annotation, an `fn` parameter type, an `fn` return type or
an `invoke<T>` ascription is exempt from resolution. `grammar.md:105` puts the
same production at all of them.

Either the nine positions refuse an unresolvable head with the registered code,
or the registry row and the grammar page state which positions defer resolution
and why. The current split is stated nowhere outside a source comment.

## Actual behaviour / root cause

1. **Emission is per-capture, and six captures were wired one bug at a time.**
   `unresolvedNamedTypeDiagnostic` (`src/parser/theta-document.ts:6437`) is
   called from `parsePattern` (`:4870`), `checkSchemaDeclarationGraph`
   (`:7570`), `walkStatement`'s `"schema"` case (`:8076`), `checkObjectExpr`
   (`:8170`, `:8180`, `:8185`) and `walkExpr`'s `"query"` case (`:8524`); the
   `params:` position emits the same code inline from `parseParams`
   (`src/parser/params.ts`). Five of the six route their names through
   `collectUnresolvedNamedTypes` (`src/parser/body-type-lowering.ts:608`)
   against the whole-file name universe.

2. **The four remaining captures call that helper nowhere.** `walkStatement`'s
   `"let"` case (`src/parser/theta-document.ts:7862`) and `"fn"` case (`:7947`
   parameter, `:7962` return) run `parseTypeExpression` plus
   `annotationSourceIsNotTypeExpression` and stop; `walkExpr`'s `"invoke"` arm
   (`:8354–8374`) runs `parseTypeExpression` in `"inline-object-shape"` mode
   and records in its comment that it runs "no name-resolution pass today".
   The nine silent positions of §Reproduction are these four captures and their
   interiors: r4, r6 sit inside the `let` capture; r7, r9 inside the `fn`
   parameter capture; r8 inside the `fn` return capture.

3. **What runs instead is a derivability test, which an `Ident` passes.**
   `theta/parse/annotation-type-not-expression`
   (`code-registry-parse.md:107`) refuses text deriving from no `Type`
   production at exactly those three annotation captures, and its own row
   excludes `Ident`-shaped text: "the prose spelling `thisisnotatype` … and a
   number-literal trailer on an identifier (`integer1`); their silence at these
   positions is `theta/parse/unresolved-named-type`'s closed five-position
   list's question, not this row's." Both rows point at the other.

4. **Downstream every consumer defers rather than deciding.**
   `annotationToCompatType` (`src/parser/type-layer-checks.ts:906`) mints
   `{ kind: "named", name: text }` at `:974`; `resolveNamed`
   (`src/parser/type-compat.ts:146`) answers `undefined`; `decide`'s `named`
   arms return `"unknown"` (`:351`, `:355`, `:365`). Deferral is the settled
   disposition at the consuming gates (bugs 0127, 0144), so nothing recovers
   the check further down — the position is the last place the fault is
   visible.

5. **The case dimension is closed, not open.** `resolveNamed`'s A–Z fence
   (`src/parser/type-compat.ts:147–150`) makes a lowercase head unresolvable
   by construction, and the six emitting captures test resolution, not case.
   Hence the sixteen case-identical rows: `nope` and `Nope` differ in no
   observable at any probed position.

## Why it matters

- **A mistyped or un-imported type name silently disables its position's
  checking.** `let a: Nope = 3` and `fn f(x: Nope)` + `f(3)` are silent; with
  `Nope` declared the same sources draw `let-rhs-type-mismatch` and
  `fn-arg-type-mismatch`. The author sees a clean load and gets no type layer
  at that binding.
- **A forgotten `.thetalib` import is the reachable spelling.** The name is
  unresolvable exactly when the import line is missing or misspelled, and the
  four uncovered captures are where imported schema names are ordinarily
  written.
- **The registry's own head sentence over-states what fires.** A reader of
  `code-registry-parse.md:112` who stops at the trigger sentence expects the
  code at every reference; the closed position list two sentences later is the
  only correction, and `grammar.md:105` gives no hint of a split.
- **The split is recorded only in a source comment, which is itself stale.**
  `src/parser/theta-document.ts:6331–6340` calls the list "five-position" while
  six positions emit at HEAD.
- **The blast radius is zero today and grows with the corpus.** No committed
  `.theta` or `.thetalib` carries an unresolvable atom at the nine positions.

## Non-goals

- **Case-specific claims about a reference position.** Whether a lowercase
  `NamedType` at a reference owes a case diagnostic was
  [0051](./0051-lowercase-named-type-reference-positions-silent.md)'s subject
  and is discharged as superseded. This report's subject is case-independent:
  `nope` and `Nope` are identical at all sixteen positions, and the fence in
  `resolveNamed` (`src/parser/type-compat.ts:147–150`) is why. 0051's document,
  including its Partial-discharge and Parent adjudication notes, is untouched
  by any fix under this number.
- **Declaration-position case enforcement.** `theta/parse/schema-case-mismatch`
  (`code-registry-parse.md:20`) and its unenforced `enum` variant position
  belong to the schema-case-mismatch surface, not here.
- **The deferral disposition at consuming gates.** That an unresolvable named
  type defers rather than being judged at `array.join`
  ([0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md))
  and at the `fn`-argument sink
  ([0144](./0144-annotated-unresolvable-arg-structural-param-emits.md)) is
  settled and stays settled. This report refuses the annotation at its own
  position; it does not reopen what a deferred type means downstream.
- **The derivability rows.** `theta/parse/annotation-type-not-expression` and
  `theta/parse/query-annotation-type-not-expression` judge whether text derives
  from a `Type` production. An `Ident` derives, so their boundaries do not
  move.
- **`enum` declarations being absent from the resolution env at the `⊑`
  seam.** Recorded by 0031 and 0038 and unchanged here.

## Fix

Route: emit `theta/parse/unresolved-named-type` at the four uncovered captures,
so the nine positions of §Reproduction refuse an unresolvable head with the
code the other seven already draw.

**Emission sites.** `walkStatement`'s `"let"` case
(`src/parser/theta-document.ts:7862`), its `"fn"` case at the parameter
(`:7947`) and return (`:7962`) reads, and `walkExpr`'s `"invoke"` arm
(`:8354–8374`). Each already holds the captured annotation text and the walk's
`refs.typeNames` universe, which is what `collectUnresolvedNamedTypes`
(`src/parser/body-type-lowering.ts:608`) consumes at the five wired captures;
reuse it rather than minting a second resolver, so the interiors (a generic
argument, a union arm, an inline object field — r4, r6, r7, r8, r9) are reached
by the same traversal that already reaches them at a `schema` field.

**Guard.** Follow the landed per-capture guard shape: a capture whose own type
walk already drew an error-severity diagnostic keeps that diagnostic alone
(`:7867–7872` for the `let` capture), so a refused annotation does not also
draw an unresolved-name line, and a reserved-keyword head keeps
`theta/parse/reserved-keyword-as-identifier`.

**Registry disposition — the *Trigger* does NOT already cover these
positions.** `code-registry-parse.md:112` states the head sentence broadly and
then closes the list to six named positions; the nine are outside it. The
widening is therefore a *Trigger* edit under
[DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)
(`diagnostic-shape.md:72`), landing in the same commit as the implementation,
and — because inputs that load cleanly today begin emitting an `E` — a
[GOV-15 diagnostic-registry carve-out](../spec_topics/governance/source-language-stability.md#gov-15)
whose in-scope input set is stated in the fix record. The row already carries
one such widening note, so the sentence pattern exists. The *Message* bytes
(`unresolved named type '<name>'`) do not move. `grammar.md:105`'s position
list needs no edit under this route: after it, resolution holds at every
position that sentence names.

**Constraints.**

1. **Locks that must stay green.** Bug 0135's fence cells
   (`tests/index-sentinel-typeenv-case-fence.test.ts`, and its live twin
   `tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts`) — the
   widening adds a refusal at the position and must not move what `resolveNamed`
   answers. Bug 0046's witness
   (`tests/b0046-by-clause-undecided-inputs.test.ts`) sits on the same
   declaration walk. Bug 0127's and bug 0144's witnesses pin deferral at the
   consuming gates for annotations this route now refuses upstream; a refused
   annotation reaching those gates differently is a change to their subject and
   must be measured, not assumed.
2. **0051 stays untouched.** Its Status (`fixed (0.202.0)`, discharged as
   superseded) and its two appended notes are the source measurements for this
   report and are not rewritten.
3. **The corpus gate.** `tests/committed-fixture-parse-gate.test.ts:172–178`
   asserts zero diagnostics over 33 shipped files. §Reproduction's sweep
   measures zero affected atoms at HEAD; re-run it at the fix's own HEAD rather
   than inheriting the number.
4. **Fix the stale comment in the same commit.**
   `src/parser/theta-document.ts:6331–6340` says "five-position list" and omits
   the `match` pattern head; after the widening it states the whole covered
   set.
5. **Witnesses.** One red-first cell per newly covered position (r1–r9), each
   with its PascalCase and lowercase spelling to lock case independence, plus
   negative controls that a resolving name at the same position still draws its
   type-layer verdict (`let-rhs-type-mismatch`, `fn-arg-type-mismatch`) and
   that the `fn` return and `invoke<T>` captures draw the refusal alone.

## Provenance

- **Origin:** bug
  [0051](./0051-lowercase-named-type-reference-positions-silent.md)'s Parent
  adjudication note (discharged as superseded, recorded at merge): "the
  surviving defect is the nine-position silence for ANY unresolvable
  named-type head, which is not this report's subject and deserves its own
  correctly-framed filing". Filed in the fifteenth set's residual wave. Source
  measurements: 0051's Partial-discharge note (re-derivation at 0.243.0) and
  `.pi/tmp/fixes/0051-report.md`.
- **Spec:** `docs/spec_topics/grammar.md:98` (`NamedType ::= Ident`), `:105`
  (the positions a bare `Type` appears at);
  `docs/spec_topics/diagnostics/code-registry-parse.md:112`
  (`theta/parse/unresolved-named-type`, the six-position trigger), `:107`
  (`annotation-type-not-expression` and its `Ident` exclusion), `:20`
  (`schema-case-mismatch`, §Non-goals);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate).
- **Implementation, re-derived at HEAD `a6816b96`:**
  `src/parser/theta-document.ts:6331–6340` (the closed-list doc comment),
  `:6437` (`unresolvedNamedTypeDiagnostic`), `:4870` (`parsePattern`), `:7570`
  (`checkSchemaDeclarationGraph`), `:8076` (`walkStatement`'s `"schema"` case),
  `:8170`, `:8180`, `:8185` (`checkObjectExpr`), `:8524` (`walkExpr`'s
  `"query"` case), `:7862` / `:7947` / `:7962` (the three uncovered annotation
  captures), `:8354–8374` (the `invoke` arm and its comment);
  `parseParams` (`src/parser/params.ts`, the `params:` emission);
  `src/parser/body-type-lowering.ts:608` (`collectUnresolvedNamedTypes`);
  `src/parser/type-layer-checks.ts:906` (`annotationToCompatType`), `:974` (the
  `named` mint); `src/parser/type-compat.ts:146` (`resolveNamed`), `:147–150`
  (the bug 0135 A–Z fence), `:351`, `:355`, `:365` (the `"unknown"` arms).
- **Tests read, none changed:**
  `tests/committed-fixture-parse-gate.test.ts:59–60` (the pinned shipped
  counts), `:172–178` (the zero-diagnostic assertion);
  `tests/index-sentinel-typeenv-case-fence.test.ts`;
  `tests/b0046-by-clause-undecided-inputs.test.ts`;
  `tests/helpers/e2e-s1.ts:39` (`parseDoc`).
- **Evidence:** two scratch `npx tsx` probes over `parseDoc` and one corpus
  sweep by `git ls-files` + `grep`, all under scratch token `b0262scratch`,
  written, run, and deleted in one sweep. Offline, no model, no provider. No
  file in the tree modified other than this report.

### Attempt note — §Fix route implemented and measured, NOT landed (2026-08-24)

Appended by a fix attempt at HEAD `616c6d0e` (0.258.0). **This report stays
open and its subject stays intact.** Every cite in the sections above was
re-derived at that HEAD and holds byte-exact, and §Reproduction's sixteen-row
table re-measures exactly as written — nine SILENT, seven diagnosing, sixteen
of sixteen case-identical. The route was implemented in full and then reverted;
`src/parser/theta-document.ts` is byte-identical to HEAD (`git hash-object` =
`git rev-parse HEAD:src/parser/theta-document.ts`). What follows is the
measurement the attempt produced, so a later attempt does not re-derive it.

**Correction 1 — §Reproduction's corpus sweep is wrong.** It reports "Zero
unresolvable atoms at the nine positions" over the 34 tracked files. The sweep
missed `docs/examples/personas.thetalib:7`, which spells
`fn rate_strictness(a: Author): Result<integer, QueryError> {` — a `QueryError`
atom at an `fn` RETURN type, one of the nine. `collectUnresolvedNamedTypes`
answers `["QueryError"]` for that text against any declaration set, so the
route as §Fix states it newly refuses a shipped fixture and reds
`tests/committed-fixture-parse-gate.test.ts`. The route needs the builtin
error-model name `QueryError` admitted at the four captures — the same
admission `code-registry-parse.md:112` already states for the pattern-head
position and `patternHeadTypeNames` already implements. With that admission the
corpus gate stays green and the corpus blast radius is genuinely zero.

**Correction 2 — a fifth capture propagates, and double-emits.** §Fix names the
propagated `let` annotation nowhere. `parseLet` writes a `let` annotation onto a
bare-query initialiser and `walkExpr`'s `"query"` arm is that text's sole
emitter (bug 0093), so the `"let"` capture must withhold there or the count for
one written annotation rises from one to two, contradicting
`tests/unresolved-annotation-lowering.test.ts`'s pinned counts. The same
propagation exists at the `fn` RETURN slot through QRY-2's `fn`-return sink
(bug 0220), and §Fix's guard shape does not reach it: measured, an unresolvable
declared return type over a query-tailed body drew TWO lines, one at the
declaration's range and one at the query's. A landing route owes that partition
for both propagating captures, not just the `let` one.

**Correction 3 — capture artefacts are drawn into the emission set.** The
annotation captures absorb trailing text, so text the author never wrote as a
name arrives `Ident`-shaped and is refused: `fn h(a: string` + `let x = 1`
captures `stringletx` (bug 0151's witness) and `fn f(): number 1` captures
`number1` (bug 0249's witness). Both newly draw the code beside the diagnostic
that names the actual fault. §Fix's guard — a capture whose own walk drew an
error keeps that alone — does not suppress either, because in both cases the
naming diagnostic is emitted outside that capture's own window. Whether an
artefact spelling is inside this row's emission set is a disposition §Fix does
not decide.

**The blocking measurement — the witness corpus, not the shipped corpus.**
§Fix constraint 1 names four locks (0135, 0046, 0127, 0144) and asks that the
0127/0144 interaction be measured rather than assumed. Measured, with the route
implemented and D1–D4 conforming: **82 cells across 17 pinned witness files of
15 already-fixed bugs turn red**, every one a consequential whole-list
assertion flip on a fixture that used an undeclared head at one of the four
widened captures as a stand-in for "past the parser's static view":
`typeenv-prototype-names` (26, bug 0038),
`unresolvable-operand-structural-target-adjudication` (15, bug 0144),
`annotation-nontype-text-refusal` (10, bug 0124),
`index-sentinel-typeenv-case-fence` (6, bug 0135 — a named lock),
`index-element-alias-unfolded` (6), `join-element-unresolvable-disposition`
(3, bug 0127), `fn-param-alias-unfolded-at-gates` (3),
`alias-sink-array-element-check` (3), `let-annotation-query-double-emission`
(2), and one each in `reserved-keyword-misfire-faces`,
`reserved-keyword-inline-object-and-literal-keys` (bug 0249 — a named lock),
`let-annotation-recorded-binding-type`, `let-annotation-inline-object-compat`,
`inline-empty-object-type`, `imported-thetalib-fn-call-args-checked`,
`fn-return-void-query-sink` and `fn-param-list-unclosed`. Bug 0046's witness
and `tests/committed-fixture-parse-gate.test.ts` stayed green.

Two of those files are locks §Fix requires to stay green, and none of the
seventeen is pre-authorised by this report. The flips are not stale controls:
several are the settled subject of the bug that wrote them — bug 0130's
`let x: Nope = 1` silence is `type-system.md:48`'s stated disposition, bug
0045's `invoke<T>` control asserts the name walk stays silent there, and bug
0144's registration outcome for a program whose value fits its parameter is the
observable that report delivered. §Non-goals reserves the consuming gates'
deferral, and the widening leaves `theta/parse/fn-arg-type-mismatch` unmoved,
so no settled *Trigger* is contradicted — but the registration outcome for
those programs is reversed, and that is a disposition this report authorises
nowhere.

**What a landing attempt owes.** The route is implementable — the witness
`tests/b0262-unresolved-named-type-reference-positions.test.ts` (49 fixture
rows in 12 cells, red at HEAD for the right reason: `received []` at all
eighteen r1–r9 cells) went fully green under it, with the seven already-emitting
positions, the `match` pattern head, the reserved-keyword heads and the
per-capture guard all byte-stable. What it lacks is authority: §Fix must
enumerate the seventeen witness files and their old→new flips with the authority
for each, decide corrections 1–3, and state the GOV-15 in-scope input set to
include the `Ident`-shaped spellings `code-registry-parse.md:107` and `:108`
currently assign to this row's "closed five-position list" — both of which
become stale prose the widening must correct in the same change-set.
