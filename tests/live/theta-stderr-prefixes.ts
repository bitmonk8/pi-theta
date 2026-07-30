// Bug 0030 — the one canonical set of theta-owned stderr line prefixes,
// shared by both live halves' stderr gates. A rename at an emit site
// (`stale-ctx.ts`, `system-note-channel.ts`, `reload-debounce.ts`) must reach
// every gate scoring these lines through this module; a second,
// independently maintained copy could drift and leave a gate silently
// scoring dead text.
//
// The two consuming gates use this set differently, not interchangeably:
//   - H9a (`tests/live/acceptance/harness.ts` `assertStderrClean`) scores a
//     real spawned `pi -p` child's captured stderr as a black box and, per the
//     measured baseline (bug 0030 §Fix), asserts the capture is EMPTY —
//     every non-blank line is an offender, theta-owned or not; there the three
//     prefixes only LABEL an offender's class in the failure message.
//   - H8a (`tests/live/live-production-acceptance.test.ts`) spies on
//     `console.error` IN-PROCESS, so it also observes writes theta does not
//     own (host or provider warnings); `thetaOwnedStderrLines` narrows a
//     spy's captured calls to the lines these three prefixes mark, before
//     the zero assertion runs.

import { STALE_QUIESCE_STDERR_PREFIX } from "../../src/extension/stale-ctx";

export { STALE_QUIESCE_STDERR_PREFIX };

/**
 * The PIC-54 fallback chain's terminal-sink prefix: byte-exact with the fixed
 * leading text both `console.error` call sites in `system-note-channel.ts`
 * write (`system-note delivery failed: ${note.content}`, `…`). A bare
 * literal here — unlike the quiesce prefix, that emit site exports no
 * constant to import.
 */
export const SYSTEM_NOTE_DELIVERY_FAILED_PREFIX = "system-note delivery failed:";

/**
 * The reload debouncer's last-resort sink prefix: byte-exact with the
 * fixed first argument of `reload-debounce.ts`'s
 * `console.error("theta hot-reload rebuild rejected:", reason)`. That arm is
 * an implementation detail of the debouncer PIC-49 governs, not content of
 * `#pic-49` (which pins cross-window rebuild serialization and names no stderr
 * line). A bare literal for the same reason as
 * `SYSTEM_NOTE_DELIVERY_FAILED_PREFIX`.
 */
export const RELOAD_REBUILD_REJECTED_PREFIX = "theta hot-reload rebuild rejected:";

/**
 * The three theta-owned stderr line classes as one array. `thetaOwnedStderrLines`
 * iterates it; the H9a harness imports the three prefixes individually to name
 * an offending line's class in its failure message (`knownStderrClassOf`).
 */
export const THETA_STDERR_LINE_PREFIXES: readonly string[] = [
  STALE_QUIESCE_STDERR_PREFIX,
  SYSTEM_NOTE_DELIVERY_FAILED_PREFIX,
  RELOAD_REBUILD_REJECTED_PREFIX,
];

/**
 * Filter to the lines carrying one of `THETA_STDERR_LINE_PREFIXES`, in the
 * order given — the H8a `console.error` spy filter. An in-process spy also
 * records writes theta does not own, so the zero-stderr assertion narrows to
 * theta's own lines before it runs; a line matching none of the three
 * prefixes is host/provider noise, not a theta regression.
 */
export function thetaOwnedStderrLines(lines: readonly string[]): readonly string[] {
  return lines.filter((line) =>
    THETA_STDERR_LINE_PREFIXES.some((prefix) => line.includes(prefix)),
  );
}
