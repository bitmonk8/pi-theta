# Bug 0151 — An unclosed `fn` parameter list draws no structural diagnostic: `parseFn`'s parameter loop (`theta-document.ts:2171`) exits only on `)` or EOF and the lexer swallows every `stmt-sep` while bracket depth is open (`lexer.ts:766`), so `fn h(p: string { 1 }` loads with ZERO diagnostics and registers with the body's `{`, `1` and `}` recorded as three further parameters and an empty `FnBody`, `fn h(a: string,` + newline + `let x = 1` + newline + `) { 1 }` deletes the `let` statement and takes `h`'s arity from 1 to 5 with no diagnostic on any channel, and the only code an uppercase spelling draws is `theta/parse/binding-case-mismatch` — twice at one range when the swallowed text is a `let X`

- **Status:** fixed (0.163.0). §Fix enumerated four decisions and selected no
  route; the run adjudicated them and §Fix (0.163.0) below records which arm of
  each was taken, what it leaves silent, and the drift the doc's measurements
  carried (bug 0148's reserved-keyword arm landed between the filing and the
  fix, so §Reproduction (c) c3/c4/c5 and (d) d1/d3/d4 already refused at the
  fix's HEAD).
- **Sev/Diff estimate:** S1/D3 — the grammar's `FnDecl` production carries the
  parentheses around `FnParams?` and makes the closing `)` a required terminal
  (`docs/spec_topics/grammar.md:138`, `docs/reference/grammar.md:247`; the
  `FnParams` production itself is the comma-separated list, `:139` / `:253`),
  and FN-1 makes the parenthesised list
  normative (`functions.md:20`), yet `fn h(p: string { 1 }` emits nothing on
  any channel and registers, which is S1's "inputs accepted that the spec
  refuses … with no diagnostic" by the letter. It is also S1 by measurement,
  which is the part that decides it: the acceptance is not inert. A registering
  theta loses program text — `fn h(a: string,` + `let x = 1` + `) { 1 }`
  registers with the `let` statement absent from `body.statements` and `h`'s
  parameter count at 5 (§Reproduction (c) c3), and `fn h(a: string,` + a
  following `fn g(): number { 2 }` registers with the second declaration gone
  (c4) — and `fn h(p: string { 1 }` registers with an empty `FnBody`, so FN-4
  (`functions.md:36`) makes `h` produce `null` where the author wrote `1`
  (a2). The corrupted arity reaches the runtime because an in-document `fn`
  call has no parse-time arity check (bug 0131, measured (g) g4), where
  `ThetaFnArityError` (`statement-executor.ts:364–367`, thrown at `:402`,
  `:495`, `production-theta-producer.ts:5903`) routes to
  `theta/runtime/internal-error`. D3 because the fix is an in-run
  parser-recovery adjudication with no settled precedent: no registered row
  covers an unclosed token (§Expected behaviour), reusing
  `theta/parse/unsupported-feature` coins another off-table `<construct>` tail
  against bug 0063's open subject, a new row is a DIAG-2 addition with
  same-commit spec edits, and the resynchronisation point sits against the
  spec's own closed continuation-trigger table (`grammar.md:203`) and the
  lexer's `single-line-if` forward scan (`lexer.ts:889–912`), both of which
  decide which inputs are silent today.
- **Kind:** defect — implementation, against a normative production, plus a
  registry gap the disposition has to answer. Three elements.
  1. **The grammar requires the closing token and the parser does not.**
     `FnDecl ::= "fn" Ident "(" FnParams? ")" (":" ReturnType)? FnBody`
     (`docs/spec_topics/grammar.md:138`; the reference mirror adds
     `SubagentMod?` and `WithClause?`, `docs/reference/grammar.md:247`), and
     `FnParams ::= FnParam ("," FnParam)* ","?` (`:139` / `:253`) derives no
     `{`, no `let`, no `fn` and no numeric literal at a `FnParam` position.
     Both mirrors state the requirement in prose as well:
     "The parameter list is parenthesised in every case — a zero-parameter
     function is written `fn f()`, never bare `fn f`" (`grammar.md:143`);
     "Parameter list always parenthesised (`fn f()`, never `fn f`)"
     (`docs/reference/grammar.md:257–258`); FN-1 — "The surface form of a `fn`
     declaration — its parenthesised parameter list, the optional
     `: ReturnType` annotation, and the `FnBody` block — is given normatively
     by the Grammar Appendix … production" (`docs/spec_topics/functions.md:20`).
     `parseFn` enforces the OPEN paren and not the CLOSE: `:2159–2168` pushes
     `theta/parse/unsupported-feature` when `(` is absent, with the comment
     "A missing `(` after the fn name is a parse error — without it a bare
     `fn f x { … }` silently parses `x` as the fn name's trailing junk and
     accepts a malformed declaration" (`:2156–2158`). The loop that follows
     (`:2171`) is `while (!this.isPunct(")") && !this.atEnd())` and its
     `)`-consuming epilogue is conditional (`:2214–2216`), so reaching EOF
     without a `)` is indistinguishable from finding one.
  2. **The lexer removes the boundary that would otherwise stop it.**
     `collapseContinuations` (`src/lexer/lexer.ts:742`) tracks bracket depth
     (`:746`, incremented at `:775–776`, decremented at `:777–781`) and
     swallows a newline run when `depth > 0` (`:766`), emitting no `stmt-sep`
     (`:767–769`). This is the spec's own first continuation trigger — "Open
     bracket without a matching close | the line ends with an unmatched `(` /
     `[` / `{`" (`docs/spec_topics/grammar.md:203`;
     `docs/reference/grammar.md:144`) — and it is correct for a balanced
     construct. Against an unbalanced one it has no floor: the whole remainder
     of the file becomes one logical line, and the parameter loop consumes it.
     Measured token stream for `fn h(a: string,` + newline + `let x = 1` +
     newline + `) { 1 }`, verbatim (§Reproduction (c)): no `stmt-sep` survives
     between the `,` and the `let`.
  3. **No registered code covers the input, so the disposition is a spec
     question.** Every row of `code-registry-parse.md` was read at HEAD (109
     `theta/parse/*` rows). The corpus has one "not closed by a matching
     token" row — `theta/parse/system-interp-unterminated` (`:105`), scoped to
     a `${` in a `system:` frontmatter value — two EOF-during-scan lexical rows
     (`unterminated-string` `:14`, `unterminated-template` `:69`), and no
     expected-token / unbalanced-bracket row of any kind. The registry is
     closed (DIAG-2, `diagnostic-shape.md:72`), so the absence is a gap and
     §Fix owns naming its disposition.
- **Related:**
  - [0139](./0139-fn-parameter-name-case-rule-unenforced.md) — **fixed
    (0.79.0)**, the origin, and the report this one is residual 4 of
    (`.pi/tmp/fixes/0139-report.md`, §Residuals item 4; item 5 records that the
    recovery paths carry no witness row). Its fix inserted the uppercase-first
    predicate into the same parameter loop (`:2191–2203`) and is the reason
    face 1's uppercase spelling now draws one diagnostic instead of none.
    **It neither caused nor closed this defect.** The commit is 21 insertions
    and 2 deletions confined to that loop (`git show d11aef29 --stat --
    src/parser/theta-document.ts`), the lowercase path is byte-unchanged, and
    the lowercase twin measured at HEAD is silent — so the pre-fix disposition
    of `fn h(P: string { 1 }` was the same `[]` the lowercase twin still
    reports (§Reproduction (a)).
  - [0124](./0124-parsetype-trailing-punctuation-leniency.md) — **open, the
    nearest report, and disjoint. Verified at HEAD, not assumed.** 0124 owns
    `parseType`'s accepted-terminator set: a trailing punctuation character
    joins the captured annotation string because `-`, `%`, `~` and nineteen
    further trailers are in no stop set, so `fn h(p: integer--)` — a
    **correctly closed** parameter list — captures `integer--` and silently
    loses seven type-layer rejections. This report's inputs are not in that
    class and 0124's are not in this one: measured side by side (§Reproduction
    (e)), `fn h(p: integer--): number { 1 }` captures ONE parameter and closes
    its list, while `fn h(p: string { 1 }` captures FOUR and never closes.
    The two mechanisms meet at exactly one point, which this report states and
    does not claim: with the `stmt-sep` suppressed, `parseType`'s FIRST stop
    (`:3002–3004`) is unreachable, so `fn h(a: string` + newline +
    `let x = 1` captures the parameter type `stringletx` (§Reproduction (c)
    c7). That is this defect propagating into 0124's function, not 0124's stop
    set admitting a new trailer — every token joined there is an ident or a
    keyword, and the capture ends at the depth-0 `=` (`:3045–3055`) exactly as
    0124 documents. 0124's §Reproduction (e) separately bounds the unfloored
    `<` / `>` depth counter and declines it in its §Non-goals; the measured row
    `fn h(p: array<string { 1 }` → param type `array<string{1}`, silent, is in
    that class and is not claimed here either.
  - [0133](./0133-field-list-discard-recovery-unsettled.md) — **open**, and the
    same unsettled question at a different production. 0133 owns
    `parseSchemaObjectBody`'s recovery (`theta-document.ts:2560` at this HEAD;
    the report cites the pre-0139 `:2534–2616`) and `skipBraceRemainder`
    (`:2645`; the report cites `:2619`), including its unbalanced-body rows where
    the recovery "consumes the rest of the file". Its measured unbalanced rows
    all carry an ill-formed field (`42: integer`) that triggers the discard;
    the well-formed spelling `schema S { a: string` at EOF is measured here
    (§Reproduction (f) f1) as silent and registering with the field intact, and
    a following statement flips it to two diagnostics (f2). **That spelling's
    disposition is 0133's, not this report's** — different function, different
    production, no shared line. Both reports ask the same design question of
    the parser (what an unbalanced open bracket is owed), which is why §Fix
    records a coordination constraint rather than a dependency.
  - [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)
    — **open, and binding on §Fix's cheapest route.**
    `placeholder-rendering-a.md:50` directs the `<construct>` renderer to "Use
    the closed token-name table below" and `:52–68` is that table;
    0063's emission-site census already lists
    `fn parameter list must be parenthesised` among the nine off-table tails it
    bounds but does not own (`docs/bugs/0063-…md:228`, citing
    `theta-document.ts:2147` — pre-0139 drift, `:2166` at HEAD). Emitting
    `theta/parse/unsupported-feature` for an unclosed list adds a tenth
    off-table tail to a surface a report already holds open.
  - [0042](./0042-schema-decl-same-line-residue-silent.md) — **fixed
    (0.52.0)**, the precedent for the opposite choice at a sibling recovery.
    Facing the same fork it registered a new code
    (`theta/parse/malformed-alias-rhs`) rather than coin a third
    `unsupported-feature` tail, and stated why: that would be "a GOV-7 / GOV-8
    table edit that would also have to reconcile the two tails already emitted
    unlisted" (quoted at `docs/bugs/0063-…md:31–34`).
  - [0131](./0131-in-document-fn-call-arity-unchecked.md) — **open**, and the
    reason the corrupted arity is not caught before execution. Measured here
    (§Reproduction (g) g4): `fn h(a: string) { 1 }` with `let z = h()` draws
    zero diagnostics and registers. A swallow that moves `h` from one parameter
    to five therefore reaches `ThetaFnArityError` at runtime rather than a
    parse diagnostic. 0131's fix would convert the runtime throw into a
    parse-time diagnostic; it would not make the diagnostic name the unclosed
    list, and it does not close this report.
  - [0134](./0134-params-shift-induced-stale-citations.md) — **open**, the
    citation-drift class. Every `src/parser/theta-document.ts` line cited here
    is post-`d11aef29` (0139's fix shifted everything at or after the old
    `:2185` by +19). A fix here inserts into the same function and shifts them
    again.
  - [0005](./0005-subagent-fn-return-annotation-misparse.md) — **fixed
    (0.14.0)**, the adjacent stop already installed in this function. It added
    `parseType(false, true)`'s depth-0 `with` stop (`:3056–3068`, called at
    `:2222`) because the return slot ran past its boundary. The same shape of
    remedy — a boundary the extent function did not have — is one of §Fix's
    routes, one production earlier.
  - [0150](./0150-fn-parameter-annotation-optional-against-grammar.md) —
    **open**, filed in this same round from the same fix report's residual 3,
    and **the third leniency in the SAME parameter loop, disjoint from this
    one.** It owns the optional type annotation: `FnParam ::= Ident ":" Type`
    (`grammar.md:140`, `docs/reference/grammar.md:254`) makes the annotation
    mandatory, yet `:2205–2208` guards it behind `if (this.isPunct(":"))` and
    both `fn h(P)` and `fn h(p)` parse. That report's input has a closing `)`;
    this one's does not. Measured overlap: none — `fn h(p { 1 }` is silent
    here for the unclosed reason with `p`'s type captured as `""`
    (§Reproduction (a) a4), which both defects touch, and either fix alone
    leaves it accepted. Whichever lands second rebases on the other's edit to
    the same loop.
