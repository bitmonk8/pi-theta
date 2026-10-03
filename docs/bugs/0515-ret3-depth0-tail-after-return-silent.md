# Bug 0515 — a `.theta` file's top-level tail expression after a top-level `return` draws no `theta/parse/unreachable-code`: `checkStructural` discards `walkStatements`' last-was-`return` flag and walks the `ThetaBody` tail without the RET-3 tail arm that `walkBlock` applies to every nested block, so `return 1⏎ 2` warns inside a `fn` body or BlockExpr and is silent at depth 0 under the same registry row

- **Status:** open — filed 2026-10-03 as residual 5 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix
  (0.496.0)` Residuals, item 5)
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S3/D1 — S3: a registered warning row whose widened
  Trigger covers a position no input can fire it at (the `ThetaBody` tail);
  no value changes, the file runs with the `return`'s value as the spec
  says. D1: one call-site change in `src/parser/structural-checks.ts`
  (route the depth-0 body through the existing `walkBlock`), no new
  registry row, no spec edit, a small parse-only witness.
- **Where (pi-theta, main 0eb38a8a, 0.496.0):**
  - `src/parser/structural-checks.ts:272` — `checkStructural`, the depth-0
    structural entry, called once per document from
    `src/parser/theta-document.ts:327` with the `ThetaBody`
    (`{ statements, tail: resolvedTail }`). It calls `walkStatements` at
    `:319-325` and discards its boolean result; the comment at `:317-318`
    states the omission: "RET-3 at depth 0 judges statement pairs only: the
    top-level tail is not judged against a preceding `return`, so
    `walkStatements`' result is unused." It then walks `body.tail` with
    `walkExpr` alone (`:326-334`).
  - `src/parser/structural-checks.ts:359` — `walkStatements` warns on the
    first statement after a `return` (`:374-381`) and returns whether the
    last statement walked was a `return` (`:388`). Its doc comment
    (`:351-358`) states that a `true` result means the caller's tail "is
    ALSO unreachable code under RET-3's own rule".
  - `src/parser/structural-checks.ts:391` — `walkBlock`, the nested-block
    walk (fn bodies, `par for` bodies, BlockExprs, `if` / `while` / `for`
    bodies). It consumes the flag (`:398`) and, when the block has a tail,
    pushes `checkUnreachableCode({ hasCodeAfterReturn: true }, { file,
    range: block.tail.range })` (`:407-411`) before `walkExpr(block.tail,
    …)` (`:413`). This tail arm landed with the 0510 fix.
  - `src/parser/functions.ts:406` — `checkUnreachableCode`; its doc comment
    (`:401-404`) still describes the trigger as "a statement follows a
    `return`".
- **Spec:**
  - `docs/spec_topics/diagnostics/code-registry-parse.md:96` — the
    `theta/parse/unreachable-code` row, Trigger: "Code appears after a
    `return` in the same block: a statement, or the block's tail
    expression." The 0510 commit widened this Trigger from the statement
    case. The Trigger is scoped to "the same block", not to nested blocks.
  - `docs/spec_topics/grammar.md:115` — the top level of a `.theta` file is
    a *body block* ("*body blocks* (a function body, the top level of a
    `.theta` file)"); `:120` — `ThetaBody ::= Stmt* Expr?`, the same
    statement-list-plus-optional-tail shape as `FnBody`.
  - `docs/spec_topics/return.md:3` — `return expr` "exits the enclosing
    function (or top-level theta) immediately"; `:21` — "From a top-level
    theta, `return expr` exits the theta with `expr` as its return value";
    `:22` — RET-3: "Code after a `return` in the same block is unreachable;
    the parser produces `theta/parse/unreachable-code` (warning, not
    error)."

## Symptom

```
fn pn(n: number): number { n }
return 1
pn(1)
```

loads with zero diagnostics. The `pn(1)` tail never runs. The same two
lines inside a `fn` body (`fn f(): number { return 1⏎ pn(1) }`) warn
`unreachable code after return` at `pn(1)`.

## Expected (spec citations)

The top level of a `.theta` file is a body block (grammar.md:115, :120). A
top-level `return` exits the theta (return.md:3, :21). A tail expression
after it in the same block is unreachable code, and the parser produces
`theta/parse/unreachable-code` at the tail (return.md:22 RET-3;
code-registry-parse.md:96, "a statement, or the block's tail expression").
The warning is the same at depth 0 as in a nested body block.

## Actual (implementation citations)

`checkStructural` walks the `ThetaBody`'s statements through
`walkStatements` and drops the returned flag (`structural-checks.ts:317-325`),
then walks the tail with `walkExpr` only (`:326-334`). The RET-3 tail arm
exists only in `walkBlock` (`:407-411`), which `checkStructural` does not
call for the body itself. The statement-pair arm inside `walkStatements`
(`:374-381`) runs at depth 0, so a statement after a top-level `return`
warns; a tail after it does not.

Probe results (scratch `vite-node` script outside the tree, production
`parseThetaDocument` (`src/parser/theta-document.ts:149`) with an inert
system-note channel and a resolving model matcher; HEAD 0eb38a8a, 0.496.0,
2026-10-03). Each source is prefixed with `---⏎mode: prompt⏎---⏎`, so
the first body line is line 4; `PN` is `fn pn(n: number): number { n }⏎`.

| cell | body | `ThetaBody` shape | diagnostics |
|---|---|---|---|
| D1 | `return 1⏎2` | `tail=number stmts=[return]` | none |
| D2 | `PN` + `return 1⏎pn(1)` | `tail=call stmts=[fn,return]` | none |
| D5 | `fn r(): Result<number, string> { Ok(1) }⏎return r()?⏎2` | `tail=number stmts=[fn,return]` | none |
| D4 | `return 1⏎let x = 2⏎x` | `tail=ident stmts=[return,let]` | `unreachable-code` @5:1 (the `let`) |
| N1 | `fn f(): number { return 1⏎ 2 }⏎f()` | (fn body tail `2`) | `unreachable-code` @5:2 |
| N2 | `let r = { return 2⏎ 3 }⏎r` | (BlockExpr tail `3`) | `unreachable-code` @5:2 |
| C1 | `PN` + `let a = 1⏎pn(a)` | `tail=call stmts=[fn,let]` | none |

D1, D2 and D5 are the defect: the parser records the post-`return` form
as `Block.tail` and emits nothing. D4 shows the statement-pair arm firing
at depth 0. N1 and N2 are the nested positions the 0510 tail arm covers.
C1 is the no-`return` control.

The 0510 fix report states the depth-0 tail case was silent before that
fix as well (`.pi/tmp/fixes/0510-report.md` §Residuals item 5).

## Root cause

The 0510 fix moved the RET-3 tail judgement into `walkBlock` because
`"final-form"` tail promotion relocates a post-`return` form from
`Block.statements` to `Block.tail` in `FnBody` / `ParForBody` / `BlockExpr`.
`checkStructural` does not route the depth-0 body through `walkBlock`; it
inlines `walkStatements` plus `walkExpr(tail)` and was left on the
statement-pair-only rule, recorded in its own comment at `:317-318`. At
depth 0 the `"line-start"` mode promotes any final expression form that
begins a logical line, so every expression written on its own line after a
top-level `return` lands in `Block.tail`, the slot this walk never judges.

## Fix direction

In `src/parser/structural-checks.ts`, `checkStructural` walks the
`ThetaBody` with `walkBlock(body, { inLoop: false, topLevel: true,
voidReturn: false }, refs, file, out)` in place of the inlined
`walkStatements` call (`:319-325`) and tail `walkExpr` (`:326-334`).
`walkBlock` (`:391-415`) performs exactly those two walks with one scope
plus the RET-3 tail arm, so the statement checks and the tail's own
expression checks are unchanged and the tail after a top-level `return`
warns at `body.tail.range`. Same registry row
(`theta/parse/unreachable-code`), same message, no new code, no spec edit.

Comment-only companions:

- The `:317-318` comment is replaced; it describes the behaviour this fix
  removes.
- `checkUnreachableCode`'s doc comment (`src/parser/functions.ts:401-404`)
  states the widened Trigger: a statement, or the block's tail expression.

Witness (parse-only, through `parseThetaDocument`): D1, D2 and D5 each
carry `theta/parse/unreachable-code` starting at the tail's first token
(5:1, 6:1, 6:1) — RED at 0eb38a8a with no diagnostic. Controls: C1 stays
free of `unreachable-code`; D4 still carries exactly one `unreachable-code`,
at the `let` (the `x` tail follows a `let`, not a `return`).

Constraints:

- The 0510 witness's RET-3 cells stay green:
  `tests/b0510-block-trailing-call-tail.test.ts` R10 (`:617`), R11
  (`:629`), the fn-body return-then-call cell (`:641`) and the no-return
  control (`:652`).
- `tests/par-for-body-return-refusal.test.ts` (c1) (`:414`) keeps its
  single `unreachable-code` beside the CTRL-4 refusal.
- `tests/committed-fixture-parse-gate.test.ts` requires zero diagnostics,
  warnings included, from every committed `.theta` / `.thetalib`. No
  tracked `.theta` file has a line beginning `return ` (column 0); the
  full default suite decides any other fixture.

## Repro

Through the production parser, with any `ParseThetaDocumentDeps` (e.g.
the inert channel and resolving matcher of `tests/helpers/e2e-s1.ts:60-68`):

```ts
const src = "---\nmode: prompt\n---\nreturn 1\n2";
const doc = parseThetaDocument(
  { path: "p.theta", bytes: new TextEncoder().encode(src) },
  deps,
);
doc.body.tail?.kind;                       // "number"
doc.diagnostics.map((d) => d.code);        // [] — expected ["theta/parse/unreachable-code"]
```

Wrapping the same two lines in `fn f(): number { … }⏎f()` yields
`["theta/parse/unreachable-code"]`.

## Related

- [0510](./0510-block-trailing-call-value-discarded.md) — parent fix;
  added the `walkBlock` RET-3 tail arm and widened the registry Trigger;
  this report is its residual 5.
- [0223](./0223-par-for-body-return-folds-unenumerated.md) — owns
  `tests/par-for-body-return-refusal.test.ts`, whose (c1) cell pins RET-3
  beside the CTRL-4 refusal.
