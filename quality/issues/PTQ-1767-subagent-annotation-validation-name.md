---
id: PTQ-1767
title: The subagent-fn explicit-return test names caller validation but asserts only declaration metadata.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-fn.test.ts:404-421
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The subagent-fn explicit-return test names caller validation but asserts only declaration metadata.

## Observation
The FN-6/FN-3 test says that an explicit return annotation is carried across the boundary and used to validate the typed-let caller. Its fixture contains both a declaration annotated `integer` and a typed-let call. The two assertions inspect only whether the declaration is marked as a subagent function and whether its `returnType` is `integer`; neither reads the caller nor the document's diagnostics.

## Evidence
One test occurrence, shown in two contiguous excerpts, re-read immediately before filing.

`tests/subagent-fn.test.ts:404-412`:
```ts
  it("FN-6/FN-3: an explicit return annotation is carried across the boundary and used to validate the typed-let caller (RED — feature absent)", () => {
    const doc = parse(
      [
        "subagent fn step(o: string): integer { 7 }",
        "let r: integer = step(\"x\")",
        "r",
      ].join("\n"),
    );
    const node = fnNamed(doc.body, "step");
```

`tests/subagent-fn.test.ts:413-421`:
```ts
    expect(
      isSubagentFn(node),
      "FN-6: the explicit-return subagent fn is recognised as such",
    ).toBe(true);
    expect(
      node?.returnType,
      "FN-6/FN-3: the explicit `: integer` return annotation is captured across the subagent boundary, exactly as for fn/invoke",
    ).toBe("integer");
  });
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following “used to validate the typed-let caller” would interpret a passing result as an observation of caller validation. Mechanically, the assertions have no dependency on that result: any document retaining the flagged declaration and its annotation satisfies both assertions, including one whose diagnostics reject the typed-let caller. The finding concerns the name of this existing test, not whether another validation test should exist or whether production validation behaves correctly.

## Suggested direction (non-binding, optional)
Align the name with the declaration metadata this test actually observes, without expanding its behavioural obligations.

## False-positive check
- Gate-pin check: `tests/subagent-fn.test.ts` is not a gate or named gate kin; the cited test asserts no pinned corpus count or inventory.
- Recording-double check: the cited assertions inspect parsed declaration metadata, not a recording double or a MUST-NOT call witness. Both assertions are failable; this is not an assertions-that-cannot-fail claim.
- docs/bugs/ signature search: `rg -n -F 'typed-let caller' docs/bugs docs/reference/coverage-matrix.md` and `rg -n -F 'FN-6/FN-3' docs/bugs docs/reference/coverage-matrix.md` each returned no matches. The finding does not attribute a failure or skip to the historical `RED — feature absent` suffix.
- Coverage-matrix/bug-doc citation search: searching `subagent-fn.test.ts` in `docs/reference/coverage-matrix.md` returned no matches. The bug-doc file-path search found citations to other witnesses and fixture shapes in this file. In particular, `docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md` cites the historical range `404–421` explicitly as contextual-keyword non-firing tests, not this explicit-return test. The proposed name alignment therefore does not rename a test pinned by that citation; neither exact-title fragment search above found a by-name citation for this test.
- History intent check: `git log --oneline -S 'an explicit return annotation is carried across the boundary and used to validate the typed-let caller' -- tests/subagent-fn.test.ts` identifies introducing commit `9a9933f8`; its test body already has the same fixture and two metadata assertions. The mismatch is not inferred from a removed runtime witness.
- Duplicate check: `rg -l -F 'typed-let caller' quality/intake quality/issues quality/resolved` returned no matches before filing. The supplied annotation/parser-harness duplication topics concern different observations.
- Scope check: only the existing test's name/body mismatch is reported. No production change, additional test, coverage claim, suite-composition change, or test merge/deletion is requested.

## Triage
verdict: confirmed — The title promises typed-let caller validation, but the test at tests/subagent-fn.test.ts:404–421 asserts only the subagent flag and returnType; parse/parseDoc adds no diagnostic assertion. History and citation searches reproduce, bug 0148 pins different contextual-keyword guards, and no duplicate or resolved prescription covers this misleading name. (triage: claude-opus-5-5)
