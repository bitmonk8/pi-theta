---
id: PTQ-0670
title: production-cancellation-wiring.test.ts and production-core-exec.test.ts redeclare the same eight AST-node-builder functions verbatim
lens: D7
status: open
verdict: confirmed
locations:
  - tests/production-cancellation-wiring.test.ts:65-88
  - tests/production-core-exec.test.ts:38-85
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# production-cancellation-wiring.test.ts and production-core-exec.test.ts redeclare the same eight AST-node-builder functions verbatim

## Observation
Both `tests/production-cancellation-wiring.test.ts` and
`tests/production-core-exec.test.ts` declare a local, byte-identical set of
eight `theta-document` AST-node builder functions — `span()`, `callExpr()`,
`tryExpr()`, `identExpr()`, `objectExpr()`, `stringExpr()`, `letStmt()`, and
`body()` — used to hand-construct `Expr`/`Stmt`/`ThetaBody` values for
driving the real production dispatch path. `production-core-exec.test.ts`
additionally declares four more builders (`memberExpr`, `indexExpr`,
`numberExpr`, `binaryExpr`) that `production-cancellation-wiring.test.ts`
does not need, but the eight shared functions are typed twice with the same
names, same parameter lists, and same bodies rather than declared once and
imported by both.

## Evidence

`tests/production-cancellation-wiring.test.ts:65-88` (re-read immediately
before filing):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}
function tryExpr(operand: Expr): Expr {
  return { kind: "try", operand, range: span() };
}
function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
function objectExpr(typeName: string | null, fields: readonly ObjectFieldNode[]): Expr {
  return { kind: "object", typeName, fields, range: span() };
}
function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}
function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}
function body(statements: readonly Stmt[], tail: Expr | null): ThetaBody {
  return { statements, tail };
}
```

`tests/production-core-exec.test.ts:38-54` and `:66-85` (re-read immediately
before filing; the same eight bodies, `stringExpr`/`objectExpr`/`letStmt`/
`body` interleaved with the file's four additional builders):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function callExpr(callee: string, args: readonly Expr[] = []): CallExpr {
  return { kind: "call", callee, args, range: span() };
}

function tryExpr(operand: Expr): Expr {
  return { kind: "try", operand, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}
```
```ts
function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}
...
function objectExpr(typeName: string | null, fields: readonly ObjectFieldNode[]): Expr {
  return { kind: "object", typeName, fields, range: span() };
}

function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null): ThetaBody {
  return { statements, tail };
}
```

Exact search: `grep -n "^function span\|^function callExpr\|^function tryExpr\|^function identExpr\|^function objectExpr\|^function stringExpr\|^function letStmt\|^function body" tests/production-cancellation-wiring.test.ts tests/production-core-exec.test.ts` returns exactly these eight declarations in each of the two files, one match per name per file (16 hits total), and diffing each named function's body pairwise between the two files shows zero difference for all eight.

## Why this is a problem
The same eight-function AST-builder set — `span`/`callExpr`/`tryExpr`/
`identExpr`/`objectExpr`/`stringExpr`/`letStmt`/`body` — used to construct
`.theta` bodies against the real `createProductionProducerDeps` /
`executeBody` dispatch is typed out twice in these two files rather than
declared once and imported by both. `tests/helpers/invoke-seam-scaffold.ts`
already exports a `span()` matching this exact one-line shape for exactly
this purpose ("a throwaway 1:1–1:2 `SourceRange`, for a scaffold expr/site
that carries no real source position"), and `tests/helpers/
tool-call-dispatch-harness.ts` already exports its own `span()`/`callExpr()`/
`body()` trio for a sibling AST shape — so this repository's `tests/helpers/`
convention already centralises exactly this kind of node-builder set
elsewhere, while these two files each independently retype it.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting the eight common builders (with
`production-core-exec.test.ts`'s four extra builders layered on top locally
or added to the same module) is the home the two files' identical
declarations already point toward.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or a named gate
  kin; the cited lines are AST-builder scaffolding, not a pinned count or
  inventory.
- Recording-double carve-out: `span`/`callExpr`/`tryExpr`/`identExpr`/
  `objectExpr`/`stringExpr`/`letStmt`/`body` are plain value constructors,
  not recording doubles backing a MUST-NOT witness; not applicable.
- docs/bugs/ signature search: `grep -rln "production-cancellation-wiring\|production-core-exec" docs/bugs/*.md` returns hits that cite each file by name as its own bug's witness (phase 3b CANCEL-2/3/4/5 wiring; the core-exec deficiency fix); none documents this AST-builder duplication as a correct-reason red, and this finding proposes no merge, rename, or deletion of either file's `it()`/`describe()` blocks.
- coverage-matrix/bug-doc citation search: `grep -n "production-cancellation-wiring\|production-core-exec" docs/reference/coverage-matrix.md` returns no hits.
- Overlap check: searched `quality/intake/*.md` for any candidate citing both file names together — none found. The existing candidate `qw20260917154546-d7-107-03-nested-control-pure-position-harness-duplicated.md` cites the same AST-builder lines in `production-core-exec.test.ts` but pairs them against `tests/nested-control-in-pure-position.test.ts` (a file outside this wave's briefed scope), a distinct pairing from the one cited here; no existing candidate pairs `production-cancellation-wiring.test.ts` against `production-core-exec.test.ts`.
- Coverage-drift check: this finding is about a harness declaration repeated across two files that already exist and already pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-verified independently: both excerpts match at the cited lines (cancellation-wiring:65-88; core-exec:38-54/66-85), the stated grep reproduces exactly 16 hits (8 names × 2 files), and a per-function sed-extract + diff shows all eight bodies byte-identical; tests/helpers/invoke-seam-scaffold.ts:54 and tool-call-dispatch-harness.ts:51/73/77 export the span/callExpr/body precedent as claimed (no existing helper exports the full eight, so nothing is bypassed); both locations in tests/, neither a gate test, builders are plain value constructors not recording doubles, docs/bugs 0012/0293/0319 name the files only as witnesses with no merge/rename/delete proposed, coverage-matrix has no hits, both files 17/17 green; not a duplicate — no open/resolved PTQ cites either file for this (PTQ-0278 was call-with-clause R(), PTQ-0403 the dispatch doubles, PTQ-0290 the retry budget), and same-wave intake sibling d7-107-03 is the distinct core-exec↔nested-control pair whose triage explicitly deferred this pair here; note sites:2 undercounts — tests/nested-control-in-pure-position.test.ts:40-143 carries an identical 8/8 third copy and tests/pure-async-unification.test.ts a 6/8 copy, so the fixer should land one shared helper serving both filings (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
