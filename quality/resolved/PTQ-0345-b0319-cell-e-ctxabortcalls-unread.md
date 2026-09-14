---
id: PTQ-0345
title: b0319 cell (E)'s throw-handling assertions never read ctxAbortCalls, so they hold identically whether ctx.abort() is invoked at all
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:419-438
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:614-634
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:636-644
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:465-478
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914130212
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0319 cell (E)'s throw-handling assertions never read ctxAbortCalls, so they hold identically whether ctx.abort() is invoked at all

## Observation
Cell (E) in tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts is
named "a throw from the ctx.abort() forwarding listener does not crash the
drive and does not swallow the cancellation". Its `ctx` double's `abort`
callback increments a local `ctxAbortCalls` counter and then throws, but the
cell never reads `ctxAbortCalls` in any `expect` call. The cell's only two
checks are `hook.assertFired()` — which asserts a variable the test's own
`onQuantum` hook set when IT called `thetaAbort.abort()`, unrelated to
`ctx.abort()` — and `execution.outcome === "cancel"`, which the file's own
comment on the adjacent cell (A) states is settled by "the compensating
`#pollWhile` gate" and "stays true both before and after the fix" regardless
of `ctx.abort()`. Sibling cells (A), (B), (C) and (G) in the same file each
assert on `ctxAbortCalls` directly; cell (E) is the one cell whose name is
specifically about what happens when `ctx.abort()` is called and throws, yet
it is the one cell that never checks whether `ctx.abort()` was called at all.

## Evidence

tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:419-438 — the
shared hook cell (E) uses; `assertFired()`'s only assertion is on
`record.quantum`, a value set by the test's own call to `thetaAbort.abort()`,
never by `ctx.abort()`:
```ts
function midTurnAbortHook(thetaAbort: AbortController, record: { quantum: number }): {
  onQuantum: (q: number, session: ScriptedLiveSession) => void;
  assertFired: () => void;
} {
  const atQuantum = 4;
  return {
    onQuantum: (q, session): void => {
      if (record.quantum === -1 && q >= atQuantum && !session.isIdle()) {
        record.quantum = q;
        thetaAbort.abort(shutdownReason());
      }
    },
    assertFired: (): void => {
      expect(
        record.quantum,
        "the cell's premise: the abort must land while the driven run is observably streaming — " +
          "if it never fired the harness did not reach the in-flight seam",
      ).toBeGreaterThan(0);
    },
  };
}
```

tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:614-634 — cell
(E)'s body: `ctxAbortCalls` is declared and incremented in the `ctx.abort`
double, then never appears again in the cell:
```ts
  it("(E) a throw from the ctx.abort() forwarding listener does not crash the drive and does not swallow the cancellation (fixed behaviour; vacuously green at fork)", async () => {
    let ctxAbortCalls = 0;
    const thetaAbort = new AbortController();
    const record = { quantum: -1 };
    const hook = midTurnAbortHook(thetaAbort, record);

    // cancellation.md:15 (§Forwarding-listener throw): a throw from the listener
    // "is trapped at the listener boundary … The trap MUST NOT swallow the
    // cancellation itself." At fork ctx.abort() is never called, so the throw
    // never fires and the cell is vacuously green; post-fix it exercises the
    // try/catch the fix wraps around ctx.abort().
    const { execution } = await driveLiveTheta(ONE_QUERY_THETA, MID_TURN_SCRIPT, {
      ctx: {
        abort: () => {
          ctxAbortCalls += 1;
          throw new Error("ctx.abort boom");
        },
      },
      thetaAbort,
      onQuantum: hook.onQuantum,
    });
```

tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:636-644 — the
cell's only two assertions, neither of which names `ctxAbortCalls`:
```ts
    hook.assertFired();
    // The drive resolved (driveLiveTheta already re-throws any executeBody
    // rejection): a listener throw must not propagate out of the drive.
    expect(
      execution.outcome,
      `the cancellation survives a forwarding-listener throw; observed error ` +
        `${JSON.stringify(execution.error)}`,
    ).toBe("cancel");
  });
```

tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:465-478 — the
sibling cell (A), showing both the pattern cell (E) omits (asserting on
`ctxAbortCalls` directly) and the file's own statement that `execution.outcome`
is independent of `ctx.abort()`:
```ts
    expect(
      ctxAbortCalls,
      "bug 0319: a thetaAbort fired while a prompt-mode user turn is in flight MUST call the " +
        "unwrapped ctx.abort() to tear down the run; at fork no production path calls it",
    ).toBeGreaterThanOrEqual(1);
    // The theta's own Result still answers cancel promptly (the compensating
    // `#pollWhile` gate, production-theta-producer.ts:5284-5285) — this stays true
    // both before and after the fix and pins that the fix does not regress it.
    expect(
      execution.outcome,
      `an aborted in-flight query settles the cancel terminal outcome; observed error ` +
        `${JSON.stringify(execution.error)}`,
    ).toBe("cancel");
