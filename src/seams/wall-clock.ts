// V8d — `WallClock` production adapter for the `Clock` seam (PIC-12).
//
// The runtime reads wall-clock time and schedules deferred work exclusively
// through the injected `Clock` seam; this adapter is the production wiring and
// the SOLE exempt `src/**` timing site. It delegates `now()`→`performance.now()`
// (monotonic ms), `wallNow()`→`Date.now()` (Unix epoch ms), and the timer
// methods to the global `setTimeout` / `clearTimeout`. Each direct timing
// reference carries its own same-line `// allow-ambient: <primitive> — Clock`
// comment, which is itself the allow-list entry the H3a identifier-keyed scan
// admits (there is no separate registry).
//
// Spec: host-interfaces-services.md PIC-12.

import type { Clock, TimerHandle } from "./clock";

export class WallClock implements Clock {
  now(): number {
    return performance.now(); // allow-ambient: performance.now — Clock
  }

  wallNow(): number {
    return Date.now(); // allow-ambient: Date.now — Clock
  }

  setTimeout(fn: () => void, ms: number): TimerHandle {
    return setTimeout(fn, ms); // allow-ambient: setTimeout — Clock
  }

  clearTimeout(handle: TimerHandle): void {
    clearTimeout(handle as ReturnType<typeof setTimeout>); // allow-ambient: clearTimeout — Clock
  }
}
