# Bug 0511 — QRY-19 (`theta/parse/discarded-query-result`) at a `StmtBlock` tail depends on how many forms the block holds: the single-form `if c { @`q` }` is silent and resolves the query against the enclosing fn's return-type sink, while the multi-statement `if c { let z = 1⏎ @`q` }` draws `discarded-query-result` and leaves the query untyped, because `"line-start"` tail promotion keys the statement-vs-tail split on `lineStart`, which in-brace newline swallowing makes false for every non-first form; the spec gives textual support to "both draw QRY-19" and to "both are silent", and supports the split under neither reading

- **Status:** open — filed 2026-10-03 as residual 1 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix (0.496.0)`
  Residuals item 1; review round 1, R4; review probes Q1–Q5). The behaviour
  predates that fix and is unchanged by it: the fix keeps the `StmtBlock`
  bodies of `if` / `else` / `while` / `for` on `"line-start"` promotion
  (0510 §Fix (0.496.0), "Why the scope is narrower").
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D3 — S2: one of the two forms is wrong under
  either reading of the spec. Under "both draw QRY-19" the single form accepts
  a dropped must-use `Result` with no diagnostic; under "both are silent" the
  multi-statement form refuses conformant input with an error. No runtime
  value is corrupted. D3: the fix needs a spec adjudication first, then moves
  pinned verdicts in a sibling witness either way (bug 0220's v10 row, or four
  rows of the 0510 witness), and the "silent" route also needs a QRY-20
  observability contract for the new discard form.
- **Where (pi-theta, main 0eb38a8a, 0.496.0):**
  - `src/lexer/continuation.ts:65` — `const swallow = depth > 0 || …`: every
    newline inside a brace pair is swallowed with no `stmt-sep`, so inside
    `{ … }` only the first form, or a form right after a postfix `?` or a
    nested `}`, begins a logical line.
  - `src/parser/body-parser.ts:186-207` — `TailPromotion`. The
    `"line-start"` bullet (`:197-206`) assigns that mode to the depth-0
    `ThetaBody` and to the `StmtBlock` bodies, "whose value the executor
    discards (grammar.md §Blocks) but whose promoted tail the static checks
    read as a value position (return-type inference, `type-as-value`, the
    QRY-19 discarded-query judgment)".
  - `src/parser/body-parser.ts:846, 858, 875, 920` — `parseIf` (then and
    else), `parseWhile` and `parseFor` call `parseBlock("line-start")`.
    `FnBody` (`:992`), `BlockExpr` (`:1860`) and `ParForBody` (`:2961`) use
    `"final-form"`.
  - `src/parser/body-parser.ts:502-510` — `promoteLast` is true under
    `"line-start"` only when `last.lineStart`; otherwise the final form stays
    in `statements`. `:481-484` restores `lineStart` after a form ending in a
    postfix `?` or a `}` (`forcedLineStart`).
  - `src/parser/body-parser.ts:616-627` — `exprToStmt` encodes an
    un-promoted bare query as a `query` statement (`:623-625`).
  - `src/parser/structural-checks.ts:555-579` — `walkStatements`' `query`
    arm calls `checkDiscardedQueryResult` with `disposition:
    "bare-expr-statement"` on every `QueryStmt`. Its comment (`:556-568`)
    states that a promoted query is "the block's tail value (QRY-20
    territory), not a statement". `walkBlock` (`:391-415`) walks a
    `Block.tail` through `walkExpr` and draws no QRY-19 on it.
  - `src/parser/query-discard-checks.ts:70-88` — `checkDiscardedQueryResult`
    emits the error for `disposition === "bare-expr-statement"` only.
- **Spec:**
  - `docs/reference/grammar.md:281` — `StmtBlock ::= "{" Stmt* Expr? "}"`,
    "value discarded"; `:298-301` — "A tail `Expr` in a `StmtBlock` is
    evaluated and discarded — except a tail expression ending in postfix
    `?`, which still early-returns on failure."
  - `docs/spec_topics/diagnostics/code-registry-parse.md:85` — the
    `theta/parse/discarded-query-result` Trigger: "Bare `@`...``
    expression-statement (the `Result` is dropped without `?` or `let _ =`)."
  - `docs/spec_topics/query/query-escapes-stringification.md:43-53` — QRY-19.
    `:53` names one discard form besides `let _ =` that is not an error: "A
    `void`-returning function whose **tail expression** is `@`...``". It
    closes with "Only the bare expression-statement position (no `let _ =`,
    no `?`, no annotation) triggers the parse error."
  - `docs/spec_topics/query/query-escapes-stringification.md:57` — QRY-20
    gives a `discard_site` observability contract to the `let _ =` form and
    the `void`-tail-function form only.
  - `docs/spec_topics/query/query-forms.md:32, 41` — the enclosing function's
    declared return type is a QRY-2 sink for a query "in tail-expression or
    `return`-argument position"; the sink walk crosses "the tail expression of
    an enclosing function or theta whose return type is declared". Neither
    line names a `StmtBlock` tail.

## Symptom

Two `if` bodies that differ only in a preceding `let` get opposite QRY-19
verdicts:

```
let c = true
if c { @`q` }               // silent
if c { let z = 1
 @`q` }                     // error theta/parse/discarded-query-result
