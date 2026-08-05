# Bug 0139 — `docs/spec_topics/lexical.md:16` requires a lowercase-first `fn` parameter name and `code-registry-parse.md:19` registers `theta/parse/binding-case-mismatch` for the "parameter position", but the only enforcer is the lexer's `contextualDiagnostics` (`lexer.ts:810–851`), whose dispatch (`:876–886`) reaches three positions — the `let` / `let mut` name, the `fn` NAME and the `schema` / `enum` NAME — and never the parameter list, so `fn h(P: string): number { 1 }` loads with zero diagnostics and registers, while `let P = 1` on the same HEAD draws the code

- **Status:** open. §Fix names one enforcement site and one settled emission;
  three sub-questions stay for the run (which of the sentence's four positions
  the fix closes, the GOV-15 discharge, and whether the check lands in the
  parser or the lexer). No ordering dependency: nothing blocks this and it
  blocks nothing.
- **Sev/Diff estimate:** S1/D2 — a declared constraint is unenforced on the
  ordinary load path, so a spelling the spec refuses is accepted with no
  diagnostic and the theta registers (S1's "inputs accepted that the spec
  refuses … with no diagnostic, declared constraints not enforced"). The
  practical harm is narrower than that letter suggests and is stated as such
  in §Why it matters: no value is corrupted, the parameter binds and the body
  reads it, and the committed corpus contains zero uppercase parameters
  (measured, §Reproduction (f)) — the cost is a refused spelling running, and a
  case invariant that two adjacent designs read as available. D2 because the
  emission itself is one predicate over one token, the registry needs no edit
  (the *Trigger* at `code-registry-parse.md:19` already names the parameter
  position), and the work that remains is a GOV-15 discharge plus a decision on
  the three sibling positions in the same spec sentence.
- **Kind:** defect — implementation, against a written sentence and its
  registered *Trigger*. Two elements.
  1. **The rule is written and the position is named twice.**
     `docs/spec_topics/lexical.md:16` requires lowercase-first for "`let` and
     `let mut` bindings, **function parameters**, function names, and schema
     field names", and `:18` states the consequence without qualification:
     "Violating either rule is a parse error: `theta/parse/schema-case-mismatch`
     … or `theta/parse/binding-case-mismatch`". The registry row's *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:19`) names the same
     position: "Identifier in a binding / **parameter** / fn-name / field-name
     position does not start with a lowercase letter or `_`." Measured,
     `fn h(P: string): number { 1 }` reports `[]`.
  2. **The enforcer covers three positions of the four.**
     `contextualDiagnostics` (`src/lexer/lexer.ts:810–851`) tests a first
     letter in `checkName` (`:832–851`) and its dispatch loop calls that helper
     at exactly three token adjacencies (`:876–886`): the identifier after
     `let` (skipping `mut`), after `fn`, and after `schema` / `enum`. A `fn`
     parameter list is not a token adjacency to a keyword, so no call reaches
     it. `parseFn` (`src/parser/theta-document.ts:2151`) consumes each
     parameter name at `:2184` and pushes it at `:2190` with no case test. The
     function's own doc comment records the shortfall as known:
     "full identifier-position coverage … is a parser-leaf obligation; the
     lexer core enforces the positions its closed Tests obligations name"
     (`:806–808`).
- **Related:**
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, the origin. This gap was found while probing its
    round-3 finding and is its fix report's residual 5
    (`.pi/tmp/fixes/0050-report.md:410–414`): "An uppercase `fn` parameter
    draws no `theta/parse/binding-case-mismatch` … the lexer enforces the rule
    only at `let` and `fn`-name positions (`contextualDiagnostics`), so
    `fn h(P): number { … }` loads clean." Its round-7 remedy leaned on the same
    admission when it rejected a casing convention as the sentinel-naming
    discipline: "a parameter's case is unenforced at this HEAD"
    (`.pi/tmp/fixes/0050-remedy-fixer-r3.md:140`), a sentence its shipped
    witness carries in three comment blocks
    (`tests/fn-arg-type-mismatch-wired.test.ts:828`, `:1639`, `:2334`).
    **0050 does not own this defect and its fix does not close it.** 0050's
    subject is `checkFnArgCompat`'s missing caller; the route by which an
    uppercase parameter colliding with a declared schema produced a false `E`
    is closed by that fix's withheld-binder recording
    (`WITHHELD_BINDER_TYPE_NAME`, `src/parser/type-layer-checks.ts:387`), and
    §Reproduction (b) measures the closure — the uppercase and lowercase
    spellings of the same body are now diagnostic-identical. The case rule
    itself is untouched.
  - [0051](./0051-lowercase-named-type-reference-positions-silent.md) —
    **open**, the same family at a different position and the report whose
    adjudication this one should agree with. There a *lowercase* `NamedType` at
    a **reference** position draws nothing, and the open question is whether
    `schema-case-mismatch`'s *Trigger* — which names declaration positions only
    — should widen. **The two are disjoint and neither fix reaches the other.**
    0051's position is a type reference, is governed by `lexical.md:15`, and its
    *Trigger* does **not** name the position, so its deliverable is the
    adjudication; this report's position is a binder declaration, is governed by
    `lexical.md:16`, and its *Trigger* **does** name the position, so no
    registry edit is in question and the implementation is what moves. Both
    land in the same first-letter helper (`lexer.ts:832–851`), so whichever
    fix lands second rebases against the first. Citation drift to be aware of
    when reading it: 0051's header cites the `schema`/`enum` adjacency as
    `lexer.ts:873–874`; at HEAD `:873–874` is the template-body / keyword guard
    and the adjacency is `:885–886` (bug 0134's class, not corrected here).
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    citation-drift class the previous bullet's observation belongs to. Named
    because a fix here edits `lexer.ts` between `:810` and `:886` and will
    shift every citation below it, including 0135's `lexer.ts:842–849` and
    0051's.
  - [0135](./0135-index-sentinel-leaks-into-messages-and-typeenv.md) — **open**.
    It cites `lexical.md:16` for the opposite direction — the rule "is what puts
    `index` inside the author's namespace at three positions" — and measures
    `fn index(): integer { 1 }` and `schema P { index: array<string> }` as
    clean. Both readings are consistent: the rule admits lowercase there, and
    the collision it enables is 0135's subject. Enforcing the rule at the
    parameter position neither widens nor narrows that namespace.
  - [0136](./0136-member-access-types-as-field-name-not-field-type.md) —
    **open**. Its §Reproduction (d) relies on the field-name half of
    `lexical.md:16` being enforced ("a *field* collision needs an ill-cased
    declaration and never registers", rows d1/d3). That claim rests on
    `schema xs = …` drawing `schema-case-mismatch` at the **schema-name**
    position, which is enforced — not on the field name itself, which
    §Reproduction (e) below measures as unenforced. The two do not conflict;
    the field position is named here as a sibling and claimed by neither report
    (§Non-goals).
  - [0046](./0046-by-clause-undecided-inputs-load-silently.md) — **open**, and
    the prior record of the *field-name* sibling. Its §Non-goals bullet
    "Field-name casing enforcement" (`:533–541`) states it in terms:
    "`theta/parse/binding-case-mismatch`'s row (`code-registry-parse.md:19`)
    names the 'field-name position' … but `schema Cat { Kind: \"cat\" }` loads
    clean at HEAD (the same code does fire for `let A = 1` and `fn F()`). That
    gap is pre-existing, unfiled, and orthogonal." Its reproduction ran
    `fn f(P: string)` in the same probe (`:748`) but its prose claims only the
    field position. **This report claims the parameter position and does not
    file 0046's field bullet**; a fix closing both is admissible and is §Fix
    (b)'s question.
- **Affected** (every citation verified at HEAD `3efdb4ac`, 0.77.0):
  - **The spec rule** — `docs/spec_topics/lexical.md:16`, the lowercase-first
    bullet, whose scope list has four entries: `let` / `let mut` bindings,
    function parameters, function names, schema field names. `:13` — the
    identifier grammar `[A-Za-z_][A-Za-z0-9_]*` and the sentence that makes the
    rule enforced rather than stylistic: "The **first letter's case is
    enforced** by the parser — it is what makes case-based pattern
    disambiguation in `match` work without additional grammar." `:15` — the
    PascalCase bullet (0051's rule, not this one). `:18` — the parse-error
    sentence naming both codes and the `match` disambiguation that reads the
    same first letter.
  - **The registered row** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:19`.
    `theta/parse/binding-case-mismatch`, severity `E`, namespace `parse`.
    *Trigger*: "Identifier in a binding / parameter / fn-name / field-name
    position does not start with a lowercase letter or `_`." *Message*:
    `binding name must start with a lowercase letter or _`. Mirror without a
    *Trigger* column: `docs/reference/diagnostics.md:65`.
  - **The sole enforcer** — `src/lexer/lexer.ts:810–851`
    (`contextualDiagnostics`), called once at `:125`. `checkName` (`:814–851`)
    reads a token by index, refuses a keyword
    (`theta/parse/reserved-keyword-as-identifier`, `:819–828`), returns for a
    non-`ident` (`:829–831`), then tests `first >= "A" && first <= "Z"`
    (`:832–833`) and emits `binding-case-mismatch` at `:834–841` or
    `schema-case-mismatch` at `:842–850`. The **dispatch** is `:876–886`:
    `let` (with the `mut` skip) at `:876–882`, `fn` NAME at `:883–884`,
    `schema` / `enum` NAME at `:885–886`. Three positions; the parameter list
    is not among them and no fourth call exists —
    `rg -n 'checkName\(' src/lexer/lexer.ts` returns four hits, one the
    definition at `:814` and three the dispatch calls.
  - **The scope note that predicts this** — `src/lexer/lexer.ts:806–808`. The
    module header (`:83`) states the lexer "enforc[es] the identifier
    first-letter case rule (`theta/parse/schema-case-mismatch`,
    `theta/parse/binding-case-mismatch`)" without naming which positions.
  - **The parse site that could carry the check** —
    `src/parser/theta-document.ts:2151` (`parseFn`), parameter loop
    `:2171–2194`. `:2184` is `const pName = this.advance().text;` — the token
    is consumed and only its text kept, so the name's `range` is discarded at
    the one point a diagnostic would need it. `:2185–2189` reads the optional
    `: Type`; `:2190` pushes `{ name, type }`. `FnParam`
    (`src/parser/theta-document.ts:409–412`) carries `name` and `type` and no
    range, a fact two other consumers already work around
    (`:5134–5137`, `:5410–5413`: "A `FnParam` carries no range of its own; the
    declaration's start line locates the parameter list").
  - **The per-parameter diagnostic precedent, in the same loop** —
    `src/parser/theta-document.ts:2172–2183`, the `mut`-on-parameter check.
    It captures the token (`const mutTok = this.advance()`, `:2175`), calls
    `checkMutModifier` with `{ position: "fn-param" }` and `mutTok.range`
    (`:2176–2179`), and pushes the returned diagnostic (`:2180–2182`). Measured
    live in §Reproduction (a12).
  - **The grammar the parameter position is otherwise held to** —
    `docs/reference/grammar.md:254` and `docs/spec_topics/grammar.md:143`:
    `FnParam ::= Ident ":" Type`. The annotation is not optional in the
    grammar, yet `theta-document.ts:2185–2189` admits its absence — which is
    why §Reproduction pins the report on `fn h(P: string)` rather than on
    `fn h(P)` (that spelling is separately non-conformant and is not this
    report's subject, §Non-goals).
  - **The registration consequence** —
    `src/extension/production-composition.ts:2045` (`hasLoadParseError`) drops
    a theta carrying any `error`-severity `theta/load/*` or `theta/parse/*`
    diagnostic. Every row of §Reproduction (a) carries none, so each registers.
    Adding the emission makes them not register: the code is `E`.
  - **The runtime the uppercase parameter reaches** —
    `src/runtime/statement-executor.ts:416`,
    `scope.defineLocal(fn.params[i].name, arg.value, false)`. Binding is
    positional and name-blind, so an uppercase parameter binds and the body
    reads it normally. Nothing is mistyped; the spelling is the whole defect.
  - **The type layer's record of the same gap** —
    `src/parser/type-layer-checks.ts:381–386`, the doc comment on
    `WITHHELD_BINDER_TYPE_NAME` (`:387`): "A casing rule would not do this job:
    lexical.md §\"Identifiers\" scopes lowercase-first to `let` / `let mut`
    bindings, function parameters, function names and schema field names, which
    leaves a `for` / `par for` variable and a `match` pattern binder outside it
    — and an uppercase binder colliding with a declared schema is exactly how
    the binder's own spelling was judged nominally." Bug 0050's design took the
    parameter's unenforced case as given. `walkFn` (`:1216–1229`) seeds an
    annotated parameter's judged type at `:1219–1220` and records an unannotated
    one withheld at `:1227`.
  - **Existing coverage of the enforced positions, and of this gap: asymmetric.**
    `tests/lexer-core.test.ts:186–195` asserts `let Foo = 1` fires
    `binding-case-mismatch` with the registry message; `:174–179` is the
    `schema`-name twin. `tests/diagnostics-primitive.test.ts:149`, `:216` and
    `tests/code-registry.test.ts:135`, `:140`, `:156`, `:174`, `:180` use the
    code as a registry fixture, not as a position witness. **Four committed
    fixtures do declare an uppercase `fn` parameter** —
    `tests/fn-arg-type-mismatch-wired.test.ts:736` (`fn h(P): number`), `:836`,
    `:839`, `:842` (`fn h(P: string)` / `fn h(P: array<integer>)`) — and **none
    asserts anything about the case rule**: each pins a fn-arg verdict, and the
    surrounding comments (`:824–829`, `:1638–1643`, `:2331–2334`) record the
    silence as a known gap belonging to "its own adjudication". No test asserts
    this position's behaviour in either direction, so the fix's own witness is
    the first.
  - `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15's
    three observables; `:9` — the loads-cleanly predicate ("emits no diagnostic
    of effective severity `error`"), which every §Reproduction (a) row
    satisfies today; `:25` — the diagnostic-registry carve-out, and the
    sentence that dispositions this fix: "a DIAG-2 *trigger* change is
    dispositioned by the same principle, in-scope as an addition for inputs
    newly brought into the code's emission set".
  - `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the
    registry is closed; adding, removing, or changing a code's trigger is a
    spec change). `:74` — DIAG-4 (the *Message* column is normative). Neither
    is edited by the fix this report describes: the code exists, its *Trigger*
    already names the position, and the *Message* is already rendered
    byte-exact at the three enforced positions.
- **Observed at:** `0.77.0` (HEAD `3efdb4ac`). Offline, deterministic; no live
  model, no provider. All rows through `parseDoc`
  (`tests/helpers/e2e-s1.ts:39`) driving the shipped `parseThetaDocument`,
  frontmatter `---\nmode: prompt\n---`, a trailing `1` supplying the final
  value; the `.thetalib` row passes `path = "lib.thetalib"` with no
  frontmatter. One scratch vitest file, run on the outputs quoted below, then
  deleted. `src/`, `tests/`, `docs/bugs/README.md` and every other bug document
  are unmodified by this filing.

## Summary

`lexical.md:16` puts function parameters in the lowercase-first list, `:18`
makes a violation a parse error, and
`code-registry-parse.md:19`'s *Trigger* names the parameter position
explicitly. Nothing enforces it.

The rule's only implementation is `contextualDiagnostics`
(`src/lexer/lexer.ts:810–851`), which works by token adjacency: for each
keyword token it inspects the identifier that follows. Its dispatch
(`:876–886`) covers `let` / `let mut`, `fn` NAME, and `schema` / `enum` NAME —
three of the six positions the two case bullets name between them. A parameter
name follows `(` or `,`, not a keyword, so no call reaches it, and `parseFn`
(`src/parser/theta-document.ts:2171–2194`) takes the name at `:2184` and pushes
it at `:2190` without testing a character.

Measured: `fn h(P: string): number { 1 }` reports `[]`. So do the unannotated
`fn h(P)`, the `subagent fn` form, the `.thetalib` route, the multi-parameter
form with only the second uppercase, and the trailing-comma form. The controls
on the same HEAD all fire: `let P = 1`, `let mut P = 1` and `fn H(): number { 1 }`
each draw `theta/parse/binding-case-mismatch`
(`binding name must start with a lowercase letter or _`), and `schema p = string`
draws the `schema-case-mismatch` twin. The difference between a firing position
and a silent one is which keyword precedes the identifier, not which rule
governs it.

Nothing downstream compensates and nothing downstream is corrupted. The runtime
binds parameters positionally (`statement-executor.ts:416`), so `P` binds and
the body reads it. Bug 0050's withheld-binder recording closed the one route by
which an uppercase parameter's spelling produced a wrong verdict: measured, an
uppercase parameter colliding with a declared `schema P` and its lowercase twin
now emit identical diagnostics in every probed sink. The theta registers —
`hasLoadParseError` (`production-composition.ts:2045`) has nothing to act on —
and runs.

The parameter position is not the only silent entry in `lexical.md:16`'s list.
A **schema field name** (`schema S { Xs: string }`) and a `params:` frontmatter
field name are equally unenforced, measured below. The two positions the list
does **not** contain — a `for` / `par for` variable and a `match` pattern binder
— are correctly silent, and `type-layer-checks.ts:381–386` already relies on
their being outside the rule.

## Reproduction

Offline, deterministic, at `3efdb4ac`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---` except where noted. Each cell is the whole
diagnostic list in emission order, unfiltered.

### (a) The defect, and the controls that show the rule is live elsewhere

| # | source | diagnostics |
|---|---|---|
| a1 | `fn h(P: string): number { 1 }` | `[]` |
| a2 | `fn h(P): number { 1 }` | `[]` |
| a3 | `fn h(P: string): number { 1 }` + `let z = h("a")` + `z` | `[]` |
| a4 | `fn h(P: string): string { P }` | `[]` |
| a5 | `fn h(Ab_c: string): number { 1 }` | `[]` |
| a6 | `fn h(a: string, B: string): number { 1 }` | `[]` |
| a7 | `fn h(P: string,): number { 1 }` | `[]` |
| a8 | ``subagent fn s(P: string) { @`hi` }`` | `[]` |
| a9 | **control** `let P = 1` | `theta/parse/binding-case-mismatch`: `binding name must start with a lowercase letter or _` |
| a10 | **control** `let mut P = 1` | same code, same message |
| a11 | **control** `fn H(): number { 1 }` | same code, same message |
| a12 | **control** `fn h(mut P: string): number { 1 }` | `theta/parse/mut-on-immutable-context`: `'mut' is not permitted in this binding position` — and no case diagnostic |
| a13 | **control** `schema p = string` | `theta/parse/schema-case-mismatch`: `schema name must start with an uppercase letter` |
| a14 | **control** `fn h(p: string): number { 1 }` | `[]` |
| a15 | **control** `fn h(_p: string): number { 1 }` | `[]` |
| a16 | **control** `fn h(_: string): number { 1 }` | `[]` |

a1 is the report's witness: grammar-conformant (`FnParam ::= Ident ":" Type`),
one rule violated, nothing reported. a2 is the spelling bug 0050's residual 5
named; it is separately non-conformant against the grammar's mandatory
annotation and is therefore **not** the pin (§Non-goals). a3 shows a call site
adds nothing. a6 shows the silence is per-parameter, not an artifact of the
first position. a8 and a7 show the `subagent` modifier and a trailing comma
change nothing. a12 is the sharpest control: the same loop iteration that
silently accepts `P` emits a different registered code about the same
parameter, so the position is reachable, ranged, and already diagnostic-bearing.
a14–a16 confirm the conformant spellings — including the leading `_` that
`lexical.md:16` admits and the `_` discard — stay clean, which is what a fix
must preserve.

### (b) Bug 0050's collision route is closed; the case rule is not

Each uppercase row against its lowercase twin on an otherwise identical body,
with a declared `schema P` present to offer the collision.

| # | source | diagnostics |
|---|---|---|
| b1 | `schema P = array<integer>` + `fn h(P: string): string { P.join(",") }` | `theta/parse/unknown-method`: `unknown method 'join' on type string` |
| b2 | **control** the same with `p` | identical: `theta/parse/unknown-method`: `unknown method 'join' on type string` |
| b3 | `schema P = array<string>` + `fn h(P: integer): integer { for y in P { y } 1 }` | `theta/parse/non-array-iterand`: `'for' expects array<T> after 'in'; got integer` |
| b4 | **control** the same with `p` | identical |
| b5 | `schema P = array<integer>` + `fn h(P): string { P.join(",") }` | `[]` |
| b6 | **control** the same with `p` | `[]` |
| b7 | `schema P = array<integer>` + `fn h(P: Nope): string { P.join(",") }` | `[]` |
| b8 | `schema P { a: string }` + `fn h(P: P): string { P.a }` | `[]` |
| b9 | **control** the same with `p` | `[]` |

b1/b2 and b3/b4 are byte-identical pairs: the annotated parameter's declared
type decides, and the parameter's own spelling is never read nominally. b5/b6
are the unannotated pair, both withheld by 0050's fix
(`type-layer-checks.ts:1227`) and both silent. **This report claims no wrong
verdict.** The rows are here to bound it: what remains after 0050 is the
unenforced spelling alone, and b8 shows the extreme case — a parameter named
exactly like the schema that types it — still reports nothing at all.

### (c) The two positions the spec list does not contain — correctly silent

| # | source | diagnostics |
|---|---|---|
| c1 | `let xs: array<string> = ["a"]` + `for Y in xs { Y }` | `[]` |
| c2 | `let v: integer = 3` + `let r = match v { Q => 1 }` + `r` | `[]` |

`lexical.md:16`'s list is `let` / `let mut` bindings, function parameters,
function names, schema field names. A `for` / `par for` variable and a `match`
pattern binder are absent from it, so c1 and c2 are conformant and this report
does not touch them. `type-layer-checks.ts:381–386` states the same reading and
bug 0050's design depends on it. **Do not read c1/c2 as further instances of
this defect.**

### (d) The reserved-keyword rule is absent at the same position

| # | source | diagnostics |
|---|---|---|
| d1 | `fn h(let: string): number { 1 }` | `[]` |

`lexical.md:20` reserves `let` and makes its use in identifier position
`theta/parse/reserved-keyword-as-identifier`. `checkName` implements that check
(`lexer.ts:819–828`) and reaches it through the same three adjacencies, so the
parameter position misses it for the same reason. Recorded as a measurement of
the position's coverage, not claimed here (§Non-goals).

### (e) The two sibling positions inside the same spec sentence

| # | source | diagnostics |
|---|---|---|
| e1 | `schema S { Xs: string }` | `[]` |
| e2 | **control** `schema S { xs: string }` | `[]` |
| e3 | `schema S { Xs: array<string> }` + `fn h(s: S): integer { 1 }` | `[]` |
| e4 | `schema S { Xs: string }` + `fn h(P: S): string { P.Xs }` | `[]` |
| e5 | frontmatter `params:` field `Topic: string` | `[]` |
| e6 | **control** frontmatter `params:` field `topic: string` | `[]` |

Schema field names are the fourth entry in `lexical.md:16`'s list and
`params:` fields are what the registry *Trigger*'s "field-name position" most
plausibly ranges over. Both are unenforced by the same mechanism. Measured so a
fix states them in or out (§Fix (b)); not claimed by this report (§Non-goals).

### (f) The committed corpus — the GOV-15 baseline

All 34 tracked `.theta` and `.thetalib` files scanned for a `fn` parameter whose
name begins `[A-Z]`:

```
@@ corpus files=34 uppercase-param hits=[]
```

Zero. The four `fn` declarations with parameters in the corpus —
`docs/examples/ralph-inline.theta:21`, `docs/examples/personas.thetalib:7`,
`docs/examples/refine-inline.theta:16`, and the parameterless
`tests/live/acceptance/fixtures/acc-lib.thetalib:3` — all spell their
parameters lowercase-first. **Measured GOV-15 blast radius against the
committed corpus: zero.** That bounds the corpus half of the sweep; it does not
discharge GOV-15, because §Reproduction (a)'s programs load cleanly today and
would refuse after a fix (§Fix (c)).

### (g) The `.thetalib` route

`parseDoc("fn t(P: string): string { P }\n", "lib.thetalib")` reports `[]`.
`lexical.md:3` applies every rule on that page to `.theta` and `.thetalib`
alike, and `contextualDiagnostics` is reached through the same `lexTheta` call
(`lexer.ts:125`) for both, so the silence is one gap and not two.

## Expected behaviour

**The sentence is written, unqualified, and names the position.**
`docs/spec_topics/lexical.md:16`:

> **lowercase-first** (a lowercase letter, or `_`) is required for: `let` and
> `let mut` bindings, function parameters, function names, and schema field
> names.

and `:18`:

> Violating either rule is a parse error: `theta/parse/schema-case-mismatch`
> ("schema name must start with an uppercase letter") or
> `theta/parse/binding-case-mismatch` ("binding name must start with a
> lowercase letter or `_`").

`fn h(P: string)` violates the first bullet at the second of its four listed
positions. `:18` says the disposition is a parse error and names the code. The
measured disposition is `[]`.

**The registry agrees, so no adjudication is owed.** This is what separates the
report from [0051](./0051-lowercase-named-type-reference-positions-silent.md).
`code-registry-parse.md:19`'s *Trigger* reads "Identifier in a binding /
**parameter** / fn-name / field-name position does not start with a lowercase
letter or `_`". Four positions, and the word "parameter" is one of them. Under
DIAG-2 (`diagnostic-shape.md:72`) the registry is closed and a *Trigger* is a
spec-level statement of which inputs a code fires on; the implementation fires
on a strict subset of the registered set. That is the implementation moving to
match a normative rule, not a rule being widened — the same posture bug 0084
took when it wired a registered row's caller.

**`lexical.md:13` makes the rule enforced by design, not by convention.** "The
**first letter's case is enforced** by the parser — it is what makes case-based
pattern disambiguation in `match` work without additional grammar." The
enforcement is not decoration on a naming preference; it is the premise a
second language feature is built on. A position where the premise does not hold
is a position where the corpus's own justification for the rule does not apply.

**The four listed positions are one rule, not four.** `lexical.md:16` states a
single requirement over a list. Enforcing it at two of the four entries and not
at the other two makes the rendered behaviour depend on which keyword precedes
an identifier — an implementation fact with no counterpart in the spec.

**What a conformant implementation reports for `fn h(P: string): number { 1 }`:**
exactly one `theta/parse/binding-case-mismatch`, severity `E`, message
`binding name must start with a lowercase letter or _` byte-exact per DIAG-4,
its range covering the parameter name `P`, and no other diagnostic. The theta
does not register (`hasLoadParseError`, `production-composition.ts:2045`).

**What stays silent:** every row of §Reproduction (a14)–(a16) — `p`, `_p`, `_`;
every row of (c) — a `for` / `par for` variable and a `match` binder, which the
rule's list does not contain; and (b)'s verdicts, which must not change, since
this fix adds a lexical diagnostic and touches no type judgement.

## Actual behaviour / root cause

**One enforcer, three adjacencies.** `contextualDiagnostics`
(`src/lexer/lexer.ts:810–851`) is a single pass over the token stream. Its
worker is position-agnostic — `checkName(index, kind)` reads
`tokens[index]`, refuses a keyword, returns for a non-`ident`, and tests one
character:

```ts
const first = name.text[0] ?? "";
const isUpper = first >= "A" && first <= "Z";
if (kind === "binding" && isUpper) {
  diagnostics.push({
    severity: "error",
    code: "theta/parse/binding-case-mismatch",
    file,
    range: name.range,
    message: "binding name must start with a lowercase letter or _",
  });
```

(`:832–841`.) Everything positional lives in the caller, and the caller is a
keyword scan (`:876–886`):

```ts
if (t.text === "let") {
  let nameIdx = k + 1;
  const after = tokens[nameIdx];
  if (after !== undefined && after.kind === "keyword" && after.text === "mut") {
    nameIdx += 1;
  }
  checkName(nameIdx, "binding");
} else if (t.text === "fn") {
  checkName(k + 1, "binding");
} else if (t.text === "schema" || t.text === "enum") {
  checkName(k + 1, "type");
}
```

Three calls. Each names an identifier that is the immediate successor of a
keyword token. A parameter name's predecessor is `(` or `,` — punctuation, not
a keyword — so the shape of the scan, not an omitted branch, is what excludes
it. The same shape excludes the schema field name and the `params:` field name
(§Reproduction (e)).

**The shortfall is documented at the function.** `:806–808`: "Scope note: full
identifier-position coverage (every reserved word in every identifier slot) is
a parser-leaf obligation; the lexer core enforces the positions its closed
Tests obligations name." The obligation the note hands to the parser leaf was
not discharged there.

**The parser leaf sees the token and drops it.** `parseFn`
(`src/parser/theta-document.ts:2151`) iterates the list at `:2171–2194`:

```ts
const pName = this.advance().text;
let pType = "";
if (this.isPunct(":")) {
  this.advance();
  pType = this.parseType();
}
params.push({ name: pName, type: pType });
```

(`:2184–2190`.) `this.advance()` returns the whole token — text, kind and
`range` — and `.text` discards the rest at the point of consumption. `FnParam`
(`:409–412`) then stores `{ name, type }` with no range, which is why two later
consumers borrow the declaration's start line instead (`:5134–5137`,
`:5410–5413`). The information a diagnostic needs exists for exactly one
expression's lifetime.

**The same loop already emits a per-parameter diagnostic.** Twelve lines
earlier (`:2172–2183`) the `mut` modifier is captured as a token, checked, and
reported at its own range:

```ts
const mutTok = this.advance();
const diag = checkMutModifier(
  { position: "fn-param" },
  { file: this.file, range: mutTok.range },
);
```

§Reproduction (a12) measures it firing on `fn h(mut P: string)` while the
uppercase `P` beside it draws nothing. So the position is reachable, has a
range available, and already carries a registered code. Nothing structural
prevents the case check.

**Nothing downstream compensates, and nothing downstream is harmed.**
`walkFn` (`src/parser/type-layer-checks.ts:1216–1229`) types an annotated
parameter from its annotation (`:1219–1220`) and records an unannotated one
withheld (`:1227`) — neither path reads the spelling's case.
`statement-executor.ts:416` binds positionally by name, case-blind. The
uppercase parameter therefore behaves exactly like its lowercase twin
(§Reproduction (b)), which is why this is an unenforced constraint rather than
a wrong result.

**The type layer took the gap as a premise.** `type-layer-checks.ts:381–386`
argues that a casing rule cannot supply an unspellable sentinel name because
"a `for` / `par for` variable and a `match` pattern binder [are] outside it" —
and bug 0050's remedy added, correctly for this HEAD, "and a parameter's case
is unenforced at this HEAD"
(`.pi/tmp/fixes/0050-remedy-fixer-r3.md:140`). That clause is a statement about
the implementation, not the spec, and a fix here retires it. It does not retire
the argument: the `for` and `match` binders remain outside the rule, so the
withheld-binder design stands unchanged.

## Why it matters

- **A spelling the spec refuses loads and registers.** `fn h(P: string)`
  emits no `E`, so `hasLoadParseError` admits it
  (`production-composition.ts:2045`) and the theta runs. The rule at
  `lexical.md:16` and the *Trigger* at `code-registry-parse.md:19` both say it
  is a parse error.
- **The harm is bounded and should be stated as bounded.** No value is
  corrupted, no check is skipped, and no diagnostic is wrong: an uppercase
  parameter binds positionally and its body reads it, and §Reproduction (b)
  measures the uppercase and lowercase spellings as diagnostic-identical in
  every probed sink after bug 0050's fix. The corpus contains zero instances
  (§Reproduction (f)). What is lost is the invariant, not a result.
- **Two designs in the tree read the invariant as available.**
  `lexical.md:13` grounds `match` pattern disambiguation on the first letter
  being enforced, and `type-layer-checks.ts:381–386` reasons about which binder
  classes the rule covers when choosing how to name a sentinel. Both are
  correct about the *rule*; only one of them (the type layer, and only because
  a 0050-era clause says so explicitly) is correct about the implementation. A
  future design that reads `lexical.md:16` and assumes enforcement gets a
  wrong premise with no test to catch it.
- **The enforced/unenforced split is invisible from the spec.** An author who
  writes `let P = 1` is told; an author who writes `fn h(P: string)` is not.
  Nothing in the corpus distinguishes the two, and the discriminator in the
  implementation is which keyword precedes the identifier.
- **The gap is wider than the parameter.** Two of the four positions
  `lexical.md:16` lists are silent, and the reserved-keyword rule is absent at
  the parameter position too (§Reproduction (d), (e)). A fix that closes one
  entry and leaves the sentence's other silent entry unstated leaves the class
  half-closed without saying so.
- **No test can red on it.** `tests/lexer-core.test.ts:186–195` pins the `let`
  position and `:174–179` the `schema` position; no test asserts a parameter
  name's case in either direction. Four committed fixtures declare one
  (`tests/fn-arg-type-mismatch-wired.test.ts:736`, `:836`, `:839`, `:842`) and
  each asserts a fn-arg verdict instead, with the gap recorded only in the
  comments beside them (`:828`, `:1639`, `:2334`).

## Non-goals

- **The `for` / `par for` variable and the `match` pattern binder.**
  `lexical.md:16`'s list does not contain them; §Reproduction (c) measures both
  silent, which is conformant. `type-layer-checks.ts:381–386` depends on that
  reading and bug 0050's witness argues from it
  (`tests/fn-arg-type-mismatch-wired.test.ts:824–829`). Do not fold them in.
  Reading the u9/u13 witness headers as evidence of this defect conflates two
  positions with opposite standing.
- **A lowercase `NamedType` at a *reference* position.**
  [0051](./0051-lowercase-named-type-reference-positions-silent.md)'s subject,
  and a different rule (`lexical.md:15`) with a *Trigger*
  (`code-registry-parse.md:20`) that does **not** name the position. That
  report's deliverable is an adjudication; this one's is an emission. They
  share the `checkName` helper and nothing else.
- **The missing parameter type annotation.** `FnParam ::= Ident ":" Type`
  (`docs/reference/grammar.md:254`, `docs/spec_topics/grammar.md:143`) makes
  the annotation mandatory, and `theta-document.ts:2185–2189` admits its
  absence — row a2 (`fn h(P)`) is therefore non-conformant twice over. This
  report pins a1 (`fn h(P: string)`) precisely so the case claim stands
  independent of that. The annotation leniency is unfiled at HEAD and is not
  claimed here.
- **`theta/parse/reserved-keyword-as-identifier` at the parameter position.**
  Row d1 measures `fn h(let: string)` silent. Same enforcer, same dispatch gap,
  different registered code and a different spec sentence
  (`lexical.md:20`). A fix that adds the case check at the parameter position
  is one call to `checkName`, which would close both — that is a bonus to state,
  not a claim this report makes.
- **The schema field name and the `params:` frontmatter field name.**
  §Reproduction (e) measures both silent, and
  [0046](./0046-by-clause-undecided-inputs-load-silently.md)'s §Non-goals
  (`:533–541`) already records the field-name half as "pre-existing, unfiled,
  and orthogonal". They are entries in the same `lexical.md:16` sentence and
  the same `code-registry-parse.md:19` *Trigger*, and a fix should state
  whether it closes them (§Fix (b)) — but the report's claim, its witness and
  its Sev/Diff estimate are scoped to the parameter.
- **Bug 0050's verdict routes.** §Reproduction (b) records that they are
  closed. Nothing here reopens `checkFnArgCompat`, the withheld-binder
  recording, or `WITHHELD_BINDER_TYPE_NAME`'s spelling.

## Fix

Emit `theta/parse/binding-case-mismatch` at the `fn` parameter-name position,
severity `error`, the registry *Message* byte-exact
(`binding name must start with a lowercase letter or _`), ranged on the
parameter name token. No registry edit: the code exists
(`code-registry-parse.md:19`), its *Trigger* already names the position, its
*Message* is unchanged, and `docs/reference/diagnostics.md:65` mirrors it
without a *Trigger* column, so no mirror edit either. DIAG-2 and DIAG-4 are
both satisfied without touching a table.

**(a) Where the check lands.** Two sites are available and they are not
equivalent.

- **`parseFn` (`src/parser/theta-document.ts:2171–2194`).** The parameter loop
  already holds the token and already emits a per-parameter diagnostic through
  the `checkMutModifier` precedent at `:2172–2183`. `:2184` becomes a token
  capture rather than a text capture (`const pTok = this.advance()`), the test
  runs against `pTok.text[0]`, and the diagnostic carries `pTok.range`. This is
  the site the lexer's own scope note hands the obligation to
  (`lexer.ts:806–808`: "a parser-leaf obligation"), it needs no change to the
  lexer's keyword scan, and it reaches the `subagent fn` form for free because
  `parseFn` serves both (a8).
- **`contextualDiagnostics` (`src/lexer/lexer.ts:876–886`).** Adding a fourth
  branch means scanning forward from the `fn` keyword to `(`, then walking to
  `)` while skipping type annotations, which contain `<`, `,` and `|`. The
  keyword-adjacency shape does not extend to a bracketed list without that walk,
  and the walk duplicates parsing the parser already does. Against it: the
  three-position dispatch is where `binding-case-mismatch`'s two shipped
  witnesses expect the code to originate
  (`tests/lexer-core.test.ts:186–195` reads through the V7d seam and would keep
  passing either way, so this is a code-organisation argument, not a test one).

The parser site is the smaller and better-precedented change; the run picks and
records why. If the parser site is chosen, `checkName`'s keyword arm is not
reachable from it, so row d1 (`fn h(let: string)`) stays silent unless the fix
adds the keyword test too — state which.

**(b) Which of the sentence's four positions the fix closes.**
`lexical.md:16` lists four; two are enforced (`let` / `let mut`, `fn` name) and
two are not (function parameter — this report; schema field name — measured at
§Reproduction (e1)–(e4)). The `params:` frontmatter field name (e5) is the
fourth position's frontmatter face. A fix closing the parameter alone is
admissible and is what this report's witness requires; a fix closing the field
name too is a strictly larger GOV-15 sweep and a second set of rows. Either
way §Fix states the disposition of the field position explicitly, because
leaving it unstated makes the next reader re-derive §Reproduction (e).

**(c) The GOV-15 discharge.** The fix turns a class of currently-clean programs
into refusals. Disposition:
`source-language-stability.md:25` dispositions a *Trigger*-set change "as an
addition for inputs newly brought into the code's emission set", which is the
carve-out-covered arm and admissible within theta 1.x. This fix does not edit
the *Trigger* — it brings the implementation onto the registered one — so the
same reasoning applies a fortiori: the affected inputs gain a code's emission
and observe no change to any code they already emit. Two obligations remain,
neither dischargeable by assumption:

1. **Re-run the committed-corpus sweep** rather than trusting §Reproduction
   (f)'s count. Note that
   [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) is open:
   `tests/committed-fixture-parse-gate.test.ts` filters `.theta` only, so the
   two committed `.thetalib` files are invisible to the shipped gate and the
   sweep must walk them explicitly. One of them,
   `docs/examples/personas.thetalib:7`, is one of the corpus's four
   parameter-bearing `fn` declarations.
2. **Record the addition in the release notes** as a GOV-15 carve-out-covered
   code addition, with the input class named: `.theta` / `.thetalib` files
   declaring a `fn` parameter whose name begins with an uppercase letter.

**(d) Constraints the fix preserves**, each with a witness row above:

- **The conformant spellings stay clean.** `p` (a14), `_p` (a15) and the `_`
  discard (a16). The predicate is `lexical.md:16`'s — a lowercase letter **or**
  `_` — which is `checkName`'s existing `first >= "A" && first <= "Z"` test
  (`lexer.ts:832–833`), not a `[a-z]` test.
  `isLowercaseFirstIdentifier` (`src/parser/callable-set.ts:443–445`) is the
  tree's existing regex form of the same rule and reads `^[a-z_]`; reuse one of
  the two rather than minting a third spelling.
- **The `for` / `par for` variable and the `match` binder stay clean.** Rows
  c1 and c2. A fix reaching them contradicts `lexical.md:16`'s list and breaks
  `type-layer-checks.ts:381–386`'s premise.
- **`fn h(mut P: string)` reports both codes, in source order.** a12 currently
  reports `mut-on-immutable-context` alone; after the fix it reports that plus
  `binding-case-mismatch`. Ordering is observable (b) under GOV-15 for an input
  that already emits an `E`, so it is outside the promise's input set — but pin
  the order in the witness so it is a decision and not an accident.
- **No type-layer verdict moves.** Every row of §Reproduction (b) keeps its
  current diagnostics with the new code appended where the parameter is
  uppercase. If a (b) verdict changes, the fix has reached
  `walkFn` (`type-layer-checks.ts:1216–1229`) or the withheld-binder recording,
  which it must not.
- **The `.thetalib` route fires identically.** Row (g). Both extensions reach
  `parseFn` and `lexTheta` the same way.
- **Every parameter in a list is checked.** a6 (`fn h(a: string, B: string)`)
  and a7 (trailing comma) — the loop must not stop at the first parameter or
  mis-handle the trailing `,`.

**(e) Witness — offline, provider-free.** Every row settles inside one
`parseDoc` call, so the witness is one new test file with the shape
`tests/lexer-core.test.ts` uses for the enforced positions: whole-list
`toEqual` on codes, and the expected message sourced from the registry rather
than copy-pasted, per DIAG-4 (`diagnostic-shape.md:74`) — the `msg` helper in
`tests/index-element-alias-unfolded.test.ts:168–183` is the pattern. Required
rows: a1 (the pin) and a2, a3, a4, a5, a6, a7, a8 as the positional and form
coverage; a9–a11 and a13 as the enforced-position controls that keep the
existing behaviour honest; a12 as the two-code row with its order pinned;
a14–a16 as the must-stay-clean controls; c1 and c2 as the outside-the-list
controls, which red if the fix over-reaches; (g) as the `.thetalib` row; and
one range assertion on a1's diagnostic covering the parameter name, since
`FnParam` carries no range of its own (`theta-document.ts:5134–5137`) and a
diagnostic pointing at the `fn` keyword would be the low-effort wrong answer. If the
fix closes the field position too (§Fix (b)), rows e1–e6 join the set. No live
tier applies: nothing on this path crosses a provider, and every observable is
determined inside one parse.

## Provenance

- **Origin:** bug 0050's round-3 probing, recorded as residual 5 of its fix
  report (`.pi/tmp/fixes/0050-report.md:410–414`) and re-stated in its round-7
  remedy (`.pi/tmp/fixes/0050-remedy-fixer-r3.md:140`) when a casing convention
  was rejected as the sentinel-naming discipline. Bug 0050 shipped in 0.77.0
  (`3efdb4ac`) and its summary lists this as one of the residuals filed
  (`docs/bugs/0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md:644`).
  The uppercase-parameter-versus-declared-schema collision was one of 0050's
  false-`E` routes; that route is closed by the withheld-binder recording and
  §Reproduction (b) measures the closure. This report adds what the residual
  does not state: the registered *Trigger*'s own naming of the parameter
  position; the exact dispatch shape that excludes it (`lexer.ts:876–886`) and
  the scope note that predicts it (`:806–808`); the `checkMutModifier`
  precedent in the same loop; the annotated / unannotated, `subagent`,
  multi-parameter, trailing-comma, `.thetalib` and `_`-prefixed rows; the two
  sibling positions inside the same spec sentence; the two positions outside
  it; the reserved-keyword measurement at the same position; and the
  committed-corpus GOV-15 baseline.
- **Evidence:** scratch vitest over `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
  driving the shipped `parseThetaDocument`, at `3efdb4ac`; every cell of groups
  (a)–(g) measured and quoted verbatim above; written, run, deleted. The corpus
  sweep in (f) enumerates `git ls-files *.theta *.thetalib` (34 files) and
  scans each `fn` declaration's parameter list.
- **Implementation, at `3efdb4ac`:** `src/lexer/lexer.ts:125` (the call site),
  `:806–808` (the scope note), `:810–851` (`contextualDiagnostics`), `:814–851`
  (`checkName`; the keyword arm `:819–828`, the first-letter test `:832–833`,
  the `binding-case-mismatch` emission `:834–841`, the `schema-case-mismatch`
  emission `:842–850`), `:876–886` (the three-position dispatch);
  `src/parser/theta-document.ts:409–412` (`FnParam`), `:2151` (`parseFn`),
  `:2172–2183` (the `mut` check), `:2184–2190` (the name capture and push),
  `:5134–5137` and `:5410–5413` (the two consumers that work around `FnParam`
  carrying no range); `src/parser/callable-set.ts:443–445`
  (`isLowercaseFirstIdentifier`, the tree's existing regex form of the rule);
  `src/parser/type-layer-checks.ts:381–386` (the comment scoping the rule),
  `:387` (`WITHHELD_BINDER_TYPE_NAME`), `:1216–1229` (`walkFn`'s parameter
  seeding); `src/runtime/statement-executor.ts:416` (positional binding);
  `src/extension/production-composition.ts:2045` (`hasLoadParseError`).
- **Corpus, at `3efdb4ac`:** `docs/spec_topics/lexical.md:3`, `:13`, `:15`,
  `:16`, `:18`, `:20`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:19`, `:20`;
  `docs/reference/diagnostics.md:65`, `:66`;
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`;
  `docs/reference/grammar.md:254`; `docs/spec_topics/grammar.md:143`;
  `docs/spec_topics/functions.md:20`; `docs/spec_topics/expressions.md:161–168`
  (the pattern grammar whose disambiguation `lexical.md:13` grounds on the case
  rule).
- **Tests, at `3efdb4ac`:** `tests/lexer-core.test.ts:174–179`, `:186–195`
  (the two enforced-position witnesses); `tests/code-registry.test.ts:135`,
  `:140`, `:156`, `:174`, `:180` and `tests/diagnostics-primitive.test.ts:149`,
  `:216` (registry fixtures using the code);
  `tests/fn-arg-type-mismatch-wired.test.ts:736`, `:836`, `:839`, `:842` (the
  four fixtures that declare an uppercase parameter while asserting a fn-arg
  verdict) with `:824–829`, `:1638–1643`, `:2331–2334` (the three comment
  blocks recording the gap). No test asserts the parameter position's
  behaviour in either direction.
