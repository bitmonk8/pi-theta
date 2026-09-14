// PIC-57 (pi-integration-contract/session-shutdown-semantics.md) — the
// race-against-cap-timer mechanism shared by `quiesceOutgoingRebuild`
// (factory.ts, bug 0034's supersession-pass quiesce) and `quiesceDebouncer`
// (session-shutdown.ts, sub-step 4's teardown quiesce): each races an
// already-in-flight rebuild/debounce's `whenIdle` settling against a cap
// timer armed on the caller's own `Clock`, so neither quiesce awaits forever.
// Each caller keeps its OWN deadline-sourcing logic (a call-site constant vs.
// a shared absolute deadline) and its own `whenIdle` adaptation (optional vs.
// required); only the race/timer mechanism itself lives here.

import type { Clock } from "../seams/clock";

/**
 * Race `whenIdle()` against a cap timer armed for `delayMs` on `clock`. The
 * cap timer is always cleared in a `finally` so a settled race never leaks a
 * timer onto the caller's runtime. `whenIdle` is the caller's own
 * already-adapted `() => Promise<void>` thunk — an optional/degrading
 * `whenIdle` source is the caller's concern, not this helper's.
 */
export async function raceAgainstCapTimer(
  whenIdle: () => Promise<void>,
  delayMs: number,
  clock: Clock,
): Promise<void> {
  let resolveCap: () => void = (): void => {};
  const capRace = new Promise<void>((resolve) => {
    resolveCap = resolve;
  });
  const capHandle = clock.setTimeout(() => resolveCap(), delayMs);
  try {
    await Promise.race([whenIdle(), capRace]); // allow: PIC-57 — pi-integration-contract/session-shutdown-semantics.md
  } finally {
    clock.clearTimeout(capHandle);
  }
}
