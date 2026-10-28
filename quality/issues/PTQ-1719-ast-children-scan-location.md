---
id: PTQ-1719
title: childExprs still locates the question-mark operand scan in ast-children.ts after its extraction.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/ast-children.ts:10-15
  - src/parser/type-layer-walk.ts:912-921
  - src/parser/type-layer-walk.ts:931-942
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# childExprs still locates the question-mark operand scan in ast-children.ts after its extraction.

## Observation
The `childExprs` docstring says the helper is shared by the question-mark “operand scan here.” The current module contains the child-enumeration helpers, whereas the question-mark scan lives in `TypeLayerWalk.bodyHasQuestion` in `type-layer-walk.ts`. That scan calls the extracted helpers.

## Evidence
The local-scan claim, `src/parser/ast-children.ts:10-15`:

```ts
/**
 * The direct child expressions of an expression node — shared by the `?`
 * operand scan here and by theta-document.ts's interpolation-form scan and
 * call-site node walk.
 */
function childExprs(e: Expr): readonly Expr[] {
```

The scan's present location, `src/parser/type-layer-walk.ts:912-921`:

```ts
  /** Whether a `fn` body bears a `?` anywhere (forcing a `Result` return wrap). */
  private bodyHasQuestion(block: Block): boolean {
    let found = false;
    const visitExpr = (e: Expr): void => {
      if (found) {
        return;
      }
      if (e.kind === "try") {
        found = true;
        return;
```

Its helper calls, `src/parser/type-layer-walk.ts:931-942`:

```ts
      for (const child of childExprs(e)) {
        visitExpr(child);
      }
    };
    const visitBlock = (b: Block): void => {
      for (const s of b.statements) {
        for (const e of stmtExprs(s)) {
          visitExpr(e);
        }
        for (const nested of stmtBlocks(s)) {
          visitBlock(nested);
        }
```

Exact search: `grep -nE 'function |childExprs\(' src/parser/ast-children.ts` returns three hits, the declarations of `childExprs`, `stmtExprs`, and `stmtBlocks`. The full module was also read to check the absence of a separate scan.

## Why this is a problem
The helper's ownership description retains a location-relative reference from its former host. A reader following “here” to find the question-mark traversal is directed to the child accessor module instead of the scanner's current host. This is stale collaborator prose; the shared enumeration and the scan are not themselves challenged.

## False-positive check
Read all of `ast-children.ts` and inspected the present `bodyHasQuestion` implementation and its calls at the cited locations. `git log --oneline -S 'operand scan here' -- src/parser/ast-children.ts` identifies `206a4d47`; `git show 206a4d47 -- src/parser/ast-children.ts` shows the file created with the quoted docstring already present. The module-level header now names `./type-layer-walk`, but the function docstring retains the old local reference. No deadness claim is made about these live helpers or their re-export facade.

## Triage
verdict: confirmed — ast-children.ts:10-15 still says “operand scan here,” but the full module contains only child-enumeration helpers; TypeLayerWalk.bodyHasQuestion at type-layer-walk.ts:912-948 owns the scan and calls them. All excerpts, the three-hit search, and extraction commit 206a4d47 reproduce; no existing finding tracks this stale location reference. (triage: claude-opus-5-5)
