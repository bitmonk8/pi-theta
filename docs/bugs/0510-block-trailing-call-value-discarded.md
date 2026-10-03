# Bug 0510 — a trailing bare call in a MULTI-statement nested block is executed as a value-discarding action statement, so the block's FN-5 final value is silently `null`: in-brace `stmt-sep` swallowing defeats `parseForms`' lineStart-gated tail promotion, `exprToStmt` encodes the trailing call as a `tool-call` action, and `executeBlock`'s tail-equivalence patch covers `expr` statements only — a `par for` element tail-calling an imported `.thetalib` fn binds `Ok(null)` and the caller's downstream member read aborts the whole theta (`internal_error` at the parent's invoke boundary)

- **Status:** fixed (0.496.0) — filed 2026-10-02 from the LPS step-lane increment-11
  lane probes (`D:/UnitySrc/lps-build-scratch/inc11-fix`): found as a
  caller-fatal `internal_error` on installed 0.494.0; reproduced
  byte-identically on main HEAD 21ff3166 (0.495.0 — the 0504 lib-relative
  invoke-resolution fix does not reach it); root-caused in-process on the
  same HEAD.
- **Owning repo:** pi-theta
- **Sev/Diff estimate:** S2/D2 — S2: silent wrong value. The shared-dispatcher
  pattern the LPS lanes use (a `par for` body whose tail is a call to an
  imported `.thetalib` fn wrapping `invoke(...)`) binds `Ok(null)` per element
  with zero diagnostics — the invoked children all RUN and complete, so the
  fan-out's work is done and then discarded — and the first downstream member
  read on the element value aborts the entire calling theta
  (`NullMemberAccessPanic` in-process; `Err(invoke_infra, internal_error)` at
  an invoking parent's boundary, its own transcript unflushed). The defect is
  not par-specific, not import-specific and not invoke-specific: EVERY
  multi-statement brace-nested block (fn body, `par for` body) whose trailing
  expression is a bare call loses its FN-5 final value (measured: a pure
  imported fn, a local fn wrapping invoke, and a sequential call of a fn whose
  own multi-statement body ends in a bare call — all `null`), and the AST
  encoding makes the same hold for a trailing bare `invoke(...)` and `@`-query
  statement. Masked whenever the block has exactly one form (tail promotion
  fires), the trailing form is a `match`/ident/operator expression (`expr`
  statement tail-equivalence covers it), or the preceding statement ends in
  postfix `?` or `}` (`forcedLineStart` restores promotion eligibility) —
  which is why co-located controls and the `.thetalib` fns' own single-`match`
  bodies pass. D2: the classification seams are small and already documented
  against themselves (the `parseForms` tail-promotion comment states the rule
  this report measures as violated); the candidate fixes are one-gate changes
  (promote the FINAL expression form regardless of `lineStart`, or extend
  `executeBlock`'s trailing-value rule to the three action-statement kinds at
  the last position) — but the fix moves parse SHAPE (`Block.tail`) that
  static return-type inference and the BlockExpr missing-tail check read, and
  the `StmtBlock` discarded-value rule and FN-4's void-typed-expression-
  statement arm must stay intact, so the blast radius needs the inference
  audit, not just the runtime patch.
- **Where (pi-theta, main 21ff3166, 0.495.0):**
  - `src/lexer/continuation.ts:65` — `const swallow = depth > 0 || …`: every
    newline at bracket depth > 0 is swallowed with NO `stmt-sep` token, so
    inside any `{ … }` only the first form (or one right after a postfix `?` /
    a nested `}`) is seen starting a logical line.
  - `src/parser/body-parser.ts:468` — `parseForms` promotes the final form to
    `Block.tail` only when `last.lineStart` is true; with in-brace `stmt-sep`s
    swallowed that gate is false for every non-first form, so a
    multi-statement nested block NEVER gets a structural tail. The function's
    own contract comment (`:459-466`) states the opposite requirement
    verbatim: "including a lone or trailing call/invoke/query — `fn f(n){
    g(n) }` MUST return `g(n)` (FN-5), so a bare-call tail is the final value,
    not a discarded action".
  - `src/parser/body-parser.ts:580-591` — `exprToStmt`: the un-promoted
    trailing expression is encoded by kind — `call` → `tool-call` statement,
    `invoke` → `invoke` statement, `query` → `query` statement, everything
    else → `expr` statement. The trailing CALL therefore lands in the
    action-statement class.
  - `src/runtime/statement-executor.ts:711-722` — `executeStatement` runs
    `expr` / `tool-call` / `query` / `invoke` statements at the
    terminal/discarding disposition ("A bare action statement discards its
    result"); `:831` — `executeBlock`'s tail-equivalence patch keeps a
    trailing statement's value ONLY for `stmt.kind === "expr"`
    (`trailingExprValue = stmt.kind === "expr" ? … : undefined`), so a
    trailing `tool-call` / `invoke` / `query` statement terminates the block
    with the literal `null`.
  - `src/runtime/par-for-executor.ts:110-116` — `parForOutcomeOf` wraps the
    body's `value` flow as the element result (`makeOk(flow.value)`): the
    discarded tail surfaces as `Ok(null)` per element.
  - `src/parser/body-parser.ts:178-187, 1822-1830` — the loud sibling:
    `promoteTrailingExprToTail` (BlockExpr only) also admits only
    `last.kind === "expr"`, so the SAME trailing bare call in a `match`-arm
    `BlockExpr` draws `theta/parse/block-expr-missing-tail` against a block
    that ends in an expression (measured: `direct4.theta:54:8` in the probe
    set) — wrong under the same grammar sentence, but at least not silent.
  - `src/runtime/err-note-render.ts:174` — the note shape observed at an
    invoking parent when the caller then dies downstream: `invoke of
    <callee_path> failed (<cause>)`.
- **Spec:**
  - `docs/reference/grammar.md:279-281, 289` — `FnBody ::= "{" Stmt* Expr? "}"`,
    `ThetaBody ::= Stmt* Expr?`, `ParForBody ::= "{" Stmt* Expr? "}"` ("tail
    Expr optional, absent → element type null"): a trailing bare call IS an
    `Expr`; no production excludes call/invoke/query expressions from the
    trailing-`Expr` position.
  - `docs/spec_topics/functions.md:36` (FN-4) — the empty-tail rule's closed
    list of "last form is a statement" shapes includes an
    "expression-statement of `void` type" ONLY; a call to a value-returning fn
    is not in the list, so a body ending in one is NOT an empty-tail body.
  - `docs/spec_topics/functions.md:44` (FN-5) — "A theta or function's *final
    value* is the value of its tail expression on the success path".
  - `docs/spec_topics/control-flow.md:74` (CTRL-3) — the `par for` value is
    `array<Result<T, QueryError>>` "where `T` is the body tail type (absent
    tail → `null`)": these bodies HAVE a tail per the grammar, so the element
    must carry its value.

## Symptom

A `par for` body of two or more statements whose last line is a bare call to
an imported `.thetalib` fn wrapping `invoke(...)` completes all its child
invocations (the children's sessions exist and finish) and binds `Ok(null)`
as every element. The callers in production read a field off the element
value, so the whole calling theta aborts: in-process (slash-invoked
prompt-mode caller) as `theta /<name> aborted: null member access: .<field>`;
behind an `invoke` boundary the parent observes
`theta /<caller> returned Err: invoke of <path>/par-caller.theta failed
(internal_error)` with the dead callee's own transcript unflushed. The
original LPS lane hit the invoke-boundary form and recorded it as a
caller-fatal crash; the `Ok(null)` is the defect, the abort is the callers'
downstream null read.

## Observed (2026-10-02, live `pi -p` runs through the real host)

Found-in shape (`probe-par/`, the three-arm lane probe; subagent-mode caller
invoked from a prompt-mode oracle; `.probe-out.txt` is written between arms):

| arm | body shape | 0.494.0 (installed, ambient) | main 21ff3166 / 0.495.0 (`-ne -e <checkout>` + child pin) |
|---|---|---|---|
| S | sequential `let s0 = lib_tail(…)` | `filed=2` (works) | `filed=2` (works) |
| A | `par for`, multi-statement, tail `match invoke(…) {…}` INLINE | `filed=2` (works) | `filed=2` (works) |
| B | `par for`, multi-statement, tail `lib_tail(cols[0], cols[1], …)` | caller dies, parent sees `(internal_error)` | identical |

Mechanism-isolating probes (prompt-mode caller run in-process on main
21ff3166, same files otherwise; element rendered `OK:<notes>` / `OKNULL` /
`ERR:<kind>`):

| probe | body | result |
|---|---|---|
| single-form control | `{ lib_tail("L", row, …) }` | `OK:probe wave c5` |
| C2 | `{ let cols = row.split("\t")` ⏎ `lib_tail(cols[0], cols[1], …) }` | **`OKNULL`** |
| C3 | multi-statement, literal args | **`OKNULL`** |
| C4 | multi-statement, no `.split` (array-literal reassign) | **`OKNULL`** |
| A2 | multi-statement, `let v = lib_tail(…)` ⏎ tail `v` | `OK:…` (ident tail is an `expr` statement) |
| E1 | multi-statement, tail = imported PURE fn (no invoke anywhere) | **`OKNULL`** |
| E2 | multi-statement, tail = SAME-FILE fn wrapping invoke | **`OKNULL`** |
| E5 | sequential call of a fn whose own multi-statement body ends in the bare call | **`NULL`** (no par involved) |

Parse-level dump (scratch `vite-node` harness over `parseThetaDocument`, same
HEAD): every multi-statement nested block parses with `tail=NULL`; the
trailing form's statement kind is `tool-call` for a bare call, `invoke` for a
bare `invoke(...)`, `expr` for `match`/ident/binary — exactly the classes that
lose vs keep the value at `executeBlock:831`. A single-form block parses with
`tail=call` (promoted). The same trailing call inside a `match`-arm
`BlockExpr` draws `theta/parse/block-expr-missing-tail` (measured at
`direct4.theta:54:8`).

## Expected (spec citations)

Per `grammar.md:279-289` a trailing bare call is the optional trailing `Expr`
of `FnBody` / `ThetaBody` / `ParForBody`; per FN-5 its value is the body's
final value; per FN-4 a body ending in a non-`void` expression statement is
not an empty-tail body; per CTRL-3 the `par for` element carries the body
tail's value. So arm B must bind `Ok(PLensSummary{…})` exactly as arms S and
A do, `wrap_multi()` (E5) must return the lib fn's value, and no position may
silently produce `null` for a body that ends in a value-returning call. The
in-tree `parseForms` contract comment (`body-parser.ts:459-466`) states the
same rule.

## Actual (implementation citations)

`collapseContinuations` (`continuation.ts:65`) swallows every in-brace
newline, so no form after the first in a `{ … }` block is `lineStart`;
`parseForms` (`body-parser.ts:468`) therefore never promotes the trailing
form of a multi-statement nested block to `Block.tail`; `exprToStmt`
(`:580-591`) encodes the un-promoted trailing call as a `tool-call` ACTION
statement; `executeStatement` (`statement-executor.ts:711-722`) runs action
statements at the discarding disposition and `executeBlock` (`:831`) keeps a
trailing statement's value only for kind `expr` — so the block completes with
`value: null`, which `parForOutcomeOf` (`par-for-executor.ts:110-116`) wraps
as the element's `Ok(null)` and a fn call returns as `null`. The effects
inside the discarded call all commit (children run to completion); only the
value is lost. Three mutually-inconsistent dispositions ship for the same
trailing-call shape: value kept (single-form block, promotion), value
silently dropped (multi-statement `FnBody` / `ParForBody`), loud
`block-expr-missing-tail` refusal (`BlockExpr`, whose
`promoteTrailingExprToTail` also admits only `expr` statements).

## Root cause

The tail-promotion gate tests `lineStart`, a property the lexer's
continuation collapse makes false for every non-first in-brace form — so the
structural tail the grammar defines is unrepresentable in exactly the blocks
that have preceding statements. The two downstream compensations
(`executeBlock`'s trailing-`expr` tail-equivalence, `BlockExpr`'s
parse-time promotion) each re-derive the classification and each admit only
`stmt.kind === "expr"`, leaving the three action-statement kinds
(`tool-call` / `invoke` / `query`) — the kinds whose values are effects'
results — as the one class whose trailing value is destroyed.

## Fix direction

Promote the FINAL expression form of a block to `Block.tail` regardless of
`lineStart` (the grammar's `Stmt* Expr?` needs no line test for the last
form; `lineStart` stays meaningful only as the existing continuation-grouping
concern), or — equivalently — extend both tail-equivalence sites
(`executeBlock:831`, `promoteTrailingExprToTail`) from `expr` to the four
trailing expression-statement kinds. The first shape is preferable: it makes
`Block.tail` structural again for every position, un-breaks
`block-expr-missing-tail` for call-tailed BlockExprs, and feeds static
return-type inference (which reads `block.tail`) the type FN-3/FN-5 pin.
Constraints either way: a `StmtBlock` tail stays evaluated-and-discarded
(grammar.md:303-305 — promotion is value-neutral there since `executeIf` /
`executeWhile` / `executeFor` discard block values); FN-4's
void-typed-expression-statement arm keeps the empty-tail semantics; the
postfix-`?` early-return behaviour of a promoted tail is unchanged; and the
inferred-return-type / `theta/parse/return-no-common-type` surfaces need
re-measuring since bodies that inferred `null` now infer the call's type (the
contract comment says they always should have).

## Repro (minimal, inline; also on disk under `D:/UnitySrc/lps-build-scratch/inc11-fix/`)

`.pi/settings.json`:

```json
{ "thetaPaths": ["theta/workers"], "theta": { "subagentPlacement": "pipe" } }
```

`.pi/theta/workers/minlib.thetalib`:

```
schema POut { notes: string }

