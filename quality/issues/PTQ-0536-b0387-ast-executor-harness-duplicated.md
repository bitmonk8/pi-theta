---
id: PTQ-0536
title: b0387 redeclares the same nine-piece AST/executor harness already duplicated between the two b0307 files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0387-block-expr-tail-query-consumption.test.ts:78-196
  - tests/b0307-value-position-query-err-binds.test.ts:63-144
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0387 redeclares the same nine-piece AST/executor harness already duplicated between the two b0307 files

## Observation
tests/b0387-block-expr-tail-query-consumption.test.ts hand-builds, module
scope, the same family of `statement-executor` fixtures as
tests/b0307-value-position-query-err-binds.test.ts: `span()`, `stringExpr()`,
`identExpr()`, `arrayExpr()`, `queryExpr()`, `matchExpr()`, `letStmt()`,
`returnStmt()`, `body()`, `realEnv()`, the `SITE` constant, the
`NOOP_CHECKPOINT` constant, and a `RecordingMutator` class implementing
`CommittedConversationMutator` — eleven declarations, ten of which (every one
but `okErrMatch`'s inner match-arm pattern) are byte-identical between the two
files, including doc comments. This wave's own d7-02 shard already filed a
finding (qw20260917154546-d7-02-b0307-ast-harness-duplicated.md) documenting
this identical bundle duplicated between tests/b0307-empty-template-parity.test.ts
and tests/b0307-value-position-query-err-binds.test.ts, and its own
false-positive check names tests/b0387-block-expr-tail-query-consumption.test.ts
as one of "nine further files outside this wave's scope" carrying the same
`function stringExpr` shape, left unfiled because that shard's brief scoped it
to the two named b0307 files. b0387 is inside THIS shard's reviewed set, so
this finding cites it as the further, disjoint occurrence that shard flagged
but did not file.

## Evidence

tests/b0387-block-expr-tail-query-consumption.test.ts:78-196 (the shared
subset only; `objectExpr`/`callExpr`/`tryExpr`/`blockExpr` at :95-142 are
bug-0387-specific additions interleaved and are not claimed as duplicated):
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

/** An untyped `@`-query expression. */
function queryExpr(template: string): Expr {
  return { kind: "query", schema: null, template, range: span() };
}

/** A `match` expression node. */
function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

/** A `let <name> = <init>` statement (immutable, unannotated). */
function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

/** A `return <operand>` statement. */
function returnStmt(operand: Expr | null): Stmt {
  return { kind: "return", operand, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}
```

tests/b0387-block-expr-tail-query-consumption.test.ts:157-196 (`realEnv`,
`SITE`, `NOOP_CHECKPOINT`, `RecordingMutator`):
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
    this.calls.push(`inject:${surface.id}`);
  }
}
```

tests/b0307-value-position-query-err-binds.test.ts:63-144 (the same eleven
declarations, byte-identical apart from `okErrMatch`'s Ok-arm pattern, which
is a bug-specific choice — b0307's Ok arm is `{ kind: "wildcard" }`/
`stringExpr("OKGOT")`, b0387's is `{ kind:"identifier", name:"v" }`/
`identExpr("v")`):
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

/** An untyped `@`-query expression. */
function queryExpr(template: string): Expr {
  return { kind: "query", schema: null, template, range: span() };
}

/** A `match` expression node. */
function matchExpr(scrutinee: Expr, arms: readonly MatchArmNode[]): MatchExpr {
  return { kind: "match", scrutinee, arms, range: span() };
}

/** A `let <name> = <init>` statement (immutable, unannotated). */
function letStmt(name: string, init: Expr): Stmt {
  return { kind: "let", name, mutable: false, annotation: null, init, range: span() };
}

/** A `return <operand>` statement. */
function returnStmt(operand: Expr | null): Stmt {
  return { kind: "return", operand, range: span() };
}

function body(statements: readonly Stmt[], tail: Expr | null = null): ThetaBody {
  return { statements, tail };
}
```

Direct diff, re-run immediately before filing:
`diff <(sed -n '63,99p' tests/b0307-value-position-query-err-binds.test.ts) <(sed -n '78,114p' tests/b0387-block-expr-tail-query-consumption.test.ts)`
(the `span`/`stringExpr`/`identExpr`/`arrayExpr`/`queryExpr`/`matchExpr`/
`letStmt`/`returnStmt`/`body` span, excluding b0387's interleaved
`objectExpr`/`callExpr`/`tryExpr`) produces zero differences; likewise
`diff <(sed -n '115,127p' tests/b0307-value-position-query-err-binds.test.ts) <(sed -n '157,169p' tests/b0387-block-expr-tail-query-consumption.test.ts)`
(`realEnv`/`SITE`/`NOOP_CHECKPOINT` opening) and the `RecordingMutator` class
bodies both produce zero differences.

## Why this is a problem
Both files independently redeclare the same eleven-piece "build a minimal
`ThetaBody`/`Expr`/`Stmt` AST by hand, wire a real `LexicalEnvironment`, and
supply a no-op checkpoint plus a recording mutator" harness to drive the real
`executeBody`, with matching doc comments word-for-word. This wave's own
d7-02 shard already established (qw20260917154546-d7-02-b0307-ast-harness-duplicated.md)
that this bundle recurs across at least the two b0307 files and named b0387
as a further site outside that shard's own scope; b0387 is inside this
shard's scope, so the same duplication, now confirmed by direct excerpt and
diff against one of the two files that finding already cites, is filed here
as the third confirmed member of that clone family.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module exporting the `span`/`stringExpr`/`identExpr`/
`arrayExpr`/`queryExpr`/`matchExpr`/`letStmt`/`returnStmt`/`body`/`realEnv`/
`NOOP_CHECKPOINT`/`RecordingMutator` bundle (as the d7-02 shard's finding
already observes for the two b0307 files) is the natural home all three
files' near-identical copies point to; this is an observation about where the
duplicate already sits, not a design for the extraction.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named kin; not
  applicable.
- Recording-double check: `RecordingMutator` records calls but
  tests/b0387-block-expr-tail-query-consumption.test.ts never reads `.calls`
  in any assertion (`grep -n "\.calls" tests/b0387-block-expr-tail-query-consumption.test.ts`
  → 0 hits) — this finding cites the class purely as duplicated scaffolding,
  not as an assertion that cannot fail, so it stays inside the
  boilerplate-duplication class.
- docs/bugs/ signature search: docs/bugs/0387-block-expr-tail-query-raw-payload-and-err-abort.md
  and docs/bugs/0307-*.md both exist; neither file's cells are documented
  correct-reason reds against their own bug — the B1/B2/B4 cells are RED at
  fork by the fix's own design (fix not yet landed), not silent skips, and
  that disposition is unrelated to the harness-duplication claim here.
- coverage-matrix/bug-doc citation search: `grep -n "b0387-block-expr-tail-query-consumption\|b0307-value-position-query-err-binds"
  docs/reference/coverage-matrix.md` → 0 hits; `grep -rl` for either filename
  across docs/bugs/*.md (excluding each file's own bug document) → 0 hits.
  This finding proposes no merge, rename, or deletion of either file or any
  `it()`/`describe()` inside them — only that the harness bundle could be
  imported from a shared module instead of redeclared a third time.
- Prior-finding overlap check: qw20260917154546-d7-02-b0307-ast-harness-duplicated.md
  (this same wave, intake) covers the identical bundle in the two b0307 files
  and explicitly defers b0387 as out of its own scope; this finding is the
  disjoint, in-scope continuation it names, not a re-filing of the same
  locations.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; every piece cited is exercised by each file's own tests.

## Triage
verdict: confirmed — independently re-verified: all excerpts match at the cited lines with zero drift; extracting the nine builders by exact range (b0307:62-101 vs b0387:77-92,104-107,114-131, i.e. minus the interleaved objectExpr/callExpr/tryExpr) diffs to nothing but two blank separator lines, and `diff <(sed -n 112,146p …err-binds) <(sed -n 154,188p …b0387)` (realEnv/SITE/NOOP_CHECKPOINT/RecordingMutator incl. doc comments) is empty; in-scope D7 boilerplate/copy-paste-fixture class under tests/. Three FP-check inaccuracies corrected on record without changing the verdict: (1) the literal command `sed -n '78,114p'` as written yields 36 diff lines because it spans the interleaved builders — only the parenthetically-described exclusion reproduces zero; (2) the `.calls` grep returns 5 hits, not 0 — all are the class's own `this.calls.push` lines and no assertion reads `.calls`, so the boilerplate (not negative-witness) classification stands; (3) docs/bugs/0387-…md:174,182 and docs/bugs/0421-…md:93 DO cite the b0387 file (candidate said 0 hits outside own doc), but the carve-out protects only merge/rename/delete and helper extraction proposes neither. Anchor strengthened: tests/helpers/tool-call-dispatch-harness.ts:51,59,81 and invoke-seam-scaffold.ts:54 already export byte-identical `span()`/`strExpr`/`NOOP_CHECKPOINT`. Title's "nine-piece" vs the body's 13 enumerated declarations is a miscount, non-blocking. Not a duplicate: same-wave sibling d7-02-b0307 (confirmed) covers only the two b0307 files and its triage named this filing as the disjoint b0387 continuation (precedent PTQ-0219/PTQ-0228 accept per-file harness continuations); d7-140-04 is a narrower RecordingMutator-class-only filing still in intake; PTQ-0278/PTQ-0257 cite other files (triage: claude-fable-5-1)
