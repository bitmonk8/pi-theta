# Bug 0511 — QRY-19 (`theta/parse/discarded-query-result`) at a `StmtBlock` tail depends on how many forms the block holds: the single-form `if c { @`q` }` is silent and resolves the query against the enclosing fn's return-type sink, while the multi-statement `if c { let z = 1⏎ @`q` }` draws `discarded-query-result` and leaves the query untyped, because `"line-start"` tail promotion keys the statement-vs-tail split on `lineStart`, which in-brace newline swallowing makes false for every non-first form; the spec gives textual support to "both draw QRY-19" and to "both are silent", and supports the split under neither reading

- **Status:** fixed (unreleased - commit/push only). No new package release is
  published; this fix is not in the existing published package version. No
  resolving SHA is assigned here; the shipment commit will supply it.
- **Filing context:** filed 2026-10-03 as residual 1 of the bug-0510 fix
  ([0510](./0510-block-trailing-call-value-discarded.md), `## Fix (0.496.0)`
  Residuals item 1; review round 1, R4; review probes Q1–Q5). The behaviour
  predates that fix and is unchanged by it: the fix keeps the `StmtBlock`
  bodies of `if` / `else` / `while` / `for` on `"line-start"` promotion
  (0510 §Fix (0.496.0), "Why the scope is narrower").
- **Decision:** Resolution A approved and implemented — QRY-19 for both forms,
  no enclosing return-type sink; see §Approved ruling and §Fix below.
- **Owning repo:** pi-theta
- **Sev/Diff estimate (at filing, before ruling):** S2/D3 — S2: one of the two forms is wrong under
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

## Approved ruling

The operator approved Resolution A: a bare query at the tail of a `StmtBlock`
raises QRY-19 regardless of form count, line packing, or the preceding form.
A `StmtBlock` tail is not an enclosing-function return-type sink. Require `?`
to propagate failure or `let _ = …` to deliberately discard the result.

Implement Resolution A below, including its spec amendments and authorized
re-pins. Preserve postfix-`?` early return and the existing value-producing
`FnBody`, `ParForBody`, and `BlockExpr` rules. This ruling does not authorize
broader statement-block tail promotion. Bug 0512 is fixed in 0.497.0; its
historical blocker is no longer outstanding.

The competing readings below document the pre-ruling ambiguity; Resolution B
was not selected. Resolution A is now implemented; the historical observations
and alternatives below are preserved, with current evidence in §Fix.

## Expected (pre-ruling analysis)

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

Resolution A is approved by the ruling above. The alternatives below retain
the original analysis; only A is authorized. It must yield one verdict for a
bare-query `StmtBlock` tail independent of form count, including the
postfix-`?`- and `}`-preceded shapes.

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
- **[0512](./0512-return-contributions-count-stmtblock-tails.md) (fixed
  0.497.0, no new package release published)** — 0510 Residuals item 2:
  `collectReturnContributions` formerly counted `StmtBlock` tails as return
  contributions. That independent type-layer defect is fixed and is no longer
  a blocker; the Resolution B dependency above is historical.
- **[0220](./0220-fn-return-void-sink-false-void-diagnostic.md) (fixed
  0.169.0)** — its v10 row pins the single-form `if`/`else` branch tails of a
  `void` fn as sink positions with zero diagnostics; Resolution A moves that
  pin.

## Fix (unreleased - commit/push only)

Resolution A is implemented in this checkout and independently reviewed
**CLEAN**. No new package release is published. This fix is **not** attributed
to manifest version 0.497.0 or any existing published package. No resolving commit
SHA is invented here; a later shipment commit will supply it. This record does
not claim that staging, commit, push, tagging or publication has occurred.

### Cause and actual fix

Two independent static-context errors read the layout-dependent AST encoding:

1. `walkBlock` traversed a promoted query tail as a value and never invoked
   QRY-19, unlike the QueryStmt route. It now receives an explicit private
   statement/value role. Direct bare query tails in if/else/while/for bodies
   invoke the existing discard predicate at the query range before normal
   expression checking. Independent diagnostics and reachability still run.
   See `src/parser/structural-checks.ts:391-430,484-557,570-586,974-984`.
