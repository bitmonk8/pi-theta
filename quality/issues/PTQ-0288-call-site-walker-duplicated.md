---
id: PTQ-0288
title: The call-site AST walker (walkBlock/walkStmt/walkExpr) is copy-pasted across four modules instead of sharing one traversal
lens: D4
status: open
verdict: confirmed
locations:
  - src/extension/extension-tool-reachability.ts:67-196
  - src/extension/invoke-static-checks.ts:191-353
  - src/extension/subagent-fn-static-checks.ts:60-184
  - src/parser/theta-document.ts:1725-1820
sites: 4
fix_scope: cross-module
d4_class: clone
wave: qw20260913131304
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-13
---

# The call-site AST walker (walkBlock/walkStmt/walkExpr) is copy-pasted across four modules instead of sharing one traversal

## Observation
`extension-tool-reachability.ts` (`collectCodeSideCallNames`), `invoke-static-checks.ts` (`collectCallSites`), and `subagent-fn-static-checks.ts` (`collectCallCallees`) each define a private `walkBlock`/`walkStmt`/`walkExpr` triplet that recurses over a theta body's `Stmt`/`Expr` tree to find call-shaped nodes; the three differ only in what the leaf case accumulates (a `Set<string>` of names, a `CollectedCallSites` record of four node arrays, or a `string[]` of names). `theta-document.ts`'s `collectClauseBearingCalls`/`collectClauseBearingCallsInBlock`/`collectClauseBearingCallsInStmt`/`collectClauseBearingCallsInExpr` is a fourth copy of the same recursive shape, collecting `CallExpr`s that carry a `with` clause. The clone map marks the three `src/extension/` `walkStmt` bodies byte-identical (G002) and marks large spans of `walkExpr` (G007, G008, G019) and of `walkStmt`'s tail arms extending into `theta-document.ts` (G066, G068, G096) renamed-only or identical.

## Evidence
G002 (246 tokens, identical) — `walkStmt`'s opening arms, the same in all three `src/extension/` files (only the `out` parameter's type differs):

`extension-tool-reachability.ts:82-96`:
```ts
function walkStmt(stmt: Stmt, out: Set<string>): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) walkExpr(stmt.init, out);
      return;
    case "reassign":
      walkExpr(stmt.value, out);
      return;
    case "if":
      walkExpr(stmt.condition, out);
      walkBlock(stmt.then, out);
      if (stmt.otherwise !== null) {
        if ("kind" in stmt.otherwise) walkStmt(stmt.otherwise, out);
        else walkBlock(stmt.otherwise, out);
      }
      return;
```

`invoke-static-checks.ts:211-225` — identical body, `out: CollectedCallSites`:
```ts
function walkStmt(stmt: Stmt, out: CollectedCallSites): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) walkExpr(stmt.init, out);
      return;
    case "reassign":
      walkExpr(stmt.value, out);
      return;
    case "if":
      walkExpr(stmt.condition, out);
      walkBlock(stmt.then, out);
      if (stmt.otherwise !== null) {
        if ("kind" in stmt.otherwise) walkStmt(stmt.otherwise, out);
        else walkBlock(stmt.otherwise, out);
      }
      return;
```

`subagent-fn-static-checks.ts:75-89` — identical body, `out: string[]`:
```ts
function walkStmt(stmt: Stmt, out: string[]): void {
  switch (stmt.kind) {
    case "let":
      if (stmt.init !== null) walkExpr(stmt.init, out);
      return;
    case "reassign":
      walkExpr(stmt.value, out);
      return;
    case "if":
      walkExpr(stmt.condition, out);
      walkBlock(stmt.then, out);
      if (stmt.otherwise !== null) {
        if ("kind" in stmt.otherwise) walkStmt(stmt.otherwise, out);
        else walkBlock(stmt.otherwise, out);
      }
      return;
```

