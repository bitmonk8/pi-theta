---
id: PTQ-1766
title: The two import-production suites redeclare the statement-refusal assertion harness.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/import-export-from-clause-required.test.ts:166-194
  - tests/import-specifier-list-production-required.test.ts:248-282
sites: 2
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The two import-production suites redeclare the statement-refusal assertion harness.

## Observation
The two scoped import-production suites each declare `expectStatementRefusal`, with the same diagnostic-selection and assertion sequence. Both filter by their local `CODE`, require exactly one result, check its error disposition, require a range starting at column 1, require an end column of at least 7, and compare the message with their registry-backed reader. The second version additionally checks `isRegistrationError`, accepts the expected line as an argument, and casts the range explicitly; the explanatory messages and diagnostic codes are specific to each bug. The existing `tests/helpers/thetalib-load-harness.ts` is the natural shared home for this import-family assertion harness, as an observation rather than a prescribed implementation.

## Evidence
The count is **two scoped statement-refusal harness declarations**. Exact search: `rg -n '^function expectStatementRefusal\(' tests/import-export-from-clause-required.test.ts tests/import-specifier-list-production-required.test.ts` returned two hits, at lines 166 and 248 respectively. The comparison is near-identical rather than byte-identical: the extra registration assertion, line argument, range cast, code/message readers, and explanatory text are the differences.

**Instance 1 — `tests/import-export-from-clause-required.test.ts:166-176`:**

```ts
function expectStatementRefusal(label: string, doc: ThetaDocument): void {
  const hits = withCode(doc.diagnostics, CODE);
  expect(
    hits.length,
    `${label}: expected the parse to emit exactly one ${CODE}. imports.md :29 defines one re-export form and spells it \`from\`-bearing (:32, :33), and grammar.md :3 leaves the surface to that page, so a specifier list with no \`from\` clause and no path literal is a shape the language does not define. Rendered diagnostics: ${JSON.stringify(diagLines(doc.diagnostics))}`,
  ).toBe(1);
  const diagnostic = hits[0] as Diagnostic;
  expect(
    diagnostic.severity,
    `${label}: severity E — the refusal un-registers the file, and only an error-severity \`theta/parse/\` code reaches the load pass' registration drop (src/extension/import-static-checks.ts:180)`,
  ).toBe("error");
```

**Instance 1 continued — `tests/import-export-from-clause-required.test.ts:177-189`:**

```ts
  const range = diagnostic.range;
  expect(
    range,
    `${label}: a \`theta/parse/*\` row is a located site (diagnostics/diagnostic-shape.md), so the diagnostic carries a range; observed ${JSON.stringify(diagnostic)}`,
  ).toBeDefined();
  expect(
    (range as { start: { line: number; column: number } }).start,
    `${label}: §Fix constraint 1 — the refusal is the STATEMENT's, so the range starts at the \`import\` / \`export\` keyword, not at a specifier`,
  ).toEqual({ line: 1, column: 1 });
  expect(
    (range as { end: { column: number } }).end.column,
    `${label}: the range spans at least the statement keyword (six characters, end column exclusive)`,
  ).toBeGreaterThanOrEqual(7);
