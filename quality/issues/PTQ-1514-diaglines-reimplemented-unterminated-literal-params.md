---
id: PTQ-1514
title: unterminated-literal-params-type-refusal.test.ts redeclares diagLines byte-for-byte instead of importing the e2e-s1 export it sits next to
lens: D7
status: open
verdict: confirmed
locations:
  - tests/unterminated-literal-params-type-refusal.test.ts:231-234
  - tests/helpers/e2e-s1.ts:447-454
sites: 1
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# unterminated-literal-params-type-refusal.test.ts redeclares diagLines byte-for-byte instead of importing the e2e-s1 export it sits next to

## Observation
`tests/unterminated-literal-params-type-refusal.test.ts` imports `expectGroup as expectGroupShared`, `DiagnosticCell` and `parseDoc` from `./helpers/e2e-s1` (line 9). That same module exports `diagLines`, a function with the identical doc comment and identical body as the local `diagLines` this file declares a few lines later. The file's own `lines()` helper (which every diagnostic-comparison cell in the file routes through) calls the local copy rather than the imported one.

## Evidence
tests/unterminated-literal-params-type-refusal.test.ts:231-234:
```
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

tests/helpers/e2e-s1.ts:447-454, the canonical export from the module this file already imports from:
```
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(
  source: ThetaDocument | FrontmatterParseResult | readonly Diagnostic[],
): string[] {
  const diags = "diagnostics" in source ? source.diagnostics : source;
  return diags.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```
The comment ("Every diagnostic rendered `<severity> <code>: <message>`, in emission order.") and the map body (`${d.severity} ${d.code}: ${d.message}`) are byte-identical between the two; the exported version is a strict superset, additionally accepting a `FrontmatterParseResult` or a raw diagnostic array where the local copy only accepts a `ThetaDocument` — exactly the one shape the local copy's only caller (`lines(src, path)`, this file) passes it.

## Why this is a problem
The rendering rule that turns a diagnostic into the `severity code: message` string every group-cell assertion in this file compares against is written out twice — once in the shared helper module this file already imports three other exports from, and once again locally, with the same comment copied verbatim. A future change to the rendering rule (e.g. widening it to include the diagnostic's code namespace) applied to the exported `diagLines` would silently miss this file's comparisons, because they route through the local copy instead.

## Suggested direction (non-binding, optional)
The local `diagLines` declaration could be dropped and `diagLines` added to the existing `./helpers/e2e-s1` import list; the file's own `lines()` wrapper would call the imported function unchanged.

## False-positive check
- Gate-pin: the file is not `*gate*.test.ts` and asserts no pinned count/inventory over the rendering helper; the carve-out does not apply.
- Recording-double: `diagLines` renders diagnostics for comparison, not a recording double witnessing an absence of calls; the carve-out does not apply.
- docs/bugs/ search: `grep -ril "0232" docs/bugs/` finds docs/bugs/0232-unterminated-literal-params-type-drops-inline-fields.md, which documents the parser defect under test and says nothing about this rendering helper; no correct-reason-red citation covers it.
- coverage-matrix/bug-doc citation search: `grep -rn "unterminated-literal-params-type-refusal" docs/reference/coverage-matrix.md docs/bugs/*.md` finds no citation of this file's local `diagLines` by name.
- Not a coverage claim: the rendering already exists and is used by every group-cell assertion in the file; the finding is about the duplicated declaration, not about a missing test.

## Triage
<!-- appended by triage -->
verdict: confirmed — reproduced: tests/unterminated-literal-params-type-refusal.test.ts:231-234 declares a local `diagLines(doc: ThetaDocument)` with the same doc comment and the same `${d.severity} ${d.code}: ${d.message}` body as the exported `diagLines` at tests/helpers/e2e-s1.ts:447-454, which accepts a superset of inputs. The file already imports three names from e2e-s1 (line 9), and its only caller, `lines()` at :236-237, passes a ThetaDocument. So this is D7 boilerplate duplication with a mechanical fix: drop the local copy and add `diagLines` to the import. No gate or recording-double carve-out applies. docs/bugs/0232 and coverage-matrix do not cite this helper. Not a duplicate: open PTQ-1476 covers TAIL/body/annotSrc in this file, not diagLines, and resolved PTQ-1378 covered msg() (triage: claude-opus-5-5)
