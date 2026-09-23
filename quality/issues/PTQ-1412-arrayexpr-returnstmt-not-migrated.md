---
id: PTQ-1412
title: arrayExpr and returnStmt AST builders redeclared locally in b0307-value-position-query-err-binds despite the sibling builder set already migrated to tests/helpers/invoke-seam-scaffold
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0307-value-position-query-err-binds.test.ts:54-61
  - tests/b0351-value-position-query-success-binds-ok.test.ts:70-72
  - tests/b0351-value-position-query-success-binds-ok.test.ts:89-92
  - tests/nested-control-in-pure-position.test.ts:33-35
  - tests/statement-executor.test.ts:84-86
  - tests/statement-executor.test.ts:106-108
sites: 6                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923010657
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# arrayExpr and returnStmt AST builders redeclared locally in b0307-value-position-query-err-binds despite the sibling builder set already migrated to tests/helpers/invoke-seam-scaffold

## Observation
tests/b0307-value-position-query-err-binds.test.ts imports `span`, `body`,
`identExpr`, `letStmt`, `matchExpr`, `queryExpr`, and `deps`/`ScriptedHost`
from `./helpers/invoke-seam-scaffold` (a shared helper that a prior fixed
finding, PTQ-0529/PTQ-0536/PTQ-0885, caused to be created for exactly this
builder family). Two small builders in the same original family —
`arrayExpr` and `returnStmt` — were left un-migrated: they are still declared
locally at the top of the file, and their bodies are byte-identical to
copies declared locally in tests/b0351-value-position-query-success-binds-ok.test.ts,
tests/nested-control-in-pure-position.test.ts, and tests/statement-executor.test.ts.
`tests/helpers/invoke-seam-scaffold.ts` does not export either name.

## Evidence

tests/b0307-value-position-query-err-binds.test.ts:54-61 (re-read
immediately before filing):
```ts
function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}

/** A `return <operand>` statement. */
function returnStmt(operand: Expr | null): Stmt {
  return { kind: "return", operand, range: span() };
}
```

tests/b0351-value-position-query-success-binds-ok.test.ts:70-72 (`arrayExpr`,
byte-identical body):
```ts
function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}
```

tests/b0351-value-position-query-success-binds-ok.test.ts:89-92
(`returnStmt`, byte-identical body plus the same doc comment):
```ts
/** A `return <operand>` statement. */
function returnStmt(operand: Expr | null): Stmt {
  return { kind: "return", operand, range: span() };
}
```

tests/nested-control-in-pure-position.test.ts:33-35 (`arrayExpr`,
byte-identical body):
```ts
function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}
```

tests/statement-executor.test.ts:84-86 (`arrayExpr`, byte-identical body):
```ts
function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}
```

tests/statement-executor.test.ts:106-108 (`returnStmt`, same body, narrower
return type `ReturnStmt` in place of `Stmt`):
```ts
function returnStmt(operand: Expr | null): ReturnStmt {
  return { kind: "return", operand, range: span() };
}
```

Exact search: `grep -rln "^function arrayExpr" tests/*.test.ts` → exactly
tests/b0307-value-position-query-err-binds.test.ts,
tests/b0351-value-position-query-success-binds-ok.test.ts,
tests/nested-control-in-pure-position.test.ts,
tests/statement-executor.test.ts (4 hits). `grep -rln "^function returnStmt"
tests/*.test.ts` → exactly tests/b0307-value-position-query-err-binds.test.ts,
tests/b0351-value-position-query-success-binds-ok.test.ts,
tests/statement-executor.test.ts (3 hits). `grep -n "export function"
tests/helpers/invoke-seam-scaffold.ts` lists `span`, `site`, `identExpr`,
`queryExpr`, `matchExpr`, `letStmt`, `body`, `realEnv`, `queryConfig`,
`deps` — no `arrayExpr` or `returnStmt`.

## Why this is a problem
`tests/helpers/invoke-seam-scaffold.ts` already exists specifically to hold
this family of AST-node builders (`span`, `identExpr`, `queryExpr`,
`matchExpr`, `letStmt`, `body`) shared by b0307/b0351/b0387 and others, and
this file already imports six of that family's members from it. `arrayExpr`
and `returnStmt` are two more members of the identical family, declared with
identical bodies in the same file plus three siblings, but were not carried
into the same migration — each of the four files pays for its own copy of
these two three-line builders with no shared source, and a change to the
`Expr`/`Stmt` "array"/"return" node shape would need to be repeated by hand
in up to four places.

