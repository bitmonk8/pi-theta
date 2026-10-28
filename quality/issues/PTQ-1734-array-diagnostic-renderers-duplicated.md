---
id: PTQ-1734
title: The two array test files redeclare the same diagnostic failure-payload renderer.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/array-sink-unresolvable-deferral.test.ts:240-243
  - tests/array-ternary-common-type-union.test.ts:237-242
  - tests/helpers/e2e-s1.ts:450-456
sites: 2
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The two array test files redeclare the same diagnostic failure-payload renderer.

## Observation
The two array test files each define a local `render(doc)` that maps the entire diagnostic list to `severity code: message` strings and JSON-serializes the resulting array. The two implementations differ only in formatting and an explicit callback parameter type. The shared `tests/helpers/e2e-s1.ts` already exports the same diagnostic-to-string-array mapping as `diagLines`; JSON serialization is the additional operation in each local renderer.

## Evidence
The repetition count is two local renderer definitions in the reviewed files; both counted sites follow.

`tests/array-sink-unresolvable-deferral.test.ts:240-243`:
```ts
/** The whole diagnostic list, rendered for failure text. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`));
}
```

`tests/array-ternary-common-type-union.test.ts:237-242`:
```ts
/** Every diagnostic rendered `severity code: message` — the failure payload. */
function render(doc: ThetaDocument): string {
  return JSON.stringify(
    doc.diagnostics.map((d: Diagnostic) => `${d.severity} ${d.code}: ${d.message}`),
  );
}
```

Existing shared mapping, `tests/helpers/e2e-s1.ts:450-456` (helper evidence, not a third counted local definition):
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(
  source: ThetaDocument | FrontmatterParseResult | readonly Diagnostic[],
): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

## Why this is a problem
This is D7 boilerplate duplication in the diagnostic-assertion harness: the same whole-list failure-payload transformation is maintained in two test files, including a diagnostic formatting operation already maintained by their shared test-helper module. Neither local implementation contains a fixture-specific filter, ordering rule, or field selection that distinguishes it from the other. The observation concerns repeated existing harness code, not the number or reach of the test cells.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` is the existing shared home for the diagnostic-list formatting operation; the local JSON serialization does not change that operation's semantics.

## False-positive check
- Gate-pin check: neither counted file is a census/pin gate, and the cited code formats failure text rather than asserting a pinned inventory or count.
- Recording-double check: neither renderer is a recording double or a MUST-NOT witness. No negative assertion is challenged.
- docs/bugs/ signature search: searched `docs/bugs/` for both file basenames. Their originating reports, `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md` and `docs/bugs/0081-array-ternary-common-type-never-unions.md`, both have fixed status. This finding does not challenge the historical RED labels or assert that a test is disabled or failing; it concerns only the two quoted renderer definitions.
- Coverage-matrix/bug-doc citation search: `rg -n 'array-sink-unresolvable-deferral|array-ternary-common-type-union' docs/reference/coverage-matrix.md docs/bugs/` found no coverage-matrix entry and did find bug-doc witness citations, including reports 0081, 0179, 0155 and 0156. No test, file, or test name is proposed for merging, renaming, or deletion; those witness identities remain outside this finding.
- Existing-finding check: searched `quality/issues`, `quality/resolved`, and `quality/intake` for both file basenames and read the matching parse-harness and registry-read findings PTQ-0214, PTQ-0411 and PTQ-0972. Those findings concern parser doubles or registry acquisition, not the quoted diagnostic failure-payload renderer.
- Intent/history check: `git log -1 --format='%h %s' -S 'export function diagLines(' -- tests/helpers/e2e-s1.ts` identifies `2594cd44 quality: qw20260911104855 fix tests__p1` as the shared mapping's introduction. The current quoted implementations retain the same full diagnostic list and field spelling; no intentional fixture-specific divergence is claimed.
- Coverage boundary: this finding identifies only duplication in test code that exists. It makes no claim that a behavior or execution path needs another test, and proposes no behavior change.

## Triage
verdict: confirmed — Both live renderers reproduce at the cited lines and perform the identical unfiltered diagnostic mapping already exported by diagLines, followed by JSON serialization; this is D7 boilerplate duplication wholly under tests/, with no applicable carve-out, duplicate finding, or resolved prescription for these renderer bodies. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
