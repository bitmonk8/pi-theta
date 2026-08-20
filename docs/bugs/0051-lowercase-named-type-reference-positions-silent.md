# Bug 0051 — A lowercase `NamedType` at a reference position draws no case diagnostic at any of the sixteen probed positions: `theta/parse/schema-case-mismatch` is a token-adjacency check on the identifier after `schema` / `enum` (`lexer.ts:873–874`) whose registered Trigger names declaration positions only, so `let a: nope = 3` is observationally identical to `let a: Nope = 3`, while `grammar.md:98` annotates the reference production `NamedType ::= Ident` "(PascalCase)"

- **Status:** open. §Fix is constraint-pinned, not settled. The decision this
  report asks for is the adjudication between two dispositions — widen the
  registered Trigger to reference positions, or record the reference position
  as unconstrained by case in the spec prose.
- **Kind:** spec/implementation disagreement, disposition open. The
  implementation is uniform and measured: no `NamedType` reference position
  distinguishes a lowercase head from a PascalCase head, at any of the sixteen
  positions probed. The registered Trigger for the case code
  (`docs/spec_topics/diagnostics/code-registry-parse.md:20`)
  and the normative case rule (`docs/spec_topics/lexical.md:15`) both name
  **declaration** positions, and the implementation matches them. One line
  reads wider: `docs/spec_topics/grammar.md:98` annotates the production used
  at every reference position, `NamedType ::= Ident`, with "(PascalCase)". Two
  readings of that parenthetical are open, and this report does not settle
  them:
  1. *Normative over references* — the parenthetical constrains the reference
     production, and the enforcement is absent at the ten positions where no
     diagnostic fires at all.
  2. *Descriptive gloss* — the parenthetical records that the names a
     `NamedType` can resolve to are PascalCase because `lexical.md:15`
     constrains their **declarations**, and nothing is owed at a reference.
- **Related:**
  [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md) —
  the filing origin. Its §Fix (0.48.0) *Residuals* item (ii) (`:217–220`) and
  its §Non-goals first bullet (`:688–697`) record this gap and leave it
  unfiled: "A lowercase `NamedType` at a *reference* position is still admitted
  without a case diagnostic (`let a: nope = 3` is silent), which is what puts
  an author-chosen lowercase name into the engine at all." 0038 closed the
  hazard that gap enabled (a prototype-member name resolving as a declared
  type) without closing the gap. Its group-(h) vectors
  (`tests/typeenv-prototype-names.test.ts:1175–1228`) are the recorded
  measurement of what a lowercase name reaching the type engine did.
  [0028](./0028-unresolved-annotation-silent-permissive-lowering.md) — widened
  `theta/parse/unresolved-named-type` to the `@<T>` annotation and the
  schema-body field positions (0.38.0); with
  [0025](./0025-ctor-unresolved-schema-name-passthrough.md) (constructor name),
  [0033](./0033-body-level-schema-alias-unsupported.md) (alias/union RHS) and
  [0035](./0035-params-rhs-inline-object-under-emission.md) (`params:` inline
  object) it built the five-position list that is the only gate a lowercase
  reference meets at HEAD.
  [0031](./0031-ctor-field-value-typing-unchecked.md) — null-prototyped the
  declared-field record one level down and recorded the `TypeEnv` as the same
  class one level up, the residual chain this report terminates.
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
  open, and filed from the same 0038 residual list (item (i)). It is why r2's
  and x7's `f(3)` call reports nothing, which keeps those two rows measuring
  the annotation position alone.
  [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) — open,
  and load-bearing on disposition 1: it reports
  `theta/parse/unresolved-named-type` firing beside another registered
  rejection at the same site, which is the shape disposition 1 would add at
  the five diagnosing positions.
