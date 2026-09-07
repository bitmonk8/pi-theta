# Bug 0464 — on-session settle bound (60 s total) fails every legitimately long tool-loop turn

- **Status:** fixed in 0.461.0
- **Severity:** production-blocking for tool-heavy thetas (any on-session turn whose
  tool loop legitimately runs longer than 60 s)
- **Found by:** dogfooding — the `/quality-loop` self-review pipeline's first real
  run: all 18 review children failed identically; a probe theta isolated the child
  error to `invoke_callee` / inner `transport` with the settle-phase stem.

## Symptom

Any `@`-query whose turn (model streaming plus its tool-call rounds) runs longer
than 60 seconds settles as a loud transport error —
`on-session turn did not settle: the run never completed and its reply never
landed (waited 60000ms)` — while the underlying run is still healthily
streaming. In subagent mode the child then reports `invoke_callee` with that
transport error as `inner`, and the child process is torn down by the 2 s
teardown kill. A code-review worker reading a 3-file shard (multiple `read` /
`grep` rounds plus a large typed reply) cannot complete inside 60 s, so every
such invocation fails by construction; a fixer running an offline test suite
inside its turn is further out still.

## Reproduction

1. Author a `mode: subagent` theta whose single typed query needs a multi-minute
   tool loop (e.g. read several thousand LOC via `read`, run searches, then
   produce a structured reply).
2. Register it as a `.theta` callable and call it from theta code.
3. The call settles `Err(invoke_callee)` with `inner.kind: "transport"` carrying
   the settle-phase expiry stem at `waited 60000ms`, at almost exactly 60 s.

## Root cause

Bug 0288 §Fix item 4 rightly made every turn-lifecycle wait bounded-and-loud,
but set the end-phase poll budget to `TURN_END_POLL_BOUND = 6000` polls × 10 ms
= 60 s total — a value chosen for diagnosability at test scale, not for
production turns. The bound is a fixed TOTAL, not an inactivity bound, so it
cannot distinguish a zombie run from a long healthy one.

## Fix

`TURN_END_POLL_BOUND` raised 6000 → 180000 polls (30 minutes), the ceiling for
one on-session turn's settle phase. Witness-harness wall time is unaffected —
the 0288 witnesses drive `#pollWhile` on an injected fake `Clock` with
poll-count-scripted session doubles, so the expiry cells still complete in
milliseconds of real time. The bound value is exported as
`TURN_END_SETTLE_BOUND_MS` so the witness below reds loudly on any regression
back toward a test-scale total.

**Recorded follow-up (not in this fix):** replace the fixed total with an
inactivity-reset budget — renew on observed turn progress (message-slice
growth), keep a short bound for genuine no-progress zombies. That restores
0288's fast-diagnosis property without capping healthy long turns.

## Witness

`tests/b0464-turn-settle-bound-floor.test.ts` — pins
`TURN_END_SETTLE_BOUND_MS` at exactly 1,800,000 ms with a re-derive-in-same-
commit instruction, and documents why a test-scale value is a production
regression. The 0288 settle-expiry cell (`b0288-prompt-turn-completion-witness`
(iii)) continues to pin the loud-expiry behaviour itself, bound-agnostically.
