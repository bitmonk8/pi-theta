---
id: PTQ-1724
title: checkStatementPlacement points above itself for structural walkers that reside in structural-checks.ts.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/statement-placement.ts:48-53
  - src/parser/structural-checks.ts:382-388
  - src/parser/structural-checks.ts:422-428
  - src/parser/structural-checks.ts:797-803
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# checkStatementPlacement points above itself for structural walkers that reside in structural-checks.ts.

## Observation
The placement-checker header directs readers to `walkStatement`, `walkBlock`, and `walkExpr` “above.” Those three function declarations are in `structural-checks.ts`, not above the header in `statement-placement.ts`. The locator survived the placement checker’s extraction into its own file.

## Evidence
`src/parser/statement-placement.ts:48-53`:

```ts
 * The descent mirrors the structural walker's own reach (`walkStatement` /
 * `walkBlock` / `walkExpr` above) — every `if`/`while`/`for`/`fn` body, every
 * `par for` body, every `subagent fn` `with`-clause value, and every
 * block-expression an arbitrarily nested expression tree can carry — so a
 * nested `export`/`import` cannot hide one level deeper in the document body
 * AST than this walk looks. Reach stops at the document body AST: a `query`
```

`src/parser/structural-checks.ts:382-388`:

```ts
function walkBlock(
  block: Block,
  role: "statement" | "value",
  scope: WalkCtx,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
```

`src/parser/structural-checks.ts:422-428`:

```ts
function walkStatement(
  s: Stmt,
  scope: WalkCtx,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
): void {
```

`src/parser/structural-checks.ts:797-803`:

```ts
function walkExpr(
  e: Expr,
  scope: WalkCtx,
  refs: StructuralRefs,
  file: string,
  out: Diagnostic[],
  bareObjectAllowed = false,
```

The exact search `rg -n 'function (walkStatement|walkBlock|walkExpr)\b' src/parser/statement-placement.ts src/parser/structural-checks.ts` returns three hits, all in `structural-checks.ts`, at lines 382, 422, and 797.

## Why this is a problem
This is a dangling source locator left by extraction. The cited collaborator names remain live, but the relative location in the function header directs the reader to a file region that does not contain them.

## False-positive check
Read lines 1–63 of `statement-placement.ts` and ran the exact declaration search recorded above. `git log -3 -p -- src/parser/statement-placement.ts` shows commit `526562e2` creating the file with the “above” sentence intact; `git show 526562e2 --stat` shows the corresponding extraction from `theta-document.ts`. This does not challenge the statement-placement policy, traversal reach, or helper exports. No deadness claim is made.

## Triage
verdict: confirmed — The header still says the three structural walkers are “above,” but the exact declaration search finds them only in structural-checks.ts at 382, 422, and 797; commit 526562e2 preserved this stale locator when extracting statement-placement.ts, and no existing finding tracks this pointer. (triage: claude-opus-5-5)