- **Affected** (every citation verified at HEAD `b34aaa52`, 0.48.0):
  - **The spec line under adjudication.** `docs/spec_topics/grammar.md:98`,
    verbatim, inside the §Type grammar fence (`:88–103`):

    ```
    NamedType     ::= Ident                       // schema or enum name (PascalCase)
    ```

    `Type` reaches this production at every annotation position the page
    enumerates at `:105`: `let` annotations, `fn` parameter types, schema field
    types, `params:` field types, generic type arguments, union arms, and
    `invoke<Type>` / type-ascription contexts.
  - **The normative case rule.** `docs/spec_topics/lexical.md:15`, verbatim:

    > - **PascalCase** (uppercase first letter) is required for: `schema`
    > names, `enum` names, `enum` variant names, and any user identifier
    > introduced as a type-like binding. The built-in `Ok`, `Err`, and `Result`
    > follow the same rule.

    Three of its four items are declaration positions; the fourth is scoped by
    "introduced as", which is a declaration site. `:18` names the diagnostic —
    "Violating either rule is a parse error: `theta/parse/schema-case-mismatch`
    … or `theta/parse/binding-case-mismatch`" — and then assigns the
    first-letter rule a *disambiguation* job at pattern positions, not a
    rejection job: "a lowercase identifier introduces a fresh binding, an
    uppercase identifier refers to an existing schema, enum, or constructor in
    scope".
  - **The registered Trigger.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:20`, the
    `theta/parse/schema-case-mismatch` row. *Trigger* cell, verbatim:
    "Identifier in a schema / enum / variant / type-alias position does not
    start with an uppercase letter." Severity `E`, phase `parse`, spec rule
    [Lexical — Identifiers](../spec_topics/lexical.md), *Message* `schema name
    must start with an uppercase letter`. Every position it names is a
    declaration.
  - **The implemented gate.** `src/lexer/lexer.ts:798` —
    `contextualDiagnostics`, called from `lexTheta` at `:125`. Its dispatch
    loop tests the keyword token and checks the token at `k + 1`: `let` /
    `let mut` (`:864–870`) and `fn` (`:871–872`) as `"binding"`,
    `schema` / `enum` (`:873–874`) as `"type"`. `checkName` (`:802–839`) emits
    `theta/parse/schema-case-mismatch` at `:830–837` when a `"type"`-kind name
    does not start `A`–`Z`. Token adjacency to a declarator keyword is the
    whole predicate; the function holds no notion of a type position. Its own
    scope note (`:794–796`) records the boundary: "full identifier-position
    coverage (every reserved word in every identifier slot) is a parser-leaf
    obligation; the lexer core enforces the positions its closed Tests
    obligations name."
  - **What admits the lowercase reference into the type engine.**
    `annotationToCompatType` (`src/parser/type-layer-checks.ts:454–476`); the
    fallback at `:475` returns `{ kind: "named", name: text }` for any
    annotation text that is not a primitive, a top-level union, or `array<T>`
    — no case test and no resolvability test. Its doc comment (`:446–453`)
    states the disposition: "every other shape … resolves to a nominal `named`
    reference — the same shape the `⊑` engine treats as deferred."
  - **The only gate a reference meets, and its closed position list.**
    `unresolvedNamedTypeDiagnostic` (`src/parser/theta-document.ts:4718–4730`).
    Its doc comment (`:4663–4672`) states the boundary directly:

    > Its trigger (code-registry-parse.md) is a closed five-position list — the
    > `params:` right-hand side, the `@<T>` query annotation, a `schema` body
    > field type, the right-hand side of a `schema X = ...` alias/union
    > declaration (bug 0033 §Fix), and the object-constructor name — not every
    > `NamedType`-resolution position: a `let` annotation, an `fn` parameter
    > type, a generic argument, a union arm and `invoke<Type>` (grammar.md
    > §Type grammar) are outside it, so `let x: Nope = 1` resolves nothing and
    > fires nothing.

    The registry row it implements is
    `docs/spec_topics/diagnostics/code-registry-parse.md:89`. The check is a
    resolution check, so it is case-blind by construction: measured, it reports
    `nope` and `Nope` identically at all five positions.
  - **The record the reference feeds.** `collectTypeEnv`
    (`src/parser/type-layer-checks.ts:294–295`) is null-prototyped as of the
    0038 fix, and `resolveNamed` (`src/parser/type-compat.ts:104`) own-key-guards
    every read. The doc comment at `:282–288` states this report's subject as
    the reason for that construction: "a `NamedType` reference carries no case
    constraint — unlike a declaration position, which
    `theta/parse/schema-case-mismatch` shields — so a reference may spell an
    `Object.prototype` own property … verbatim."
  - **The gate that measures a widening's blast radius.**
    `tests/committed-fixture-parse-gate.test.ts:118–123` runs every committed
    `.theta` through `lexTheta` → `parseThetaDocument` and asserts
    `expect(diagnostics).toEqual([])`. It walks `.theta` only
    (`:55`), so the two committed `.thetalib` files
    (`docs/examples/personas.thetalib`,
    `tests/live/acceptance/fixtures/acc-lib.thetalib`) are outside it.
  - **Not affected — the declaration side.** The three declaration spellings the
    Trigger names as `schema` / `enum` / type-alias all fire (§Reproduction).
    One position it names does not: an `enum` **variant** name. `enum E { a }`
    is silent. That is a declaration-side gap between the same Trigger and the
    same code, in the opposite direction from this report's subject, and it is
    unfiled — see §Non-goals.
  - **Not affected — `theta/parse/binding-case-mismatch`**
    (`code-registry-parse.md:19`). The lowercase-first rule at `let` / `fn` /
    parameter / field-name positions is enforced at the same token-adjacency
    sites and is not in question.
- **Observed at:** `0.48.0` (HEAD `b34aaa52`). Fully offline and deterministic
  — no live model, no provider. Spec text read from the files; every
  implemented outcome established by scratch probes through the shipped front
  end (`parseThetaDocument`), written, run, and deleted.

## Summary

`theta/parse/schema-case-mismatch` fires on the identifier immediately
following `schema` or `enum` and nowhere else (`lexer.ts:873–874`). Its
registered Trigger (`code-registry-parse.md:20`) names declaration positions,
and `lexical.md:15` scopes the PascalCase requirement to names *introduced* as
type-like bindings. The implementation matches both.

`grammar.md:98` carries the case annotation on the reference production:
`NamedType ::= Ident // schema or enum name (PascalCase)`. That production is
reached at every annotation position (`grammar.md:105`), and at none of them
does the case of the head letter change any observable. Measured across
sixteen reference positions, `nope` and `Nope` produce byte-identical
diagnostic lists: silence at ten of them, and
`theta/parse/unresolved-named-type` naming the written spelling at the other
six, which cover that code's five registered positions (two of the six rows
are the alias right-hand side, in its plain and its union form). The one gate
a reference meets is a resolution check with a closed
five-position list (`theta-document.ts:4663–4672`), and a resolution check
cannot distinguish case.

The gap is what bug 0038's §Fix names as the enabling condition for its own
hazard: nothing stops an author-chosen lowercase name from becoming a
`{ kind: "named", name: text }` in the type engine (`type-layer-checks.ts:475`).
0038 removed the consequence — a prototype-member name resolving as a declared
type — by null-prototyping the `TypeEnv` and own-key-guarding its reads. It did
not remove the entry condition, and recorded it as residual (ii) and a
§Non-goal.

