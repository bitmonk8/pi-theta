---
id: PTQ-0903
title: Two L3-B13/L3-B15 progress-tool tests assert only resolves.toBeDefined(), which cannot fail given the production catch-all
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-progress-tool.test.ts:326-342
  - tests/execution-status-progress-tool.test.ts:364-373
sites: 2
fix_scope: localized
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Two L3-B13/L3-B15 progress-tool tests assert only resolves.toBeDefined(), which cannot fail given the production catch-all

## Observation
`tests/execution-status-progress-tool.test.ts` contains two tests (L3-B13 and
L3-B15) whose only assertion on the drive itself is
`await expect(calls[0]!.execute(...)).resolves.toBeDefined()`. The production
function under test, `executeThetaProgress` in
`src/extension/execution-status/progress-tool.ts:214-259`, wraps its entire
body in `try { … } catch { return OK_RESULT; }` (lines 216 and 254-258,
labelled `allow-broad-catch: EXST-9`). Any exception thrown anywhere inside —
including one thrown by a test double standing in for `entryChannel.append`
or by an undefined `bus` — is swallowed and the function always resolves
with the same fixed `OK_RESULT`. Because of this catch-all, the promise
`calls[0]!.execute(...)` returns can never reject, so
`.resolves.toBeDefined()` (which is always true of a defined, always-present
success envelope) cannot fail regardless of what happens inside the call.

## Evidence
`src/extension/execution-status/progress-tool.ts:214-258` (the catch-all that
makes the promise unconditionally resolve):
```
function executeThetaProgress(
  params: ThetaProgressParams,
  deps: ProgressToolDeps,
  state: ProgressToolState,
): AgentToolResult<unknown> {
  try {
    …
    return OK_RESULT;
  } catch { // allow-broad-catch: EXST-9 — execution-status.md#exst-9
    // EXST-9/EXST-13: a defective latch, sink, or writer drops the
    // publication; the tool never surfaces an error result to the tool loop.
    return OK_RESULT;
  }
}
```

`tests/execution-status-progress-tool.test.ts:326-342` (L3-B13 — the double
throws on the forbidden call, but the assertion relying on that throw
surfacing is the vacuous one):
```
describe("T-PRG — L3-B13: dead entry channel — bus still publishes, no milestone, NEVER a sendMessage fallback", () => {
  it("appendMilestone is never attempted/never fallback-delivered when the channel is dead", async () => {
    const { bus, authorMessageCalls } = fakeBus();
    const entryChannel: EntryChannelHandle = {
      live: () => false,
      append: (): boolean => {
        throw new Error("append (message-channel fallback) MUST NOT be called for milestones — EXST-14");
      },
      appendMilestone: (): boolean => false,
    };
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ bus: () => bus, entryChannel }));
    await expect(
      calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never),
    ).resolves.toBeDefined();
    expect(authorMessageCalls).toHaveLength(1);
  });
});
```

