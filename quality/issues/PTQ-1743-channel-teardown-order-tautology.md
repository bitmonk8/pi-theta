---
id: PTQ-1743
title: The result-channel factory test sets its teardown-order witness to true inside close itself.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-result-channel-factory.test.ts:57-67
  - tests/subagent-result-channel-factory.test.ts:82-86
  - tests/subagent-result-channel-factory.test.ts:125-138
sites: 1
fix_scope: localized
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# The result-channel factory test sets its teardown-order witness to true inside close itself.

## Observation
The factory test names closing the channel "after the teardown" as part of its contract. Its `teardownSawOpenChannel` variable starts undefined and becomes true inside the channel's `close` wrapper, without consulting teardown. The subsequent assertion on that variable therefore repeats the fact that close ran, rather than observing its order relative to teardown.

## Evidence
`tests/subagent-result-channel-factory.test.ts:82-86`:
```ts
  it("first compose dials (here: the injected client); a repeat session_start hands the LIVE client back in; session_shutdown closes it exactly once, after the teardown", async () => {
    const harness = makeHarness(workspace);
    const client = fakeClient();
    const handedIn: (ResultChannelClient | undefined)[] = [];
    let teardownSawOpenChannel: boolean | undefined;
```

`tests/subagent-result-channel-factory.test.ts:57-67`:
```ts
function fakeClient(): ResultChannelClient & { closed: number } {
  const client = {
    closed: 0,
    writeLine: (): void => {},
    stderr: (): void => {},
    close: (): void => {
      client.closed += 1;
    },
  };
  return client;
}
```

`tests/subagent-result-channel-factory.test.ts:125-138`:
```ts
    // Observe ordering: the channel is still open while the teardown runs.
    const originalClose = client.close;
    client.close = (): void => {
      teardownSawOpenChannel = teardownSawOpenChannel ?? true;
      originalClose();
    };
    await harness.fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
    expect(client.closed).toBe(1);
    expect(teardownSawOpenChannel).toBe(true);

    // A re-delivered shutdown finds nothing to close.
    await harness.fire("session_shutdown", { type: "session_shutdown", reason: "quit" });
    expect(client.closed).toBe(1);
```

## Why this is a problem
This is the D7 assertions-that-cannot-fail class for the asserted ordering witness, under AGENTS.md's "Assert on real observables" principle. Given the preceding successful `client.closed === 1` assertion, the wrapper necessarily executed and assigned `undefined ?? true`, so `expect(teardownSawOpenChannel).toBe(true)` cannot independently fail. Executing close before teardown, after teardown, or without teardown produces the same boolean. The call-count assertions remain meaningful; the finding concerns the purported ordering assertion, not those assertions or production behavior.

## False-positive check
- Gate-pin: this is a lifecycle test, not a census/inventory gate; no expected inventory is challenged.
- Recording-double: the close counter is a legitimate recorder. Its positive count assertion is retained as meaningful; the boolean records no second event and is not a MUST-NOT witness.
- docs/bugs/ signature search: `rg -n 'teardownSawOpenChannel|marshals the STORED load-time closure hash|first compose dials|makeSchedulerRig|SchedulerRig|WatchdogRig' docs/bugs docs/reference/coverage-matrix.md` returned no matches. The file-name search found bug 0493's note that this test imports inert watchdog seams, not a documented correct-reason red for channel ordering.
- Coverage-matrix/bug-doc citation search: `rg -n 'subagent-model-theta-tool|subagent-parent-watchdog|subagent-result-channel-factory|marshals the STORED|first compose dials|two session_start composes' docs/reference/coverage-matrix.md docs/bugs` found no coverage-matrix entry; the result-channel file appears only in bug 0493's inert-seams note. No merge, rename, or deletion is proposed.
- Prior-filing check: searches for `teardownSawOpenChannel` in quality/intake, quality/issues, and quality/resolved found no existing report before this filing. PTQ-0689 concerns the outcome-event/shutdown-request name in subagent-fn-child-launch, not this assertion.
- History check: the file's latest commit is `9d2592ed` (bug-0493 review round 1); the cited bug note concerns watchdog seams and does not justify this boolean as an ordering observable.
- Coverage boundary: the claim is solely about an existing assertion's mechanical implication and its named interpretation, not about whether ordering has witnesses elsewhere or needs additional tests. No production defect is alleged.

## Triage
verdict: confirmed — The excerpts and stated searches reproduce: teardownSawOpenChannel is assigned only inside close, so the preceding closed === 1 assertion guarantees its true value without observing teardown order; this is an in-scope D7 assertion-that-cannot-fail, with no duplicate, resolved prescription, or applicable carve-out found. (triage: claude-opus-5-5)
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