fn lib_tail(m: string): POut {
  match invoke<POut>("./min-child.theta", m) {
    Ok(s) => s,
    Err(e) => POut { notes: "invoke failed: " + e.kind },
  }
}

fn lib_pure(m: string): POut {
  POut { notes: "pure " + m }
}
```

`.pi/theta/workers/min-child.theta`:

```
---
mode: subagent
description: "query-less typed child"
params:
  m: string
---
import { POut } from "./minlib.thetalib"

POut { notes: "from " + m }
```

`.pi/theta/workers/min.theta`:

```
---
mode: prompt
description: "minimal repro: multi-statement par body, bare lib-fn tail"
params:
  tag: string
---
import { POut, lib_tail, lib_pure } from "./minlib.thetalib"

let rs = par for m in ["m1"] max 2 {
  let z = 1
  lib_tail(m)
}
let v1 = match rs[0] { Ok(x) => (x == null ? "OKNULL" : "OK:" + x.notes), Err(e) => "ERR:" + e.kind }

let ctl = par for m in ["m2"] max 2 { lib_tail(m) }
let v2 = match ctl[0] { Ok(x) => (x == null ? "OKNULL" : "OK:" + x.notes), Err(e) => "ERR:" + e.kind }

"multi=" + v1 + " single=" + v2
```

Run `pi --session-dir sessions -a -p "/min go"` with cwd at the repro root (a
git checkout; on an MSYS shell disable path mangling). Expected final text
`multi=OK:from m1 single=OK:from m2`; observed `multi=OKNULL
single=OK:from m2`. Dropping the `let z = 1` line flips `multi` to OK;
replacing `lib_tail(m)` with `lib_pure(m)` or a same-file fn keeps the
`OKNULL`. The found-in-production form (subagent-mode caller `par-caller
.theta` invoked by a prompt-mode oracle, three arms S/A/B with progress
persisted between arms) is preserved verbatim in
`D:/UnitySrc/lps-build-scratch/inc11-fix/probe-par/`, with the
mechanism-isolating probe set beside it in `probe-par-head/`,
`probe-par-0494/` and `probe-direct/` (`direct*.theta`, run logs, and
`.d*-out.txt` result files for every table row above).

## Relation to prior bugs

- **0082 (fixed 0.191.0)** — introduced `BlockExpr`,
  `promoteTrailingExprToTail` and `block-expr-missing-tail`; its promotion
  admits only `expr` statements, which is this bug's loud sibling surface.
- **0504 (fixed 0.495.0) and residuals 0505–0509** — the same LPS lane's
  import/invoke-resolution family; arm B's crash was initially suspected to
  be theirs, but the 0504 fix does not change this behaviour (measured both
  sides), and the mechanism is the block-tail classification, not path or
  scope resolution. 0504's probe arms 7/8 passed because their par bodies
  were single-form (promotion fired).
- **0068 (wontfix)** — a different `Ok(null)` (prompt→prompt invoke cell
  drops the callee's final value); no shared mechanism.
- **0325 (fixed 0.313.0)** — a different fabricated-`Ok(null)` par-for shape
  (NaN width, body never ran); here the body RUNS and its effects commit.

## Fix (0.496.0)

- What shipped (keyed to §Fix direction):
  - Route: the PREFERRED structural shape, scoped per block kind.
    `src/parser/body-parser.ts` — `parseForms` takes an explicit
    `TailPromotion` mode from each `parseBlock` call site.
    - `"final-form"` promotes the final expression form to `Block.tail`
      whatever its `lineStart`. `parseFn` bodies, `parseParFor` bodies and
      `parseBlockExprNode` use it, so `Block.tail` is structural for
      `FnBody`, `ParForBody` and `BlockExpr`.
    - `"line-start"` keeps the `lineStart` gate and its postfix-`?` / `}`
      restoration. `parseIf` (then and else), `parseWhile`, `parseFor`, the
      depth-0 `parseBody` and `parseSingleExpressionWithResidue` use it.
    - A statement-position `par for` is never a promotion candidate.
  - Why the scope is narrower than "regardless of `lineStart`": the first,
    unscoped attempt had two problems.
    - At depth 0 (`ThetaBody`) the lexer emits real `stmt-sep` tokens, so
      `lineStart` is accurate there. Promoting regardless of it flipped 14
      pinned assertions: b12, e4 and e9 in
      `tests/schema-alias-rhs-malformed.test.ts`, and g2, n1–n4, n4b,
      n17–n20 and n28 in `tests/schema-alias-union-decl.test.ts`. All are
      same-logical-line residue cases. They dropped QRY-19 and added
      `type-as-value`, which is outside the flip class this document
      authorises.
    - Inside a `StmtBlock`, the static checks read a promoted tail as a
      VALUE position (`collectReturnContributions`, `walkIdentBlock`,
      `rewriteReturnAwareBlock`, QRY-19). Code that loaded clean before the
      fix drew `return-no-common-type` (an if-body ending in a `?`-query, a
      `match` or a string) and `type-as-value`
      (`if true { let z = 1⏎ Cat }`). It also lost
      `discarded-query-result`. A `StmtBlock` value is discarded anyway, so
      it needs no promotion.

    The shipped scope flips zero existing tests. Both excluded positions
    are recorded as residuals 1 and 7.
  - `src/parser/structural-checks.ts` — `walkStatements` reports whether
    its last statement was a `return`. `walkBlock` then draws RET-3
    `unreachable-code` on a block tail that directly follows one. This keeps
    the warning pinned by `tests/par-for-body-return-refusal.test.ts` (c1),
    which promotion would otherwise remove. It also warns on two shapes that
    were silent before the fix: `{ return r()?⏎ 2 }` and the BlockExpr
    `{ return 2⏎ 3 }`. The depth-0 caller ignores the flag (residual 5).
  - `docs/spec_topics/diagnostics/code-registry-parse.md` — the Trigger of
    `theta/parse/unreachable-code` now reads "Code appears after a `return`
    in the same block: a statement, or the block's tail expression." This
    is a same-commit DIAG-2 widening and matches return.md RET-3's "Code
    after a `return`". The Message is unchanged.
    `docs/reference/diagnostics.md` carries only the message, so it is not
    edited.
  - FN-4 constraint (`void` arm). After promotion, `v()` is the tail of
    `fn outer() { let q = 1⏎ v() }`, so `outer` returned the tail value of
    the `void` fn `v`. The cause: `discardForVoid`
    (`src/runtime/function-result.ts`) had no caller, so `void` fns leaked
    their tail value. It is now wired in two places:
    - `src/runtime/statement-executor.ts` — `evalUserFnCall` applies
      `discardForVoid(...)` on the `return`/`value` flows when the declared
      return type is `void`. Same-file and imported fns both route through
      it via `resolveUserFn`.
    - `src/runtime/subagent-fn-call.ts` — `subagentFnSuccessValue` applies
      the same discard on the in-process `mapSubagentFnFlow` success arm and
      on the child-launch `mapSubagentFnChildOutcome` `ok` and
      `fn_tail:"err"` arms. A `void` fn's `Err(e)` tail is a tail value.

    `propagate`, `fail`, `cancel` and boundary-minted `Err` values cross
    unchanged. The wiring also closes a single-form leak that predates the
    fix: `fn v(): void { pure("a") }` returned `"v:a"` and now returns
    `null`; `subagent fn sf(): void { g() }` returned `7` and now returns
    `null`.
  - `src/runtime/statement-executor.ts` (`executeBlock` comment) and
    `tests/helpers/e2e-s1.ts` (`trailingExpr` comment) — rewritten to the
    shipped per-site rule; no behaviour change.
- Tests that lock it: `tests/b0510-block-trailing-call-tail.test.ts`, 54
  cells.
  - 14 bug cells:
    - parse shape: call, invoke and query tails; the ParForBody tail; the
      BlockExpr `block-expr-missing-tail`;
    - runtime values: fn body, par-for body, the inline minimal repro, E5,
      E2, BlockExpr, a trailing invoke, and a trailing query (as
      single-form parity).
  - Controls: single-form promotion, ident and match tails, `?`- and
    `}`-preceded tails, the depth-0 tail, the StmtBlock discard, and a
    statement-position `par for`.
  - FN-4 cells: V1, V2 and the single-form `void` fn; a `void`
    `subagent fn` in-process and on the child launch, with fail, cancel and
    `Err` controls.
  - RET-3 cells: R10, R11, return-then-call, and a no-return control.
  - StmtBlock parity controls: P3, P6, S2, Q1.
  - Inference cells: P9, Q8, S1.
- Gates:
  - Witness before the fix (71ebf420): 14 failed | 10 passed (24). Each red
    is the defect's own, e.g. `expected 'tail=null
    statements=[let,tool-call]' to be 'tail=call statements=[let]'`,
    `expected 'multi=OKNULL single=OK:pure m2' …`, and for E5
    `NullMemberAccessPanic: null member access: .notes`.
  - Witness after the fix: 54 passed (54).
  - `npm test`: 715 files / 12077 tests passed.
  - `npm run typecheck`: exit 0. `npm run lint`: exit 0.
  - Existing tests flipped: none. The edited test helper changes a comment
    only.
