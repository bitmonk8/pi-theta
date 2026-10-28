---
id: PTQ-1773
title: The brace-rooted union cell 1i names unscoped recovery while asserting preserved declarations.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/brace-rooted-union-arm-capture.test.ts:490-508
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The brace-rooted union cell 1i names unscoped recovery while asserting preserved declarations.

## Observation
Cell 1i is named `the loss is not scoped to one declaration's own recovery`. Its fixture contains a brace-rooted union in schema `S`, followed by schema `T` with a string field. The body expects both declarations to retain their fields and explicitly states that recovery scoping is already correct. The comment also states that the following declaration was unaffected before the fix, so the name's unscoped-loss claim is not the baseline described by the test either.

## Evidence
`tests/brace-rooted-union-arm-capture.test.ts:490-500`:
```ts
  it("RED 1i: the loss is not scoped to one declaration's own recovery", () => {
    // §Reproduction's two-declaration fixture. At HEAD the following
    // declaration is unaffected (the recovery IS scoped), and the claim
    // post-fix is that BOTH declarations carry their fields and the list is
    // empty — so this cell moves the first declaration only.
    // Since bug 0228's fix `S`'s brace-group arm keeps the author's own
    // spacing.
    expect(
      observeSchema(`${FM}schema S { f: {a: integer} | null }\nschema T { g: string }\n${TAIL}`),
      "1i — recovery scoping is already correct; what moves is that `S` keeps its field, so " +
        "the two-declaration file loads clean",
```

`tests/brace-rooted-union-arm-capture.test.ts:501-508`:
```ts
    ).toEqual({
      diagnostics: [],
      shape: [
        { name: "S", fields: [{ name: "f", typeSource: "{a: integer}|null" }], arms: null },
        { name: "T", fields: [{ name: "g", typeSource: "string" }], arms: null },
      ],
    });
  });
```

## Why this is a problem
This is the D7 misleading-test-name class: a reader following the name would understand cell 1i as a witness that loss escapes a declaration's recovery boundary and affects another declaration. The assertion instead verifies intact declarations, while its own explanation explicitly says the following declaration was unaffected and recovery was scoped. The mismatch is between the existing name and its existing observable, not an argument for another test or a different expected behaviour.

## Suggested direction (non-binding, optional)
A naming-only correction could describe the two preserved declarations instead of an unscoped loss. This would rename a pinned witness: `docs/bugs/0095-brace-rooted-union-arm-capture-destroys-context.md:931-940` identifies the file and its two-declaration recovery cell, and `:998` includes cell 1i in the witness inventory; those citations must remain identifiable.

## False-positive check
- Gate-pin check: this file is not a gate or census/pin inventory test; this cell compares schema diagnostics and AST fields. No expected count or inventory is challenged.
- Recording-double check: the cell observes parsed schemas, not a negative witness through a recording double.
- docs/bugs/ signature search: `rg -n -F -e "RED 1i: the loss is not scoped to one declaration's own recovery" -e 'recovery scoping is already correct' docs/bugs docs/reference/coverage-matrix.md` returned no matches. Bug 0095 records the fixed behaviour and witness run at `:931-940` and `:993-1001`; the finding does not treat the historical `RED` prefix as a skip or complain about a documented correct-reason red.
- Coverage-matrix/bug-doc citation search: `rg -n -F 'brace-rooted-union-arm-capture' docs/reference/coverage-matrix.md` returned no matches. The bug-doc search for the filename found bug 0095's witness record, and the search for `1i|two-declaration|recovery.*scop|scop.*recovery` in that record found the two-declaration witness descriptions and the `1a–1i` pin. The naming direction explicitly acknowledges this pinned witness; no merge or deletion is proposed.
- Intent/history check: `git log -S 'loss is not scoped' -p -- tests/brace-rooted-union-arm-capture.test.ts` shows commit `75af7646` introduced the name together with the comments saying recovery is scoped and the following declaration is unaffected. This is not a name made accurate by its historical baseline.
- Existing-topic check: the supplied already-filed topics cover this file's harness/oracle duplication, not this name/body contradiction. A search for `loss is not scoped|evaluates the block in a CHILD scope|child-scope evaluation` in `quality/issues`, `quality/resolved`, and `quality/intake` returned no matches before filing.
- Coverage boundary: the claim concerns only the wording of one existing test versus its existing assertion. It requests no added behavioural coverage, runtime change, suite-composition change, or assertion change.

## Triage
verdict: confirmed — tests/brace-rooted-union-arm-capture.test.ts:490-508 names unscoped loss but asserts no diagnostics and preserved fields in both S and T; its comments explicitly say recovery is scoped, and commit 75af7646 introduced that same contradiction. This is D7 misleading-name, not a complaint about the RED prefix; bug 0095's witness pin is acknowledged, the stated searches reproduce, and no duplicate or resolved prescription for this title was found. (triage: claude-opus-5-5)
