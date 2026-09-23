---
id: pending
title: lexical-call-site and par-for-body AST walkers are parallel traversal passes
lens: D4
status: intake
verdict: pending
locations:
  - src/parser/lexical-call-sites.ts:407-491
  - src/parser/lexical-call-sites.ts:493-599
  - src/parser/par-for-body-checks.ts:75-184
  - src/parser/par-for-body-checks.ts:186-269
sites: 4
fix_scope: module
d4_class: parallel
wave: qw20260923145222
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-23
---

# lexical-call-site and par-for-body AST walkers are parallel traversal passes

## Observation
`src/parser/lexical-call-sites.ts` and `src/parser/par-for-body-checks.ts` each implement a full recursive walk over the same `Stmt` and `Expr` discriminant sets. `walkCallSiteStmt` / `walkCallSiteExpr` enforce RFC 0011 call-site rules and bug 0016/0072 lexical checks, while `scanParForStmt` / `scanParForExpr` enforce CTRL-4 `par for` body restrictions. The two passes are independent: neither calls the other, and neither delegates traversal to a shared utility. Their case arms agree on which node kinds have children and how to reach them, but the shared traversal logic is repeated inline.

## Evidence

`src/parser/lexical-call-sites.ts:407-491` — `walkCallSiteStmt` switches over `s.kind`:

```ts
function walkCallSiteStmt(
  s: Stmt,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  switch (s.kind) {
    case "let":
      if (s.init !== null) {
        walkCallSiteExpr(s.init, locals, insideParFor, walkCtx);
      }
      if (s.name !== "_") {
        locals.set(s.name, { kind: "let", line: s.range.start.line });
      }
      return;
    case "reassign":
      walkCallSiteExpr(s.value, locals, insideParFor, walkCtx);
      return;
    case "if": {
      walkCallSiteExpr(s.condition, locals, insideParFor, walkCtx);
      walkCallSiteBlock(s.then, new Map(locals), insideParFor, walkCtx);
      if (s.otherwise !== null) { ... }
      return;
    }
    case "while":
      walkCallSiteExpr(s.condition, locals, insideParFor, walkCtx);
      walkCallSiteBlock(s.body, new Map(locals), insideParFor, walkCtx);
      return;
    case "for": {
      walkCallSiteExpr(s.iterand, locals, insideParFor, walkCtx);
      const inner = new Map(locals);
      inner.set(s.variable, { kind: "for", line: s.range.start.line });
      walkCallSiteBlock(s.body, inner, insideParFor, walkCtx);
      return;
    }
    case "fn": { ... walkCallSiteBlock(s.body, fnLocals, false, walkCtx); ... }
    case "return": ...
    case "query": ...
    case "tool-call": ...
    case "invoke": ...
    case "expr": ...
    default:
      // schema / enum / import / export / break / continue / doc-comment carry
      // no call sites
      return;
  }
}
```

`src/parser/par-for-body-checks.ts:75-184` — `scanParForStmt` switches over `s.kind`:

```ts
function scanParForStmt(
  sink: ParForScanContext,
  s: Stmt,
  outerMutables: ReadonlySet<string>,
  bodyLocals: Set<string>,
  loopDepth: number,
): void {
  switch (s.kind) {
    case "let":
      if (s.init !== null) {
        scanParForExpr(sink, s.init, outerMutables, bodyLocals, loopDepth);
      }
      if (s.name !== "_") {
        bodyLocals.add(s.name);
      }
      return;
    case "reassign":
      if (outerMutables.has(s.target) && !bodyLocals.has(s.target)) { ... }
      scanParForExpr(sink, s.value, outerMutables, bodyLocals, loopDepth);
      return;
    case "break":
    case "continue":
      if (loopDepth === 0) { ... }
      return;
    case "if":
      scanParForExpr(sink, s.condition, outerMutables, bodyLocals, loopDepth);
      scanParForBlock(sink, s.then, outerMutables, new Set(bodyLocals), loopDepth);
      if (s.otherwise !== null) { ... }
      return;
    case "while":
      scanParForExpr(sink, s.condition, outerMutables, bodyLocals, loopDepth);
      scanParForBlock(sink, s.body, outerMutables, new Set(bodyLocals), loopDepth + 1);
      return;
    case "for":
      scanParForExpr(sink, s.iterand, outerMutables, bodyLocals, loopDepth);
      scanParForBlock(sink, s.body, outerMutables, new Set(bodyLocals), loopDepth + 1);
      return;
    case "query":
      pushParQueryInBodyDiagnostic(sink, s.range);
      return;
    case "tool-call": ...
    case "invoke": ...
    case "expr": ...
    case "return": ...
    default:
      // fn / schema / enum / import / export / doc-comment carry no
      // enclosing-conversation body restriction to check.
      return;
  }
}
```

