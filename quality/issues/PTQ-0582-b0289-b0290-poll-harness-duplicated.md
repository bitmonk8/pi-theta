---
id: PTQ-0582
title: captureLoudFailure/discoverPollBound/emptyTextAfterThinking/immediateSleep are redeclared byte-for-byte between b0289 and b0290
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0289-settled-empty-text-turn-classification.test.ts:116-143
  - tests/b0289-settled-empty-text-turn-classification.test.ts:487-517
  - tests/b0290-re-ask-count-observable.test.ts:81-108
  - tests/b0290-re-ask-count-observable.test.ts:285-315
sites: 4
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# captureLoudFailure/discoverPollBound/emptyTextAfterThinking/immediateSleep are redeclared byte-for-byte between b0289 and b0290

## Observation
tests/b0289-settled-empty-text-turn-classification.test.ts and
tests/b0290-re-ask-count-observable.test.ts each locally declare the same four
helper functions over the same injected `captureSettledTurn`/`classifyLastTurn`
seam: `emptyTextAfterThinking(stopReason)`, `immediateSleep()`,
`captureLoudFailure(run)` and `discoverPollBound(capture)`. Three of the four
(`emptyTextAfterThinking`, `immediateSleep`, `discoverPollBound`) are
byte-identical apart from the bug-number literal inside a log string; the
fourth (`captureLoudFailure`) differs only in the trailing sentence of its
`failLoudly` message. Both files import `failLoudly` from the same
`./live/harness` module, so the shared dependency already exists; only the
four functions built on top of it are re-typed per file.

## Evidence
tests/b0289-settled-empty-text-turn-classification.test.ts:116-128:
```ts
function emptyTextAfterThinking(stopReason: string): unknown {
  return message(
    "assistant",
    [
      { type: "thinking", thinking: "…" },
      { type: "text", text: "" },
    ],
    stopReason,
  );
}

/** A sleep that resolves on the microtask queue — the poll bound must cost no wall time here. */
async function immediateSleep(): Promise<void> {}
```

tests/b0290-re-ask-count-observable.test.ts:81-93 (identical
`emptyTextAfterThinking` and `immediateSleep`):
```ts
function emptyTextAfterThinking(stopReason: string): unknown {
  return message(
    "assistant",
    [
      { type: "thinking", thinking: "…" },
      { type: "text", text: "" },
    ],
    stopReason,
  );
}

/** A sleep that resolves on the microtask queue — the poll bound must cost no wall time here. */
async function immediateSleep(): Promise<void> {}
```

tests/b0289-settled-empty-text-turn-classification.test.ts:487-513
(`discoverPollBound`):
```ts
async function discoverPollBound(capture: CaptureSettledTurn): Promise<number> {
  const pending = [message("user", QUERY_TWO)];
  let polls = 0;
  const observed = await captureLoudFailure(async () =>
    capture(
      {
        getEntries: () => pending,
        prompt: async () => {
          failLoudly(
            "bug 0289: a slice with no trailing assistant entry is PENDING, so the " +
              "drive must not re-ask it.",
          );
        },
        isIdle: () => true,
        sleep: async () => {
          polls++;
        },
      },
      0,
      "/b0273livegood",
    ),
  );
  // A genuinely pending slice — no trailing assistant entry at all — is the one
  // shape whose expiry may still say "never settled".
  expect(observed).toContain("never settled");
```

tests/b0290-re-ask-count-observable.test.ts:285-311 (the same function,
same structure, same log-prefix rewording only):
```ts
async function discoverPollBound(capture: CaptureSettledTurn): Promise<number> {
  const pending = [message("user", SENTINEL_QUERY)];
  let polls = 0;
  const observed = await captureLoudFailure(async () =>
    capture(
      {
        getEntries: () => pending,
        prompt: async () => {
          failLoudly(
            "bug 0290: a slice with no trailing assistant entry is PENDING, so the drive " +
              "must not re-ask it.",
          );
        },
        isIdle: () => true,
        sleep: async () => {
          polls++;
        },
      },
      0,
      SLASH,
    ),
  );
  // A genuinely pending slice — no trailing assistant entry at all — is the one
  // shape whose expiry still says "never settled" (bug 0289 §Fix element (a)).
  expect(observed).toContain("never settled");
```

`captureLoudFailure` at tests/b0289-settled-empty-text-turn-classification.test.ts:131-140
and tests/b0290-re-ask-count-observable.test.ts:96-105 is the same
try/catch-and-rethrow-as-failLoudly shape in both files, differing only in
the trailing sentence of the message passed to `failLoudly` ("so the state it
reported for the turn cannot be inspected" vs "so the poll bound it consumed
cannot be measured").

## Why this is a problem
Both files drive the same `./live/harness` seam
(`captureSettledTurn`/`classifyLastTurn`) with a scripted `getEntries`/
`prompt`/`isIdle`/`sleep` double, and both need the same four pieces of
scaffolding to do it: a fixture for the witnessed empty-settle shape, a
zero-cost sleep, a helper that turns an expected loud failure into an
inspectable string, and a way to measure the harness's own poll bound without
hardcoding it. b0290's own header states it exists specifically to extend
b0289's contract ("bug 0289's bounded same-session re-ask..."), so the two
files are declared siblings in the same lineage, yet neither imports the
other's copy nor a shared module — each retyped the same four functions.

## Suggested direction (non-binding, optional)
A shared tests/helpers/ module for this pair's "scripted captureSettledTurn
double" scaffolding (the four functions above) would be the natural home,
following the same centralisation tests/helpers/scripted-live-session-harness.ts
already performs for the sibling bug-0288/0319/0414 lineage.

## False-positive check
Gate-pin: neither file matches `*gate*.test.ts` or a listed gate kin. Recording-double:
the scripted `prompt`/`sleep`/`isIdle` double here is a stimulus double driving
the seam under test, not a MUST-NOT-witness recording double — carve-out does
not apply. docs/bugs/ signature search: docs/bugs/0289-settled-empty-text-turn-scored-as-never-settled-in-live-harness.md
and docs/bugs/0290-exact-rendered-query-counts-red-when-bug-0289s-bounded-re-ask-fires.md
describe the classifier/re-ask behaviour under test, not this helper
duplication; no documented correct-reason red covers it. coverage-matrix/bug-doc
citation search: `grep -rn "b0289-settled-empty-text-turn-classification\|b0290-re-ask-count-observable"
docs/reference/coverage-matrix.md docs/bugs/` found no citation pinning either
file's helper structure by name. This is a claim about duplicated code that
exists in both files, not a claim that a test is missing.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce at the cited lines and a diff of the extracted ranges shows emptyTextAfterThinking/immediateSleep byte-identical, captureLoudFailure differing only in the failLoudly message tail, and discoverPollBound structurally identical (title's "byte-for-byte" is overstated there — it also differs in the query literal and slash argument, both disclosed in the excerpts); the four identifiers grep to these two files only in src/extensions/tools/tests/docs, so no shared helper exists; in-scope D7 copy-paste double/boilerplate class; no carve-out applies (not a gate, stimulus not recording double, bug-doc witness citations pin the files not their helper layout, bug 0289's "byte-unedited" note is a historical pin-yield record, the 14864-line pin is on live-production-acceptance not these files, b0290's declare-locally rationale covers the seam types not these helpers); distinct from resolved PTQ-0229 (message/note entry builders) and from sibling intake d7-02 (b0290 message() vs messageEntry) (triage: claude-fable-5-1)