2. Return-aware if/else/else-if rewriting supplied enclosing-function return
   frames to discarded branch tails. Those tails now get fresh empty frames,
   matching loops, while statement recursion retains explicit-return sinks.
   Genuine FnBody tails, nearer binding/call sinks and explicit query
   ascriptions keep their contracts. See
   `src/parser/query-schema-resolve.ts:297-384`, especially `:332-353`.

Schema resolution precedes structural checking
(`src/parser/theta-document.ts:238-251,326-342`), so the sink leak was not a
cascade of the missing diagnostic. Production registration already refuses
error-bearing sources (`src/extension/production-discovered-theta.ts:29-41,60-70`);
no discovery/runtime fix was necessary. Parser promotion and lexer continuation
behavior are unchanged. The other production-file changes, in
`body-parser.ts` and `query-discard-checks.ts`, are explanatory comments only.

The exact approved S1-S5 amendments reconcile [QRY-19](../spec_topics/query/query-escapes-stringification.md#qry-19),
the [parse registry Trigger](../spec_topics/diagnostics/code-registry-parse.md),
[QRY-2](../spec_topics/query/query-forms.md#qry-2), and both grammar presentations
(`docs/spec_topics/grammar.md:139`, `docs/reference/grammar.md:309-315`).
Diagnostic identity, severity, Message/Hint and QRY-20 are unchanged. An outer
void return type is not a branch-tail exemption; postfix `?` acknowledges a
Result but does not create a function-return sink. No broader tail promotion,
composite-expression must-use rule or new runtime discard event is introduced.

### Preserved reds, green witnesses and controls

All artifact names below resolve under the absolute run directory:

`/home/thomasa/Projects/pi-theta/.pi/tmp/fix-bug-0511-c7ead5ab-d7db-4a14-ae3a-5a8990386879`

The original accepted witness sources, commands, failure signatures and red
captures remain intact. Setup mistakes in preliminary drafts and a corrected
unit-fixture type error are disclosed in reproduce.md/diagnose.md, not counted
as bug evidence. No provider error serves as a witness.

| Exact command | Pre-fix evidence (exit 1) | Post-fix evidence (exit 0) |
| --- | --- | --- |
| `npx vitest run tests/b0511-stmtblock-query-tail.test.ts` | `reproduce-a1-offline-final.log`, `diagnose-a1-e2e.log`, `red-0.json`: 14 failures / 18 controls; missing QRY-19 and leaked Item schemas | `implement-a6-e2e-final.log`, `green-1-0.json`: all 32 pass |
| `npx vitest run tests/b0511-stmtblock-query-tail-unit.test.ts` | `diagnose-a1-unit-final.log`, `red-2.json`: 16 failures / 47 controls; structural omission and independent frame leak | `implement-a6-unit-final.log`, `green-1-2.json`: all 63 pass, including capture/nonmutation assertions |
| `npx vitest run --config config/vitest/vitest.live.config.ts tests/live/b0511live-stmtblock-query-refusal.test.ts` | `diagnose-a1-live.log`, `red-1.json`: twelve erroneous real SDK-host registrations; healthy/refusal control passes | `implement-a6-host-final.log`, `green-1-1.json`, `gate-1-initial-2.json`: both tests pass |

The frontend covers if/else/while/for in single, ordinary-let newline/packed,
postfix-`?`-preceded and closing-brace-preceded layouts, with exact whole
severity/code lists, query ranges, literal Message and schema assertions.
Units isolate both AST slots and else-if, bare/acknowledged tails, true function
and explicit-return sinks, ascriptions, capture provenance and nonmutation.
Healthy explicit discard, bound Result, postfix `?`, FnBody/void FnBody and
BlockExpr controls remain accepted; ParForBody queries remain independently
refused under CTRL-4. Real host inventory checks both healthy registrations
and invalid-source refusal, not merely a resolved prompt or empty discovery.

### Exact scoped coordination, gates and review

Separate controller-recorded delegated decisions authorized S1-S5, B1-B3,
C1 and D1-D3; the two historical BLOCKED outcomes were followed by preserved
replans/independent reviews before their exact later authorizations. No gate
was waived and no favorable prose was treated as extra scope.

- B1-B3 changes only bug-0220 v10's two-error diagnostic oracle and specified
  explanations, with an append-only report note. Its bare source stays bare;
  its schema oracle remains `[null, null]`, and all other controls stay exact.
- C1 adds only two `let _ = ` prefixes in
  `docs/examples/typed-params-across-boundary.theta:18,20`. Its typed child call,
  templates and branch condition are unchanged; the committed-source gate is
  unchanged and green, not rebaselined.
- D1 adds exact ordered QRY-19 co-fire/location assertions to two unchanged
  plain-for fixtures, retaining e1's interpolation refusal, e4ctl's exclusion
  of that refusal and all unknown/provenance controls. D2-D3 coordinate exact
  reference count 765 + seven authorized S5 lines = 772, retain topic count 254
  and reject both obsolete reference counts. No shared helper was weakened.
- Migration reds remain `implement-a1-legacy-original-red.log`,
  `implement-a2-neighbors.log`, `implement-a4-default-final.log` (each exit 1),
  with original source archives/hashes and exact authority in the run reports.

Fresh implementation captures all exit 0: `implement-a6-d-baselines.log`
(50 tests), `implement-a6-controls-final.log` (158),
`implement-a6-neighbors-final.log` (291, including committed corpus and real
provider-free child controls), `implement-a6-typecheck-final.log`
(`npm run typecheck`), `implement-a6-lint-final.log` (`npm run lint`), and
`implement-a6-default-final.log` (`npm test`: 762 files / 13,084 tests).
Controller `gate-1-initial-0.json` and `gate-1-initial-1.json` repeat typecheck
and the full default gate green. Matching `.exit` sidecars preserve actual
command exits; JSON captures carry `argv`, `code` and complete output.

The selected real-provider binder command also exits 0 in
`implement-a6-binder-live.log`:

```sh
npx vitest run --config config/vitest/vitest.live.config.ts tests/live/live-production-acceptance.test.ts -t "resolves one schema-typed @-query through the live binder and validates the reply against its declared schema"
```

It extracts an actual response value and validates it with AJV
(`tests/live/live-production-acceptance.test.ts:382-428`); prompt resolution
alone is not the success assertion. The 89 unselected tests are not a claimed
whole-live-suite pass.

Independent fix review `reviews.md` is **CLEAN**, with no actionable in-scope
must-fix findings. Its fresh captures are `audit-fix-offline.log` (303 tests),
`audit-fix-host-pinned.log` (repository SDK host 1.3.0) and
`audit-fix-host-actual.log` (operator SDK host 1.4.0), all exit 0. Both host
runs use the unchanged frozen registration tests; the latter redirects SDK
module resolution. The review verified exact scope reconstruction and original
red/source integrity. This is completed-fix approval, not shipment authority;
final closure review remains a separate controller step.

Detailed exact command ledgers, exit codes, hashes and limitations are in
`implement.md`, `plan.md`, `reviews.md` and `close.md` in this run directory.
CLOSE edits only this report and the bug index; `git diff --check` and saved
artifact/frozen-source preservation checks are recorded there. No quality
loop is run.

### Residuals and coverage limits

No new in-scope residual defect was found. Existing open bugs
[0515](./0515-ret3-depth0-tail-after-return-silent.md),
[0516](./0516-statement-position-par-for-trailing-value-kept.md),
[0518](./0518-imported-schema-member-read-types-as-receiver.md) and
[0519](./0519-subagent-child-spawns-lack-windowshide.md) remain separately
owned and are not waived or repaired here. Bug 0512 is already fixed.

Registration tests make no provider request or outer CLI/child launch; they
prove load-time inventory, not response health. The separate binder control
proves one actual typed response, not exhaustive provider/cancellation behavior,
QRY-20 events, token-bearing child dispatch or runtime execution of the
example's two presentation queries. No such broader success is claimed.