`src/parser/lexical-call-sites.ts:493-599` — `walkCallSiteExpr` switches over `e.kind`:

```ts
function walkCallSiteExpr(
  e: Expr,
  locals: Map<string, LocalBinder>,
  insideParFor: boolean,
  walkCtx: CallSiteWalkContext,
): void {
  switch (e.kind) {
    case "call": { ... checkCallSiteCall(...); for (const arg of [...e.args, ...callWithClauseValues(e)]) { walkCallSiteExpr(arg, ...); } ... }
    case "binary": ... walkCallSiteExpr(e.left, ...); walkCallSiteExpr(e.right, ...); ...
    case "ternary": ... condition / consequent / alternate ...
    case "try": ... operand ...
    case "invoke": ... for (const arg of [...e.args, ...callWithClauseValues(e)]) { walkCallSiteExpr(arg, ...); } ...
    case "member": ... target ...
    case "index": ... target / index ...
    case "method-call": ... target; for (const arg of e.args) { walkCallSiteExpr(arg, ...); } ...
    case "object": ... for (const field of e.fields) { walkCallSiteExpr(field.value, ...); } ...
    case "array": ... for (const el of e.elements) { walkCallSiteExpr(el, ...); } ...
    case "result-ctor": ... arg ...
    case "match": ... scrutinee; for (const arm of e.arms) { ... walkCallSiteExpr(arm.body, ...); } ...
    case "par-for": { ... iterand / max; walkCallSiteBlock(e.body, inner, true, walkCtx); }
    case "block":
      walkCallSiteBlock(e.body, new Map(locals), insideParFor, walkCtx);
      return;
    default:
      // number / string / bool / null / ident / query — no call sites
      return;
  }
}
```

`src/parser/par-for-body-checks.ts:186-269` — `scanParForExpr` switches over `e.kind`:

```ts
function scanParForExpr(
  sink: ParForScanContext,
  e: Expr,
  outerMutables: ReadonlySet<string>,
  bodyLocals: Set<string>,
  loopDepth: number,
): void {
  switch (e.kind) {
    case "block": ... scanParForBlock(sink, e.body, ... new Set(bodyLocals), loopDepth); ...
    case "query": pushParQueryInBodyDiagnostic(sink, e.range); return;
    case "par-for": ... iterand / max ...
    case "try": ... operand ...
    case "binary": ... left / right ...
    case "ternary": ... condition / consequent / alternate ...
    case "call":
    case "invoke":
      for (const arg of [...e.args, ...callWithClauseValues(e)]) { scanParForExpr(sink, arg, ...); }
      return;
    case "member": ... target ...
    case "index": ... target / index ...
    case "method-call": ... target; for (const arg of e.args) { scanParForExpr(sink, arg, ...); } ...
    case "object": ... for (const field of e.fields) { scanParForExpr(sink, field.value, ...); } ...
    case "array": ... for (const el of e.elements) { scanParForExpr(sink, el, ...); } ...
    case "result-ctor": ... arg ...
    case "match": ... scrutinee; for (const arm of e.arms) { scanParForExpr(sink, arm.body, ...); } ...
    default:
      // ident / number / string / bool / null — no query / nested par-for.
      return;
  }
}
```

Diff verdict: not a text clone (different function signatures, context, and per-case actions), but the traversal shape is identical for the shared node kinds.

## Why this is a problem
Two semantic passes over the same AST must agree on the tree structure. When `theta-ast.ts` adds an `Expr` or `Stmt` kind, or when an existing kind gains a new child field, both walkers must be updated or one pass will silently stop reaching nested code:

- `Expr` walkers: both explicitly handle the same 14 of the 20 `Expr` kinds (`array`, `binary`, `ternary`, `try`, `call`, `invoke`, `member`, `index`, `method-call`, `object`, `result-ctor`, `match`, `par-for`, `block`). `scanParForExpr` additionally handles `query` (because a query expression is itself an error inside a `par for` body), while `walkCallSiteExpr` leaves `query` in the default arm (query interpolations are not AST children). The remaining 5 leaf kinds (`ident`, `number`, `string`, `bool`, `null`) fall to default in both.
- `Stmt` walkers: both explicitly handle 10 common `Stmt` kinds (`let`, `reassign`, `if`, `while`, `for`, `query`, `tool-call`, `invoke`, `expr`, `return`) and default the same 5 declaration-only kinds (`schema`, `enum`, `import`, `export`, `doc-comment`). `scanParForStmt` uniquely handles `break` / `continue` (CTRL-4 restriction), while `walkCallSiteStmt` uniquely handles `fn` (parameter scoping). Divergence in the 10 common cases would let a check miss a nested construct; divergence in scope handling (`new Map(locals)` / `new Set(bodyLocals)` copy points) would let a name escape or be hidden.