- **Affected** (every citation verified at HEAD `d11aef29`, 0.79.0):
  - **The parse site** — `src/parser/theta-document.ts:2151` (`parseFn`).
    - `:2155–2158` — the comment stating the grammar rule this report holds
      against the other end of the list.
    - `:2159–2168` — the missing-`(` arm: `theta/parse/unsupported-feature`,
      severity `error`, ranged on `this.peek()`, message tail
      `fn parameter list must be parenthesised` (`:2166`). The asymmetry is
      the defect's shape: one end of the production is enforced, the other is
      not.
    - `:2169–2170` — the `(` consume, guarded by a second `isPunct("(")`.
    - **`:2171` — the defect site.**
      `while (!this.isPunct(")") && !this.atEnd())`. Two exits, `)` and EOF
      (`atEnd()` is `this.peek().kind === "eof"`, `:1707–1709`), and no
      distinction between them anywhere in the function.
    - `:2172–2183` — the `mut` arm and `checkMutModifier`'s emission at the
      modifier's range, 0139's cited precedent for a parser-leaf diagnostic in
      this loop.
    - `:2184` — `const pTok = this.advance();`. Unconditional: whatever token
      is next becomes a parameter name, with no `ident` test on the control
      path. The `ident` test at `:2191` guards only the case diagnostic.
    - `:2191–2203` — 0139's `binding-case-mismatch` arm, and the parser half of
      the duplicate.
    - `:2204–2208` — the optional `":" Type` (bug 0150's subject).
    - `:2209` — `params.push({ name: pTok.text, type: pType })`. This is where
      `{`, `1`, `}`, `let` and `x` are recorded as parameters.
    - `:2210–2212` — the comma consume; `:2214–2216` — the conditional `)`
      consume, a no-op when none arrived.
    - `:2218–2228` — the return-slot parse (`parseType(false, true)` at
      `:2227`), reached with the cursor already at EOF on every unclosed input,
      which is why `ret` is `null` in every row of §Reproduction (a).
  - `src/parser/theta-document.ts:1727–1737` — `parseBlock`. Called at
    `:2242`; at EOF its `isPunct("{")` is false, `parseForms` returns
    immediately, and the `FnBody` is `{ statements: [], tail: null }`. This is
    the empty body §Why it matters costs against `functions.md:36`.
  - **The lexer mechanism** — `src/lexer/lexer.ts:742`
    (`collapseContinuations`, called at `:124`). `:733–741` is the doc comment
    naming the closed rule and its spec anchor; `:746` the depth counter;
    `:766` `const swallow = depth > 0 || isTrailing(prev) || isLeading(next);`;
    `:767–769` the suppressed `stmt-sep`; `:774–782` the depth update, floored
    at 0 on close (`:778`) and unbounded on open. `:185–190`
    (`trailingTriggers`) and `:197–202` (`leadingTriggers`) are the other two
    triggers and are not engaged by any row below — the depth arm alone
    produces every swallow measured here.
  - **The rule that coincidentally fires, and what silences it** —
    `src/lexer/lexer.ts:889–912`, the `single-line-if` scan inside
    `contextualDiagnostics` (`:810`, called at `:125`). It walks forward from
    an `if` / `for` / `while` / `fn` head (`:812`) until `stmt-sep` or `eof`
    (`:894`) or a `{` (`:897–900`), and emits
    `theta/parse/single-line-if` when it finds no `{` (`:903–911`). Because
    the newline is suppressed, the scan crosses into the following lines: an
    unclosed list whose swallowed region contains ANY `{` satisfies the scan
    and the code does not fire. This is why the sharpest inputs are the silent
    ones and the truncated ones are not (§Reproduction (a) against (b)). The
    emission is correct for its own registered *Trigger* — "`if` / `for` /
    `while` / `fn` body is not a braced block"
    (`code-registry-parse.md:22`) — and says nothing about the parameter list.
  - **The lexer half of the duplicate** — `src/lexer/lexer.ts:876–882`, the
    `let` adjacency (with the `mut` skip at `:879–881`) calling `checkName`
    (`:814–851`), whose binding arm pushes `binding-case-mismatch` at
    `:834–841`. It is index-based over the token array and has no notion of
    enclosing construct, so a `let X` inside a swallowed region is judged
    exactly as a top-level one would be. `:885–886` is the `schema` / `enum`
    adjacency, measured firing the same way on swallowed text (§Reproduction
    (d) d4).
  - **Why the two emissions land in that order** —
    `src/diagnostics/diagnostic.ts:107–127` (`assembleDiagnostics`), a
    `(file, line, col)` sort documented stable at `:113–115`, over the group
    array at `src/parser/theta-document.ts:903–914` where `lex.diagnostics`
    (`:905`) precedes `parser.diagnostics` (`:906`). Tied on the full key, the
    lexer's copy is first.
  - **`parseType`'s stop set, reached with one stop removed** —
    `src/parser/theta-document.ts:2989` (`parseType`), `:3000` the loop,
    `:3002–3004` the `stmt-sep` stop (unreachable inside an open paren),
    `:3045–3055` the depth-0 `,` / `)` / `{` / `}` / `=` stop (what actually
    ends every capture measured here). Cited to separate this defect from bug
    0124's, not to claim the function.
  - **Registration** — `src/extension/production-composition.ts:1562`
    (`const registered = !diagnostics.some((d) => d.severity === "error")`) and
    `:2047–2054` (`hasLoadParseError`, error severity over `theta/load/*` and
    `theta/parse/*`). Every input in §Reproduction (a), (c) c3, c4 and (e)
    produces no diagnostic at all, so both gates pass.
  - **Where the corrupted arity lands** —
    `src/runtime/statement-executor.ts:364–367` (`ThetaFnArityError`, whose doc
    comment at `:356–363` states the premise this defect breaks: "Arity is a
    type-phase concern the theta grammar expects to be well-formed by execution
    time, so a mismatch reaching the runtime is a defect"), thrown at `:402`
    and `:495` and at `src/extension/production-theta-producer.ts:5903`, each
    `throw new ThetaFnArityError(fn.name, fn.params.length, expr.args.length)`
    over the same `params` array `:2209` filled. `src/runtime/tool-call.ts:442`
    names the routing to `theta/runtime/internal-error`.
  - `src/parser/theta-document.ts:726–737` — `ThetaDocument`, whose `body`
    field is documented as "The whole-file body statement-list AST the
    interpreter walks" (`:729–730`). The absent statements measured below are
    absent from that array.
  - **Spec — the productions.** `docs/spec_topics/grammar.md:138` (`FnDecl`),
    `:139` (`FnParams`), `:140` (`FnParam`), `:143` (the parenthesisation
    prose); `docs/spec_topics/functions.md:20` (FN-1), `:36` (FN-4,
    *Empty-tail body*); `docs/spec_topics/grammar.md:197–212` (§Newline
    continuation; `:199` "The trigger set is closed", `:203` the open-bracket
    row).
  - **Spec — the reference mirrors a fix must co-edit.**
    `docs/reference/grammar.md:247` (`FnDecl` with `SubagentMod?` and
    `WithClause?`), `:253` (`FnParams`), `:254` (`FnParam`), `:257–258` (the
    parenthesisation prose), `:136–162` (§Statement termination & newline
    continuation; `:144` the open-bracket row, `:160–162` the
    always-braced-body sentence naming `theta/parse/single-line-if`);
    `docs/reference/diagnostics.md:65` (`binding-case-mismatch`), `:68`
    (`single-line-if`), `:73` (`unsupported-feature`) — the file carries no
    *Trigger* column, so a trigger widening does not reach it while a new row
    does.
  - **Spec — the rows assessed, none of which covers the input.**
    `docs/spec_topics/diagnostics/code-registry-parse.md:105`
    (`system-interp-unterminated` — the corpus's only "not closed by a matching
    `}`" row, scoped to a `system:` YAML scalar); `:14`
    (`unterminated-string`) and `:69` (`unterminated-template`) — lexical
    EOF-during-scan rows over a literal, not a bracketed production; `:27`
    (`unsupported-feature`, whose `<construct>` renders from the closed table
    at `placeholder-rendering-a.md:52–68`); `:22` (`single-line-if`, whose
    *Trigger* is the fn BODY, not its parameter list); `:19`
    (`binding-case-mismatch` — the code the measured inputs do draw, whose
    *Trigger* is an identifier's first letter and which therefore says nothing
    structural).
  - **Spec — governance.**
    `docs/spec_topics/diagnostics/diagnostic-shape.md:71` (DIAG-1 — every
    author-visible diagnostic carries a registered code), `:72` (DIAG-2 — the
    registry is closed; adding a code or changing a trigger is a spec change),
    `:74` (DIAG-4 — the *Message* column is normative, rewords deferred to
    theta 2.0), `:65` (*Multi-error reporting* — the pass collects, it does not
    fast-fail);
    `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (the closure
    statement), `:50` ("Use the closed token-name table below"), `:52–68` (the
    15-row table);
    `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
    (the loads-cleanly predicate that selects the input set), `:25` (the
    diagnostic-registry carve-out).
  - **Test coverage of this defect: none.** `rg` over `tests/` for an unclosed
    `fn` parameter list returns nothing. The adjacent committed assertion is
    `tests/reserved-keyword-type-position.test.ts:483`, which pins the
    **missing-`(`** tail (`fn parameter list must be parenthesised`) through
    the registry oracle — the enforced end of the same production, and a cell a
    fix here must keep green. `tests/fn-param-name-case.test.ts` (0139's
    19-row witness) drives only closed lists.
    `tests/committed-fixture-parse-gate.test.ts` is the corpus gate and is
    blind to `.thetalib` (bug 0132).
- **Observed at:** `0.79.0` (HEAD `d11aef29`). Offline, deterministic; no live
  model, no provider. Three scratch vitest files driving the real
  `parseThetaDocument` and `lexTheta` through `tests/helpers/e2e-s1.ts`
  (`parseDoc`, `lexSrc` — the shipped front end with inert seams), plus a
  `git ls-files` census over every committed `.theta` / `.thetalib` parsed
  through the same path; written, run, deleted.

## Summary

`parseFn`'s parameter loop asks *is the next token a `)`* and *am I at EOF*
(`theta-document.ts:2171`). It never asks whether the `)` arrived. Whatever
token `this.advance()` returns at `:2184` becomes a parameter name at `:2209`,
including a `{`, a `}`, a number literal, the keyword `let` and the keyword
`fn`. The `)`-consuming epilogue (`:2214–2216`) is conditional, so an
EOF-terminated loop and a `)`-terminated loop leave the parser in the same
state and produce the same absence of diagnostics.

The lexer removes the only other boundary. `collapseContinuations`
(`lexer.ts:742`) swallows a newline run whenever bracket depth is open
(`:766`) — the spec's first continuation trigger (`grammar.md:203`), correct
for a balanced construct and unfloored against an unbalanced one. An unclosed
`(` therefore makes the rest of the file one logical line, and the parameter
loop consumes it.

Two faces, one root.

**Face 1 — the declaration loads with nothing said.** `fn h(p: string { 1 }`
reports `[]`. The body's three tokens become parameters
(`p:string`, `{:""`, `1:""`, `}:""`), the `FnBody` is empty, the theta
registers, and by FN-4 (`functions.md:36`) `h` produces `null` where the
author wrote `1`. The uppercase spelling `fn h(P: string { 1 }` reports
exactly one diagnostic — `theta/parse/binding-case-mismatch` at the parameter
name, bug 0139's new code — and no structural diagnostic at all. The lowercase
twin is the cleaner statement of the root, and it is also the pre-0139
disposition of the uppercase one: 0139's commit is confined to the case
predicate, so before it both spellings reported `[]` and both registered.

**Face 2 — the following statement is swallowed.** `fn h(a: string,` with
`let x = 1` on the next line and `) { 1 }` on the one after reports `[]`,
registers, and records five parameters — `a:string`, `let`, `x`, `=`, `1`. The
`let` statement is gone from `body.statements`, and `h`'s arity has moved from
1 to 5 with no diagnostic on any channel. A following `fn g(): number { 2 }` is
absorbed the same way, taking `h`'s return annotation and body with it. Because
an in-document `fn` call has no parse-time arity check (bug 0131), a correct
call `h("q")` then reaches `ThetaFnArityError`
(`statement-executor.ts:364–367`) at runtime.

**The duplicate is a consequence, and it is bounded.** When the swallowed text
is a `let X`, `binding-case-mismatch` fires twice at one range: once from the
lexer's `let` adjacency (`lexer.ts:876–882`), which is index-based and has no
notion of enclosing construct, and once from the parser loop
(`theta-document.ts:2191–2203`), which sees `X` as a parameter name. The two
tie on `(file, line, col)` and `assembleDiagnostics`' stable sort
(`diagnostic.ts:113–115`) puts the lexer's first. **It never changes a
registration outcome** — but not for the reason the 0139 fix report gives.
That report bounds it as "every duplicate-producing input already carries an
`E` from another source (here `theta/parse/single-line-if`)". Measured, that
is false: `fn h(a: string,` + `let X = 1` + `) { 1 }` draws exactly two
`binding-case-mismatch` and nothing else (§Reproduction (d) d1). The bound
that holds is narrower and sufficient: the duplicated code is itself `E`, so
`hasLoadParseError` (`production-composition.ts:2047–2054`) denies registration
on the first emission and the second changes no observable but the count.

The claim of this report is the silent structural acceptance. The duplicate is
recorded because a fix must decide what to do with it.

## Reproduction

Offline at HEAD `d11aef29`. Every fixture is `---\nmode: prompt\n---\n`
frontmatter plus the body shown, so body line 1 is file line 4; `.thetalib`
rows are noted. Each is parsed through `parseThetaDocument` via
`tests/helpers/e2e-s1.ts`'s `parseDoc`. `diags` is the whole unfiltered
diagnostic list; `params` is the recorded `{name, type}` pairs with the count;
`stmts` is `body.statements`; `registered` is
`!diagnostics.some(d => d.severity === "error")`, the composition root's own
gate (`production-composition.ts:1562`).

### (a) Face 1 — the unclosed list, `{` present, zero structural diagnostics

```
@@ a1  fn h(P: string { 1 }
   diags  [E theta/parse/binding-case-mismatch @4:6-4:7
             :: binding name must start with a lowercase letter or _]
   params 4  ["P":"string", "{":"", "1":"", "}":""]   ret=null
   body   0 statements, tail=null
   stmts  ["fn"]                                      registered=false

@@ a2  fn h(p: string { 1 }                                   — THE ROOT, STATED CLEANLY
   diags  []
   params 4  ["p":"string", "{":"", "1":"", "}":""]   ret=null
   body   0 statements, tail=null
   stmts  ["fn"]                                      registered=TRUE

@@ a3  fn h(p: string: number { 1 }
   diags  []      params 4  ["p":"string:number", "{":"", "1":"", "}":""]
   registered=TRUE

@@ a4  fn h(p { 1 }
   diags  []      params 4  ["p":"", "{":"", "1":"", "}":""]
   registered=TRUE

@@ a5  fn h(p: string { 1 }  /  let y = 2
   diags  []
   params 8  ["p":"string", "{":"", "1":"", "}":"", "let":"", "y":"", "=":"", "2":""]
   stmts  ["fn"]   — the following statement is gone      registered=TRUE

@@ a6  fn h(p: string { 1 }  /  let z = h("q")
   diags  []
   params 10 ["p":"string", "{":"", "1":"", "}":"", "let":"", "z":"", "=":"",
              "h":"", "(":"", "\"q\"":""]
   stmts  ["fn"]   — the call site is gone too            registered=TRUE

@@ a7  .thetalib:  fn h(p: string { 1 }
   diags  []      params 4                               registered=TRUE

@@ a8  subagent fn g(p: string { 1 }
   diags  []      params 4                               registered=TRUE

@@ a9  fn h(mut P: string { 1 }
   diags  [E mut-on-immutable-context @4:6-4:9, E binding-case-mismatch @4:10-4:11]
   params 4                                              registered=false
```

a2 is the report's claim in one line: a declaration the grammar does not derive
loads with **zero diagnostics on every channel** and registers. a1 differs from
it in one character and draws one diagnostic, about that character. a5 and a6
show the acceptance is not confined to the declaration — the rest of the file
joins the parameter list. a7 and a8 show the route is not `.theta`-specific and
not ordinary-`fn`-specific.

### (b) Face 1 truncated at EOF — a different code fires, about a different thing

```
@@ b1  fn h(P: string                    (no trailing newline)
   diags  [E theta/parse/single-line-if @4:1-4:3
             :: single-line body not permitted; wrap in { ... },
           E theta/parse/binding-case-mismatch @4:6-4:7]
   params 1  ["P":"string"]   ret=null   body 0 stmts    registered=false

@@ b2  fn h(p: string                    (no trailing newline)
   diags  [E theta/parse/single-line-if @4:1-4:3]
   params 1  ["p":"string"]                              registered=false

@@ b3  fn h(
   diags  [E theta/parse/single-line-if @4:1-4:3]
   params 0                                              registered=false

@@ b4  fn h(p: string\n
   diags  [E theta/parse/single-line-if @4:1-4:3]        registered=false

@@ b5  fn h(a: string,
   diags  [E theta/parse/single-line-if @4:1-4:3]
   params 1  ["a":"string"]                              registered=false
```

The loop's EOF exit is reached in every row and emits nothing. What fires is
the lexer's `single-line-if` scan (`lexer.ts:889–912`), which found no `{`
before EOF. It is correct for its own *Trigger* — the fn body is not a braced
block, because there is no body — and it names neither the parameter list nor
the missing `)`. Comparing b2 with a2 isolates the mechanism exactly: the same
unclosed list is refused when the file happens to contain no `{` afterwards and
accepted when it does.

### (c) Face 2 — the swallow, and what it deletes

Token stream for `fn h(a: string,` + newline + `let x = 1` + newline +
`) { 1 }`, verbatim from `lexSrc`:

```
punct:"--" punct:"-" ident:"mode" punct:":" ident:"prompt" stmt-sep:"\n"
punct:"--" punct:"-" keyword:"fn" ident:"h" punct:"(" ident:"a" punct:":"
keyword:"string" punct:"," keyword:"let" ident:"x" punct:"=" number:"1"
punct:")" punct:"{" number:"1" punct:"}" stmt-sep:"\n" eof:""
```

Control, with the paren closed (`fn h(a: string)` + newline + `let x = 1`):

```
… punct:"(" ident:"a" punct:":" keyword:"string" punct:")" stmt-sep:"\n"
keyword:"let" ident:"x" punct:"=" number:"1" stmt-sep:"\n" eof:""
```

One `stmt-sep` present in the control, none in the defect. Parsed:

```
@@ c1  fn h(a: string,  /  let X = 1
   diags  [E single-line-if @4:1-4:3,
           E binding-case-mismatch @5:5-5:6, E binding-case-mismatch @5:5-5:6]
   params 5  ["a":"string", "let":"", "X":"", "=":"", "1":""]
   stmts  ["fn"]                                         registered=false

@@ c2  fn h(a: string,  /  let x = 1
   diags  [E single-line-if @4:1-4:3]
   params 5  ["a":"string", "let":"", "x":"", "=":"", "1":""]
   stmts  ["fn"]                                         registered=false

@@ c3  fn h(a: string,  /  let x = 1  /  ) { 1 }        — REGISTERS, STATEMENT DELETED
   diags  []
   params 5  ["a":"string", "let":"", "x":"", "=":"", "1":""]
   ret=null   body 0 statements, tail=number (the `1`)
   stmts  ["fn"]   — `let x = 1` is absent               registered=TRUE

@@ c4  fn h(a: string,  /  fn g(): number { 2 }         — REGISTERS, DECLARATION DELETED
   diags  []
   params 4  ["a":"string", "fn":"", "g":"", "(":""]
   ret="number"   body 0 statements, tail=number (the `2`)
   stmts  ["fn h"]  — `fn g` is absent; `h` took its annotation and body
                                                         registered=TRUE

@@ c5  fn h(a: string,  /  let x = 1  /  ) { 1 }  /  let z = h("q")
   diags  []
   params 5   stmts ["fn h", "let z"]                    registered=TRUE
   — the call site survives (depth returned to 0 at the `)`), and calls a
     five-parameter `h` with one argument

@@ c6  fn h(a: string,  /  42
   diags  [E single-line-if @4:1-4:3]
   params 2  ["a":"string", "42":""]                     registered=false

@@ c7  fn h(a: string  /  let x = 1                      — no comma; the type absorbs
   diags  [E single-line-if @4:1-4:3]
   params 3  ["a":"stringletx", "=":"", "1":""]          registered=false

@@ c8  fn h(a: string { 1 }  /  let X = 2
   diags  [E binding-case-mismatch @5:5-5:6, E binding-case-mismatch @5:5-5:6]
   params 8  ["a":"string", "{":"", "1":"", "}":"",
              "let":"", "X":"", "=":"", "2":""]          registered=false
```

c3 and c4 are the report's severity: a theta that **registers** with author
program text silently removed. c7 shows the interaction with `parseType`:
with the `stmt-sep` suppressed, that function's first stop (`:3002–3004`) is
unreachable and the capture runs through the keyword `let` and the ident `x`
to the depth-0 `=` (`:3045–3055`), yielding the parameter type `stringletx`.

### (d) The duplicate, and the bound

```
@@ d1  fn h(a: string,  /  let X = 1  /  ) { 1 }
   diags  [E theta/parse/binding-case-mismatch @5:5-5:6
             :: binding name must start with a lowercase letter or _,
           E theta/parse/binding-case-mismatch @5:5-5:6
             :: binding name must start with a lowercase letter or _]
   — TWO, and NOTHING ELSE                               registered=false

@@ d2  lowercase twin: fn h(a: string,  /  let x = 1  /  ) { 1 }
   diags  []                                             registered=TRUE

@@ d3  fn h(a: string,  /  let mut X = 1  /  ) { 1 }
   diags  [E mut-on-immutable-context @5:5-5:8,
           E binding-case-mismatch @5:9-5:10, E binding-case-mismatch @5:9-5:10]
   — the lexer's `mut` skip (lexer.ts:879–881) advances `checkName` past the
     modifier onto `X`; the parser's `mut` arm (theta-document.ts:2172–2183)
     consumes it, emits `mut-on-immutable-context` ONCE, and its own case test
     then lands on the same `X`                          registered=false

@@ d4  fn h(a: string,  /  schema s { b: string }  /  ) { 1 }
   diags  [E theta/parse/schema-case-mismatch @5:8-5:9]
   params 6  ["a":"string", "schema":"", "s":"", "{":"", "b":"string", "}":""]
   — the schema/enum adjacency (lexer.ts:885–886) judges swallowed text too;
     ONE here, because the parser loop's case arm tests binding case, not type
     case, and `s` is lowercase-first                    registered=false
```

d1 refutes the 0139 fix report's stated bound. Its example carried
`theta/parse/single-line-if` because that example had no `{` after the swallow;
add one and the two duplicated `binding-case-mismatch` rows are the entire
list. The bound that survives: the code is `E`, so registration is denied by
either emission alone, and the duplicate changes the diagnostic **count** and
nothing else. d2 is the same input one character apart and registers.

### (e) Bug 0124's site, measured beside this one

```
@@ e1  fn h(p: integer--): number { 1 }        — 0124's, CLOSED list
   diags  []      params 1  ["p":"integer--"]   ret="number"
   body tail=number                                      registered=TRUE

@@ e2  let a: integer-- = 3                    — 0124's, no list at all
   diags  []      ann "integer--"                        registered=TRUE

@@ e3  fn h(p: string { 1 }                    — THIS report's, UNCLOSED list
   diags  []      params 4                     ret=null   body empty
                                                         registered=TRUE

@@ e4  fn h(p: array<string { 1 }              — 0124 §Reproduction (e)'s class
   diags  []      params 1  ["p":"array<string{1}"]      registered=TRUE
   — the unfloored `<`/`>` depth counter inside parseType; 0124 bounds it and
     declines it, and so does this report (§Non-goals)
```

Different inputs, different captures, different consequences: e1 records one
well-formed parameter whose TYPE is junk (0124's seven lost type-layer rows);
e3 records four parameters, three of which are the function's own body. No
input is in both classes, and neither fix reaches the other's rows — a
terminator-set change in `parseType` does not supply the missing `)`, and a
`)` check in `parseFn` does not narrow `parseType`'s accepted trailers.

### (f) Adjacent structural sites, measured and NOT owned here

```
@@ f1  schema S { a: string                    — 0133's site
   diags  []      stmts ["schema S fields=[{a: string}]"]   registered=TRUE
@@ f2  schema S { a: string  /  fn g(): number { 1 }
   diags  [E empty-schema-body @4:1-5:21 :: 'S' has no fields; an empty schema
             cannot be validated.,
           E unsupported-feature @5:1-5:3 :: unsupported syntactic feature:
             schema fields must be comma-separated]
   stmts  ["schema S fields=null"]  — `fn g` is gone         registered=false
@@ f3  schema S { a: string }                  CONTROL
   diags  []      stmts ["schema S fields=[{a: string}]"]    registered=TRUE

@@ f4  fn h(p: string)) { 1 }                  — the EXTRA-paren direction
   diags  [E unsupported-feature @4:16-4:17 :: … stray ')' in statement position,
           E bare-object-literal @4:18-4:23]
   params 1                                                  registered=false

@@ f5  let a = f(1                             — an unclosed CALL paren
   diags  [E unknown-identifier @4:9-4:12 :: unknown identifier 'f']
   stmts  ["let a"]                                          registered=false
   — nothing names the unclosed `(` here either; the only code is about `f`
```

f1/f2/f3 are `parseSchemaObjectBody`'s, bug 0133's. f4 shows the surplus-token
direction is reported (`stray ')' in statement position`) while the missing
one is not. f5 shows the expression-position analogue draws no structural code
either; it is recorded to bound the class and is not claimed.

### (g) Controls that must not move, and the arity control

```
@@ g1  fn h(p: string): number { 1 }   diags []  params 1  ret="number"  registered=TRUE
@@ g2  fn h(p: string) { 1 }           diags []  params 1  tail=number   registered=TRUE
@@ g3  fn h(a: string, b: string) { 1 } diags [] params 2               registered=TRUE
@@ g4  fn h(a: string) { 1 }  /  let z = h()          — WRONG ARITY, in-document call
   diags  []                                                registered=TRUE
   — bug 0131: no parse-time arity check, so a swallow-corrupted arity is not
     caught before execution
@@ g5  fn h(): number { 1 }            diags []  params 0                registered=TRUE
@@ g6  fn h(P: string) { 1 }           diags [E binding-case-mismatch @4:6-4:7]
   — 0139's fix, closed list; the case code and nothing else     registered=false
@@ g7  subagent fn g(p: string) with { model: "x" } { 1 }
   diags  []                                                registered=TRUE
@@ g8  fn h p: string { 1 }            — the ENFORCED end of the same production
   diags  [E unsupported-feature @4:6-4:7 :: unsupported syntactic feature:
             fn parameter list must be parenthesised,
           E unknown-identifier @4:6-4:7, E unsupported-feature @4:7-4:8
             :: … stray ':' in statement position,
           E bare-object-literal @4:16-4:21]                  registered=false
```

g8 against a2 is the asymmetry in one pair: the missing `(` is reported at the
position it is missing from; the missing `)` is not reported at all.

### (h) Committed-corpus census

`git ls-files -- '*.theta' '*.thetalib'` lists **34** files. Parsed through the
real path they declare **4** `fn` declarations, and **0** have a parameter whose
recorded name fails `[A-Za-z_][A-Za-z0-9_]*` — the shape every swallowed token
produces. No committed fixture is in this report's class, so none changes
disposition when a fix lands, and `tests/committed-fixture-parse-gate.test.ts`
never meets one of these inputs. Its blindness to `.thetalib` (bug 0132) does
not affect the count: the split is 32 `.theta` and 2 `.thetalib`, and both
`.thetalib` files were walked explicitly here.

Reading the tables:

- **(a) is the claim.** a2 is a structurally malformed declaration loading with
  zero diagnostics and registering. a1 is the same declaration with one
  character changed, drawing one diagnostic about that character.
- **(b) is the boundary.** The only code that ever fires on an unclosed list is
  the lexer's `single-line-if`, it fires for its own unrelated reason, and it
  is silenced by any `{` in the swallowed region.
- **(c) is the cost.** c3 and c4 register with author statements deleted.
- **(d) bounds the duplicate** and corrects the bound the 0139 fix report gave.
- **(e) is the duplicate separation from bug 0124**, measured in both
  directions.
- **(f) bounds the class** without claiming bug 0133's production or the
  expression-position analogue.
- **(h) means the GOV-15 question is entirely about author files outside the
  tree.**

## Expected behaviour

Defined for what the text must be; undefined for what happens when it is not.

- **The closing `)` is required.** `FnDecl ::= "fn" Ident "(" FnParams? ")"
  (":" ReturnType)? FnBody` (`docs/spec_topics/grammar.md:138`;
  `docs/reference/grammar.md:247` adds `SubagentMod?` and `WithClause?`). The
  `")"` terminal is not optional and carries no alternative. `grammar.md:143`
  and `docs/reference/grammar.md:257–258` state it again in prose, and FN-1
  (`functions.md:20`) makes the Grammar Appendix production normative for the
  surface form.
- **A `FnParam` is `Ident ":" Type`.** `grammar.md:140`,
  `docs/reference/grammar.md:254`. `{`, `}`, `1`, `let`, `fn`, `(` and `"q"`
  are derivable from `Ident` under no reading — `lexical.md:13` gives
  `Ident` as `[A-Za-z_][A-Za-z0-9_]*` and `:20` reserves `let` and `fn`
  against identifier position. §Reproduction (a) a5 records seven such tokens
  beside the one real parameter, and a6 records nine; both functions register.
  That asserts a production the grammar does not have.
- **The newline suppression is correct and is not the thing to change.** The
  open-bracket continuation trigger is spec'd, closed, and stated identically
  in both mirrors (`grammar.md:199`, `:203`; `docs/reference/grammar.md:140`,
  `:144`). It is written for a bracket that closes. The spec says nothing
  about a bracket that does not, which is why §Fix's resynchronisation
  question is a decision and not a lookup.
- **No registered row covers the input.** Five rows were assessed at HEAD.
  `theta/parse/system-interp-unterminated` (`code-registry-parse.md:105`) is
  the corpus's only "not closed by a matching `}`" row and is scoped to a
  `${` inside a `system:` YAML scalar. `theta/parse/unterminated-string`
  (`:14`) and `theta/parse/unterminated-template` (`:69`) are lexical
  EOF-during-scan rows over literals, not bracketed productions.
  `theta/parse/single-line-if` (`:22`) triggers on the fn BODY not being a
  braced block; it does fire on the truncated rows and says nothing about the
  parameter list. `theta/parse/unsupported-feature` (`:27`) renders
  `<construct>` from the closed 15-row table at
  `placeholder-rendering-a.md:52–68`, which contains no cell for this input —
  and whose over-statement is bug 0063's open subject. The registry is closed
  (DIAG-2, `diagnostic-shape.md:72`), so the absence is a spec gap and naming
  its disposition is this report's deliverable.
- **What is not open.** Silence plus a parameter list containing the function's
  own body satisfies no reading of the corpus. Either the input is refused with
  a registered code and the theta does not register, or it is admitted — and if
  it is admitted, some sentence has to say what `fn h(p: string { 1 }` *means*,
  which no sentence does, and what became of the statements it deleted, which
  no sentence contemplates. The measured state is the third possibility no page
  covers: a malformed declaration accepted, its body reinterpreted as
  parameters, its arity changed, and the file's remaining statements removed
  from the AST the interpreter walks.

## Actual behaviour / root cause

Three components compose. None of the three is individually surprising.

**1. The loop has two exits and cannot tell them apart.** `parseFn`'s
parameter loop is `while (!this.isPunct(")") && !this.atEnd())`
(`theta-document.ts:2171`). Every iteration takes the next token
unconditionally (`:2184`), optionally reads a `":" Type` (`:2204–2208`), and
pushes a `FnParam` (`:2209`). The epilogue that consumes the `)` is
conditional (`:2214–2216`). Nothing between `:2171` and `:2216` records which
exit was taken, and nothing after it asks. Contrast the OPEN paren twelve lines
earlier, where absence is tested and reported (`:2159–2168`).

**2. The lexer has removed the statement boundary.** `collapseContinuations`
(`lexer.ts:742`) counts `(` / `[` / `{` up (`:775–776`) and `)` / `]` / `}`
down with a floor at zero (`:777–781`), and swallows the newline run whenever
`depth > 0` (`:766–769`). An unclosed `(` leaves `depth` at 1 or more for the
remainder of the token stream, so no `stmt-sep` is produced again in the file.
The measured token stream in §Reproduction (c) shows this directly: the
control has a `stmt-sep` where the defect has none. This is not a lexer defect
— it is `grammar.md:203` implemented exactly — but it is what makes the loop's
missing test consequential rather than local. Without it, the loop would run
to a `stmt-sep`-terminated form; with it, the loop runs to EOF or to a `)`
belonging to something else.

**3. The one rule that would have caught it is silenced by the same
suppression.** `contextualDiagnostics`' single-line-body scan
(`lexer.ts:889–912`) walks forward from the `fn` head until `stmt-sep`, `eof`
(`:894`) or `{` (`:897–900`). The suppression removes the `stmt-sep`, so the
scan crosses the swallowed region; any `{` in it — the function's own body
brace, a following `fn`'s brace, a following schema's brace — sets `braced` and
the code does not fire (`:903`). The rows that DO draw it (§Reproduction (b),
c1, c2, c6, c7) are exactly the rows with no `{` anywhere after the `fn`. That
is why `fn h(p: string { 1 }` is silent and `fn h(p: string` is not, and it is
why the silent case is the ordinary one: a real author's file has braces in it.

**What reaches the AST.** `params` holds one entry per consumed token
(`:2209`), so `h`'s arity is the number of tokens swallowed. The `FnBody` is
whatever `parseBlock` (`:1727–1737`) finds at the cursor, which at EOF is
`{ statements: [], tail: null }`. Statements consumed as parameters never
reach `body.statements` — the array documented as "the whole-file body
statement-list AST the interpreter walks" (`:729–730`).

**Why the case code duplicates.** The lexer's dispatch is index-based over the
flat token array: at every `let` keyword it calls `checkName` on the following
token (`lexer.ts:876–882`, `:814–851`), with no notion of enclosing construct
and no consultation of paren depth. The parser's arm (`:2191–2203`) tests the
token it has taken as a parameter name. A swallowed `let X` is both. The
two carry the same code, file, range and message, tie on
`assembleDiagnostics`' `(file, line, col)` key
(`src/diagnostics/diagnostic.ts:116–126`), and the stable sort documented at
`:113–115` puts the lexer's group (`theta-document.ts:905`) ahead of the
parser's (`:906`).

**Why registration is not the backstop.** `hasLoadParseError`
(`production-composition.ts:2047–2054`) needs one error-severity
`theta/load/*` or `theta/parse/*` diagnostic, and the gate at `:1562` needs
one error of any code. §Reproduction (a) a2 and (c) c3/c4 produce none.

## Why it matters

- **A registering theta loses program text with no diagnostic on any channel.**
  §Reproduction (c) c3: the author's `let x = 1` is absent from
  `body.statements`. c4: an entire second `fn` declaration is absent, and the
  first function has silently adopted its return annotation and body. a5/a6:
  everything after the unclosed list is absorbed. There is no warning, no
  system note, no stderr line — the diagnostic list is empty, so neither arm of
  `makeLoadEmit` (`production-composition.ts:191–212`) runs: not the
  error-severity `ctx.ui.notify` (`:193–195`), not the no-UI stderr mirror
  (`:208–210`).
- **The declared function computes something else.** §Reproduction (a) a2:
  `fn h(p: string { 1 }` registers with an EMPTY `FnBody`, and FN-4
  (`functions.md:36`) states that a body with no tail expression "has inferred
  return type `null` … and produces the literal `null` as its final value".
  The author wrote a function returning `1` and got one returning `null`.
- **The arity changes, and the failure surfaces as an internal error.** c3
  takes `h` from one parameter to five. No parse-time arity check exists for an
  in-document `fn` call (bug 0131, measured g4), so a correct call site reaches
  `ThetaFnArityError` (`statement-executor.ts:364–367`, thrown at `:402`,
  `:495`, `production-theta-producer.ts:5903`) and routes to
  `theta/runtime/internal-error` (`tool-call.ts:442`). That class's own doc
  comment states the premise this defect breaks: "Arity is a type-phase concern
  the theta grammar expects to be well-formed by execution time, so a mismatch
  reaching the runtime is a defect".
- **The failure mode is invisible in the direction an author would look.** The
  missing character is a `)`; the reported code, when anything is reported at
  all, is either about a parameter's capitalisation (a1) or about the function
  body not being braced (b2) — and the body IS braced in the input the author
  actually typed. Nothing points at the parameter list.
- **The silent inputs are the realistic ones.** §Reproduction (b) shows the
  only code that ever fires needs the file to contain no `{` after the `fn`.
  Every input measured with a brace after the head — the function's own body,
  a following declaration, a following schema — is silent.
- **It is one keystroke away from correct source.** Every fixture in
  §Reproduction (a) and (c) is a well-formed declaration minus one `)`. The
  committed corpus is clean (§Reproduction (h)), so this costs authors, not
  the repository.
- **The registered code that does fire, fires twice.** §Reproduction (d) d1:
  two `binding-case-mismatch` rows at one range, which
  `diagnostic-shape.md:65`'s "complete list in one `pi.sendMessage` call"
  renders as two identical lines. No sentence in the corpus fixes an intra-site
  count for this row, and the count is not what makes this report — but a fix
  touching the parameter loop's case arm decides it either way.

## Non-goals

- **Choosing the disposition.** This report pins the constraints; §Fix
  enumerates the routes and selects none. The run adjudicates.
- **`parseType`'s accepted-terminator set.** Bug
  [0124](./0124-parsetype-trailing-punctuation-leniency.md)'s, at all five of
  its call sites. Measured beside this defect (§Reproduction (e)) and separated
  in both directions: 0124's inputs close their parameter list, these do not.
  The one interaction — `parseType`'s `stmt-sep` stop (`:3002–3004`) being
  unreachable inside an open paren, giving the capture `stringletx` (c7) — is
  this defect reaching that function, not that function admitting a new
  trailer, and it disappears when the `)` is present.
- **The `<` / `>` depth counter inside `parseType`** (`fn h(p: array<string { 1 }`
  → `array<string{1}`, silent). Bug 0124 §Reproduction (e) bounds it and its
  §Non-goals declines it; so does this report.
- **The `fn` parameter-name case rule.** Bug
  [0139](./0139-fn-parameter-name-case-rule-unenforced.md)'s, **fixed
  (0.79.0)**. Its emission is correct on every row measured here; it is cited
  because it is the only code these inputs draw and because its parser-side arm
  is one half of the duplicate. Nothing here reopens it.
- **The optional `fn` parameter type annotation.** Bug
  [0150](./0150-fn-parameter-annotation-optional-against-grammar.md)'s, filed
  in this same round, the third leniency in the
  same loop at `:2204–2208`. `fn h(p { 1 }` (§Reproduction (a) a4) is in both
  reports' neighbourhood and is silent for this report's reason with a `""`
  type for that one's; neither fix alone accepts or refuses it differently.
- **`parseSchemaObjectBody`'s recovery and the unclosed schema body.** Bug
  [0133](./0133-field-list-discard-recovery-unsettled.md)'s. Measured here as
  §Reproduction (f) f1–f3 to bound the class; the well-formed-field spelling
  `schema S { a: string` at EOF is not among 0133's measured rows, and its
  disposition is that report's §Fix's, not this one's.
- **The unclosed call paren in expression position** (`let a = f(1`,
  §Reproduction (f) f5). The same absence at a different production, drawing no
  structural code either. Recorded to bound the class; unfiled and not claimed.
- **The `<construct>` table's over-statement.** Bug
  [0063](./0063-two-unsupported-feature-tails-missing-from-construct-table.md)'s,
  including the `fn parameter list must be parenthesised` tail already in its
  census. Binding on §Fix's reuse route; not repaired here.
- **In-document `fn` call arity.** Bug
  [0131](./0131-in-document-fn-call-arity-unchecked.md)'s. Measured as the
  reason a corrupted arity reaches the runtime; its fix does not name the
  unclosed list and does not close this.
- **The intra-site diagnostic count as a general question.** Bug
  [0147](./0147-arg-mismatch-diagnostic-count-diverges-by-surface.md)'s
  subject, and bug [0129](./0129-empty-object-field-type-draws-two-diagnostics.md)'s
  from the other direction. This report records one duplicate at one range and
  its bound; a general multiplicity rule is not proposed.
- **Induced citation drift.** A fix here inserts into
  `src/parser/theta-document.ts` inside `parseFn` and shifts every citation
  below it, bug [0134](./0134-params-shift-induced-stale-citations.md)'s
  adjudicated class. Disclosed, not chased.

## Fix

The subject is a missing structural diagnostic, so every route below is defined
by what an unclosed `fn` parameter list reports and where the parser resumes.
None is selected here.

**Shared constraints — every route satisfies all six.**

1. **The `)`-present path stays byte-identical.** Every row of §Reproduction
   (g) is a closed list and must keep its exact diagnostic list, its parameter
   count and its registration outcome. g6 in particular pins bug 0139's
   emission at `@4:6–4:7`, and `tests/fn-param-name-case.test.ts`'s 19 rows are
   all closed lists asserted whole-list.
2. **The enforced end of the production keeps its behaviour.**
   `tests/reserved-keyword-type-position.test.ts:483` pins the missing-`(`
   tail `fn parameter list must be parenthesised` through the registry oracle.
   A route that changes the missing-`)` report must state whether the two ends
   report the same way; if it unifies them, that cell moves and the change is
   an authorised assertion edit, not a silent one.
3. **DIAG-1 and DIAG-2 bind the code.** Any emission carries a registered code
   (`diagnostic-shape.md:71`); adding a row or changing a *Trigger* is a spec
   change landing in the same commit, with the
   `docs/reference/diagnostics.md` mirror co-edited (`:72`). DIAG-4 (`:74`)
   forbids rewording an existing *Message* inside theta 1.x, and any witness
   sources expected strings from the registry through `registryMessage`.
4. **GOV-15 is discharged from a measured sweep, not from assumption.** The
   committed corpus is clean today (§Reproduction (h): 34 files, 4 `fn`
   declarations, 0 offenders), so the loads-cleanly input set
   (`source-language-stability.md:9`) contains no file this report's emission
   would newly refuse — but the addition still sits inside the
   diagnostic-registry carve-out (`:25`) and the sweep must be re-run at the
   fix's HEAD. Bug [0132](./0132-committed-fixture-parse-gate-blind-to-thetalib.md)
   binds on how: the committed-fixture parse gate does not walk `.thetalib`, so
   the sweep walks it explicitly.
5. **The newline-continuation rule is not edited.** `grammar.md:199` calls the
   trigger set closed and `:203` is the open-bracket row, mirrored at
   `docs/reference/grammar.md:144`. A route may add a parser-side boundary; it
   may not make the lexer emit a `stmt-sep` at depth > 0 without a spec change
   that both mirrors carry, and that change would reach every bracketed
   construct in the language.
6. **No committed test asserts any row of §Reproduction (a)–(f).** Every route
   therefore needs its own witness cells to become falsifiable, and no route
   moves an already-asserted byte except as constraint 2 describes.

**Decision 1 — where the emission goes.**

- **At the loop's EOF exit** (`theta-document.ts:2171`, after the `while`).
  Smallest change: test which exit was taken and emit when it was EOF. Ranges
  naturally on `this.peek()` (the `eof` token) or on the opening `(`, which
  must be captured — `:2170` currently discards the token `advance()` returns.
  Catches every row of §Reproduction (b) and every unclosed row that runs to
  EOF, which is all of §Reproduction (a) and (c) except c3, c4 and c5.
- **At a token the grammar cannot derive at a `FnParam` position** — test
  `pTok.kind` at `:2184` before pushing at `:2209`, refusing anything that is
  not `ident` (or `keyword`, whose own gap is bug
  [0148](./0148-reserved-keyword-fn-parameter-position-silent.md)'s). Catches
  c3, c4 and c5 as well, which the EOF test cannot: those
  three DO find a `)` — not their own. This is the route that reaches the
  registering rows, and it is therefore the one the severity turns on.
- **Both.** The two catch disjoint row sets and neither subsumes the other.
  A route claiming only one must say which rows it leaves silent.

**Decision 2 — where the parser resynchronises.**

Left unresolved, the loop consumes the file. The candidates, each measurable
against §Reproduction (c):

- **Break at the first token the grammar cannot derive** and leave the cursor
  on it, so the `fn` declaration ends and `parseForms` re-enters at the
  statement the author wrote. Under this, c3's `let x = 1` returns to
  `body.statements`. It also means the `{` of a2 becomes the `FnBody` rather
  than a parameter, which is what an author means.
- **Break at EOF only**, leaving the swallow intact and reporting it. Cheapest,
  and it leaves c3/c4 registering with statements deleted unless Decision 1
  takes its second arm.
- **A brace-aware skip to the next plausible statement start**, the shape
  `skipBraceRemainder` (`:2645` at this HEAD; bug 0133 cites the pre-0139
  `:2619`) takes for schema bodies. Bug 0133 holds that function's disposition
  open; a route reaching for it coordinates with that report rather than
  re-deciding it.

Whatever is chosen, the change is observable as which statements survive in
`body.statements`, so the witness asserts the statement list and not only the
diagnostics.

**Decision 3 — reuse a registered row, or add one.**

- **Reuse `theta/parse/unsupported-feature`** (`code-registry-parse.md:27`), as
  the missing-`(` arm twelve lines earlier already does. No DIAG-2 engagement
  and the symmetry with `:2159–2168` is immediate. **Cost:** the `<construct>`
  rendering vocabulary is a closed 15-row table
  (`placeholder-rendering-a.md:50`, `:52–68`) and this adds a twelfth
  off-table emission site to a surface bug 0063 holds open at eleven. Bug 0042
  faced the same fork at a
  sibling recovery and went the other way, recording that a third tail "would
  also have to reconcile the two tails already emitted unlisted".
- **Reuse `theta/parse/single-line-if`** (`:22`). Rejected on its own
  *Trigger*: it judges whether the fn BODY is a braced block, which is a
  different proposition, and it already fires correctly on the truncated rows.
  Widening it would make one code mean two things and would move
  `tests/reserved-keyword-type-position.test.ts`'s cells.
- **Add a registered row** — a DIAG-2 addition (`diagnostic-shape.md:72`) with
  its `docs/reference/diagnostics.md` row in the same commit. The nearest
  shape precedent in the registry is
  `theta/parse/system-interp-unterminated` (`:105`, "`${` in a `system:` value
  is not closed by a matching `}` before the YAML scalar ends"), which is
  construct-specific rather than a general expected-token row. A route must
  decide the row's SCOPE: `fn` parameter lists alone, or every unbalanced
  bracket — the latter reaches §Reproduction (f) f5 and bug 0133's production
  and needs both reports' agreement. A general row has to state its own
  *Message* placeholders under `placeholder-rendering-a.md`'s closure rule
  (`:7`), which is a GOV-7 / GOV-8 surface.

**Decision 4 — the duplicate.**

§Reproduction (d) d1 measures two `binding-case-mismatch` at one range with no
other diagnostic, so the 0139 fix report's bound ("every duplicate-producing
input already carries an `E` from another source") does not hold and must not
be relied on. The bound that does hold: the code is `E`, registration is denied
by either emission, and only the count differs.

- **Do nothing.** Admissible on the measured bound. A Decision-2 route that
  resynchronises before the `let` removes the parser-side emission as a side
  effect for c1/c8 anyway, since the token is no longer a parameter — measure
  this rather than assume it.
- **Skip in the parser what the lexer already judged.** The parser arm
  (`:2191–2203`) would need to know the token was reached through an unclosed
  list, or the lexer arm (`:876–882`) would need paren-depth awareness it does
  not have and that `contextualDiagnostics`' scope note (`:806–808`) assigns
  away from it. Both are more machinery than the observable justifies.
- **Deduplicate at assembly.** `assembleDiagnostics`
  (`src/diagnostics/diagnostic.ts:107–127`) collects with "no per-error loss"
  by its own doc comment (`:104–105`), and `diagnostic-shape.md:24`'s re-scan
  deduplication is about watcher-triggered reloads, not intra-pass identity.
  This is bug 0147's and bug 0129's territory and is out of scope for a route
  here; a route choosing it coordinates with both.

**Witness — offline, provider-free, whichever route lands.** A new test file on
`tests/fn-param-name-case.test.ts`'s harness shape (`parseDoc` from
`tests/helpers/e2e-s1.ts`, whole-list ordered `toEqual` over unfiltered
`doc.diagnostics`, every expected message read from the registry through
`registryMessage`). Required cells: §Reproduction (a) a1 and a2 as the pin pair
that isolates the structural report from bug 0139's case report; a5 and a6 for
the absorbed-remainder shape; (b) b1–b3 for the EOF exit, each also asserting
that `single-line-if` is still present and still ranged on the `fn` head; (c)
c3 and c4 asserting `body.statements` and the recorded parameter count, which
are what a resynchronisation route changes; (d) d1 as the duplicate's exact
count, whichever way Decision 4 goes; (e) e1 and e3 side by side as the bug
0124 separation; (g) g1–g3 and g5–g8 as the must-not-move controls, with g8
pinning the missing-`(` tail unchanged unless constraint 2's unification is
taken; and the `.thetalib` (a7) and `subagent fn` (a8) routes, which are silent
today and must move together with the `.theta` one. Each count assertion is an
exact count, never a containment check. No live tier applies: every observable
settles inside one parse.

## Provenance

- **Origin:** the bug 0139 fix (0.79.0, HEAD `d11aef29`), residuals 4 and 5 of
  `.pi/tmp/fixes/0139-report.md` — "an unclosed `fn` parameter list is accepted
  with no structural diagnostic, and its recovery can duplicate the new code …
  The root — the silent unclosed-list acceptance — predates this fix and is
  unfiled (checked: bug 0124 is `parseType`'s trailing-punctuation leniency, a
  different site)", and "Those recovery paths carry no witness row." Found by
  that run's review round 1, re-measured by its orchestrator, re-derived
  independently here. **One claim of that record is corrected:** its statement
  that "every duplicate-producing input already carries an `E`" from another
  source is measured false (§Reproduction (d) d1); the surviving bound is
  stated in §Summary and §Fix Decision 4.
- **Evidence:** three scratch vitest files at HEAD `d11aef29` driving
  `parseThetaDocument` and `lexTheta` through `tests/helpers/e2e-s1.ts`'s
  `parseDoc` / `lexSrc`, over 50 fixtures covering §Reproduction (a)–(g), plus
  a `git ls-files -- '*.theta' '*.thetalib'` census parsing all 34 committed
  files through the same path for (h). Every line quoted above is from those
  runs, verbatim apart from line-wrapping of long diagnostic messages. All
  three files written, run, deleted; `git status --short` carries no path of
  mine and `ls tests tests/live | grep -i scratch` matches none of mine
  afterwards. No runtime drive was performed: the runtime consequences in §Why
  it matters are stated from the AST (`body.statements`, `params.length`, the
  empty `FnBody`) and from source reads of `ThetaFnArityError`'s throw sites
  and FN-4, not from an executed theta.
- **Implementation, at `d11aef29`:**
  `src/parser/theta-document.ts:2151` (`parseFn`), `:2155–2158` (the grammar
  comment), `:2159–2168` (the missing-`(` emission; message `:2166`),
  `:2169–2170` (the `(` consume), `:2171` (**the defect site** — the loop
  condition), `:2172–2183` (the `mut` arm), `:2184` (the unconditional
  `advance()`), `:2191–2203` (bug 0139's case arm), `:2204–2208` (the optional
  annotation), `:2209` (`params.push`), `:2210–2212` (the comma consume),
  `:2214–2216` (the conditional `)` consume), `:2218–2228` (the return slot,
  `parseType(false, true)` at `:2227`), `:2242` (`parseBlock`);
  `:1707–1709` (`atEnd`), `:1711–1714` (`isPunct`), `:1727–1737`
  (`parseBlock`), `:1740` (`parseForms`);
  `:2989` (`parseType`), `:3000` (its loop), `:3002–3004` (the `stmt-sep`
  stop), `:3045–3055` (the depth-0 punct stop), `:3056–3068` (bug 0005's
  `with` stop);
  `:726–737` (`ThetaDocument`; `:729–730` the interpreter-walks sentence),
  `:903–914` (`assembleDiagnostics`' group order; `lex.diagnostics` `:905`,
  `parser.diagnostics` `:906`);
  `src/lexer/lexer.ts:124` (the `collapseContinuations` call), `:125` (the
  `contextualDiagnostics` call), `:185–190` (`trailingTriggers`), `:197–202`
  (`leadingTriggers`), `:733–741` (the continuation doc comment), `:742`
  (`collapseContinuations`), `:746` (the depth counter), `:766` (**the
  suppression** — `depth > 0`), `:767–769` (the omitted `stmt-sep`),
  `:774–782` (the depth update), `:806–808` (the scope note),
  `:810` (`contextualDiagnostics`), `:814–851` (`checkName`; the binding arm
  `:834–841`, the type arm `:842–850`), `:876–882` (the `let` adjacency with
  the `mut` skip `:879–881`), `:883–884` (the `fn`-name adjacency), `:885–886`
  (the `schema` / `enum` adjacency), `:889–912` (the single-line-body scan;
  the `stmt-sep` / `eof` break `:894`, the `{` break `:897–900`, the emission
  `:903–911`);
  `src/diagnostics/diagnostic.ts:107–127` (`assembleDiagnostics`; the no-loss
  comment `:104–105`, the stability comment `:113–115`, the sort `:116–126`);
  `src/extension/production-composition.ts:1562` (the registration gate),
  `:2047–2054` (`hasLoadParseError`);
  `src/runtime/statement-executor.ts:356–367` (`ThetaFnArityError` and its
  premise comment), `:402` and `:495` (its throws);
  `src/extension/production-theta-producer.ts:5903` (the third throw);
  `src/runtime/tool-call.ts:442` (the `theta/runtime/internal-error` routing).
- **Spec:** `docs/spec_topics/grammar.md:138`, `:139`, `:140`, `:143`
  (`FnDecl` / `FnParams` / `FnParam` and the parenthesisation prose), `:197–212`
  (§Newline continuation; `:199` closure, `:203` the open-bracket row);
  `docs/spec_topics/functions.md:20` (FN-1), `:36` (FN-4);
  `docs/spec_topics/lexical.md:13` (the `Ident` grammar and the enforced-case
  sentence), `:16` (the lowercase-first list), `:18` (the parse-error
  sentence), `:20` (the reserved keywords);
  `docs/spec_topics/diagnostics/code-registry-parse.md:14`, `:19`, `:22`,
  `:27`, `:69`, `:105` (the rows assessed);
  `docs/spec_topics/diagnostics/diagnostic-shape.md:24` (*Re-scan
  deduplication*), `:65` (*Multi-error reporting*), `:71` (DIAG-1), `:72`
  (DIAG-2), `:74` (DIAG-4);
  `docs/spec_topics/diagnostics/placeholder-rendering-a.md:7` (the closure),
  `:50` (the "use the closed table" direction), `:52–68` (the 15-row table);
  `docs/spec_topics/governance/source-language-stability.md:5` (GOV-15), `:9`
  (the loads-cleanly predicate), `:25` (the diagnostic-registry carve-out).
- **Reference mirrors a fix must co-edit:** `docs/reference/grammar.md:247`,
  `:253`, `:254`, `:257–258` (the `fn` production and its prose), `:136–162`
  (§Statement termination & newline continuation; `:144`, `:160–162`);
  `docs/reference/diagnostics.md:65`, `:68`, `:73` (the *Message* mirrors; the
  file carries no *Trigger* column).
- **Tests:** `tests/reserved-keyword-type-position.test.ts:483` (the
  missing-`(` tail, the only committed assertion at either end of this
  production); `tests/fn-param-name-case.test.ts` (bug 0139's 19-row witness,
  all closed lists); `tests/fn-arg-type-mismatch-wired.test.ts` (bug 0050's,
  whose u13b/u13c/u13d cells carry the post-0139 `binding-case-mismatch`
  expectation and which many open reports cite);
  `tests/committed-fixture-parse-gate.test.ts` (the corpus gate, blind to
  `.thetalib` per bug 0132). No test in the tree drives an unclosed `fn`
  parameter list.
- **Related bug documents:** `docs/bugs/0139-…md` (fixed 0.79.0, the origin),
  `docs/bugs/0124-…md` (open, the nearest report, separated by measurement),
  `docs/bugs/0133-…md` (open, the same question at `parseSchemaObjectBody`),
  `docs/bugs/0063-…md` (open, the closed `<construct>` table, binding on the
  reuse route), `docs/bugs/0042-…md` (fixed 0.52.0, the new-code precedent),
  `docs/bugs/0131-…md` (open, why the corrupted arity reaches the runtime),
  `docs/bugs/0132-…md` (open, binding on how the GOV-15 sweep runs),
  `docs/bugs/0134-…md` (open, the citation-drift class),
  `docs/bugs/0005-…md` (fixed 0.14.0, the adjacent stop in the same function),
  `docs/bugs/0147-…md` and `docs/bugs/0129-…md` (open, the multiplicity
  neighbours), `docs/bugs/0150-…md` (open, filed in this round, the third
  leniency in the same loop), `docs/bugs/0148-…md` (open, filed in this round,
  the reserved-keyword arm of the same parameter position).

## Fix (0.163.0)

- **Route adjudicated** (§Fix selected none; this is the run's decision, taken
  against a re-measured HEAD, not against the filed tables):
  - **Decision 1 — both arms, one emission.** `parseFn` captures the opening
    `(`; a `{` at a parameter-name position ends the list (a block-open brace
    derives from no `FnParam`, and a `)` before it would already have exited
    the loop), and the loop's EOF exit is now distinguished from its `)` exit.
    Both mark the list unclosed and exactly one diagnostic is pushed after the
    loop, ranged on the opening `(`.
  - **Decision 2 — resync at the body brace / EOF.** The `{` break leaves the
    cursor ON the brace, so `parseBlock` takes it as the `FnBody` the author
    wrote and the statements that followed return to the top-level statement
    list (§Reproduction (a) a5/a6, (c) c8).
  - **Decision 3 — a new registered row**, not a twelfth off-table
    `<construct>` tail: `theta/parse/fn-param-list-unclosed` (E, parse),
    scoped to `fn` parameter lists alone, message placeholder-free
    (`fn parameter list is not closed by ')'`), so
    `placeholder-rendering-a.md`'s closed table is not engaged and bug 0063's
    open surface is not widened. Bug 0042's precedent.
  - **Decision 4 — do nothing.** Measured: the resync collapses the duplicate
    to one where the swallowed `let X` is no longer a parameter (c8: one
    `binding-case-mismatch`, where HEAD emits two); it persists unchanged on
    the foreign-`)` rows (d1), which this route does not reach.
  - **Withhold (this route's own boundary).** When a parameter type capture
    consumed strictly more punct `)` tokens than punct `(` tokens — bug 0124's
    unfloored `<` / `>` over-run swallowing the list's own closer — both the
    verdict and the recovery are withheld and the input keeps its previous
    disposition byte-for-byte. The predicate is token-level, so a `)` inside a
    string token or a balanced `(…)` in the author's own type does not withhold.
- **What shipped:**
  - `src/parser/theta-document.ts` — `parseFn`: the captured open paren, the
    `unclosed` / `closeParenAbsorbed` state, the `{` break, the epilogue's
    else-arm, and the single emission; plus the private
    `unmatchedCloseParens(from, to)` helper beside the cursor helpers.
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the DIAG-2 row,
    stating the trigger, the withhold (with its string-token / balanced-pair
    carve-out) and the recovery.
  - `docs/reference/diagnostics.md` — the Code/Sev/Phase/Message mirror row.
  - `docs/spec_topics/grammar.md`, `docs/reference/grammar.md` — one clause
    each naming the code beside the parenthesisation prose, matching each
    page's existing convention of naming a sibling rule's code inline.
  - `tests/fn-param-list-unclosed.test.ts` — 35 cells (new).
  - `tests/live/fn-param-list-unclosed-live-cell.test.ts` — one live
    registration cell (new).
- **Gates:** witness `35 passed (35)`; full default suite
  `Test Files 353 passed (353) / Tests 7085 passed (7085)`; `npx tsc --noEmit`
  clean; `npm run lint` clean; `tests/code-registry.test.ts` `5 passed (5)`
  (DIAG-2 closed-set reconciliation, both directions).
- **Review:** 2 rounds. Round 1 (deep) — one `correctness` finding: the
  withhold predicate was a character test over the captured type text, so a
  `)` inside a string token withheld the verdict and
  `fn h(p: enum["a)"] { 1 }` stayed silent and REGISTERED; one `spec` finding
  (the registry Trigger then diverged from the emission); one `house-rule`
  finding (bare self-references in the new comments). Round 2 (fast) — clean,
  no escalation, adversarial token-level probes reported per shape.
- **Verification:** SOLID. Witness reds on a neutralised fix
  (`18 failed | 17 passed (35)`, root row `diagnostics=[]`) and greens restored
  (`git hash-object` identical before and after, `ad3b4db9…`); default suite
  green; live run for real under the shared lock — the new cell red-proven in
  BOTH directions live, H8a `93 passed` with one documented ~180s stall on an
  unrelated bug-0210 cell that greened on isolated re-run, and all three
  `tests/live/acceptance/**` files green (12 passed); lint and typecheck clean;
  GOV-15 sweep over all 34 committed `.theta` / `.thetalib` files (walked
  explicitly, bug 0132) — 4 `fn` declarations, 0 offenders, 0 emissions of the
  new code. `tests/fixtures/h7a/permitted-codes.json` left untouched: the code
  is not reachable from the H9a stderr EMPTY-CAPTURE gate (every
  `permittedCodesSubset` area passed unmodified, and no committed fixture
  carries the trigger).
- **Residuals:**
  1. **The foreign-`)` class stays silent, and one member of it still
     registers.** A swallowed region that ends at a `)` belonging to something
     else exits the loop as a closed list, so this route says nothing about it.
     Measured at the fix's HEAD: `fn h(a: string,` + `x = 1` + `) { 1 }` →
     `[]` diagnostics, four parameters (`a`, `x`, `=`, `1`), the `x = 1`
     statement absent, `registered=TRUE`; same for `42` in place of `x = 1`.
     §Reproduction (c) c3/c4/c5 and (d) d1/d3/d4 are in this class too but are
     refused by bug 0148's reserved-keyword arm, which landed after the filing.
     Closing this needs §Fix Decision 1's other sub-arm — a non-derivable-token
     test at every parameter-name position, not only at `{` — which reaches
     bug 0148's and bug 0150's rows and is therefore not taken here.
     **Discharged by bug
     [0225](./0225-fn-param-list-foreign-close-paren-silent.md)'s
     `## Fix (0.168.0)`,** which took that sub-arm in its narrow form: a token
     whose `kind` is neither `"ident"` nor `"keyword"` at a parameter-name
     position is recorded and reported through a new registered row,
     `theta/parse/fn-param-not-identifier`, deferred to the epilogue's
     `)`-present arm so the two exits settled here keep reporting
     `theta/parse/fn-param-list-unclosed` alone. The class no longer
     registers: `fn h(a: string,` + `x = 1` + `) { 1 }` draws that code at the
     `=`. Bug 0150's rows are untouched — the predicate does not reach an
     annotation-less `Ident`, so the swallowed `x` stays recorded and the
     statement deletion survives as that fix's residual 1. Cells c3, c4 and d1
     of this fix's witness were flipped there under bug 0225's §Fix
     constraint 7; d1's duplicated `binding-case-mismatch` was re-measured and
     survives, so Decision 4 stands.
  2. **Bug 0124's declined `<` / `>` row changes disposition where no `)` was
     absorbed.** `fn h(p: array<string { 1 }` (§Reproduction (e) e4) now draws
     the new code and no longer registers; the capture is still
     `array<string{1}`, so 0124's counter is untouched. The three committed
     withhold cells (`integer<`, `integer>`, `array<enum["a", "b">`) are
     byte-identical.
  3. **Citation drift.** The parser edit inserts inside `parseFn` and shifts
     every `src/parser/theta-document.ts` citation below it — bug 0134's
     adjudicated class. Disclosed, not chased. Three stale citations found in
     `tests/` predate this fix and were left alone.
- **Discharge notes appended:** none. Bug 0124's and bug 0139's docs are open
  siblings; residuals 1–3 are reported for the parent to file rather than
  written into another report's file from this lane.
- **Pinned dispositions / non-goals:** `parseType`'s terminator set and its
  `<` / `>` counter (bug 0124), `parseSchemaObjectBody`'s recovery (bug 0133),
  the unclosed call paren in expression position (§Reproduction (f) f5), the
  in-document arity check (bug 0131), the `<construct>` table's over-statement
  (bug 0063), the reserved-keyword and optional-annotation arms of the same
  loop (bugs 0148, 0150) — all unmoved. The missing-`(` tail
  (`tests/reserved-keyword-type-position.test.ts:483`) and the
  `fn h(mut: string)` boundary keep their exact diagnostics.