## Suggested direction (non-binding, optional)
Adding `arrayExpr` and `returnStmt` to the existing
`tests/helpers/invoke-seam-scaffold.ts` export set — the same home this
file's other six builders already live in — is the natural landing point
these four copies point to; this observes where the duplicate already sits
next to its already-migrated siblings, not a design for the migration.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or a named
  kin; not applicable.
- Recording-double check: `arrayExpr`/`returnStmt` are plain AST-node
  builders, not recording doubles; the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: docs/bugs/0307-value-position-query-err-aborts-body-instead-of-binding.md
  Status "fixed (0.298.0)" — not a documented correct-reason red; the
  duplication claim is unrelated to the bug's fix/red status.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0307-value-position-query-err-binds" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -n "b0307-value-position-query-err-binds"
  docs/bugs/0307-value-position-query-err-aborts-body-instead-of-binding.md`
  → 2 hits (its own witness list, lines 181/196). This finding does not
  propose merging, renaming, or deleting any file or `it()`/`describe()`
  block — only that two of its already-shared-family builders could be
  imported from the existing helper module instead of redeclared a fourth
  time — so no citation is affected.
- Prior-finding overlap check: PTQ-0529/PTQ-0536/PTQ-0885 (all resolved,
  fixed) cover the ORIGINAL nine/ten/eleven-piece bundle
  (`span`/`stringExpr`/`identExpr`/`matchExpr`/`letStmt`/`body`/`realEnv`/
  `SITE`/`NOOP_CHECKPOINT`/`RecordingMutator`/`ScriptedHost`/`deps`) across
  the same file family; their fix already extracted most of that bundle into
  `tests/helpers/invoke-seam-scaffold.ts`, confirmed by this file's current
  import list. `arrayExpr` and `returnStmt` are not named in any of those
  three finding's Evidence sections (`grep -l "arrayExpr\|returnStmt"
  quality/resolved/PTQ-0529*.md quality/resolved/PTQ-0536*.md
  quality/resolved/PTQ-0885*.md` → 0 hits) and no open intake/issues file
  names them (`grep -rl "arrayExpr" quality/intake/ quality/issues/` → 0
  hits before this filing) — this is the residual, un-migrated remainder of
  that same family, not a re-filing of the resolved bundle.
- Coverage check: the claim is about a repeated builder-function DEFINITION,
  not a missing test path; every cited declaration is exercised by its own
  file's currently-passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — all six excerpts reproduce at the cited lines with zero drift; sed-extracted `arrayExpr` bodies diff byte-identical across all four files and `returnStmt` bodies across b0307/b0351 (statement-executor differs only in the `ReturnStmt` return annotation); both greps reproduce (`^function arrayExpr` = 4 files, `^function returnStmt` = 3), no tests/helpers/ module exports either name, every copy is live (b0307 2/2 uses, b0351 2/2, nested-control 23 arrayExpr, statement-executor 6/2) and all four files pass 70/70 under vitest; in-scope D7 copy-paste-fixture class under tests/, no *gate*/recording-double/witness-list carve-out (coverage-matrix names none of the four; no merge/rename/delete proposed); one FP-check claim corrected on record without changing the verdict: `grep -l "arrayExpr\|returnStmt" quality/resolved/PTQ-0529*/0536*/0885*` returns 3 hits not 0 — PTQ-0529:66 and PTQ-0536:24-25,58,78 name the pair explicitly — but those findings are fixed and their fix (e54a42b3) resolved the pair within their cited scope by deleting b0387's copies, so the surviving b0307/b0351/nested-control/statement-executor quartet is a disjoint site set none of them (nor PTQ-0639/0670/0779/0920) cites; per ratified precedent PTQ-0779 (span/NOOP_CHECKPOINT alone in statement-executor) a residual un-migrated builder pair beside an already-imported sibling set is an accepted D7 class (triage: claude-fable-5-1)