```

Search: `grep -n "ctxAbortCalls," tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts`
→ 5 hits, at lines 466, 507, 548, 691 (cells A, B, C, G — each inside an
`expect(ctxAbortCalls, …)` call) and none inside cell (E) (lines 614-644) or
cell (D) (lines 558-612, which measures an independent race-timing budget and
is not part of this claim).

## Why this is a problem
Cell (E)'s name asserts two properties specifically of the `ctx.abort()`
throw-handling path: it "does not crash the drive" and it "does not swallow
the cancellation". Both properties presuppose `ctx.abort()` was actually
invoked. But every expression the cell's `expect` calls examine —
`record.quantum` (via `hook.assertFired()`) and `execution.outcome` — takes
the identical value whether `ctx.abort()` is invoked and its throw trapped,
or `ctx.abort()` is never invoked at all: `record.quantum` is set by the
test's own call to `thetaAbort.abort()`, never by anything inside `ctx.abort`,
and `execution.outcome` is settled by the pre-existing compensating
`#pollWhile` gate that cell (A)'s own adjacent comment states "stays true
both before and after the fix" — i.e., independent of whether the reverse
listener exists. The cell's own comment confirms the premise: "At fork
ctx.abort() is never called, so the throw never fires and the cell is
vacuously green" — meaning at HEAD this cell passes for a reason unconnected
to the throw it names, and nothing in the cell distinguishes that state from
one where the throw fires and is correctly trapped. This is the D7
"Assertions that cannot fail" class: the cell cannot mechanically
discriminate "the throw is trapped and cancellation preserved" from "the
reverse listener does not exist", which is exactly the distinction its own
name promises and exactly the distinction sibling cells (A), (B), (C) and (G)
draw by asserting on `ctxAbortCalls` directly.

## Suggested direction (non-binding, optional)
None offered beyond the observation above — the fix stage owns whether the
cell adds an assertion on `ctxAbortCalls` (mirroring cells A/B/C/G) or is
reshaped some other way.

## False-positive check
- Gate-pin check: tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts
  does not match `*gate*.test.ts` or the named kin; not applicable.
- Recording-double / MUST-NOT witness check: this is not a case of a
  legitimate negative ("never called") witness built on a recording double —
  `ctxAbortCalls` is recorded but this cell asserts NOTHING about it, in
  either direction; there is no MUST-NOT assertion here for the carve-out to
  protect.
- Documented correct-reason red check: this is not a silent-skip filing — the
  cell is GREEN (passing) at HEAD, not red, so the "documented correct-reason
  red" carve-out does not apply; the claim is that a currently-passing
  assertion cannot discriminate the behaviour its own name states, which is
  the "assertions that cannot fail" class, not a skip. `npx vitest run
  tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts` → 7 passed (7)
  at HEAD, confirming the cell is green, not disabled.
- docs/bugs/ signature search: docs/bugs/0319-prompt-mode-bidirectional-ctx-abort-unwired.md
  is Status "fixed (0.339.0)"; it names this test file as its witness but
  does not discuss cell (E)'s internal assertion shape or defend the omission
  of a `ctxAbortCalls` check as intentional.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0319-prompt-bidirectional-ctx-abort-witness" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the cell —
  only that its assertions do not verify what its name states — so no
  witness-list citation is affected.
- Coverage-drift check: this is not a claim that a behaviour is untested —
  `ctx.abort()`'s try/catch (src/extension/production-theta-producer.ts,
  the `onThetaAbortTeardown` closure) is a real, reachable production code
  path this cell's own scenario (a mid-turn abort with a throwing `ctx.abort`)
  does exercise; the claim is narrowly that this cell's own `expect` calls do
  not observe whether that path ran.
- Already-filed/resolved overlap check: searched quality/issues,
  quality/resolved and quality/intake for "b0319" — three hits
  (PTQ-0231-b0319-execution-defined-tautology.md, resolved, a tautology in the
  shared `driveLiveTheta` harness at lines 476-514 concerning a different
  variable (`execution`) and a different mechanism (a `.then`/`.then` promise
  race); PTQ-0328-b0319-scriptedlivesession-harness-duplicated.md, about
  cross-file harness duplication, already fixed; PTQ-0329-b0319-virtualclock-reimplements-fakeclock.md,
  about the clock double, already fixed). None of the three names cell (E),
  `ctxAbortCalls`, or lines 419-438/614-644, and this finding's root cause
  (an unread recorded value in one specific cell) is distinct from all three.
- Not a bug-shape claim: `ctx.abort()`'s try/catch is confirmed present and
  correctly wired in current production code
  (src/extension/production-theta-producer.ts, the `onThetaAbortTeardown`
  closure: `try { this.#ctx.abort(); } catch (thrown) { void thrown; }`,
  registered once on `this.#thetaAbort.signal`); this finding does not
  allege that mechanism is wrong, only that this cell's own assertions do not
  verify it ran.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — verified: excerpts match exactly at 419-438/614-644/465-478 (7/7 green at HEAD); neither `hook.assertFired()` (set only by the test's own `thetaAbort.abort()`) nor `execution.outcome==="cancel"` (settled by the compensating `#pollWhile` gate per cell A's own comment) reads `ctxAbortCalls`, and the bug doc's own gate log independently corroborates this (docs/bugs/0319…: "reverting the fix reds exactly (A)/(B)/(D)" — cell (E) stays green with the mechanism fully absent); no coverage-matrix citation, no overlap with PTQ-0231/0328/0329, production try/catch confirmed correctly wired (triage: claude-opus-5)
