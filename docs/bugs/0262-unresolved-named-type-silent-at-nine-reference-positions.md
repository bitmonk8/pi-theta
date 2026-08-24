# Bug 0262 — A `NamedType` that resolves to no declaration draws ZERO diagnostics at nine of the sixteen probed reference positions: `unresolvedNamedTypeDiagnostic`'s emitting call sites cover the `params:`, `@<T>`, `schema` field, alias/union, object-constructor and pattern-head captures only, so the `let` annotation, the `fn` parameter type, the `fn` return type and the `invoke<T>` ascription run no name-resolution pass at all — `let a: Nope = 3` loads clean, registers, and silently disables every type-layer check that annotation would have decided

- **Status:** fixed (0.266.0)
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

## Fix (0.266.0)

- **What shipped:**
  - `src/parser/theta-document.ts` — the four new emission sites
    (`walkStatement`'s `"let"` annotation read, its `"fn"` parameter and return
    reads, `walkExpr`'s `"invoke"` arm), each routing the captured text through
    the existing `collectUnresolvedNamedTypes` helper
    (`src/parser/body-type-lowering.ts`) and the existing
    `unresolvedNamedTypeDiagnostic` builder — no second resolver minted;
    `withBuiltinErrorModelNames`, seeded from the same builtin set the
    pattern-head admission uses, admits the builtin error-model names at all
    four captures (clause (iv)(1)); the shared pure `captureAbsorptionWindow`
    helper with `positionBefore` and `captureWindowAlreadyRefused`, carrying a
    same-walk-refusal filter, implements the artefact suppression (clause
    (iv)(3)); `propagatedToQuery` reads a null-prototyped index of QRY-2's own
    propagation report through `Object.hasOwn` (clause (iv)(2));
    `StructuralRefs` gained `priorDiagnostics` and `queryPropagations`, both
    threaded by explicit dependency injection; several stale source comments
    corrected.
  - `src/parser/query-schema-resolve.ts` and
    `src/parser/query-schema-inference.ts` — QRY-2 reports the propagations it
    performs: `resolveQuerySchemas` returns `propagations`,
    `resolveQuerySchemaSink` returns `{ schema, frame }`, and sink frames carry
    a `FrameOrigin`. This file pair is a scope expansion beyond §Fix's named
    surface. It was necessary because the withhold clause (iv)(2) mandates has
    to agree with the propagation set exactly, and deriving it from the pass
    that performs the propagation is the only construction under which the two
    cannot drift; the hand-rolled predicates it replaced were measured wrong in
    three ways, two of them regressions against pre-fix HEAD (review round 3).
    Recorded as self-authorization 2 below.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the
    `theta/parse/unresolved-named-type` row's *Trigger* widened to the full
    reference position set, with the four dispositions stated in spec
    vocabulary; the `theta/parse/annotation-type-not-expression` and
    `theta/parse/query-annotation-type-not-expression` rows' cross-references to
    this row's "closed five-position list" rewritten in the same commit. The
    *Message* bytes are byte-unchanged (`unresolved named type '<name>'`).
  - `docs/spec_topics/type-system.md` — one new normative sentence in the
    existing void-sentence pattern; one clarifying clause scoping the
    *Unresolvable operands* paragraph to the withheld / past-the-static-view
    class; a dated (2026-08-24) requalification of bug 0127's element-judging
    sentence as subsumed, not reversed. Bug 0144's two landed sentences ("The
    skip is unconditional on the target's kind…", "The skip is likewise
    unconditional on whether the position documents a runtime AJV net…") and
    bug 0127's receiver clause are byte-verbatim against HEAD.
  - `docs/spec_topics/grammar.md` — no edit, per clause (iii). `docs/reference/`
    — no edit owed: `rg -n "unresolved-named-type" docs/reference/` returns
    `docs/reference/diagnostics.md` line 158 (a *Message*-only row, and the
    *Message* did not move) and `docs/reference/frontmatter.md` line 80 (the
    `params:` position in prose). Neither mirrors the position list.
  - NEW `tests/b0262-unresolved-named-type-reference-positions.test.ts` — 26
    cells. Rows r1–r9 red-first at both the PascalCase and the lowercase
    spelling (the case-independence lock), the seven already-emitting positions
    plus the `match` pattern head as byte-stability controls, negative controls
    (a declared head still draws its type-layer verdict; the `fn` return and
    `invoke<T>` captures draw the refusal alone), the `QueryError` admission
    including one cell over the real `docs/examples/personas.thetalib` bytes,
    every propagation-withhold case, the artefact-suppression cases, the
    capture-window geometry, and the nested-capture cases.
  - NEW
    `tests/live/b0262live-unresolved-named-type-reference-position-live-cell.test.ts`
    — the carrier is absent from the registered set and its code names on the
    `theta-system-note` channel, while the byte-neighbour declared-head control
    registers and drives a real task-framed arithmetic turn.
  - Seventeen pinned witness files re-vehicled, flipped, re-founded or
    citation-corrected, enumerated in *The authorised witness corpus* below.
- **Gates:**
  - Witness: `npx vitest run
    tests/b0262-unresolved-named-type-reference-positions.test.ts` →
    `Test Files  1 passed (1)` / `Tests  26 passed (26)`.
  - Full default suite: `npm test` → `Test Files  440 passed (440)` /
    `Tests  9232 passed (9232)`.
  - Typecheck: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) — clean, no
    output.
  - Lint: `npm run lint`
    (`eslint --no-error-on-unmatched-pattern "src/**/*.ts"`) — clean, no output.
  - Corpus gate and citation gate: `npx vitest run
    tests/committed-fixture-parse-gate.test.ts
    tests/citation-symbol-form-gate.test.ts` → `Test Files  2 passed (2)` /
    `Tests  39 passed (39)`; the citation-gate pin stayed at 415 and did not
    rise.
  - Live, run under the mandatory lock after the final source change:
    `npx vitest run --config config/vitest/vitest.live.config.ts
    tests/live/b0262live-unresolved-named-type-reference-position-live-cell.test.ts
    tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts
    tests/live/acceptance` → `Test Files  17 passed (17)` /
    `Tests  27 passed (27)`. H9a acceptance is untouched by the widening; the
    permitted-codes sets are byte-unchanged.
  - Clause (v) corpus sweep, re-run at this HEAD over
    `git ls-files '*.theta' '*.thetalib'`: 34 files, ZERO newly refusing, which
    is the count the ruling expects, reached through the clause-(iv)(1)
    admission.