```

The same split holds in a fn body, in `while` and `for` bodies, and in an
`else` body. A multi-statement body whose trailing query follows a postfix-`?`
statement or a `}`-terminated statement is silent, like the single form.

The split extends to QRY-2 schema resolution. In
`fn f(): Item { if true { @`q` } else { @`r` } }` both queries resolve to the
response schema `Item` through the fn-return sink. With a `let` before each
query, both draw `discarded-query-result` and both `QueryExpr.schema` values
are `null`.

## Observed (2026-10-03, main 0eb38a8a, 0.496.0)

In-process probe over the production `parseThetaDocument` (prompt-mode
frontmatter; scratch script outside the tree, deleted after the run):

| fixture | diagnostics |
| --- | --- |
| `let c = true⏎if c { @`q` }` | `[]` |
| `let c = true⏎if c { let z = 1⏎ @`q` }` | `[error discarded-query-result]` |
| `fn f(c: boolean) { if c { @`q` }⏎ 1 }⏎f(true)` | `[]` |
| `fn f(c: boolean) { if c { let z = 1⏎ @`q` }⏎ 1 }⏎f(true)` | `[error discarded-query-result]` |
| `let c = false⏎while c { @`q` }` | `[]` |
| `let c = false⏎while c { let z = 1⏎ @`q` }` | `[error discarded-query-result]` |
| `for c in [true] { @`q` }` | `[]` |
| `for c in [true] { let z = 1⏎ @`q` }` | `[error discarded-query-result]` |
| `let c = true⏎if c { 1 } else { @`q` }` | `[]` |
| `let c = true⏎if c { let z = @`a`?⏎ @`q` }` (postfix-`?` before) | `[]` |
| `let c = true⏎if c { if c { 1 }⏎ @`q` }` (`}` before) | `[]` |
| bug 0220 v10: `fn f(): void { if true { @`hi` } else { @`ho` } }` | `[]` |
| v10 with `let z = 1` before `@`hi`` | `[error discarded-query-result]` |

| fixture (`schema Item { a: string }` declared) | diagnostics | query schemas |
| --- | --- | --- |
| `fn f(): Item { if true { @`q` } else { @`r` } }` | `[]` | `Item`, `Item` |
| `fn f(): Item { if true { let z = 1⏎ @`q` } else { let y = 1⏎ @`r` } }` | two `discarded-query-result` | `null`, `null` |

Both sides are pinned in the tree:

- `tests/b0510-block-trailing-call-tail.test.ts:694-705` asserts that
  `if c { let z = 1⏎ @`q` }` draws `discarded-query-result` at top level, in
  a fn body, in an `if` inside a `for` body, and in a `while` body. It is
  the "Q1" StmtBlock parity control in the 0510 fix record.
- `tests/fn-return-void-query-sink.test.ts:268-290` (cell `RED a1`, row
  `["if-else-branches", VOID_IF_ELSE, []]` at `:280`) asserts an empty,
  whole-list diagnostic set for bug 0220's v10 fixture (`:209-218`), the
  single-form `if`/`else` with a bare query as each branch's tail. The
  fixture's comment calls both branches "in sink position".

No cell pins the single-form `if c { @`q` }` outside a `void` fn.

## Expected

One verdict for a bare query that is the final form of a `StmtBlock`,
whatever the block's form count. Which verdict is not settled by the spec:

- **Reading A — QRY-19 fires.** grammar.md:298-301 says a `StmtBlock` tail
  is evaluated and discarded, excepting only a postfix-`?` tail. The
  registry Trigger (code-registry-parse.md:85) defines the error by the
  `Result` being "dropped without `?` or `let _ =`". QRY-19 (`:53`) names
  exactly one other discard that is not an error, the tail of a `void`
  fn, and a `StmtBlock` tail is not on that list. A statement-form `if` is
  not admissible in expression position (grammar.md:298-299), so its branch
  tails are not the enclosing fn's tail expression and not a QRY-2 sink
  position.
- **Reading B — silent.** The grammar places a `StmtBlock` tail in the
  `Expr?` slot, not in `Stmt*`. The registry Trigger and QRY-19's last
  sentence name the "expression-statement" position. Bug 0220's v10 row
  treats the branch tails of an `if`/`else` that ends a `void` fn as tail
  (sink) positions and pins them silent.

Neither reading admits a verdict that depends on whether another statement
precedes the query.

## Actual

The parser decides by `lineStart`. `collapseContinuations`
(`continuation.ts:65`) swallows in-brace newlines, so a `StmtBlock`'s final
form has `lineStart` true only when it is the first form or follows a
postfix `?` or a `}` (`body-parser.ts:481-484`). `parseForms`
(`:502-510`) promotes such a form to `Block.tail`, which `walkBlock`
(`structural-checks.ts:391-415`) walks as a value with no QRY-19 check, and
which the QRY-2 sink walk reaches as the enclosing fn's tail. Any other final
query form stays a `query` statement (`exprToStmt`, `body-parser.ts:623-625`),
and `walkStatements`' `query` arm (`structural-checks.ts:555-579`) draws
`discarded-query-result` on it.

## Root cause

The `"line-start"` mode exists to separate a line-starting final form from a
same-logical-line residue at depth 0, where the lexer emits real `stmt-sep`
tokens. Inside braces `lineStart` carries no logical-line information
(`TailPromotion`, `body-parser.ts:189-196`, states this for the
`"final-form"` blocks). Applied to a `StmtBlock`, it turns the form count
into the input that decides the statement-vs-tail encoding, and the QRY-19
check and the QRY-2 sink walk each read that encoding. The spec gives no
`StmtBlock`-specific rule for a bare query tail that would make one encoding
correct.

## Fix direction

The verdict is a spec adjudication. Two resolutions are admissible; this
document selects neither. Each must yield one verdict for a bare-query
`StmtBlock` tail independent of form count, including the postfix-`?`- and
`}`-preceded shapes.

- **Resolution A — both forms draw QRY-19.**
  - Spec: QRY-19 (`query-escapes-stringification.md:53`) states that a bare
    query as the tail of a `StmtBlock` is a dropped `Result` and triggers the
    error. The registry Trigger (`code-registry-parse.md:85`) names the
    position: same-commit DIAG-2 edit, Message unchanged, so
    `docs/reference/diagnostics.md:133` is untouched.
    `query-forms.md:32, 41` state that a `StmtBlock` tail is not a
    fn-return sink position. grammar.md:298-301 may cross-reference QRY-19.
  - Implementation: QRY-19 fires on a `StmtBlock`'s promoted query tail
    (`walkBlock` has no block-kind input today), or `StmtBlock`s stop
    promoting a final query form. The QRY-2 sink walk stops at a `StmtBlock`
    tail.
  - Pins that move: bug 0220's v10 row
    (`tests/fn-return-void-query-sink.test.ts:280` `[]`, and the `:459`
    `if-else-branches` schema row) and the v10 claims in
    [0220](./0220-fn-return-void-sink-false-void-diagnostic.md) (`:165`,
    `:421-423`).
- **Resolution B — both forms are silent.**
  - Spec: QRY-19 (`:53`) adds the `StmtBlock` tail to the discard forms that
    are not errors. QRY-20 (`:57`) gives it an observability contract
    (`discard_site` = the tail query's start), since today QRY-20 covers
    `let _ =` and the `void`-tail form only. The registry Trigger
    (`code-registry-parse.md:85`) excludes the position: same-commit DIAG-2
    edit, Message unchanged. grammar.md:298-301 names the tail discard as a
    QRY-20 discard. `query-forms.md:32, 41` state whether a `StmtBlock` tail
    is a sink position.
  - Implementation: a `StmtBlock`'s final query form must not draw QRY-19
    when it does not begin a logical line. Switching `StmtBlock`s to
    `"final-form"` is not sufficient alone: the 0510 fix measured that it
    also moves `return-no-common-type` and `type-as-value` verdicts through
    `collectReturnContributions`
    ([0512](./0512-return-contributions-count-stmtblock-tails.md)). The runtime emits
    the QRY-20 event for a discarded `Err` at the new form.
  - Pins that move: `tests/b0510-block-trailing-call-tail.test.ts:694-705`
    (four rows, `toContain` → `not.toContain`).

Either resolution: a postfix-`?` `StmtBlock` tail keeps its early return
(grammar.md:300-301); the `FnBody` / `ParForBody` / `BlockExpr` query-tail
verdicts pinned by the 0510 witness (`:195-206`) are unchanged.

## Repro (minimal, inline)

`.pi/theta/q.theta`:

```
---
mode: prompt
description: "QRY-19 StmtBlock tail"
---
let c = true
if c { @`q` }
```

Parse it through `parseThetaDocument` (`src/parser/theta-document.ts`): no
diagnostic. Insert `let z = 1` on its own line before `@`q`` inside the
braces: the parse reports `error theta/parse/discarded-query-result` at the
query. The table in §Observed lists the other positions.

## Relation to prior bugs

- **[0510](./0510-block-trailing-call-value-discarded.md) (fixed 0.496.0)**
  — the parent. Its fix moved `FnBody` / `ParForBody` / `BlockExpr` to
  `"final-form"` promotion and kept `StmtBlock`s on `"line-start"`, leaving
  this split as found.
- **[0512](./0512-return-contributions-count-stmtblock-tails.md) (open)** —
  0510 Residuals item 2: `collectReturnContributions` counts `StmtBlock`
  tails as return contributions. It is the type-layer facet of the same "is
  a `StmtBlock` tail a value position" question; Resolution B's
  implementation note depends on it.
- **[0220](./0220-fn-return-void-sink-false-void-diagnostic.md) (fixed
  0.169.0)** — its v10 row pins the single-form `if`/`else` branch tails of a
  `void` fn as sink positions with zero diagnostics; Resolution A moves that
  pin.
