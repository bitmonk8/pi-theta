# Bug 0512 — `collectReturnContributions` counts the tail of every nested `if` / `else` / `while` / `for` body as a return contribution, so a legal annotation-less `fn` whose if-body ends in a value of another type than the fn's own tail draws a spurious `theta/parse/return-no-common-type`; FN-3 reconciles only the body's own tail and its `return` operands

- **Status:** fixed (0.497.0 - version bump and commit/push only). No npm
  publication or tag is claimed; the existing 0.496.0 package does not contain
  this fix. Originally
  filed 2026-10-03 as residual 2 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix (0.496.0)`
  Residuals item 2; round-1 probe P3b). The defect predates that fix.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D1 — S2: conformant input is refused with an
  error-severity diagnostic (``fn f(n: number) { if n > 0 { @<Item>`d`? }⏎
  n }``), and whether it is refused depends on how many forms the if-body
  holds, not on FN-3; the same over-count feeds the annotated `subagent fn`
  boundary check and the cross-file `invoke<T>` callee payload (derived from
  source, not measured). D1: the fix narrows one private walker in one file
  (`src/parser/type-layer-walk.ts`); no new registry row, no spec edit; the
  witness is a handful of parse-level cells beside existing bug-0510
  controls.
- **Blocks:** widening bug 0510's tail promotion to `StmtBlock` bodies
  (`parseIf` / `parseWhile` / `parseFor` from `"line-start"` to
  `"final-form"`). The 0510 fix record names four static readers that
  read a promoted `StmtBlock` tail as a value position:
  `collectReturnContributions` (this bug), `walkIdentBlock`,
  `rewriteReturnAwareBlock`, and QRY-19
  ([0511](./0511-qry19-stmtblock-tail-single-vs-multi.md)). Bug 0513's
  call-type fix ([0513](./0513-call-static-type-nominal-not-return-type.md))
  lands AFTER this one: its probe G1 measures that resolving call static
  types alone newly triggers this bug's spurious `return-no-common-type`.
- **Where (pi-theta, main 0eb38a8a, 0.496.0):**
  - `src/parser/type-layer-walk.ts:855-898` — `collectReturnContributions`.
    Its inner `visitBlock` (`:860-867`) pushes `b.tail` as a contribution
    (`:864-866`) for EVERY block it visits, and `visitStmt` calls
    `visitBlock` on the `if` then-block and else-block (`:875-884`), the
    `while` body (`:885-887`) and the `for` body (`:888-890`). A
    `StmtBlock`'s tail is therefore added beside the fn body's own tail. The
    method's doc comment (`:849-854`) states the narrower FN-3 set: "every
    `return` operand and the body's tail expression".
  - `src/parser/type-layer-walk.ts:900-908` — `contributionOf`: a `query`,
    `try` or `result-ctor` expression contributes a `result` carrying its
    success payload (`:904-905`); anything else a `plain` type. An if-body
    tail ``@<Item>`d`?`` therefore contributes payload `Item`.
  - Three consumers read the walk:
    - `:767-777` — an annotation-less `fn`: `resolveReturnType` over the
      contributions; an `inference-no-common-type` result pushes the
      diagnostic (`:776`).
    - `:802-847` — `checkSubagentReturnAnnotation` (walk at `:822`): an
      annotated `subagent fn`'s inferred Ok payload, checked against the
      annotation through `checkInvokeReturnType`.
    - `:959-976` — `inferFinalValuePayload` (walk at `:964`), reached from
      `inferCalleeReturnPayload` (`src/parser/type-layer-checks.ts:429-440`)
      and from there `resolveCalleeReturnType`
      (`src/extension/production-composition.ts:3074-3087`): the cross-file
      `invoke<Schema>` return-type leg's callee payload.
  - `src/parser/functions.ts:255` — `resolveReturnType`. It wraps when
    `hasQuestion` or any contribution is a `result` (`:277-278`), infers the
    FN-4 `null` literal type for an empty contribution list (`:282`), and
    mints `theta/parse/return-no-common-type` when the LUB of the payloads
    is undefined (`:299-314`).
  - `src/parser/body-parser.ts:846`, `:858`, `:875`, `:920` — `parseIf`
    (then, else), `parseWhile` and `parseFor` parse their bodies under
    `"line-start"` promotion. `parseForms` (`:425-511`) starts every block
    with `sawSep` true for its first form (`:436`) and restores `lineStart`
    after a form ending in postfix `?` or `}` (`:481-484`); the promotion
    test is `:502-503`. A single-form `StmtBlock`, or one whose final form
    follows a `?`- or `}`-terminated form, therefore has a non-null
    `Block.tail`; any other multi-statement `StmtBlock` has `tail: null`.
- **Spec:**
  - `docs/spec_topics/functions.md:26` (FN-3) — "the inference reconciles
    the tail-expression type (or the implicit `null` of an empty-tail body,
    per **Empty-tail body** below) with the operand type of every early
    `return expr` syntactically present in the body, regardless of static
    reachability". The contributions are the body's own tail and every
    `return` operand. A nested statement block's tail is neither.
  - `docs/spec_topics/functions.md:28` — "The inferred type is wrapped in
    `Result<T, QueryError>` when the body can short-circuit with an `Err`:
    when any `?` appears in the body (whose `Err` arm desugars to `return
    Err(e)`) or when any contributing operand is itself `Result`-typed." A
    `?` forces the wrap and contributes the `QueryError` arm; its success
    value is not a contribution.
  - `docs/spec_topics/functions.md:36` (FN-4) — a body whose last form is an
    "`if`-statement form" (among others) has no tail expression and infers
    `null`.
  - `docs/reference/grammar.md:281` — `StmtBlock ::= "{" Stmt* Expr? "}"
    // statement-form control-flow body; value discarded`; `:298-301` — "A
    tail `Expr` in a `StmtBlock` is evaluated and discarded — except a tail
    expression ending in postfix `?`, which still early-returns on failure."
  - `docs/spec_topics/diagnostics/code-registry-parse.md:48` — the
    `theta/parse/return-no-common-type` row. Trigger: "A theta or
    annotation-less-`fn` body whose tail-expression type and early-`return`
    operand types (every `return` syntactically present, regardless of
    static reachability) share no common upper bound and no sink narrows
    them." Message mirrored at `docs/reference/diagnostics.md:96`.

