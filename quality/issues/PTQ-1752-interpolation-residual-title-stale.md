---
id: PTQ-1752
title: Interpolation cell f4 names three out-of-reach dispositions while asserting one closed residual and two remaining residuals.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/interpolation-parse-diagnostics.test.ts:1035-1036
  - tests/interpolation-parse-diagnostics.test.ts:1106-1127
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Interpolation cell f4 names three out-of-reach dispositions while asserting one closed residual and two remaining residuals.

## Observation
The test named `PINNED (f4): the three out-of-reach render dispositions, measured` asserts a load refusal for `${1 + "a"}` and runtime throws for the other two expressions. Its own comment says bug 0345 now closes the first residual. The title still characterises all three as out of reach, although the body distinguishes one closed operand residual from two remaining non-operand residuals.

## Evidence

`tests/interpolation-parse-diagnostics.test.ts:1106-1117`:
```typescript
  it("PINNED (f4): the three out-of-reach render dispositions, measured", async () => {
    // Residual 1's wire-facing cost, pinned so it is stated rather than implied.
    // `1 + "a"` used to render the JavaScript coercion QRY-18 exists to refuse;
    // bug 0345's operand descent now closes that member of residual 1, so this
    // source refuses at load (cell (a11)) and never reaches the wire. The other
    // two abort the drive after ZERO turns under an uncoded JavaScript `Error` /
    // a runtime panic — non-operand checks bug 0345 does not own — and stay as
    // measured.
    expect(
      await disposition(interpSrc('1 + "a"')),
      'PRIMARY (bug 0345): `${1 + "a"}` now refuses at load instead of rendering the JS coercion',
    ).toBe(REFUSED);
```

`tests/interpolation-parse-diagnostics.test.ts:1035-1036` defines that expected observable:
```typescript
/** The post-fix disposition: refused at load, so nothing is ever rendered. */
const REFUSED = "REFUSED AT LOAD — no turn rendered";
```

`tests/interpolation-parse-diagnostics.test.ts:1118-1127` retains the two runtime residual expectations:
```typescript
    expect(
      await disposition(interpSrc("s.frobnicate()")),
      "PINNED RESIDUAL 1: an uncoded JavaScript `Error`, after zero turns were sent",
    ).toBe("THREW Error: unknown string stdlib member: frobnicate — sent=[]");
    expect(
      await disposition(interpSrc("o[0]")),
      "PINNED RESIDUAL 1: a runtime panic standing in for a type-phase parse rejection",
    ).toBe(
      "THREW NonObjectReceiverError: non-object receiver: cannot read [0] on a number — sent=[]",
    );
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the title, including in test-runner output, would classify all three cases as residuals still beyond load-time rejection. The first assertion instead requires load-time rejection and would fail if the previous rendered disposition returned. The body and its comment distinguish those contracts, but the test's name presents the pre-0345 classification as the classification of the current assertions.

## Suggested direction (non-binding, optional)
Any title correction concerns a pinned witness: `docs/bugs/0122-template-interpolation-diagnostics-discarded.md:1193-1202` and `docs/bugs/0345-interpolation-expressions-skip-all-operand-checks-at-parse.md:329-331` cite cell f4 and its changed expectation. Renaming its descriptive title must account for those citations; this observation does not propose merging or deleting the cell or changing its assertions.

## False-positive check
- Gate-pin check: the reported site is cell f4, not this file's group-(g) corpus census. No pinned count, corpus inventory, or same-commit re-derivation is challenged.
- Recording-double check: the assertions on thrown dispositions and the empty recorded send list are retained as legitimate observables. This finding does not call those negative witnesses vacuous.
- docs/bugs/ signature search: read the bug-0122 and bug-0345 fix records, including the follow-up at 0122:1193-1202 and the witness list at 0345:329-331. They explicitly record f4's mixed-plus case changing to load refusal; this is not a documented correct-reason red or a request to weaken a failing test.
- Coverage-matrix/bug-doc citation search: `rg -n '\(f4\)|out-of-reach render dispositions|interpolation-parse-diagnostics' docs/reference/coverage-matrix.md` returned no matches. The bug-doc citations above pin f4; that constraint is acknowledged explicitly in the direction paragraph.
- History intent check: `git log --oneline -S 'bug 0345' -- tests/interpolation-parse-diagnostics.test.ts` identifies d224287a. Reading that commit's test diff shows the f4 comment and first expectation changing from rendered coercion to `REFUSED`, while the quoted f4 title remains unchanged.
- Duplicate check: `rg -n 'out-of-reach render dispositions|three out-of-reach' quality/intake quality/issues quality/resolved` returned no matches before filing. Existing registry-oracle, query-walk, and production-drive harness findings concern different declarations, not this title/assertion mismatch.
- Coverage boundary: all three assertions already exist and assert different observables. The claim concerns only their current test name, not a missing test, suite composition, runtime behaviour, or the number of tests warranted.

## Triage
verdict: confirmed — Cell f4 still names three out-of-reach dispositions, but its first assertion requires REFUSED at load; d224287a and bugs 0122/0345 verify that this residual was closed while the title stayed unchanged. This is D7 misleading-name drift despite the corrective body comment; the filing acknowledges both bug-doc witness citations, and no duplicate or resolved prescription for this title was found. (triage: claude-opus-5-5)
