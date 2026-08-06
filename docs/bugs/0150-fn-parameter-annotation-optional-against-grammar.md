# Bug 0150 — Both normative grammar mirrors write `FnParam ::= Ident ":" Type` (`docs/reference/grammar.md:254`, `docs/spec_topics/grammar.md:140`, restated in prose at `:143`), yet `parseFn`'s parameter loop guards the annotation read behind `if (this.isPunct(":"))` (`src/parser/theta-document.ts:2204–2208`) so `fn h(p)` parses with zero diagnostics, registers and runs with `type: ""` on the `FnParam` — and that empty annotation is the switch that turns off four measured type-layer sinks, including `theta/parse/fn-arg-type-mismatch`, whose registered *Trigger* judges an argument against "the matched parameter's **declared type**" and whose row states no runtime AJV safety net applies

- **Status:** open. §Fix is not settled: this report exists to pin the
  adjudication between enforcing the written production (route 1 — a structural
  refusal, whose code choice engages DIAG-2 or the closed `<construct>` table)
  and relaxing both mirrors to match the implementation (route 2 — a normative
  grammar edit against 0050's shipped withheld-binder design). Both routes are
  enumerated with their consequences and the shared constraints are pinned; the
  disposition is left to the run. No ordering dependency blocks it.
  [0139](./0139-fn-parameter-name-case-rule-unenforced.md) is **fixed
  (0.79.0)** and is this report's substrate — its fix added an emission in the
  lines immediately above the guard measured here, and its own witness carries
  one of the cells route 1 reds (§Reproduction (E)); that commit IS this HEAD.
- **Sev/Diff estimate:** S1/D3 — at HEAD a normative production refuses
  `fn h(p)`, the implementation accepts it with no diagnostic on any channel,
  the theta registers and runs (§Reproduction (A), (C)), and the acceptance is
  not inert: the empty annotation it records is the exact condition four
  type-layer sinks branch on, so `fn g(x): string { x }` + `let q = g(1)`
  reports nothing where the one-token-different `fn g(x: string)` reports
  `theta/parse/fn-arg-type-mismatch` at `E` (§Reproduction (B)), and that row's
  registry entry states "no runtime AJV safety net applies"
  (`code-registry-parse.md:116`) — measured, the integer `1` leaves a
  `: string`-annotated function at runtime with no diagnostic and no panic
  (row C2). That is S1's "inputs accepted that the spec refuses … with no
  diagnostic, declared constraints not enforced" on the letter. **The band is
  conditional on the adjudication and should be re-scored on pick:** if the run
  takes route 2 the behaviour is correct and the defect is two normative
  sentences, which is S4. Three facts bound the harm either way — the input
  class is authorial omission, the committed `.theta` / `.thetalib` corpus
  contains zero instances (§Reproduction (D)), and `type-system.md:48` makes
  "no declared type ⇒ no check" the corpus-sanctioned posture once the shape
  exists. D3 because §Fix needs in-run adjudication, and because either route
  lands against pinned bytes: route 1 reds **12 committed test cells across
  five files** and leaves four more asserting an unreachable source class
  (§Reproduction (E)), one of the twelve being row a2 of 0139's own witness,
  shipped in this HEAD's commit.
- **Kind:** defect — a normative production and the implementation disagree,
  and the disagreement is load-bearing. Three elements.
  1. **The production is mandatory in both mirrors and in prose.**
     `docs/reference/grammar.md:254` and `docs/spec_topics/grammar.md:140` both
     read `FnParam ::= Ident ":" Type`. Neither writes `(":" Type)?`, and both
     files mark optionality explicitly in the same block — the `FnDecl`
     production above it writes `(":" ReturnType)?`
     (`reference:247`, `spec_topics:138`) and both pages restate that
     optionality in prose (`reference:261`, `spec_topics:143`). The parameter
     annotation carries no `?` in either place, and
     `docs/spec_topics/grammar.md:143` restates it as a sentence: "Each
     `FnParam` is an `Ident \":\" Type` pair". `docs/spec_topics/grammar.md:3`
     declares the appendix "normative for the productions it covers";
     `docs/reference/grammar.md:3` declares its page "Normative surface syntax
     for Theta". `docs/spec_topics/functions.md:20` (FN-1) delegates to it in
     terms: "The surface form of a `fn` declaration — its parenthesised
     parameter list, the optional `: ReturnType` annotation, and the `FnBody`
     block — is given normatively by the [Grammar Appendix — `fn`
     declarations] production". The production has never been optional. The
     only commits `git log -L` reports on either line are the file's creation
     (`d621e35f` for the reference page; `cb698e44` added the production to the
     spec-topic page) and, on the reference page, the whitespace realignment
     that came with `SubagentMod` (`16a2ee6c`). The right-hand side has never
     carried a `?`.
  2. **The parser makes the annotation optional.** `parseFn`
     (`src/parser/theta-document.ts:2151`) reads each parameter's name token at
     `:2184`, then `:2204–2208`:

     ```ts
     let pType = "";
     if (this.isPunct(":")) {
       this.advance();
       pType = this.parseType();
     }
     ```

     Absence of `:` is not a diagnostic — it is the initialiser. `:2209`
     pushes `{ name: pTok.text, type: pType }`, so the declaration reaches the
     AST with `type: ""`. Measured: `fn h(p): number { 1 }` reports `[]` and
     the parsed `FnParam` is `{ name: "p", type: "" }` (§Reproduction A1).
     `fn h(P)` now reports exactly one diagnostic — 0139's
     `theta/parse/binding-case-mismatch` on the NAME (A2) — and nothing about
     the absent annotation.
  3. **The empty annotation is a live discriminator, not a dead field.** Four
     sites in `src/parser/` branch on it, and every one of them takes the
     silent arm:
     `type-layer-checks.ts:1219` (`walkFn` seeds an annotated parameter's
     judged type and `:1227` records an unannotated one WITHHELD),
     `type-layer-checks.ts:1601–1605` (`checkFnCallArgs` skips the slot,
     because `annotationToCompatType("")` is `undefined`, `:810–814`),
     `theta-document.ts:6159–6165` (`walkStatement` runs the parameter's
     type-expression check only when `p.type.length > 0`), and
     `query-schema-resolve.ts:436–439` (`callArgFrame` returns a sink-less
     `call-arg` frame). §Reproduction (B) measures four sinks going silent
     against four annotated controls that fire.
- **Related:**
  - [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **fixed
    (0.79.0)**, the origin and the immediate substrate. Its §Non-goals bullet
    (`:617–623`) states this finding in terms: "`FnParam ::= Ident \":\" Type`
    … makes the annotation mandatory, and `theta-document.ts:2185–2189` admits
    its absence — row a2 (`fn h(P)`) is therefore non-conformant twice over.
    … The annotation leniency is unfiled at HEAD and is not claimed here." Its
    §Affected repeats it (`:165–171`) and its §Reproduction (a) note repeats it
    again (`:300–302`). Residual 3 of its fix record
    (`.pi/tmp/fixes/0139-report.md:301–305`) files it forward: "The missing
    parameter-type annotation stays lenient … Unchanged by this fix". **Not a
    duplicate and closing it as one would be wrong:** 0139's subject is the
    parameter NAME's case, its registry *Trigger* already named the position so
    no adjudication was owed, and its fix moved only the implementation. This
    report's subject is the parameter's TYPE slot, no registered row names it,
    and the deliverable is which side moves. The two sit in one loop with
    nothing between them — 0139's emission occupies `:2185–2203`, this report's
    guard begins at `:2204` — so whichever fix lands here rebases on that block.
    Its citations of the guard (`:2185–2189`) are pre-fix positions; at HEAD
    the guard is `:2204–2208` (bug 0134's adjudicated drift class, not
    corrected there by this filing).
  - [0050](./0050-fn-arg-type-mismatch-unreachable-mistyped-args-silent.md) —
    **fixed (0.77.0)**, and the strongest evidence against route 1. Its
    withheld-binder design treats "unannotated parameter" as a live, designed-for
    class rather than as an impossible shape: `walkFn`
    (`type-layer-checks.ts:1216–1229`) has a dedicated arm for it whose comment
    reasons about the runtime consequence ("An unannotated parameter carries no
    declared type, and it still BINDS its name in the activation scope … theta
    1.0 has no closures, so a same-named enclosing binding is not readable
    inside the body at all"), `checkFnCallArgs` has a second dedicated arm
    (`:1602–1605`), and five committed fixtures in its shipped witness declare
    one (§Reproduction (E)). A route-1 refusal makes all five unreachable from
    theta source and reds one of the cells asserting on them. **0050 does not
    own this defect:** its subject is `checkFnArgCompat`'s missing caller, and
    its arms are correct behaviour *given* the shape exists — which is exactly
    the premise this report puts in question.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, and
    its §Fix constraint 3 (`:1124–1129`) is the same question one position over:
    "The empty annotation is a separate answer. `let a: = 3` captures `\"\"`,
    which `annotationToCompatType` already refuses. A recogniser must state
    whether the empty capture is refused, admitted, or left as it is". The `fn`
    parameter twin is measured here as row A13: `fn h(p:): number { 1 }` reports
    `[]` and records `type: ""` — byte-identical AST state to `fn h(p)`. **Any
    route-1 predicate keyed on `p.type.length === 0` therefore decides 0124's
    constraint 3 at this position as a side effect**, and a predicate keyed on
    the absent `:` token decides only half of it, leaving `fn h(p:)` admitted.
    State which. Whichever report lands second rebases.
  - [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)
    — **open**, and route 1's code-choice constraint. The nearest in-tree
    precedent for a structural refusal at this exact site is `parseFn`'s own
    missing-`(` check (`theta-document.ts:2159–2167`), which emits
    `theta/parse/unsupported-feature` with the freeform tail `fn parameter list
    must be parenthesised`. 0063's inventory table (`:228`) lists that tail as
    absent from the closed `<construct>` token-name table
    (`placeholder-rendering-a.md:50–68`, 15 cells) that its §3 makes "the whole
    rendering vocabulary" of the code — one of 11 emission sites its census
    finds, none of which produces a listed cell (`0063:220–238`). **Route 1
    reusing `unsupported-feature` therefore
    coins a further off-table tail into a surface 0063 already reports as
    over-subscribed**, and bug 0042's fix rejected exactly that move for the
    same reason (`0063:25–34`). A new registered code avoids the table and
    engages DIAG-2 instead.
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, the
    sibling unchecked obligation at the same call site. Measured here as row
    B3: `fn g(x): string { x }` + `let q = g()` reports `[]`, so a call with a
    missing argument and a parameter with a missing annotation are silent
    together. Disjoint by subject — 0131 owns how many arguments, this report
    owns whether the parameter has a type — and neither fix reaches the other,
    but a route-1 refusal removes B3's fixture shape from the language.
  - [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md) — **open**,
    and it binds the GOV-15 sweep either route must run.
    `tests/committed-fixture-parse-gate.test.ts:55` filters
    `entry.name.endsWith(".theta")`, so the two committed `.thetalib` files are
    invisible to the shipped gate. §Reproduction (D)'s sweep walks both
    extensions explicitly; one of the corpus's three parameter-bearing `fn`
    declarations is in a `.thetalib` (`docs/examples/personas.thetalib:7`).
  - [0138](./0138-imported-thetalib-fn-arg-route-deferred.md) — **open**, the
    other reason a `fn` argument goes unjudged. There the callee's parameter
    types are past a single-file parse; here the callee's parameter has no type
    to be past. Disjoint mechanisms, one visible effect. A route-1 refusal
    shrinks the input set 0138 ranges over (an imported `.thetalib` `fn` could
    no longer declare an unannotated parameter); a route-2 relaxation leaves it
    unchanged.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    citation-drift class. Every `src/parser/theta-document.ts` line in this
    report is verified at HEAD `d11aef29`; citations in 0139 and elsewhere that
    predate its +19-line insertion are stale by that amount and are not
    corrected here.
- **Affected** (every citation verified at HEAD `d11aef29`, 0.79.0):
  - **The two normative productions** — `docs/reference/grammar.md:254` and
    `docs/spec_topics/grammar.md:140`, both `FnParam ::= Ident ":" Type`. Their
    enclosing blocks: `reference:246–255` (the `FnDecl` block including
    `SubagentMod`, `WithClause` and `FnParams`), `spec_topics:137–141`. The
    prose restatement is `spec_topics:143` ("Each `FnParam` is an `Ident \":\"
    Type` pair"); the sibling prose paragraph on the reference page is
    `reference:257–262`, which names the parenthesisation rule, the trailing
    comma, the no-default rule, `mut`, and `: ReturnType`'s optionality, and
    says nothing about the parameter annotation. Normativity: `reference:3`,
    `spec_topics:3`. The delegation that makes the production own the surface
    form: `docs/spec_topics/functions.md:20` (FN-1).
  - **The parse site** — `src/parser/theta-document.ts:2151` (`parseFn`),
    parameter loop `:2169–2213`. `:2184` captures the name token; `:2185–2203`
    is bug 0139's `binding-case-mismatch` emission; `:2204–2208` is the guarded
    annotation read (`let pType = ""` then `if (this.isPunct(":"))`); `:2209`
    is `params.push({ name: pTok.text, type: pType })`. `FnParam` (`:409–412`)
    declares `type` as a plain `string` with no optionality and no sentinel, so
    "unannotated" and "annotated with the empty string" are the same AST state.
  - **The structural-refusal precedent in the same function** —
    `src/parser/theta-document.ts:2159–2167`. A missing `(` after the `fn` name
    IS refused, with `theta/parse/unsupported-feature`, severity `error`, ranged
    on `this.peek().range`, message `unsupported syntactic feature: fn parameter
    list must be parenthesised`. The comment above it (`:2155–2158`) states the
    reasoning route 1 would extend: "Grammar: `FnDecl` parameter lists are
    always parenthesised … A missing `(` after the fn name is a parse error —
    without it a bare `fn f x { … }` silently parses `x` as the fn name's
    trailing junk and accepts a malformed declaration." The same paragraph of
    the same production also writes `FnParam ::= Ident ":" Type`.
  - **The four consumers of the empty annotation**, all in `src/parser/`.
    `rg '\.type\.length|annotationToCompatType\(p\.type' src/` returns five
    hits across these four sites — `query-schema-resolve.ts:437`,
    `theta-document.ts:6160`, `type-layer-checks.ts:1219` with `:1220` (one
    site, both arms) and `type-layer-checks.ts:1601`:
    - `src/parser/type-layer-checks.ts:1216–1229` (`walkFn`). `:1219–1220`
      seeds an annotated parameter's judged type from the annotation;
      `:1221–1228` records an unannotated one through
      `recordWithheldBinders` (`:1181–1187`), which sets the scope entry to
      `WITHHELD_BINDER_TYPE_NAME` (`:387`) and adds it to
      `unprovableBindings`. Every sibling sink that reads the scope map defers
      on that value through `containsWithheldBinderType` (`:409–423`).
    - `src/parser/type-layer-checks.ts:1600–1606` (`checkFnCallArgs`).
      `annotationToCompatType(p.type)` is `undefined` for the empty string
      (`:810–814`), and the loop `continue`s with the comment "An unannotated
      parameter (`p.type` is the empty string) has no declared type to judge
      the argument against."
    - `src/parser/theta-document.ts:6154–6165` (`walkStatement`'s `case "fn"`).
      The per-parameter `parseTypeExpression` call is gated on
      `p.type.length > 0`, so an unannotated parameter is not checked for an
      unresolved named type.
    - `src/parser/query-schema-resolve.ts:429–447` (`callArgFrame`).
      `param.type.length === 0` returns a bare `{ kind: "call-arg" }` frame, so
      an argument-position query inherits no schema sink from the parameter.
  - **The registered row the leniency disables** —
    `docs/spec_topics/diagnostics/code-registry-parse.md:116`,
    `theta/parse/fn-arg-type-mismatch`, severity `E`, phase `type`. *Trigger*:
    "A plain top-level `fn` call `f(args)` … passes an argument whose static
    type is not compatible with **the matched parameter's declared type**.
    Always parse-time: top-level `fn` declarations are hoisted and always
    statically resolvable, **so no runtime AJV safety net applies**." Mirror
    without a *Trigger* column: `docs/reference/diagnostics.md:165`. The
    *Trigger*'s premise has no referent when the parameter carries no declared
    type — which is why §Reproduction (B)'s silence is not a defect of that row
    and is not filed as one.
  - **The registration consequence** —
    `src/extension/production-composition.ts:2047` (`hasLoadParseError`): a
    theta is dropped only when a diagnostic is `error`-severity AND its code
    starts `theta/load/` or `theta/parse/`. Every row of §Reproduction (A) that
    omits an annotation carries none, so each registers.
  - **The runtime the unannotated parameter reaches** —
    `src/runtime/statement-executor.ts:411–417` (`evalUserFnCall`), whose
    `:416` is `scope.defineLocal((fn.params[i] as …).name, arg.value, false)`.
    Binding is positional and type-blind. The `subagent fn` twin is `:498–504`,
    `:503`. Measured at §Reproduction (C).
  - **The deferral posture that makes the silence conformant once the shape
    exists** — `docs/spec_topics/type-system.md:48` ("When either side of a
    compatibility check is past the parser's static view … the parse-time check
    is skipped and the runtime AJV check is the safety net"); mirror
    `docs/reference/type-system.md:59`. For a `fn` call the second half does not
    hold: `code-registry-parse.md:116` states no AJV net applies.
  - **The committed test cells that declare an unannotated `fn` parameter** —
    16 cells over 5 files, enumerated with their assertion shapes at
    §Reproduction (E). Route-1-relevant subsets: 12 red, 4 keep asserting a
    class the language would no longer admit.
  - **The governance surfaces.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:72` — DIAG-2 (the registry
    is closed; adding a code or changing a trigger is a spec change). `:74` —
    DIAG-4 (the *Message* column is normative).
    `docs/spec_topics/governance/source-language-stability.md:5` — GOV-15's
    three observables; `:9` — the loads-cleanly predicate; `:25` — the
    diagnostic-registry carve-out, whose governing sentence dispositions a code
    addition "in-scope for inputs that did not previously emit the added code".
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:45`, `:50–68` — the
    `<construct>` placeholder rule and its closed token-name table, which bounds
    route 1's cheapest code choice.
- **Observed at:** `0.79.0` (HEAD `d11aef29`). Offline, deterministic; no live
  model, no provider. Parse rows through `parseDoc` (`tests/helpers/e2e-s1.ts:39`)
  driving the shipped `parseThetaDocument`, frontmatter `---\nmode: prompt\n---`
  except where noted; the `.thetalib` row passes `path = "lib.thetalib"` with no
  frontmatter. Runtime rows through the shipped
  `createProductionProducerDeps` → `bindPromptConversation` → `executeBody`
  chain, the harness shape `tests/absent-member-presence-gate.test.ts:219–325`
  uses. Registration outcomes computed by replicating `hasLoadParseError`'s
  predicate (`production-composition.ts:2047–2054`) over each row's diagnostic
  list. One scratch vitest file, run on the outputs quoted below, then deleted;
  `git status --short` carries no file of this filing's at exit. `src/`,
  `tests/`, `docs/bugs/README.md` and every other bug document are unmodified by
  this filing.

## Summary

`FnParam ::= Ident ":" Type`. Both grammar pages are normative, both write the
production without a `?`, and both write `(":" ReturnType)?` two lines above,
so the `?` is a mark each page uses and withholds within one block.
`docs/spec_topics/grammar.md:143` restates the parameter rule as a sentence and
`functions.md:20` delegates the surface form to the production.

`parseFn` reads the annotation behind `if (this.isPunct(":"))`
(`theta-document.ts:2204–2208`). No `:`, no annotation, no diagnostic: the
parameter is pushed with `type: ""`. `fn h(p): number { 1 }` reports `[]` and
registers. `fn h(P)` reports exactly one diagnostic — bug 0139's
`binding-case-mismatch` on the name — and nothing about the missing type. The
`subagent fn` form, the multi-parameter form, the mixed annotated/unannotated
form, the trailing-comma form and the `.thetalib` route all behave the same
way.

The acceptance is not inert. `FnParam.type` is a plain `string`, so an omitted
annotation and an empty one are the same AST state, and four sites in
`src/parser/` branch on that state: `walkFn` records the parameter as a
withheld binder, `checkFnCallArgs` skips the argument slot,
`walkStatement` skips the parameter's type-expression check, and
`callArgFrame` drops the schema sink. Measured against annotated controls,
four judgement sinks go silent on the same body — the fn-arg row, the
`let`-RHS row, the `for`-iterand row and the unknown-method row — and one
token restores all four. `theta/parse/fn-arg-type-mismatch`'s registry row
states that no runtime AJV safety net applies to a `fn` call, and the runtime
confirms it: `fn g(x): string { x }` called `g(1)` runs to success and yields
the integer `1` out of a `string`-declared function.

The committed `.theta` / `.thetalib` corpus contains zero unannotated `fn`
parameters — all three parameter-bearing declarations in 34 files are annotated.
The committed TEST corpus contains 17 unannotated-parameter declarations across
16 cells in 5 files, including five fixtures in bug 0050's shipped witness whose
subject is the unannotated-parameter deferral itself. That asymmetry is the
report's central tension: the language's own examples obey the production, and
the implementation's own tests depend on it being violable.

Which side moves is undecided. Enforcing the production is a new structural
refusal, whose code choice is constrained from two directions (a new code
engages DIAG-2; reusing `unsupported-feature` adds a further tail to a closed
table bug 0063 already reports as over-subscribed) and which reds 12 committed
cells. Relaxing both mirrors is a normative grammar edit that observably changes
nothing, but blesses a shape for which the corpus has written no typing rule and
against which one registered `E` row silently does not fire.

## Reproduction

Offline, deterministic, at `d11aef29`. Harness: `parseDoc`
(`tests/helpers/e2e-s1.ts:39`) over the shipped `parseThetaDocument`,
frontmatter `---\nmode: prompt\n---` except where noted. Each diagnostic cell is
the whole list in emission order, unfiltered; `registers?` is
`hasLoadParseError`'s predicate (`production-composition.ts:2047–2054`) negated.

### (A) The defect, and what the parser records

| # | source | diagnostics | parsed `params` | registers? |
|---|---|---|---|---|
| A1 | `fn h(p): number { 1 }` | `[]` | `[{name:"p",type:""}]` | yes |
| A2 | `fn h(P): number { 1 }` | `binding-case-mismatch` @4:6–4:7 | `[{name:"P",type:""}]` | no |
| A3 | `fn h(p) { 1 }` | `[]` | `[{name:"p",type:""}]` | yes |
| A4 | `fn h(p, q): number { 1 }` | `[]` | `[{name:"p",type:""},{name:"q",type:""}]` | yes |
| A5 | `fn h(a: string, b): number { 1 }` | `[]` | `[{name:"a",type:"string"},{name:"b",type:""}]` | yes |
| A6 | `fn h(p,): number { 1 }` | `[]` | `[{name:"p",type:""}]` | yes |
| A7 | ``subagent fn s(p) { @`hi` }`` | `[]` | `[{name:"p",type:""}]` | yes |
| A8 | **control** `fn h(p: string): number { 1 }` | `[]` | `[{name:"p",type:"string"}]` | yes |
| A9 | `fn h(p): string { p }` + `let z = h("a")` + `z` | `[]` | `[{name:"p",type:""}]` | yes |
| A10 | `.thetalib`: `fn t(p): string { p }` | `[]` | `[{name:"p",type:""}]` | n/a |
| A11 | `fn h(a: string, B): number { 1 }` | `binding-case-mismatch` @4:17–4:18 | `[{name:"a",type:"string"},{name:"B",type:""}]` | no |
| A12 | **control** `fn h(): number { 1 }` | `[]` | `[]` | yes |
| A13 | `fn h(p:): number { 1 }` | `[]` | `[{name:"p",type:""}]` | yes |
| A14 | `fn h(3): number { 1 }` | `[]` | `[{name:"3",type:""}]` | yes |
| A15 | `fn h(p): number { 1 }` + `let z = h("a")` + `z` | `[]` | `[{name:"p",type:""}]` | yes |
| A16 | `fn h(_): number { 1 }` | `[]` | `[{name:"_",type:""}]` | yes |

A1 is the pin: one production violated, nothing reported, the theta registers.
A2 is the row bug 0139's §Non-goals named "non-conformant twice over" — at this
HEAD one of the two non-conformances is reported and the other is not, from
adjacent lines of one loop. A5 shows the leniency is per-parameter, not
per-declaration. A7 and A10 show the `subagent` modifier and the `.thetalib`
route change nothing. A9 and A15 add a call site — A9's body also reads the
parameter — and neither introduces a diagnostic. A13 records the empty-capture
spelling: the `:` is present, `parseType` returns the empty string, and the AST
state is identical to A1 — bug 0124's §Fix constraint 3 at this position. A14
records a non-`ident` parameter reaching the same push; it is measured, not
claimed (§Non-goals). A16 is the `_` discard, admitted by `lexical.md:16` and
equally unannotated. A8 and A12 are the conformant controls a fix must keep
clean.

### (B) One token turns four type-layer sinks on

Each unannotated row against its annotated twin on an otherwise byte-identical
body. Whole diagnostic lists.

| # | source | diagnostics |
|---|---|---|
| B1 | `fn g(x): string { x }` + `let q = g(1)` + `q` | `[]` |
| B2 | **control** `fn g(x: string): string { x }` + same call | `fn-arg-type-mismatch` @5:11–5:12: `fn 'g' argument 0 ('x') type mismatch: expected string, got integer` |
| B3 | `fn g(x): string { x }` + `let q = g()` + `q` | `[]` |
| B4 | `fn g(x): number { let s: integer = x` … `}` + `g("a")` | `[]` |
| B5 | **control** the same with `x: string` | `let-rhs-type-mismatch` @4:27–4:45: `let binding 's' initialiser type mismatch: expected integer, got string` |
| B6 | `fn g(x): number { for y in x { y }` … `}` + `g(3)` | `[]` |
| B7 | **control** the same with `x: integer` | `non-array-iterand` @4:37–4:38: `'for' expects array<T> after 'in'; got integer` |
| B8 | `fn g(x): string { x.join(",") }` + `g("a")` | `[]` |
| B9 | **control** the same with `x: string` | `unknown-method` @4:27–4:38: `unknown method 'join' on type string` |

B1/B2 is the measure the report is named for: the argument `1` against a
parameter the annotated twin declares `string`. B4–B9 show the same switch
inside the body — a `let` RHS, a `for` iterand and a method receiver each
resolve the parameter through `walkFn`'s scope, which holds the withheld
sentinel for the unannotated form. **The silences are correct given the shape**:
`checkFnCallArgs` has no declared type to judge against (`:1601–1605`), and the
body sinks read a withheld binder, which `type-system.md:48` defers. What is in
question is whether the shape may exist. B3 is bug 0131's row, recorded so the
two silences are not conflated.

### (C) The runtime

Parse-clean rows driven through `bindPromptConversation` → `executeBody`.

| # | source | outcome |
|---|---|---|
| C1 | `fn g(x): string { x }` + `let q = g("ab")` + `q` | `outcome=success`, value `"ab"` |
| C2 | `fn g(x): string { x }` + `let q = g(1)` + `q` | `outcome=success`, value `1` |
| C3 | **control** `fn g(x: string): string { x }` + `let q = g(1)` + `q` | never reaches the runtime — refused at parse with `theta/parse/fn-arg-type-mismatch` |
| C4 | `fn g(x): integer { x + 1 }` + `let q = g(2)` + `q` | `outcome=success`, value `3` |

C1 and C4 are the plain observation: an unannotated parameter binds positionally
(`statement-executor.ts:416`) and the body reads it. C2 is the one that bounds
the harm: the integer `1` passes through a function whose return annotation is
`string`, reaching the theta's final value with no diagnostic, no panic and no
runtime check — the registry row for `fn-arg-type-mismatch` states no AJV net
applies (`code-registry-parse.md:116`), and C2 measures the absence. C3 is the
same program one token different and never runs.

### (D) The committed `.theta` / `.thetalib` corpus — the GOV-15 baseline

`git ls-files -- "*.theta" "*.thetalib"` → **34 files**, both extensions walked
explicitly because bug 0132 leaves the shipped parse gate blind to `.thetalib`.
Every `fn` declaration scanned for a parameter carrying no `:`.

```
@@ corpus files=34 fn-declarations=4 parameter-bearing=3 unannotated-params=[]
```

| file:line | declaration | parameters |
|---|---|---|
| `docs/examples/personas.thetalib:7` | `fn rate_strictness` | `a: Author` |
| `docs/examples/ralph-inline.theta:21` | `fn step` | `objective: string` |
| `docs/examples/refine-inline.theta:16` | `fn reviewer` | `draft: string` |
| `tests/live/acceptance/fixtures/acc-lib.thetalib:3` | (parameterless) | — |

Zero unannotated parameters. **Measured GOV-15 blast radius against the
committed corpus: zero for either route.** That bounds the corpus half of a
route-1 sweep; it does not discharge GOV-15, because §Reproduction (A)'s
programs load cleanly today and would refuse after a route-1 fix.

### (E) The committed test corpus — route 1's blast radius

Same sweep over `git ls-files -- "tests/*.ts" "tests/**/*.ts"` (301 files),
prose lines and `it(...)` titles excluded, parameter text required to be
identifier-shaped. **17 declaration sites, 16 distinct `it(...)` cells, 5
files.** Each cell classified by what its assertion does when a new
`error`-severity diagnostic appears on the unannotated parameter — derived from
the assertion shape, not from a measured red.

| file | cell | fixture site | assertion shape | route-1 outcome |
|---|---|---|---|---|
| `tests/absent-member-presence-gate.test.ts` | `:563` (b3/N3) | `:566` | `parseTheta` throws on any `E` (`:244–253`) | **red** |
| " | `:576` (b4/N4) | `:586` | same | **red** |
| " | `:846` (e6) | `:862` | same | **red** |
| " | `:876` (e7) | `:887`, `:895` | same | **red** |
| " | `:900` (e8) | `:907` | same | **red** |
| `tests/non-object-receiver-gate.test.ts` | `:714` (f1/E7) | `:716` | `parseTheta` throws on any `E` (`:210–219`) | **red** |
| " | `:736` (f4) | `:742` | same | **red** |
| " | `:837` (h5) | `:845` | same | **red** |
| " | `:852` (h6) | `:853` | same | **red** |
| `tests/tool-arg-shape-enforcement.test.ts` | `:287` (control ii) | `:291` | `diags.filter(severity === "error")` `toEqual([])` (`:297–300`) | **red** |
| `tests/fn-arg-type-mismatch-wired.test.ts` | `:2154` (u12d) | `:795–797` | whole-list `expect(doc.diagnostics).toEqual([])` (`:2169–2172`) | **red** |
| `tests/fn-param-name-case.test.ts` | `:268` (a2) | `:273` | whole-list `codesOf(doc).toEqual([BINDING_CASE])` (`:274–277`) | **red** |
| `tests/fn-arg-type-mismatch-wired.test.ts` | `:1121` (d1) | `:686` | `expectNoFnArgMismatch`, code-filtered (`:657–662`) | green, subject unreachable |
| " | `:1246` (sh2) | `:699` | same | green, subject unreachable |
| " | `:1639` (u9c) | `:741` | same | green, subject unreachable |
| " | `:2265` (u12pd) | `:816–818` | `expectOneFnArgMismatch`, code-filtered (`:644–654`) | green, subject unreachable |

**Twelve red, four stale.** The four green cells are the sharper cost: each
exists to pin how the type layer treats an unannotated parameter (d1 — "an
UNANNOTATED parameter `fn g(n)` called `g(\"s\")` emits nothing"; u9c — the
withheld-binder arm; u12pd — that the withhold is per-name, so an unannotated
`q` does not suppress the emission about an annotated `p`). Route 1 does not
break them; it makes every source they assert over unwritable, so they would
assert a deferral no program can reach.

Row a2 of `tests/fn-param-name-case.test.ts` is bug 0139's own witness, shipped
in `d11aef29`, and its comment (`:269–272`) already records the tension: "The
unannotated spelling is separately non-conformant against the grammar's
mandatory annotation, which is why a1 and not this row is the pin".

`tests/fn-arg-type-mismatch-wired.test.ts`'s u13 group is **not** in this table.
Its four shadowing fixtures (`:840–851`) all declare ANNOTATED parameters —
`fn h(P: string)`, `fn h(P: array<integer>)` — so route 1 does not touch them;
they carry bug 0139's `binding-case-mismatch` on the parameter NAME, which is a
different rule and already shipped.

## Expected behaviour

**One of two sentences is wrong, and the corpus does not say which.** That is
the finding. The two candidate expectations are stated below; §Fix carries their
consequences.

**If the production governs.** `docs/reference/grammar.md:254` and
`docs/spec_topics/grammar.md:140` read `FnParam ::= Ident ":" Type`. Neither
carries the `?` both pages use for `(":" ReturnType)?` in the same block, and
`docs/spec_topics/grammar.md:143` restates the requirement in prose.
`docs/spec_topics/grammar.md:3` and `docs/reference/grammar.md:3` both declare
their productions normative, and `functions.md:20` (FN-1) makes the production
the normative source for the parameter list's surface form specifically. Under
that reading `fn h(p)` is a parse error, and a conformant implementation reports
exactly one `error`-severity `theta/parse/*` diagnostic ranged on the parameter
(name token or the position where the annotation is missing — §Fix route 1),
the theta does not register (`hasLoadParseError`,
`production-composition.ts:2047`), and every row of §Reproduction (A) that omits
an annotation refuses. A13 and A14 depend on the predicate's stated scope (§Fix
route 1); A8 and A12 stay clean.

**If the implementation governs.** Then both productions are wrong and both must
gain `(":" Type)?`, `docs/spec_topics/grammar.md:143`'s prose sentence must be
rewritten, and the corpus must gain the typing rule the shape needs — because
the shape currently has none. `type-system.md:48`'s unresolvable-operand
deferral is the closest fit, and it does not fit cleanly: its stated safety net
is "the runtime AJV check", and `code-registry-parse.md:116` states that for a
`fn` call no such net exists. The corpus would be admitting a parameter whose
argument is checked nowhere, at parse or at run, and saying so is part of the
edit.

**What holds under either reading.** No value is corrupted by a rule this report
identifies: an unannotated parameter binds positionally and its body reads it
(§Reproduction (C)), and every measured silence in §Reproduction (B) is the
correct disposition *given* the parameter has no declared type. The report claims
no wrong verdict and no wrong message.

**What must not move under either reading.** `fn h(p: string)` and `fn h()`
(§Reproduction A8, A12) stay clean. Bug 0139's `binding-case-mismatch` keeps
firing on `fn h(P)` at the name token's range @4:6–4:7 (A2) and on the second
parameter of `fn h(a: string, B)` @4:17–4:18 (A11), unchanged in code, message
and range. No type-layer verdict in §Reproduction (B) changes.

## Actual behaviour / root cause

**The annotation is optional because the parser initialises it to the empty
string.** `parseFn`'s loop (`theta-document.ts:2169–2213`) consumes the
parameter name at `:2184`, runs bug 0139's case check at `:2185–2203`, and then:

```ts
let pType = "";
if (this.isPunct(":")) {
  this.advance();
  pType = this.parseType();
}
params.push({ name: pTok.text, type: pType });
```

(`:2204–2209`.) There is no `else`. The declaration is complete without a `:`,
and `FnParam` (`:409–412`) has nowhere to record that a required element was
absent — `type` is `readonly type: string`, so `""` is simultaneously "no
annotation was written" and "an annotation was written and captured empty"
(§Reproduction A13).

**The same function does refuse a different missing element of the same
production.** Earlier in the same function (`:2155–2167`), a missing `(` after
the `fn` name draws `theta/parse/unsupported-feature` with the tail `fn parameter list
must be parenthesised`, and the comment cites the grammar as the reason. Both
requirements come from the same production paragraph; one is enforced and one is
not. Nothing structural separates them: at `:2204` the parser holds the
parameter's token, its range, and its own position in the token stream.

**The empty annotation then propagates as a decision, not as a gap.** Four
consumers read `FnParam.type` and all four treat the empty string as an
instruction:

- `walkFn` (`type-layer-checks.ts:1216–1229`) — `:1219` tests `p.type.length > 0`
  and seeds the judged type from `annotationToCompatType`; the `else` at
  `:1221–1228` calls `recordWithheldBinders`, which sets the scope entry to
  `WITHHELD_BINDER_TYPE_NAME` (`:387`, the string `<withheld>`) and registers it
  in `unprovableBindings` (`:1185`). Every sink that reads the scope map defers
  through `containsWithheldBinderType` (`:409–423`). §Reproduction B4, B6, B8
  measure three of them.
- `checkFnCallArgs` (`type-layer-checks.ts:1600–1606`) — `annotationToCompatType`
  returns `undefined` for a trimmed-empty source (`:810–814`), and the loop
  `continue`s before reading the argument at all. §Reproduction B1.
- `walkStatement` (`theta-document.ts:6154–6165`) — `parseTypeExpression` runs
  per parameter only when `p.type.length > 0`.
- `callArgFrame` (`query-schema-resolve.ts:429–447`) — `param.type.length === 0`
  yields a frame with no `paramType`, so the walk stops at the call boundary.

**Nothing downstream compensates.** The runtime binds positionally and
type-blind (`statement-executor.ts:416`, and `:503` for the `subagent fn` twin),
and the fn-arg row's own registry entry rules out the net that covers the
analogous `invoke` deferral: "Always parse-time: top-level `fn` declarations are
hoisted and always statically resolvable, so no runtime AJV safety net applies"
(`code-registry-parse.md:116`). §Reproduction C2 measures the consequence end to
end.

**The type layer's design took the shape as given.** `walkFn`'s unannotated arm
carries a comment reasoning about the runtime behaviour of a parameter that has
no declared type, and bug 0050's shipped witness pins that arm from five
fixtures (§Reproduction (E)). That is not an oversight in 0050 — its subject was
the missing caller of `checkFnArgCompat`, and its arms are correct for the
language the implementation accepts. It is evidence about which side of the
disagreement the tree has actually been built on.

## Why it matters

- **A shape the normative grammar refuses loads, registers and runs.** `fn h(p)`
  emits no `error`, so `hasLoadParseError` admits it
  (`production-composition.ts:2047`) and the theta runs (§Reproduction C1). Both
  grammar pages declare themselves normative and `functions.md:20` delegates the
  parameter list's surface form to the production specifically.
- **The acceptance silently disables a registered `E` row with no net behind
  it.** `theta/parse/fn-arg-type-mismatch` is the only static check on a
  same-file `fn` call's arguments, its *Trigger* is written against "the matched
  parameter's declared type", and its row states that no runtime AJV safety net
  applies. One omitted token removes the check and nothing replaces it:
  §Reproduction B1/B2 measures the parse-time silence and C2 measures the
  runtime consequence — an integer reaching the theta's final value out of a
  `string`-declared function.
- **The discriminator is invisible from the corpus.** An author reading
  `grammar.md` writes `fn g(x: string)` and gets argument checking; an author who
  omits the annotation gets none, and no page tells them that omitting it is
  both permitted and consequential. The three parameter-bearing declarations in
  the committed corpus all annotate (§Reproduction (D)), so the corpus's own
  examples model the enforced reading while the implementation admits the other
  one.
- **Two sibling reports are already reasoning about this position.** Bug 0124's
  §Fix constraint 3 asks whether an empty type capture is refused or admitted,
  and §Reproduction A13 shows the `fn`-parameter twin producing byte-identical
  AST state to A1 — so whichever report answers first answers for both. Bug
  0139's fix landed in the lines immediately above the guard and its own
  witness carries a cell that a route-1 fix reds.
- **The evidence points in opposite directions and no page adjudicates.** The
  production and its prose restatement say mandatory; `walkFn`'s dedicated arm,
  `checkFnCallArgs`'s dedicated arm, and 16 committed test cells across five
  files say the shape is a designed-for class. A fix that picks a side without
  stating the other has silently retired live design premises or live normative
  sentences.
- **No test asserts the annotation's requiredness in either direction.** All 16
  cells that use the shape assert something else — a presence gate, a receiver
  gate, a tool-arg control, a withheld-binder deferral, a name's case. Twelve
  would red under a route-1 refusal, but as collateral: none of them would red
  for the reason the refusal exists, and none would red if a mirror gained
  `(":" Type)?`. Whichever way the adjudication goes, the first cell that can
  falsify it has to be written.

## Non-goals

- **Bug 0139's case rule.** `fn h(P)` draws `binding-case-mismatch` at HEAD
  (§Reproduction A2) and must keep drawing it, at the same code, message and
  range. This report claims the annotation slot only; the two are adjacent lines
  in one loop and are separate rules with separate normative homes
  (`lexical.md:16` versus the grammar production).
- **A non-`ident` token in the parameter position.** §Reproduction A14 measures
  `fn h(3): number { 1 }` recording a parameter literally named `3` with no
  diagnostic. That violates the same production's `Ident` half and is recorded
  as a measurement of the loop's coverage, not claimed here. Bug 0139's
  `## Fix (0.79.0)` measured the adjacent spelling and states why its own
  emission does not reach it (`:827–831`: the `pTok.kind === "ident"` guard is
  load-bearing because that code's *Trigger* covers an **Identifier**, and
  `fn h(3: string)` → `[]`). No bug document tracked at `d11aef29` claims the
  `Ident` half, and this one does not either; a fix here states whether its
  predicate reaches it (§Fix route 1).
- **The empty-capture spelling's disposition in general.** §Reproduction A13
  (`fn h(p:)`) is measured because any route-1 predicate must state whether it
  covers it, but the general question — what an empty type capture means at
  every `Type` position — is bug 0124's §Fix constraint 3 (`:1124–1129`) and is
  not decided here.
- **The `fn` call's argument COUNT.** §Reproduction B3 measures `g()` against a
  one-parameter `fn` as silent. That is bug 0131's subject. It is recorded so
  the two silences are not read as one.
- **`theta/parse/fn-arg-type-mismatch`'s emitter.** §Reproduction (B)'s silences
  are correct given an unannotated parameter exists — the *Trigger*'s "declared
  type" has no referent — so no defect is claimed against that row, its emitter
  `checkFnArgCompat`, or bug 0050's `provableArgType` discipline. If route 2 is
  adopted the row's *Trigger* may still need a clause saying so; that is a
  route-2 consequence stated in §Fix, not an independent claim.
- **The imported-`.thetalib` `fn` route.** Bug 0138's subject. An unannotated
  parameter in an imported library defers for two independent reasons at HEAD;
  this report measures only the same-file route.
- **The `params:` frontmatter field's type requirement.** A different surface
  with its own grammar and its own registered checks. Not measured here.
- **`theta/parse/unsupported-feature`'s closed `<construct>` table.** Bug 0063
  owns the reconciliation, including the `fn parameter list must be
  parenthesised` tail this report cites as route 1's nearest precedent
  (`0063:228`). Route 1 must not coin a further tail without engaging that
  report; that is a constraint, not a claim.

## Fix

The subject is which of two normative statements survives, so the routes below
are defined by what each makes true of `fn h(p)`. Neither is selected here.

**Shared constraints — both routes satisfy all six.**

1. **Bug 0139's emission is untouched.** `theta/parse/binding-case-mismatch`
   keeps firing on `fn h(P)` @4:6–4:7 and on `fn h(a: string, B)` @4:17–4:18,
   with the registry *Message* byte-exact (§Reproduction A2, A11). The guard
   this report is about sits at `theta-document.ts:2204–2208`, immediately below
   0139's block at `:2185–2203`; an edit must not disturb the block above it,
   and any witness sources its expected messages from the registry through the
   `registryMessage` oracle per DIAG-4 (`diagnostic-shape.md:74`).
2. **The conformant spellings keep their bytes.** `fn h(p: string)` and
   `fn h()` (§Reproduction A8, A12) report `[]` and register.
3. **No type-layer verdict moves.** Every annotated control in §Reproduction (B)
   keeps its exact diagnostic, code, range and message. A route that changes B2,
   B5, B7 or B9 has reached `walkFn` or `checkFnCallArgs` and must not.
4. **`.thetalib` and `subagent fn` behave identically to `.theta` and plain
   `fn`.** Rows A7 and A10; both reach `parseFn` through the same path.
5. **The GOV-15 sweep is re-run, not cited.** §Reproduction (D)'s count (34
   files, 3 parameter-bearing declarations, zero unannotated) is a measurement
   at `d11aef29`, not a licence. Bug 0132 binds how: the shipped parse gate
   filters `.theta` only
   (`tests/committed-fixture-parse-gate.test.ts:55`), so the sweep walks
   `.thetalib` explicitly.
6. **The 16 committed cells of §Reproduction (E) are addressed explicitly, not
   discovered during implementation.** Grep the fixture shape before Phase 1 —
   bug 0139's fix record raised this as a generalised hazard for exactly this
   file family. Any change to an existing assertion needs operator
   authorisation naming the cells.

**Route 1 — enforce the production.** Refuse a `fn` parameter with no type
annotation at `theta-document.ts:2204–2208`, severity `error`, ranged on the
parameter name token (`pTok.range`, already in hand from bug 0139's capture at
`:2184`).

- **The code choice is constrained from two directions and is the route's real
  cost.** Reusing `theta/parse/unsupported-feature` matches the same function's
  missing-`(` precedent (`:2159–2167`) and needs no DIAG-2 registry addition,
  but it coins a further freeform `<construct>` tail into the closed token-name
  table (`placeholder-rendering-a.md:50–68`) that bug 0063 already reports as
  over-subscribed: its census (`0063:220–238`) finds 11 emission sites, **none**
  of whose `<construct>` values is one of the table's 15 cells, and the
  missing-`(` tail is row `:228` of that census — and bug 0042's fix rejected
  that move for this reason,
  registering a new code instead (`0063:25–34`, quoting 0042's own §Fix:
  "`unsupported-feature` would need a third freeform tail in the closed
  `<construct>` table … which is a GOV-7 / GOV-8 table edit"). A new
  registered code is the
  alternative: it engages DIAG-2 (`diagnostic-shape.md:72` — "Adding a new code
  … [is a] spec change"), needs the row in
  `docs/spec_topics/diagnostics/code-registry-parse.md` and its mirror in
  `docs/reference/diagnostics.md` in the same commit, and its *Message* is
  normative from that moment (DIAG-4, `:74`). State which and why.
- **GOV-15 disposition, if a code is added.**
  `source-language-stability.md:25` places a code addition "in-scope for inputs
  that did not previously emit the added code — those inputs' observable (b)
  sequence and observable (c) content gain the new code's emission, and that
  divergence is the carve-out-covered effect of the addition". Every affected
  input loads cleanly today (`:9`), so the carve-out's theta-2.0 arm — "an edit
  that alters what an in-scope input observes for a code it already emits" — is
  not reached. Record the input class in the release notes: `.theta` /
  `.thetalib` files declaring a `fn` parameter with no type annotation.
- **The predicate must state its scope over A13 and A14.** `p.type.length === 0`
  catches both `fn h(p)` and `fn h(p:)`, which decides bug 0124's §Fix
  constraint 3 at this position; a predicate keyed on the absent `:` token
  catches only `fn h(p)` and leaves A13 admitted. A14 (`fn h(3)`) is a separate
  half of the same production and is a §Non-goal — say whether the predicate
  reaches it.
- **Twelve committed cells red and four go stale** (§Reproduction (E)). Nine of
  the twelve red as a harness throw rather than an assertion failure, because
  `tests/absent-member-presence-gate.test.ts:244–253` and
  `tests/non-object-receiver-gate.test.ts:210–219` fail loudly on any
  `error`-severity diagnostic in a fixture. Those nine cells' subjects (bug
  0032's presence gate, bug 0027's receiver gate) are unrelated to this one and
  their fixtures use `fn f(x)` incidentally, so the minimal repair is annotating
  the fixture parameters — which changes committed test bytes in two files
  whose bugs are shipped, and needs authorisation. The three assertion reds
  (`tool-arg-shape-enforcement.test.ts:287`,
  `fn-arg-type-mismatch-wired.test.ts:2154`, `fn-param-name-case.test.ts:268`)
  each need a decision: annotate the fixture, or append the new diagnostic to
  the expectation. Cell a2 of `fn-param-name-case.test.ts` is the delicate one —
  it is bug 0139's pin that the case rule reads the NAME and not the annotation,
  so annotating its fixture would collapse it into cell a1.
- **The four green-but-stale cells are the route's honest cost.** d1
  (`:1121`), sh2 (`:1246`), u9c (`:1639`) and u12pd (`:2265`) each pin how the
  type layer treats an unannotated parameter. Route 1 makes every source they
  assert over unwritable. Either they are rewritten to assert the refusal
  instead — which changes bug 0050's shipped witness's subject — or they are
  left asserting an unreachable class, which the tree should not do silently.
- **It removes the `walkFn` arm's reason to exist.** `type-layer-checks.ts:1221–1228`
  and `:1602–1605` become dead for `fn` parameters (the withheld-binder
  machinery stays live for `match` binders and `for` variables through
  `matchArmScope`, `:1202–1214`). Deleting them is out of scope for this fix;
  saying that they are now unreachable from theta source is not.

**Route 2 — relax both mirrors.** Edit `docs/reference/grammar.md:254` and
`docs/spec_topics/grammar.md:140` to `FnParam ::= Ident (":" Type)?`, rewrite
`docs/spec_topics/grammar.md:143`'s prose sentence ("Each `FnParam` is an
`Ident \":\" Type` pair"), and add the parameter-annotation optionality to
`docs/reference/grammar.md:257–262`'s prose paragraph, which currently states
`: ReturnType`'s optionality and nothing about the parameter's.

- **It is observably inert, which is its strongest argument.** No input's
  diagnostics, values or system-note content change, so GOV-15's three
  observables (`source-language-stability.md:5`) are untouched and no carve-out
  is engaged. No registry row moves, so DIAG-2 and DIAG-4 are not reached. The
  whole cost is corpus prose and whatever the corpus must now say about the
  admitted shape.
- **The tree already reads this way.** `walkFn`'s dedicated unannotated arm with
  its runtime-behaviour comment, `checkFnCallArgs`'s dedicated skip, and 17
  committed fixture declarations across 16 cells (§Reproduction (E)) — including
  five in bug 0050's shipped witness whose subject IS the unannotated-parameter
  deferral — are all evidence that the implementation's reading has been the
  operative one for the tree's whole type-layer design.
- **It must supply the typing rule the shape currently lacks, and the obvious
  one does not fit.** `type-system.md:48` defers a check whose operand is "past
  the parser's static view" and names "the runtime AJV check" as the safety net;
  `code-registry-parse.md:116` states that for a `fn` call there is none. A
  route-2 edit that stops at the two productions leaves a parameter whose
  argument is checked at neither phase and says so nowhere. The minimum
  additional edit is a sentence — on `functions.md`, on `type-system.md`, or as
  a *Trigger* clause on the fn-arg row — stating that an unannotated `fn`
  parameter's argument is unchecked at both phases. A *Trigger* clause engages
  DIAG-2 as a trigger change (`diagnostic-shape.md:72`), dispositioned by
  `source-language-stability.md:25` "as an addition for inputs newly brought
  into the code's emission set and as a removal for inputs taken out of it" —
  and no input's emission set moves, so the carve-out is satisfied trivially.
  A prose sentence on a topic page engages neither.
- **It weakens the argument for the parenthesisation refusal in the same
  function.**
  `theta-document.ts:2155–2158` justifies refusing a missing `(` by citing the
  same production paragraph. If that paragraph is the kind of thing the
  implementation may diverge from, the comment's reasoning needs restating.
  Route 2 should say whether the missing-`(` refusal is still grammar-derived
  or is now justified on other grounds (it is: without `(` the declaration is
  genuinely ambiguous, which the comment also says).
- **It leaves A13 and A14 undisposed.** `fn h(p:)` (an empty capture) and
  `fn h(3)` (a non-`Ident` parameter) are not made conformant by
  `Ident (":" Type)?` — the first writes a `:` with no `Type`, the second is not
  an `Ident`. Route 2 must say that it is not blessing them; otherwise the next
  reader takes the relaxation as covering everything §Reproduction (A) measures
  silent.

**Witness — offline, provider-free, and required under either route.** No test
in the tree asserts the annotation's requiredness in either direction, so the
first obligation is a cell that can red. Under route 1: the refusal on A1, A3,
A4, A5 (second parameter only), A6, A7 and A10, with one range assertion on A1's
diagnostic covering the parameter (a diagnostic on the `fn` keyword would be the
low-effort wrong answer, and `FnParam` carries no range of its own —
`theta-document.ts:5428–5433`); the A8/A12 controls staying clean; A2 and A11
pinned as ordered whole lists so bug 0139's code and the new one are both
observable in source order; and the four §Reproduction (B) controls unchanged.
Under route 2: a cell pinning A1 and A5 as `[]` with the relaxed production
cited, so a later fix cannot silently re-enforce, plus a documentation-side check
that both mirrors and both prose paragraphs agree. Every expected message is
read from the registry per DIAG-4. No live tier applies under either route:
every observable settles inside one `parseDoc` call, except §Reproduction (C)'s
runtime rows, which use the offline production-executor harness
(`tests/absent-member-presence-gate.test.ts:219–325`) and cross no provider.

## Provenance

- **Origin:** residual 3 of bug 0139's fix record
  (`.pi/tmp/fixes/0139-report.md:301–305`), filed forward from that report's
  §Non-goals bullet (`docs/bugs/0139-…:617–623`), its §Affected bullet
  (`:165–171`) and its §Reproduction (a) note (`:300–302`), each of which states
  the mismatch and declines to claim it. Bug 0139 shipped in 0.79.0
  (`d11aef29`). This report adds what the residual does not state: the second
  mirror's exact production line (`docs/spec_topics/grammar.md:140`, not `:143`
  — see below); the prose restatement and the FN-1 delegation that make the
  production normative for this surface; the `git log -L` evidence that the
  production has never carried a `?`; the four `src/parser/` consumers of the
  empty annotation and the measured silence of four judgement sinks against
  their annotated controls; the runtime rows including an integer leaving a
  `string`-declared function; the empty-capture and non-`Ident` neighbours;
  the committed-corpus GOV-15 baseline; and the 16-cell committed-test
  inventory with each cell's route-1 outcome derived from its assertion shape.
- **Citation corrections carried by this filing.** Bug 0139's §Non-goals,
  §Affected and fix-record residual 3 all cite the second mirror as
  `docs/spec_topics/grammar.md:143`. At HEAD `:143` is the PROSE paragraph
  ("Each `FnParam` is an `Ident \":\" Type` pair"); the production itself is
  `:140`. Both support the claim; this report cites both, distinguished. The
  first mirror's `docs/reference/grammar.md:254` is correct as cited. 0139's
  `theta-document.ts:2185–2189` for the guard is a pre-fix position; at HEAD the
  guard is `:2204–2208` (bug 0134's adjudicated drift class; not corrected in
  0139 by this filing).
- **Evidence:** one scratch vitest file at `d11aef29`, written, run and deleted.
  Parse rows through `parseDoc` (`tests/helpers/e2e-s1.ts:39`) driving the
  shipped `parseThetaDocument`, reading `doc.diagnostics` unfiltered and
  `doc.body.statements`' `FnDecl.params` directly; registration computed by
  replicating `hasLoadParseError` (`production-composition.ts:2047–2054`);
  runtime rows through `createProductionProducerDeps` →
  `bindPromptConversation` → `executeBody`, reading
  `BodyExecution.outcome` and `.result.value`. The two sweeps enumerate
  `git ls-files` and scan each `fn` declaration's parameter list for a
  parameter carrying no `:`, with prose lines and `it(...)` titles excluded by
  requiring the parameter text to be identifier-shaped.
- **Corpus, at `d11aef29`:** `docs/reference/grammar.md:3`, `:244`, `:246–255`
  (`:247` `FnDecl`, `:253` `FnParams`, `:254` `FnParam`), `:257–262`;
  `docs/spec_topics/grammar.md:3`, `:133`, `:135`, `:137–141` (`:138` `FnDecl`,
  `:139` `FnParams`, `:140` `FnParam`), `:143`;
  `docs/spec_topics/functions.md:20` (FN-1);
  `docs/spec_topics/type-system.md:48`; `docs/reference/type-system.md:59`;
  `docs/spec_topics/diagnostics/code-registry-parse.md:116` (the disabled row),
  `:27` (`unsupported-feature`, route 1's precedent code), `:19`
  (`binding-case-mismatch`, bug 0139's row, cited only to keep the two claims
  separate); `docs/reference/diagnostics.md:165`, `:73`, `:65` (the same three,
  mirrored without a *Trigger* column);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:72`, `:74`;
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:45`, `:50–68`;
  `docs/spec_topics/governance/source-language-stability.md:5`, `:9`, `:25`;
  `docs/spec_topics/lexical.md:16` (bug 0139's rule, same reason).
- **Implementation, at `d11aef29`:** `src/parser/theta-document.ts:409–412`
  (`FnParam`), `:2151` (`parseFn`), `:2155–2167` (the missing-`(` refusal and
  its grammar-citing comment), `:2169–2213` (the parameter loop), `:2184` (the
  name-token capture), `:2185–2203` (bug 0139's emission), `:2204–2208` (the
  guarded annotation read), `:2209` (the push), `:5153–5157` and `:5428–5433`
  (the two records that `FnParam` carries no range of its own), `:6154–6165`
  (`walkStatement`'s per-parameter type-expression gate);
  `src/parser/type-layer-checks.ts:387` (`WITHHELD_BINDER_TYPE_NAME`),
  `:409–423` (`containsWithheldBinderType`), `:810–814`
  (`annotationToCompatType`'s empty-string refusal), `:1181–1187`
  (`recordWithheldBinders`), `:1202–1214` (`matchArmScope`, the other consumer
  of the withhold), `:1216–1229` (`walkFn`), `:1600–1606` (`checkFnCallArgs`'s
  parameter side);
  `src/parser/query-schema-resolve.ts:429–447` (`callArgFrame`);
  `src/runtime/statement-executor.ts:411–417` and `:498–504` (positional,
  type-blind binding on the plain and `subagent fn` paths);
  `src/extension/production-composition.ts:2047–2054` (`hasLoadParseError`).
- **Tests, at `d11aef29`:** the 16-cell inventory of §Reproduction (E), with
  fixture sites and assertion helpers —
  `tests/fn-arg-type-mismatch-wired.test.ts:644–654`
  (`expectOneFnArgMismatch`), `:657–662` (`expectNoFnArgMismatch`), `:686`
  (`D1`), `:699` (`SH2`), `:741` (`U9_FN_PARAM`), `:795–797`
  (`U12_FN_PARAM_SHADOW`), `:816–818`
  (`U12PD_ANNOTATED_BESIDE_UNANNOTATED`), `:840–851` (the u13 fixtures, all
  ANNOTATED and therefore outside this report), cells `:1121`, `:1246`,
  `:1639`, `:2154`, `:2265`;
  `tests/fn-param-name-case.test.ts:268–279` (row a2, whose comment already
  records the tension);
  `tests/absent-member-presence-gate.test.ts:219–325` (the offline runtime
  harness this report reused), `:244–253` (`parseTheta`'s loud failure), cells
  `:563`, `:576`, `:846`, `:876`, `:900`;
  `tests/non-object-receiver-gate.test.ts:210–219`, cells `:714`, `:736`,
  `:837`, `:852`;
  `tests/tool-arg-shape-enforcement.test.ts:287–301`;
  `tests/committed-fixture-parse-gate.test.ts:55` (the `.theta`-only filter bug
  0132 owns). No test asserts whether a `fn` parameter's type annotation is
  required.