- **Review:** five rounds.
  - Round 1 (deep) — 10 findings and 1 residual: two cell mis-classifications
    against clause (i)'s FLIP class, an incoherent §C byte-pin, a false
    `integer1` registry sentence, a `return`-statement double emission, an
    over-suppressing capture window, two banned words, stale citations,
    `path:line` forms, a false failure reading, and an implementation identifier
    in registry prose. All fixed.
  - Round 2 (fast) — all ten remedies confirmed landed; raised the
    two-return-position-query double emission and recommended a deep round.
  - Round 3 (deep) — upheld the orchestrator's adjudication of round 2's
    finding; raised 6: nested-capture swallowing, and three propagation misses
    (array literal, ternary/array `let`, call-argument parameter), two of them
    measured regressions against pre-fix HEAD. All fixed by deriving the
    withhold from QRY-2's own propagation report.
  - Round 4 (deep) — upheld the `fn`-parameter self-authorization and its bound;
    raised 1: clause-(iv)(3) suppression swallowing author-written heads under a
    prior-pass fault inside the `let` and `invoke` windows. Re-measured
    independently by the orchestrator on a quiet tree and confirmed; fixed by
    the shared `captureAbsorptionWindow` helper.
  - Round 5 (deep, final) — clean, no ship blocker; three residuals recorded.