G008 (156 tokens, identical) — `walkExpr`'s `object`/`match`/`result-ctor`/`method-call` arms, same in all three. `subagent-fn-static-checks.ts:157-169`:
```ts
      for (const field of expr.fields) walkExpr(field.value, out);
      return;
    case "match":
      walkExpr(expr.scrutinee, out);
      for (const arm of expr.arms) walkExpr(arm.body, out);
      return;
    case "result-ctor":
      walkExpr(expr.arg, out);
      return;
    case "method-call":
      walkExpr(expr.target, out);
      for (const arg of expr.args) walkExpr(arg, out);
      return;
```
Byte-identical (token-for-token) to `extension-tool-reachability.ts:164-176` and to `invoke-static-checks.ts:301-316` — the latter's own `object` arm additionally pushes into `objectExprs` at line 300 (one line before this matched span) and its `method-call` arm carries a 3-line comment the other two lack, neither of which changes the matched tokens. G007 (163 tokens, renamed-only(2)) is the same `extension-tool-reachability.ts`/`invoke-static-checks.ts` pair extended a few lines further, into each file's *next* declaration (`extension-tool-reachability.ts:192-196`, `invoke-static-checks.ts:349-353`: a blank line, a `/** doc */`, and an `export interface X {` opening) — generic declaration boilerplate, not part of the walker itself, and not present in `subagent-fn-static-checks.ts` at the matching offset (whose next declaration is a different shape). G019 (104 tokens, renamed-only(1)) is the `array`/`binary`/`ternary`/`try` arms immediately above this block, matched the same way across all three files (`extension-tool-reachability.ts:135-153`, `invoke-static-checks.ts:264-281`, `subagent-fn-static-checks.ts:128-146`).