## Symptom

```
schema Item { a: string }
fn f(n: number) { if n > 0 { @<Item>`d`? }
  n }
f(1)
```

draws `theta/parse/return-no-common-type` (`return operands have no common
type; annotate the function return type or reconcile the operands`) at
`fn f`. Measured as round-1 probe P3b of the bug-0510 fix, at the pre-fix
HEAD 71ebf420. The 0.496.0 fix kept `parseIf` on `"line-start"` and did
not edit `type-layer-walk.ts` (0510 fix record, What shipped), so the path
at 0eb38a8a is the one traced in §Actual.

The same fn with a second form ahead of the query in the if-body —
``if n > 0 { let p = "x"⏎ @<Item>`d ${p}`? }`` — loads clean. That shape is
pinned green by the witness control at
`tests/b0510-block-trailing-call-tail.test.ts:669-684`.

## Expected (spec citations)

Under FN-3 (`functions.md:26`) `f`'s contributions are its own tail `n`
(`number`) and no `return` operand. The `?` in the if-body forces the wrap
(`functions.md:28`). `f` infers `Result<number, QueryError>` and draws no
diagnostic. The if-body's ``@<Item>`d`?`` value is discarded on success
(`grammar.md:298-301`); its failure arm early-returns `Err(e)`, which the
wrap already covers. The verdict is the same whether the if-body holds one
form or several.

## Actual (implementation citations)

`parseIf` parses the then-block under `"line-start"`
(`body-parser.ts:846`). Its only form is the first form, so `sawSep` is
true (`:436`) and `parseForms` promotes it: `Block.tail` is the `try`
expression. `collectReturnContributions` visits the then-block
(`type-layer-walk.ts:876`) and pushes its tail (`:864-866`);
`contributionOf` maps the `try` to `{ kind: "result", payload: Item }`
(`:904-905`). The fn body's own tail `n` adds `{ kind: "plain", type:
number }`. `resolveReturnType` finds no common upper bound of `Item` and
`number` and returns the diagnostic (`functions.ts:299-314`), which the fn
walk pushes (`type-layer-walk.ts:776`).

In the multi-statement variant `parseForms` does not promote the then-block's
final form (it is not `lineStart`), so the block's tail is `null` and the
walk adds nothing. The verdict follows the parser's promotion state, not
FN-3.

Two further effects follow from the same walk (derived from source, not
measured):

- An empty-tail body whose last form is an `if` / `while` / `for` with a
  promoted tail — `fn g(c: boolean) { let a = 1⏎ if c { "s" } }` — has a
  non-empty contribution list, so inference yields `string` where FN-4
  assigns the `null` literal type. The annotated `subagent fn` check
  (`:822`) and the cross-file callee payload (`:964`) read that inferred
  payload.
- A body whose own tail and a nested `StmtBlock` tail share no upper bound
  makes `resolveReturnType` return `inference-no-common-type`; both
  `checkSubagentReturnAnnotation` (`:827-829`) and `inferFinalValuePayload`
  (`:969-971`) then return without a payload, so the boundary check that
  FN-3 would run is skipped.

## Root cause

`collectReturnContributions` uses one `visitBlock` for two jobs: collecting
`return` operands, which FN-3 counts at every depth, and collecting the
tail, which FN-3 counts only for the body itself. Recursing into the
`StmtBlock` bodies is required for the first job and wrong for the second.
Before bug 0510's fix the over-count surfaced only for `StmtBlock`s the
`lineStart` gate happened to promote; the 0510 fix kept `StmtBlock`s on that
gate, partly because promoting their tails structurally fed them into this
walk and broke clean-loading code (0510 `## Fix (0.496.0)`, "Why the scope
is narrower", and review finding F1).