§Fix pins the constraints and both candidate dispositions and recommends the
second: record the reference position as unconstrained by case. The
recommendation rests on four measurements, not on a preference — §Fix states
them.

## Reproduction

Offline and deterministic at HEAD `b34aaa52`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`, driven
from a scratch `npx tsx` script written, run, and deleted. Every fixture body
sits under the frontmatter

```
---
description: d
mode: prompt
---
```

and, where a body tail is required, ends with the statement `"ok"`. The
recorded value is the complete diagnostic list; `SILENT` is the empty list.
`nope` and `Nope` are declared nowhere in their fixtures.

**Reference positions.** Every row was run twice, once with `nope` and once
with `Nope`. The two columns are identical at every position:

| # | position | fixture (lowercase form) | `nope` | `Nope` |
|---|---|---|---|---|
| r1 | `let` annotation | `let a: nope = 3` | SILENT | SILENT |
| r2 | `fn` parameter | `fn f(x: nope): number { 1 }` + `let r = f(3)` | SILENT | SILENT |
| r3 | `fn` return | `fn f(): nope { 3 }` | SILENT | SILENT |
| r4 | generic argument | `let xs: array<nope> = [1]` | SILENT | SILENT |
| r5 | `invoke<T>` | `let r = invoke<nope>("./x.theta")` | SILENT | SILENT |
| r6 | union arm in a `let` annotation | `let a: nope \| number = 3` | SILENT | SILENT |
| r7 | union arm in an `fn` parameter | `fn f(x: nope \| number): number { 1 }` | SILENT | SILENT |
| r8 | `Result` argument | `fn f(): Result<nope, string> { Ok(1) }` | SILENT | SILENT |
| r9 | inline object field under an `fn` parameter | `fn f(x: { g: nope }): number { 1 }` | SILENT | SILENT |
| r10 | inline object field under `params:` | `params:` → `x:` → `g: nope` | SILENT | SILENT |
| r11 | `@<T>` query annotation | ``let r = @<nope>`hi` `` | `unresolved-named-type`: `unresolved named type 'nope'` | same, `'Nope'` |
| r12 | `schema` body field type | `schema S { f: nope }` | same | same |
| r13 | `params:` right-hand side | `params:` → `x: nope` | same | same |
| r14 | alias right-hand side | `schema A = nope` + `let a: A = 3` | same | same |
| r15 | alias/union right-hand side | `schema A = nope \| number` + `let a: A = 3` | same | same |
| r16 | object-constructor name | `let v = nope { a: 1 }` | same | same |

Every diagnostic in the right-hand columns carries severity `error` and code
`theta/parse/unresolved-named-type`. No fixture in the table draws
`theta/parse/schema-case-mismatch`.

Three derived rows, run once each:

- `schema S { f: { g: nope } }` — `unresolved-named-type: unresolved named type
  'nope'`; the same source with `Nope` reports `'Nope'`. The schema-body field
  position descends into an inline object; the `fn`-parameter position (r9)
  and the `params:` position (r10) do not.
- `schema S { f: array<nope> }` and ``let r = @<array<nope>>`hi` `` — both
  `unresolved-named-type: unresolved named type 'nope'`. A generic argument
  is reached when the generic sits at one of the five positions, and is not
  when it sits at a `let` annotation (r4).
- ``let r: nope = @`hi` `` — `unresolved-named-type: unresolved named type
  'nope'`. A `let` annotation over a query right-hand side is propagated onto
  the query as its `@<T>` schema, so this row reaches r11's position and not
  r1's.

**Declaration positions, the contrast.** Same harness, same names:

| # | fixture | diagnostics |
|---|---|---|
| d1 | `schema nope { a: number }` | `error theta/parse/schema-case-mismatch: schema name must start with an uppercase letter` |
| d2 | `schema nope = number` | same |
| d3 | `enum nope { A }` | same |
| d4 | `enum E { a }` | SILENT |
| d5 | `enum E { a, B }` | SILENT |
| d6 | `enum E { A }` (control) | SILENT |

d4 and d5 are the variant position the Trigger names at
`code-registry-parse.md:20` and `lexical.md:15` names third. It is not
enforced. See §Non-goals.

**The declaration gate does not keep a lowercase name out of the type engine.**
`schema-case-mismatch` is severity `E`, and it is a diagnostic rather than a
parse refusal: the `SchemaDecl` reaches `doc.body.statements` and
`checkTypeLayer` runs over it ungated (`theta-document.ts:843` →
`type-layer-checks.ts:217–219`). So a lowercase declaration enters the
`TypeEnv`, and a lowercase reference to it resolves:

| # | fixture | diagnostics |
|---|---|---|
| x1 | `schema nope { a: number }` + `let c: nope = 3` | `schema-case-mismatch` **and** `theta/parse/let-rhs-type-mismatch: let binding 'c' initialiser type mismatch: expected nope, got integer` |
| x2 | `schema nope = number` + `let c: nope = "s"` | `schema-case-mismatch` **and** `let-rhs-type-mismatch: … expected nope, got string` |
| x3 | `schema nope { a: number }` + `let v = nope { a: 1 }` | `schema-case-mismatch` alone — the constructor name resolved |
| x4 | `schema nope = number` + `let xs: array<nope> = ["s"]` | `schema-case-mismatch`, `let-rhs-type-mismatch: … expected array<nope>, got array<string>`, `theta/parse/array-element-type-mismatch: array element type mismatch at index 0: expected nope, got string` |
| x5 | `let xs: array<nope> = ["s"]` (no declaration) | SILENT |
| x6 | `schema Nope = number` + `let xs: array<Nope> = ["s"]` (control) | `let-rhs-type-mismatch` and `array-element-type-mismatch`, no case code |
| x7 | `schema nope { a: number }` + `fn f(x: nope): number { 1 }` + `let r = f(3)` | `schema-case-mismatch` alone |

x4 against x5 is the sharpest pair: identical reference text, opposite
outcomes, decided entirely by whether a declaration resolves. x6 shows the
same two type-layer codes with the case code removed, so the case code
contributes nothing to the type layer's answer.

**What a lowercase name reaching the engine did before 0.48.0.** The 0038 fix
record measured these at a baseline with both halves of its fix neutralised
(byte-exact restore, blob hashes verified), using `__proto__` — a lowercase-
first declaration name admitted by the same gate — and the swallowed
declaration's own property names as the references. Quoted verbatim from
`.pi/tmp/fixes/0038-report.md` §Residuals, and locked as group (h) at
`tests/typeenv-prototype-names.test.ts:1175–1228`:

```
schema __proto__ { a: number }
let c: kind = 3
  → schema-case-mismatch  AND  let-rhs-type-mismatch: expected kind, got integer

