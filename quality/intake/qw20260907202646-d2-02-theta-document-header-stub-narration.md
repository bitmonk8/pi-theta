---
id: pending
title: theta-document.ts's module header still narrates parseThetaDocument as an inert V19a-T stub returning an empty body and an empty diagnostics array regardless of input
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:16-25
  - src/parser/theta-document.ts:943-964
  - src/parser/theta-document.ts:1395-1403
sites: 1
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# theta-document.ts's module header still narrates parseThetaDocument as an inert V19a-T stub returning an empty body and an empty diagnostics array regardless of input

## Observation
The module header carries a present-tense paragraph describing the tests-task
(V19a-T) state of this file: `parseThetaDocument` is stubbed inertly, every
paired test "reds on its own primary assertion", and "the paired V19a
implementation leaf fills the parser in". The file today is a 10,282-line
recursive-descent parser: `parseThetaDocument` lexes, parses a full statement
AST, parses frontmatter, and aggregates twelve diagnostic arrays. The stub
record shape the header quotes is also no longer the return type — `ThetaDocument`
carries a fourth field, `deliveredDiagnostics`.

## Evidence
src/parser/theta-document.ts:16-25 — the header paragraph:

```ts
// V19a-T (tests-task) declares the AST node shapes and stubs `parseThetaDocument`
// inertly: it returns `{ frontmatter: null, body: { statements: [], tail: null },
// diagnostics: [] }` regardless of input. Every paired V19a-T test therefore
// reds on its own primary assertion — an empty body where a `LetStmt` /
// `IfStmt` / `SchemaDecl` / … node was expected, a missing tail `Expr`, a wrong
// statement count where newline-continuation should have joined (or split) a
// statement, or an empty `diagnostics` array where the delegated checkers should
// have aggregated multiple sorted errors — not on a compile error, a missing
// fixture, or a harness throw. The paired V19a implementation leaf fills the
// parser in.
```

src/parser/theta-document.ts:943-964 — the declared result type carries four
fields, not the three the header's stub literal names:

```ts
export interface ThetaDocument {
  /** The parsed frontmatter, or `null` when the file carries none. */
  readonly frontmatter: ParsedFrontmatter | null;
  /** The whole-file body statement-list AST the interpreter walks. */
  readonly body: ThetaBody;
  /**
   * Every diagnostic aggregated across the whole file in one pass, sorted
   * `(file, line, col)` per diagnostics.md §"Multi-error reporting" — with
   * one fast-fail exception: the invalid-encoding refusal arm (lexical.md
   * §Encoding) short-circuits before the aggregation pass runs.
   */
  readonly diagnostics: readonly Diagnostic[];
```

src/parser/theta-document.ts:1395-1403 — the implemented terminal return, which
depends on the input rather than being constant:

```ts
  const configuredStatements = attachSubagentSessionConfigs(statements, frontmatter);

  return {
    frontmatter,
    body: { statements: configuredStatements, tail: resolvedTail },
    diagnostics,
    deliveredDiagnostics: lex.diagnostics,
  };
}
```

## Why this is a problem
Leftover scaffolding narration: the paragraph describes a build state the
repository left behind, in the present tense, at the top of the file it
describes. It asserts three checkable facts that are all false of the current
code — the function returns a constant record, the record has three fields, and
the paired tests red on empty-body assertions — so a reader who trusts the
header is told the opposite of what the module does. `git log -S "V19a-T
(tests-task) declares the AST node shapes" --oneline -- src/parser/theta-document.ts`
returns only `2bc69157 Rename Loom -> Theta across the corpus`, i.e. the text
has survived unedited since before the rename while the implementation landed
underneath it.

## Suggested direction (non-binding, optional)
Drop the tests-task paragraph; the two surrounding paragraphs (the seam
statement and the Spec list) already carry the module's current contract.

## False-positive check
- Verified the narration against the code it describes: `parseThetaDocument`
  (src/parser/theta-document.ts:985-1403) branches on `firstInvalidUtf8Offset`,
  constructs a `BodyParser`, and returns input-dependent `statements` / `tail` /
  `diagnostics` — not the constant record the header quotes.
- Verified the quoted record shape against `ThetaDocument`
  (src/parser/theta-document.ts:943-964): four fields, including
  `deliveredDiagnostics`, which the header's literal omits.
- Checked this is not already filed: the wave's stub-narration findings cover
  disjoint file sets — `qw20260907183353-d2-07-parser-seam-stub-narration-stale`
  lists functions.ts / imports.ts / invoke-diagnostics.ts / literal-sublanguage.ts /
  match-result.ts / params.ts / query-schema-inference.ts, and
  `qw20260907183353-d2-03-seam-stub-narration-stale-lexer-parser` lists lexer.ts /
  literals.ts / minimal-theta.ts / callable-set.ts / control-flow.ts /
  frontmatter.ts. Neither names src/parser/theta-document.ts.
- Not a deadness claim about any identifier; the narration alone is the subject.
- Git intent: `git log -S "V19a-T (tests-task) declares the AST node shapes"
  --oneline -- src/parser/theta-document.ts` → one commit, the corpus-wide
  rename, consistent with the text never being revisited after the parser
  landed.

## Triage
