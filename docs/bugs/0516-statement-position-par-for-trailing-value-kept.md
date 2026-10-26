# Bug 0516 — a statement-position `par for` that is the last form of a `FnBody`, `ParForBody` or `ThetaBody` yields its `array<Result<…>>` value as the block's final value, although control-flow.md and `parseForm`'s own comment call that value discarded: `parseForm` keeps the `par for` out of tail promotion as an `expr` statement, and `executeBlock`'s trailing-`expr` tail-equivalence rule hands the value back

- **Status:** fixed (unreleased - commit/push only). No new package release
  is published; this fix is not in the existing published package version.
  No resolving commit SHA is assigned in this record; the shipment commit
  will supply it. Filed 2026-10-03 as residual 6 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix
  (0.496.0)` Residuals, item 6). The divergence predates 0510; the 0510
  witness pins the observed value as a control.
- **Decision:** option (a) approved — retain final values with required
  structural-tail/static-inference alignment; see §Approved ruling.
  Implemented and independently reviewed; see §Fix (unreleased).
- **Owning repo:** pi-theta
- **Sev/Diff estimate (at filing, before ruling):** S4/D3 — S4: the spec contradicts itself on this
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

## Approved ruling

The operator approved option (a): a final `par for` supplies the value of a
`FnBody`, `ThetaBody`, `ParForBody`, or `BlockExpr`, like other tail expressions.
Non-final uses and `StmtBlock` uses discard the value; `void` retains its
existing discard behavior.

Represent the value-producing use as a real structural tail and align static
return inference with runtime behavior. The parse-shape alignment described
as optional in the original analysis below is required by this ruling; merely
updating prose while leaving inference blind to the returned value is not a
complete fix. Coordinate depth-0 promotion with the approved final-form rule
in bug 0517, without expanding statement-block return contributions. Bug 0512
is fixed in 0.497.0 and is no longer an outstanding collector blocker.

The competing readings below document the pre-ruling ambiguity; option (b)
was not selected. The original analysis and filing-time citations are preserved
as historical evidence; the completed correction is recorded in §Fix (unreleased).

## Expected (pre-ruling spec analysis)

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

Option (a) is approved, with structural-tail/static-inference alignment
required as stated above. Option (b) is retained only as historical analysis.

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
  - Required parse-shape alignment under the approved ruling: dropping the
    `par-for` exclusion at
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

## Fix (unreleased)

The approved option (a) is implemented: final `par for` forms are structural
tails visible to static inference, and retain their existing array values.
Non-final uses and `StmtBlock` uses still discard; explicit `void` retains its
existing discard behavior. No new package release is published. This record
does not attribute the fix to the package version printed by earlier commands,
and does not assert a commit, push, merge, tag or publication.

### Cause and actual change

`BodyParser.parseForm` (`src/parser/body-parser.ts:589-591`) now keeps the
parsed expression in `Form.expr` instead of setting it to null for `par-for`.
Existing `parseForms` promotion (`:487-496`) selects the final expression and
removes its statement wrapper, so it is not duplicated in `Block.statements`.
FnBody, ThetaBody, ParForBody and BlockExpr use the existing final-form policy;
StmtBlock keeps its existing line-start policy and owning-statement discard.

This is the only executable production change. Owning-tail return collection
(`collectReturnContributions`, `src/parser/type-layer-walk.ts:856-900`) and
nested par-for element inference (`src/parser/static-type-inference.ts:589-592`)
already consume structural tails. They now see the array rather than an empty
tail. Incompatible early number returns and final array tails produce the
existing `theta/parse/return-no-common-type` error and are refused at real SDK
registration. There is no new collector, loader or diagnostic policy.

The exact approved clauses in `docs/spec_topics/control-flow.md:70` and
`docs/reference/grammar.md:321-330` reconcile the prior prose with FN-3/FN-4/FN-5
(`docs/spec_topics/functions.md:26-44`). Parser explanations, `executeBlock`'s
comment (`src/runtime/statement-executor.ts`) and `trailingExpr`'s comment
(`tests/helpers/e2e-s1.ts`) now describe the same rule. Runtime executable code,
the helper implementation and BlockExpr's defensive fallback are unchanged.
No scheduling, Result representation, isolation, side-effect, panic or
cancellation behavior is changed.

### Preserved red and post-fix green evidence

Durable artifact directory **R** (all log/report names below resolve here):

`/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0516-848ce17a-5047-49e7-ba1d-9684fb16b9cf`

Each row is an earlier captured command, not a test rerun during closure.
Commands ran in the dedicated worktree with the then-current ready bootstrap's
external temporary directory exported as TMPDIR/TMP/TEMP. Exact shell wrappers,
hashes, exit accounting and scope decisions are in R/close.md, reproduce.md,
diagnose.md, implement.md and preserved history/ reports.

| Exact command | Pre-fix evidence | Post-fix evidence |
|---|---|---|
| `npx vitest run tests/b0516-final-par-for-e2e.test.ts` | reproduce-a1-e2e-final.log, exit 1: nine shape/type/missing-diagnostic failures, seven healthy controls | implement-a3-e2e.log and green-1-0.json, exit 0: all 16 cells |
| `npx vitest run tests/b0516-final-par-for-unit.test.ts` | diagnose-a1-unit.log, exit 1: seven raw-parser/type failures, five controls | implement-a3-unit.log and green-1-2.json, exit 0: all 12 cells |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0516live-final-par-for-registration.test.ts` | reproduce-a1-live.log, exit 1: cellb0516final incorrectly registers, after healthy/refusal/assertion-direction controls | implement-a3-live.log, green-1-1.json and gate-1-initial-2.json, exit 0: final conflict refused, healthy registrations retained |

