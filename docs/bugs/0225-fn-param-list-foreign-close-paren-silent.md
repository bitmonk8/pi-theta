# Bug 0225 — `parseFn`'s parameter loop still pushes any token it advances over as a `FnParam` (`theta-document.ts:2414`, `:2460`), and bug 0151's landed refusal only marks the list unclosed at a block-open `{` (`:2398`) or at EOF (`:2468–2472`), so a swallowed region that ends at a `)` belonging to something else exits through the `)` arm as a closed list: `fn h(a: string,` + `x = 1` + `) { 1 }` reports `[]`, records `x`, `=` and `1` as three further parameters, drops the `x = 1` statement from `body.statements`, moves `h`'s arity from 1 to 4, and REGISTERS — and the one-line spelling `fn h(a: string, = 1) { 1 }`, which engages no newline continuation at all, is silent the same way

- **Status:** fixed (0.168.0). Filed as residual 1 of bug
  [0151](./0151-unclosed-fn-parameter-list-accepted.md)'s `## Fix (0.163.0)`,
  which names this class, states that closing it "needs §Fix Decision 1's other
  sub-arm — a non-derivable-token test at every parameter-name position, not
  only at `{` — which reaches bug 0148's and bug 0150's rows and is therefore
  not taken here" (`:1240–1250`). §Fix here is not settled: the predicate's
  boundary against bug
  [0150](./0150-fn-parameter-annotation-optional-against-grammar.md)'s open
  adjudication is a constraint, not a decision, and the disposition is left to
  the run. Re-measured at HEAD for this filing, not copied from that record.
  **Ordering:** no report blocks this one, but three cells of bug 0151's
  shipped witness assert this class's exact bytes (§Affected), so a fix moves
  pinned bytes deliberately and with authorisation.
- **Sev/Diff estimate:** S1/D3 — S1 because the grammar's `FnDecl` derives no
  `punct`, `number`, `string` or `template` token at a `FnParam` position
  (`docs/spec_topics/grammar.md:138–140`, `Ident` is `[A-Za-z_][A-Za-z0-9_]*`
  at `docs/spec_topics/lexical.md:13`), and the measured input reports nothing
  on any channel and registers (§Reproduction A1), so it is "inputs accepted
  that the spec refuses … with no diagnostic" by the letter. It is also S1 by
  measurement: the acceptance deletes author program text — the `x = 1`
  reassignment is present in `body.statements` when the list is closed and
  absent when it is not (A1 against A10) — and it moves the declared arity
  from 1 to 4 while leaving a correct-looking call site intact (A7), which
  `evalUserFnCall` (`src/runtime/statement-executor.ts:403`) turns into a
  thrown `ThetaFnArityError` routed to `theta/runtime/internal-error`
  (`src/runtime/tool-call.ts:443`) because no parse-time arity check exists
  (bug [0131](./0131-in-document-fn-call-arity-unchecked.md)). D3 because §Fix
  needs in-run adjudication and touches pinned bytes across sibling reports:
  the predicate must state whether it reaches an annotation-less `Ident` at
  the same position, which is bug 0150's open subject and which this class's
  own witness rows contain (`x` in A1); the existing registered row's *Trigger*
  is scoped to the EOF and `{` exits alone
  (`docs/spec_topics/diagnostics/code-registry-parse.md:24`), so widening it is
  a DIAG-2 *trigger* change with its `docs/reference/diagnostics.md` mirror
  co-edited; and three cells of `tests/fn-param-list-unclosed.test.ts` assert
  this class's whole diagnostic list and exact parameter array (`:758`, `:775`,
  `:788`).
- **Kind:** defect — implementation, against a normative production, with a
  registry-scope question the disposition must answer. Three elements.
  1. **The loop pushes whatever it advanced over.** `parseFn`
     (`src/parser/theta-document.ts:2346`) enters its parameter loop at
     `:2392` (`while (!this.isPunct(")") && !this.atEnd())`), takes the next
     token unconditionally at `:2414` (`const pTok = this.advance();`), and
     pushes `{ name: pTok.text, type: pType }` at `:2460`. The two checks
     between them are conditional diagnostics, not control: `:2427` emits
     `theta/parse/reserved-keyword-as-identifier` for `pTok.kind === "keyword"`
     (bug [0148](./0148-reserved-keyword-fn-parameter-position-silent.md), fixed
     0.81.0) and `:2444` emits `theta/parse/binding-case-mismatch` for an
     uppercase-first `ident` (bug 0139, fixed 0.79.0). A `punct`, `number`,
     `string` or `template` token matches neither arm and reaches `:2460`
     silently. `FnParam` (`:460–463`) is two plain strings, so the AST records
     `{ name: "=", type: "" }` as an ordinary parameter.
  2. **Bug 0151's landed refusal does not reach this exit.** The `unclosed`
     mark is set at exactly two sites: `:2398–2400`, a block-open `{` at a
     parameter-name position, and `:2468–2472`, the epilogue's else-arm when no
     `)` stands at the cursor. A swallowed region that ends at a `)` the author
     wrote for something else — the list's own closer on a later line, after
     the newline suppression joined the lines — satisfies the loop's `)` exit,
     `:2468` consumes it, `unclosed` stays `false`, and `:2473`'s emission does
     not run. The comment at `:2366–2372` states the premise this class falls
     outside of: the two exits are the ones distinguished, and the `{` break
     rests on "a `)` before it would already have exited the loop".
  3. **The registered row is scoped away from it.**
     `theta/parse/fn-param-list-unclosed`'s *Trigger*
     (`docs/spec_topics/diagnostics/code-registry-parse.md:24`) reads "the
     parameter loop reaches EOF, or a block-open `{` is reached first", and its
     stated recovery is "the cursor is left ON the `{`". Neither clause covers
     an exit through a foreign `)`. The registry is closed (DIAG-2,
     `docs/spec_topics/diagnostics/diagnostic-shape.md:72`), so an emission here
     is a *trigger* change to that row or a further row — a spec edit either
     way, not an implementation change.