No shared utility enforces this agreement today.

## Suggested direction (non-binding, optional)
A shared source of truth (hypothesis) would be a generic `Expr`/`Stmt` traversal helper in `src/parser/` that each semantic pass parameterises with its per-kind action. The natural home is near the AST definitions in `src/parser/theta-ast.ts` or an existing walker module such as `src/parser/ident-resolution.ts`, which `lexical-call-sites.ts` already cites as the precedent for block-scoping.

## False-positive check
- Re-read the cited ranges immediately before filing; both functions are live at HEAD.
- `walkCallSiteExpr` is reachable only from `checkLexicalCallSites` (same file); `scanParForExpr` is reachable only from `emitParForBodyDiagnostics` (same file). Both entry points are called from `theta-document.ts` during parse.
- No test files are cited (D7 territory).
- No dead copies are present (all cited sites are called).
- No generated code or spec-normative vector tables are involved.
- Searched the already-filed list for `lexical-call`, `par-for-body`, `walkCallSiteExpr`, and `scanParForExpr`; no matching prior D4 parallel filing found.

## Triage
verdict: questionable — accounting verified: all four excerpts reproduce byte-for-byte at the cited ranges (lexical-call-sites.ts:407-491/493-599, par-for-body-checks.ts:75-184/186-269); theta-ast.ts:339-359 declares exactly 20 Expr kinds and :829-847 exactly 18 Stmt kinds, and the per-arm census holds (walkCallSiteExpr 14 explicit + 6 default, scanParForExpr the same 14 + `query`; both Stmt walkers share 10 arms, default the same 5 declaration kinds, and split on `fn` vs `break`/`continue`); both walks are live (checkLexicalCallSites ← theta-document.ts:382; emitParForBodyDiagnostics ← body-parser.ts:3780, not theta-document.ts as the FP check states — immaterial) and no quality/issues/ row cites either file; but two things the human must weigh: (1) the claim that the shared arms agree on how to reach children is not fully accurate — the `par-for` arm deliberately diverges (walkCallSiteExpr descends the nested body with insideParFor=true at :573-586; scanParForExpr scans only iterand/max and skips the body by documented design at :204-211), so a shared traversal would need a per-pass descent opt-out, i.e. the non-mechanical fold; (2) that exact fold (a generic Expr/Stmt traversal parameterised per pass) is what the human declined twice for sibling different-purpose walk pairs — PTQ-1142 (binder-walk vs type-layer-walk) and qw20260922211400-d4-01 structural/ident walkers (human-keep-whole 2026-09-23) — so the shared source of truth is a design decision for a human ruling, with the keep-whole precedent squarely applicable (triage: claude-fable-5-1)
verdict: questionable — accounting verified: all four excerpts match at the cited ranges; theta-ast.ts declares 20 Expr and 18 Stmt kinds, and the census holds (both Expr walkers explicitly handle the same 14 kinds, scanParForExpr also handles `query`, 5 leaf kinds default in both; both Stmt walkers share 10 arms and default schema/enum/import/export/doc-comment, and they split on `fn` vs `break`/`continue`); both passes are live (checkLexicalCallSites ← theta-document.ts:382; emitParForBodyDiagnostics ← body-parser.ts:3760, not theta-document.ts as the filing says); nothing in quality/issues or resolved tracks this pair (PTQ-1442 is the par-query diagnostic text, a different cause). The claim that the arms agree on how to reach children overstates things: the `par-for` Expr arm and the `query` Stmt arm deliberately diverge in descent. So a shared traversal needs per-pass opt-outs, and the PTQ-1142 keep-whole precedent applies. The shared source of truth is a design decision for a human ruling (triage: claude-opus-5-5)
verdict: questionable — accounting verified: the arms at lexical-call-sites.ts:407-599 and par-for-body-checks.ts:75-269 reproduce the census against theta-ast.ts's 20 Expr and 18 Stmt kinds. Both Expr walkers handle the same 14 kinds explicitly, scanParForExpr also handles `query`, and the 5 leaf kinds default in both. The two Stmt walkers share 10 arms, default the same 5 declaration kinds, and split on `fn` vs `break`/`continue`. Both passes are live: checkLexicalCallSites is called from theta-document.ts:382, and emitParForBodyDiagnostics from body-parser.ts:3760, not theta-document.ts as the filing says. No issue tracks this pair: PTQ-0288 covered the src/extension call-collector clones and PTQ-1442 the par-query diagnostic. The `par-for` Expr arm diverges on purpose: scanParForExpr skips the nested body (par-for-body-checks.ts:206-212), but walkCallSiteExpr descends into it. So a shared traversal needs per-pass opt-outs, the PTQ-1142 keep-whole precedent applies, and the shared source of truth is a design decision for a human ruling (triage: claude-opus-5-5)
