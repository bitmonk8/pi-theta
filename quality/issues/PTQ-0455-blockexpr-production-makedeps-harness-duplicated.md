---
id: PTQ-0455
title: blockexpr-production.test.ts redeclares the makeDeps/parse/codesOf production-parse harness byte-for-byte from lexer-parser-diagnostics-production.test.ts
lens: D7
status: open
verdict: confirmed
locations:
  - tests/blockexpr-production.test.ts:101-126
  - tests/lexer-parser-diagnostics-production.test.ts:38-62
sites: 2
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# blockexpr-production.test.ts redeclares the makeDeps/parse/codesOf production-parse harness byte-for-byte from lexer-parser-diagnostics-production.test.ts

## Observation
tests/blockexpr-production.test.ts declares its own `makeDeps()` /
`parse()` / `codesOf()` "production parse harness" at lines 101-126. Its own
header comment states "Modelled on
tests/lexer-parser-diagnostics-production.test.ts:38–56." That file declares
the identical three functions at lines 38-62. The two triples are
structurally and textually identical apart from the `parse()` default `path`
argument's string literal (`"bug0082.theta"` vs `"test.theta"`).

## Evidence
tests/blockexpr-production.test.ts:101-126:
```ts
// --- production parse harness ----------------------------------------------
// Modelled on tests/lexer-parser-diagnostics-production.test.ts:38–56.

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "bug0082.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}
```

tests/lexer-parser-diagnostics-production.test.ts:38-62 (the counterpart,
same order, same three declarations):
```ts
// --- production parse harness ---------------------------------------------

/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}
```

Search: `grep -n "function makeDeps(): ParseThetaDocumentDeps" tests/*.test.ts`
finds this exact signature repeated in roughly thirty test files repo-wide
(e.g. tests/query-schema-resolve.ts, tests/session-control-parse.test.ts,
tests/tool-arg-shape-enforcement.test.ts, tests/subagent-fn.test.ts — noted
for context only; only the two files above are this filing's cited
locations, since blockexpr-production.test.ts's own header names
lexer-parser-diagnostics-production.test.ts specifically as the model it
copied).

## Why this is a problem
Two files declare the identical three-function "wire a no-op diagnostic
sink + always-resolving model matcher, parse a `.theta` source string
through the real `parseThetaDocument`, and collect the resulting diagnostic
codes" scaffold, differing only in a default-argument string literal.
blockexpr-production.test.ts's own header comment names the file it copied
the shape from, so the duplication is an acknowledged copy rather than
convergent design, and it was not factored into a shared module the way
other production-parse-harness lineages in this repository already have
been (e.g. tests/helpers/invoke-seam-scaffold.ts centralising the bug
0294/0295/0347/0349 `executeBody` scaffold on the same "several bug-witness
files declare the identical pure scaffolding" reasoning).

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module for the "wire a no-op systemNote/modelMatcher
ParseThetaDocumentDeps and drive parseThetaDocument, returning codes" triple
is the natural home the "Modelled on ..." header comment already points at.

## False-positive check
Gate-pin: neither file matches `*gate*.test.ts` or a listed gate kin; not a
census/pin gate. Recording-double: neither `makeDeps` nor its `systemNote`/
`modelMatcher` fields record calls for a MUST-NOT witness — they are inert
stand-ins, not recording doubles; carve-out does not apply. docs/bugs/
signature search: `grep -rn "blockexpr-production.test.ts\|lexer-parser-diagnostics-production.test.ts" docs/bugs/`
found only docs/bugs/0082-blockexpr-production-unimplemented.md discussing
blockexpr-production.test.ts's *behavioural* fix, no bug doc discussing this
harness duplication itself. coverage-matrix/bug-doc citation search:
`grep -rn "blockexpr-production.test.ts\|lexer-parser-diagnostics-production.test.ts" docs/reference/coverage-matrix.md`
found no citation by name pinning either file's structure. This claim is
about existing duplicated test code, not about a missing test — no coverage
judgment is made.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts match verbatim at blockexpr-production.test.ts:101-126 and lexer-parser-diagnostics-production.test.ts:38-62, and a diff of the two 23-line triples differs only in the parse() default-path literal ("bug0082.theta" vs "test.theta"); the blockexpr header names the lexer-parser file as its model, neither file imports anything from tests/helpers/, yet tests/helpers/e2e-s1.ts:38-47 (first committed 2026-07-13, predating blockexpr-production.test.ts 2026-08-22) already exports the field-for-field equivalent parseDeps()/parseDoc(src, path="test.theta") that 30+ sibling tests import — same confirmed-and-fixed D7 copy-paste-fixture class as resolved PTQ-0214/0239/0314/0386/0405 at new locations (per-file-pair convention → not duplicate; sibling intake d7-02 is a different fixture); no carve-out applies (neither is a *gate* test, makeDeps is inert not recording, bug 0082 is fixed and both files are green 38/38, coverage-matrix has 0 hits, bug docs 0090/0102/0240/0421 cite these files only by test line numbers not the harness); peripheral inaccuracies — the repo-wide signature count is 25 not "roughly thirty", the docs/bugs search actually hits 5 files not 1, and tests/query-schema-resolve.ts is really query-schema-resolve.test.ts — do not touch the anchor (triage: claude-fable-5-1)
