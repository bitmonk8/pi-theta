# Bug 0387 — a query at a block-expression tail (`let r = { @`q` }`, the grammar's let-init BlockExpr position) binds the RAW payload on success and FAILS the theta on Err, because `executeBlock` hard-codes every block tail as a terminal position

- **Status:** open.
- **Sev/Diff estimate:** S1-2/D2 — the Ok side re-creates bug 0351's exact
  pre-fix symptom one spelling over: `r` binds a brand-less raw payload, so the
  documented consumption (`match r { Ok(v) …, Err(e) … }`) panics `MatchError`
  and `r?` aborts through the 0019 brand guard; the Err side kills the theta at
  the effect site even though the binding is consumed by a downstream `match`
  (author handling dead — the 0307 pre-fix symptom, same spelling). D2: the fix
  is threading the consumption-position flag through `evalExpr`'s `"block"` arm
  instead of the hard-coded `true`, but the body-block/expression-block
  distinction must be kept so a genuine body tail still re-wraps once.
- **Kind:** defect (two spec rules diverged-from at one seam).
- **Related:**
  - [0351](./0351-value-position-query-success-binds-raw-payload.md)
    — fixed (0.351.0). Its §Fix Residual 1 names this exact input as "a
    same-class input an author could write expecting `Ok(payload)`; a follow-up
    report candidate" (reviewer R2: "the block-expression-tail disposition is
    unpinned"). The fixer filed no follow-up; this report is it.
  - [0307](./0307-value-position-query-err-aborts-body-instead-of-binding.md)
    — fixed (0.298.0). Its pinned disposition covers `return @`q`` / BODY bare
    tail ("terminal = returned = unhandled") — positions whose value really is
    returned. A let-bound block's tail value is NOT returned; 0307's own
    justification ("a let-bound value is neither returned nor `?`-propagated")
    argues the opposite disposition for this spelling.
  - 0316 — the non-effect scrutinee rule; untouched.
- **Affected** (verified at d63c5148, v0.382.0):
  - `src/runtime/statement-executor.ts:2073` — `executeBlock` evaluates every
    block tail with `evalExpr(block.tail, env, deps, true)`; the comment
    acknowledges the overload: "for a `let r = { … }` block-expr it is that
    block's own value (still terminal for THIS block)". `atTerminal=true`
    keeps a query success RAW (`:1157-1161`) and routes a query failure to
    `flow: "fail"` (`:1179-1183`) — correct for the BODY's tail (the single
    downstream re-wrap / ERR-19), wrong for a value-position block.
  - `src/runtime/statement-executor.ts:942-960` — `evalExpr`'s `"block"` arm
    receives `atTerminal` from its caller but does not pass it to
    `executeBlock` (the function takes none).
  - `src/runtime/statement-executor.ts:1575` — `evalMatch` carefully threads
    `atTerminal` into arm bodies, but an arm body that IS a block expression
    re-enters `executeBlock` and the flag is dropped (reproduction B4).
- **Observed at:** v0.382.0 (d63c5148), offline scratch vitest over the real
  `executeBody` with the b0351 witness's ScriptedHost harness; scratch deleted.

## Summary

`BlockExpr` is admitted at exactly two positions (grammar.md §Block
expressions: a `let` / `let mut` initialiser and a `match`-arm body), and its
"value is the tail expression" — a VALUE position. But `executeBlock`
evaluates every tail with `atTerminal=true`, the flag whose meaning is "the
value is returned/discarded, re-wrapped once downstream". For a let-bound
block there is no downstream re-wrap and the value is not returned: a
succeeding tail query binds its raw payload (no `Result` brand) and a failing
one fails the whole theta. Both dispositions contradict the query contract for
a consumed binding, and both differ from the byte-identical program with the
braces removed.

## Reproduction

Scratch vitest (deleted) over the real `executeBody` with the b0351 harness
(ScriptedHost scripting the query effect; hand-built AST per the house
pattern — the parser derives the same shape from the grammar's let-init
BlockExpr position; independently confirmed — the real `parseThetaDocument`
over `let r = {\n @`q`\n}\nr` parses with zero diagnostics and yields
`init.kind === "block"`, so the production parser reaches this seam and the
hand-built AST is faithful). Observed at d63c5148:

| # | Program | Query result | Expected | Observed |
|---|---------|--------------|----------|----------|
| B1 | `let r = { @`q` }` then `match r { Ok(v)=>v, Err(_)=>"ERRARM" }` | `{ok:true,value:"PAYLOAD"}` | success, `"PAYLOAD"` (Ok arm) | throw `MatchError: no arm matched PAYLOAD` |
| B2 | same program | `{ok:false,error:{kind:"transport"}}` | success, `"ERRARM"` (Err arm) | `outcome: "fail"` — the theta fails at the effect site |
| B3 (control) | `let r = @`q`` (no braces), same match | `{ok:true,value:"PAYLOAD"}` | success, `"PAYLOAD"` | success, `"PAYLOAD"` (the 0351 fixed path) |
| B4 | `let r = match c { _ => { @`q` } }`, same match on `r` | `{ok:true,value:"PAYLOAD"}` | success, `"PAYLOAD"` | throw `MatchError: no arm matched PAYLOAD` |

