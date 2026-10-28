---
id: PTQ-1750
title: The fn-param-name-reserved-keyword group (e) promises silence while its e4 body requires a refusal.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/fn-param-name-reserved-keyword.test.ts:223-223
  - tests/fn-param-name-reserved-keyword.test.ts:738-738
  - tests/fn-param-name-reserved-keyword.test.ts:744-751
  - tests/fn-param-name-reserved-keyword.test.ts:756-762
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The fn-param-name-reserved-keyword group (e) promises silence while its e4 body requires a refusal.

## Observation
The group (e) `describe` name says that the other identifier positions “stay silent.” Its e4 child instead requires exactly one reserved-keyword diagnostic, its interpolated message, and its range on the iteration variable. The child's name and adjoining comment already identify this as bug 0153's delivered refusal. The enclosing suite name therefore describes the opposite diagnostic outcome from the body it contains.

## Evidence
`tests/fn-param-name-reserved-keyword.test.ts:738-738` — the enclosing name:
```ts
describe("0148 (e) — the other identifier positions stay silent", () => {
```

`tests/fn-param-name-reserved-keyword.test.ts:744-751` — the child names the refusal and explains the retake:
```ts
  it("e4: a `for` iteration variable named `string` draws bug 0153's refusal, ranged on the variable", () => {
    // RETAKEN by bug 0153
    // (docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md),
    // which claims this position and five siblings. What the row NOW records
    // is a delivery, not a disposition: the emission is 0153's parser-leaf one
    // at `parseFor`'s variable capture (src/parser/theta-document.ts:2341),
    // under lexical.md:20's unqualified sentence, and NOT bug 0148's
    // `atParamStart`-guarded parameter arm widening out of `parseFn`. The
```

`tests/fn-param-name-reserved-keyword.test.ts:223-223` — the asserted code:
```ts
const RESERVED = "theta/parse/reserved-keyword-as-identifier";
```

`tests/fn-param-name-reserved-keyword.test.ts:756-762` — an empty diagnostic list would fail this body:
```ts
    const doc = theta("let xs = [1]\nfor string in xs { 1 }\n1\n");
    expect(
      codesOf(doc),
      `the \`for\` variable is bug 0153's claimed position; diagnostics=${render(doc)}`,
    ).toEqual([RESERVED]);
    expect(messageFor(doc, RESERVED)).toBe(reservedMsg("string"));
    expect(soleRange(doc, RESERVED)).toEqual(range(5, 5, 5, 11));
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the suite name would understand a passing e4 as preserving diagnostic silence outside the parameter-name position. Mechanically, e4 passes only when that other position emits the reserved-keyword refusal; silence fails its whole-list equality. The mismatch is in the executable suite label, not in the asserted parser behaviour.

## Suggested direction (non-binding, optional)
Align the enclosing label with the existing assertions, retaining the cited `0148 (e)` group identity and child row ids. This direction involves renaming a suite cited by `docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md`; that citation must remain resolvable.

## False-positive check
- Gate-pin: the reviewed file is not a gate/census file; the evidence compares a suite label with a diagnostic assertion, not a pinned inventory count.
- Recording-double: the evidence reads a parsed document and requires an emitted diagnostic; no MUST-NOT recording witness is being challenged.
- docs/bugs/ signature search: searched for the exact suite phrase `other identifier positions stay silent` in `docs/bugs/`; no matches. The test's own retake comment at :745-751 names bug 0153's delivered refusal. This is not a disabled test or a documented correct-reason red, and no assertion outcome is proposed to change.
- Coverage-matrix/bug-doc citation search: searching the reviewed filename in `docs/reference/coverage-matrix.md` returned no matches. Bug 0148's witness list names the file at `docs/bugs/0148-reserved-keyword-fn-parameter-position-silent.md:973-986`. Bug 0153 explicitly pins the group at `docs/bugs/0153-reserved-keyword-remaining-identifier-positions.md:582-585`:
  > Every row is in `tests/fn-param-name-reserved-keyword.test.ts`, bug 0148's
  > shipped witness, inside the `0148 (e)` block (`:815`) whose header states the
  > contract: "a reader finding one red should widen the fix's scope question
  > rather than the row".
  The naming direction explicitly acknowledges this citation; it does not propose merging or deleting any test.
- History intent: inspected `git show 71409cac -- tests/fn-param-name-reserved-keyword.test.ts`; the bug 0153 commit intentionally retook the tripwire assertions to refusals. The finding respects that outcome rather than treating the old silence as the desired behaviour.
- Prior-topic check: an exact-phrase search of `quality/intake`, `quality/issues`, and `quality/resolved` found no candidate on this suite label. PTQ-1617 and PTQ-1623 concern coordination notes in dated bug records, not the current executable label; `quality/REVIEW_LOG.md:981` separately routes this label to D7.
- Coverage boundary: this judges one existing suite name against an existing assertion. It makes no claim about absent tests, suite composition, or E2E posture.

## Triage
verdict: confirmed — The suite at tests/fn-param-name-reserved-keyword.test.ts:738 promises silence, but e4 at :756-762 requires exactly [RESERVED], its message and range; commit 71409cac verifies the intentional refusal retake, the bug-doc citation is acknowledged, and no existing or resolved finding tracks this executable-label mismatch. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
