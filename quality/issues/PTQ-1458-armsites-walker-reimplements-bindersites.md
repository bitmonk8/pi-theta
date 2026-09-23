---
id: PTQ-1458
title: match-arm-scope-inference-pass.test.ts's local armSites AST walker re-derives the canonical binderSites traversal skeleton instead of extending it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/match-arm-scope-inference-pass.test.ts:290-416
  - tests/helpers/e2e-s1.ts:1110-1238
sites: 1
fix_scope: localized
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# match-arm-scope-inference-pass.test.ts's local armSites AST walker re-derives the canonical binderSites traversal skeleton instead of extending it

## Observation
tests/match-arm-scope-inference-pass.test.ts declares a module-scope function
`armSites(doc)` (lines 290-416) that walks the whole parsed `Block`/`Stmt`/`Expr`
tree to collect binder/site anchors, used as the file's loud PRECONDITION in
`expectRow` (line ~445). tests/helpers/e2e-s1.ts already exports a
byte-for-byte-identical traversal skeleton, `binderSites(doc, subject, opts)`
(lines 1110-1238), for the same purpose (a precondition anchor list) in three
sibling files (`let-arm-withhold-binding-scoped.test.ts`,
`loop-element-withhold-binding-scoped.test.ts` — in this review's own scope —
and `plain-for-loop-variable-element-type.test.ts`). The reviewed file imports
neither `binderSites` nor any part of it; every `walkExpr`/`walkStmt`/`walkBlock`
case for `call`, `invoke`, `method-call`, `member`, `index`, `binary`,
`ternary`, `array`, `object`, `try`, `result-ctor`, `let`, `for`, `while`,
`tool-call`, `expr`, `reassign`, `return` is reproduced verbatim in both
functions, differing only in the two additions this file needs (`match`/`arm`
site emission, an `if@<range>` site, and an `fn <name>(<params>)` site) —
none of which `binderSites` cannot accept as an option in the way it already
accepts `includeCallArguments`.

## Evidence
tests/match-arm-scope-inference-pass.test.ts:290-301 (re-read immediately before filing):
```ts
function armSites(doc: ThetaDocument): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "match":
        out.push(`match@${at(e.range)}`);
        walkExpr(e.scrutinee);
        for (const arm of e.arms) {
          out.push(`arm ${binders(arm.pattern)}@${at(arm.body.range)}`);
          walkExpr(arm.body);
        }
        return;
      case "call":
```

tests/match-arm-scope-inference-pass.test.ts:330-401 (the remaining cases,
identical to `binderSites`'s own, re-read immediately before filing):
```ts
        walkExpr(e.right);
        return;
      case "ternary":
        walkExpr(e.condition);
        walkExpr(e.consequent);
        walkExpr(e.alternate);
        return;
      case "array":
        for (const el of e.elements) walkExpr(el);
        return;
      case "object":
        for (const f of e.fields) walkExpr(f.value);
        return;
      case "try":
        walkExpr(e.operand);
        return;
      case "result-ctor":
        walkExpr(e.arg);
        return;
      default:
        return;
    }
  };
  const walkBlock = (b: Block): void => {
    for (const s of b.statements) walkStmt(s);
    if (b.tail !== null) walkExpr(b.tail);
  };
  const walkStmt = (s: Stmt): void => {
    switch (s.kind) {
      case "let":
        out.push(`let ${s.name}@${at(s.range)}`);
        if (s.init !== null) walkExpr(s.init);
        return;
      case "for":
        out.push(`for ${s.variable}@${at(s.iterand.range)}`);
        walkExpr(s.iterand);
        walkBlock(s.body);
        return;
```

tests/helpers/e2e-s1.ts:1110-1160 (the canonical `binderSites`, re-read
immediately before filing):
```ts
export function binderSites(
  doc: ThetaDocument,
  subject: string,
  { includeCallArguments = false }: { readonly includeCallArguments?: boolean } = {},
): string[] {
  const out: string[] = [];
  const walkExpr = (e: Expr): void => {
    switch (e.kind) {
      case "par-for":
        out.push(`par-for ${e.variable}@${at(e.iterand.range)}`);
        walkExpr(e.iterand);
        if (e.max !== null) walkExpr(e.max);
        walkBlock(e.body);
        return;
      case "match":
        walkExpr(e.scrutinee);
        for (const arm of e.arms) walkExpr(arm.body);
        return;
      case "call":
        if (includeCallArguments) {
          e.args.forEach((a: Expr, i: number) => {
            out.push(`arg ${e.callee}#${i}@${at(a.range)}`);
          });
        }
        for (const a of e.args) walkExpr(a);
        return;
