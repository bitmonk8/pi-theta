---
id: PTQ-0920
title: leading-bracket-statement-boundary.test.ts retypes diagnosticLines/trailingExpr/onlyFn/letsOf byte-identical to postfix-question-ternary-statement-boundary.test.ts, with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/leading-bracket-statement-boundary.test.ts:45-79
  - tests/postfix-question-ternary-statement-boundary.test.ts:57-112
  - tests/subagent-fn-return-annotation.test.ts:69-71
sites: 3
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# leading-bracket-statement-boundary.test.ts retypes diagnosticLines/trailingExpr/onlyFn/letsOf byte-identical to postfix-question-ternary-statement-boundary.test.ts, with no tests/helpers/ home

## Observation
`tests/leading-bracket-statement-boundary.test.ts` declares four module-scope
AST-accessor helpers — `diagnosticLines`, `trailingExpr`, `onlyFn`, `letsOf` —
each with its own doc comment and body. `tests/postfix-question-ternary-statement-boundary.test.ts`
(not in this review's scope, but a live sibling) declares the same four
functions, three of which (`diagnosticLines`, `trailingExpr`, `letsOf`) are
character-for-character identical including their doc comments, and the
fourth (`onlyFn`) is identical apart from its own one-line doc comment. Both
files already import their `parseDoc`/`parse` entry point from the shared
`tests/helpers/e2e-s1.ts` (the fix that landed for the resolved
`PTQ-0601-recordingdeps-parse-harness-quadruplicated` finding), but neither
imports any of these four accessor helpers from a shared module — no
`tests/helpers/` module exports any of the four names.

## Evidence

`tests/leading-bracket-statement-boundary.test.ts:45-79` (re-read immediately
before filing):
```ts
/** `code: message` render of the document's diagnostics, for diff-friendly emptiness assertions. */
function diagnosticLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.code}: ${d.message}`);
}
...
function trailingExpr(block: Block): Expr | null {
  if (block.tail !== null) {
    return block.tail;
  }
  const last = block.statements[block.statements.length - 1];
  return last !== undefined && last.kind === "expr" ? last.expr : null;
}

/** The single `FnDecl` of the parsed document. */
function onlyFn(doc: ThetaDocument): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn");
  expect(fn, "the fn declaration parses into the body").toBeDefined();
  return fn as FnDecl;
}

/** The `let` statements of a block, in order. */
function letsOf(block: Block): LetStmt[] {
  return block.statements.filter((s): s is LetStmt => s.kind === "let");
}
```

`tests/postfix-question-ternary-statement-boundary.test.ts:57-112` — the same
four functions, `diagnosticLines`/`trailingExpr`/`letsOf` byte-identical
(only interleaved with two extra functions, `stmtKindsBeforeTail` and
`reassignsOf`, not present in the leading-bracket file):
```ts
function diagnosticLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.code}: ${d.message}`);
}
...
function trailingExpr(block: Block): Expr | null {
  if (block.tail !== null) {
    return block.tail;
  }
  const last = block.statements[block.statements.length - 1];
  return last !== undefined && last.kind === "expr" ? last.expr : null;
}
...
function letsOf(block: Block): LetStmt[] {
  return block.statements.filter((s): s is LetStmt => s.kind === "let");
}
...
function onlyFn(doc: ThetaDocument): FnDecl {
  const fn = doc.body.statements.find((s): s is FnDecl => s.kind === "fn");
  expect(fn, "the fn declaration parses into the body").toBeDefined();
  return fn as FnDecl;
}
```