schema __proto__ { a: number }
let c: fields = 3
  → schema-case-mismatch  AND  let-rhs-type-mismatch: expected fields, got integer

schema __proto__ { a: number }
let r = 1 + kind
  → THROW TypeError: Cannot read properties of undefined (reading 'kind')

schema Good { a: number }          (control)
let c: kind = 3
  → NO diagnostics — `kind` is unresolvable against an ordinary declaration set
```

The control is this report's r1 under a different name: a lowercase reference
against an ordinary declaration set is silent, before the 0038 fix and after
it.

**The same class at HEAD, post-fix.** The 0038 fix removed the consequence and
left the entry condition:

| fixture | at 0.48.0 | at 0.45.0 (0038 §Reproduction) |
|---|---|---|
| `let a: constructor = 3` | SILENT | `let-rhs-type-mismatch: … expected constructor, got integer` |
| `let a: toString = 3` | SILENT | same, `expected toString` |
| `let r = 1 + constructor` | `error theta/parse/unknown-identifier: unknown identifier 'constructor'` | `TypeError: Cannot read properties of undefined (reading 'kind')` |
| `let r = 1 + nope` (control) | `error theta/parse/unknown-identifier: unknown identifier 'nope'` | same |

**Blast-radius sweep — what a widened trigger would newly diagnose.** The tree
holds 33 committed `.theta` files and 2 `.thetalib` files (21 under
`docs/examples/`, 11 under `tests/live/acceptance/fixtures/`, one each under
`tests/fixtures/h7a/`, `tests/fixtures/h7b-invalid/`, and `.pi/theta/`). Two
sweeps, both run at HEAD:

- A structured sweep over every annotation-bearing site in all 35 files (`let`
  annotation, `fn` parameter, `fn` return, `@<T>`, `invoke<T>`, schema/`params:`
  field, alias RHS), splitting each annotation into atoms on `< > | ,` and
  discarding the primitive and constructor keywords: **0 lowercase-headed
  atoms**. The 10 PascalCase atoms found are `Author`, `Progress`,
  `QueryError`, `Reply`, `Report`, `Review`, `Sentiment`, `Summary`, `Triage`,
  `Verdict`.
- A higher-recall crude sweep — every `: <lowercase-identifier>` occurrence in
  all 35 files, minus the primitives and the frontmatter keys — returns 35
  lines, all of which are `//` comment prose, a `bind_model:` frontmatter
  value, or an object-literal key (`{ pattern: "TODO" }`, `{ op: "validate"
  }`). None is a type annotation.

The markdown corpus is clean by the same test:
`rg` over `docs/spec_topics`, `docs/reference`, `docs/guide.md`,
`docs/tutorial.md`, `docs/how-to`, and `docs/examples` for a `let`/`fn`
annotation or `@<T>` whose head is a non-primitive lowercase identifier returns
no lines.

## Expected behaviour

**The case rule is a declaration rule, by its own text.** `lexical.md:15`
requires PascalCase for `schema` names, `enum` names, `enum` variant names, and
"any user identifier **introduced** as a type-like binding". Introduction is a
declaration site. `:18` binds the violation to
`theta/parse/schema-case-mismatch`, and
`code-registry-parse.md:20`'s Trigger — "Identifier in a schema / enum /
variant / type-alias position" — enumerates the same four positions. The
implementation (`lexer.ts:873–874`) enforces three of them.

**One line reads wider than that.** `grammar.md:98` annotates
`NamedType ::= Ident` — the production every reference position uses
(`grammar.md:105`) — with "(PascalCase)". The corpus supplies no other text
placing a case constraint on a reference, and `lexical.md:18` assigns the
first-letter rule a *disambiguation* role at pattern positions rather than a
rejection role. The two readings of the parenthetical are stated in §Kind;
under reading 1 the implementation under-enforces at sixteen positions, under
reading 2 the implementation is conformant and the parenthetical is
under-specified about which side of the production it constrains.

**Whatever the reading, the two positions are not equivalent.** A declaration
introduces a name into the `TypeEnv` (`collectTypeEnv`,
`type-layer-checks.ts:294`); a reference resolves against it. `x4` versus `x5`
above measures the difference: the same reference text is silent when nothing
declares the name and diagnoses when a lowercase declaration exists.

