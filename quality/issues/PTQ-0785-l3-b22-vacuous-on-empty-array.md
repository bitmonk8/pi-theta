---
id: PTQ-0785
title: L3-B22's byte-size and seq assertions both pass vacuously if writtenLines ends up empty
lens: D7
status: open
verdict: confirmed
locations:
  - tests/execution-status-progress-wire.test.ts:216-230
sites: 1
fix_scope: localized
wave: qw20260917204232
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# L3-B22's byte-size and seq assertions both pass vacuously if writtenLines ends up empty

## Observation
The test "a fault-injected oversized builder path never partially writes and
does not advance seq" issues one oversized call (`c1`) and one normal call
(`c2`), then makes two assertions on `writtenLines`: an `.every(...)` byte-size
check, and a `seq === 1` check on `writtenLines[0]` guarded by
`if (writtenLines.length > 0)`.

## Evidence
tests/execution-status-progress-wire.test.ts:216-230
```ts
describe("T-WIRE — L3-B22: an over-4096-byte line drops (counted), seq not consumed, no partial write", () => {
  it("a fault-injected oversized builder path never partially writes and does not advance seq", async () => {
    const hugeMessage = "m".repeat(PROGRESS_WIRE_MAX_LINE_BYTES + 100);
    const { deps, writtenLines } = childDeps();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, deps);
    await calls[0]!.execute("c1", { message: hugeMessage }, undefined, undefined, {} as never);
    await calls[0]!.execute("c2", ARGS, undefined, undefined, {} as never);

    expect(writtenLines.every((l) => Buffer.byteLength(l, "utf8") <= PROGRESS_WIRE_MAX_LINE_BYTES)).toBe(true);
    if (writtenLines.length > 0) {
      expect(JSON.parse(writtenLines[0]!.trimEnd()).theta_progress.seq).toBe(1);
    }
  });
});
```

## Why this is a problem
`Array.prototype.every` returns `true` on an empty array regardless of the
predicate — `[].every(anything)` is `true` by definition of the method,
independent of what `registerThetaProgressTool`/`writeWireLine` actually did.
The second assertion is further guarded by `if (writtenLines.length > 0)`, so
if `writtenLines` were empty (e.g. both the oversized `c1` call and the
subsequent `c2` call failed to write for any reason), the `if` body — the only
place the `seq` value is checked — would not execute at all. Mechanically, a
`writtenLines.length === 0` outcome makes both statements in this test body
pass without checking anything: the `.every()` call is vacuously true and the
guarded `seq` assertion is skipped. The test name claims the assertions prove
"never partially writes and does not advance seq", but the code path that
would make that claim false in the most direct way (nothing gets written at
all) is a path on which the test also passes.

## Suggested direction (non-binding, optional)
None beyond observing the vacuous-on-empty shape; a length assertion ahead of
the size/seq checks would remove the two ways this test can pass without
observing anything.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file or named gate kin.
- Recording-double carve-out: `writtenLines` is a recording double (an array
  populated by `writeWireLine`), but the carve-out protects MUST-NOT
  witnesses (asserting something was never called) — this test is not
  asserting "nothing was written"; it asserts positive facts (byte size bound,
  a specific `seq` value) that are meant to hold on the one line that ships,
  and those specific assertions are the ones shown to pass vacuously if the
  array is empty.
- docs/bugs/ signature search: `grep -rln "L3-B22\|never partially writes"
  docs/bugs/` → no hits; not a documented correct-reason red (test is green).
- coverage-matrix/bug-doc citation search: `grep -rn
  "execution-status-progress-wire" docs/reference/coverage-matrix.md` → no
  hits; test not pinned by name in any witness list found.
- This finding does not propose merging, renaming, or deleting the test, and
  makes no claim about whether the production code actually produces an empty
  `writtenLines` today (that would be a bug/behaviour claim, out of scope for
  D7) — the claim is limited to the assertion shape's ability to pass without
  observing anything on that path.

## Triage
verdict: confirmed — independently re-verified: the excerpt reproduces byte-for-byte at tests/execution-status-progress-wire.test.ts:216-230 and the it() body carries exactly two checks, `writtenLines.every(...)` (true on `[]` by Array.prototype.every's definition) and a `seq` assertion wrapped in `if (writtenLines.length > 0)` (skipped on `[]`), with no length pin anywhere — so a zero-line outcome passes the test while its name claims proof of "never partially writes and does not advance seq", contradicting the file header's own "none of them are vacuous"; a scratch runtime probe of the identical drive (removed afterwards) shows the current outcome is 1 line / 285 bytes / seq 1 (c1's message is clamped to 200 chars by clampProgressField before emitWireLine, c2 is rate-clamped in the same clock instant), so the test is green today and the missing `toHaveLength(1)` is what leaves the empty path unobserved; stated searches reproduce (0 hits for `L3-B22|never partially writes` in docs/bugs/, 0 hits for the filename in docs/reference/coverage-matrix.md); location under tests/, D7 assertion-cannot-fail/conditional-skip class, no carve-out binds (not a *gate* file; writtenLines is a recording double but this is a positive-fact assertion, not a MUST-NOT witness; no it()/describe() merge/rename/delete proposed); not a duplicate — PTQ-0667 (fakeHostApi/fakeEntry/ARGS trio) and same-wave d7-01 (recordingPublish/FAKE_CHILD) track harness duplication in this file, d7-02/03 target child-tap B30/B29; fix is a one-line length assertion ahead of the size/seq checks (triage: claude-fable-5-1)