- **Verification:** Phase 4 verdict SOLID.
  - Obligation 1 — eight targeted neutralisations each proved a distinct witness
    group can red, each restored byte-exact by blob hash; no group vacuous.
  - Obligation 2 — suite, typecheck and lint green.
  - Obligation 3 — live, discharged by the orchestrator under the lock;
    verifiers do not run live.
  - Obligation 4 — corpus sweep ZERO; `package.json`, `package-lock.json`,
    `CHANGELOG.md`, `docs/bugs/README.md`, `docs/bugs/0051-*.md`, bug 0046's
    witness (`tests/b0046-by-clause-undecided-inputs.test.ts`) and
    `tests/committed-fixture-parse-gate.test.ts` all byte-untouched against
    HEAD; no tracked file missing.
- **Residuals:** four, numbered in *Residuals* below.
- **Discharge notes appended:**
  [0045](./0045-inline-empty-object-type-missing-empty-schema-body.md),
  [0089](./0089-fn-param-alias-not-unfolded-iterand-join.md),
  [0127](./0127-join-element-gate-does-not-defer-on-unresolvable-element.md),
  [0130](./0130-let-rhs-type-mismatch-declines-object-union.md),
  [0144](./0144-annotated-unresolvable-arg-structural-param-emits.md) — each
  dated 2026-08-24, each recording the old→new movement, the authorising ruling
  clause and the file's own re-measurement, and each leaving its report's Status
  unchanged.
- **Pinned dispositions / non-goals:** the consuming gates' deferral for the
  withheld class (bugs 0127 and 0144) is unchanged; the derivability rows'
  boundaries do not move; declaration-position case enforcement is untouched;
  [0051](./0051-lowercase-named-type-reference-positions-silent.md) is untouched
  entirely — Status and both appended notes; bug 0046's witness and
  `tests/committed-fixture-parse-gate.test.ts` stay byte-green without edit;
  every witness file outside the seventeen enumerated below is byte-unchanged.

### The operator ruling