`tests/subagent-fn-return-annotation.test.ts:69-71` — `diagnosticLines` is
also byte-identical here (a third site for this one function only; that
file's own `onlyFn` at :79-83 is a diverged variant — `.filter().length`
instead of `.find()` — so it is not counted among the `onlyFn`/`trailingExpr`/`letsOf`
duplicate sites):
```ts
function diagnosticLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.code}: ${d.message}`);
}
```

Exact search performed: `grep -rln "function diagnosticLines" tests/*.ts` →
exactly the three files above; `grep -rln "function trailingExpr\|function letsOf" tests/*.ts`
→ exactly the two files `leading-bracket-statement-boundary.test.ts` and
`postfix-question-ternary-statement-boundary.test.ts`; `grep -rn "diagnosticLines\|trailingExpr\|onlyFn\|letsOf" tests/helpers/*.ts`
→ 0 hits — no `tests/helpers/` module exports any of the four names.

## Why this is a problem
Both files are the same "bug NNNN regression — a statement-boundary defect"
shape (bug 0006 and bug 0015 respectively), share the same fixture-reading
idiom (`onlyFn`/`letsOf`/`trailingExpr` read a parsed `fn`'s body to check
where a statement boundary actually fell), and already share their
`parse()` entry point via `tests/helpers/e2e-s1.ts` after `PTQ-0601`'s fix
landed — but the four small accessor functions that idiom is built from
were left independently retyped in both files (and `diagnosticLines`
additionally in a third), rather than completing the same migration to a
shared module.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting `diagnosticLines`, `trailingExpr`,
`onlyFn`, and `letsOf` — alongside the existing `tests/helpers/e2e-s1.ts`
these two files already import `parseDoc` from — is the home the two files'
already-partial migration points toward.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a named kin; the
  cited lines are AST-accessor helper declarations, not a pinned count or
  inventory.
- Recording-double check: none of the four helpers is a recording double
  backing a "never called" MUST-NOT witness; each is a pure read-projection
  over an already-parsed AST. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "leading-bracket-statement-boundary\|postfix-question-ternary-statement-boundary\|subagent-fn-return-annotation" docs/bugs/*.md`
  → docs/bugs/0006 and docs/bugs/0015 each name one of the first two files as
  their own reproduction/witness file (and a third bug doc names the third
  file); none documents this helper-declaration duplication as a
  correct-reason red, and this finding proposes no merge, rename, or
  deletion of any file or `it()`/`describe()` block.
- coverage-matrix/bug-doc citation search: `grep -n "leading-bracket-statement-boundary\|postfix-question-ternary-statement-boundary" docs/reference/coverage-matrix.md`
  → 0 hits.
- Duplicate-topic check: `grep -rli "trailingexpr\|onlyfn(\|letsof(" quality/issues/*.md quality/resolved/*.md quality/intake/*.md`
  (excluding this file) → no hits; the resolved `PTQ-0601` finding covers a
  different pair of functions (`recordingDeps`/`parse`) at different line
  ranges in the same two files, already fixed (both files now import
  `parseDoc` from `tests/helpers/e2e-s1.ts`) — this finding is the residue
  left behind by that migration, not a re-statement of it.
- Coverage-drift check: this finding is about accessor-helper declarations
  repeated across files that already exist and already pass; it makes no
  claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four helper bodies reproduce at the cited lines and mktemp `diff` of the extracted functions between tests/leading-bracket-statement-boundary.test.ts:45-79 and tests/postfix-question-ternary-statement-boundary.test.ts:57-112 is empty for `diagnosticLines` (3 lines), `trailingExpr` (7), `onlyFn` (5) and `letsOf` (3); `diagnosticLines` at tests/subagent-fn-return-annotation.test.ts:69-71 is likewise byte-identical while that file's `onlyFn` :79-83 is the `.filter().length` divergence the candidate correctly excludes; every copy is live (lb 7/3/4/7 call refs, pq 23/11/2/5, sf `diagnosticLines` 12); the stated searches reproduce (`function diagnosticLines` → exactly the three files across src/ extensions/ tools/ tests/; `function trailingExpr\|function letsOf` → exactly the two; no tests/helpers module exports any of the four names — the only helper hit is a `diagnosticLines` result FIELD in production-load-harness.ts:39, not a function; docs/bugs 0005/0006/0015 name the files as witnesses only; coverage-matrix → 0); all sites under tests/, D7 boilerplate-duplication class, no gate/recording-double/red-test/merge-delete carve-out applies; dedupe: the only tracked finding naming these files is resolved PTQ-0601 (recordingDeps/parse, a different pair — its fix is what left these accessors behind), and the open `diaglines-reimplemented` family covers other files; one Observation inaccuracy noted for the record, not affecting the root cause: the `trailingExpr` doc comments DIFFER (bug-0006 vs bug-0015 wording, md5 mismatch) while the `onlyFn` one-liners are identical — the inverse of the candidate's claim; the fixer should also note e2e-s1.ts:242 already exports `diagLines` rendering `${severity} ${code}: ${message}`, a near-variant of `diagnosticLines` (triage: claude-fable-5-1)