```

Every case body listed in the two excerpts above (`call`/`invoke`/`method-call`
/`member`/`index`/`binary`/`ternary`/`array`/`object`/`try`/`result-ctor` in
`walkExpr`, and `let`/`for`/`while`/`tool-call`/`expr`/`reassign`/`return` in
`walkStmt`) is reproduced with an identical body and an identical case order
between the two functions; `git diff --no-index` on the two extracted
functions (verified in a scratch file) shows only the `match`/`arm`/`if`/`fn`
site-emission lines and the `par-for` case (which `binderSites` handles and
`armSites` omits, because this file has no `par-for` fixtures) differing.

## Why this is a problem
Two independent, hand-maintained ~110-line recursive AST walkers exist for the
same purpose — producing a stable, loud precondition anchor list over a parsed
`ThetaDocument` — one exported from `tests/helpers/e2e-s1.ts` and used by three
files (one of them in this review's own scope, `loop-element-withhold-binding-scoped.test.ts:214`,
which imports and calls `binderSites` rather than re-deriving it), the other
private to `tests/match-arm-scope-inference-pass.test.ts`. A structural change
to the AST (a new expression or statement kind, or a renamed field) that the
canonical helper is updated to walk needs a second, independent edit in this
file to stay in step, with nothing enforcing that the two stay synchronized.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s `binderSites` already takes an options bag
(`includeCallArguments`); the natural home for the `match`/`arm`/`if`/`fn`
site emissions this file needs is as further opt-in behaviour on that same
shared walker, observed already to be the pattern the file's own sibling
(`loop-element-withhold-binding-scoped.test.ts`) follows for its own needs.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
kinds — not applicable. Recording-double check: `armSites`/`binderSites` are
traversal helpers producing a comparison list, not a call-recording double —
not applicable. docs/bugs/ signature search: neither function nor its usage is
cited by a documented correct-reason red; the file's own bug-0145 justification
concerns match-arm scoping semantics, not this helper's shape. Coverage-matrix
/ bug-doc citation search: `grep -rn "armSites" docs/` and
`grep -rn "match-arm-scope-inference-pass" docs/reference/coverage-matrix.md`
both returned no hits, so no citation pins this helper's name or shape. This
finding does not propose merging, renaming or deleting any test — only that
the two functions' shared skeleton has a natural common home. This is not a
coverage claim: the finding is about the duplicate implementation of a
harness/precondition-building function that already exists, verified present
in both files at the cited lines.

## Triage
verdict: confirmed — independently re-verified: excerpts match at the cited lines (armSites :290-416, binderSites e2e-s1.ts:1110-1238); a mktemp sed-range diff of the two functions (127 vs 129 lines) shows the walkExpr/walkBlock/walkStmt skeleton byte-identical except the signature, four added `out.push` site lines (`match@`, `arm <binders>@`, `fn <name>(<params>)`, `if@`), the `call`/`tool-call`/`invoke` arms unconditionally doing what binderSites does under `includeCallArguments: true`, the throw wording, and a reordered (NOT omitted — filing's par-for claim is wrong, both copies carry it) `par-for` arm; both copies are live (armSites :442 `toEqual([...row.sites])`, binderSites in 3 sibling files incl. loop-element:214 and let-arm:244 which already use the options bag), the file imports parseDoc from e2e-s1 but not binderSites; stated searches re-run (0 hits for armSites in docs/, 0 coverage-matrix hits for the file, bug 0145 states no per-file-walker rationale); not gate-kin, not a recording double, no merge/rename/delete proposed; not a duplicate — PTQ-0633 (fixed) covered plain-for/loop-element copies, PTQ-1023 (fixed) covered let-arm's copy and was confirmed with the same parameterise-the-shared-walker shape, PTQ-1376 (open) covers the expectRow driver not the walker, and REVIEW_LOG:395 explicitly left this walker unfiled for a later wave. Fixer note: the local `binders(PatternNode)` renderer (:258) is needed by the `arm` site, so the shared walker's new opt-in must either take a pattern renderer or e2e-s1 must host `binders` too (triage: claude-fable-5-1)