> **OPERATOR RULING (sixteenth set): 0262 = option (a) — the FULL widening. Emit theta/parse/unresolved-named-type at the four uncovered captures (walkStatement's "let" read, its "fn" parameter and return reads, walkExpr's "invoke" arm), so all nine silent reference positions (r1–r9 of §Reproduction) refuse a written NamedType head that resolves to no visible declaration, case-independently. This generalizes the 0127 ruling's own distinction — a provably-unresolvable WRITTEN name is a provable author error and is judged at the position it is written; a type merely withheld / past the parser's static view keeps the deferring disposition everywhere it holds today. Clauses:
> (i) The ~82 assertion flips across the 17 pinned witness files measured by the attempt note are AUTHORIZED AS A BATCH, under this partition: vehicle-collateral cells (undeclared heads used as stand-ins for "past the parser's static view" — incl. the named LOCKS 0135 index-sentinel-typeenv-case-fence (6 cells, + its live twin if its fixtures use the same vehicles) and 0249 reserved-keyword-inline-object-and-literal-keys (1 cell)) are RE-VEHICLED with subjects preserved per the 0165/0251 precedent, or flipped to expect the added refusal where the subject is strengthened rather than obstructed (the 0038 typeenv-prototype-names prototype-hygiene cells are the latter class); subject-adjacent cells — 0130's let-silence row, 0045's invoke<T> no-name-walk control, 0127's three oracle cells, 0089's b12/b13 (whose refusal CODE changes from non-string-array-join to unresolved-named-type because the param annotation now refuses upstream; 0127's §C reads those blocks — flip the two files coherently together) — FLIP old→new under this ruling, each with a dated coordination note appended to the owning bug doc (0130, 0045, 0127, 0089; and 0144 per clause ii; X.Y.Z placeholders).
> (ii) Bug 0144's witness (unresolvable-operand-structural-target-adjudication, 15 cells): the deferral-adjudication SUBJECT is preserved and re-founded on the withheld class — operands past the parser's static view for legitimate reasons (an inferred binding whose RHS depends on a tool call, an invoke against an erroring callee, or the nearest offline-constructible equivalent) — wherever constructible; cells that specifically probed the written-undeclared-annotation route become load-refusal cells. The type-system.md:48 sentences 0144 landed ("the skip is unconditional on the target's kind…", "…likewise unconditional on whether the position documents a runtime AJV net…") stay VERBATIM — they govern the withheld class. Dated coordination note on 0144's doc recording that the registration outcome for WRITTEN-vehicle programs reverses under this ruling.
> (iii) Spec edits, same commit: DIAG-2 Trigger widening of code-registry-parse.md:112's position list to the full reference set (Message bytes unchanged) + the docs/reference mirror; rows :107 and :108's cross-references to "unresolved-named-type's closed five-position list" are STALE under the widening and are rewritten in the same commit; ONE new normative sentence on the type-system page in the existing void-sentence pattern ("…is rejected at parse time as theta/parse/unresolved-named-type before any compatibility question arises"), plus at most one clarifying clause scoping the Unresolvable-operands paragraph to the withheld/invisible class; a DATED requalification of 0127's element-judging sentence on that page (its input class is now refused upstream — subsumed, not reversed; the receiver clause and the rest of the paragraph stay verbatim); the GOV-15 diagnostic-registry carve-out is stated in the fix record with the in-scope input set (written unresolvable NamedType heads at the nine positions, plus nothing else); grammar.md:105 needs NO edit.
> (iv) Three dispositions, decided: (1) builtin error-model names (QueryError) are ADMITTED at the four captures — copy the pattern-head position's existing admission — so docs/examples/personas.thetalib:7 keeps loading and the corpus gate stays green; (2) ONE emission per written annotation at BOTH propagating captures: the let→query propagation AND the fn-return→query propagation withhold at the propagating capture (the query arm is the sole emitter for propagated text; no double emission — the attempt note measured two lines without this); (3) artefact spellings (stringletx, number1 — capture debris from other syntax errors) are SUPPRESSED: the new emission is withheld when the capture's source window is already covered by an error-severity diagnostic naming the real fault — the generalization of the landed per-capture guard shape; one written mistake draws one diagnostic naming it.
> (v) The corpus sweep is re-run at the fix's own HEAD; with the clause-(iv)(1) admission the expected count of newly-refusing shipped files is ZERO.
> (vi) Locks that stay byte-green and untouched: bug 0046's witness, tests/committed-fixture-parse-gate.test.ts (green via the admission, not via edit), 0051's doc (untouched entirely — Status, both notes), and every witness file NOT in the attempt note's 17-file list.

### The authorised witness corpus

Every row re-derived against the landed bytes at this HEAD. *Cells* counts
runtime cells whose asserted bytes moved, with `it.each` fan-out expanded; a
cell whose only change is a comment is not counted. *Owning bug* is the bug the
enclosing `describe` block names.

| file | owning bug | cells | bucket | old→new | authorising clause |
|---|---|---|---|---|---|
| `tests/typeenv-prototype-names.test.ts` | 0038 | 26 | FLIPPED (subject strengthened) | silent → the added refusal, at `w1`–`w6`, the twelve-row `it.each` over `Object.getOwnPropertyNames(Object.prototype)`, `t5`, `t6`, `c1`/`c2`, `c3`, `c9`, `r3`, `r5`, `r6` | (i), "flipped to expect the added refusal where the subject is strengthened rather than obstructed" |
| `tests/unresolvable-operand-structural-target-adjudication.test.ts` | 0144 | 15 | RE-FOUNDED | eleven re-vehicled `let v: Zz = [1]` → `let v = Ok([1])?`; four (`b7`, `b10`, `e2`, `e5`) converted to load-refusal cells | (ii) |
| `tests/annotation-nontype-text-refusal.test.ts` | 0124 | 10 | FLIPPED | `thisisnotatype` / `integer1` / `Ghost` at the `let`, parameter and return positions, and `invoke<Ghost>`: silent → refused | (i) |
| `tests/index-sentinel-typeenv-case-fence.test.ts` | 0135 (named LOCK) | 6 | RE-VEHICLED | `Nope` → `QueryError` in `A1`, `JOIN_BODY` and `SINK_BODY`, consumed by the two `a1` cells and by `C1`–`C4` | (i), the named 0135 lock, "6 cells" |
| `tests/index-element-alias-unfolded.test.ts` | 0125 | 6 | RE-VEHICLED | `Nope` → `QueryError` at `d3`, `d7`, `d13`, `d14`, `d15`, `d16` | (i) |
| `tests/join-element-unresolvable-disposition.test.ts` | 0127 | 3 rows, plus the §(C) byte-pin | FLIPPED | `E1`/`E6` → `["theta/parse/unresolved-named-type", JOIN_CODE]`; `R1` → `["theta/parse/unresolved-named-type"]`; §(C)'s pin rewritten to bug 0089's new `b12` bytes | (i), "0127's three oracle cells"; "flip the two files coherently together" |
| `tests/fn-param-alias-unfolded-at-gates.test.ts` | 0089 | 3 | MIXED | `b12` FLIPPED to the ordered pair `["theta/parse/unresolved-named-type", "theta/parse/non-string-array-join"]`; `e1`/`e2` RE-VEHICLED `Nope` → `QueryError`; `b13` not exposed, asserted bytes unchanged | (i), "0089's b12/b13" |
| `tests/alias-sink-array-element-check.test.ts` | 0157 | 3 | RE-VEHICLED | `Nope` / `Ghost` → `QueryError` | (i) |
| `tests/let-annotation-recorded-binding-type.test.ts` | 0083 | 1 | FLIPPED | `s9` → `["theta/parse/unresolved-named-type", "theta/parse/non-string-array-join"]` | (i) |
| `tests/let-annotation-query-double-emission.test.ts` | 0093 | 1 | FLIPPED | the non-query control → its own upstream refusal | (i), bounded by (iv)(2) |
| `tests/let-annotation-inline-object-compat.test.ts` | 0130 | 1 | FLIPPED | `c5` `let x: Nope = 1` silent → refused | (i), "0130's let-silence row" |
| `tests/inline-empty-object-type.test.ts` | 0045 | 1 | FLIPPED | `i1`'s `Ghost` row silent → refused; the other four rows stay silent | (i), "0045's invoke<T> no-name-walk control" |
| `tests/imported-thetalib-fn-call-args-checked.test.ts` | 0138 | 1 | RE-VEHICLED | the library's own `Author` → `QueryError` | (i) |
| `tests/fn-return-void-query-sink.test.ts` | 0220 | 1 | FLIPPED | the non-propagated ghost return → its own upstream refusal | (i), bounded by (iv)(2) |
| `tests/live/index-sentinel-typeenv-case-fence-live-cell.test.ts` | 0135 (live twin) | 1 fixture | RE-VEHICLED | `Nope` → `QueryError` | (i), "+ its live twin if its fixtures use the same vehicles" |
| `tests/fn-arg-type-mismatch-wired.test.ts` | — | 0 | citation-shift only | two comment citations of `tests/fn-param-alias-unfolded-at-gates.test.ts` re-derived to lines 903 through 925 of that file | `docs/STYLE.md`, not the ruling |
| `tests/wire-translation-inbound-retag.test.ts` | — | 0 | citation-shift only | one comment citation of `tests/typeenv-prototype-names.test.ts` re-derived to line 1062 of that file | `docs/STYLE.md`, not the ruling |

Three files in the attempt note's seventeen-file list came out green without
edit — `tests/reserved-keyword-misfire-faces.test.ts`,
`tests/reserved-keyword-inline-object-and-literal-keys.test.ts` (bug 0249, a
named LOCK, so clause (i)'s authorisation for its one cell went unused) and
`tests/fn-param-list-unclosed.test.ts` — because dispositions (iv)(2) and
(iv)(3), which the attempt note lacked, suppress exactly those flips. The
attempt note projected ~82 flips; the landed change flipped fewer, and the
difference is those two dispositions.

### The GOV-15 diagnostic-registry carve-out

The widening is a
[GOV-15](../spec_topics/governance/source-language-stability.md#gov-15)
diagnostic-registry carve-out. Its in-scope input set is a written, unresolvable
`NamedType` head at one of the nine reference positions r1–r9 of §Reproduction —
the `let` annotation, the `fn` parameter type, the `fn` return type, the
`invoke<T>` ascription, and the generic arguments, union arms, `Result`
arguments and inline object fields nested inside those four captures — and
nothing else. Every input in that set loaded cleanly before this change and
draws an `E` after it, so none remains in the equivalence promise's input set.
Outside that set nothing moves: the seven already-emitting positions keep their
bytes, the *Message* is byte-unchanged, a head admitted by the builtin
error-model admission is outside the set (clause (iv)(1)), text a capture
absorbed from a different authoring mistake is outside it (clause (iv)(3)), and
an annotation whose text response-schema inference carries onto a query draws
its one refusal at the query arm rather than twice (clause (iv)(2)).

### Residuals

1. **A wide-ranged ENCLOSING refusal of a different code still swallows a
   nested written head's additional refusal.** `fn f(): integer-- { let y: Gone
   = 1  1 }` draws the `theta/parse/annotation-type-not-expression` for `f`
   alone. The behaviour is byte-identical to pre-fix HEAD, registration is
   refused either way, and the code implements clause (iv)(3)'s trigger
   literally; what over-promises for this shape is the registry row's glosses. A
   one-clause qualification, or widening the same-walk filter to same-construct
   annotation refusals, closes it.
2. **The initialiser-less `let` and body-less `fn` fallback window (the whole
   construct) swallows the written head.** `let a: Nope` draws
   `theta/parse/let-without-initialiser` alone. The fallback carries the two
   mandated artefact fixtures, is stated verbatim in the widened registry row,
   and is not a regression.
3. **A propagated `Result` E-side name stays silent.** ``let a: Result<integer,
   Nope> = @`q` `` draws nothing: the mandated clause-(iv)(2) withhold composes
   with row r11's untouched `Result`-peel disposition, which judges the T side
   only. Measured identical for the author-written ascription at pre-fix r11, so
   it sits outside the r1–r9 mandate. Candidate for an r11 E-side cell under a
   future bug.
4. **Bug 0249's named lock
   (`tests/reserved-keyword-inline-object-and-literal-keys.test.ts`) needed no
   edit.** Clause (i)'s authorisation for its one cell went unused.

### Self-authorizations on the record

**1. The `fn` parameter capture as a third propagating capture**, beyond clause
(iv)(2)'s enumeration of two. The question that would have been asked: does the
one-emission-per-written-annotation rule extend to the parameter capture, which
QRY-2's call-argument sink also propagates onto? Evidence: (a) clause (iv)(2)
states the rule as a property of PROPAGATED TEXT, not of an enumerated capture
list — "the query arm is the sole emitter for propagated text; no double
emission"; (b) not applying it was a measured regression — `fn h(x: Nope):
number { 1 }` with ``let r = h(@`q`)`` drew one line pre-fix and two without the
withhold; (c) the attempt note's Correction 2 words the obligation as "A landing
route owes that partition for both propagating captures, not just the `let`
one", so its enumeration was that attempt's measurement rather than an
exhaustive claim, and the ruling adopted the attempt's numbers. Bound: withhold
only where QRY-2 actually propagated; add no new emission anywhere; keep every
already-emitting position byte-stable; suite and corpus gate green. STOP valve:
any test file outside the authorised set reddening, or any already-emitting
position's bytes moving, stops the change. Review round 4 audited it and upheld
it.

**2. Scope expansion to `src/parser/query-schema-resolve.ts` and
`src/parser/query-schema-inference.ts`**, beyond §Fix's named surface.
Evidence: (a) review round 3 measured the hand-rolled propagation predicates
wrong in three distinct ways, two of them regressions against pre-fix HEAD; (b)
clause (iv)(2) is unsatisfiable without QRY-2's actual propagation set, which
only QRY-2 holds; (c) the alternative — a second traversal mirroring QRY-2's
frame set — is the construction that had already drifted. Bound: the pass
REPORTS what it already does and changes nothing it writes onto any query;
`inferQuerySchema`'s behaviour is preserved. STOP valve: any change to what the
pass writes stops the expansion. Review rounds 4 and 5 both judged the expansion
justified.