- Review: 2 rounds, after Phase 2 was dispatched twice. The unscoped first
  attempt was rejected at the gate because of the 14 out-of-class flips, and
  was rescoped.
  - Round 1 (`bug-fix-reviewer`): DEFECTS. Nine findings:
    - F1 (fidelity): StmtBlock promotion regressions.
    - F2 (fidelity): FN-4 `void` regression.
    - F3 (spec): RET-3 fired on a tail while the registry row said
      "Statement".
    - F4 (house-rule): historical phrasing.
    - F5 (fidelity/prose): scoping attributed to this document.
    - F6 (prose): four inaccurate comments.
    - F7 (house-rule): reformatting churn.
    - F8 (test): unpinned changes P9, Q8, S1.
    - F9 (test): the query cell over-claimed FN-5.

    All were fixed in fixer round 1. A completion dispatch in the same round
    added the `subagent fn` `void` boundary. The orchestrator had measured
    a regression there: the multi-statement
    `subagent fn sf(): void {…⏎ g() }` returned `null` before the fix and
    `7` after it.
  - Round 2 (`bug-fix-reviewer-fast`): CLEAN, no findings.
- Verification: VERIFIED (`bug-fix-verifier`).
  - The witness reds without the fix:
    - With promotion neutralised ("final-form" behaving as "line-start"):
      19 failed | 35 passed. That is the 14 bug cells plus 5
      promotion-dependent cells.
    - With the FN-4 discard neutralised: 8 failed, exactly the `void`
      cells.
    - Each file was restored byte-exact, with `git hash-object` matching
      before and after (body-parser 6acbe67f…, subagent-fn-call e864b9fc…,
      statement-executor b7a27491…).
  - Full suite: 715 / 12077 green.
  - Live H8a (`tests/live/live-production-acceptance.test.ts`): 90 passed
    (90).
  - Live H9a (`tests/live/acceptance/`): 57 passed | 1 failed. The failure
    is area (f) `ENOENT … acc-code-tool-loop.theta`, the signature of open
    bug 0495. It is deterministic on re-run and not caused by this fix.
  - Scratch live probe (`tests/live/scratch-b0510-live.test.ts`): the
    inline repro shape, using a same-file fn tail, run through the shipped
    extension.
    - GREEN with the fix.
    - RED with promotion neutralised: `Received: "A probe is labelled
      multi=OKNULL single=OK:from m2. …"`.
    - GREEN again after the byte-exact restore. The probe was then
      deleted.
  - Lint and typecheck clean.
