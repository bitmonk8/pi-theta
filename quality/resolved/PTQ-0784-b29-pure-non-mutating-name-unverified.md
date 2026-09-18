---
id: PTQ-0784
title: B29 "pure, non-mutating function" test never captures events, so its idempotent-output claim is not checked by any assertion
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-child-tap.test.ts:132-149
sites: 1
fix_scope: localized
wave: qw20260917204232
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# B29 "pure, non-mutating function" test never captures events, so its idempotent-output claim is not checked by any assertion

## Observation
The test titled "B29: the tap is a pure, non-mutating function of each line —
a deep-frozen fixture line ingests without throwing" destructures only
`publish` (not `events`) from `recordingPublish()`, then asserts
`expect(() => child.emitRawLine(line)).not.toThrow()` twice on the same frozen
input line. A comment between the two calls states: "Idempotent: emitting
the identical (frozen-sourced) line twice produces the same observable shape
both times — no hidden state mutation."

## Evidence
tests/execution-status-child-tap.test.ts:132-149
```ts
  it("B29: the tap is a pure, non-mutating function of each line — a deep-frozen fixture line ingests without throwing", () => {
    const child = FAKE_CHILD();
    const { publish } = recordingPublish();
    attachChildActivityTap(child, publish);

    const fixture = Object.freeze({
      type: "tool_execution_start",
      toolCallId: "1",
      toolName: "bash",
      args: Object.freeze({ command: "echo hi" }),
    });
    const line = JSON.stringify(fixture);

    expect(() => child.emitRawLine(line)).not.toThrow();
    // Idempotent: emitting the identical (frozen-sourced) line twice produces
    // the same observable shape both times — no hidden state mutation.
    expect(() => child.emitRawLine(line)).not.toThrow();
  });
```

## Why this is a problem
The name and the inline comment both describe a check on *observable output
equality* across two identical calls ("produces the same observable shape
both times"). Because `recordingPublish()`'s `{ publish }` destructure
discards `events`, no reference to the published events array exists in this
test body at all — there is nothing in scope that could be compared between
the first and second `emitRawLine` call. The only two assertions present each
check `.not.toThrow()`, which verifies the tap does not throw on a frozen
input; it says nothing about mutation, idempotence, or output equality. A
reader following the test name would expect a comparison of the two calls'
published events (or some other state) and would not find one anywhere in the
body.

## Suggested direction (non-binding, optional)
None beyond observing the mismatch between the stated claim and what is
captured in scope.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file or named gate kin.
- Recording-double carve-out: `recordingPublish()` is a recording double, but
  here it is used only for its `publish` half, with `events` explicitly not
  destructured — the double exists in the file but is not wired into this
  particular test's assertions, so the carve-out (which protects *did-not-
  happen* witnesses that are actually checked) does not apply; no MUST-NOT
  witness is being asserted here at all.
- docs/bugs/ signature search: `grep -rln "pure, non-mutating\|idempotent"
  docs/bugs/` → no hits tying this phrasing to a documented correct-reason
  red; this is a green test, not a red one.
- coverage-matrix/bug-doc citation search: `grep -rn
  "execution-status-child-tap" docs/reference/coverage-matrix.md` → no hits.
- This finding does not propose merging, renaming, or deleting the test.

## Triage
verdict: confirmed — independently re-verified: the excerpt reproduces verbatim at tests/execution-status-child-tap.test.ts:132-149; `const { publish } = recordingPublish()` discards `events`, so no reference exists that could compare the two emits' outputs, and the only two assertions are `.not.toThrow()`; moreover the frozen fixture is inert against the SUT — `emitRawLine` passes a string and `attachChildActivityTap` does `JSON.parse(line)` (src/extension/execution-status/child-tap.ts:104), yielding a fresh unfrozen object, so the "pure, non-mutating function of each line" half of the title is not exercised by any assertion, only the "ingests without throwing" half is; D7 misleading-name class in tests/, same two-part-title/one-part-body pattern confirmed for siblings PTQ-0453/0541/0589; stated searches hold (coverage-matrix → 0 hits; the literal docs/bugs `idempotent` grep does return 5 files but none mention child-tap/B29/execution-status; green test, not a *gate* file, no merge/rename/delete proposed); not a duplicate — PTQ-0612 covers B30's toBeDefined tautology, a different test (triage: claude-fable-5-1)