The accepted structural failure is `expected 'tail=null statements=[expr]' to
be 'tail=par-for statements=[]'`; the exact type failures expose false null
payloads, and the public-diagnostic failure is `expected []` instead of the
required number/array conflict diagnostic. Production success and exact retained
array checks run before the structural assertions. The real SDK failure is a
command object where undefined is required, not a provider error or a resolved
prompt. Original controller red-0/1/2.json, witness sources, manifest, argv and
failure signatures remain unchanged. Initial test-authoring failures are
preserved but excluded from accepted proof.

The E2E uses real parsing, production composition and execution with inert
surrounding-host doubles; it does not itself prove child/provider transport.
The separate on-disk real SDK discovery/registration witness proves the direct
load-time observable without a provider turn. Independent review also observes
the same healthy registrations and conflict refusals through both repo-pinned
Pi 1.3.0 and the operator's installed Pi 1.4.0 (review-fix-independent-live.log
and review-fix-independent-operator-host.log, exit 0).

### Controls, migrations and gates

Frozen controls retain void/non-final/StmtBlock discard, BlockExpr value/type,
exact diagnostics and assertion rejection directions. Fourteen additive tests
in `tests/b0516-final-par-for-controls.test.ts` cover eight raw if/else/while/for
single/multi layouts and six taken production discard cases. Existing 0512
owning-return isolation and 0517 packed/alias final-form rules remain covered.
The whole par-for suite retains its failure, panic, cancellation and aggregation
checks. Shared-parser child/live controls observe actual values and settled
failure-note absence, not prompt resolution.

Delegated exact decisions separately authorized the two normative replacements,
Cases A/B's obsolete final-shape pins, and Cases C/D/E's collector-shape/reference
count pins. Original final fixtures, genuine unknown-identifier diagnostic,
downstream collector assertions and exact `[makeOk(42)]` runtime equality remain.
A separate non-final fixture retains discarded-use legality. Strict reference
count is 778 after the approved +6 lines; the immediate old 772 count now has an
explicit rejecting control, alongside older negative counts. No file-wide
rebaseline, permissive old/new oracle, skip or weakened helper was used. Original
sources and post-patch/pre-migration reds remain in R.

| Exact command | Capture under R | Exit/result |
|---|---|---|
| `npm test` | implement-a4-default.log; gate-1-initial-1.json | 0: 779 files, 13,320 tests pass in each completed run |
| `npm run typecheck` | implement-a3-typecheck.log; gate-1-initial-0.json | 0 |
| `npm run lint` | implement-a3-lint.log | 0 |
| `npx vitest run tests/committed-fixture-parse-gate.test.ts` | implement-a3-corpus.log | 0: all 67 shipped-fixture cases |
| `npx vitest run tests/b0516-final-par-for-controls.test.ts tests/par-for.test.ts tests/b0510-block-trailing-call-tail.test.ts tests/b0512-stmtblock-return-contributions-unit.test.ts tests/b0517-depth0-final-form-unit.test.ts` | implement-a3-controls.log | 0: all 239 tests |
| `npx vitest run tests/theta-callable-call-arity.test.ts tests/grammar-literal-forbidden-access-naming.test.ts tests/b0513-legacy-oracle-direction.test.ts` | implement-a3-cde.log | 0: all 59 tests, including downstream collector assertions |
| `npx vitest run tests/b0517-depth0-final-form-real-child.test.ts` | implement-a3-real-child-control.log | 0: all three real-child controls |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0517live-depth0-final-form-live-cell.test.ts` | implement-a3-live-shared-parser.log | 0: all three provider/invoke controls |

The earlier implement-a3-default.log remains incomplete after an execution-tool
timeout; that invocation's command exit is unknown, not a green result. The
fresh authorized attempt-4 retry completes with exit 0 under an explicit
1200-second tool timeout. The original six migration failures in
implement-a2-default.log remain preserved, not rewritten as successful runs.

### Independent review and remaining scope

R/reviews.md verdict is **CLEAN — no actionable in-scope must-fix finding**.
The reviewer reruns ten complete focused files (326 tests, exit 0,
review-fix-independent-tests.log), checks exact authorizations and preserved
red evidence, verifies both SDK hosts, and confirms all 4,190 checkout hashes
match the reviewed retry context (review-fix-independent-integrity-v2.log).
Closure entry independently confirms reviewed/verified content and gate digests
match before the two documentation edits (close-a1-entry.log, exit 0).

No additional residual correctness bug is established by this fix review.
Already-filed invocation-prose 0509, imported-schema typing 0518 and Windows
spawning 0519 remain separately owned; no claim is made to fix them. Historical
and already-stale numeric citations identified in the bounded plan census remain
unchanged. Child/provider checks supplement the shared parser surface; there is
no new par-for-specific transport witness or full live-suite claim. No gate is
waived and closure grants no shipment authority.

## Provenance

- Approved ruling above: prior owner selection of retained values with required
  structural/inference alignment; original filing analysis remains historical.
- FN-3/FN-4/FN-5, CTRL-3/CTRL-4/CTRL-5 and Reference §Blocks: owning-tail typing,
  value/discard boundaries, isolation and unchanged failure/cancellation contract.
- `BodyParser.parseForm`/`parseForms`, `collectReturnContributions` and par-for
  static inference: causal correction described above; runtime/helper diffs are
  comment-only.
- R/reproduce.md, diagnose.md, plan.md, implement.md, decision-authorizations.md,
  reviews.md, close.md and named captures: original reds, exact approved scope,
  completed green verification, independent review and unreleased closure.
