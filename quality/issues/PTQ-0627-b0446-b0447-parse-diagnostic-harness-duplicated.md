---
id: PTQ-0627
title: b0446 and b0447 each redeclare the same parse/diagLines/codesOf/withCode diagnostic harness b0431 already declared
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0446-nested-export-inert.test.ts:56-83
  - tests/b0447-nested-import-inert.test.ts:49-76
  - tests/b0431-export-in-theta-refused.test.ts:36-63
sites: 3                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0446 and b0447 each redeclare the same parse/diagLines/codesOf/withCode diagnostic harness b0431 already declared

## Observation
`tests/b0431-export-in-theta-refused.test.ts`, `tests/b0446-nested-export-inert.test.ts`
and `tests/b0447-nested-import-inert.test.ts` each declare, module scope, the
same four-function harness for driving `parseThetaDocument` and reading its
diagnostics: a `parse(body, path[, frontmatter])` wrapper that builds the
source string, parses it, and asserts `doc.frontmatter` is not null as a
fail-loud precondition; `diagLines(doc)` rendering `severity code: message`
lines; `codesOf(doc)` mapping to bare codes; and `withCode(doc, code)`
filtering diagnostics by code. b0446 and b0447's four functions are
byte-identical to each other (down to the precondition message text); b0431's
`parse` omits the optional `frontmatter` parameter b0446/b0447 later added,
but its body, `diagLines`, `codesOf` and `withCode` are otherwise the same
declarations. b0446's own header states it is a direct sibling of b0431
("mirroring 0431's export-in-theta parse check") and b0447 states it is "the
import sibling of bug 0446" — the three files are a documented lineage, and
each re-declares the harness rather than sharing it.

## Evidence
tests/b0431-export-in-theta-refused.test.ts:36-63:
```ts
function parse(body: string, path: string): ThetaDocument {
  const source = `${APP_FRONTMATTER}\n${body}`;
  const doc = parseThetaDocument(
    { path, bytes: new TextEncoder().encode(source) },
    parseDeps(),
  );
  // A frontmatter parse failure means the body is never reached — an unmet
  // precondition, not the symptom under test. Fail loudly naming it.
  expect(
    doc.frontmatter,
    `frontmatter must parse or the body is never reached; parse diagnostics: ${JSON.stringify(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  return doc;
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => d.code);
}

function withCode(doc: ThetaDocument, code: string): Diagnostic[] {
  return doc.diagnostics.filter((d) => d.code === code);
}
```

tests/b0446-nested-export-inert.test.ts:56-83 (identical shape, `frontmatter`
parameter added):
```ts
function parse(body: string, path: string, frontmatter: string = APP_FRONTMATTER): ThetaDocument {
  const source = `${frontmatter}\n${body}`;
  const doc = parseThetaDocument(
    { path, bytes: new TextEncoder().encode(source) },
    parseDeps(),
  );
  // A frontmatter parse failure means the body is never reached — an unmet
  // precondition, not the symptom under test. Fail loudly naming it.
  expect(
    doc.frontmatter,
    `frontmatter must parse or the body is never reached; parse diagnostics: ${JSON.stringify(
      doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  return doc;
}

function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

function codesOf(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => d.code);
}

function withCode(doc: ThetaDocument, code: string): Diagnostic[] {
  return doc.diagnostics.filter((d) => d.code === code);
}
```

tests/b0447-nested-import-inert.test.ts:49-76 — byte-identical to the
b0446 excerpt above (same `parse` signature and body, same `diagLines`,
`codesOf`, `withCode`).

## Why this is a problem
Three files across one documented bug lineage (0431 → 0446 → 0447, each
citing the prior as its sibling) each carry their own copy of the same
four-function diagnostic-reading harness rather than sharing one. b0446 and
b0447's copies are byte-identical to each other, including the precondition
failure message text, and diverge from b0431's copy only by the later-added
optional `frontmatter` parameter — a divergence that is itself evidence the
harness was extended in place in each new file instead of once in a shared
location.

## Suggested direction (non-binding, optional)
tests/helpers/ is the natural home for a shared "parseThetaDocument + assert
frontmatter parsed + diagLines/codesOf/withCode" harness the b0431/b0446/b0447
lineage (and any future sibling in this bug family) could import instead of
redeclaring.

## False-positive check
Gate-pin: none of the three files match `*gate*.test.ts` or kin. Recording-double:
`withCode`/`codesOf`/`diagLines` are read-only diagnostic projections, not
call-recording MUST-NOT witnesses — the carve-out does not apply.
docs/bugs/ search: grepped "diagLines" and "codesOf" across docs/bugs/ — no
hit; not a documented correct-reason red. coverage-matrix/bug-doc citation
search: grepped the three test file names across
docs/reference/coverage-matrix.md and docs/bugs/*.md — each bug's own doc
(0431, 0446, 0447) names its own witness test file, but none names the
harness functions themselves or asks that the files be merged; this finding
proposes no merge/rename/delete of any of the three tests, only sharing the
harness they each redeclare.

## Triage
verdict: confirmed — independently re-verified: all three excerpts reproduce at the cited lines; sed-extracted b0446:56-83 and b0447:49-76 diff as byte-identical and b0431:36-63 differs only in the two `parse` signature/source lines (optional `frontmatter` param); the fail-loud precondition message and the `withCode(doc, code): Diagnostic[]` declaration grep to exactly these three files (the 0431→0446→0447 lineage, per their own headers), so this is D7 copy-paste harness duplication confined to tests/; carve-outs inapplicable (no *gate* file, read-only projections not recording doubles, no merge/rename/delete of a coverage-matrix/bug-doc witness — docs/bugs grep for the helper names hits only unrelated bug prose); tests/helpers/e2e-s1.ts exports diagLines (PTQ-0205 fixed the definition site only, these local copies were never migrated) but has no `withCode`/order-preserving `codesOf`/frontmatter-precondition `parse` counterpart (its `codes` sorts+dedupes, which b0447's `.length`-based exactly-one asserts depend on not doing), so the root cause is distinct from fixed PTQ-0205 and is a fresh instance of the class confirmed in PTQ-0239/PTQ-0386 for other lineages; all 24 tests in the three files pass (triage: claude-fable-5-1)