G096 (61 tokens, renamed-only(5)) and G068 (68 tokens, renamed-only(7)) — the fourth copy. `theta-document.ts:1761-1774`, renaming `walkExpr`/`walkBlock` to `collectClauseBearingCallsInExpr`/`collectClauseBearingCallsInBlock` but otherwise the same recursive shape as the arms above:
```ts
    case "while":
      collectClauseBearingCallsInExpr(stmt.condition, out);
      collectClauseBearingCallsInBlock(stmt.body, out);
      return;
    case "for":
      collectClauseBearingCallsInExpr(stmt.iterand, out);
      collectClauseBearingCallsInBlock(stmt.body, out);
      return;
    case "fn":
      collectClauseBearingCallsInBlock(stmt.body, out);
      for (const field of stmt.withClause ?? []) {
        collectClauseBearingCallsInExpr(field.value, out);
      }
      return;
```
and `theta-document.ts:1783-1795`:
```ts
    case "tool-call":
      collectClauseBearingCallsInExpr(stmt.call, out);
      return;
    case "invoke":
      collectClauseBearingCallsInExpr(stmt.invoke, out);
      return;
    case "expr":
      collectClauseBearingCallsInExpr(stmt.expr, out);
      return;
    default:
      // comment (2 lines)
      return;
```
This fourth copy has already diverged from the other three, in the material sandwiched between the two quotes above: its `fn` arm adds the `withClause` sub-walk quoted above (the other three's `fn` arm is only `walkBlock(stmt.body, out); return;`), its `if` arm (`theta-document.ts:1753-1758`) tests `"statements" in stmt.otherwise` — the logical inverse of the other three's `"kind" in stmt.otherwise`, with the two branches swapped to match — and it adds an explicit `case "query":` arm (`theta-document.ts:1780-1782`) that the other three fold silently into `default`.

## Why this is a problem
All four copies answer the same question — does this AST node reach a nested call-shaped child? — over the same `Stmt` (18 members, `theta-document.ts:967-986`) and `Expr` (20 members, `theta-document.ts:461-481`) unions, and all four are wired into production: `checkExtensionToolReachability` (`extension-tool-reachability.ts:219`) is called from `production-composition.ts:1129` (PIC-64 rung 3); `checkInvokeStaticResolution` (`invoke-static-checks.ts:1065`) from `production-composition.ts:1146` (INV-1/INV-3/INV-4); `checkSubagentFnStaticResolution` (`subagent-fn-static-checks.ts:249`) from `production-composition.ts:1174`/`:3872` and `import-static-checks.ts:1978` (FN-6); `collectClauseBearingCalls` (`theta-document.ts:1725`) from `theta-document.ts:1698` (RFC 0009 clause placement). `invoke-static-checks.ts`'s own comments state the risk and scope its guarantee to their own file only: the `par-for` arm argues "one walker cannot drift against itself … a second, independently written walker would drift out of sync as the `Expr` / `Stmt` node shapes evolve (bug 0071)", and `walkExpr`'s `default` arm warns "one added without an arm lands here and its sub-tree goes uncollected, which is a silent hole in every check downstream of the walk." Both guarantees hold only within the switch they annotate; nothing ties the four separate switches together, and `theta-document.ts`'s copy has already measurably diverged (the extra `query` arm, the extra `fn`-clause sub-walk, the inverted `otherwise` test) — evidence that a fourth paste of this shape evolves on its own schedule rather than in lockstep with the first three. If `Expr` or `Stmt` gains a new call-bearing member, updating only the copy under edit leaves the other three silently blind to that member for their own checks (extension-tool reachability, invoke arity/cycle resolution, subagent-fn cycle detection, with-clause placement), with no compiler error or shared test tying the four `default` arms together.

## Suggested direction (non-binding, optional)
`theta-document.ts` already has a private, kind-agnostic child-expression accessor, `expressionChildExprs(e: Expr): readonly Expr[]` (`theta-document.ts:10398-10426`), that two of its own internal walks (`firstForbiddenInterpolationForm`, and `collectClauseBearingCallsInExpr`'s own `default` arm) already share instead of each hand-rolling a switch — a natural shared home (hypothesis) for the one traversal the other three copies could parameterise with their own per-node action, rather than a fourth and fifth hand-written switch over the same two unions.

## False-positive check
Every cited group re-verified at its mapped lines (quoted above, `sed -n` / `Read` against current source). All four containing functions confirmed live: `checkExtensionToolReachability`, `checkInvokeStaticResolution`, `checkSubagentFnStaticResolution`, and `collectClauseBearingCalls` each have a production call site (cited above via `grep`) — none is a dead copy (D2's territory, not routed here). All four locations are production `src/` files; none under `tests/`. None is generated. None is a spec-repeated reference-vector table — this is an AST-traversal helper with no spec clause mandating four independent copies, so the normative-vector carve-out does not apply. Searched `^function walk(Block|Stmt|Expr)\(` in `src/extension` and `collectClauseBearingCallsIn` in `src/parser`: exactly the four families cited here exist among this shard's files and their cited partners, no fifth copy found.

## Triage
<!-- appended by triage -->
verdict: confirmed — every excerpt and location verified verbatim (extension-tool-reachability.ts:82-96/126-176, invoke-static-checks.ts:211-225/301-353, subagent-fn-static-checks.ts:75-89/157-184, theta-document.ts:1761-1795), independently reproduced by `node tools/quality/clone-scan.mjs map` which emits the exact groups/token-counts/verdicts cited (G002 246 identical, G007 163 renamed-only(2), G008 156 identical, G019 104 renamed-only(1), G066/G068/G096 renamed-only extending into theta-document.ts), all four containing checks confirmed live via grep (production-composition.ts:1129/1146/1174/3872, import-static-checks.ts:1978, theta-document.ts:1698/1420), and the Stmt(18)/Expr(20) union counts and the fourth copy's cited divergences (query arm, fn withClause sub-walk, inverted otherwise test) all confirmed at source — no conflict with the unrelated tracked walker-duplication issues (PTQ-0287, PTQ-0265) (triage: claude-opus-5)
