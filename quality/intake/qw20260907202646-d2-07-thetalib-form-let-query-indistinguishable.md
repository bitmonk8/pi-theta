---
id: pending
title: thetalibFormOf maps `let` and `query` statements to their own ThetaLibTopLevelForm discriminants, but the sole consumer treats them exactly as "statement"
lens: D2
status: intake
verdict: pending
locations:
  - src/parser/theta-document.ts:1568-1589
  - src/parser/theta-document.ts:1597-1619
  - src/parser/imports.ts:45-87
sites: 2
fix_scope: cross-module
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# thetalibFormOf maps `let` and `query` statements to their own ThetaLibTopLevelForm discriminants, but the sole consumer treats them exactly as "statement"

## Observation
`thetalibFormOf` classifies a top-level `.thetalib` statement into eight
`ThetaLibTopLevelForm` values. Three of them are non-permitted: `"let"`,
`"query"` and `"statement"`. The only thing any of the three is used for is the
`checkThetaLibTopLevelForm` call two functions below, and that function's whole
body is a membership test against the five permitted forms followed by one
diagnostic literal — so `"let"`, `"query"` and `"statement"` produce the
byte-identical diagnostic. No other production code constructs or reads a
`ThetaLibTopLevelForm`.

## Evidence
src/parser/theta-document.ts:1568-1589 — the three-way split among
non-permitted forms:

```ts
function thetalibFormOf(stmt: Stmt): ThetaLibTopLevelForm | null {
  switch (stmt.kind) {
    case "import":
      return "import";
    case "export":
      return "export";
    case "schema":
      return "schema";
    case "enum":
      return "enum";
    case "fn":
      return "fn";
    case "let":
      return "let";
    case "query":
      return "query";
    case "doc-comment":
      return null;
    default:
      return "statement";
  }
}
```

src/parser/theta-document.ts:1599-1608 — the only place the classification is
consumed; the value is passed straight through with no further branching:

```ts
  for (const stmt of block.statements) {
    const form = thetalibFormOf(stmt);
    if (form === null) {
      continue;
    }
    const diag = checkThetaLibTopLevelForm(form, { file, range: stmt.range });
    if (diag !== undefined) {
      diagnostics.push(diag);
    }
  }
```

src/parser/imports.ts:56-87 — the consumer: a set membership test, then one
fixed diagnostic for every non-member, so the three non-permitted discriminants
are indistinguishable in the output:

```ts
const PERMITTED_THETALIB_TOP_LEVEL_FORMS: ReadonlySet<ThetaLibTopLevelForm> = new Set([
  "import",
  "export",
  "schema",
  "enum",
  "fn",
]);
```

```ts
  if (PERMITTED_THETALIB_TOP_LEVEL_FORMS.has(form)) {
    return undefined;
  }
  return {
    severity: "error",
    code: THETALIB_TOP_LEVEL_STATEMENT_CODE,
    file: site.file,
    range: site.range,
    message: THETALIB_TOP_LEVEL_STATEMENT_MESSAGE,
    hint: THETALIB_TOP_LEVEL_STATEMENT_HINT,
  };
```

## Why this is a problem
Speculative generality in a discriminated set: two of the eight discriminants
exist to distinguish cases that no consumer distinguishes, so the classification
is finer than any user of it. `thetalibFormOf`'s own doc already collapses them
in prose ("a `let` binding, a bare query, and any other statement are
non-permitted"), which is exactly the tri-partition the code then re-expands
into three separate return values. A reader of the `case "let"` / `case "query"`
arms has to walk to a second module to discover the arms select nothing.

## Suggested direction (non-binding, optional)
Either collapse the non-permitted arms to the one value the consumer can act on,
or give the two discriminants an observable effect at the consumer.

## False-positive check
- Type and function search across production and tests: `grep -rn
  "checkThetaLibTopLevelForm\|thetalibFormOf\|ThetaLibTopLevelForm" src
  extensions tools tests --include=*.ts` → the type declaration
  (imports.ts:45), the permitted set (imports.ts:56), the checker
  (imports.ts:72-73), the import and use in theta-document.ts (43, 54, 1562,
  1568, 1600, 1610), and six test references (tests/imports.test.ts:6, 43, 155,
  167, 171, 179). No other production reader exists.
- Tests are not the only callers and this is not a deadness claim:
  `thetalibFormOf` is live production code reached from `checkThetaLibTopLevel`
  (theta-document.ts:1600), which `parseThetaDocument` calls for every
  `.thetalib` (theta-document.ts:1355-1357). The claim is that two of its return
  values are indistinguishable downstream.
- The test references do not discriminate either: tests/imports.test.ts:167 and
  :171 call `checkThetaLibTopLevelForm("let", …)` / `("query", …)` and assert
  the same non-permitted outcome as `("statement", …)` at :155, so no test
  observes a difference between the three.
- String-keyed / dynamic access: `grep -rn "\"thetalibFormOf\"" src extensions
  tools tests --include=*.ts` → no hits; the function is module-private (no
  `export` at theta-document.ts:1568).
- Re-exports: `src/parser` has no barrel file (`ls src/parser` lists leaf
  modules only), so `ThetaLibTopLevelForm` reaches consumers only through the
  direct import at theta-document.ts:54.

## Triage
verdict: questionable — facts reproduce exactly (one production consumer, set-membership only, identical diagnostic for all three non-permitted forms), but the anchor is taste not proven cruft: the union mirrors imports.md:13's own three-way enumeration of non-permitted forms, tests/imports.test.ts:165-174 deliberately witnesses each named category, and git shows the arms landing with the feature rather than as scaffolding (triage: claude-opus-5)
