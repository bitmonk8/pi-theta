---
id: PTQ-1714
title: walkCallSiteExpr still contrasts its par-for descent with an identifier walk that now performs the same descent.
lens: D2
status: open
verdict: confirmed
locations:
  - src/parser/lexical-call-sites.ts:568-574
  - src/parser/ident-resolution.ts:437-451
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d2-cruft (openai/gpt-6.1-sol)
date: 2026-10-28
---

# walkCallSiteExpr still contrasts its par-for descent with an identifier walk that now performs the same descent.

## Observation
The `par-for` arm says it is reached explicitly “unlike the ident walk.” The current identifier walk has an explicit `par-for` arm that visits the iterand, optional maximum, and body. Its comment also names the lexical walk as the traversal-order counterpart.

## Evidence
`src/parser/lexical-call-sites.ts:568-574`:

```ts
    case "par-for": {
      // Reached explicitly (unlike the ident walk, which predates RFC 0003):
      // a `par for` body is a call-site-bearing block and its per-iteration
      // variable shadows.
      // RFC 0011 (seam sheet §0 C4): the body descends with `insideParFor`
      // true; the iterand and max stay under the caller's flag.
      walkCallSiteExpr(e.iterand, locals, insideParFor, walkCtx);
```

`src/parser/ident-resolution.ts:437-451`:

```ts
    case "par-for": {
      // The body inherits a COPY of the enclosing scope, not `walkCtx.roots`:
      // CTRL-4 (control-flow.md:76) states outer bindings and the loop
      // variable are both readable inside a `par for` body, so the `fn`
      // arm's whole-file reseeding above is not the model here. Traversal
      // order (iterand, then `max`, then body) mirrors `walkCallSiteExpr`'s
      // `case "par-for"` and `walkExpr`'s `case "par-for"`.
      walkIdentExpr(e.iterand, scope, walkCtx, file, out);
      if (e.max !== null) {
        walkIdentExpr(e.max, scope, walkCtx, file, out);
      }
      const inner = new Set(scope);
      inner.add(e.variable);
      walkIdentBlock(e.body, inner, walkCtx, file, out);
      return;
```

## Why this is a problem
This is historical implementation narration presented as a current contrast. The explicit identifier-walk arm contradicts the claimed difference, so the comment no longer describes the relationship between the live walkers.

## False-positive check
`rg -n 'case "par-for"' src/parser/ident-resolution.ts` locates the implemented arm at line 437 and its explanatory reference at line 443. Read the complete arm to distinguish executable descent from a comment-only mention. `git show 844d6533 --stat` identifies the bug-0224 change adding identifier-walk descent; `git show 336b8de4:src/parser/ident-resolution.ts` already contains the arm while `git show 336b8de4:src/parser/lexical-call-sites.ts` retains the contrast. PTQ-1677 concerns switch-exhaustiveness mechanisms and cites this prose as history; this finding concerns only the prose's present-tense contrast, not switch design or missing traversal. No deadness claim is made.

## Triage
verdict: confirmed — lexical-call-sites.ts:569 still says “unlike the ident walk,” but ident-resolution.ts:437-451 explicitly walks the iterand, optional max, and scoped body; commit 844d6533 verifies that descent landed in bug 0224, making the contrast stale D2 prose rather than a traversal bug. PTQ-1677 tracks switch exhaustiveness, not this stale contrast; no duplicate found. (triage: claude-opus-5-5)