## Fix direction

In `src/parser/type-layer-walk.ts`, `collectReturnContributions` adds the
tail of the block it is called on (the fn or theta body) and nothing else:

1. Push `block.tail` once, for the top-level `block` argument only.
2. Keep descending into `if` then/else (including `else if` chains,
   `:881`), `while` and `for` bodies, but visit only their statements,
   collecting `return` operands. A nested `StmtBlock`'s `tail` is not visited for
   contributions.
3. `bodyHasQuestion` stays as is: it already scans every nested block and
   expression, so a `?` anywhere in the body still forces the wrap
   (`functions.md:28`).
4. The doc comment at `:849-854` already states this rule.

The three consumers (`:768`, `:822`, `:964`) pick up the change with no
edit. No new diagnostic code, no registry or spec edit.

Constraints:

- The bug-0510 witness cells stay green unchanged: the StmtBlock parity
  controls the fix record names P3, P6, S2 and Q1
  (`tests/b0510-block-trailing-call-tail.test.ts:668-706`, the
  `return-no-common-type`, `type-as-value` and `discarded-query-result`
  cells), the StmtBlock runtime discard control (`:414`), and the inference
  cells P9 (`:732`), Q8 (`:739`) and S1 (`:747`).
- `return` operands inside nested `StmtBlock`s keep contributing (FN-3:
  "every early `return expr` syntactically present in the body").
  `tests/type-layer-diagnostics-production.test.ts:179-185` pins it:
  `fn f() { if true { return 1 }⏎ return "a" }` draws
  `return-no-common-type`.

Witness cells, each RED at 0eb38a8a (by source reading; the first is the
measured P3b):

- P3b as in §Symptom: no `return-no-common-type`.
- The same with the if-body tail a string, a `match`, and a `?`-preceded
  final form (`if n > 0 { let a = g()?⏎ "s" }`): no
  `return-no-common-type`.
- An `else` body and a `for` / `while` body carrying the same single-form
  tail: no `return-no-common-type`.
- `inferCalleeReturnPayload` over a `.theta` body
  `let a = 1⏎ if a > 0 { "s" }` returns the FN-4 `null` literal type, not
  `string`.

Controls: an if-body `return "s"` beside a `number` tail still draws
`return-no-common-type`; the multi-statement P3 variant stays clean; a fn
whose own tail and `return` operands agree stays clean.

Ordering: this fix is a prerequisite for widening 0510's tail promotion to
`StmtBlock` bodies. That widening also needs the QRY-19 `StmtBlock`-tail
ruling ([0511](./0511-qry19-stmtblock-tail-single-vs-multi.md)), a
`type-as-value` decision for a `StmtBlock` tail read by `walkIdentBlock`
(`src/parser/ident-resolution.ts:240`), and a re-measure of
`rewriteReturnAwareBlock` (`src/parser/query-schema-resolve.ts:315`).

## Fix (0.497.0 - version bump and commit/push only)

### What changed

`src/parser/type-layer-walk.ts`, `collectReturnContributions`, now uses its
recursive block walk only to discover explicit `return` operands. After that
walk, it appends the initial owning body's tail once, if present. The existing
if/else/else-if/while/for recursion and explicit-return ordering are retained;
nested function declarations remain separate owners. The owning tail remains
last in contribution order.

The question scan, Result contribution projection, LUB/compatibility, null
fallback, diagnostics and all three consumers are unchanged. A discarded
nested success value no longer contaminates the fn/theta payload, while a
nested `?` still forces wrapping. Genuine conflicting explicit nested returns
still draw the registered diagnostic. The annotated subagent declaration
check and callee-payload inference inherit the correction without adapter or
runtime changes.

`src/parser/body-parser.ts` changes only its TailPromotion comment, removing
return inference from the list of static readers of a discarded statement
block tail. No parser-promotion behavior, executor behavior, normative spec,
diagnostic code or dependency changes. After the scoped fix and final review,
the owner explicitly requested a version bump before commit/push:
`package.json` and the two root package-lock version fields are now 0.497.0,
and `CHANGELOG.md` records this fix and the already-committed host-floor change.
This is version metadata, not an npm publication or a tag.

