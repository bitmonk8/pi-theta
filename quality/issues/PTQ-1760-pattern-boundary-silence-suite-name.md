---
id: PTQ-1760
title: The reserved-keyword object-pattern group (n) promises silence while n1 and n2 require refusals.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:415-416
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:425-435
  - tests/reserved-keyword-object-pattern-head-refusal.test.ts:438-454
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The reserved-keyword object-pattern group (n) promises silence while n1 and n2 require refusals.

## Observation
The group (n) `describe` name identifies its subjects as “the spellings a route must leave silent.” Its n1 and n2 children instead require `theta/parse/unresolved-named-type` diagnostics for the lowercase head `p` and undeclared head `Zed`. Both child names already state that the head is refused. Their assertion messages identify bug 0221 as the authority that changed the former silence into refusal.

## Evidence
`tests/reserved-keyword-object-pattern-head-refusal.test.ts:415-416` — the enclosing suite label and its first child:
```ts
describe("0219 (n) — the spellings a route must leave silent", () => {
  it("n1 (a7 boundary): a LOWERCASE object-pattern head `p { a: 1 }` is refused as an unresolved head", () => {
```

`tests/reserved-keyword-object-pattern-head-refusal.test.ts:425-435` — n1 requires a diagnostic rather than silence:
```ts
    expectDiagnostics(
      armBody("p { a: 1 }"),
      [
        existing(
          "theta/parse/unresolved-named-type",
          "unresolved named type 'p'",
          headRange("p"),
        ),
      ],
      "bug 0221 §Expected behaviour 1: an object-pattern head that resolves to no declaration usable at that position is refused once, at the head's range",
    );
```

`tests/reserved-keyword-object-pattern-head-refusal.test.ts:438-443` — the second child names the same changed boundary:
```ts
  it("n2 (a8 boundary): an UNDECLARED head `Zed { a: 1 }` is refused as an unresolved head (element 3, closed by bug 0221)", () => {
    // Element 3 was recorded and held open by bug 0219 — refusing it added a
    // further position to `theta/parse/unresolved-named-type`'s position list
    // (code-registry-parse.md:101). Bug 0221 settled that DIAG-2 question and
    // reuses the row rather than minting one; §Fix (c)(2) names this cell as
    // the second of the two flips it authorises.
```

`tests/reserved-keyword-object-pattern-head-refusal.test.ts:444-454` — n2 also requires a diagnostic:
```ts
    expectDiagnostics(
      armBody("Zed { a: 1 }"),
      [
        existing(
          "theta/parse/unresolved-named-type",
          "unresolved named type 'Zed'",
          headRange("Zed"),
        ),
      ],
      "bug 0221: the head resolving against nothing is refused, where bug 0219's §Fix left it measured and silent",
    );
```

One misleading enclosing label is counted; n1 and n2 are the two cited children demonstrating the mismatch, not separate findings.

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the enclosing label would read a passing n1 or n2 as preserving diagnostic silence for those object-pattern heads, but silence fails the existing diagnostic-list assertions. The label does not qualify “silent” as merely absence of the reserved-keyword code; the child names and assertion messages explicitly distinguish former silence from the current unresolved-head refusal. The finding concerns that executable label, not whether either refusal is the desired parser behaviour.

## Suggested direction (non-binding, optional)
Align the enclosing label with its existing mix of admitted controls and refusal boundaries while retaining the `0219 (n)` identity and child ids. This would rename a suite containing tests pinned by name in `docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md`; those n1/n2 citations must remain resolvable. No merge or deletion is proposed.

## False-positive check
- Gate-pin: neither reviewed filename is a gate/census filename. This claim compares a suite label with existing diagnostic expectations, not an inventory count or its re-derivation mechanism.
- Recording-double: these witnesses parse source and require emitted diagnostics. No negative recording witness is being challenged.
- docs/bugs/ signature search: `rg -n -F 'the spellings a route must leave silent' docs/bugs` returned no matches. The tests are not skipped or disabled. The bug record confirms that their current refusal is intentional, rather than a documented correct-reason red. Specifically, `docs/bugs/0221-object-pattern-head-name-unchecked-fires-wrong-arm.md:567-573` states:
  ```text
  - **The flips, enumerated for ratification.** `n1` (lowercase head
    `p { a: 1 }`) and `n2` (undeclared head `Zed { a: 1 }`) in
    `tests/reserved-keyword-object-pattern-head-refusal.test.ts`. Each keeps its
    cell id, its `a7` / `a8` boundary subject and its fixture byte-identical;
    each `[]` becomes the one-code whole-list assertion at `headRange(...)`, and
    each comment now cites this report as the authorising one. No other cell in
    that file is in the diff.
  ```
- Coverage-matrix/bug-doc citation search: `rg -n -F 'reserved-keyword-object-pattern-head-refusal' docs/reference/coverage-matrix.md` returned no matches. `rg -l -F 'reserved-keyword-object-pattern-head-refusal' docs/bugs` returned five files: bugs 0118, 0219, 0221, 0226, and 0234. The n1/n2 pin in bug 0221 is quoted above and explicitly acknowledged in the naming direction; the finding does not propose renaming either child or changing its assertion.
- History intent: `git log --oneline -S 'n1 (a7 boundary): a LOWERCASE object-pattern head `p { a: 1 }` is refused' -- tests/reserved-keyword-object-pattern-head-refusal.test.ts` identifies `20cd908b`. Inspection of that commit's test diff shows both n1/n2 expectations changed from `[]` to the unresolved-head diagnostic while the enclosing label remained unchanged. The finding preserves that intentional behaviour change.
- Prior-topic check: an exact-phrase search for the enclosing label across `quality/intake`, `quality/issues`, and `quality/resolved` returned no matches before filing. The existing scaffold/message duplication topics are not claimed here; PTQ-1635 concerns a different cell, v6, and dated bug-record coordination rather than this executable suite label.
- Coverage boundary: this judges an existing suite name against its existing children. It requests no additional test, assertion, suite restructuring, E2E posture change, or production change.

## Triage
verdict: confirmed — The group (n) title still promises silence, but n1/n2 require whole-list unresolved-named-type refusals; commit 20cd908b and bug 0221 confirm the intentional assertion flips left that title unchanged, and no duplicate or resolved prescription covers this naming mismatch. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