`tests/execution-status-progress-tool.test.ts:364-373` (L3-B15 — the same
vacuous assertion, followed by a real check on `milestoneCalls`):
```
describe("T-PRG — L3-B15: bus latch undefined but registry live — milestone still appended, no throw", () => {
  it("a raced bus latch does not stop the milestone append", async () => {
    const { entryChannel, milestoneCalls } = fakeEntryChannel();
    const { hostApi, calls } = fakeHostApi();
    registerThetaProgressTool(hostApi, baseDeps({ bus: () => undefined, entryChannel }));
    await expect(
      calls[0]!.execute("c1", ARGS, undefined, undefined, {} as never),
    ).resolves.toBeDefined();
    expect(milestoneCalls).toHaveLength(1);
  });
});
```
Exact search for the pattern in the wave's scoped files: `grep -n
"resolves\.toBeDefined()" tests/execution-status-progress-tool.test.ts
tests/execution-status-progress-wire.test.ts tests/execution-status-child-tap.test.ts
tests/extension-bootstrap-sink-liveness.test.ts tests/frontmatter-contract.test.ts
tests/frontmatter-tool-loop-respond-repair.test.ts` → 2 hits, both shown above;
no other file in scope uses the pattern.

## Why this is a problem
For L3-B13, the test's own name promises to verify that `appendMilestone`
"is never attempted/never fallback-delivered when the channel is dead" — the
double is built specifically to throw if the forbidden `append` path is ever
taken. But because `executeThetaProgress`'s outer `try/catch` swallows any
exception and always returns `OK_RESULT`, a regression that DID call
`entryChannel.append()` would throw inside the try block, be caught, and
still resolve to `OK_RESULT` — so `.resolves.toBeDefined()` would pass
identically whether or not the forbidden call happened. The double never
records a call count the test could assert `=== 0` on (the
"legitimate recording-double negative witness" shape); it only throws, and
that throw is the one signal this specific production catch-all is
documented to erase. Mechanically: for both L3-B13 and L3-B15, the assertion
`resolves.toBeDefined()` is true under every possible internal behaviour of
`executeThetaProgress`, because the function's only two possible returns are
`OK_RESULT` via the normal path or `OK_RESULT` via the catch-all — there is
no code path that produces `undefined` or a rejection.

## Suggested direction (non-binding, optional)
For L3-B13 in particular, a recording double that counts `append` calls (as
`entryChannel` doubles elsewhere in this same file already do for
`appendMilestone`/`milestoneCalls`) and an assertion on that count would give
the "never attempted" claim in the test's name something that can actually
fail.

## False-positive check
- Gate-pin carve-out: the file name is not `*gate*.test.ts` and neither
  `describe` block pins an inventory/count that this finding disputes — not
  applicable.
- Recording-double carve-out: verified the `entryChannel` double in L3-B13
  throws rather than records a call count, so it is not the "negative witness
  through a recording double" shape the carve-out protects; confirmed by
  reading `EntryChannelHandle`'s three call sites in the excerpt above.
- Documented correct-reason red carve-out: both tests pass (not red); `grep
  -rn "L3-B13\|L3-B15" docs/bugs/` → 0 hits, so there is no open bug pinning
  this shape as an expected-red.
- coverage-matrix/bug-doc citation search: `grep -n "L3-B13\|L3-B15"
  docs/reference/coverage-matrix.md` → 0 hits; no pinned citation by these
  row names, so no merge/rename/delete concern arises (none proposed here).
- Confirmed the catch-all's unconditional-resolve behaviour by reading
  `src/extension/execution-status/progress-tool.ts:214-258` immediately
  before filing (excerpt above).

## Triage
verdict: confirmed — independently re-verified: both test excerpts reproduce verbatim at tests/execution-status-progress-tool.test.ts:326-342 and :364-373 and the production excerpt at src/extension/execution-status/progress-tool.ts:214-258; `execute` is `async (_id, params) => executeThetaProgress(params, deps, state)` (:376) with nothing outside the `try`, every return in both arms is the frozen constant `OK_RESULT` (:97-101), so the promise can neither reject nor resolve `undefined` and `.resolves.toBeDefined()` registers nothing — and for L3-B13 the throwing `append` double is an inert negative witness because `bus.authorMessage` fires before `appendMilestone` (:283-291), so a regression calling `append` would leave `authorMessageCalls` at 1 and still pass; stated searches reproduce (`resolves\.toBeDefined()` → exactly :340/:371 across the six scoped files; `L3-B13|L3-B15` → 0 in docs/bugs/ and coverage-matrix.md; docs/bugs/0477 cites the file only for `codeSideExecute`), both tests green (2/2), file is not a gate, no merge/rename/delete proposed; D7 assertion-cannot-fail class, both locations under tests/, same class as confirmed PTQ-0242/PTQ-0818 which cite different files; not tracked elsewhere (PTQ-0293/PTQ-0667/PTQ-0852 and sibling intake d7-02/d7-05 target duplication/naming, not these assertions) (triage: claude-fable-5-1)
