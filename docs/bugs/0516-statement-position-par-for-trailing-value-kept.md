# Bug 0516 — a statement-position `par for` that is the last form of a `FnBody`, `ParForBody` or `ThetaBody` yields its `array<Result<…>>` value as the block's final value, although control-flow.md and `parseForm`'s own comment call that value discarded: `parseForm` keeps the `par for` out of tail promotion as an `expr` statement, and `executeBlock`'s trailing-`expr` tail-equivalence rule hands the value back

- **Status:** open — filed 2026-10-03 as residual 6 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix
  (0.496.0)` Residuals, item 6). The divergence predates 0510; the 0510
  witness pins the observed value as a control.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S4/D3 — S4: the spec contradicts itself on this
  shape (grammar.md's `FnBody`/`ThetaBody` productions and FN-4's closed
  statement list admit a trailing `par for` as the tail `Expr`;
  control-flow.md:70 discards a standalone `par for`'s value), and the
  runtime follows one of the readings while the parser comments state the
  other. No diagnostic is wrong and no value is corrupted under the
  value-keeping reading. D3: the §Fix needs an adjudication between a spec
  edit and a runtime edit before either can ship.
- **Where (pi-theta, main 0eb38a8a, 0.496.0):**
  - `src/parser/body-parser.ts:603-608` — `parseForm`: "A `par for` in
    statement position is a discarded-value expression statement (grammar.md
    §Blocks): it is NOT promoted to the body tail, so its value is discarded
    (`tailExpr = null`)." `:608` — `const tailExpr = expr.kind === "par-for"
    ? null : expr;`. `:609` wraps `this.exprToStmt(expr)`, and `exprToStmt`
    (`:616-627`) encodes a `par-for` expression as `{ kind: "expr", … }`
    (`:626`): only `call` / `invoke` / `query` get their own statement kinds.
  - `src/parser/body-parser.ts:495-498` — the `parseForms` comment: a
    statement-position `par for` "is recorded as an `expr` statement, not a
    candidate `last` here". `:501-503` — `promoteLast` requires
    `last.expr !== null`, so neither `"final-form"` nor `"line-start"`
    promotion makes it `Block.tail`.
  - `src/parser/body-parser.ts:160-166, 175-184` — `promoteTrailingExprToTail`
    restores a trailing `expr` statement as the structural tail of a
    `BlockExpr` only. Its doc comment quotes grammar.md §Blocks as "a
    standalone `par for` reads as an expression statement"; grammar.md
    contains no such sentence (the nearest is `:307-308`, below).
  - `src/runtime/statement-executor.ts:811` — `executeBlock`. Its comment
    (`:817-831`) states the rule: "A trailing bare-expression statement
    contributes the block's FN-5 final value", and names the case at
    `:821-825`: "a statement-position `par for` ending a `FnBody`,
    `ParForBody`, `StmtBlock` or the `ThetaBody`: `parseForm` keeps it out of
    tail promotion, and this rule returns its value". `:838` —
    `trailingExprValue = stmt.kind === "expr" ? { value: flow.value } :
    undefined;`. `:849` returns it as the block's value when `block.tail` is
    `null`.
  - Consumers of that value: `evalUserFnCall`
    (`src/runtime/statement-executor.ts:286`, `executeBlock` at `:345`)
    returns it as the fn's call value unless the fn is `void`-annotated
    (`discardForVoid`, `:365`); `executeBody` (`:1006-1007`) returns it as the
    theta's final value; `parForOutcomeOf`
    (`src/runtime/par-for-executor.ts:110`, `makeOk(flow.value)` at `:117`)
    wraps it as an enclosing `par for`'s element.
  - `src/parser/type-layer-walk.ts:855, 864-866` —
    `collectReturnContributions` reads `b.tail` only; the trailing
    statement-position `par for` contributes nothing to the fn's static
    return contributions while the runtime returns its value.
  - `tests/b0510-block-trailing-call-tail.test.ts:426-442` — the 0510
    control cell "a statement-position `par for` last form stays
    un-promoted". `:434` pins the parse shape `tail=null
    statements=[let,expr]`; `:441` pins the runtime value
    `toEqual([makeOk(42)])`. The cell comment (`:427-430`) records the pin
    as "measured so a change that moves it is visible"; it documents the
    current behaviour and does not assert the spec. The file header
    (`:44-46`) lists it among the controls.
  - `tests/par-for.test.ts:166-178` — asserts a lone depth-0 `par for` parses
    as one `expr` statement; its message reads "(value discarded)" but the
    cell checks parse shape only.
  - `tests/helpers/e2e-s1.ts:562-570` — the `trailingExpr` helper comment
    describes the current runtime rule ("whose value `executeBlock` returns
    through the trailing-`expr` rule").
- **Spec:**
  - `docs/spec_topics/control-flow.md:70` — "`par for` is an expression: it
    produces a value and may appear anywhere an expression is admitted, or
    stand alone as an expression statement with its value discarded."
  - `docs/reference/grammar.md:307-308` (§Blocks) — "A discarded-value `par
    for` is legal as an expression statement." This sentence states legality
    only; it does not say whether the last form of a body is such a
    statement.
  - `docs/reference/grammar.md:279-280` — `FnBody ::= "{" Stmt* Expr? "}"`,
    `ThetaBody ::= Stmt* Expr?`; `:287` — `ParForExpr` is an expression
    ("expression position (theta 1.1)"); `:289` — `ParForBody ::= "{" Stmt*
    Expr? "}"`. No production excludes a `ParForExpr` from the trailing
    `Expr?`.
  - `docs/spec_topics/functions.md:36` (FN-4) — the closed list of "last
    form is a statement" shapes that make a body empty-tail names an
    "expression-statement of `void` type" and no other expression statement;
    a `par for` is typed `array<Result<T, QueryError>>`, not `void`.
  - `docs/spec_topics/functions.md:44` (FN-5) — the final value is "the value
    of its tail expression on the success path", else the literal `null` per
    FN-4.

## Symptom

```
fn pure(n: number): number { n + 41 }
fn wrap() { let z = 1
 par for m in [1] max 2 { pure(m) } }
