# Bug 0510 — a trailing bare call in a MULTI-statement nested block is executed as a value-discarding action statement, so the block's FN-5 final value is silently `null`: in-brace `stmt-sep` swallowing defeats `parseForms`' lineStart-gated tail promotion, `exprToStmt` encodes the trailing call as a `tool-call` action, and `executeBlock`'s tail-equivalence patch covers `expr` statements only — a `par for` element tail-calling an imported `.thetalib` fn binds `Ok(null)` and the caller's downstream member read aborts the whole theta (`internal_error` at the parent's invoke boundary)

- **Status:** open — filed 2026-10-02 from the LPS step-lane increment-11
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
