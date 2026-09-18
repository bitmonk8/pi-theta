---
id: PTQ-0529
title: b0307-empty-template-parity and b0307-value-position-query-err-binds redeclare the same nine AST/executor-harness helpers byte-identically
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0307-empty-template-parity.test.ts:60-127
  - tests/b0307-value-position-query-err-binds.test.ts:63-146
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0307-empty-template-parity and b0307-value-position-query-err-binds redeclare the same nine AST/executor-harness helpers byte-identically

## Observation
tests/b0307-empty-template-parity.test.ts and
tests/b0307-value-position-query-err-binds.test.ts each hand-build the same
family of `statement-executor` fixtures at module scope: `span()`,
`stringExpr()`, `identExpr()`, `matchExpr()`, `letStmt()`, `body()`,
`realEnv()`, the `SITE` constant, the `NOOP_CHECKPOINT` constant, and a
`RecordingMutator` class implementing `CommittedConversationMutator`. Six of
these nine (`span`, `stringExpr`, `identExpr`, `matchExpr`, `letStmt`,
`body`) plus `realEnv`, `SITE`, `NOOP_CHECKPOINT`, and the entire
`RecordingMutator` class body are byte-identical across the two files (`diff`
of the class bodies returns no output).

## Evidence

tests/b0307-empty-template-parity.test.ts:60-90:
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function queryExpr(template: string): QueryExpr {
  return { kind: "query", schema: null, template, range: span() };
}

function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}
```

tests/b0307-value-position-query-err-binds.test.ts:63-99 (the same six
functions, identical bodies, one extra `arrayExpr`/`returnStmt` pair
interleaved):
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

function stringExpr(value: string): Expr {
  return { kind: "string", value, range: span() };
}

function identExpr(name: string): Expr {
  return { kind: "ident", name, range: span() };
}

function arrayExpr(elements: readonly Expr[]): Expr {
  return { kind: "array", elements, range: span() };
}

function queryExpr(template: string): Expr {
  return { kind: "query", schema: null, template, range: span() };
}

function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

function returnStmt(operand: Expr | null): Stmt {
  return { kind: "return", operand, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}
```

tests/b0307-empty-template-parity.test.ts:98-127 (`realEnv`, `SITE`,
`NOOP_CHECKPOINT`, `RecordingMutator`):
```ts
function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class RecordingMutator implements CommittedConversationMutator {
  readonly calls: string[] = [];
  truncate(id: string): void {
    this.calls.push(`truncate:${id}`);
  }
  rewrite(id: string): void {
    this.calls.push(`rewrite:${id}`);
  }
  replace(id: string): void {
    this.calls.push(`replace:${id}`);
  }
  remove(id: string): void {
    this.calls.push(`remove:${id}`);
  }
  injectCompensatingTurn(surface: CommittedSurface): void {
```

tests/b0307-value-position-query-err-binds.test.ts:115-144 (the same four
declarations, verified byte-identical by `diff <(sed -n '110,127p'
tests/b0307-empty-template-parity.test.ts) <(sed -n '129,146p'
tests/b0307-value-position-query-err-binds.test.ts)`, which returned no
output):
```ts
function realEnv(): LexicalEnvironment {
  return buildEnvironment({ body: { statements: [], tail: null } });
}

const SITE: CheckpointSite = { file: "theta.theta", line: 1, column: 1 };

const NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

class RecordingMutator implements CommittedConversationMutator {
  readonly calls: string[] = [];
  truncate(id: string): void {
    this.calls.push(`truncate:${id}`);
  }
  rewrite(id: string): void {
    this.calls.push(`rewrite:${id}`);
  }
  replace(id: string): void {
    this.calls.push(`replace:${id}`);
  }
  remove(id: string): void {
    this.calls.push(`remove:${id}`);
  }
  injectCompensatingTurn(surface: CommittedSurface): void {
```