**The five diagnosing positions already reject a lowercase reference.**
`theta/parse/unresolved-named-type` (`code-registry-parse.md:89`) triggers on
"A `NamedType` that resolves to no declaration usable at the position it is
written", and its five positions are closed
(`theta-document.ts:4663–4672`). Measured, it reports `nope` at all five with
severity `E`. An `E` places the file outside GOV-15's loads-cleanly input set
(`docs/spec_topics/governance/source-language-stability.md:9`) and drops it at
the shipped composition root — the outcome bug 0038's group (d) measured
through `discoverAndComposeFixtures`. A lowercase reference at those positions
is already refused; what is missing there is a *case-specific* code, not a
rejection.

**The ten silent positions are silent for both cases.** `let a: Nope = 3` and
`let a: nope = 3` are equally undeclared and equally silent. What those
positions lack is resolution, which the closed five-position Trigger states as
a deliberate boundary rather than an oversight.

## Actual behaviour / root cause

1. **The gate is keyed to a keyword token, not to a grammar position.**
   `contextualDiagnostics` (`lexer.ts:798`) walks the token stream and, for
   each keyword token it recognises, checks the identifier at `k + 1`:
   `let` / `let mut` (`:864–870`), `fn` (`:871–872`), `schema` / `enum`
   (`:873–874`). `checkName` (`:802–839`) then applies the first-letter test
   and emits `theta/parse/schema-case-mismatch` at `:830–837`. No type
   position is reachable from a declarator keyword by token adjacency, so no
   reference position can be covered from here. The function's scope note
   (`:794–796`) states the boundary as a parser-leaf obligation and points at
   `notes.md`.

2. **Nothing downstream re-applies the case test.** The annotation source text
   travels to `annotationToCompatType` (`type-layer-checks.ts:454–476`), whose
   fallback at `:475` returns `{ kind: "named", name: text }` verbatim for any
   text that is not a primitive, a top-level union, or `array<T>`. The
   `CompatType` carries the spelling and no case predicate. Downstream,
   `resolveNamed` (`type-compat.ts:104`) resolves it by own-key lookup, which
   is case-sensitive but not case-*constrained*: a lowercase key resolves if a
   lowercase declaration wrote one (x1–x4, x7) and answers `undefined`
   otherwise (r1–r10, x5).

3. **The one reference-position gate is a resolution check.**
   `unresolvedNamedTypeDiagnostic` (`theta-document.ts:4718–4730`) fires when
   a name resolves to no usable declaration. Case is not an input. Measured,
   the six diagnosing rows (r11–r16) report the written spelling unchanged for
   both `nope` and `Nope`. Its position list is closed at five
   (`:4663–4672`), so the ten remaining positions consult nothing.

4. **The declaration gate does not bound the type engine's input.**
   `schema-case-mismatch` is a contextual lexer diagnostic, not a parse
   refusal — the finding bug 0038's review round 2 established and its group
   (h) locked. `parseThetaDocument` calls `checkTypeLayer` with no gate on
   prior diagnostics (`theta-document.ts:843`), and `checkTypeLayer` builds the
   env unconditionally (`type-layer-checks.ts:217–219`). Rows x1–x4 and x7
   measure the consequence at HEAD: the case code and the type-layer codes
   arrive together, and the type-layer codes name the lowercase spelling as an
   expected type. The bound on the hazard is the `E` severity denying
   registration (`source-language-stability.md:9`), not the grammar.

5. **The residual chain that produced this filing.** 0031 null-prototyped the
   declared-field record and recorded the `TypeEnv` as the same class one level
   up. 0038 closed that class — `Object.create(null)` at
   `type-layer-checks.ts:295` plus `resolveNamed` at `type-compat.ts:104` — and
   its construction-site doc comment (`type-layer-checks.ts:282–288`) names
   this report's subject as the reason the null prototype is required: "a
   `NamedType` reference carries no case constraint — unlike a declaration
   position, which `theta/parse/schema-case-mismatch` shields". The defence is
   in place. The entry condition it defends against is what remains.

## Why it matters

- **A normative production carries an annotation nothing enforces or
  restates.** `grammar.md:98` is the only corpus text placing "(PascalCase)" on
  a reference position. A reader who takes it as normative finds sixteen
  positions admitting the opposite, and no other page to reconcile against;
  a reader who takes it as descriptive has no text saying so.
- **The two pages that do agree are not cited from the disputed line.**
  `lexical.md:15` and `code-registry-parse.md:20` both scope the rule to
  declarations, and `grammar.md:98`'s comment links to neither.
- **The gap is a recorded enabling condition for a shipped defect.** Bug 0038's
  two symptoms — a diagnostic naming a type no declaration declares, and a
  `TypeError` out of `parseThetaDocument` that took down every theta in a
  discovery root — both required an author-chosen lowercase name inside the
  type engine. 0038's fix defends the engine and leaves the entry open;
  `type-layer-checks.ts:282–288` states that dependency in the source.
- **The decision is cheap now and gets more expensive.** Both sweeps measure
  zero affected inputs in the tree and zero in the markdown corpus, so
  disposition 1 currently reddens no gate. Every `.theta` added between now
  and the decision widens that set.
- **It composes with an open report.** At the five diagnosing positions,
  disposition 1 adds a second `E` beside an already-firing
  `unresolved-named-type` — the emission shape
  [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md) is
  open about at those same positions.

## Fix

Not yet decided. The settled question is which reading of `grammar.md:98`'s
"(PascalCase)" parenthetical governs the reference production, and the two
dispositions differ in what they change: one edits the registry and the
implementation, one edits one line of prose.

