---
id: PTQ-0329
title: tests/b0319 hand-rolls a due-time VirtualClock instead of the canonical FakeClock double in tests/helpers/fake-clock.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:285-296
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:303-311
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:314-328
  - tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:490-502
  - tests/helpers/fake-clock.ts:22-27
  - tests/helpers/fake-clock.ts:29-39
  - tests/helpers/fake-clock.ts:49-65
  - tests/helpers/fake-clock.ts:67-79
  - tests/helpers/fake-clock.ts:80-90
sites: 9                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914091051
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# tests/b0319 hand-rolls a due-time VirtualClock instead of the canonical FakeClock double in tests/helpers/fake-clock.ts

## Observation
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts declares a
module-scope `PendingTimer` interface and a `VirtualClock` class (a `#timers`
map keyed by an incrementing sequence number, each entry a `{ due, fn, seq }`
record; `setTimeout` inserts one, `clearTimeout` deletes one, `advance()` bumps
`now`, and `fireDue()` scans the map for entries whose `due` has been reached,
firing them in due order with ties broken by insertion order) to back the
`RuntimeRoot.clock` seam (`src/seams/clock.ts`) it builds for the drive. This
is the same job — a fake, in-memory scheduler for the `Clock` seam
(`now`/`wallNow`/`setTimeout`/`clearTimeout`) that fires pending callbacks once
their deadline is reached, ties broken by registration order — that
`tests/helpers/fake-clock.ts`'s `FakeClock` class already implements and that
56 other test files under tests/ already import for exactly this seam. No
import of `FakeClock` appears anywhere in tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts.

## Evidence

### b0319's hand-rolled scheduler
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:285-296:
```
interface PendingTimer {
  readonly due: number;
  readonly fn: () => void;
  readonly seq: number;
}

class VirtualClock {
  now = 0;
  /** Quanta advanced == poll intervals elapsed == `session.tick()` calls. */
  quanta = 0;
  #seq = 0;
  readonly #timers = new Map<number, PendingTimer>();
```
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:303-311:
```
  setTimeout(fn: () => void, ms: number = POLL_INTERVAL_MS): number {
    const seq = (this.#seq += 1);
    this.#timers.set(seq, { due: this.now + ms, fn, seq });
    return seq;
  }

  clearTimeout(id: number): void {
    this.#timers.delete(id);
  }
```
tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:314-328:
```
  advance(): void {
    this.now += POLL_INTERVAL_MS;
    this.quanta += 1;
  }

  /** Fire every timer whose due time has arrived, in due order (ties by seq). */
  fireDue(): void {
    const due = [...this.#timers.values()]
      .filter((t) => t.due <= this.now)
      .sort((a, b) => a.due - b.due || a.seq - b.seq);
    for (const timer of due) {
      this.#timers.delete(timer.seq);
      timer.fn();
    }
  }
```
The pump that drives it, showing `advance()`/`fireDue()` used as a matched
pair around each quantum, tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts:490-502:
```
  while (!settled) {
    if (clock.quanta >= MAX_PUMP_QUANTA) {
      throw new Error(
        `b0319 pump exceeded ${MAX_PUMP_QUANTA} quanta without the drive settling — ` +
          "the harness never reached a terminal state (unmet precondition: the scripted " +
          "drive must settle on the injected Clock)",
      );
    }
    clock.advance();
    session.tick();
    opts.onQuantum?.(clock.quanta, session);
    clock.fireDue();
    await drainMicrotasks();
  }
```

### The canonical helper doing the same job
tests/helpers/fake-clock.ts:22-27 (the same `{deadline, fn}`-shaped timer
record, one field renamed):
```
interface FakeTimer {
  readonly id: number;
  readonly deadline: number;
  readonly registration: number;
  readonly fn: () => void;
}
```
tests/helpers/fake-clock.ts:29-39 (the same `Map`-of-pending-timers shape):
```
export class FakeClock implements Clock {
  #now: number;
  readonly #wallEpoch: number;
  readonly #timers = new Map<number, FakeTimer>();
  #nextId = 1;
  #registrationCounter = 0;

  constructor(options: FakeClockOptions = {}) {
    this.#now = options.now ?? 0;
    this.#wallEpoch = options.wallEpoch ?? 0;
  }
```
tests/helpers/fake-clock.ts:49-65 (the same insert-on-setTimeout,
delete-on-clearTimeout pair):
```
  setTimeout(fn: () => void, ms: number): TimerHandle {
    const id = this.#nextId++;
    this.#timers.set(id, {
      id,
      deadline: this.#now + ms,
      registration: this.#registrationCounter++,
      fn,
    });
    return id;
  }

  clearTimeout(handle: TimerHandle): void {
    // Deleting an absent key (an already-fired or unknown handle) is a no-op.
    if (typeof handle === "number") {
      this.#timers.delete(handle);
    }
  }
```
tests/helpers/fake-clock.ts:67-79 and :80-90 (the same
filter-by-deadline-then-fire-in-order logic `VirtualClock.fireDue()` repeats,
fused into one call instead of split across `advance()`/`fireDue()`):
```
  /** Synchronously fire every timer whose deadline has elapsed, in deadline order. */
  advance(ms: number): void {
    const target = this.#now + ms;
    // Fire one due timer at a time so timers scheduled by a firing callback are
    // honoured against the same target; ties break by registration order.
    for (;;) {
      let next: FakeTimer | undefined;
      for (const timer of this.#timers.values()) {
        if (timer.deadline > target) continue;
```
```
        if (
          next === undefined ||
          timer.deadline < next.deadline ||
          (timer.deadline === next.deadline && timer.registration < next.registration)
        ) {
          next = timer;
        }
      }
      if (next === undefined) break;
      this.#timers.delete(next.id);
      this.#now = Math.max(this.#now, next.deadline);
      next.fn();
    }
    this.#now = target;
  }
```
56 files under tests/ import `FakeClock` from this module
(`grep -rl "FakeClock" tests/*.test.ts | wc -l` → 56), several of them (e.g.
tests/b0311-structural-note-derived-from-paths.test.ts,
tests/b0312-out-of-root-thetalib-watch-closure.test.ts) driving it with the
same "advance by one fixed interval, then let production code react" idiom
`VirtualClock` re-derives here.

