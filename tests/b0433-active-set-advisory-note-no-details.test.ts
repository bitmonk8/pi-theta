// Bug 0433 (RED) — the PIC-8(c) active-set-restore advisory note fabricates the
// runtime-event `event` key: `restoreActiveSet` emits the `display: true`
// advisory whose `details` is the fabricated
// `{ event: { code: "theta/runtime/active-set-restore-failed" } }`
// (src/runtime/tool-registration.ts:185). That `event` key falsely
// selects the channel partition's runtime-event arm (system-note-channel.ts:104
// `SystemNoteDetails`, disjoint by key) while carrying NO `RuntimeEvent` — every
// required field (`kind`, `theta`, `invocation_id`, `message`, `occurred_at`) is
// absent — the exact 0401 misclassification, surviving here because the stub's
// `code` field evades the `event: {}` grep.
//
// docs/bugs/0433-active-set-advisory-note-fabricates-event-code.md (the spec).
// §Fix option 1 (Recommended, parent-ratified for this lane): make the advisory
// an INFORMATIONAL note carrying NO `details` on the wire — the shape the
// producer success echo already uses at production-theta-producer.ts:1198–1199
// (`pi.sendMessage` with only `{ customType, content, display }`, no `details`).
//
// RED reason at the fork (b2cb3b15): the captured advisory note object carries
// `details: { event: { code: "theta/runtime/active-set-restore-failed" } }`, so
// the `event` key is present — the details-shape assertion reds. Post-fix
// (option 1: `details` omitted), the `event` key is absent and both cells go
// green. The controls (verbatim content, `display: true`, the PIC-8(b)
// diagnostic code) encode the UNCHANGED behaviour and are byte-identical
// fork→fix — asserted so the fix is proven to touch only `details`.
//
// FLIP CENSUS: no committed test pins this note's `details`
// (tests/tool-registration-lifetime.test.ts and
// tests/b0372-active-set-restore-protocol.test.ts assert only content/display +
// the diagnostic code). These two cells are the only place `details` is pinned.

