---
id: PTQ-1764
title: The b0245 (d) suite promises a single diagnostic while b0245-d2 requires two.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/schema-body-unclosed-at-eof.test.ts:466-467
  - tests/schema-body-unclosed-at-eof.test.ts:481-493
  - tests/schema-body-unclosed-at-eof.test.ts:494-497
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The b0245 (d) suite promises a single diagnostic while b0245-d2 requires two.

## Observation
The `b0245 (d)` suite is named “the neighbouring exits keep their own single diagnostic.” Its `b0245-d2` child instead names both the type refusal and the unclosed body and requires both diagnostics in ordered whole-list comparisons. The child's comment explicitly describes two independent faults. Thus the enclosing name describes a single-diagnostic invariant that this child intentionally contradicts.

## Evidence
`tests/schema-body-unclosed-at-eof.test.ts:466-467`:

```ts
describe("b0245 (d) — the neighbouring exits keep their own single diagnostic", () => {
  it("b0245-d1: `schema S {` (EMPTY captured prefix) keeps `empty-schema-body` alone", () => {
```

`tests/schema-body-unclosed-at-eof.test.ts:481-493`:

```ts
  it("b0245-d2: `schema S { a: string, b:` names BOTH the type refusal and the unclosed body", () => {
    // Two independent faults, so two lines: bug 0061's row judges the empty
    // field-TYPE capture, and the body is separately never closed by `}` —
    // delete the refused type position and the body is still unclosed, so
    // neither verdict is derived from the other. The same pairing `fn f(a:` at
    // EOF draws, where `theta/parse/fn-param-list-unclosed` fires beside the
    // parameter's own refusal. The list order is the diagnostic list's own
    // (file, line, col) order.
    const doc = theta("schema S { a: string, b:");
    expect(triples(doc), `diagnostics=${render(doc)}`).toEqual([
      e(TYPE_NOT_EXPR, "4:1-4:25"),
      e(UNCLOSED, OPEN_BRACE),
    ]);
```

`tests/schema-body-unclosed-at-eof.test.ts:494-497`:

```ts
    expect(quads(doc), "DIAG-4").toEqual([
      q(TYPE_NOT_EXPR, "4:1-4:25", [["<X>", "S"]]),
      q(UNCLOSED, OPEN_BRACE),
    ]);
```

## Why this is a problem
This is the D7 misleading-test-names class. A reader using the enclosing name to interpret this group's contract would conclude that the neighbouring type-refusal exit must retain one diagnostic without an accompanying unclosed-body diagnostic. The existing child requires the opposite: suppressing either line fails its whole-list equality. The discrepancy is between the name and an implemented assertion, not between desired and absent tests.

## Suggested direction (non-binding, optional)
Align the enclosing suite's description with its existing single-diagnostic fences and two-diagnostic co-firing witness; this direction concerns the suite name, not changing its membership or assertions.

## False-positive check
- **Gate-pin:** this is not a gate-file count or inventory assertion. The cited diagnostic lists remain the intended assertions; their pinned sizes are not the smell.
- **Recording-double:** the cited test reads parser diagnostics, not a recording double's MUST-NOT call log. No negative witness is being challenged.
- **docs/bugs/ signature search:** inspected `docs/bugs/0245-unclosed-schema-body-at-eof-loads-clean.md`, including its fixed status at line 3 and co-firing adjudication at lines 498-505. Searching that document for `mid-field|b:|Two independent|two independent|BOTH|both|Status:` locates the documented co-firing decision. That decision supports the child's two-line assertion; this finding does not report an intentional red or request a behaviour change.
- **Coverage-matrix/bug-doc citation search:** `rg -n 'b0245-d2|b0245 \(d\)|neighbouring exits keep their own single diagnostic' docs/reference/coverage-matrix.md docs/bugs` returned no matches. The proposed direction explicitly concerns renaming the enclosing suite; no matching by-name citation was found in those documents, and no child is proposed for merging, renaming, or deletion.
- **History intent:** `git log --oneline -S 'neighbouring exits keep their own single diagnostic' -- tests/schema-body-unclosed-at-eof.test.ts` identifies `6a1a605b`. Reading that commit's test source confirms the same enclosing title was introduced there. The bug record's co-firing adjudication was checked rather than treating the two-line assertion as a defect.
- **Duplicate search:** `rg -l 'neighbouring exits keep their own single diagnostic|b0245-d2' quality/intake quality/issues quality/resolved` before filing returned only `quality/issues/PTQ-1603-0245-fixed-record-names-no-own-witness-file.md`. Its issue is the bug record's missing witness-file pointer, and its title inventory merely quotes this suite name; it does not report this name/body contradiction.
- **Coverage boundary:** no missing test, path, or observable is claimed. This finding concerns only the description of assertions already present in the scoped test source.

## Triage
verdict: confirmed — tests/schema-body-unclosed-at-eof.test.ts:466 promises a single diagnostic, but its b0245-d2 child (:481-497) requires TYPE_NOT_EXPR and UNCLOSED in both whole-list assertions; bug 0245's co-firing adjudication (:498-505) explicitly supports two. The excerpts, history and searches reproduce (excluding the candidate's own new search hit); this is D7 misleading-name drift, with no by-name documentation pin, resolved prescription or same-root duplicate (PTQ-1603 concerns a missing witness pointer). (triage: claude-opus-5-5)
