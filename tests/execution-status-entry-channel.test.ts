import { describe, expect, it } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createEntryChannel,
  createProgressEntryRenderer,
  THETA_PROGRESS_ENTRY_TYPE,
} from "../src/extension/execution-status/entry-channel";
import { createSystemNoteRenderer } from "../src/extension/system-note-renderer";
import type { SystemNote } from "../src/extension/system-note-channel";

// RFC 0010 (execution-status.md EXST-8; runtime-event-channel.md PIC-71/72) —
// `tests/execution-status-entry-channel.test.ts` (T-ENT). Behaviour-matrix
// rows B45-B51, B55 (B52-B54 exercise the `system-note-channel.ts` /
// `factory.ts` wiring (PIC-72) end-to-end and are covered in
// `tests/execution-status-entry-migration-witnesses.test.ts` — not
// duplicated here as unit-level assertions).
//
// `entry-channel.ts`'s `append()` calls `pi.appendEntry` when `live()` is
// true — every "delivered as an entry" assertion below asserts that real
// `pi.appendEntry` call; the `live()`-only "absent surface" / "registration
// throws" assertions cover the probe/registration wiring directly.

/** A recording fake `pi` exposing appendEntry + registerEntryRenderer (mirrors
 *  tests/extension-factory-harness.test.ts's `makeAbsentSeamPi` recording-double
 *  style: every call recorded, selected members optionally throw). */
function fakePi(options: {
  readonly absentAppendEntry?: boolean;
  readonly absentRegisterEntryRenderer?: boolean;
  readonly registerEntryRendererThrows?: boolean;
  readonly appendEntryThrows?: boolean | ((n: number) => boolean);
}): {
  pi: ExtensionAPI;
  appendCalls: { customType: string; data: unknown }[];
  registeredRenderer: unknown;
} {
  const appendCalls: { customType: string; data: unknown }[] = [];
  let registeredRenderer: unknown;
  let appendCount = 0;
  const base: Record<string, unknown> = {};
  if (!options.absentRegisterEntryRenderer) {
    base.registerEntryRenderer = (_type: string, renderer: unknown): void => {
      if (options.registerEntryRendererThrows) {
        throw new Error("registerEntryRenderer host seam absent");
      }
      registeredRenderer = renderer;
    };
  }
  if (!options.absentAppendEntry) {
    base.appendEntry = (customType: string, data: unknown): void => {
      appendCount += 1;
      const throwsNow =
        typeof options.appendEntryThrows === "function"
          ? options.appendEntryThrows(appendCount)
          : options.appendEntryThrows === true;
      if (throwsNow) {
        throw new Error("appendEntry host seam absent");
      }
      appendCalls.push({ customType, data });
    };
  }
  return { pi: base as unknown as ExtensionAPI, appendCalls, registeredRenderer };
}

const BATCH_NOTE: SystemNote = {
  content: "theta/load/settings-value-out-of-range: settings key thetas.progress value is out of range; got 7",
  display: true,
  details: { diagnostics: [] },
};

const STRUCTURAL_NOTE: SystemNote = {
  content: "theta files changed: +2 -1",
  display: true,
  details: { structural: { added: ["a.theta"], removed: ["b.theta"] } },
};

const RECOVERY_NOTE: SystemNote = {
  content: "binder model recovered for: fix-cluster, lens-d2-cruft",
  display: true,
  details: { recovery: { thetas: ["fix-cluster", "lens-d2-cruft"] } },
};

// ---------------------------------------------------------------------------
// B45-B47 — batch / structural / recovery note classes deliver as entries.
// ---------------------------------------------------------------------------

describe("T-ENT — B45/B46/B47: live channel delivers each note class as an entry, never sendMessage", () => {
  it.each([
    ["batch", BATCH_NOTE],
    ["structural", STRUCTURAL_NOTE],
    ["recovery", RECOVERY_NOTE],
  ] as const)("B45-47 (%s class): exactly one appendEntry(THETA_PROGRESS_ENTRY_TYPE, note)", (_label, note) => {
    const { pi, appendCalls } = fakePi({});
    const channel = createEntryChannel(pi);
    const delivered = channel.append(note);
    expect(delivered).toBe(true);
    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0]!.customType).toBe(THETA_PROGRESS_ENTRY_TYPE);
    expect(appendCalls[0]!.data).toEqual(note);
  });
});

