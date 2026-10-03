# Bug 0517 — a depth-0 final expression form that shares a logical line with the previous form is not promoted to the `ThetaBody` tail: `parseBody` keeps the `"line-start"` promotion test, so `schema X = array<integer>⏎pure("a")` (the trailing `>` joins the two lines) and `42 pure("a")` load clean and return `null` where the same call on its own line returns its value, and ``schema X = array<integer>⏎@`q` `` draws QRY-19; whether `ThetaBody ::= Stmt* Expr?` ranges over logical lines or over forms is unadjudicated, and 14 bug-0033/0042 cells pin the logical-line reading

- **Status:** open — filed 2026-10-03 as residual 7 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix
  (0.496.0)` Residuals, item 7). The 0510 fix excluded depth 0 from
  final-form promotion on purpose; this report needs a spec adjudication
  before a fix.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S1/D3 — S1 under the forms reading: a clean-loading
  theta whose final bare call shares a logical line with the previous form
  returns `null` with no diagnostic (measured below); S4 if the logical-lines
  reading lands (prose only). D3: needs adjudication, and either outcome
  re-pins or re-justifies 14 cells across two sibling witness files.
- **Where (pi-theta, main 0eb38a8a, 0.496.0):**
  - `src/parser/body-parser.ts:380-384` — `parseBody`, the depth-0
    `ThetaBody` entry, calls `parseForms(() => this.atEnd(), "line-start")`
    (`:383`). Its comment (`:381-382`): "the lexer emits a real `stmt-sep`
    here, so `lineStart` separates a line-starting final form from a
    same-logical-line residue." `src/parser/theta-document.ts:218` calls it
    for every `.theta` and `.thetalib` body.
  - `src/parser/body-parser.ts:186-207` — the `TailPromotion` doc comment
    and type. `"final-form"` promotes the final expression form whatever its
    `lineStart` (`FnBody`, `ParForBody`, `BlockExpr`). `"line-start"`
    promotes it only when it began a logical line (the depth-0 `ThetaBody`
    and the `StmtBlock` bodies of `if` / `else` / `while` / `for`).
  - `src/parser/body-parser.ts:502-503` — `promoteLast = last !== undefined
    && last.expr !== null && (promotion === "final-form" ||
    last.lineStart)`. The comment at `:487-489` names the depth-0 case:
    "Under `"line-start"` a same-logical-line residue at depth 0 (`schema X
    = Cat 42` — the severed `42`) is NOT the body's tail."
  - `src/parser/body-parser.ts:616-627` — `exprToStmt`: an unpromoted final
    `call` becomes a `tool-call` statement, `invoke` an `invoke` statement,
    `query` a `query` statement, anything else an `expr` statement.
  - `src/lexer/continuation.ts:13-18` — `trailingTriggers` includes `>` and
    `=`; `:65` — `const swallow = depth > 0 || isTrailing(prev) ||
    isLeading(next)`: a line ending in a trigger emits no `stmt-sep`, so the
    first form on the next source line does not start a logical line.
  - `src/runtime/statement-executor.ts:838` — `executeBlock` keeps a
    trailing statement's value only for `stmt.kind === "expr"`; with no tail
    the block returns that value or `null` (`:849`). `executeBody`
    (`:1006-1007`) runs the `ThetaBody` through `executeBlock`.
  - `src/parser/body-parser.ts:1890-1897` —
    `parseSingleExpressionWithResidue` drains residue under `"line-start"`
    and discards the drained `Block` (`:1894`). Its promotion mode does not
    reach any tail; it is outside this report.
- **Spec:**
  - `docs/reference/grammar.md:280` — `ThetaBody ::= Stmt* Expr?   // top
    level of a .theta file; tail Expr optional`. `:294-297` — a `ThetaBody`
    with no tail expression has final value literal `null`.
  - `docs/reference/grammar.md:177-178` — "Statements are separated by
    newlines; no semicolons. A statement continues across one or more
    newlines only when a **continuation trigger** holds." `:184` — the
    trailing-operator row lists `>` and the alias-head `=`.
    `docs/spec_topics/lexical.md:22` states the same rule.
  - `docs/spec_topics/functions.md:44` (FN-5) — a theta's final value is
    the value of its tail expression on the success path.
  - `docs/spec_topics/query/query-escapes-stringification.md:43` (QRY-19) —
    a bare `@`…`` expression statement is `theta/parse/discarded-query-result`.
  - No sentence in grammar.md, lexical.md or functions.md says whether the
    `Expr?` of `ThetaBody` is the final form of the body or the final
    logical line of the body. The two differ only when the final logical
    line holds more than one form.

## Symptom

Two source shapes put the final form of a `.theta` body on the same logical
line as the form before it:

- a `>`- or `=`-ended alias right-hand side followed by the final form on
  the next source line (`schema X = array<integer>` ⏎ `pure("a")`), where
  the continuation trigger joins the two lines;
- two forms written on one source line (`42 pure("a")`, `42 43`).

In both, the final form is not the body's tail. A final bare call becomes a
`tool-call` statement and the theta returns `null`, with no diagnostic. A
final bare query becomes a `query` statement and draws QRY-19. A final
`expr`-kind form (`43`, `7`, an identifier) keeps its value at runtime
through `executeBlock`'s trailing-`expr` rule, but the parse records no
tail.

## Observed (2026-10-03, main 0eb38a8a, 0.496.0)

Method: in-process, provider-free. Parse through `parseThetaDocument`
(`mode: prompt` frontmatter), execute through the belt-probe harness
(`tests/helpers/runtime-belt-probe-harness.ts`, `makeBeltProbes`). The
"depth-0 final-form" column is a scratch copy of the tree outside the
repository with one change: `body-parser.ts:383` passes `"final-form"`.
`PURE` is `fn pure(s: string): string { "v:" + s }`.

| body | HEAD statements / tail | HEAD diagnostics | HEAD value | depth-0 final-form tail / value |
|---|---|---|---|---|
| `PURE` ⏎ `schema X = array<integer>` ⏎ `pure("a")` | `[fn, schema, tool-call]` / none | none | `null` | `call` / `"v:a"` |
| `PURE` ⏎ `42 pure("a")` | `[fn, expr, tool-call]` / none | none | `null` | `call` / `"v:a"` |
| `PURE` ⏎ `42` ⏎ `pure("a")` (control) | `[fn, expr]` / `call` | none | `"v:a"` | `call` / `"v:a"` |
| `42 43` | `[expr, expr]` / none | none | `43` | `number` / `43` |
| `schema X = array<integer>` ⏎ `7` | `[schema, expr]` / none | none | `7` | `number` / `7` |
| `schema X = array<integer>` ⏎ ``@`ask something` `` | `[schema, query]` / none | `discarded-query-result` | — | `query` / — (no diagnostic) |

The 14 pinned cells. HEAD: both files pass, 108 / 108. Depth-0
final-form: `14 failed | 94 passed (108)`. In every failing cell the first
failing assertion is the statement list: the final form leaves
`body.statements` and becomes `body.tail`. Diagnostic changes measured per
fixture:

| cell | file | fixture body (after frontmatter) | declaration | diagnostics: HEAD → depth-0 final-form |
|---|---|---|---|---|
| b12 | `tests/schema-alias-rhs-malformed.test.ts:774` | `schema Cat {…}` ⏎ `schema X = Cat 42` | malformed (same-line residue) | `malformed-alias-rhs` → unchanged |
| e4 | `tests/schema-alias-rhs-malformed.test.ts:1211` | `.thetalib`: `schema Cat {…}` ⏎ `schema X = Cat Cat` | malformed (same-line residue) | `malformed-alias-rhs`, `thetalib-top-level-statement` → adds `type-as-value` |
| e9 | `tests/schema-alias-rhs-malformed.test.ts:1356` | `42 43` (fixture 6b; 6a is the own-line control) | none | none → none |
| g2 | `tests/schema-alias-union-decl.test.ts:1205` | `let a = 1` ⏎ `schema IntList = array<integer>` ⏎ `a` | well-formed | none → none |
| n1 | `tests/schema-alias-union-decl.test.ts:1524` | `schema X = array<integer>` ⏎ ``@`ask something` `` | well-formed | `discarded-query-result` → none |
| n2 | `tests/schema-alias-union-decl.test.ts:1548` | `schema X = array<integer>` ⏎ ``@<X>`ask` `` | well-formed | `discarded-query-result` → none |
| n3 | `tests/schema-alias-union-decl.test.ts:1567` | `schema X = array<integer>` ⏎ `( 1 + 2 )` | well-formed | none → none |
| n4 | `tests/schema-alias-union-decl.test.ts:1587` | `schema X = array<integer>` ⏎ `[1, 2]` | well-formed | none → none |
| n4b | `tests/schema-alias-union-decl.test.ts:1606` | `schema X =` ⏎ ``@`ask` `` | malformed (empty RHS) | `empty-schema-body`, `discarded-query-result` → `empty-schema-body` |
| n17 | `tests/schema-alias-union-decl.test.ts:1961` | `schema X = array<integer>` ⏎ `!true` | well-formed | none → none |
| n18 | `tests/schema-alias-union-decl.test.ts:1980` | `schema X =` ⏎ `invoke<string>("child.theta")` | malformed (empty RHS) | `empty-schema-body` → unchanged |
| n19 | `tests/schema-alias-union-decl.test.ts:1995` | `schema X =` ⏎ `match 1 { 1 => 2 }` | malformed (empty RHS) | `empty-schema-body` → unchanged |
| n20 | `tests/schema-alias-union-decl.test.ts:2013` | `schema X =` ⏎ `Ok(1)` / `Err(1)` | malformed (empty RHS) | `empty-schema-body` → unchanged |
| n28 | `tests/schema-alias-union-decl.test.ts:2251` | `let a = 1` ⏎ `schema X = array<integer>` ⏎ `-a` | well-formed | none → none |

Fixture constants: `tests/schema-alias-rhs-malformed.test.ts:260` (F6),
`:289` (F1F_LIB), `:295` (F6B); `tests/schema-alias-union-decl.test.ts:263`,
`:302-305`, `:307`, `:361-365`, `:392`.

Every cell's assertion text or comment states the logical-line rule it pins:
b12 (`:775-778`, `:788-789`), e9 (`:1357-1360`, `:1376`), g2
(`:1206-1213`), n1 (`:1537-1541`). Six cells are malformed declarations
(b12, e4, n4b, n18, n19, n20). Seven are well-formed aliases followed by a
statement the trailing `>` joins to the alias line (g2, n1, n2, n3, n4, n17,
n28). e9 has no declaration.

The 0510 fix's first, unscoped attempt flipped the same 14 cells
(`.pi/tmp/fixes/0510-report.md` §Review rounds, "First implementation").
The depth-0 change alone accounts for all 14.

## Expected

The spec does not settle it. Two readings of `ThetaBody ::= Stmt* Expr?`
(`grammar.md:280`) fit the text:

- **Logical-lines reading.** Statement separation is defined over logical
  lines (`grammar.md:177-178`), so the tail `Expr` is a form that begins a
  logical line. A final form that shares a logical line with a preceding
  form is a statement. HEAD's behaviour is correct, and grammar.md lacks the
  sentence that says so.
- **Forms reading.** `Stmt* Expr?` is a sequence of forms, and the tail is
  the final form whatever its line packing. HEAD's behaviour is wrong: the
  first two rows of the runtime table must return `"v:a"` (FN-5), and the
  query row must be the theta's tail, not a QRY-19 statement.

The 0510 document's §Fix direction ("Promote the FINAL expression form of a
block to `Block.tail` regardless of `lineStart`",
`0510-block-trailing-call-value-discarded.md:189`) reads as the forms
reading for every block. Its `## Fix (0.496.0)` record scopes that to
`FnBody`, `ParForBody` and `BlockExpr`. At depth 0 a forms-reading change
moves the 14 cells above, which are outside the flip class 0510
authorised.

