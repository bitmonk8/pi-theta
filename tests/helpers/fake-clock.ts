// V8d — in-memory `FakeClock` conforming `Clock` seam implementation (PIC-12).
//
// Drives deterministic timing for conformance tests: `advance(ms)` synchronously
// fires every timer whose deadline has elapsed in deadline order (equal
// deadlines in registration order; a 0-ms timer fires under `advance(0)`, the
// loop-iter macrotask-yield conformance vehicle), `clearTimeout` is a no-op for
// an already-fired handle, `now()` returns the fake's accumulated time and is
// not implicitly advanced, and `wallNow()` returns a constructor-injected epoch
// that is likewise not implicitly advanced.
//
// Spec: host-interfaces-services.md PIC-12.

import type { Clock, TimerHandle } from "../../src/seams/clock";

export interface FakeClockOptions {
  /** Initial monotonic time reported by `now()` (default 0). */
  readonly now?: number;
  /** Constructor-injected epoch reported by `wallNow()` (default 0). */
  readonly wallEpoch?: number;
}

interface FakeTimer {
  readonly id: number;
  readonly deadline: number;
  readonly registration: number;
  readonly fn: () => void;
}

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

  now(): number {
    return this.#now;
  }

  wallNow(): number {
    return this.#wallEpoch;
  }

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

  /** Synchronously fire every timer whose deadline has elapsed, in deadline order. */
  advance(ms: number): void {
    const target = this.#now + ms;
    // Fire one due timer at a time so timers scheduled by a firing callback are
    // honoured against the same target; ties break by registration order.
    for (;;) {
      let next: FakeTimer | undefined;
      for (const timer of this.#timers.values()) {
        if (timer.deadline > target) continue;
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
}
