---
id: PTQ-0911
title: The L3-B22 "over-4096-byte line drops, seq not consumed" test cannot construct an over-4096-byte line and cannot tell a size-drop from a rate-drop
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-progress-wire.test.ts:190-199
sites: 1
fix_scope: localized
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# The L3-B22 "over-4096-byte line drops, seq not consumed" test cannot construct an over-4096-byte line and cannot tell a size-drop from a rate-drop

## Observation
`tests/execution-status-progress-wire.test.ts`'s L3-B22 test is named "an
over-4096-byte line drops (counted), seq not consumed, no partial write" and
its body says it drives "a fault-injected oversized builder path". It builds
a `hugeMessage` of `PROGRESS_WIRE_MAX_LINE_BYTES + 100` (4196) `"m"`
characters and passes it as `{ message: hugeMessage }` to the tool's
`execute`. But `clampAuthorMessage` in
`src/extension/execution-status/progress-tool.ts:156-176` clamps `message`
to `PROGRESS_MESSAGE_CLAMP_CHARS` (200, per the L3-B10 test in the sibling
`execution-status-progress-tool.test.ts:243-256`) before the wire line is
ever built, and `emitWireLine`'s own comment
(`src/extension/execution-status/progress-tool.ts:323-325`) states "post-clamp
lines fit by construction, so this is a defensive floor" — i.e. an
over-4096-byte line cannot occur via this input. Separately, the test issues
its two `execute()` calls back-to-back on a fresh `FakeClock` with no
`clock.advance(...)` between them, so the second call falls inside the
200ms rate window and is dropped by the unrelated rate-clamp, not by any
size gate.

## Evidence
`tests/execution-status-progress-wire.test.ts:190-199`:
```
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

`src/extension/execution-status/progress-tool.ts:319-326` (the size gate the
test's name targets, with its own comment confirming the input can never
reach it):
```
  // PIC-74 emission bound: post-clamp lines fit by construction, so this is a
  // defensive floor — an over-cap line is DROPPED (folded into the next
  // line's `dropped`), never truncated mid-JSON and never split. `seq` is not
  // consumed by a line that never reached the wire.
  if (Buffer.byteLength(line, "utf8") > PROGRESS_WIRE_MAX_LINE_BYTES) {
    state.droppedSinceAccept += 1;
    return;
  }
```

`src/extension/execution-status/progress-tool.ts:163-166` (the clamp that
runs before the size gate ever sees the payload):
```
  return {
    message: clampProgressField(fields.message, PROGRESS_MESSAGE_CLAMP_CHARS),
```

`tests/helpers/fake-clock.ts:34-36` (no auto-advance, so both `execute()`
calls in the test above land at the same `now()`):
```
  constructor(options: FakeClockOptions = {}) {
    this.#now = options.now ?? 0;
    this.#wallEpoch = options.wallEpoch ?? 0;
  }
```

## Why this is a problem
Tracing the actual execution: `hugeMessage` is clamped to 200 characters
before `emitWireLine` builds the JSON line, so the built line for `c1` is
always well under 4096 bytes and is accepted (not size-dropped); `c2` then
executes at the same fake-clock instant as `c1` with no
`clock.advance(...)` between them, so it is dropped by the unrelated
200ms rate-clamp. The result is `writtenLines` containing exactly one
line — `c1`'s clamped, size-conforming line with `seq: 1` — regardless of
whether the size-drop branch at `progress-tool.ts:323-325` exists, is
removed, or is broken. The `expect(writtenLines.every(...)).toBe(true)`
assertion is true of any array of clamped lines, size gate or not, and the
`if (writtenLines.length > 0)` guard around the only assertion that
mentions `seq` means that guard's assertion would be silently skipped (not
failed) if the implementation instead dropped `c1` too — the test cannot
distinguish "the size gate fired and preserved the seq counter" from "no
line was size-gated at all, for an unrelated reason." A reader following the
name "an over-4096-byte line drops … seq not consumed" would expect the test
to construct and observe that drop; the body instead exercises the ordinary
200ms rate-drop path on an always-in-range line.

## Suggested direction (non-binding, optional)
Exercising the size gate itself would need either a fixture that survives
`clampAuthorMessage` at an over-4096-byte size (none of the schema's fields
currently permit that, per the schema in the `L3-B1` registration test) or a
seam that lets the test construct the pre-clamped `ProgressAuthorMessage`
directly, bypassing `clampAuthorMessage`, so `emitWireLine`'s own gate is the
one under observation.

## False-positive check
- Gate-pin carve-out: the file is not `*gate*.test.ts`; not applicable.
- Recording-double carve-out: not applicable; no recording double is
  involved.
- Documented correct-reason red carve-out: the test is green (not red);
  `grep -rn "L3-B22" docs/bugs/` → 0 hits, so there is no open bug pinning
  this test's current shape.
- coverage-matrix/bug-doc citation search: `grep -n "L3-B22"
  docs/reference/coverage-matrix.md` → 0 hits; no pinned citation, and no
  merge/rename/delete of this test is proposed.
- Traced the actual data flow (clamp before size-gate, no clock advance
  between calls) by reading `clampAuthorMessage`, `emitWireLine`, and
  `FakeClock`'s constructor immediately before filing, rather than inferring
  behaviour from the test's own comments.

## Triage
verdict: confirmed — independently re-verified: the excerpt reproduces byte-for-byte at tests/execution-status-progress-wire.test.ts:190-204 (filing's 190-199 is trivially short), `clampAuthorMessage` at progress-tool.ts:156-176 clamps `message` via `clampProgressField(…, PROGRESS_MESSAGE_CLAMP_CHARS)` (= 200 at types.ts:52; `.slice(0, 200)` on UTF-16 units so even worst-case escaping bounds the field near 600 bytes, `scope` at 64 chars, `done`/`total` integers, `additionalProperties: false` at :62-72 — no tool input can build a line over PROGRESS_WIRE_MAX_LINE_BYTES = 4096 at types.ts:57), the size gate at :321-325 carries the quoted "post-clamp lines fit by construction … defensive floor" comment, FakeClock (tests/helpers/fake-clock.ts:34-36, `now()` never implicitly advanced) puts both execute() calls at t=0 so `c2` hits the PROGRESS_MIN_INTERVAL_MS branch at :236-242 not the size gate; a scratch vitest probe of the identical drive (under $TEMP, removed) shows 1 line / 285 bytes / seq 1 / message.length 200, and after `advance(200)` a third call ships seq 2 with `dropped: 1` — confirming `c2`'s drop was the rate clamp; stated searches reproduce (0 hits for `L3-B22` in docs/bugs/ and docs/reference/coverage-matrix.md); location under tests/, D7 misleading-name class per the PTQ-0266/0280 precedent (describe/it assert an observed "over-4096-byte line drops … seq not consumed" / "fault-injected oversized builder path" that the body cannot construct), no carve-out binds (not a *gate* file, writtenLines is a positive-fact recording not a MUST-NOT witness, test is green, no merge/rename/delete of a pinned test proposed); NOT a duplicate of PTQ-0785 — that issue's root cause is the assertion shape passing vacuously on `[]` and its one-line `toHaveLength(1)` fix leaves the name/body mismatch untouched (its triage note explicitly disclaimed any claim about what the body exercises); fix-time note: the suggested direction's "no field permits it" holds for tool input, but the gate IS reachable in-test via the registry root's `invocationId` (`fakeEntry({ invocationId })` is interpolated verbatim into the line at :310-317), so a rename or a re-drive through that seam are both available (triage: claude-fable-5-1)