## Actual

`parseBody` (`body-parser.ts:383`) passes `"line-start"`, so `parseForms`
promotes the final form only when `last.lineStart` is true (`:502-503`). A
form whose preceding newline the lexer swallowed (`continuation.ts:65`, a
trailing `>` or `=`), or that follows another form on the same source line,
has `lineStart` false. `exprToStmt` (`:616-627`) encodes it by kind. At
runtime `executeBlock` (`statement-executor.ts:838`, `:849`) keeps the
value of a trailing `expr` statement and returns `null` after a trailing
`tool-call`, `invoke` or `query` statement. The structural check reads a
trailing `query` statement as a non-tail bare query and raises QRY-19.

## Root cause

Bug 0510 replaced a single line-start promotion gate with a per-position
`TailPromotion` mode. At depth 0, where `stmt-sep` tokens are real,
`lineStart` is an accurate logical-line signal, and the fix kept it. That
choice encodes the logical-lines reading of `ThetaBody`, which grammar.md
neither states nor rules out. The 14 cells pin that reading, and their
comments describe it as the parser's rule, not as a spec rule.

## Fix direction

Adjudicate between the two readings in §Expected. Whichever lands, the
depth-0 behaviour, the grammar.md prose and the 14 cells move together in
one commit.

- **Logical-lines reading.** No source change. `grammar.md` §Blocks gains
  one bullet under the production block (`:277-290`): at the top level the tail `Expr` is an
  expression form that begins a logical line, and a form sharing a logical
  line with a preceding form is a statement. The 14 cells keep their
  assertions; their comments cite that sentence instead of `parseForms`.
  The `null` in the first two runtime rows is then specified behaviour.
