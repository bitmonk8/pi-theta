---
id: PTQ-1742
title: Owned-turn cancellation-precedence tests check the fixture's abort reason rather than the selected turn result.
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0501-no-abort-owned-relocation.test.ts:37-38
  - tests/b0501-no-abort-owned-relocation.test.ts:59-65
  - tests/b0501-no-abort-owned-relocation.test.ts:94-102
  - tests/b0501-no-abort-owned-relocation.test.ts:149-153
  - tests/b0503-owned-turn-boundaries.test.ts:95-100
  - tests/b0503-owned-turn-boundaries.test.ts:219-225
sites: 2
fix_scope: cross-module
wave: qw20261028153325
reported_by: lens-d7-testquality (openai/gpt-6.1-sol)
date: 2026-10-28
---

# Owned-turn cancellation-precedence tests check the fixture's abort reason rather than the selected turn result.

## Observation
Two test declarations name cancellation precedence over a completed own reply; the first declaration expands over two relocation shapes, and the second also names foreign interleaving. Each fixture directly aborts the same controller whose reason the test subsequently checks, while the returned turn result is discarded. The shared turn wrappers assert send/cleanup bookkeeping but return the driver result without classifying it. Once the fixture's abort executes, the reason equality follows from that abort, not from which result the driver selected.

## Evidence
First declaration, `tests/b0501-no-abort-owned-relocation.test.ts:149-153`:
```ts
  it.each(["prior-edit", "split-turn"] as const)("theta cancellation outranks %s own reply", async (shape) => {
    const r = rig(shape, { cancel: true });
    await r.turn();
    expect(r.thetaAbort.signal.reason).toBe(r.cancelReason);
  });
```

Its controller and reason, `tests/b0501-no-abort-owned-relocation.test.ts:37-38`:
```ts
  const thetaAbort = new AbortController();
  const cancelReason = new Error("parent cancelled");
```

The fixture supplies both the reply and abort, `tests/b0501-no-abort-owned-relocation.test.ts:59-65`:
```ts
    if (shape !== "unanswered" && options.ownReply !== false) sm.appendMessage(assistant("777"));
    if (options.foreign) {
      sm.appendMessage(user("foreign query"));
      sm.appendMessage(assistant("222"));
    }
    if (options.cancel) thetaAbort.abort(cancelReason);
    idle = true;
```

The wrapper does not classify the result, `tests/b0501-no-abort-owned-relocation.test.ts:94-102`:
```ts
  async function turn() {
    const result = await model.nextFreePhaseTurn(0);
    expect(sends).toEqual([QUERY]);
    expect(notes, "relocation does not authorize a continuation").toEqual([]);
    expect(timers.size, "idle-race timer cleared").toBe(0);
    expect(capture, "capture detached").toBeUndefined();
    return result;
  }
  return { sm, model, turn, thetaAbort, cancelReason, start, polls: () => polls };
```

Second declaration, `tests/b0503-owned-turn-boundaries.test.ts:219-225`:
```ts
  it("thetaAbort outranks a committed own reply and interleaving", async () => {
    const reason = new Error("parent cancel");
    const r = rig((r) => { finish(r, assistant(), assistant("222")); r.thetaAbort.abort(reason); });
    await turn(r);
    expect(r.thetaAbort.signal.reason).toBe(reason);
    expect(r.notes).toEqual([]);
  });
```

Its wrapper, `tests/b0503-owned-turn-boundaries.test.ts:95-100`:
```ts
async function turn(r: Rig) {
  const result = await r.model.nextFreePhaseTurn(0);
  expect(r.sends).toHaveLength(1);
  expect(r.timers.size, "idle-race timer always cleared").toBe(0);
  return result;
}
```

## Why this is a problem
This is D7's misleading-test-name class: a reader following either name would infer that returning the own reply instead of cancellation makes the test fail. The bodies instead verify an input-side controller state and housekeeping. `AbortController` retains its first abort reason; after the fixture calls `abort(reason)`, returning a text result instead of a cancellation result cannot change the reason equality. The existing assertions therefore do not distinguish the two selections named by these tests, even though send or cleanup failures can still make the tests fail. This is an observation about two existing test bodies, not a request for additional cancellation cases or a claim that the production driver selects the wrong result today.

## False-positive check
- Gate-pin: read both declarations and their wrappers; neither is a census/inventory gate, and no pinned expected count is disputed.
- Recording-double: send/timer/note assertions are retained as legitimate witnesses. The claim concerns the named result precedence, not a negative recording assertion.
- docs/bugs/ signature search: read the relevant evidence sections of `docs/bugs/0501-no-abort-compaction-anchor-drift-expires-settle-bound.md` and `docs/bugs/0503-foreign-turn-from-deferred-prompt-bound-as-query-result.md`. They record regression and control results; this finding does not concern a skipped or intentionally red test, or contest those failure signatures.
- Coverage-matrix/bug-doc citation search: `rg -n -F -e 'theta cancellation outranks' -e 'thetaAbort outranks a committed own reply and interleaving' docs/reference/coverage-matrix.md docs/bugs` returned zero matches. The files themselves are cited in the 0501 report's evidence list and the 0503 report's additional-coverage paragraph. No merge, rename or deletion of these tests is proposed.
- Existing-topic check: searched `quality/` Markdown for `theta cancellation outranks`, `thetaAbort outranks`, `OwnedTurnAttempt` and `FinalizationEvidenceRetention`; the only returned report was the production-boundary D4 candidate, which concerns a different observation.
- Intent/history: `git show 22d1e095:tests/b0501-no-abort-owned-relocation.test.ts` and `git show 8b26ca9c:tests/b0503-owned-turn-boundaries.test.ts` contain these same names and input-reason assertions. The review does not infer a production bug from them.
- Coverage boundary: the issue is the mismatch between the names and existing assertions. No missing-path, suite-composition, E2E-posture or production-code finding is made.

## Triage
verdict: confirmed — Both declarations discard the driver result and check the same abort reason their fixtures directly set; their wrappers assert only bookkeeping, so selecting an own reply would not invalidate the named precedence assertions. Excerpts and history reproduce; no applicable carve-out, resolved prescription or duplicate was found. (triage: claude-opus-5-5)
