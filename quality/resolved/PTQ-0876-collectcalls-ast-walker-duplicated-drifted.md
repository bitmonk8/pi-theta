---
id: PTQ-0876
title: collectCalls's recursive call-site AST walk is redeclared with drifted output shape and node-kind coverage in fn-call-arity-unchecked.test.ts and two sibling files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/fn-call-arity-unchecked.test.ts:241-362
  - tests/fn-arg-type-mismatch-wired.test.ts:477-600
  - tests/imported-thetalib-fn-call-args-checked.test.ts:414-483
  - tests/helpers/e2e-s1.ts:284-300
sites: 3
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# collectCalls's recursive call-site AST walk is redeclared with drifted output shape and node-kind coverage in fn-call-arity-unchecked.test.ts and two sibling files

## Observation
`tests/fn-call-arity-unchecked.test.ts` declares a module-private `collectCalls(doc)` that recursively descends every `Expr`/`Stmt`/`Block` node of a parsed `ThetaDocument` through a hand-written `walkExpr`/`walkStmt`/`walkBlock` switch trio, collecting every `call`-shaped node. `tests/fn-arg-type-mismatch-wired.test.ts` and `tests/imported-thetalib-fn-call-args-checked.test.ts` each declare a function of the identical name performing the identical walk shape, but the three copies have already drifted on two independent axes: the `CallSite` record each pushes (`{callee, argCount, range}` vs `{callee, args: SourceRange[]}` vs `{callee, argCount}`), and the `walkStmt` switch's statement-kind coverage (the arity file's `walkStmt` reaches `reassign`, `tool-call`, `return`, `for`, `while` and an `if`'s `else`/`else-if` chain; `fn-arg-type-mismatch-wired.test.ts`'s `walkStmt` reaches the same set except it never walks an `if`'s `else` arm at all; `imported-thetalib-fn-call-args-checked.test.ts`'s `walkStmt` reaches only `let`, `expr`, `fn` and `invoke`). The third file's `walkExpr` has independently narrowed too: it omits the `index`, `match`, `result-ctor` and `par-for` cases the other two both still carry.