wrap()
```

parses clean with `wrap`'s body as `tail=null statements=[let,expr]`, the
trailing `expr` statement wrapping the `par-for` node, and the theta's final
value is `[Ok(42)]`. control-flow.md:70 and `parseForm`'s comment
(`body-parser.ts:603-607`) both state that value is discarded, which would
make `wrap()` return `null` (FN-4/FN-5 empty-tail).

## Observed (2026-10-03, in-process on main 0eb38a8a, production `parseThetaDocument` + the `makeBeltProbes` drive the 0510 witness uses)

All fixtures prefix `fn pure(n: number): number { n + 41 }`. No fixture drew
a diagnostic of any severity.

| position | body | parse shape of the block | value |
|---|---|---|---|
| `FnBody`, multi-statement | `fn wrap() { let z = 1⏎ par for m in [1] max 2 { pure(m) } }` | `tail=null [let, expr:par-for]` | `[Ok(42)]` |
| `FnBody`, single-form | `fn wrap() { par for m in [1] max 2 { pure(m) } }` | `tail=null [expr:par-for]` | `[Ok(42)]` |
| `FnBody`, `: string`-annotated | as multi-statement, `fn wrap(): string` | `tail=null [let, expr:par-for]` | `[Ok(42)]` |
| `FnBody`, `: void`-annotated | as multi-statement, `fn wrap(): void` | `tail=null [let, expr:par-for]` | `null` (`discardForVoid`) |
| `ThetaBody`, multi-statement | `let z = 1⏎ par for m in [1] max 2 { pure(m) }` | `tail=null [fn, let, expr:par-for]` | `[Ok(42)]` |
| `ThetaBody`, single-form | `par for m in [1] max 2 { pure(m) }` | `tail=null [fn, expr:par-for]` | `[Ok(42)]` |
| `ParForBody` | `let rs = par for k in [1] max 2 { let z = 1⏎ par for m in … }⏎ rs` | inner block `tail=null` | `[Ok([Ok(42)])]` |
| `BlockExpr` | `let v = { let z = 1⏎ par for m in … }⏎ v` | tail restored by `promoteTrailingExprToTail` | `[Ok(42)]` |
| `StmtBlock` | `fn wrap() { if true { let z = 1⏎ par for m in … } }` | if-body `tail=null` | `null` (`executeIf` discards) |
| not last | `fn wrap() { par for m in …⏎ let z = 1 }` | `[expr:par-for, let]` | `null` |

The `BlockExpr` row is outside this report: grammar.md:278 requires a tail
`Expr` there, and the `par for` is that tail. The `StmtBlock` and not-last
rows discard as control-flow.md:70 states. The `FnBody`, `ThetaBody` and
`ParForBody` rows are the divergence. A `ThetaBody` final value is the `Ok`
payload an `invoke` parent receives (FN-5), so the divergence crosses the
invoke boundary.

## Expected (spec citations)

The spec does not settle one value. Under control-flow.md:70 ("stand alone as
an expression statement with its value discarded") the `FnBody`, `ThetaBody`
and `ParForBody` rows above end in a statement, so FN-5 falls through to FN-4
and the value is `null`. Under grammar.md:279-280 / `:289` the trailing
`ParForExpr` is the optional tail `Expr`, FN-4's closed list (functions.md:36)
does not classify a non-`void` expression statement as an empty-tail last
form, and FN-5 makes `[Ok(42)]` the final value. Exactly one reading must be
written into the spec, and the parser comments, the runtime rule and the
witness must agree with it.

## Actual (implementation citations)

The implementation follows both readings in different layers. The parser
encodes the trailing `par for` as a statement and documents its value as
discarded (`body-parser.ts:495-498, 603-608`); the runtime keeps it, because
`executeBlock` (`statement-executor.ts:838`) carries the value of any trailing
`expr` statement and `exprToStmt` (`body-parser.ts:626`) puts the `par for`
into that class. `executeBlock`'s comment (`:821-825`) names the `par for`
case and documents the value-keeping outcome; no spec sentence backs it.
Static return inference sides with the parser:
`collectReturnContributions` (`type-layer-walk.ts:864-866`) reads only
`Block.tail`, which is `null` here.

## Root cause

`parseForm`'s `tailExpr = null` exclusion (`body-parser.ts:608`) implements
control-flow.md:70's "stand alone … with its value discarded" at parse time,
but the run time does not enforce the discard: `executeBlock`'s
trailing-`expr` tail equivalence, which makes the final value invariant to the
tail-vs-`expr`-statement encoding, does not distinguish an `expr` statement
that holds a `par for` from any other trailing expression. The spec sentence that would decide which layer is right is
itself contradicted by the `FnBody`/`ThetaBody` productions and FN-4's
closed list.

## Fix direction

Adjudication required: one of the two surfaces moves.

- **(a) Admit the trailing value (spec moves to the runtime).**
  - Spec: `docs/spec_topics/control-flow.md:70` — restrict "stand alone as an
    expression statement with its value discarded" to a `par for` that is
    not the last form of a `FnBody`, `ThetaBody` or `ParForBody`, and state
    that a last-form `par for` is the body's tail `Expr` (FN-5).
    `docs/reference/grammar.md:307-308` — the same restriction on "A
    discarded-value `par for` is legal as an expression statement."
  - Runtime: `executeBlock` (`statement-executor.ts:838`) is unchanged; its
    comment (`:821-825`) becomes the specified rule.
  - Comments that state the opposite are rewritten: `parseForm`
    (`body-parser.ts:603-607`), `parseForms` (`:495-498`),
    `promoteTrailingExprToTail`'s doc (`:160-166`, which also misquotes
    grammar.md).
  - Optional parse-shape alignment: dropping the `par-for` exclusion at
    `body-parser.ts:608` makes the `par for` the structural `Block.tail`, so
    `collectReturnContributions` (`type-layer-walk.ts:864-866`) sees it. That
    step re-pins `tests/par-for.test.ts:166-178` and the shape pin at
    `tests/b0510-block-trailing-call-tail.test.ts:434`, and it reaches
    `StmtBlock` and depth-0 tails, whose static reads bug 0510 deliberately
    left on the `lineStart` gate (see
    [0512](./0512-return-contributions-count-stmtblock-tails.md)). Without
    it, the runtime value and the static return contributions keep
    disagreeing.
- **(b) Discard the value (runtime moves to the spec).**
  - Runtime: `executeBlock` (`statement-executor.ts:838`) excludes an `expr`
    statement whose `expr.kind === "par-for"` from `trailingExprValue`
    (it sets `undefined`, so `:849` yields `null`); the `:821-825` comment
    is rewritten to say the statement-position `par for` is the one trailing
    `expr` statement whose value the rule drops.
  - `BlockExpr` is unchanged: `promoteTrailingExprToTail`
    (`body-parser.ts:175-184`) makes the `par for` the required tail before
    `executeBlock` runs, so `{ let z = 1⏎ par for … }` keeps its value.
  - Spec: FN-4's closed list (`docs/spec_topics/functions.md:36`) gains "a
    statement-position `par for`" as an empty-tail last form, so FN-4 and
    control-flow.md:70 agree; grammar.md:279-280 gains a note that a
    standalone `par for` is a `Stmt`, not the `Expr?` tail. control-flow.md:70
    and grammar.md:307-308 are unchanged.
  - `tests/helpers/e2e-s1.ts:562-570` — the `trailingExpr` comment is
    rewritten.

Either way, the 0510 control cell
(`tests/b0510-block-trailing-call-tail.test.ts:426-442`) is the authorized
re-pin: under (a) its `:441` value pin stays and its comment states the
specified rule; under (b) `:441` flips to `toBeNull()`. A new witness cell per
affected position (`FnBody` single and multi, `ThetaBody`, `ParForBody`
element, `void` control, `StmtBlock` and not-last controls, `BlockExpr`
control) pins the adjudicated value.

## Repro

```
npx vitest run tests/b0510-block-trailing-call-tail.test.ts -t "statement-position"
```

passes at 0eb38a8a: the cell asserts `[makeOk(42)]` for the `FnBody` fixture
in §Symptom. The table in §Observed was measured with the same drive over the
listed fixtures.

## Related

- [0510](./0510-block-trailing-call-value-discarded.md) (fixed 0.496.0) —
  made `Block.tail` structural for `FnBody` / `ParForBody` / `BlockExpr` and
  kept the statement-position `par for` exclusion; this report is its
  residual 6, and its control cell is the pin named above.
- [0512](./0512-return-contributions-count-stmtblock-tails.md) — 0510
  residual 2 (`collectReturnContributions` counts `StmtBlock` tails); it
  constrains the optional parse-shape step of (a).
- 0082 (fixed 0.191.0) — introduced `promoteTrailingExprToTail`, the
  `BlockExpr` restore that keeps the `par for` value in that position.
