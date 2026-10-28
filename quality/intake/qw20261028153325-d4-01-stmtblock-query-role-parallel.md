---
id: pending
title: Three query-context dispatches independently classify discarded statement-block tails.
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/query-schema-resolve.ts:234-247
  - src/parser/query-schema-resolve.ts:384-397
  - src/parser/query-schema-resolve.ts:315-325
  - src/parser/query-schema-resolve.ts:334-382
  - src/parser/structural-checks.ts:405-419
  - src/parser/structural-checks.ts:476-515
sites: 3
fix_scope: module
d4_class: parallel
wave: qw20261028153325
reported_by: lens-d4-duplication (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# Three query-context dispatches independently classify discarded statement-block tails.

## Observation
`query-schema-resolve.ts` classifies the bodies of statement-form `if`, `while`, and `for` as discarded-tail contexts in both its ordinary statement dispatcher and its return-aware dispatcher. `structural-checks.ts` classifies the same bodies with a separately supplied `"statement"` role, which makes a direct query tail reach the QRY-19 discard predicate. These are three context dispatches across two production passes; they agree today, but commit `19b4fcc5a4f2317ca629ba0037886162fa13a450` had to correct both passes' treatment of this boundary for bug 0511.

## Evidence
The counted copies are the three dispatches below, not each individual switch arm or helper. `else` blocks belong to the `if` kind; an `else if` recursively re-enters that kind rather than adding another discriminant.

### Copy 1: ordinary schema-resolution contexts
The loop bodies receive empty tail frames directly; `if` delegates to a helper that supplies the same empty frames to both branches.

`src/parser/query-schema-resolve.ts:234-247`:

```ts
      case "if":
        return this.rewriteIf(stmt);
      case "while":
        return {
          ...stmt,
          condition: this.rewriteExpr(stmt.condition, [OPAQUE_FRAME]),
          body: this.rewriteBlock(stmt.body, []),
        };
      case "for":
        return {
          ...stmt,
          iterand: this.rewriteExpr(stmt.iterand, [OPAQUE_FRAME]),
          body: this.rewriteBlock(stmt.body, []),
        };
```

`src/parser/query-schema-resolve.ts:384-397`:

```ts
  private rewriteIf(stmt: IfStmt): IfStmt {
    const otherwise =
      stmt.otherwise === null
        ? null
        : "statements" in stmt.otherwise
          ? this.rewriteBlock(stmt.otherwise, [])
          : this.rewriteIf(stmt.otherwise);
    return {
      ...stmt,
      condition: this.rewriteExpr(stmt.condition, [OPAQUE_FRAME]),
      then: this.rewriteBlock(stmt.then, []),
      otherwise,
    };
  }
```

### Copy 2: return-aware schema-resolution contexts
The same three statement kinds are classified again. Explicit `return` operands keep the enclosing function sink, but the block tails receive empty frames; the shared block-rewrite mechanics do not themselves choose the role of each statement kind.

`src/parser/query-schema-resolve.ts:334-348`:

```ts
      case "if": {
        const rewriteBranch = (b: Block): Block =>
          this.rewriteReturnAwareBlock(b, returnFrames, []);
        const otherwise =
          stmt.otherwise === null
            ? null
            : "statements" in stmt.otherwise
              ? rewriteBranch(stmt.otherwise)
              : (this.rewriteReturnAware(stmt.otherwise, returnFrames) as IfStmt);
        return {
          ...stmt,
          condition: this.rewriteExpr(stmt.condition, [OPAQUE_FRAME]),
          then: rewriteBranch(stmt.then),
          otherwise,
        };
```

`src/parser/query-schema-resolve.ts:350-360`:

```ts
      case "while":
        // A `return` deep in a loop body still targets the fn's implicit return,
        // so the body's STATEMENTS keep the return sink (`rewriteReturnAware`);
        // the loop-body TAIL is not the fn's implicit return, so it rewrites
        // with fresh (sink-less) frames. The condition is an opaque `stop` — the
        // sink never crosses it.
        return {
          ...stmt,
          condition: this.rewriteExpr(stmt.condition, [OPAQUE_FRAME]),
          body: this.rewriteLoopBody(stmt.body, returnFrames),
        };
```

`src/parser/query-schema-resolve.ts:361-368`:

```ts
      case "for":
        // Same as `while`: return-aware body statements, sink-less loop tail, an
        // opaque iterand.
        return {
          ...stmt,
          iterand: this.rewriteExpr(stmt.iterand, [OPAQUE_FRAME]),
          body: this.rewriteLoopBody(stmt.body, returnFrames),
        };
```

`src/parser/query-schema-resolve.ts:380-382`:

```ts
  private rewriteLoopBody(block: Block, returnFrames: readonly OriginFrame[]): Block {
    return this.rewriteReturnAwareBlock(block, returnFrames, []);
  }
```

`src/parser/query-schema-resolve.ts:315-325`:

```ts
  private rewriteReturnAwareBlock(
    block: Block,
    returnFrames: readonly OriginFrame[],
    tailFrames: readonly OriginFrame[],
  ): Block {
    const statements = block.statements.map((stmt) =>
      this.rewriteReturnAware(stmt, returnFrames),
    );
    const tail = block.tail === null ? null : this.rewriteExpr(block.tail, tailFrames);
    return { statements, tail };
  }
```

### Copy 3: structural query-check contexts
The structural dispatcher independently marks both `if` branches and both loop forms as `"statement"` blocks.

`src/parser/structural-checks.ts:476-490`:

```ts
    case "if": {
      walkExpr(s.condition, scope, refs, file, out);
      walkBlock(s.then, "statement", { ...scope, topLevel: false }, refs, file, out);
      if (s.otherwise !== null) {
        if ("statements" in s.otherwise) {
          walkBlock(s.otherwise, "statement", { ...scope, topLevel: false }, refs, file, out);
        } else {
          walkStatement(
            s.otherwise,
            { ...scope, topLevel: false },
            refs,
            file,
            out,
          );
        }
```

`src/parser/structural-checks.ts:494-504`:

```ts
    case "while":
      walkExpr(s.condition, scope, refs, file, out);
      walkBlock(
        s.body,
        "statement",
        { ...scope, inLoop: true, topLevel: false },
        refs,
        file,
        out,
      );
      return;
```

`src/parser/structural-checks.ts:505-515`:

```ts
    case "for":
      walkExpr(s.iterand, scope, refs, file, out);
      walkBlock(
        s.body,
        "statement",
        { ...scope, inLoop: true, topLevel: false },
        refs,
        file,
        out,
      );
      return;
```

That role is load-bearing at the query-tail consumer:

`src/parser/structural-checks.ts:405-419`:

```ts
    // QRY-19 applies to a direct bare query in a discarded StmtBlock tail,
    // regardless of whether promotion put it here or in a QueryStmt slot.
    if (role === "statement" && block.tail.kind === "query") {
      pushDiag(
        out,
        checkDiscardedQueryResult({
          isQuery: true,
          disposition: "bare-expr-statement",
          file,
          range: block.tail.range,
        }),
      );
    }
    walkExpr(block.tail, scope, refs, file, out);
  }
```

**Diff verdict:** parallel implementations, not an identical or renamed-only token clone. Copies 1 and 2 express the discarded-tail decision through empty schema-frame lists, while copy 3 expresses it through a block-role string and a query-tail predicate. There is no present disagreement about the three statement kinds. The injected clone-map group G039 concerns other expression-rewrite arms at `query-schema-resolve.ts:433-444` and `:446-458`, not these dispatches.

A TypeScript-AST inspection of the immediate switch in `rewriteStmt`, `rewriteReturnAware`, and `walkStatement`, filtering case labels to `if`, `while`, and `for`, returned exactly three labels in each dispatcher:

| Statement kind | Ordinary schema dispatcher | Return-aware schema dispatcher | Structural dispatcher |
| --- | --- | --- | --- |
| `if` (then / block-else; else-if recurses) | empty tail frames | empty tail frames | `"statement"` |
| `while` | empty tail frames | empty tail frames via `rewriteLoopBody` | `"statement"` |
| `for` | empty tail frames | empty tail frames via `rewriteLoopBody` | `"statement"` |

## Why this is a problem
This is load-bearing parallel truth about a query's surrounding block, not incidental similarity between unrelated traversals. When `rewriteStmt` gains a discarded-block-bearing statement kind, `rewriteReturnAware` and the structural `walkStatement` must classify it too: today the return-aware dispatcher and structural dispatcher each cover **3 of the ordinary dispatcher's 3 statement kinds** in this class. A different classification changes whether a query borrows a function-return schema and whether a direct bare query tail draws `theta/parse/discarded-query-result`. The two diagnostics need not share an outcome, but they must agree on the underlying discarded-versus-value context.

The drift cost is recorded, not hypothetical. `docs/bugs/0511-qry19-stmtblock-tail-single-vs-multi.md:292-305` identifies both errors: structural `walkBlock` treated a promoted query tail as a value without QRY-19, while return-aware if/else rewriting supplied function-return frames to discarded tails. The ordinary resolver already gave these branch tails empty frames. In `git show 19b4fcc5 -- src/parser/query-schema-resolve.ts`, the return-aware branch changed from:

```ts
          this.rewriteReturnAwareBlock(b, returnFrames, returnFrames);
```

to:

```ts
          this.rewriteReturnAwareBlock(b, returnFrames, []);
```

The same commit added the structural block-role argument, its query-tail check, and `"statement"` at the three statement-kind dispatches. The bug record at lines 307-309 explicitly establishes that the sink leak was not a cascade of the missing diagnostic: schema resolution runs before structural checking. One boundary therefore needed separate corrections in the two passes, and one resolver mode had disagreed with its ordinary mode.

The correct current boundary is pinned by `docs/spec_topics/query/query-forms.md:44` (a discarded statement-block tail cannot inherit the function-return sink) and QRY-19 at `docs/spec_topics/query/query-escapes-stringification.md:51-53` (a direct bare query in such a tail is a discarded query result). This filing concerns the independently maintained context classification left after that fix, not re-opening bug 0511 or claiming a current behavioral failure.

## Suggested direction (non-binding, optional)
Shared source of truth (hypothesis) for statement-block query context. The nearest common home of the cited implementations is `src/parser/`.

## False-positive check
- Re-read every current production excerpt immediately before filing. Both passes are live: `theta-document.ts:246` calls `resolveQuerySchemas`, and `:327` calls `checkStructural`; the latter's query-tail path calls the single existing `checkDiscardedQueryResult` predicate. The predicate and its diagnostic constants are not additional copies of the classification.
- Counted the same three statement discriminants with the TypeScript parser in all three dispatches. Included both ordinary and return-aware schema modes, both `if` block branches, and both loop forms; else-if delegates recursively. The count is scoped to these query-context dispatches, not to unrelated return-type inference or runtime execution walks.
- Re-verified G039 at both injected spans and diffed them mechanically. Its renamed-only scanner match crosses separate expression cases (`binary`/`member` versus `index`/`match`) and is incidental to this finding; it is not used as evidence for the parallel.
- Checked the deliberate-mirror carve-out. Comments explain why explicit returns keep a sink while statement-block tails do not; neither those comments nor bug 0511 gives a rationale for maintaining the case-to-context classification independently across the two passes. The historical defect concerned that classification, not the intentional differences between their downstream actions.
- These are handwritten production AST dispatches, not generated code or spec-normative reference-vector tables. The repeated spec prose is used only to establish the boundary, not filed as duplication. No finding location is under `tests/`; the existing `tests/b0511-stmtblock-query-tail-unit.test.ts` independently exercises both walks and is not claimed absent or defective.
- Checked existing topics: PTQ-1297 consolidated the resolver's block-rewrite mechanics, but those mechanics still receive caller-selected tail frames; PTQ-1139 concerns the separate `SchemaSinkFrame` kind producer/consumer tether. PTQ-1677 concerns silent-default versus never-backstop policy, not this currently complete context classification. Searches for `rewriteReturnAwareBlock`, `StmtBlock`, `statement-block`, and `0511` across `quality/issues/` and `quality/intake/` found no matching candidate before this filing.

## Triage
verdict: questionable — Accounting verified: all excerpts match, all three live dispatches classify if/while/for (3/3 each), and commit 19b4fcc5 plus bug 0511 demonstrate independent sink-leak and discarded-tail diagnostic corrections; PTQ-1297/1139/1677 track different causes. A shared context-classification source is a design decision requiring a human ruling. (triage: claude-opus-5-5)
