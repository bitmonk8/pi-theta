---
id: PTQ-1297
title: fn-body and loop-body query-schema rewrites are cloned
lens: D4
status: open
verdict: confirmed
locations:
  - src/parser/query-schema-resolve.ts:304-310
  - src/parser/query-schema-resolve.ts:368-374
sites: 2
fix_scope: module
d4_class: clone
wave: qw20260922211400
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-22
---

# fn-body and loop-body query-schema rewrites are cloned

## Observation
`QuerySchemaResolveWalk` in `src/parser/query-schema-resolve.ts` carries two private block-rewrite helpers: `rewriteFnBlock` (lines 304-310) and `rewriteLoopBody` (lines 368-374). Both map every statement through `rewriteReturnAware` with the enclosing `returnFrames`, then rewrite the block tail. The two method bodies are token-identical except for the frames passed to the tail-expression rewrite.

## Evidence

**Copy 1 — `rewriteFnBlock`**
```typescript
// src/parser/query-schema-resolve.ts:304-310
  private rewriteFnBlock(block: Block, returnFrames: readonly OriginFrame[]): Block {
    const statements = block.statements.map((stmt) =>
      this.rewriteReturnAware(stmt, returnFrames),
    );
    const tail = block.tail === null ? null : this.rewriteExpr(block.tail, returnFrames);
    return { statements, tail };
  }
```

**Copy 2 — `rewriteLoopBody`**
```typescript
// src/parser/query-schema-resolve.ts:368-374
  private rewriteLoopBody(block: Block, returnFrames: readonly OriginFrame[]): Block {
    const statements = block.statements.map((stmt) =>
      this.rewriteReturnAware(stmt, returnFrames),
    );
    const tail = block.tail === null ? null : this.rewriteExpr(block.tail, []);
    return { statements, tail };
  }
```

**Diff verdict (clone-map group G052):** renamed-only (1). The only material difference is `this.rewriteExpr(block.tail, returnFrames)` in `rewriteFnBlock` versus `this.rewriteExpr(block.tail, [])` in `rewriteLoopBody`. The method names differ, and the single expression-level identifier `returnFrames` is replaced by an empty array literal on the tail-rewrite line.

## Why this is a problem
The two methods are load-bearing duplicates. A `fn` body's tail is the function's implicit return, so it must carry the declared-return sink (`returnFrames`) so a query written there resolves against the return type. A loop body's tail is not the function's implicit return, so it must rewrite with fresh, sink-less frames (`[]`).

Because the surrounding harness (map statements through `rewriteReturnAware`, null-tail guard, return the rebuilt block) is duplicated, any future change to that harness risks being applied to only one copy. If `rewriteLoopBody` ever received `returnFrames` for its tail, queries in loop tails would incorrectly resolve against the enclosing function's return type. If `rewriteFnBlock` ever received `[]`, queries in function tails would lose return-type propagation. The current one-line divergence is intentional and commented (lines 363-366), but the duplication creates drift surface around the shared structure.

## Suggested direction (non-binding, optional)
Collapse the two methods into one private helper `rewriteReturnAwareBlock(block, statementFrames, tailFrames)` that lives beside the current methods in `src/parser/query-schema-resolve.ts`. `rewriteFnBlock` would call it with `statementFrames = tailFrames = returnFrames`; `rewriteLoopBody` would call it with `statementFrames = returnFrames` and `tailFrames = []`.

## False-positive check
- Clone-map group **G052** re-verified at the cited spans; both copies are live.
- Both methods are actively called: `rewriteFnBlock` is used for `fn` bodies (line 339); `rewriteLoopBody` is used for `while` bodies (line 352) and `for` bodies (line 365).
- The one-line divergence is intentional and documented in the `rewriteLoopBody` doc comment (lines 362-367), so this is a clone, not drift.
- No existing `quality/intake/*.md` file mentions `rewriteFnBlock` or `rewriteLoopBody` (grep returned no matches).
- Not a spec-normative vector table; not in `tests/`; not generated code.

## Triage
verdict: confirmed — excerpts match at 304-310 / 368-374; `clone-scan map` reproduces G052 renamed-only (1) at 294-308/358-372; both live (`rewriteFnBlock` called at 279, `rewriteLoopBody` at 347 and 355); the sole divergence is the tail-frame argument (`returnFrames` vs `[]`), a pure parameterization, so the dedupe is mechanical; not tracked by any PTQ (the qw20260920183643 shard-14 "incidental" note is a reviewer disposition, not a ruling); undercounted — the inline `rewriteBranch` lambda in the `if` arm (320-324) is a third copy identical in shape to `rewriteFnBlock` and should fold into the same helper (triage: claude-fable-5-1)