B3 vs B1: adding braces around the initialiser flips the binding from
`Ok(payload)` to the raw payload. B4 shows `evalMatch`'s correct `atTerminal`
threading is nullified when the arm body is a block.

## Expected behaviour

- `docs/spec_topics/query/query-failure-and-repair.md` QRY-8: "A query never
  throws. Both forms return a `Result`."
- query-forms.md QRY-1/QRY-2: return type `Result<string, QueryError>` /
  `Result<Schema, QueryError>`; a `let` binds the expression's value.
- `docs/spec_topics/grammar.md` §Block expressions: "BlockExpr ::= "{" Stmt*
  Expr "}" — expression-position; tail Expr required, value is the tail
  expression". The block's value is the query's value — the `Result`.
- `docs/spec_topics/errors-and-results/error-model.md:10`: an `Err`-class
  outcome reaches the *fail* arm "only when the resulting `Err` is unhandled —
  propagated via `?` or returned, not consumed by a caller `match`". In B2 the
  value is bound and consumed by a caller `match`; the theta must not fail.
- Bug 0307's parent adjudication (its fix record, verbatim): "a query effect
  in ANY value position evaluates to a Result VALUE".

## Actual behaviour / root cause

`executeBlock` serves three block classes (body blocks, statement-form
control-flow blocks, expression-position blocks) with one hard-coded
`atTerminal=true` at the tail (`statement-executor.ts:2073`). The flag is
correct for the first class (the body boundary's `makeOk(flow.value)` re-wrap
and ERR-19 fail routing) and for discarded statement-block tails, but an
expression-position block's value flows into a binding: no re-wrap runs, so
the raw success payload and the `fail` routing both escape to the author.
For the B2 half the load-bearing ground is `error-model.md:10`: the fail-arm
routing is defined only for an unhandled `Err` — "propagated via `?` or
returned, not consumed by a caller `match`" — and in B2 the `Err` is bound
and consumed by a caller `match`, so the abort contradicts the error model
regardless of how the Ok-side binding shape is adjudicated.
`evalExpr`'s `"block"` arm has the caller's `atTerminal` in scope and drops
it.

## Why it matters

The two spellings `let r = @`q`` and `let r = { @`q` }` are documented as the
same value ("value is the tail expression") but bind different shapes; the
braces spelling's success path panics through both documented consumption
forms and its failure path kills the theta the author wrote handling code
for. A match-arm block body (`let r = match c { big => { … @`q` } }`) is the
natural spelling for any non-trivial arm, so the class is reachable by
ordinary refactoring, and the failure is a runtime abort with no parse-time
warning.

## Non-goals

- The BODY bare-tail / `return @`q`` disposition (raw-then-rewrapped, Err →
  fail) — 0307/0351's pinned law for genuinely returned positions, unchanged.
- 0316's non-effect scrutinee rule and the CONV-6/0017 fn-call-boundary wrap.
- Statement-form control-flow block tails (values discarded; grammar.md
  §statement-form blocks) — no observable change required there.

## Fix

Thread the consumption position into the block tail: `evalExpr`'s `"block"`
arm passes its own `atTerminal` down (add a parameter to `executeBlock`,
defaulting to the current `true` for the body/statement call sites), so a
value-position block's tail evaluates with `atTerminal=false` — success wraps
`asResultValue`, failure binds `makeErr` — while body tails keep the terminal
disposition. Witness set: B1/B2/B4 flipping to bind, B3 and a body-bare-tail
`@`q`` control staying byte-identical (no double-wrap, per 0351's W4/W5
controls).

Disposition caution for the fixer: this is a disposition change, and 0351's
Residual 1 framed the current behaviour as mirroring 0307's landed Err-side
law — a fixer parent may adjudicate the B1 (raw Ok binding) half as designed.
The B1 claim rests on 0351 Residual 1's explicit follow-up-report invitation
(the fixer named this spelling as an input class an author writes expecting
`Ok(payload)`); the B2 (Err-abort) half does not depend on that adjudication —
it rests on error-model.md:10's consumed-by-a-caller-`match` clause, which the
alternative (pinning "a block tail is a terminal position" in the spec) would
contradict for B2.

## Provenance

Fix-residuals sweep over bugs 0351-0385: 0351 §Fix Residual 1 named this
spelling unprospected. Probed at d63c5148 with a scratch vitest (4 cells,
table above) over the real `executeBody`; scratch deleted. Spec read: QRY-8,
grammar.md §Block expressions, error-model.md:10, 0307/0351 pinned
dispositions. Implementation read: statement-executor.ts:906-1183 (evalExpr
effect arm), :2048-2077 (executeBlock), :1534-1575 (evalMatch). Dup check:
README index has no block-tail report; 0351/0307 are fixed and both scope
themselves away from this spelling.