```

**Instance 1 continued — `tests/import-export-from-clause-required.test.ts:190-194`:**

```ts
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's *Message* column verbatim`,
  ).toBe(missingFromMessage());
}
```

**Instance 2 — `tests/import-specifier-list-production-required.test.ts:248-262`:**

```ts
function expectStatementRefusal(label: string, doc: ThetaDocument, line: number): void {
  const hits = withCode(doc.diagnostics, CODE);
  expect(
    hits.length,
    `${label}: expected exactly one ${CODE}. imports.md:37–38 make braces and at least one specifier mandatory on both declarations, and grammar.md:3 leaves the surface to that page, so a statement with no specifier list — or one that produced zero specifiers — is a shape the language does not define. Rendered diagnostics: ${JSON.stringify(diagLines(doc.diagnostics))}`,
  ).toBe(1);
  const diagnostic = hits[0] as Diagnostic;
  expect(
    diagnostic.severity,
    `${label}: severity E — the refusal un-registers the file, and only an error-severity \`theta/parse/\` code reaches the load pass' registration drop (src/extension/import-static-checks.ts:191)`,
  ).toBe("error");
  expect(
    isRegistrationError(diagnostic),
    `${label}: the disposition is a registration drop, on the same two properties the load pass reads`,
  ).toBe(true);
```

**Instance 2 continued — `tests/import-specifier-list-production-required.test.ts:263-277`:**

```ts
  const range = diagnostic.range as
    | { start: { line: number; column: number }; end: { line: number; column: number } }
    | undefined;
  expect(
    range,
    `${label}: a \`theta/parse/*\` row is a located site (diagnostics/diagnostic-shape.md), so the diagnostic carries a range; observed ${JSON.stringify(diagnostic)}`,
  ).toBeDefined();
  expect(
    (range as { start: { line: number; column: number } }).start,
    `${label}: §Fix constraint 2 — an absent or zero-specifier list is a STATEMENT-level fact, so the range starts at the \`import\` / \`export\` keyword, exactly like ${MISSING_FROM_CODE}'s — both read the one shared statement range (src/parser/theta-document.ts:3107)`,
  ).toEqual({ line, column: 1 });
  expect(
    (range as { end: { column: number } }).end.column,
    `${label}: the range spans at least the statement keyword (six characters, end column exclusive)`,
  ).toBeGreaterThanOrEqual(7);
```

**Instance 2 continued — `tests/import-specifier-list-production-required.test.ts:278-282`:**

```ts
  expect(
    diagnostic.message,
    `${label}: DIAG-4 — the rendered message is the registry row's *Message* column verbatim`,
  ).toBe(malformedListMessage());
}
```

## Why this is a problem
This is D7 **boilerplate duplication** in an assertion harness, not a claim that either assertion is ineffective. The count, diagnostic extraction, disposition check, range-presence check, statement-start check, minimum-end check, and registry-message comparison are maintained as two separate sequences. The literal minimum end column, range-presence assertion, and registry-message assertion are repeated verbatim, while the contract-specific inputs and explanation differ. The duplication is in the checking machinery rather than in the decision to retain separate bug witnesses.

## False-positive check
- **Gate-pin:** neither scoped file is a census/pin gate. The reported code is the repeated refusal checker, not either suite's expected diagnostic counts or registry pins; no pin is challenged.
- **Recording-double:** these functions read parsed diagnostics and contain no recording double or MUST-NOT call witness. No negative recording assertion is challenged.
- **docs/bugs/ signature search:** `rg -n 'expectStatementRefusal' docs/bugs/` returned no hits. The bug records were also read: `docs/bugs/0058-fromless-export-form-parses-without-spec-production.md:272-279` describes the offline refusal lock, and `docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md:779-791` describes its statement/specifier and downstream locks. This report does not treat the historical `RED` labels, a disabled test, or a current failure as a smell; the duplicated checker is present irrespective of test outcome.
- **Coverage-matrix/bug-doc citations:** `rg -n 'import-export-from-clause-required|import-specifier-list-production-required|expectStatementRefusal' docs/reference/coverage-matrix.md` returned no hits. Searching both file basenames in `docs/bugs/` found witness citations, including the two lock passages above and `docs/bugs/0431-theta-hosted-export-from-wholly-inert.md`. No test merge, rename, or deletion is proposed; those cited witnesses and their individual assertions remain the subject of their own contracts.
- **Existing-topic check:** searched `expectStatementRefusal` and `expectSpecifierRefusal` across `quality/issues`, `quality/resolved`, and `quality/intake` before filing. Existing mentions in PTQ-1482, PTQ-1349, and PTQ-1395 are contextual; those reports target the parse/frontmatter bundle, registry read, and normative-message wrapper respectively, not this statement-refusal assertion sequence.
- **Intent/history check:** `git log --oneline -S 'function expectStatementRefusal' -- tests/import-export-from-clause-required.test.ts tests/import-specifier-list-production-required.test.ts` returned the separate bug-0058 and bug-0100 introduction commits. The current implementations' bug-specific messages and the second version's additional assertion are explicitly retained as differences in this report, rather than represented as identical code.
- **Scope:** both occurrences are under `tests/`. This finding concerns code that exists and makes no coverage, suite-composition, runtime-risk, or production-behaviour claim.

## Triage
verdict: confirmed — Both cited live helpers reproduce the same diagnostic-selection, count, severity, range-presence, statement-start, minimum-end and registry-message assertion sequence; the reported line/code/message differences and extra registration check are accurate. Stated searches and introduction history reproduce. This is D7 boilerplate duplication, not a challenge to witness contracts; no carve-out applies, and resolved PTQ-1482/PTQ-1349/PTQ-1395 cover distinct helpers without prescribing these local assertion harnesses. (triage: claude-opus-5-5)
