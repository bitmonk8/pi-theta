---
id: PTQ-0796
title: capturedQuerySchema in inline-object-field-name-comparison-key.test.ts duplicates inline-object-type-source-capture.test.ts's function of the same name
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/inline-object-field-name-comparison-key.test.ts:285-299
  - tests/inline-object-type-source-capture.test.ts:382-395
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# capturedQuerySchema in inline-object-field-name-comparison-key.test.ts duplicates inline-object-type-source-capture.test.ts's function of the same name

## Observation
`tests/inline-object-field-name-comparison-key.test.ts` declares a local
`capturedQuerySchema(type: string): string` that parses a `@<T>` query
annotation fixture, asserts the parsed statement is a `let` binding whose
initialiser is a `query` expression, and returns `QueryExpr.schema` off the
AST. `tests/inline-object-type-source-capture.test.ts` declares a function of
the identical name performing the identical sequence of parses and
assertions. Neither file imports the other's copy, and no `tests/helpers/`
module exports this AST-capture helper.

## Evidence

`tests/inline-object-field-name-comparison-key.test.ts:285-299`:
```ts
function capturedQuerySchema(type: string): string {
  const doc = parseDoc(annotSrc(type), "bug0159.theta");
  const stmt = doc.body.statements[0];
  expect(
    stmt?.kind,
    `the @<T> fixture's first statement must be the \`let r = @<T>\` binding; source=${JSON.stringify(annotSrc(type))}`,
  ).toBe("let");
  const init = (stmt as LetStmt).init;
  expect(init?.kind, "that binding's initialiser must be the query expression").toBe("query");
  const schema = (init as QueryExpr).schema;
  expect(typeof schema, "the query expression must carry its `@<T>` annotation text").toBe(
    "string",
  );
  return schema as string;
}
```

`tests/inline-object-type-source-capture.test.ts:382-395` (same body: only the
default fixture path literal `"bug0159.theta"` vs `"bug0228.theta"` and one
extracted `src` local differ):
```ts
function capturedQuerySchema(type: string): string {
  const src = annotSrc(type);
  const doc = parseDoc(src, "bug0228.theta");
  const stmt = doc.body.statements[0];
  expect(
    stmt?.kind,
    `the @<T> fixture's first statement must be the \`let r = @<T>\` binding; source=${JSON.stringify(src)}`,
  ).toBe("let");
  const init = (stmt as LetStmt).init;
  expect(init?.kind, "that binding's initialiser must be the query expression").toBe("query");
  const schema = (init as QueryExpr).schema;
  expect(typeof schema, "the query expression must carry its `@<T>` annotation text").toBe("string");
  return schema as string;
}
```

Exact search: `grep -rn "the query expression must carry its" tests --include="*.test.ts"` returns exactly these two lines (comparison-key.test.ts:295 and type-source-capture.test.ts:393); `grep -rln "capturedQuerySchema" tests --include="*.ts"` returns exactly the same two files. No `tests/helpers/*.ts` file defines `capturedQuerySchema`.

## Why this is a problem
The two function bodies perform the identical four-step AST navigation
(parse, assert the statement is a `let`, assert its `init` is a `query`
expression, read and type-check `QueryExpr.schema`) with the identical three
assertion messages, differing only in one fixture-path string literal and
whether the intermediate parsed source is bound to a named local. Each file
maintains its own copy of this AST-shape-dependent navigation; a change to
`QueryExpr`'s shape (e.g. renaming `.schema` or `.init`) would need the
identical edit applied at both sites by hand.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module exporting `capturedQuerySchema(type: string, path?:
string): string` is the natural home the two byte-identical (bar one string
literal) copies point at; the fix stage owns which module becomes that home.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate-kin
  patterns (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `capturedQuerySchema` parses a fresh document and
  reads a field off its own AST; it records no call and backs no "never
  called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "capturedQuerySchema" docs/bugs/*.md`
  returns no hits — no documented correct-reason red names this function or
  states a rationale for two independent copies.
- coverage-matrix/bug-doc citation search: `grep -n
  "inline-object-field-name-comparison-key\|inline-object-type-source-capture"
  docs/reference/coverage-matrix.md` returns no hits. Both files are cited by
  name in several docs/bugs/ witness lists (0159, 0160, 0161, 0176, 0228,
  0229, 0230, 0231, 0233, 0235, 0237, 0244), but always for the diagnostic-
  emission or lowering behaviour under test, never for where
  `capturedQuerySchema`'s own AST-navigation code lives. This finding proposes
  no merge, rename, or deletion of either file or any `it()`/`describe()` —
  only that the duplicated helper function could be shared — so no cited
  witness is disturbed.
- Coverage check: the claim is about a repeated helper-function DEFINITION,
  not a missing test path; both copies are exercised by the tests in their
  own file today.
- Prior-filing overlap check: `grep -rl "capturedQuerySchema"
  quality/intake quality/issues quality/resolved` (before this filing)
  returned no hits; PTQ-0596 and PTQ-0475, the two other tracked findings
  citing `inline-object-type-source-capture.test.ts`, address a different
  harness (`expectGroup`) and a different registry-read duplication
  respectively, neither naming `capturedQuerySchema`.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/inline-object-field-name-comparison-key.test.ts:285-299 and tests/inline-object-type-source-capture.test.ts:382-395; sed-extracted bodies diffed after normalising the fixture-path literal differ only in the extracted `src` local and prettier line-wrapping (same three assertion messages, same parse→let→query→schema navigation); both copies are live (3 and 2 in-file call sites at :760/:1055/:1085 and :760/:792), neither file imports the other (type-source-capture.test.ts:270-272 explicitly says it copies "the vocabulary of the landed siblings" — acknowledged copy, no rationale for independence); stated searches reproduce (assertion-message grep → exactly 2 lines, identifier grep across tests/src/extensions/tools → exactly these 2 files, no tests/helpers export, docs/bugs 0 hits, coverage-matrix 0 hits); both under tests/, D7 boilerplate-duplication class, not a gate file, no recording-double/red-test carve-out, no merge/rename/delete proposed; not a duplicate — PTQ-0751/d7-70 inventory the FM/TAIL/body/annotSrc fixture builders (which this helper consumes) but not the `capturedQuerySchema` AST-navigation helper, PTQ-0640 is a different `capturedSchemas()` helper in unrelated files, PTQ-0475/0596/0750 cite type-source-capture for registry-read/expectGroup harnesses, and the same-wave sibling d7-01-…-registrymessageof names `capturedQuerySchema` only to exclude it from its own scope; fixer should route the shared home alongside PTQ-0751's since the helper depends on `annotSrc` (triage: claude-fable-5-1)