- **Related:**
  - [0151](./0151-unclosed-fn-parameter-list-accepted.md) — **fixed
    (0.163.0)**, the origin and the immediate substrate. Its `## Fix (0.163.0)`
    Decision 1 took two arms (the `{` break and the distinguished EOF exit) and
    left the third — "a non-derivable-token test at every parameter-name
    position" — untaken, recording this class as residual 1 with the measured
    rows this report re-measures (`:1240–1250`). Its Decision 4 ("do nothing"
    about the duplicated `binding-case-mismatch`) is recorded as persisting
    "on the foreign-`)` rows (d1), which this route does not reach"
    (`:1191–1194`). **Not a duplicate:** 0151 is closed on the two exits it
    adjudicated and its witness pins this class's current bytes as a deliberate
    residual, which is exactly what a report is needed to move.
  - [0150](./0150-fn-parameter-annotation-optional-against-grammar.md) —
    **open**, the same loop, one position over, and **the boundary this
    report's predicate must state.** 0150 owns the TYPE slot of a well-formed
    parameter: `FnParam ::= Ident ":" Type` makes the annotation mandatory and
    `:2451–2459` guards it behind `if (this.isPunct(":"))`, so `fn h(p)` parses
    with `type: ""` (measured here as A11). **0150 does not own this report's
    class.** Its §Non-goals bullet on the `Ident` half is explicit — "A
    non-`ident` token in the parameter position. §Reproduction A14 measures
    `fn h(3): number { 1 }` recording a parameter literally named `3` with no
    diagnostic. That violates the same production's `Ident` half and is
    recorded as a measurement of the loop's coverage, not claimed here. … No
    bug document tracked at `d11aef29` claims the `Ident` half, and this one
    does not either". This report claims that half at this exit. The two meet
    on one token: `x` in `fn h(a: string,` + `x = 1` + `)` is a legal `Ident`
    with no annotation, so a predicate that refuses only non-`Ident` tokens
    leaves `x` recorded and refuses `=` and `1`, while a predicate keyed on a
    missing annotation decides 0150's adjudication as a side effect. §Fix
    constraint 4 states which decisions belong to which report; whichever lands
    second rebases on the other's edit to the same loop.
  - [0148](./0148-reserved-keyword-fn-parameter-position-silent.md) — **fixed
    (0.81.0)**, and the reason the sharpest rows of 0151's filing no longer
    reach this class. Its emission at `:2427` refuses a reserved keyword at a
    parameter-name position, so `fn h(a: string,` + `let x = 1` + `) { 1 }` now
    draws `theta/parse/reserved-keyword-as-identifier` and does not register
    (A12) — the swallow is unchanged, only the silence is gone. The rows that
    remain silent are the ones whose swallowed text opens with no keyword: an
    assignment, a bare literal, a bare expression. Disjoint by subject (a
    reserved spelling against a token no `Ident` derives) and its fix does not
    reach this one.
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, and the
    reason the corrupted arity is not caught before execution. A1 records `h`
    at four parameters; A7 records a surviving `let z = h("q")` call site with
    one argument and zero diagnostics. 0131's fix would convert the runtime
    throw into a parse diagnostic; it would not name the malformed parameter
    list, and it does not close this report.
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open**, and
    the source of bug 0151's withhold. When a parameter type capture consumes
    strictly more punct `)` tokens than punct `(` tokens, `:2456–2458` sets
    `closeParenAbsorbed` and both the verdict and the recovery are withheld.
    That is a different reason for silence at the same site — the author's `)`
    was swallowed by the type — and its three cells are pinned
    (`tests/fn-param-list-unclosed.test.ts:830`, `:844`, `:854`). This
    report's rows consume no `)` inside a type capture, so the withhold is not
    engaged on any of them (A1–A9 all reach `:2468` with
    `closeParenAbsorbed === false`). A fix must keep the withhold's rows
    byte-identical.
  - [0133](./0133-field-list-discard-recovery-unsettled.md) — **open**, the
    same unsettled question at a different production (`parseSchemaObjectBody`'s
    recovery). Not reached here and not claimed: this report's site is
    `parseFn`'s loop and its production is `FnDecl`.
  - [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)
    — **open**, and the constraint on the cheapest code choice. Reusing
    `theta/parse/unsupported-feature` would coin a further off-table
    `<construct>` tail into the closed token-name table
    (`docs/spec_topics/diagnostics/placeholder-rendering-a.md:56`) that report
    holds open. Bug 0151 declined that move and registered a
    placeholder-free row instead.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    citation-drift class. Every `src/parser/theta-document.ts` line here is
    verified at HEAD `c7c5d828`; bug 0151's fix shifted this function's
    citations again and a fix here inserts into the same loop.