**Candidate dispositions.**

1. *Widen `theta/parse/schema-case-mismatch` to reference positions.* The
   *Trigger* cell at `code-registry-parse.md:20` gains the reference
   positions, `lexical.md:15` gains the reference side of the rule (its current
   wording — "introduced as a type-like binding" — excludes it), and a
   parser-leaf check enforces it. The check cannot live where the current one
   does: `contextualDiagnostics` is keyed to declarator-keyword token adjacency
   and its scope note (`lexer.ts:794–796`) assigns wider identifier-position
   coverage to the parser leaf. The natural site is beside
   `annotationToCompatType` (`type-layer-checks.ts:454–476`) or beside the
   `unresolved-named-type` walk (`theta-document.ts:4718–4730`), and the choice
   determines which of the sixteen positions are covered — the walk reaches
   five, the annotation converter reaches the `let` and `fn`-parameter
   positions.

   *Blast radius, measured.* Zero committed `.theta` and zero committed
   `.thetalib` carries a lowercase-headed type atom at any annotation site, and
   zero markdown fence in `docs/spec_topics`, `docs/reference`, `docs/guide.md`,
   `docs/tutorial.md`, `docs/how-to` or `docs/examples` does (§Reproduction).
   So `tests/committed-fixture-parse-gate.test.ts:118–123` stays green and no
   currently-loading in-tree source starts diagnosing. The affected input set is
   entirely outside the repository: author `.theta` files that load cleanly
   today and would emit an `E` after the widening.

   *Obligations.* A *Trigger* change is a registry change under
   [DIAG-2](../spec_topics/diagnostics/diagnostic-shape.md#diag-2)
   (`diagnostic-shape.md:72`), so it lands in the same commit as the
   implementation. Because a currently-clean input would begin emitting an `E`,
   the GOV-15 diagnostic-registry carve-out
   (`source-language-stability.md:25`) is engaged and its in-scope input set is
   stated. At the five positions that already fire, the widening produces a
   second `E` on the same site, which is the shape
   [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)
   reports; whichever lands second reconciles with the first.

2. *Record the reference position as unconstrained by case.* No registry edit,
   no implementation change. `grammar.md:98`'s parenthetical is made
   unambiguous about which side of the production it describes — that a
   `NamedType` resolves to a `schema` or `enum` **declaration**, and that
   `lexical.md:15` constrains the case of that declaration's name — so the
   comment stops reading as a constraint on the reference. `lexical.md:15`,
   `lexical.md:18` and `code-registry-parse.md:20` are already consistent with
   this reading and do not move.

   *Obligations.* The edit is inside the §Type grammar fence
   (`grammar.md:88–103`), where every line is a production, so it stays a
   one-line, in-place comment rewrite. DIAG-2 is not engaged: no code,
   severity, namespace or *Trigger* changes. GOV-15 is not engaged: no `.theta`
   changes its diagnostics, return value or effects.

**Recommendation: disposition 2.** Four measurements support it, none of them
a preference:

1. *The implementation is uniformly case-blind at references, not partially.*
   All sixteen reference positions produce identical observables for `nope` and
   `Nope` (§Reproduction r1–r16). There is no site where the rule is
   half-applied, which is what an implementation gap against a normative rule
   usually looks like.
2. *The normative rule and the registered Trigger both already say
   "declaration".* `lexical.md:15` scopes its requirement with "introduced as",
   and `code-registry-parse.md:20` enumerates four declaration positions. Under
   disposition 1 both must be widened; under disposition 2 neither moves.
   `grammar.md:98` is the sole line that reads otherwise.
3. *At the five positions where a lowercase reference reaches a lowering, it is
   already refused.* `unresolved-named-type` reports `nope` at r11–r16 with
   severity `E`, which places the file outside GOV-15's loads-cleanly input set
   (`source-language-stability.md:9`) and drops it at the composition root.
   A case code there adds a second `E` to a site that already has one — the
   double-emission shape 0044 is open about — and changes no load outcome.
4. *At the ten silent positions, a case rule closes half a hole of a different
   shape.* `let a: nope = 3` and `let a: Nope = 3` are both undeclared and both
   silent. A case widening rejects the first and keeps admitting the second, so
   the class of defect — an annotation naming nothing — remains open in the
   PascalCase half. The hole at those positions is the closed five-position
   resolution Trigger (`theta-document.ts:4663–4672`), and closing it is a
   resolution question, not a case question. See §Non-goals.

**Constraints on any resolution.**

1. **The normative authority for the case rule is `lexical.md:15`, and the
   registry row that implements it is `code-registry-parse.md:20`.** Any
   resolution draws its position list from those two, and they stay in
   lock-step: a *Trigger* naming positions `lexical.md:15` does not require, or
   the reverse, is the disagreement this report opens in a new place.
2. **Byte strings that must not change.** The *Message* of
   `theta/parse/schema-case-mismatch` — `schema name must start with an
   uppercase letter` — is pinned by DIAG-4 and asserted from the live registry
   in at least two suites (`tests/typeenv-prototype-names.test.ts:185` names
   the code as `SCHEMA_CASE_CODE`, group (h) reads its message through
   `registered()`; `tests/committed-fixture-parse-gate.test.ts:133–135` asserts
   the code on the seeded-invalid fixture). Under disposition 1 the same message
   would fire at reference positions, where "schema name" describes neither the
   position nor the identifier; a message edit is itself a DIAG-4 change and is
   part of that disposition's cost.
3. **Line count in `grammar.md`.** The file is 223 lines. `grammar.md:98` is
   cited by line number from
   [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
   (`:434`, `:689`),
   [0044](./0044-unresolved-named-type-fires-for-keyword-shaped-text.md)
   (`:7`, `:394`), `tests/typeenv-prototype-names.test.ts:103`, and this
   report. Every citation naming a line above 98 drifts if the fence gains or
   loses a line, so disposition 2 is an in-place rewrite of the existing
   comment.
4. **`.thetalib` is outside the committed-fixture gate.** The walk filters on
   `.theta` (`tests/committed-fixture-parse-gate.test.ts:55`), so
   `docs/examples/personas.thetalib` and
   `tests/live/acceptance/fixtures/acc-lib.thetalib` are not covered by it.
   Both were included in this report's sweeps by hand and are clean; a
   disposition-1 resolution re-measures them rather than relying on the gate.
5. **The blast-radius measurement is re-run, not inherited.** Both sweeps in
   §Reproduction are stated at HEAD `b34aaa52` over 35 files. A resolution
   re-runs them against its own HEAD, because every `.theta` added in the
   interim can widen the affected set.
6. **No test witness exists for either disposition today, and disposition 2
   owes none.** Nothing in `tests/` or `tools/` opens `grammar.md` as a file;
   the closing gate reads `docs/spec_topics/` into `specSources`
   (`tools/closing-gate/live-corpus.js`) for the release-gate scan, and line 98
   carries no `theta/` code, no `MUST` and no REQ-ID. Disposition 1 owes a
   red-first witness per position it claims to cover, plus the negative
   controls that a PascalCase reference at the same position stays silent.

## Non-goals

- **The `enum` variant declaration position.** `code-registry-parse.md:20`'s
  Trigger names a "variant" position and `lexical.md:15` names "`enum` variant
  names", and neither fires: `enum E { a }` and `enum E { a, B }` are both
  silent (§Reproduction d4, d5). `contextualDiagnostics` checks the token after
  `schema` / `enum` (`lexer.ts:873–874`) and never descends into the variant
  list. That is a declaration-side gap between the same Trigger and the same
  code, in the opposite direction from this report's subject. It is measured
  here because it bears on the adjudication — the Trigger already over-states
  the implemented declaration surface, so widening it further compounds an
  existing divergence — and it is not filed.
- **The closed five-position list of `theta/parse/unresolved-named-type`.**
  Ten reference positions consult no resolution check at all
  (`theta-document.ts:4663–4672` states the boundary deliberately), so
  `let a: Nope = 3` and `fn f(x: Nope)` are silent for an undeclared PascalCase
  name. Widening that list is a resolution question at the same positions this
  report names, with its own registry consequences at
  `code-registry-parse.md:89`, and it is neither filed nor specified here.
- **`theta/parse/binding-case-mismatch`.** The lowercase-first rule
  (`lexical.md:16`, `code-registry-parse.md:19`) is enforced at the same
  token-adjacency sites and is not in question. Nothing in either disposition
  touches it.
- **Re-opening bug 0038's fix.** The null-prototyped `TypeEnv`
  (`type-layer-checks.ts:295`) and the own-key-guarded `resolveNamed`
  (`type-compat.ts:104`) hold under either disposition. They are the defence
  against a lowercase name that reaches the engine; this report is about
  whether it should reach it. Disposition 1 would not permit removing either —
  x1–x4 measure that a lowercase *declaration* still enters the env after a
  case diagnostic fires.
- **`theta/parse/fn-arg-type-mismatch` being unreachable.** `checkFnArgCompat`
  (`src/parser/type-compat.ts:452`) has no caller in `src/`, which is why r2's
  and x7's `f(3)` call reports nothing. Filed as
  [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) from
  the same 0038 residual list; it is orthogonal to case. 0038 cites the emitter
  at `type-compat.ts:436`, its own baseline line; the 0038 fix moved it to
  `:452`, which is where 0050 and this report cite it.
- **`enum` declarations being absent from the `TypeEnv`.** `collectTypeEnv`
  matches `stmt.kind === "schema"` only, so an `enum`-named annotation is
  unresolvable at every position. 0031's recorded non-goal, restated in 0038's
  §Fix residual (iii), unchanged here.

## Provenance

- **Origin:** the bug 0038 fix (0.48.0, HEAD `b34aaa52`) — its §Fix (0.48.0)
  *Residuals* item (ii)
  ([0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)`:217–220`):
  "A lowercase `NamedType` at a *reference* position is still admitted without
  a case diagnostic (`let a: nope = 3` is silent), which is what puts an
  author-chosen lowercase name into the engine at all. §Non-goals; unchanged."
  The §Non-goals bullet it points at (`:688–697`) states the same gap with its
  three citations and declines to file it: "a separate widening at a separate
  position with its own registry question. Not filed". The same residual is
  recorded in `.pi/tmp/fixes/0038-report.md` §Residuals item (ii). This report
  is that filing, and adds the measurement 0038 did not take: the observable at
  every reference position, for both cases.
- **Spec:** `docs/spec_topics/grammar.md:98` (the disputed parenthetical), `:88–103`
  (the §Type grammar fence), `:105` (the position enumeration for a bare
  `Type`), `:107` (the closed `GenericType` constructor set);
  `docs/spec_topics/lexical.md:13` (the identifier grammar and the enforced
  first-letter rule), `:15` (the PascalCase rule), `:16` (the lowercase-first
  rule), `:18` (the two diagnostics and the pattern-position disambiguation
  role), `:20` (reserved keywords, and why `array` / `Result` do not match
  `NamedType ::= Ident`);
  `docs/spec_topics/diagnostics/code-registry-parse.md:19`
  (`binding-case-mismatch`), `:20` (`schema-case-mismatch`, the Trigger under
  adjudication), `:89` (`unresolved-named-type`, the five-position Trigger);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72` (DIAG-2);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (loads-cleanly predicate), `:25` (diagnostic-registry carve-out);
  `docs/spec_topics/frontmatter/frontmatter-fields-a.md:58` (the `params:` RHS
  as a type expression resolving against body declarations).
- **Implementation:** `src/lexer/lexer.ts:125` (the
  `contextualDiagnostics` call), `:794–796` (the scope note), `:798`
  (`contextualDiagnostics`), `:802–839` (`checkName`), `:830–837` (the
  `schema-case-mismatch` emission), `:864–875` (the declarator dispatch);
  `src/parser/type-layer-checks.ts:217–219` (`checkTypeLayer` builds the env
  ungated), `:282–288` (the null-prototype doc comment naming this gap),
  `:294–295` (`collectTypeEnv`), `:446–453` and `:454–476`
  (`annotationToCompatType` and its doc comment), `:475` (the `named`
  fallback); `src/parser/type-compat.ts:104` (`resolveNamed`);
  `src/parser/theta-document.ts:843` (`checkTypeLayer` called with no gate),
  `:4663–4672` (the closed five-position doc comment), `:4718–4730`
  (`unresolvedNamedTypeDiagnostic`).
- **Tests and tooling read, none changed:**
  `tests/committed-fixture-parse-gate.test.ts:55` (the `.theta`-only walk),
  `:118–123` (the zero-diagnostic assertion), `:133–135` (the seeded-invalid
  fixture asserting `schema-case-mismatch`);
  `tests/typeenv-prototype-names.test.ts:103` (the `grammar.md:98` citation),
  `:185` (`SCHEMA_CASE_CODE`), `:1126–1164` (group (h)'s header, which records
  that `schema-case-mismatch` is a contextual lexer diagnostic rather than a
  parse refusal and that the bound is the `E` severity denying registration),
  `:1175–1228` (rows r3/r4/r5 and control r6);
  `tests/helpers/e2e-s1.ts:39` (`parseDoc`).
- **Evidence:** five scratch `npx tsx` scripts over `parseDoc`, written, run,
  and deleted — the sixteen reference-position rows in both cases, the three
  derived rows, the six declaration rows, the seven lowercase-declaration
  round-trip rows, the four prototype-name rows, and the two corpus sweeps over
  all 35 committed `.theta` / `.thetalib` files. All outputs quoted verbatim in
  §Reproduction. Offline, no model, no live provider, no file in the tree
  modified other than this report. The 0.45.0 column of the prototype-name
  table and the group-(h) block are quoted from
  [0038](./0038-typeenv-prototype-member-names-resolve-as-declared-types.md)
  §Reproduction and `.pi/tmp/fixes/0038-report.md` §Residuals respectively, not
  re-measured — the pre-fix baseline is not reachable from HEAD without
  neutralising a shipped fix.
- **Verification at HEAD `b34aaa52` (0.48.0):** every `path:line` above read
  from the tree. `grammar.md` is 223 lines and `lexical.md` is 28; the inbound
  `grammar.md:98` citation sweep over `src/`, `tests/`, `tools/` and `docs/`
  returns the five sites listed in §Fix constraint 3.

### Discharge note — bug 0124's fix (0.121.0)

Appended by bug [0124](./0124-parsetype-trailing-punctuation-leniency.md)'s fix.
**This report is NOT closed and its subject is untouched** — `let a: nope = 3`
still draws nothing, measured at 0.121.0, and the case question over a
well-formed lowercase `NamedType` reference is exactly as this report leaves it.
Two of the shared facts it rests on have moved, and one has not.

1. **§Affected's `annotationToCompatType` sentence stays TRUE, and is no longer
   the whole story at three positions.** The fallback still "returns
   `{ kind: "named", name: text }` for any annotation text that is not a
   primitive, a top-level union, or `array<T>` — no case test and no
   resolvability test", and that function is byte-unchanged by bug 0124: it adds
   neither test, which is why this report's disposition question survives intact.
   What changed is upstream of it. A `let` annotation, an `fn` parameter type and
   an `fn` return type now pass a DERIVABILITY test before the converter sees
   them, so text deriving from no `Type` production no longer reaches the
   fallback at those three positions — it draws
   `theta/parse/annotation-type-not-expression` and the theta does not register.
   The fallback's remaining traffic there is exactly what this report is about: a
   well-formed `NamedType`, of either case, whose resolution is deferred.
2. **`Cat--` is no longer silent.** Bug 0124's §Related recorded
   `let a: Cat-- = 3` as "measured silent here and stays silent under either of
   0051's dispositions"; `Cat--` is not an `Ident`, so it falls in 0124's refused
   class and now draws that refusal, whether or not `Cat` is declared. This does
   not touch either of this report's two dispositions: both are about text that
   IS an `Ident`, and the refusal is a derivability judgement, not a case one.
3. **The reason this report gives for why these positions have "no name walk to
   lose" is unchanged.** `unresolvedNamedTypeDiagnostic`'s closed five-position
   list still excludes a `let` annotation and an `fn` parameter type, and bug
   0124 deliberately did not widen it — its §Fix records the prose spelling
   `thisisnotatype` and the trailer `integer1` as NOT refused precisely because
   each is an `Ident`, so refusing them would need a resolvability test at these
   positions, which is this report's and that row's territory rather than 0124's.