import { describe, expect, it } from "vitest";
import { FakeActiveSetPi } from "./helpers/fake-active-set-pi";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ActiveSetGateDeps } from "../src/runtime/tool-registration";
import { withActiveSetGate } from "../src/runtime/tool-registration";
import {
  InstantSettleSession,
  QUERY_REPLY,
  QUERY_SNAPSHOT,
  driveQueryWindow,
  type SystemNoteMessage,
} from "./helpers/active-set-window-harness";
import { SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";

// The runtime diagnostics-registry code the PIC-8 restore-failure protocol emits
// (diagnostics/code-registry-runtime.md); mirrors the const in
// tool-registration.ts:27 and tests/tool-registration-lifetime.test.ts.
const ACTIVE_SET_RESTORE_FAILED = "theta/runtime/active-set-restore-failed";

// The PIC-8(c) verbatim template (only `/<name>` substituted); the CONTROL the
// fix must not touch (tool-registration.ts:196).
const RESTORE_NOTE_VERBATIM = (name: string): string =>
  `theta: failed to restore tool active-set after /${name}; the user session may have unexpected tools active. Run /reload to reset.`;

// The fabricated `details` signature this bug reds on (tool-registration.ts:185).
const FABRICATED_DETAILS = { event: { code: ACTIVE_SET_RESTORE_FAILED } };

// Assert the advisory note does NOT present the runtime-event `event` key. Held
// in one helper so both the unit cell (the captured hook arg) and the wire cell
// (the captured `pi.sendMessage` message) apply the identical partition check.
// At the fork `details.event` is present → reds, quoting the fabricated bytes;
// under option 1 (`details` omitted) → `event` absent → green.
function expectNoRuntimeEventKey(note: Record<string, unknown>, where: string): void {
  const detailsPresent = "details" in note && note.details != null;
  const details = detailsPresent ? (note.details as Record<string, unknown>) : {};
  const eventKeyPresent = detailsPresent && "event" in details;
  expect(
    eventKeyPresent,
    `${where}: the PIC-8(c) advisory note MUST NOT present the runtime-event ` +
      `'event' key without a RuntimeEvent — it falsely selects the channel ` +
      `partition's runtime-event arm carrying no RuntimeEvent. Observed ` +
      `fabricated payload: ${JSON.stringify(detailsPresent ? note.details : "<no details key>")}`,
  ).toBe(false);
}

// ===========================================================================
// Cell 1 (PRIMARY, the gate) — unit over `withActiveSetGate` on the
// double-restore-throw path, capturing the FULL note object handed to
// `emitSystemNote` so `note.details` is inspectable. Mirrors the
// shared `FakeActiveSetPi` / `makeGateDeps` harness of
// tests/tool-registration-lifetime.test.ts, but the recorder captures the whole
// object (the existing PIC-8 cell asserts only `note.content`).
// ===========================================================================

describe("bug 0433 (RED) — the PIC-8(c) advisory note carries no fabricated runtime-event key", () => {
  it("Cell 1: a double-restore-throw fires the advisory note with NO `event` key in details (content/display/diagnostic unchanged)", async () => {
    const pi = new FakeActiveSetPi(["user_tool_a", "user_tool_b"], "throw-restore-always");

    // Capture as `unknown[]` — vitest transpiles (esbuild, NO typecheck), so the
    // runtime object is inspectable regardless of the note's declared TS type.
    const diagnostics: Diagnostic[] = [];
    const notes: Record<string, unknown>[] = [];
    const deps: ActiveSetGateDeps = {
      pi,
      thetaName: "code-review",
      installVector: [],
      emitDiagnostic: (d): void => {
        diagnostics.push(d);
      },
      emitSystemNote: (n): void => {
        notes.push(n as unknown as Record<string, unknown>);
      },
      routeInternalError: (): void => {},
    };

    const originalError = new Error("provider exploded mid-query");
    let thrown: unknown;
    try {
      await withActiveSetGate(deps, async () => {
        throw originalError;
      });
    } catch (e) {
      thrown = e;
    }

    // The advisory note is the `display: true` one (PIC-8(c)).
    const note = notes.find((n) => n.display === true);
    expect(
      note,
      `the PIC-8(c) advisory note must fire on the double-restore-throw path; observed notes: ${JSON.stringify(notes)}`,
    ).toBeDefined();

    // CONTROL (byte-identical fork→fix, asserted BEFORE the primary so it is
    // witnessed green at the fork): the note's `content` is the verbatim
    // PIC-8(c) template (name substituted) and `display === true`. The fix
    // touches only `details`, so these must NOT change.
    expect(note?.content).toBe(RESTORE_NOTE_VERBATIM("code-review"));
    expect(note?.display).toBe(true);

    // CONTROL: the PIC-8(b) diagnostic still fires with the registered code and
    // severity — the structured half is unchanged.
    const diag = diagnostics.find((d) => d.code === ACTIVE_SET_RESTORE_FAILED);
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");

    // PIC-8(a)/(d) sanity: two restore attempts, original error unmasked.
    expect(pi.restoreAttempts.length).toBe(2);
    expect(thrown).toBe(originalError);

    // PRIMARY (RED at fork): the advisory MUST NOT present the runtime-event
    // `event` key. At the fork `note.details === { event: { code: … } }`, so the
    // key is present and this reds; option 1 omits `details` and it goes green.
    expectNoRuntimeEventKey(note as Record<string, unknown>, "unit gate");
  });
});

// ===========================================================================
// Cell 2 (WIRE) — one production window (window 1, the producer prompt-mode
// query) end-to-end, proving the fabricated payload reaches `pi.sendMessage`.
// Reuses the shared `InstantSettleSession` + `driveQueryWindow` window-1
// harness (tests/helpers/active-set-window-harness.ts, also driven by
// tests/b0372-active-set-restore-protocol.test.ts), but the `sendMessage`
// capture records `details` too (b0372 records only `{ content, display }`). At
// the fork, the production wiring forwarded `details: note.details` verbatim
// (production-theta-producer.ts:4136 and the two sibling wirings 5531/7098), so
// the fork's fabricated bytes landed on the captured wire message; post-fix
// that forwarding line is gone and the wire message carries no `details` key.
// ===========================================================================

/** Gate double for the window: first `setActiveTools` installs, both restore
 *  attempts throw (the double-throw path that fires the PIC-8(c) advisory). */
class RestoreThrowingGate {
  readonly setCalls: string[][] = [];
  getCalls = 0;
  #installed = false;

  constructor(readonly snapshot: readonly string[]) {}

  getActiveTools(): string[] {
    this.getCalls += 1;
    return [...this.snapshot];
  }

  setActiveTools(names: string[]): void {
    this.setCalls.push([...names]);
    if (!this.#installed) {
      this.#installed = true;
      return;
    }
    throw new Error("active-set restore failure");
  }
}

/** A captured `theta-system-note` wire message — the FULL shape as it hits
 *  `pi.sendMessage`, so `details` (present-or-absent) is inspectable. */
interface WireMessage {
  readonly content: string;
  readonly display: boolean;
  readonly hasDetails: boolean;
  readonly details: unknown;
}

function recordWire(message: SystemNoteMessage): WireMessage | undefined {
  if (message.customType !== SYSTEM_NOTE_CHANNEL) return undefined;
  return {
    content: String(message.content ?? ""),
    display: message.display === true,
    hasDetails: "details" in message,
    details: message.details,
  };
}

/** Drive the one-query theta through the production prompt-mode binding with a
 *  gate whose restore always throws (the PIC-8(c) advisory-firing path); the
 *  session capture records each `theta-system-note` with its full `details`. */
async function driveQueryRestoreThrow() {
  const session = new InstantSettleSession<WireMessage>(QUERY_REPLY, recordWire);
  return driveQueryWindow(session, new RestoreThrowingGate(QUERY_SNAPSHOT));
}

describe("bug 0433 (RED) — the fabricated advisory `details` reaches the wire", () => {
  it("Cell 2: the producer query window emits the advisory note to pi.sendMessage with NO `event` key in details", async () => {
    const r = await driveQueryRestoreThrow();

    // PIC-8(d) sanity: the double restore throw is diagnosed and swallowed, so
    // the completed query propagates (guards against reddening for the wrong
    // reason — an uncaught throw rather than the details shape).
    expect(r.caught, `unexpected throw out of executeBody: ${String(r.caught)}`).toBeUndefined();
    expect(r.execution.outcome, `error: ${JSON.stringify(r.execution?.error)}`).toBe("success");
    expect(r.execution.result.value).toBe(QUERY_REPLY);

    // The advisory note reached the wire (the `display: true` verbatim note).
    const wireNote = r.session.notes.find(
      (m) => m.display === true && m.content === RESTORE_NOTE_VERBATIM("probe"),
    );
    expect(
      wireNote,
      `the PIC-8(c) advisory note must reach pi.sendMessage; observed wire: ${JSON.stringify(r.session.notes)}`,
    ).toBeDefined();

    // PRIMARY (spec pin, runtime-event-channel.md:41): emitters MUST omit
    // `details` on the wire rather than send an empty or placeholder payload —
    // assert strict key omission, not merely an empty/undefined value.
    expect(wireNote?.hasDetails).toBe(false);

    // CONTROL (byte-identical fork→fix, witnessed green at the fork before the
    // primary): the PIC-8(b) diagnostic still fires.
    expect(r.diagnostics.some((d) => d.code === ACTIVE_SET_RESTORE_FAILED)).toBe(true);

    // PRIMARY (RED at fork): the wire message must NOT present the runtime-event
    // `event` key. At the fork the producer forwards `details: note.details ===
    // { event: { code: … } }`, so the key is present and this reds.
    expectNoRuntimeEventKey(wireNote as unknown as Record<string, unknown>, "producer wire");
  });
});