- **Affected** (every citation verified at HEAD `c7c5d828`, v0.163.0):
  - **The parse site** — `src/parser/theta-document.ts:2346` (`parseFn`).
    - `:2354–2363` — the missing-`(` arm
      (`theta/parse/unsupported-feature`, tail `fn parameter list must be
      parenthesised`), the enforced end of the same production, measured
      unmoved (A14).
    - `:2364–2365` — the `(` consume and `openTok` capture, the range bug
      0151's emission uses.
    - `:2366–2372` — the comment stating which two exits the landed route
      distinguishes.
    - `:2373` — `let unclosed = false;`, set at `:2399` and `:2471` only.
    - `:2382` — `let closeParenAbsorbed = false;`, set at `:2457` (bug 0124's
      withhold), false on every row of §Reproduction (A).
    - `:2392` — the loop head, whose `)` arm this class exits through.
    - `:2398–2400` — the `{` break (bug 0151's Decision 1 arm 1).
    - `:2414` — `const pTok = this.advance();`. **The defect site:**
      unconditional, with no `pTok.kind` test on the control path.
    - `:2427–2433` — bug 0148's keyword emission; `:2443–2450` — bug 0139's
      case emission. Both are diagnostics only; neither breaks the loop.
    - `:2451–2459` — the optional `":" Type` (bug 0150's subject) and bug
      0124's withhold detector.
    - `:2460` — `params.push({ name: pTok.text, type: pType })`. Where `=`,
      `1`, `42` and `"q"` are recorded as parameters.
    - `:2468–2472` — the epilogue: `)` present ⇒ consume and leave `unclosed`
      false; absent ⇒ set it. **This class takes the first arm.**
    - `:2473–2481` — the single emission, gated on
      `unclosed && !closeParenAbsorbed`, which does not run.
    - `:1897` — `unmatchedCloseParens(from, to)`, the withhold's token-level
      helper, with its doc comment at `:1891–1896`. Not engaged by any row
      below; cited because a fix's predicate sits beside it.
    - `:460–463` — `FnParam`: `readonly name: string` and `readonly type:
      string`, no kind and no sentinel, so a `punct` parameter is
      indistinguishable in the AST from an `Ident` one.
  - **The AST field the swallowed statements leave** —
    `src/parser/theta-document.ts:789` (`ThetaDocument`), whose `body` field is
    documented at `:792` as "The whole-file body statement-list AST the
    interpreter walks." A1's `x = 1` is absent from it; A10's control carries it
    as a `reassign`.
  - **The lexer mechanism that joins the lines** — `src/lexer/lexer.ts:742`
    (`collapseContinuations`), `:766`
    (`const swallow = depth > 0 || …`). This is the spec's own first
    continuation trigger (`docs/spec_topics/grammar.md:203`;
    `docs/reference/grammar.md:178`) and is correct; it is not this report's
    subject and no route edits it. **It is also not necessary to the defect:**
    A4 and A5 are one-line spellings with no newline inside the list, silent
    the same way.
  - **Registration** — `src/extension/production-composition.ts:1735`
    (`const registered = !diagnostics.some((d) => d.severity === "error")`) and
    `:2220` (`hasLoadParseError`). Every row of §Reproduction (A) rows A1–A9
    produces no diagnostic at all, so both gates pass.
  - **Where the corrupted arity lands** —
    `src/runtime/statement-executor.ts:403` and `:496`
    (`throw new ThetaFnArityError(fn.name, fn.params.length,
    expr.args.length)`), `src/extension/production-theta-producer.ts:6497`
    (the third throw site), the class at `:365` whose doc comment (`:357–364`)
    states the premise this defect breaks — "Arity is a type-phase concern the
    theta grammar expects to be well-formed by execution time, so a mismatch
    reaching the runtime is a defect" — and `src/runtime/tool-call.ts:443`,
    which names the `theta/runtime/internal-error` routing. Reached by A7's
    surviving call site; asserted as a code path, not driven end to end here.
  - **Spec — the productions.** `docs/spec_topics/grammar.md:138` (`FnDecl`),
    `:139` (`FnParams`), `:140` (`FnParam ::= Ident ":" Type`), `:143` (the
    prose, which now names `theta/parse/fn-param-list-unclosed`);
    `docs/reference/grammar.md:294` (`FnDecl` with `SubagentMod?` /
    `WithClause?`), `:300`, `:301`, `:304–306` (the mirror prose naming the
    same code). `docs/spec_topics/lexical.md:13` (`Ident` is
    `[A-Za-z_][A-Za-z0-9_]*`), `:16` (the lowercase-first rule for a function
    parameter), `:20` (the 32 reserved spellings, bug 0148's rule).
    `docs/spec_topics/functions.md:20` (FN-1, which delegates the parenthesised
    parameter list's surface form to the Grammar Appendix production).
  - **The registered rows.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:24`
    (`theta/parse/fn-param-list-unclosed`, E, parse — whose *Trigger* scopes it
    to the EOF and `{` exits and whose *Message* is the placeholder-free
    `fn parameter list is not closed by ')'`), `:21`
    (`reserved-keyword-as-identifier`, the code A12 draws), `:19`
    (`binding-case-mismatch`), `:29` (`unsupported-feature`, whose
    `<construct>` renders from the closed table at
    `placeholder-rendering-a.md:56`), `:117`
    (`system-interp-unterminated`, still the corpus's only other
    "not closed by a matching token" row). Mirror without a *Trigger* column:
    `docs/reference/diagnostics.md:70`.
  - **Governance.** `docs/spec_topics/diagnostics/diagnostic-shape.md:71`
    (DIAG-1), `:72` (DIAG-2 — the registry is closed; a *trigger* change is a
    spec change), `:74` (DIAG-4 — the *Message* column is normative).
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15's
    three observables), `:9` (the loads-cleanly predicate that selects the
    input set), `:25` (the diagnostic-registry carve-out, whose governing
    sentence dispositions a *trigger* change "as an addition for inputs newly
    brought into the code's emission set").
  - **The pinned witness — this class's current bytes are asserted.**
    `tests/fn-param-list-unclosed.test.ts` (35 cells, bug 0151's shipped
    witness). Its group at `:750–808` is headed "a list that exits on a `)`
    belonging to something else is unchanged" and states in terms that "these
    rows exist so a later route that DOES reach them moves an asserted byte
    deliberately". Three cells, each asserting the whole ordered diagnostic
    list and the exact `params` array:
    - `:758` (c3) — `fn h(a: string,` + `let x = 1` + `) { 1 }`: exactly one
      `reserved-keyword-as-identifier` at `5:1-5:4`, five parameters,
      `registered=false`.
    - `:775` (c4) — `fn h(a: string,` + `fn g(): number { 2 }`: one
      `reserved-keyword-as-identifier` at `5:1-5:3`, four parameters.
    - `:788` (d1) — `fn h(a: string,` + `let X = 1` + `) { 1 }`: the
      duplicated `binding-case-mismatch` at `5:5-5:6`, Decision 4's recorded
      persistence.
    The withhold group (`:813–866`, cells at `:830`, `:844`, `:854`) and the
    withhold-boundary group (`:868–900`) are bug 0124's rows and must stay
    byte-identical. **No cell asserts any row of §Reproduction (A) A1–A9:**
    the silent members of the class carry no committed assertion in either
    direction.
  - **The corpus gate** — `tests/committed-fixture-parse-gate.test.ts:76`
    (`git ls-files -z -- '*.theta' '*.thetalib'`), which walks both extensions
    at HEAD (bug [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md),
    fixed 0.95.0), so the GOV-15 sweep §Reproduction (B) reports is the shipped
    gate's corpus and not a hand-rolled one.
- **Observed at:** v0.163.0 (`c7c5d828`, `package.json:3`). Offline,
  deterministic, provider-free, zero model turns. One scratch vitest probe
  (written, run, deleted) driving the real `parseThetaDocument` through
  `tests/helpers/e2e-s1.ts`'s `parseDoc`, plus a `git ls-files` census over
  every committed `.theta` / `.thetalib` parsed through the same path. Every
  value below is that run's output verbatim. `registered` is
  `!diagnostics.some(d => d.severity === "error")`, the composition root's own
  gate (`production-composition.ts:1735`). `src/`, `tests/`, other bug
  documents and `docs/bugs/README.md` are unmodified by this filing.

## Summary

Bug 0151 refused an unclosed `fn` parameter list at two exits: a block-open `{`
at a parameter-name position, and EOF. It left a third exit untouched and said
so. When the swallowed region ends at a `)` the author wrote for something else,
the loop leaves through its `)` arm, the epilogue consumes that token, neither
mark is set, and the emission at `theta-document.ts:2473` does not run.

What remains in that exit is the whole of the original defect. `parseFn` takes
the next token unconditionally (`:2414`) and records it as a parameter
(`:2460`). A `punct`, `number`, `string` or `template` token matches neither the
keyword arm (bug 0148) nor the case arm (bug 0139), so it reaches the push with
no diagnostic. `fn h(a: string,` with `x = 1` on the next line and `) { 1 }` on
the one after reports `[]`, records four parameters — `a:string`, `x`, `=`, `1`
— drops `x = 1` from `body.statements`, and registers. Two swallowed statements
give seven parameters. A following call site survives and calls the four-parameter
`h` with one argument, which no parse-time check judges (bug 0131) and which
`evalUserFnCall` turns into a thrown `ThetaFnArityError` routed to
`theta/runtime/internal-error`.

The newline continuation is not required for the silence. `fn h(a: string, = 1)
{ 1 }` is one physical line, engages no continuation trigger, records three
parameters and registers. So does `fn h(a: string, 42) { 1 }` and the
string-literal spelling `"q"` at the same position. The lexer's suppression
widens the class; it does not create it.

Bug 0148's fix removed the sharpest rows of 0151's filing from the silent set:
a swallowed region opening with `let`, `fn`, `schema` or any of the other 29
reserved spellings now draws `theta/parse/reserved-keyword-as-identifier` and
does not register. The rows that stay silent are the ones whose swallowed text
opens with an assignment, a bare literal or a bare expression — ordinary
program text.

The registered row cannot be reused as written. Its *Trigger* names the EOF and
`{` exits and its recovery names the `{`; both are scoped away from this exit,
so an emission here is a DIAG-2 *trigger* change or a further row. And the
class's current bytes are asserted: three cells of the shipped witness pin them
as a deliberate residual, with a header saying a later route moves them on
purpose.

## Reproduction

Offline at HEAD `c7c5d828`, zero model turns. Every fixture is a whole
prompt-mode theta (`---\nmode: prompt\n---\n`), so a body line numbered 4 is the
first source line. `diags` is the whole unfiltered list in emission order;
`params` is the recorded `{name, type}` pairs with the count; `stmts` is
`body.statements`' statement kinds.

### (A) The class, its one-line members, and the boundaries

| # | source (`/` = newline) | diags | params | stmts | registered |
|---|---|---|---|---|---|
| A1 **THE PIN** | `fn h(a: string,` / `x = 1` / `) { 1 }` | `[]` | 4 `a:string, x:"", =:"", 1:""` | `["fn"]` | **yes** |
| A2 | `fn h(a: string,` / `42` / `) { 1 }` | `[]` | 2 `a:string, 42:""` | `["fn"]` | **yes** |
| A3 | `fn h(a: string,` / `"q"` / `) { 1 }` | `[]` | 2 `a:string, "\"q\"":""` | `["fn"]` | **yes** |
| A4 **one line** | `fn h(a: string, = 1) { 1 }` | `[]` | 3 `a:string, =:"", 1:""` | `["fn"]` | **yes** |
| A5 **one line** | `fn h(a: string, 42) { 1 }` | `[]` | 2 `a:string, 42:""` | `["fn"]` | **yes** |
| A6 | `fn h(a: string,` / `x = 1` / `y = 2` / `) { 1 }` | `[]` | 7 `a:string, x, =, 1, y, =, 2` | `["fn"]` | **yes** |
| A7 | A1 + `let z = h("q")` + `z` | `[]` | 4 | `["fn","let"]` | **yes** |
| A8 `.thetalib` | A1's body, `path = "lib.thetalib"` | `[]` | 4 | `["fn"]` | **yes** |
| A9 `subagent fn` | `subagent fn s(a: string,` / `x = 1` / `) { 1 }` | `[]` | 4 | `["fn"]` | **yes** |
| A10 **control, closed** | `fn h(a: string) { 1 }` / `x = 1` | `[]` | 1 `a:string` | `["fn","reassign"]` | yes |
| A11 boundary, bug 0150 | `fn h(p): number { 1 }` | `[]` | 1 `p:""` | `["fn"]` | yes |
| A12 boundary, bug 0148 | `fn h(a: string,` / `let x = 1` / `) { 1 }` | `E reserved-keyword-as-identifier @5:1-5:4` | 5 | `["fn"]` | no |
| A13 boundary, own `(` | `fn h(a: string,` / `q = f(1)` / `) { 1 }` | `E unsupported-feature @6:1-6:2 (stray ')')`, `E bare-object-literal @6:3-6:8` | 6 | `["fn"]` | no |
| A14 control, missing `(` | `fn h p: string { 1 }` | four `E`, first `unsupported-feature @4:6-4:7 :: … fn parameter list must be parenthesised` | 0 | — | no |

In every A1–A9 row `ret` is `null`, the `FnBody` holds the author's `1` as its
tail, and `closeParenAbsorbed` is false — bug 0124's withhold is not engaged.

- **A1 is the claim:** four parameters where the author wrote one, a
  reassignment removed from the statement list the interpreter walks, and no
  diagnostic on any channel. A10 is the same two lines with the `)` in place:
  one parameter, the `x = 1` present as a `reassign`.
- **A4 and A5 remove the lexer from the argument.** One physical line, no
  continuation trigger engaged, same silence. The newline suppression widens
  the class to whole following statements; it is not what admits the token.
- **A6 scales it:** the swallow is per token, so two absorbed statements give
  seven parameters.
- **A7 is the runtime reach.** The call site survives with one argument against
  four recorded parameters and draws nothing; `evalUserFnCall`'s arity test
  (`statement-executor.ts:403`) is the next thing that runs.
- **A8 and A9 show the route is neither `.theta`-specific nor
  ordinary-`fn`-specific.**
- **A11 is bug 0150's row**, recorded so the two silences are not conflated:
  its list closes and its parameter is a legal `Ident`.
- **A12 is bug 0148's fix firing on the same swallow.** The absorbed tokens are
  unchanged and still recorded as five parameters; only the silence is gone.
  This is why 0151's §Reproduction (c) c3/c4/c5 and (d) d1/d3/d4 no longer
  measure as filed.
- **A13 bounds the class.** When the swallowed text carries its own balanced
  `(…)`, the loop's `)` exit takes the call's closer, the list's own `)` becomes
  a stray at statement position, and the input is refused. Silence needs the
  swallowed region to contain no unmatched `(`.
- **A14 is the enforced end of the same production**, and the asymmetry stated
  once: a missing `(` is reported at the position it is missing from; a `)`
  that closed nothing the author meant is not reported at all.

### (B) The committed corpus — the GOV-15 baseline

`git ls-files -- "*.theta" "*.thetalib"` → **34 files**, both extensions
parsed through the real path. Every recorded `FnParam.name` tested against
`^[A-Za-z_][A-Za-z0-9_]*$`, the shape every token in this class fails.

```
@@ corpus files=34 fn-decls=4 offenders=[]
```

Zero instances. The loads-cleanly input set
(`source-language-stability.md:9`) therefore contains no committed file a new
emission would newly refuse. That bounds the corpus half of a GOV-15 sweep; it
does not discharge it, because §Reproduction (A)'s A1–A9 load cleanly today and
would refuse afterwards.

## Expected behaviour

- **A `FnParam` begins with an `Ident`.** `FnParam ::= Ident ":" Type`
  (`docs/spec_topics/grammar.md:140`, `docs/reference/grammar.md:301`), and
  `Ident` is `[A-Za-z_][A-Za-z0-9_]*` (`docs/spec_topics/lexical.md:13`). A
  `punct` token (`=`), a `number` token (`1`, `42`), a `string` token (`"q"`)
  and a `template` token are derivable from `Ident` under no reading.
  `FnParams ::= FnParam ("," FnParam)* ","?` (`:139` / `:300`) admits no other
  element, and FN-1 (`docs/spec_topics/functions.md:20`) makes the production
  normative for the parameter list's surface form. A conformant implementation
  therefore reports at least one `error`-severity `theta/parse/*` diagnostic on
  every row of §Reproduction (A) A1–A9, and the theta does not register
  (`production-composition.ts:1735`, `:2220`).
- **Author statements are not silently deleted.** `ThetaDocument.body` is "The
  whole-file body statement-list AST the interpreter walks"
  (`theta-document.ts:792`). A1's `x = 1` is written by the author, is
  present when the list closes (A10), and is absent when it does not, with
  nothing said.
- **The declared arity is the declared arity.** `ThetaFnArityError`'s doc
  comment (`statement-executor.ts:357–364`) states that "a mismatch reaching
  the runtime is a defect". A1 moves `h` from one parameter to four at parse
  time, so A7's correct-looking call site is a mismatch manufactured by the
  parser.
- **What must not move.** A10, A11, A13 and A14 keep their exact diagnostic
  lists, parameter counts and registration outcomes; A12 keeps bug 0148's
  emission alone at `5:1-5:4`; bug 0124's three withhold cells and the two
  withhold-boundary cells keep their bytes.
- **What is not settled.** Whether the refusal reaches an annotation-less
  `Ident` at the same position (`x` in A1, and the whole of bug 0150's class)
  is that report's open adjudication, not this one's, and §Fix constraint 4
  states the split rather than deciding it.

## Actual behaviour / root cause

**One conditional decides everything, and this class does not reach it.** The
emission at `theta-document.ts:2473` is gated on `unclosed &&
!closeParenAbsorbed`. `unclosed` is set at `:2399` (a `{` at a parameter-name
position) and at `:2471` (the epilogue found no `)`). A foreign `)` satisfies
`:2468`, so the epilogue's consume arm runs, `unclosed` stays false, and the
function returns a declaration the grammar does not derive with an empty
diagnostic list.

**Nothing on the control path tests the token's kind.** `:2414` advances
unconditionally; `:2460` pushes. The two `pTok.kind` tests between them
(`:2427` for `keyword`, `:2443` for `ident`) are emission guards, not breaks —
their effect is a diagnostic, and the token is recorded either way. A token that
is neither `keyword` nor `ident` matches neither, so `=`, `1`, `42` and `"q"`
pass through in silence. `FnParam` (`:460–463`) has no field that could record
what kind of token supplied the name.

**The lexer widens the class but does not create it.** `collapseContinuations`
(`lexer.ts:742`, `:766`) suppresses every `stmt-sep` while bracket depth is
open — the spec's own first continuation trigger
(`docs/spec_topics/grammar.md:203`) — so the rest of the file joins the
parameter list and whole statements are consumed token by token. Removing it
from the picture leaves the defect intact: A4 and A5 are single physical lines.

**The `)` the loop exits on is the author's, spent on the wrong production.**
In A1 the author wrote `)` to close the parameter list. The loop reaches it only
after consuming `x`, `=` and `1`, and `:2468` consumes it as though the list had
ended there. The statements those tokens formed never reach
`body.statements`; the `FnBody` that follows is parsed correctly, so the
declaration looks well-formed from every angle except its arity.

**Registration has no backstop.** `hasLoadParseError`
(`production-composition.ts:2220`) needs one `error`-severity `theta/load/*` or
`theta/parse/*` diagnostic and the gate at `:1735` needs one error of any code.
A1–A9 produce none.

**The registry says nothing about this exit.** The row bug 0151 added
(`code-registry-parse.md:24`) enumerates its trigger as the EOF exit or a
block-open `{`, and its recovery as leaving the cursor on the `{`. Emitting it
here would state a trigger the row does not carry and a recovery that does not
happen.

## Why it matters

- **A registering theta loses program text with no diagnostic on any channel.**
  A1's `x = 1` and A6's two assignments are absent from the array the
  interpreter walks. The diagnostic list is empty, so neither arm of the load
  emitter runs — no `ctx.ui.notify`, no stderr mirror — and the author sees a
  theta that loaded.
- **The parser manufactures an arity mismatch and the runtime reports it as an
  internal error.** A7's `h("q")` is a correct call against the declaration the
  author wrote. Against the declaration the parser recorded it is one argument
  for four parameters, which reaches `ThetaFnArityError`
  (`statement-executor.ts:403`) — a class whose own doc comment says reaching
  it is a defect — and routes to `theta/runtime/internal-error`
  (`tool-call.ts:443`). The author's diagnosis starts at the wrong end of the
  file.
- **The silence survives without the lexer's help.** A4 is one line, one
  missing `,`-to-`:` slip away from ordinary text, and reports nothing. A class
  that needs no newline suppression is reachable by a typo rather than by an
  unusual file shape.
- **Bug 0148's fix narrowed the class in a way that hides it.** The rows a
  reviewer would try first — a swallowed `let`, a swallowed `fn` — now refuse.
  What stays silent is a swallowed assignment or bare expression, which is what
  the lines after a `fn` declaration usually are.
- **The class's current bytes are asserted, so it cannot drift closed.** Three
  cells of `tests/fn-param-list-unclosed.test.ts` (`:758`, `:775`, `:788`) pin
  the foreign-`)` rows whole-list, with a group header stating that a later
  route moves them deliberately. Any fix here is an authorised assertion edit;
  no fix here happens by accident.
- **Nothing asserts the silent members in either direction.** A1–A9 carry no
  committed cell. The first test that can falsify either disposition has to be
  written.

## Non-goals

- **The annotation-less `Ident` at the same position.** `x` in A1 and the whole
  of A11 are bug 0150's subject: a legal `Ident` with no `":" Type`. This
  report claims the tokens no `Ident` derives. A fix must state whether its
  predicate reaches the `Ident` case (§Fix constraint 4); it must not decide
  0150's route as a side effect without saying so.
- **The reserved-keyword spelling.** A12 draws bug 0148's emission at HEAD and
  must keep drawing it, at the same code, message and range. That fix is
  shipped (0.81.0) and is not re-implemented here.
- **`parseType`'s terminator set and its unfloored `<` / `>` counter.** Bug
  0124's. The withhold at `:2456–2458` and its five pinned cells are cited as
  constraints, not claimed.
- **The newline-continuation rule.** `docs/spec_topics/grammar.md:199` calls
  the trigger set closed and `:203` is the open-bracket row, mirrored at
  `docs/reference/grammar.md:178`. Correct as written; A4 and A5 show the
  defect does not depend on it. No route edits it.
- **In-document `fn` call arity.** A7's silence at the call site is bug 0131's
  subject. It is recorded because it is what carries this defect to the
  runtime, not claimed.
- **`parseSchemaObjectBody`'s recovery and the unclosed call paren in
  expression position.** Bug 0133's and bug 0151's §Non-goals respectively.
  Different functions, different productions.
- **The `<construct>` table's over-statement.** Bug 0063's. Cited as a
  constraint on one code choice.
- **Citation drift in other documents.** Bug 0151's own citations predate its
  fix's insertion into this function; bug 0134 owns that class and no citation
  outside this file is corrected here.

## Fix

The subject is a silent structural acceptance at one exit of one loop, so the
route is defined by what the tokens at a parameter-name position are tested
against and by what the emission is. **Not settled here:** the predicate's
boundary against bug 0150 (constraint 4) and the registry disposition
(constraint 5) are the two open questions, and both are decisions for the run.

**The named starting point.** Bug 0151's `## Fix (0.163.0)` records what closes
this class: "§Fix Decision 1's other sub-arm — a non-derivable-token test at
every parameter-name position, not only at `{`". Concretely, that is a
`pTok.kind` test at `theta-document.ts:2414`, before the push at `:2460`,
refusing a token that no `Ident` derives — the position bug 0148's keyword arm
already occupies at `:2427` for a different token class, on the same captured
token, in the same loop.

**Constraints every route satisfies.**

1. **The closed-list path stays byte-identical.** A10, A11, A13 and A14 keep
   their exact diagnostic lists, parameter counts and registration outcomes.
   The whole of `tests/fn-param-list-unclosed.test.ts`'s group `(g)`
   (`:624–748`) is closed lists asserted whole-list, and A14's tail is pinned
   at `tests/reserved-keyword-type-position.test.ts:483` through the registry
   oracle.
2. **The two exits bug 0151 settled do not move.** The `{` break (`:2398`), the
   distinguished EOF exit (`:2468–2472`) and the single emission ranged on the
   opening `(` (`:2473–2481`) keep their behaviour, and every cell of that
   witness's groups (a), (b), (c8) and (e4) stays green unchanged.
3. **Bug 0124's withhold is not weakened.** `closeParenAbsorbed`
   (`:2382`, `:2457`, computed by `unmatchedCloseParens` at `:1897`) withholds
   both verdict and recovery. A new predicate at `:2414` must state its
   interaction with it: a withheld input keeps its previous disposition
   byte-for-byte, and the three withhold cells (`:830`, `:844`, `:854`) plus
   the two boundary cells (`:874`, `:888`) stay byte-identical.
4. **The boundary against bug 0150 is stated, not crossed silently.** A
   predicate keyed on `pTok.kind !== "ident" && pTok.kind !== "keyword"`
   refuses `=`, `1`, `42` and `"q"` and leaves `x` (A1) and `p` (A11)
   recorded — so A1 still records a parameter named `x`, and the report's own
   pin is only partly closed. A predicate that also refuses an `Ident` carrying
   no `":" Type` closes A1 completely and **decides bug 0150's open
   adjudication in favour of its route 1**, which reds twelve committed cells
   across five files and leaves four more asserting an unreachable source class
   (that report's §Reproduction (E)). State which, and if the narrow predicate
   is taken, state what A1 then reports and what its `params` array holds.
5. **The registry disposition is named.** Three shapes, each with a stated
   cost:
   - **Widen `theta/parse/fn-param-list-unclosed`'s *Trigger*** to cover a list
     that exits on a `)` after consuming a token no `FnParam` derives. The
     *Message* is already placeholder-free and stays byte-exact (DIAG-4,
     `diagnostic-shape.md:74`); the *Trigger* and the recovery sentence are
     edited, which is a DIAG-2 change (`:72`) landing with the
     `docs/reference/diagnostics.md:70` mirror in the same commit. Cost: the
     row's name says "unclosed" about a list the author did close.
   - **Add a registered row** for a non-derivable token at a `FnParam`
     position — a DIAG-2 addition, placeholder-free or with a `<token>`
     placeholder whose rendering must then be classified under
     `placeholder-rendering-a.md`. Cost: a second row on one production.
   - **Reuse `theta/parse/reserved-keyword-as-identifier`** — rejected on its
     own *Trigger* (`code-registry-parse.md:21`), which names a reserved
     keyword and nothing else; `=` and `42` are not keywords.
   Reusing `theta/parse/unsupported-feature` coins a further off-table
   `<construct>` tail (`placeholder-rendering-a.md:56`) into the surface bug
   0063 holds open, which bug 0151 and bug 0042 both declined.
6. **The recovery is decided and asserted on the statement list.** The landed
   `{` arm leaves the cursor ON the brace so the following statements return to
   the top level. A break at a non-derivable token has the same shape — leave
   the cursor on the token, so `parseForms` re-enters at the statement the
   author wrote and A1's `x = 1` returns to `body.statements`. The cursor then
   stands before the author's `)`, so the route must state what that stray `)`
   reports (A13 measures the existing `stray ')' in statement position` tail at
   statement position) and whether the input draws one diagnostic or two. The
   witness asserts `body.statements` and the exact parameter count, not only
   the diagnostics.
7. **Three pinned cells move, with authorisation naming them.**
   `tests/fn-param-list-unclosed.test.ts:758` (c3), `:775` (c4) and `:788`
   (d1) assert this class's whole diagnostic list and exact `params` array, and
   their group header (`:750–757`) pre-states that a later route moves them
   deliberately. Any route that reaches the class changes those three cells'
   bytes. d1 additionally re-opens bug 0151's Decision 4: if the resync removes
   the swallowed `X` from the parameter array, the parser-side half of the
   duplicated `binding-case-mismatch` goes with it, exactly as measured at that
   witness's c8. Measure it; do not assume it.
8. **GOV-15 is discharged from a re-run sweep.** §Reproduction (B)'s count (34
   files, 4 `fn` declarations, 0 offenders) is a measurement at `c7c5d828`, not
   a licence. The shipped gate walks both extensions
   (`tests/committed-fixture-parse-gate.test.ts:76`), so the sweep is that
   gate plus an explicit offender scan. A *trigger* widening is dispositioned
   by `source-language-stability.md:25` as an addition for the inputs newly
   brought into the code's emission set; record the class in the release notes.
9. **The `.thetalib` and `subagent fn` routes move together with `.theta`.**
   A8 and A9 reach the same loop and are silent today; a route that closes A1
   and leaves either silent has not closed the class.

**Witness — offline, provider-free.** Cells on
`tests/fn-param-list-unclosed.test.ts`'s harness shape (`parseDoc` from
`tests/helpers/e2e-s1.ts`, whole-list ordered `toEqual` over unfiltered
`doc.diagnostics`, every expected message read from the registry through the
`registryMessage` oracle, exact counts and never containment). Required cells:
A1 as the pin, with `body.statements` and the parameter array both asserted;
A4 and A5 as the no-continuation members; A6 for the multi-statement swallow;
A7 for the surviving call site; A8 and A9 for the `.thetalib` and `subagent fn`
routes; A10 and A11 as the must-not-move controls that isolate this report from
bug 0150's; A12 as bug 0148's emission unmoved; A13 and A14 as the boundary and
the enforced end of the production. Whether a live cell is owed follows bug
0151's precedent — that fix carried one live registration cell — and turns on
whether the route changes a registration outcome, which it does. No stochastic
observable is involved: every value settles inside one parse.

## Provenance

- **Origin:** bug 0151's fix (0.163.0, HEAD `c7c5d828`), `## Fix (0.163.0)`
  *Residuals* item 1 — "The foreign-`)` class stays silent, and one member of
  it still registers" (`:1240–1250`), which names the route that closes it and
  states why that route was not taken in that lane.
- **Ownership check performed before any probe.** Bug 0150 (open) and bug 0148
  (fixed 0.81.0) were read first. 0150's §Non-goals disclaims this class in
  terms: "A non-`ident` token in the parameter position … violates the same
  production's `Ident` half and is recorded as a measurement of the loop's
  coverage, not claimed here. … No bug document tracked at `d11aef29` claims
  the `Ident` half, and this one does not either." 0148 is scoped to the 32
  reserved spellings and its fix refuses them (A12). No other document mentions
  the class: `rg` over `docs/bugs/` for the foreign-`)` exit returns only bug
  0151's fix record.
- **Measurement:** one scratch vitest probe at `c7c5d828`, driving the real
  `parseThetaDocument` through `tests/helpers/e2e-s1.ts`'s `parseDoc`, plus a
  `git ls-files` census over both committed extensions. Written, run, deleted;
  `git status --short` carries no file of this filing's at exit. Zero model
  turns, no provider contacted.
- **Not verified end to end:** A7's runtime consequence is asserted from the
  code path (`statement-executor.ts:403` → `tool-call.ts:443`), not from a
  driven execution. Everything else in §Reproduction is probe output verbatim.

## Fix (0.168.0)

- **Route adjudicated in-run** (§Fix settled neither open question; these are
  this run's decisions, taken against a re-measured HEAD and a full-suite
  prototype, not copied from the filed tables):
  - **Decision 1 — the NARROW predicate (§Fix constraint 4's first arm).** At a
    parameter-name position, a token whose `kind` is neither `"ident"` nor
    `"keyword"` — the `punct`, `number`, `string` and `template` classes no
    reading of `Ident` derives — is refused. An annotation-less legal `Ident`
    is NOT refused. **Bug 0150's open adjudication is therefore untouched:**
    nothing in the predicate keys on a missing `":" Type`, A11
    (`fn h(p): number { 1 }`) still registers with one parameter and zero
    diagnostics, and A1 still records a parameter named `x`. The half this
    report claims — a token no `Ident` derives, which 0150's §Non-goals
    disclaims in terms — is the half that moved; 0150's own subject, its
    wire-name half included, is neither claimed nor fixed here. A1's pin is
    closed on registration and left open on the recorded `x`; residual 1 states
    it.
  - **Decision 2 — deferred emission at the epilogue's `)`-present arm; no
    break, no recovery.** The first refused token is recorded in the loop and
    reported only where the list closes on a `)`. §Fix constraint 6 proposed a
    break with the cursor left on the token; **measurement refused it.** A
    break means the cursor never reaches the list's `)`, so the epilogue's
    closed/unclosed distinction collapses, `unclosed` is set on every member of
    this class, and 0151's group (b) EOF cells c6 and c7 red — which §Fix
    constraint 2 forbids. Measured under the break prototype: 7 reds across 2
    files, including c6, c7 and the `fn h(mut: string)` boundary. Under the
    deferred prototype: 3 reds, exactly the three cells constraint 7
    authorises. Consequence, accepted and asserted rather than hidden: the
    recorded parameters are unchanged and A1's `x = 1` stays absent from
    `body.statements`.
  - **Decision 3 — a NEW registered row, not a *Trigger* widening (§Fix
    constraint 5, shape 2).** `theta/parse/fn-param-not-identifier` (E, parse),
    *Message* placeholder-free and byte-exact `fn parameter name must be an
    identifier`. Grounds: DIAG-4 (`diagnostic-shape.md:74`) makes the *Message*
    normative, and `fn-param-list-unclosed`'s *Message* is FALSE on this class —
    the author did write the `)`; the two rows' recoveries differ (that row
    leaves the cursor ON the `{`, this one recovers nothing); and leaving that
    row byte-unchanged keeps its withhold prose and 0151's pinned cells intact.
    Placeholder-free, so `placeholder-rendering-a.md`'s closed table is not
    engaged and bug 0063's open surface is not widened — 0151's Decision 3 and
    bug 0042's precedent.
  - **Decision 4 — withheld under bug 0124's `closeParenAbsorbed`.** An
    absorbed-closer input keeps its previous disposition byte-for-byte, the new
    emission included. The two withhold conditions can be true together at this
    arm, so the guard carries its own falsifying cell (X9).
  - **Decision 5 — exempt on a `mut` modifier consumed in the same loop
    iteration.** Consuming `mut` shifts the annotation `:` into the name slot;
    that shift is a recovery artefact, not an author-written name, and
    `fn h(mut: string)` keeps `mut-on-immutable-context` ALONE (bug 0148 §Fix
    (d)). The exemption is one iteration wide: `fn h(mut = 1) { 1 }` draws the
    modifier code and then this row at the `1`.
- **What shipped:**
  - `src/parser/theta-document.ts` — `parseFn`: the `refusedTok` capture beside
    `closeParenAbsorbed`, the per-iteration `mutConsumed` flag, the
    non-derivable-token predicate at the `pTok` capture, and the deferred
    emission inside the epilogue's `)`-present arm. No other function touched.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the DIAG-2 row,
    stating the refused token classes, the closed-list scoping (a list reaching
    EOF or a body-open `{` is judged by `fn-param-list-unclosed` alone and is
    not doubled), first-token-only reporting, the bug-0124 withhold, the `mut`
    exemption, the absence of recovery, and that an annotation-less `Ident` is
    not judged by this row.
  - `docs/reference/diagnostics.md` — the Code/Sev/Phase/Message mirror row.
  - `docs/spec_topics/grammar.md`, `docs/reference/grammar.md` — one clause
    each beside the `FnParam ::= Ident ":" Type` sentence, in each page's
    existing convention of naming a sibling rule's code inline.
  - `tests/fn-param-not-identifier.test.ts` — 24 cells (new): A1–A9 the class,
    A10/A11 the must-not-move controls that isolate this report from bug
    0150's, A12/A13/A14 the boundaries, X2–X5 the `mut` exemption and the
    separator and `Ident`-half rows, X6/X7 the two settled exits reporting
    `fn-param-list-unclosed` alone, X8/X9 the withhold on both guarded arms,
    and one registry cell asserting the DIAG-2 addition.
  - `tests/live/fn-param-not-identifier-live-cell.test.ts` — one live
    registration cell (new), tagged ``.
  - `tests/fn-param-list-unclosed.test.ts` — the three authorised cell flips
    (§Fix constraint 7) plus the group-header and ledger prose that pre-stated
    them, and the `theta-document.ts` citations this diff's own insertion
    shifted.
- **Gates:** witness `24 passed (24)`; 0151's witness `35 passed (35)`;
  `tests/code-registry.test.ts` `5 passed (5)` (DIAG-2 closed-set
  reconciliation, both directions); `tests/committed-fixture-parse-gate.test.ts`
  `36 passed (36)`; full default suite `Test Files 358 passed (358) / Tests
  7313 passed (7313)`; `npx tsc --noEmit` clean; `npm run lint` clean. The fork
  baseline was 357 files / 7289 tests.
- **Review:** 1 round plus one comment-only polish. Round 1 (deep) — CLEAN, 25
  adversarial token-shape probes reported per shape, both-directions
  neutralisation proof (`17 failed | 41 passed` neutralised, `58 passed`
  restored), and two non-blocking residuals: dual pre-fix/post-fix line
  citations in the new witness comments (house-rule, CLAUDE.md's ban on
  historical references) and pre-fix-only citations inside current-behaviour
  prose (prose). Polish round (comment-only) collapsed every doublet to one
  current-line-plus-symbol citation and re-derived the contract block's
  numbers; verified by gate-diff — every hunk a `//` comment, gates re-run
  green — so the confirmation review round was skipped.
- **Verification:** SOLID after one fixer round. Witness reds on a neutralised
  emission (`14 failed | 9 passed (23)`, class rows reporting an empty
  diagnostic list) and the three flipped 0151 cells red with it
  (`3 failed | 32 passed (35)`); greens restored with `git hash-object`
  identical before and after (`97dcdbcc769458857467d55f4f53c0e0a39f0576`).
  Guard falsifiability proven per guard: neutralising `!mutConsumed` reds X2
  and X3; neutralising `!closeParenAbsorbed` on the `)`-arm initially red
  NOTHING across all 358 files — reported as a finding and closed by cell X9,
  re-proven independently (`1 failed | 23 passed (24)` neutralised,
  `24 passed` restored, hash identical). Default suite, typecheck and lint
  green. Live run for real under the shared lock: the new cell `1 passed` and
  red-proven in BOTH directions live (neutralised, the foreign-`)` theta
  registered and the cell failed on the registered-set observable; restored,
  green), and 0151's precedent live cell `1 passed`. No stochastic class
  engaged — the cell's observables are registration and the
  `theta-system-note` channel, with no model turn.
  `tests/fixtures/h7a/permitted-codes.json` left byte-untouched: the code is a
  load-phase `theta/parse/*` observed on the note channel, not reachable from
  the H9a stderr EMPTY-CAPTURE gate, and H9a was not run. GOV-15 sweep over all
  34 committed `.theta` / `.thetalib` files (both extensions walked, bug 0132):
  4 `fn` declarations, 0 offenders, 0 emissions of the new code; the
  corpus-wide claim is discharged by the shipped
  `tests/committed-fixture-parse-gate.test.ts`, not by the probe. One
  case-insensitive repository sweep for `fn-param-not-identifier` returns hits
  in exactly the six modified and two new files.
- **Residuals:**
  1. **The narrow predicate leaves the annotation-less `Ident` recorded, so
     A1's statement deletion survives.** A1 now reports
     `theta/parse/fn-param-not-identifier` at the `=` and does NOT register,
     which closes the S1 claim; its parameter array is still
     `a:string, x, =, 1` and `x = 1` is still absent from `body.statements`.
     Closing that needs a predicate that also refuses an `Ident` carrying no
     `":" Type`, which decides bug 0150's open adjudication — §Fix constraint 4
     and this lane's own constraint forbid it here. Bug 0150's subject, its
     wire-name half included, is untouched by this fix.
  2. **The two exits bug 0151 settled do not gain this verdict.** A list that
     reaches EOF or a body-open `{` after recording a non-derivable token
     reports `theta/parse/fn-param-list-unclosed` alone (measured:
     `fn h(a: string, 42 { 1 }` draws that code at `4:5-4:6`;
     `fn h(a: string,` with `42` at EOF draws `single-line-if` and that code).
     Deliberate: §Fix constraint 2 pins those cells byte-green, and the
     registry row states the non-doubling. Cells X6 and X7 assert it.
  3. **A `mut`-shifted token is exempt, so one shape stays silent.**
     `fn h(mut = 1) { 1 }` draws the modifier code and this row at the `1`, but
     the `=` shifted into the name slot by the `mut` consume draws nothing.
     Bug 0148 §Fix (d) owns that recovery artefact.
  4. **A12 and A13 gained a diagnostic against §Fix constraint 1's wording.**
     Constraint 1 asks A13 to keep its exact diagnostic list and §Non-goals
     asks A12 to keep bug 0148's emission alone. Both now carry this row as
     well — A12 at `5:7-5:8`, A13 at `5:3-5:4` — because the `=` each swallows
     is a genuine member of the class. Both inputs were already refused, so no
     registration outcome moved, and no committed cell asserted either list
     except c3, which constraint 7 authorises. Recorded as a deviation for the
     parent to ratify, not as an accident.
  5. **Citation drift.** The parser edit inserts inside `parseFn` and shifts
     every `src/parser/theta-document.ts` citation below the `refusedTok`
     declaration — bug 0134's adjudicated class. Corrected inside the two files
     this fix already edits; disclosed and not chased elsewhere.
     `tests/fn-param-list-unclosed.test.ts` retains three citations that were
     already stale before this diff.
  6. **No in-lane release-notes surface for the GOV-15 addition.** §Fix
     constraint 8 asks for the class in the release notes; `CHANGELOG.md` is
     out of bounds in this lane. The parent must record the new code as a
     `source-language-stability.md:25` addition when it stamps the version.
- **Discharge notes appended:** bug 0151's `## Fix (0.163.0)` residual 1 — a
  note beside it records that the foreign-`)` class is closed here on
  registration.
- **Pinned dispositions / non-goals:** bug 0150's optional-annotation subject
  (its wire-name half included), bug 0124's `parseType` terminator set and its
  `<` / `>` counter with all five pinned cells, bug 0148's reserved-keyword
  emission and its `mut` recovery artefact, bug 0139's duplicated
  `binding-case-mismatch` (measured to survive on d1 — this route
  resynchronises nothing), bug 0131's in-document arity check, bug 0133's
  `parseSchemaObjectBody` recovery, bug 0063's `<construct>` table, and the
  newline-continuation rule — all unmoved.

## Coordination note — bug 0370 refuses the undeclared top-level reassign target (2026-09-03)

Bug 0370 (a reassignment's TARGET is never resolved against the scope model)
resolves every reassignment target against the scope model unconditionally on
statement position. Under the parent's class-scoped ratification, this report's
byte-identical control A10 (`fn h(a: string) { 1 }` + `x = 1`) re-anchors:
`x` is an UNDECLARED top-level reassignment target, so bug 0370 now draws
`theta/parse/unknown-identifier` (spanning the statement, `5:1-5:6`), which
denies registration. This report's OWN subject is preserved byte-for-byte —
the fn-param-not-identifier route still stays silent on the well-formed list,
the single recorded parameter and the surviving `reassign` in
`doc.body.statements` are unchanged (the `paramsOf` / `topKinds` pins that guard
this route). The added `unknown-identifier` and the non-registration are bug
0370 collateral, not this route firing. This note is append-only; nothing above
is revised. 0.370.0 is the version bug 0370 ships in.