- **Forms reading.** `parseBody` (`body-parser.ts:383`) passes
  `"final-form"`; the `parseBody` and `TailPromotion` comments
  (`:381-382`, `:197-205`) and the `parseForms` comment (`:487-489`) are
  rewritten. `grammar.md` §Blocks states that the `ThetaBody` tail is the
  final expression form regardless of line packing. The 14 cells are
  re-pinned to the dispositions measured in §Observed: the final form is
  `body.tail`; n1, n2 and n4b lose `discarded-query-result`; e4 gains
  `type-as-value`. The 0042 §Non-goals sentence that says the second
  same-line statement "loses tail promotion"
  (`0042-schema-decl-same-line-residue-silent.md:339-345`) is a closed
  fixed-bug record and is not edited. A witness pins the first two runtime
  rows at `"v:a"`, red at 0eb38a8a.

Constraints under either reading:

- Nested-block promotion is untouched: `FnBody`, `ParForBody` and
  `BlockExpr` stay on `"final-form"`, the `StmtBlock` bodies stay on
  `"line-start"`, and `tests/b0510-block-trailing-call-tail.test.ts` passes
  unchanged. Its depth-0 cell (`:408`) puts the call on its own line, so it
  is promoted under both readings.
- `parseSingleExpressionWithResidue` (`body-parser.ts:1894`) discards its
  drained `Block`; its mode is outside this report.
