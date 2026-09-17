---
id: PTQ-0745
title: "for-empty-array-iterand-adjudication.test.ts D1's name says the census re-derives to 34 files, the assertion pins 46"
lens: D7
status: open
verdict: confirmed
locations:
  - tests/for-empty-array-iterand-adjudication.test.ts:419-424
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# for-empty-array-iterand-adjudication.test.ts D1's name says the census re-derives to 34 files, the assertion pins 46

## Observation
The test named `"D1: the census re-derives to 34 files and zero \`[]\`"` asserts
`expect(files.length, ...).toBe(46)`. The number stated in the test's own name
(34) is not the number its own body enforces (46). The file currently passes
(`npx vitest run` on this file, D1 green) at the committed corpus's real
current size of 46 files.

## Evidence
`tests/for-empty-array-iterand-adjudication.test.ts:419-424`:
```ts
  it("D1: the census re-derives to 34 files and zero `[]`", () => {
    const files = committedThetaSources();
    expect(
      files.length,
      `D1: the census is over ${files.length} committed files; sibling fixes land \`.theta\` files, so a changed count means the disposition below must be re-derived rather than trusted. Files: ${JSON.stringify(files)}`,
    ).toBe(46);
```

The surrounding comment block (lines within the same `it`, immediately below
the assertion) documents two later re-derivations that updated the pinned
number without updating the test's name:
```
    // Re-derived 2026-09-11 (the D7 lens worker joined the corpus; it carries
    // no `[]`, so the offender set is unchanged): ...
    //
    // Re-derived again (docs/examples/compact-loop.theta joined the corpus; its
    // one `let waves: array<string> = plan.split("\n")` has no bare `[]`
    // literal at all, so the offender set is unchanged): 45 → 46 committed
    // files, same three offenders.
```

## Why this is a problem
A reader following the test's own name ("re-derives to 34 files") would
expect the pinned census size to be 34 and would misread a red on this test
as "the corpus grew past its originally-reported 34-file size," when the test
in fact enforces 46 and has already survived two silent renumberings (to 45,
then to 46) that updated the assertion literal and the in-body re-derivation
comment but never the test's own name string. The name is a stale artifact of
the bug report's original count (docs/bugs/0195 §Fix names the corpus at
report time); the two re-derivation comments prove the maintenance discipline
of updating the assertion and the commentary was followed while the name was
not.

## Suggested direction (non-binding, optional)
None beyond noting that a test name stating a re-derivable count is a
particularly easy one to leave stale across a re-derivation, since nothing
forces the string literal in the name to track the string literal used as
commentary two lines below the assertion.

## False-positive check
Gate-pin check: the file is not named `*gate*.test.ts`; its §(D) describes
itself as "THE COMMITTED-CORPUS CENSUS" in the spirit of a pinned-count gate,
but the finding here is not that the pin is illegitimate (D1's pinned count of
46 is exactly the mechanism GOV-15 requires, and is not challenged) — it is
that the test's own NAME quotes a different, stale number than the one its
body enforces, which is a name/body mismatch regardless of whether the pin
itself is well-formed. Recording-double check: not applicable. docs/bugs/
signature search: `docs/bugs/0195-control-flow-empty-array-iterand-claim-false.md`
is the origin report; its §Fix cites the corpus size at report time as 34,
which is consistent with the name being copied from the report and never
updated through the two subsequent re-derivations recorded in-file. This is
not a documented correct-reason red (the test is green) and is not covered by
the live-suite conventions (not under tests/live/**). Coverage-matrix search:
no match for this file's basename in `docs/reference/coverage-matrix.md`. This
finding does not propose merging, renaming, or deleting the test — only that
its name and its assertion currently name two different counts.

## Triage
verdict: confirmed — independently re-verified: tests/for-empty-array-iterand-adjudication.test.ts:419-424 reproduces verbatim (name `"D1: the census re-derives to 34 files and zero `[]`"`, body `.toBe(46)` plus a three-file `[]` offender list, so BOTH halves of the name are superseded); `git log -S` shows the name string was authored in 12925e8c at pin 34 and never touched while the pin moved through 45 (63e84091/507810dc) to 46 (6a252aa6); docs/bugs/0195 §Fix constraint 4 and :811 record 34 as the report-time census, confirming the name is a copied stale artifact; file is green (26/26), not `*gate*`, absent from docs/reference/coverage-matrix.md, and the pin itself is not challenged so no D7 carve-out applies; human precedent PTQ-0266/PTQ-0280 rules that in-body supersession comments do not cure a title asserting a superseded claim; no tracked PTQ (PTQ-0226 covers the discovery harness, not this name) addresses this root cause (triage: claude-fable-5-1)