### Evidence and verification

Run artifacts:
`.pi/tmp/fix-bug-0512-d67a6b29-11c8-4c4b-a0da-0345907b434d/`.
Base HEAD: `6226073675c951d03e6ffab71e606f3a1e56306e`.

| Evidence | Actual result |
|---|---|
| Original frontend E2E, `red-0.json` / `diagnose-e2e-red.log` | 7 correct-reason failures / 4 controls pass |
| Original collector units, `red-1.json` / `diagnose-unit-final-red.log` | 22 correct-reason failures / 16 controls pass |
| Supplemental pre-fix, `implement-boundaries-final-red.log` | 6 collector failures / 3 controls pass |
| E2E post-fix, `green-1-0.json` | 11/11 pass, exit 0 |
| Units post-fix, `green-1-1.json` | 38/38 pass, exit 0 |
| Focused coverage, `continue-focused.log` | 9 files / 236 tests pass, exit 0: all 58 b0512 tests plus 178 controls |
| Typecheck, `gate-1-initial-0.json` | `npm run typecheck`, exit 0 |
| Default suite, `gate-1-initial-1.json` | `npm test`, 738 files / 12,417 tests pass, exit 0 |
| Lint, `continue-lint.log` | `npm run lint`, exit 0 |
| Independent scoped fix review, `reviews.md` | CLEAN, no in-scope must-fix findings; read-only snapshot check passes |

Witness commands are `npx vitest run` on
`tests/b0512-stmtblock-return-contributions-e2e.test.ts` and
`tests/b0512-stmtblock-return-contributions-unit.test.ts` (the latter with
`--reporter=verbose`). The focused command additionally runs
`tests/b0512-stmtblock-return-contributions-boundaries.test.ts`,
`tests/b0510-block-trailing-call-tail.test.ts`,
`tests/type-layer-diagnostics-production.test.ts`,
`tests/functions-and-return.test.ts`,
`tests/subagent-fn-return-annotation.test.ts`,
`tests/fn-return-void-query-sink.test.ts` and
`tests/committed-fixture-parse-gate.test.ts`. Exact command/capture ledgers are
in `implement.md` and `continue.md`; controller JSON records retain full argv,
output and actual exit codes. No original red log or witness manifest was
replaced. The default-suite count includes separately requested workflow
reporting tests; those reporting changes are not part of this fix or its
scoped review verdict.

Implementation initially stopped on TS2345 in two test helpers: they passed a
Map where the `TypeEnv` constructor argument requires a record. The owner
explicitly approved replacing only those second arguments with `{}` in the
unit and supplemental helpers. `fixture-correction-approval.md` amends the
plan's byte-for-byte test freeze for this exact exception, and
`continue-fixture-check.log` verifies complete file bytes differ only at the
authorized argument. Assertions, original E2E bytes, witness commands and
signatures remain unchanged. Typecheck is green after this correction; its
prior red is preserved, not waived or classified as infrastructure.

### Boundary and residuals

The E2E drives real source bytes through the production frontend to public
diagnostics; units isolate the collector with real inference/resolution, and
supplements exercise null payloads, annotated boundaries, promotion escape
shapes and wrapping ownership. This is static frontend/inference evidence,
not proof of provider turns, runtime Result carriage or filesystem cross-file
execution. No live-exercised implementation path changed;
`live_required: false` remains justified and no live-provider pass is claimed
for this bug.

The committed-fixture gate passes, and no shipped theta source was changed
for 0512. Independent review recomputed matching checkout, witness and
specification digests. The owner approved the version bump and commit/push after review; no resolving
SHA, npm publication or tag is invented here.

The QRY-19/sink ruling (0511), call static types (0513), runtime fn Result
carriage (0514), depth-zero unreachable-tail warning (0515), statement-position
`par for` ruling (0516), and depth-zero promotion ruling (0517) remain outside
scope. This fix removes 0513's collector prerequisite, but does not authorize
broader statement-block promotion or resolve those other bugs.

## Related

- [0510](./0510-block-trailing-call-value-discarded.md) — parent fix; this
  report is its residual 2. Its "Why the scope is narrower" bullet records
  the `return-no-common-type` regressions that structural `StmtBlock`
  promotion produced through this walk.
- [0511](./0511-qry19-stmtblock-tail-single-vs-multi.md) — residual 1 of the
  same fix: QRY-19's single-form vs multi-statement `StmtBlock`-tail
  verdicts. Same single-vs-multi asymmetry, different static reader.
