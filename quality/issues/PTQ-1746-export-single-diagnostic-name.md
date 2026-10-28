---
id: PTQ-1746
title: The reserved-keyword w3 test promises a single diagnostic but requires two.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:737-745
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:232-234
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The reserved-keyword w3 test promises a single diagnostic but requires two.

## Observation
The w3 test name says that `export { let as x } from …` reports “the same single diagnostic.” Its body compares the complete rendered diagnostic list with a two-element array. The adjacent comment explicitly identifies the additional entry as bug 0431's `export-in-theta` diagnostic. The current name therefore states a diagnostic count that the assertion rejects.

## Evidence
`tests/reserved-keyword-remaining-identifier-positions.test.ts:737-745`:
```ts
  it("w3: `export { let as x } from …` reports the same single diagnostic", () => {
    // Bug 0431 §Fix Option 1: this statement is also a from-bearing `.theta`
    // top-level export, so it additionally co-emits export-in-theta, sorted
    // first by `assembleDiagnostics`' (file,line,col) order.
    expect(lines(theta('export { let as x } from "./lib.thetalib"\n1\n'))).toEqual([
      exportInThetaAt(4, 42),
      reservedAt("let", 4, IMPORT_BARE_COL),
    ]);
  });
```

`tests/reserved-keyword-remaining-identifier-positions.test.ts:232-234` — the additional expected entry is a rendered diagnostic string:
```ts
function exportInThetaAt(line: number, endColumn: number): string {
  return at(EXPORT_IN_THETA_CODE, msg(EXPORT_IN_THETA_CODE, []), line, 1, endColumn);
}
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the name would take a passing w3 as evidence that the export form produces only one diagnostic. Mechanically, a one-element diagnostic list cannot satisfy this body's two-element whole-list equality: the passing outcome is the opposite count. The claim concerns the executable label, not the correctness of either expected diagnostic.

## Suggested direction (non-binding, optional)
Align the name with the existing two-diagnostic assertion while retaining its w3 witness identity. This is a naming change to a test explicitly cited as w3 by `docs/bugs/0431-theta-hosted-export-from-wholly-inert.md:194-198`; that citation must remain resolvable.

## False-positive check
- Gate-pin check: the file is not a gate/census test. This finding compares a name with its assertion, not a pinned inventory or expected corpus count.
- Recording-double check: w3 asserts parsed diagnostics; no negative recording-double witness is challenged.
- docs/bugs/ signature search: searched `docs/bugs/` for `w3:`, `same single diagnostic`, and the reviewed filename. No document quotes this w3 title as a required failure signature. Bug 0431 instead explicitly records its added diagnostic at `docs/bugs/0431-theta-hosted-export-from-wholly-inert.md:194-198`:
  > - Six-flip record (all additive, parent-ratified, no seventh): each gains
  >   exactly one sorted-first `theta/parse/export-in-theta` entry, its own verdict
  >   unchanged — `tests/reserved-keyword-misfire-faces.test.ts` B3;
  >   `tests/reserved-keyword-remaining-identifier-positions.test.ts` a8, a9, w3;
  >   `tests/import-export-from-clause-required.test.ts` d-export (its
  This is not a disabled test or an objection to a documented correct-reason red.
- Coverage-matrix/bug-doc citation search: `rg -n 'reserved-keyword-(type-position|remaining-identifier-positions)' docs/reference/coverage-matrix.md` returned no matches. Bug 0431 pins w3 by row identity as quoted above; bug 0153 also inventories w3 and bug 0242 discusses that row. The naming direction explicitly acknowledges the citation and preserves the row identity; no merge or deletion is proposed.
- History intent: `git log --oneline -S 'exportInThetaAt(4, 42)' -- tests/reserved-keyword-remaining-identifier-positions.test.ts` identifies `f8eb6286`. Reading that commit's diff shows the second expected entry and its explaining comment were added while the single-diagnostic title was retained. The finding respects the intentionally changed expectation.
- Prior-topic check: `rg -n -F 'reports the same single diagnostic' quality/intake quality/issues quality/resolved` returned no matches before filing. Existing reserved-keyword helper-duplication findings concern harness definitions rather than this title/body mismatch.
- Coverage boundary: this judges existing test code only. It requests no additional test, production change, suite-composition change, or E2E posture change.

## Triage
verdict: confirmed — w3's title promises a single diagnostic, but its unfiltered whole-list equality requires two; commit f8eb6286 added export-in-theta without updating the title, bug 0431 verifies the additive change, the filing preserves the cited w3 identity, and no duplicate or resolved prescription covers this naming mismatch (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