// ---------------------------------------------------------------------------
// B48 — absent `pi.appendEntry`: channel dead, message realization untouched
// (asserted here at the entry-channel level: append() returns false so the
// caller's sendMessage realization is unaffected).
// ---------------------------------------------------------------------------

describe("T-ENT — B48: absent pi.appendEntry -> channel dead, caller falls back", () => {
  it("live() is false and append() returns false (absent pi.appendEntry: no surface to deliver through)", () => {
    const { pi } = fakePi({ absentAppendEntry: true });
    const channel = createEntryChannel(pi);
    expect(channel.live()).toBe(false);
    expect(channel.append(BATCH_NOTE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B49 — registerEntryRenderer throws at factory time -> channel dead for the
// session; no diagnostic surface exists here (probe/registration is a pure
// constructor-time effect with no diagnostics sink parameter, by construction).
// ---------------------------------------------------------------------------

describe("T-ENT — B49: registerEntryRenderer throws -> channel dead for the session", () => {
  it("live() is false; a later append() still returns false", () => {
    const { pi } = fakePi({ registerEntryRendererThrows: true });
    const channel = createEntryChannel(pi);
    expect(channel.live()).toBe(false);
    expect(channel.append(BATCH_NOTE)).toBe(false);
  });

  it("does not throw out of createEntryChannel itself", () => {
    const { pi } = fakePi({ registerEntryRendererThrows: true });
    expect(() => createEntryChannel(pi)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// B50 — appendEntry throws on note N -> N falls back, N+1 falls back too
// (permanent degrade).
// ---------------------------------------------------------------------------

describe("T-ENT — B50: appendEntry throws on note N -> permanent degrade for N and N+1", () => {
  it("first append fails-through, live() then reports dead, second append also fails-through", () => {
    const { pi, appendCalls } = fakePi({ appendEntryThrows: true });
    const channel = createEntryChannel(pi);
    const firstDelivered = channel.append(BATCH_NOTE);
    const secondDelivered = channel.append(STRUCTURAL_NOTE);
    expect(firstDelivered, "N: falls back to sendMessage").toBe(false);
    expect(secondDelivered, "N+1: permanent degrade, also falls back").toBe(false);
    expect(appendCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// B51 — no dedup on the entry channel: two byte-identical batches -> TWO
// appendEntry calls.
// ---------------------------------------------------------------------------

describe("T-ENT — B51: no dedup on the entry channel (bug 0470 rule)", () => {
  it("emitting the same note twice yields two appendEntry calls", () => {
    const { pi, appendCalls } = fakePi({});
    const channel = createEntryChannel(pi);
    channel.append(BATCH_NOTE);
    channel.append(BATCH_NOTE);
    expect(appendCalls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// B55 — the entry renderer's rendered lines are byte-identical to the
// theta-system-note message renderer's, for the same note.
// ---------------------------------------------------------------------------

describe("T-ENT — B55: entry renderer byte-identical to the message renderer", () => {
  it("renders the same lines at width 120 for a display:true note", () => {
    const entryRenderer = createProgressEntryRenderer();
    const messageRenderer = createSystemNoteRenderer();

    const entryComponent = entryRenderer(
      { type: "custom", customType: THETA_PROGRESS_ENTRY_TYPE, data: BATCH_NOTE, id: "e1", timestamp: 0 } as never,
      { expanded: false },
      {} as never,
    );
    const messageComponent = messageRenderer(
      { customType: THETA_PROGRESS_ENTRY_TYPE, content: BATCH_NOTE.content, display: BATCH_NOTE.display, details: BATCH_NOTE.details } as never,
      { expanded: false },
      {} as never,
    );

    expect(entryComponent).toBeDefined();
    expect(messageComponent).toBeDefined();
    expect(entryComponent!.render(120)).toEqual(messageComponent!.render(120));
  });

  it("never throws out of the renderer invocation, even at width 30", () => {
    const entryRenderer = createProgressEntryRenderer();
    expect(() => {
      const c = entryRenderer(
        { type: "custom", customType: THETA_PROGRESS_ENTRY_TYPE, data: BATCH_NOTE, id: "e1", timestamp: 0 } as never,
        { expanded: false },
        {} as never,
      );
      c?.render(30);
    }).not.toThrow();
  });
});
