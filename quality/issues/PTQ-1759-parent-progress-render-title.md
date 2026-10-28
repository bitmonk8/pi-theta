---
id: PTQ-1759
title: The parent progress suite name promises a rendered segment while its test requires no renders.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:154-155
  - tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:205-211
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The parent progress suite name promises a rendered segment while its test requires no renders.

## Observation
The enclosing `describe` says parent-regime `theta_progress` lands “one rendered ✎ segment.” Its code-side test instead requires the recording UI's entire call list to be empty. The individual `it` name already says “ZERO status renders,” so the suite and test names describe opposite rendering outcomes.

## Evidence
`tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:154-155`:
```ts
describe("RFC 0010 (H8a, live, L3) — parent-regime theta_progress lands one milestone entry and one rendered ✎ segment", () => {
  it("code-side call: exactly one milestone entry carrying the exact message, ZERO status renders on the UI double (decision 4), drive Ok, no chat-side progress leakage", async () => {
```

`tests/live/rfc0010-l3-progress-parent-live-cell.test.ts:205-211`:
```ts
      await sleep(ABSENCE_SETTLE_MS);
      expect(
        calls,
        "a retired ctx.ui status surface rendered — the footer/widget sinks are " +
          "superseded by the run card (RFC 0015 decision 4). Calls: " +
          JSON.stringify(calls),
      ).toEqual([]);
```

## Why this is a problem
This is the D7 misleading-test-name class. A reader following the suite name would take a passing result as a witness that the progress segment rendered, whereas a render makes the actual assertion fail. The mismatch concerns the description of an existing assertion, not whether any additional rendering test should exist.

## False-positive check
- Gate-pin check: this is not a census/inventory gate; no pinned count or corpus inventory is challenged.
- Recording-double check: the empty call-list assertion is a legitimate MUST-NOT witness. The finding concerns only the suite name's opposite claim, not the assertion's validity.
- docs/bugs/ signature search and citation check: `rg -n 'rfc0010-l3-progress-parent-live-cell|one rendered ✎ segment|parent-regime theta_progress' docs/reference/coverage-matrix.md docs/bugs` returned no matches. There is no documented correct-reason red being challenged and no matching name citation in those documents.
- History intent check: `git show bde73af5 -- tests/live/rfc0010-l3-progress-parent-live-cell.test.ts` shows the RFC-0015 D6 change replacing the positive rendering assertion with `calls.toEqual([])` and changing the individual test title to ZERO renders, while retaining the enclosing suite title. The rendering-absence behavior is deliberate and is not disputed.
- Duplicate check: searches for the suite's rendered-segment wording and parent-progress title/name topics in `quality/issues`, `quality/resolved`, and `quality/intake` found no existing finding about this title mismatch; the recording-UI, sleep, and milestone-reader duplication reports concern other mechanisms.
- Scope check: only an existing test's misleading suite name is at issue. No coverage, suite-composition, production-code, or behavioral change is requested.

## Triage
verdict: confirmed — The suite at :154 still promises “one rendered ✎ segment,” but its code-side test at :205-211 requires the recording UI calls to equal []; bde73af5 deliberately retired the positive render assertion and updated only the individual test title. This is D7 misleading-name drift, not a challenge to the legitimate negative witness; the stated docs search reproduces with no matches, and no duplicate or resolved prescription for this title was found. (triage: claude-opus-5-5)