Pattern search: `grep -n "^function span\|^function stringExpr\|^function identExpr\|^function matchExpr\|^function letStmt\|^function body\|^function realEnv\|^const SITE\|^const NOOP_CHECKPOINT\|^class RecordingMutator" tests/b0307-empty-template-parity.test.ts tests/b0307-value-position-query-err-binds.test.ts` returns exactly 10 hits per file (the count above), one per named declaration, confirming the full set recurs in both files.

## Why this is a problem
Both files independently redeclare the same nine-piece "build a minimal
`ThetaBody`/`Expr`/`Stmt` AST by hand, wire a real `LexicalEnvironment`, and
supply a no-op checkpoint plus a recording mutator" harness in order to drive
the real `executeBody`. Nothing under tests/helpers/ currently exports this
bundle (`ls tests/helpers/ | grep -i "ast\|expr\|stmt"` returns no file), so
each of the two files in scope pays for the same construction a second time
with no shared source; a change to any one of these node shapes (for example
`QueryExpr`'s field list) must be repeated by hand in both files to keep them
in sync.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting the `span`/`stringExpr`/`identExpr`/
`matchExpr`/`letStmt`/`body`/`realEnv`/`NOOP_CHECKPOINT`/`RecordingMutator`
bundle is the natural home these two files' own near-identical copies point
to; this is an observation about where the duplicate already sits, not a
design for the extraction.

## False-positive check
Gate-pin check: neither file matches `*gate*.test.ts` or a named kin, so the
pinned-count carve-out does not apply. Recording-double check:
`RecordingMutator` records calls but neither file reads `.calls` in any
assertion (`grep -n "RecordingMutator\|\.calls" tests/b0307-*.ts` shows the
class defined and instantiated but the `calls` array never inspected) — this
finding cites the class purely as duplicated scaffolding, not as an assertion
that cannot fail, so it stays inside the boilerplate-duplication class rather
than crossing into the assertions-that-cannot-fail class. docs/bugs/
signature search: no red/skip is alleged here. coverage-matrix/bug-doc
citation search: `grep -rn "b0307-empty-template-parity\|b0307-value-position-query-err-binds"
docs/reference/coverage-matrix.md docs/bugs/` returned no hits in either
document, so neither test is pinned by name; this finding does not propose
merging, renaming, or deleting either file. A broader repo-wide grep for
`function stringExpr` also hits nine further files outside this wave's scope
(tests/b0351-value-position-query-success-binds-ok.test.ts,
tests/b0387-block-expr-tail-query-consumption.test.ts, and seven others) —
those are left unfiled here since the brief scopes this review to the nine
named files; noted for a routing follow-up, not filed as coverage.

## Triage
verdict: confirmed — independently re-verified: all excerpts match at the cited lines with zero drift; `diff <(sed -n 110,127p …parity) <(sed -n 129,146p …err-binds)` is empty and the 98-127 vs 115-146 block differs only by two doc-comment lines, the six AST builders (span/stringExpr/identExpr/matchExpr/letStmt/body) are byte-identical bodies, and the 10-declaration grep returns 10/10 per file (title's "nine" is a miscount — 10 are enumerated; non-blocking); in-scope D7 boilerplate/copy-paste-fixture class under tests/, `.calls` is never read so no negative-witness carve-out applies. Two FP-check claims corrected on record without changing the verdict: docs/bugs/0307-…md:181,186 DOES name both files in its witness list (candidate said no hits) but the carve-out protects only merge/rename/delete and helper extraction proposes neither; and tests/helpers/tool-call-dispatch-harness.ts:51-58,81-85 already exports a byte-identical `span()`, `NOOP_CHECKPOINT` and `strExpr` (candidate's `ls | grep ast|expr|stmt` was too narrow), which strengthens the duplication anchor. Not a duplicate: no accepted PTQ cites these two files (PTQ-0278/PTQ-0257 are other files); same-wave intake siblings d7-02-b0387 and d7-140-04 add disjoint sites and reference this filing as the base (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
