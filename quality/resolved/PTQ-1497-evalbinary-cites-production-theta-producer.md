---
id: PTQ-1497
title: evalBinary's doc comment still cites production-theta-producer.ts as evaluateBinaryExpression's home
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:629-640
sites: 1
fix_scope: localized
wave: qw20260923185337
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# evalBinary's doc comment still cites production-theta-producer.ts as evaluateBinaryExpression's home

## Observation
`evalBinary`'s doc comment in `statement-executor.ts` states that its
evaluation order/short-circuit rules mirror "the pure host's
`evaluateBinaryExpression` (production-theta-producer.ts) verbatim". The
function `evaluateBinaryExpression` no longer lives in
`production-theta-producer.ts` — it was extracted into
`src/runtime/pure-expression-evaluator.ts` by commit `475e62db` (2026-09-21),
which moved the whole pure-evaluator family out of the producer file. The
comment in `statement-executor.ts` was not updated in that commit and still
names the pre-extraction file.

## Evidence
`src/runtime/statement-executor.ts:629-640`:
```ts

/**
 * Decompose a `binary` node on the executor so an operand subtree holding a
 * control/effect form dispatches through `evalExpr`. The evaluation order and
 * short-circuit are the pure host's `evaluateBinaryExpression`
 * (production-theta-producer.ts) verbatim: `!` / unary `-` (the parser models
 * both as a binary; unary `-` has a synthetic `null` left) evaluate only the
 * right operand and are checked before the left is evaluated; `&&` / `||`
 * evaluate the right operand only when the left does not decide the result (so
 * a short-circuited operand's effect never dispatches); every other operator
 * evaluates left-then-right and applies the scalar disposition. Any operand
 * whose evaluation is a non-`value` flow short-circuits and carries that
 * terminal flow verbatim.
 */
async function evalBinary(expr: BinaryExpr, env: LexicalEnvironment, deps: ExecuteBodyDeps): Promise<EvalResult> {
```

Current declaration site, `src/runtime/pure-expression-evaluator.ts:462`:
```ts
function evaluateBinaryExpression(
```

`git blame -L 633,633 src/runtime/statement-executor.ts` attributes the citing
line to commit `2bc691576` (2026-07-19), before the extraction; `git log
--oneline --follow -- src/runtime/pure-expression-evaluator.ts` shows the
file's earliest commit is `475e62db` (2026-09-21, "fix
d9/src__extension__production-theta-producer.ts"), whose diffstat shows
`production-theta-producer.ts` shrinking by ~4700 lines while
`pure-expression-evaluator.ts` is newly added at 638 lines — the commit that
relocated `evaluateBinaryExpression` out of the producer file. `git show
475e62db --stat` does not list `src/runtime/statement-executor.ts` among the
changed files, so this comment's citation was left unrepointed.

## Why this is a problem
The parenthetical is a forward reference meant to help a reader find the
sibling implementation it claims to mirror; it now points at a file that no
longer contains that function, sending a reader who follows it to
`production-theta-producer.ts` (a 4700-line file after the extraction) to
search in vain for `evaluateBinaryExpression`, which lives in
`pure-expression-evaluator.ts` instead.

## Suggested direction (non-binding, optional)
Repoint the parenthetical to `pure-expression-evaluator.ts`.

## False-positive check
Confirmed `evaluateBinaryExpression` is declared exactly once in the current
tree, at `src/runtime/pure-expression-evaluator.ts:462` (`grep -rn "function
evaluateBinaryExpression" .`, excluding `.git/lost-found/` mirror blobs);
confirmed no remaining declaration or re-export of it in
`production-theta-producer.ts` (`grep -n evaluateBinaryExpression
src/extension/production-theta-producer.ts` — no hits). Confirmed via `git
blame` that the citing comment predates the 2026-09-21 extraction commit
(`475e62db`) and that commit's `--stat` output does not touch
`statement-executor.ts`. Checked the other five files in this wave's scope
(`executor-result-flow.ts`, `pure-expression-evaluator.ts`,
`query-swallowing-handler.ts`, `invoke-swallowing-handler.ts`,
`tool-call-swallowing-handler.ts`, `with-clause-static-checks.ts`) for the
same stale string — no other hits.

## Triage
verdict: confirmed — excerpt reproduces at statement-executor.ts:629-641 (line 633 cites `(production-theta-producer.ts)`); `function evaluateBinaryExpression` is declared only at src/runtime/pure-expression-evaluator.ts:462 and has zero hits in src/extension/production-theta-producer.ts; blame puts line 633 at 2bc691576 (2026-07-19), and 475e62db's --stat touches only production-theta-producer.ts (−) and pure-expression-evaluator.ts (+638), not statement-executor.ts, so the pointer went stale in the extraction; mechanically-evidenced stale citation in src/ (same class as confirmed D2 PTQ-1099/1104/1110); not a duplicate — PTQ-1456 (resolved, D4 clone of the scalar switch) and open D9/D4 intakes naming evalBinary do not track this citation (triage: claude-opus-5-5)