- Whether two forms on one source line (`42 43`) load at all is out of
  scope. 0042 §Non-goals records that permissiveness as pre-existing and
  unfiled.

## Repro (minimal, inline)

`mode: prompt` theta body:

```
fn pure(s: string): string { "v:" + s }
schema X = array<integer>
pure("a")
```

`parseThetaDocument` returns `body.statements` kinds `[fn, schema,
tool-call]`, `body.tail === null`, no diagnostics. Executing the body
through `makeBeltProbes(…).probeSource` settles `success` with value
`null`. The control body `fn pure(…) {…}` ⏎ `42` ⏎ `pure("a")`, where
the call begins a logical line, parses with `body.tail` kind `call` and
settles with value `"v:a"`.

## Related

- [0510](./0510-block-trailing-call-value-discarded.md) — parent fix; this
  report is its residual 7. Its `## Fix (0.496.0)` record gives the scoping
  rationale and defines the `"line-start"` mode depth 0 keeps.
- [0033](./0033-body-level-schema-alias-unsupported.md) — owns
  `tests/schema-alias-union-decl.test.ts`; groups (g), (l), (p) and (u)
  hold g2, n1–n4, n4b, n17–n20 and n28.
- [0042](./0042-schema-decl-same-line-residue-silent.md) — owns
  `tests/schema-alias-rhs-malformed.test.ts`; groups (b) and (e) hold b12,
  e4 and e9. Its §Non-goals records the general same-line statement
  permissiveness and the lost tail promotion as unfiled.