## Evidence
tests/fn-call-arity-unchecked.test.ts:257-266 (the `walkExpr` switch's `call`/`invoke` arms, `CallSite` carrying `argCount` and `range`):
```ts
function collectCalls(doc: ThetaDocument): CallSite[] {
  const out: CallSite[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push({ callee: e.callee, argCount: e.args.length, range: e.range });
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        for (const a of e.args) walkExpr(a);
        return;
```

tests/fn-call-arity-unchecked.test.ts:342-357 (this file's `if`-arm walks the `else`/`else-if` chain — the other two files' `if`-arm below does not):
```ts
      case "if":
        walkExpr(s.condition);
        walkBlock(s.then);
        if (s.otherwise !== null) {
          // The `else` arm is either a chained `IfStmt` or an `else` block; a
          // block is the shape carrying `statements`.
          if ("statements" in s.otherwise) walkBlock(s.otherwise);
          else walkStmt(s.otherwise);
        }
        return;
      default:
        return;
```

tests/fn-arg-type-mismatch-wired.test.ts:492-501 and :584-587 (the same switch shape, `CallSite` carrying `args: SourceRange[]` instead of `argCount`/`range`, `invoke` pushed as its own call site under a reserved label rather than skipped, and the `if`-arm walking only `s.then`, never `s.otherwise`):
```ts
function collectCalls(doc: ThetaDocument): CallSite[] {
  const out: CallSite[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push({ callee: e.callee, args: e.args.map((a) => a.range) });
        for (const a of e.args) walkExpr(a);
        return;
      case "invoke":
        out.push({ callee: "invoke", args: e.args.map((a) => a.range) });
```
```ts
      case "if":
        walkExpr(s.condition);
        walkBlock(s.then);
        return;
      default:
        return;
```

tests/imported-thetalib-fn-call-args-checked.test.ts:414-429 (the same switch shape a third time, `CallSite` reduced to `{callee, argCount}`, and the `walkExpr` switch below missing the `index`/`match`/`result-ctor`/`par-for` cases the other two copies both carry):
```ts
interface CallSite {
  readonly callee: string;
  readonly argCount: number;
}

function collectCalls(doc: ThetaDocument): CallSite[] {
  const out: CallSite[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "call":
        out.push({ callee: e.callee, argCount: e.args.length });
        for (const a of e.args) walkExpr(a);
        return;
      case "try":
        walkExpr(e.operand);
        return;
```

tests/helpers/e2e-s1.ts:284-291 (the module these three files already import `parseDoc` from already contains a generic consumer, `argRange`, that accepts an injected `collectCalls` callback rather than owning a walk of its own — showing the per-file walk was expected to vary in output shape, but not that its dozen boilerplate node-kind cases needed re-typing by hand each time):
```ts
export function argRange(
  doc: ThetaDocument,
  callee: string,
  index: number,
  collectCalls: (doc: ThetaDocument) => readonly { readonly callee: string; readonly args: readonly SourceRange[] }[],
  render: (doc: ThetaDocument) => string,
): SourceRange {
  const calls = collectCalls(doc).filter((c) => c.callee === callee);
```

Search performed: `grep -rn "^function collectCalls" tests/*.test.ts` — exactly 3 hits, the three files cited above; `tests/helpers/e2e-s1.ts` and `tests/helpers/load-row-harness.ts` (the two helper modules these three files already import from) export no `collectCalls` of their own.

## Why this is a problem
All three copies solve the identical problem — recursively descend a parsed `ThetaDocument`'s body to find every `call`-shaped node — using the identical outer switch-over-`Expr`-kind / switch-over-`Stmt`-kind structure, and all three have already drifted on both output shape and node-kind coverage while doing so: `fn-arg-type-mismatch-wired.test.ts`'s copy silently cannot find a call inside an `else` block (its `if`-arm never calls `walkStmt`/`walkBlock` on `s.otherwise`), and `imported-thetalib-fn-call-args-checked.test.ts`'s copy silently cannot find a call inside an `index`, `match`, `result-ctor` or `par-for` expression — each a case the other two copies do carry. Because there is no single point of truth, a fixture placed in one of these positions will silently fail to be found by whichever copy has not yet grown that case, rather than surfacing the gap as a shared, once-fixed omission.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already hosts the generic `argRange` consumer that accepts an injected walker, so a canonical `collectCalls` (parameterised over which extra fields a caller needs, e.g. `argCount` vs `args`) exported alongside it is the kind of home this duplicated walk would sit in, as observation rather than design.

## False-positive check
Gate-pin check: none of the three files matches `*gate*.test.ts` or the named gate-kin patterns; `collectCalls` is a pure AST-traversal utility, not a pinned count or inventory. Recording-double check: not applicable — the function records no calls to itself and backs no "never called" witness; it is a structural reader over an already-parsed document. docs/bugs/ signature search: `grep -rl "collectCalls" docs/bugs/*.md` returned no hits; no open bug pins any of the three copies' exact bytes as a witnessed correct-reason red. coverage-matrix/bug-doc citation search: `grep -n "fn-call-arity-unchecked\|fn-arg-type-mismatch-wired\|imported-thetalib-fn-call-args-checked" docs/reference/coverage-matrix.md` returned no hits naming any of the three files by this helper's name; this finding proposes no merge, rename or deletion of any `it()`/`describe()`, only that the shared walk could be exported once. The drift described above (a missed `else`-block call, a missed `index`/`match`/`result-ctor`/`par-for` call) is reported here strictly as the mechanical symptom of the duplication, not as a claim that any committed fixture in either sibling file is currently mis-measured by it — that would be a behaviour/bug claim outside this lens, and none is made. Checked quality/intake and quality/issues for any filing naming `collectCalls` — none found, so this is not a re-file of an existing candidate.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: all five excerpts reproduce at the cited lines (arity :257-266/:342-357, wired :492-501/:584-587, imported :414-429, e2e-s1 :284-291); `grep -rln "^function collectCalls" tests/` → exactly these 3 files, no export from tests/helpers; the drift is exactly as stated (arity/wired walkExpr carry index/match/result-ctor/par-for, imported's omits all four; arity's if-arm walks `s.otherwise`, wired's does not, imported's walkStmt has only let/expr/fn/invoke; CallSite shapes `{callee,argCount,range}` vs `{callee,args}` vs `{callee,argCount}`); all three copies are live (5/3/3 call sites) and were authored in three separate commits (3efdb4ac bug-0050, 0759f529 bug-0131, 54dd6c1e bug-0138) so this is repeated per-file restatement, not one evolving helper; stated searches reproduce (docs/bugs `collectCalls` → 0, coverage-matrix file-name grep → 0), none of the three is a gate file, no recording-double or red-test carve-out applies, no it()/describe() merge/rename/delete proposed; D7 boilerplate-duplication class over tests/ only — and the case is stronger than filed: all three files already import from tests/helpers/e2e-s1.ts, which exports a generic `collectByKind(root, kind)` node collector (:256-282) that would reach every position without a hand-typed switch; not a duplicate: resolved PTQ-0288 is D4 over the four src/ production walkers, and resolved PTQ-0426 (argRange/letRange) explicitly left collectCalls unfiled per REVIEW_LOG:164 (triage: claude-fable-5-1)