## Why this is a problem
This is the D7 "Copy-paste fixtures/doubles" class, whose own description
names "fake-clock" as the canonical example: `tests/helpers/fake-clock.ts`'s
`FakeClock` is an existing, widely-adopted (56 files) double for the exact
`Clock` seam (`src/seams/clock.ts`) `VirtualClock` backs here, built from the
same design (a map of pending timers carrying a deadline and a callback, fired
in deadline order with same-deadline ties broken by registration/insertion
order). `VirtualClock` re-derives that design under new names (`PendingTimer`
instead of `FakeTimer`, `due` instead of `deadline`, `seq` instead of
`registration`) rather than importing `FakeClock`.

## Suggested direction (non-binding, optional)
`FakeClock.advance(ms)` fires every due timer as one call; the one shape this
file's pump uses that `FakeClock` does not expose as a single call is running
`session.tick()` and the `onQuantum` abort hook strictly between "time passes"
and "the timer scheduled for that time fires" — achievable by calling those
two steps immediately before `clock.advance(POLL_INTERVAL_MS)` each quantum
(the pump already tracks its own quantum count for `MAX_PUMP_QUANTA`, so it
does not depend on `VirtualClock.quanta` either) rather than requiring the
`advance()`/`fireDue()` split as two separate primitives.

## False-positive check
- Gate-pin: tests/b0319-prompt-bidirectional-ctx-abort-witness.test.ts does
  not match `*gate*.test.ts` or the named cross-cutting-gate family.
- Recording-double / MUST-NOT witness carve-out: not applicable — this finding
  is about a scheduler double's implementation, not about a negative
  ("never called") assertion built on a recording double.
- docs/bugs/ signature search: `grep -n "b0319-prompt-bidirectional-ctx-abort-witness"
  docs/bugs/*.md` → cited once, in
  docs/bugs/0319-prompt-mode-bidirectional-ctx-abort-unwired.md:243 ("What
  shipped"). This finding proposes no merge, rename or deletion of the test
  file or any cell — only that its internal clock double import an existing
  helper — so the pinned-by-citation carve-out is not triggered.
- coverage-matrix.md citation search: `grep -n
  "b0319-prompt-bidirectional-ctx-abort-witness" docs/reference/coverage-matrix.md`
  → no hits.
- Load-bearing-need check (the shape of prior false-positive rejections on
  "reimplemented" claims): confirmed `FakeClock` supports multiple
  concurrently-pending timers with different `ms` values (a `Map`, not a
  single slot), which this file needs (the 10 ms poll timer and the 2000 ms
  idleBound timer coexist); confirmed its deadline-ordered, tie-broken firing
  matches `VirtualClock.fireDue()`'s own ordering rule exactly. The only
  behavioural difference found is `FakeClock.advance(ms)` fusing "move time"
  and "fire due timers" into one call where `VirtualClock` splits them into
  `advance()` then `fireDue()` — addressed as an open, non-binding direction
  above rather than asserted as proven-equivalent.
- Already-filed/resolved check: searched quality/resolved, quality/issues and
  quality/intake for "VirtualClock" and "FakeClock" together with "b0319" — no
  existing finding addresses this. `git log` shows the file's harness section
  (lines 283-330) has never been touched by a quality-fix commit; the one
  quality-fix commit that did touch this file (2026-09-12) removed an
  unrelated tautological assertion (quality/resolved/PTQ-0231) at lines
  476-514.
- Coverage drift check: this finding does not assert any behaviour is
  untested — every cited line is fixture/double code, not a missing test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — every excerpt reproduces verbatim at its cited lines in both files, no `FakeClock` import/mention exists anywhere in the b0319 file (grep, zero hits), and `VirtualClock`'s {due,fn,seq} Map/setTimeout/clearTimeout/fire-in-order design is a field-renamed rederivation of `FakeClock`'s {deadline,fn,registration} design; `FakeClock` is independently confirmed to already handle this file's concurrent-multi-timer need (the 10ms poll timer and 2000ms idleBound timer coexist, production-theta-producer.ts:5845/5932) and `session.tick()` reads no clock state, so the one honestly-surfaced divergence (fused advance+fire vs. the split advance()/fireDue()) is addressable by reordering rather than load-bearing; correctly scoped D7 copy-paste-fixture/double in tests/, carve-outs (gate-pin, recording-double, docs/bugs pin, coverage-matrix) all check out as stated (one minor exception: the cited `grep ... | wc -l` reproduces as 53 not 56, not load-bearing to the claim), and it is a distinct root cause from resolved PTQ-0231 (different lines, unrelated tautology) and sibling intake d7-02 (ScriptedLiveSession, a disjoint section) (triage: claude-opus-5)