- Residuals:
  1. QRY-19 at a `StmtBlock` tail is unsettled. The single-form
     `if c { @`q` }` is silent, while `if c { let z = 1⏎ @`q` }` draws
     `discarded-query-result`; neither changed with this fix. Grammar's
     "evaluated and discarded" and the registry parenthetical point one
     way, and bug 0220's `VOID_IF_ELSE` row points the other. It needs a
     spec decision.
  2. `collectReturnContributions` (`src/parser/type-layer-walk.ts`) adds
     every nested block's tail as a return contribution, `StmtBlock` tails
     included. FN-3 counts only the body's own tail plus `return` operands.
     The single-form if-body case already draws `return-no-common-type`
     (round-1 probe P3b).
  3. `StaticTypeInferencePass` types a call expression as
     `named(<callee>)`, not as the callee's declared return type. A
     promoted call tail therefore gives inference a nominal type, not the
     FN-3/FN-5 type. Non-call tails get real types; the P9 and Q8 cells show
     the return-site and query-schema effects.
  4. A fn whose tail is a query does not re-wrap the query outcome at its
     call boundary. `fn f() { let z = 1⏎ @`q` }; match f() { Ok(v) => …,
     Err(e) => … }` panics with `MatchError: no arm matched settled-reply`,
     although FN-3 infers `Result<string, QueryError>`. The single-form
     `{ @`q` }` behaves the same way, and did before the fix. Before the
     fix the multi-statement form was a QRY-19 parse error.
  5. RET-3 at depth 0 checks only pairs of statements. A top-level
     `return 1⏎ pure("a")` draws no warning, before or after the fix.
  6. A statement-position `par for` that ends a block yields its value
     (`[Ok(42)]`) through `executeBlock`'s trailing-`expr` rule, although
     grammar.md §Blocks calls that value discarded. The witness control pins
     the observed value.
  7. A depth-0 same-logical-line final form is still not promoted, e.g. a
     query after a `>`-continued alias, or `42 43`. This document's "every
     position" wording would cover it, but doing so flips 14
     bug-0033/0042 pins (see What shipped).
  8. Citation drift in this document at 71ebf420: the invoke arm in
     `statement-executor.ts` returns at :723, not :722, and the `makeOk` in
     `parForOutcomeOf` is at :117, not :116. In a strict parse, the
     trailing bare query in §Symptom is a QRY-19 parse error, not a silent
     `null`.
- Discharge notes appended: none. This fix does not touch 0082's residuals
  or 0504–0509.
- Pinned dispositions / non-goals:
  - A `StmtBlock` tail is still evaluated and discarded, and a postfix-`?`
    tail still early-returns. Both are covered by witness controls and
    review round 1 T1–T4.
  - Positions with a real `stmt-sep` keep the line test.
  - No new diagnostic code. H9a's `permitted-codes.json` is not changed.
