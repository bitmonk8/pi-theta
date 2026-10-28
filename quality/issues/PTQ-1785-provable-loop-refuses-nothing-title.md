---
id: PTQ-1785
title: The e4ctl test says it refuses nothing while requiring a discarded-query-result error.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/loop-element-withhold-binding-scoped.test.ts:168-169
  - tests/loop-element-withhold-binding-scoped.test.ts:893-902
  - tests/helpers/load-row-harness.ts:215-218
  - tests/helpers/load-row-harness.ts:262-275
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The e4ctl test says it refuses nothing while requiring a discarded-query-result error.

## Observation
Cell e4ctl is named “a PROVABLE loop over a non-`Result` element refuses nothing.” Its body requires exactly one `theta/parse/discarded-query-result` diagnostic and pins that error's location. The whole-list helper makes zero diagnostics fail this cell. The cell remains a negative witness for `interpolated-result`, but its name does not limit “nothing” to that diagnostic.

## Evidence
`tests/loop-element-withhold-binding-scoped.test.ts:168-169`:
```ts
const DISCARDED = "theta/parse/discarded-query-result";
const DISCARDED_MESSAGE = registered(DISCARDED);
```

`tests/loop-element-withhold-binding-scoped.test.ts:893-902`:
```ts
  it("PIN e4ctl [CTL]: a PROVABLE loop over a non-`Result` element refuses nothing", () => {
    expectRow({
      label: "e4ctl [CTL provable loop]",
      src: "let ys: array<integer> = [1, 2]\nfor b in ys {\n  @`x${b}`\n}\n1\n",
      sites: ["let ys@4:1-4:32", "for b@5:10-5:12"],
      expected: one(DISCARDED, DISCARDED_MESSAGE),
      located: [`error ${DISCARDED} @6:3-6:11`],
      reason:
        "the discrimination: an annotated iterand is a proof, so no copy is taken and no provenance exists to carry — the carry fires only where the copied object already carried the membership, which is why it can restore no verdict beyond that object's own and can add no emission",
    });
```

The existing helper establishes what that expected contract asserts, rather than being another smell site. `tests/helpers/load-row-harness.ts:215-218`:
```ts
/** A one-diagnostic contract. */
export function one(code: string, message: string): Expectation {
  return { codes: [code], msgs: [message] };
}
```

`tests/helpers/load-row-harness.ts:262-275`:
```ts
export function expectSiteRow(row: SiteRow, driver: SiteRowDriver): ThetaDocument {
  const doc = parseDoc((row.frontmatter ?? driver.frontmatter) + row.src, driver.file);
  expect(
    driver.sitesOf(doc),
    `${row.label} PRECONDITION: ${driver.sitesClaim} Diagnostics: ${render(doc)}`,
  ).toEqual([...row.sites]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.code),
    `${row.label} — ${row.reason}\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.codes]);
  expect(
    doc.diagnostics.map((d: Diagnostic) => d.message),
    `${row.label} — DIAG-4 (diagnostic-shape.md:74): the rendered messages are the registry *Message* column interpolated\n  actual diagnostics: ${render(doc)}`,
  ).toEqual([...row.expected.msgs]);
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader taking “refuses nothing” as the cell's outcome would infer that this fixture is accepted without a parse refusal; the actual contract requires an error and fails if the diagnostic list is empty. This does not dispute the intentional QRY-19 error or the absence of the separate interpolation error.

## False-positive check
- Gate-pin check: this cell is not a corpus-count or inventory gate. Its expected diagnostic and location remain unchallenged.
- Recording-double check: this is an actual parser diagnostic list, not a recording double. The negative witness excluding `interpolated-result` remains legitimate; only the unqualified name is at issue.
- docs/bugs/ signature check: docs/bugs/0511-qry19-stmtblock-tail-single-vs-multi.md:365-369 explicitly records adding QRY-19 to e4ctl while retaining its exclusion of the interpolation refusal. `git show 19b4fcc5 -- tests/loop-element-withhold-binding-scoped.test.ts` confirms `expected: CLEAN` became `one(DISCARDED, DISCARDED_MESSAGE)` with a located error while the title stayed unchanged. This is not a report against a documented correct-reason red or an argument to undo bug 0511.
- Coverage-matrix/bug-doc citation search: `rg -n 'loop-element-withhold-binding-scoped|e4ctl' docs/reference/coverage-matrix.md docs/bugs/0194-unprovable-marking-by-object-identity-shared-alias-element.md docs/bugs/0199-let-arm-marks-borrowed-object-suppression.md docs/bugs/0511-qry19-stmtblock-tail-single-vs-multi.md` found no coverage-matrix match. Bug 0194:951-963 cites the witness file and group (e); bug 0199:235-238 cites this file's group (e); bug 0511:365-369 names e4ctl's coordinated outcome. This is a name-correction finding, so any eventual retitling must account for those citations and retain the e4ctl witness identity; no merge or deletion is proposed.
- Duplicate check: `rg -n 'e4ctl.*(refuses nothing|misleading|title)|refuses nothing.*e4ctl' quality/issues quality/resolved quality/intake` returned no matches before filing.
- Scope check: this concerns an existing test name and its existing asserted outcome, not a missing test, suite composition, production behavior, or coverage.

## Triage
verdict: confirmed — e4ctl's unqualified “refuses nothing” title contradicts its whole-list contract requiring one discarded-query-result error at 6:3-6:11; commit 19b4fcc5 and bug 0511 verify the CLEAN-to-error change without retitling. The coordination comment does not cure this superseded title under the D7 precedent; bug-doc citations are acknowledged, e4ctl's identity must remain, and no duplicate or resolved prescribed-title exemption was found. (triage: claude-opus-5-5)
