import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import thetaExtension, {
  createThetaExtension,
  EXTENSION_BOOTSTRAP_FAILED_CODE,
} from "../src/extension/factory";
import { SYSTEM_NOTE_CHANNEL } from "../src/extension/system-note-channel";

// V9k-T — failing tests for the extension-bootstrap SDK-failure abort surfaces
// (paired V9k implementation leaf).
//
// Spec: pi-integration-contract/extension-bootstrap-and-per-theta.md
// ("Extension-bootstrap SDK failures" — the `pi.registerFlag` and `pi.on(...)`
// fatal-abort rules), diagnostics/code-registry-load.md (the
// `theta/load/extension-bootstrap-failed` registry row + its `details` payload),
// pi-integration-contract/registration-steps.md (the step ordering the abort
// truncates), diagnostics/placeholder-rendering-b.md#underlying-error-coercion
// (the `details.error` / `<error>` coercion).
//
// This is a code-keyed obligation area (PIC, no numbered REQ-IDs): each test
// cites the `theta/load/extension-bootstrap-failed` diagnostics-registry code
// inline per the conventions.md *Diagnostic message anchors* rule.
//
// The factory is driven through a recording `ExtensionAPI` double whose chosen
// host-binding call throws, so the fatal-abort granularity and the single
// diagnostic are witnessed by behaviour. The paired V9k implementation makes a
// factory-time `pi.registerFlag` / `pi.on(...)` throw fatal to the whole
// extension (the remaining steps do not execute) and emits exactly one
// diagnostic; until then these tests red on those primary assertions.

// The canonical factory-time `pi.on` subscription order (steps 1/3/4 of
// registration-steps.md): `resources_discover` (step 1, after the `--theta`
// flag), `session_start` (step 3), `session_shutdown` (step 4).
const SUBSCRIPTION_ORDER = [
  "resources_discover",
  "session_start",
  "session_shutdown",
] as const;
type PiEvent = (typeof SUBSCRIPTION_ORDER)[number];

interface RecordingPi {
  pi: ExtensionAPI;
  /** Every host-binding call attempted, in call order. */
  calls: string[];
  /** Pi events whose `pi.on` subscription actually installed (no throw), in order. */
  subscriptions: PiEvent[];
}

// A recording `ExtensionAPI` double. Each host-binding call is logged; a call
// whose key is in `throwOn` throws (the host seam faults synchronously at the
// factory boundary, the only fault mode for these synchronous-void calls).
function makeRecordingPi(throwOn: ReadonlySet<string>): RecordingPi {
  const calls: string[] = [];
  const subscriptions: PiEvent[] = [];
  const guard = (key: string): void => {
    calls.push(key);
    if (throwOn.has(key)) {
      throw new Error(`${key} host seam absent`);
    }
  };
  const pi = {
    registerFlag: (): void => guard("registerFlag"),
    registerMessageRenderer: (): void => guard("registerMessageRenderer"),
    registerCommand: (): void => guard("registerCommand"),
    on: (event: string): void => {
      const key = `on:${event}`;
      calls.push(key);
      if (throwOn.has(key)) {
        throw new Error(`${key} host seam absent`);
      }
      subscriptions.push(event as PiEvent);
    },
    getFlag: (): undefined => undefined,
    getCommands: (): unknown[] => [],
    sendUserMessage: (): void => {},
    sendMessage: (): void => {},
  };
  return { pi: pi as unknown as ExtensionAPI, calls, subscriptions };
}

// Narrow the recorded diagnostics to exactly one, failing loudly (no silent
// skip) when the factory emitted none or more than one.
function exactlyOne(diagnostics: readonly Diagnostic[]): Diagnostic {
  if (diagnostics.length !== 1) {
    expect.fail(
      `expected exactly one extension-bootstrap-failed diagnostic, got ${diagnostics.length}`,
    );
  }
  return diagnostics[0] as Diagnostic;
}

// ── `pi.registerFlag` failure — fatal to the whole extension ────────────────

// cka-16 / V9k: the extension-bootstrap SDK-failure code-keyed obligation area
// closes across V9k (the two whole-extension abort surfaces) and V9p; the
// assertions in this file witness the V9k facet against the shipped bootstrap.
describe("V9k extension bootstrap — pi.registerFlag failure (theta/load/extension-bootstrap-failed)", () => {
  it("theta/load/extension-bootstrap-failed: a factory-time pi.registerFlag throw is fatal — steps 2–5 do not execute", () => {
    const rec = makeRecordingPi(new Set(["registerFlag"]));
    const diagnostics: Diagnostic[] = [];

    // The factory MUST NOT throw out of its body even when a registration call
    // faults (per-call boundary), but the registerFlag failure is fatal.
    expect(() =>
      createThetaExtension({
        fixtures: [],
        emitDiagnostic: (d) => diagnostics.push(d),
      })(rec.pi),
    ).not.toThrow();

    // Fatal: every subsequent `pi.register*` / `pi.on` call is skipped — none
    // of the three factory-time subscriptions install (steps 2–5 do not run).
    expect(rec.subscriptions).toEqual([]);
    expect(rec.calls).not.toContain("on:resources_discover");
    expect(rec.calls).not.toContain("on:session_start");
    expect(rec.calls).not.toContain("on:session_shutdown");
  });

  it("theta/load/extension-bootstrap-failed: emits a single diagnostic with details.capability = 'pi.registerFlag'", () => {
    const rec = makeRecordingPi(new Set(["registerFlag"]));
    const diagnostics: Diagnostic[] = [];
    createThetaExtension({
      fixtures: [],
      emitDiagnostic: (d) => diagnostics.push(d),
    })(rec.pi);

    const d = exactlyOne(diagnostics);
    expect(d.severity).toBe("error");
    expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(d.details?.capability).toBe("pi.registerFlag");
    // The `details.error` carries the caught throw's underlying-error string
    // (placeholder-rendering-b.md#underlying-error-coercion).
    expect(d.details?.error).toBe("registerFlag host seam absent");
    // Message anchors on the byte-identical registry-template prefix; `<error>`
    // is a §8 host-derived tail so the assertion is an anchored partial match.
    expect(d.message.startsWith("extension bootstrap failed: pi.registerFlag threw ")).toBe(
      true,
    );
  });
});

// ── `pi.on(...)` subscription failure — fatal to the whole extension ────────

describe("V9k extension bootstrap — pi.on(...) subscription failure (theta/load/extension-bootstrap-failed)", () => {
  // The fatal-truncation and the single-diagnostic facets describe one
  // indivisible "fatal abort + single diagnostic" behaviour per failing event
  // and are asserted together: for the last subscription (`session_shutdown`)
  // the truncation facet is trivially satisfied, so folding the diagnostic
  // facet into the same test keeps every case reding on the absent impl.
  for (const failingEvent of SUBSCRIPTION_ORDER) {
    const failKey = `on:${failingEvent}`;
    const priorEvents = SUBSCRIPTION_ORDER.slice(
      0,
      SUBSCRIPTION_ORDER.indexOf(failingEvent),
    );

    it(`theta/load/extension-bootstrap-failed: a pi.on('${failingEvent}') throw is fatal (no subsequent register*/on call) and emits one diagnostic with details.capability='pi.on', details.event='${failingEvent}'`, () => {
      const rec = makeRecordingPi(new Set([failKey]));
      const diagnostics: Diagnostic[] = [];

      expect(() =>
        createThetaExtension({
          fixtures: [],
          emitDiagnostic: (d) => diagnostics.push(d),
        })(rec.pi),
      ).not.toThrow();

      // Only the subscriptions preceding the failing one installed; the failing
      // subscription and every later step are skipped (fatal to the extension).
      expect(rec.subscriptions).toEqual([...priorEvents]);
      // No host-binding call appears in the call log after the failing one.
      const failIndex = rec.calls.indexOf(failKey);
      expect(failIndex).toBeGreaterThanOrEqual(0);
      expect(rec.calls.slice(failIndex + 1)).toEqual([]);

      // Exactly one diagnostic, naming the failing subscription's Pi event.
      const d = exactlyOne(diagnostics);
      expect(d.severity).toBe("error");
      expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
      expect(d.details?.capability).toBe("pi.on");
      expect(d.details?.event).toBe(failingEvent);
      // `details.error` carries the caught throw's underlying-error string
      // (placeholder-rendering-b.md#underlying-error-coercion).
      expect(d.details?.error).toBe(`${failKey} host seam absent`);
      // Anchored partial match on the byte-identical registry-template prefix.
      expect(
        d.message.startsWith("extension bootstrap failed: pi.on threw "),
      ).toBe(true);
    });
  }
});

// ── Bug 0023 — the same abort surface through the SHIPPED default export ─────

// Every test above drives `createThetaExtension` with an INJECTED recorder, so
// all of them are structurally blind to what the shipped composition wires: at
// bug 0023's HEAD the production default export supplied no `emitDiagnostic`,
// so the same diagnostic was constructed and then discarded by an optional
// chain. Bug 0023 (§Regression locks) adds this arm on the V9k abort surfaces,
// asserting the delivery ARRIVES on a real surface — the inversion of the bug
// document's §Reproduction probe A, which records `{sends:0, error:0, write:0}`.

/** A recorded `pi.sendMessage` envelope (the bootstrap sink's tier-1 arm). */
interface ProductionNote {
  readonly customType: string;
  readonly details: unknown;
}

interface ProductionHost {
  readonly pi: ExtensionAPI;
  /** Host-binding calls attempted, in call order. */
  readonly calls: string[];
  readonly notes: ProductionNote[];
}

/**
 * A recording host conformant to the step-0 capability probe: it carries all
 * eight factory-probable SDK members (capability-probe.md Step 0 (c)) so the
 * probe passes and the test exercises the V9k abort surface it names, rather
 * than a host-incompatible refusal.
 */
function makeProductionHost(throwOn: string): ProductionHost {
  const calls: string[] = [];
  const notes: ProductionNote[] = [];
  const guard = (key: string): void => {
    calls.push(key);
    if (key === throwOn) {
      throw new Error(`${key} host seam absent`);
    }
  };
  const pi = {
    registerFlag: (): void => guard("registerFlag"),
    getFlag: (): undefined => undefined,
    getCommands: (): readonly unknown[] => [],
    on: (event: string): void => guard(`on:${event}`),
    registerCommand: (): void => {},
    sendUserMessage: (): void => {},
    registerTool: (): void => {},
    setActiveTools: (): void => {},
    getActiveTools: (): readonly unknown[] => [],
    getAllTools: (): readonly unknown[] => [],
    registerMessageRenderer: (): void => guard("registerMessageRenderer"),
    sendMessage: (message: { customType: string; details: unknown }): void => {
      notes.push({ customType: message.customType, details: message.details });
    },
  };
  return { pi: pi as unknown as ExtensionAPI, calls, notes };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("V9k extension bootstrap — the shipped default export (bug 0023)", () => {
  it("theta/load/extension-bootstrap-failed: a fatal pi.registerFlag throw through the production default export DELIVERS one diagnostic on the theta-system-note channel", () => {
    const host = makeProductionHost("registerFlag");
    const errorSpy = vi.spyOn(console, "error").mockImplementation((): void => {});
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation((): boolean => true);

    expect(() => thetaExtension(host.pi)).not.toThrow();

    if (host.notes.length !== 1) {
      expect.fail(
        `expected exactly one theta-system-note delivery, got ${host.notes.length}`,
      );
    }
    const note = host.notes[0] as ProductionNote;
    expect(note.customType).toBe(SYSTEM_NOTE_CHANNEL);
    const batch = (note.details as { diagnostics?: readonly Diagnostic[] })
      .diagnostics;
    if (batch === undefined || batch.length !== 1) {
      expect.fail(
        `expected exactly one diagnostic in details.diagnostics, got ${JSON.stringify(note.details)}`,
      );
    }
    const d = batch[0] as Diagnostic;
    expect(d.code).toBe(EXTENSION_BOOTSTRAP_FAILED_CODE);
    expect(d.details?.capability).toBe("pi.registerFlag");
    expect(d.details?.error).toBe("registerFlag host seam absent");

    // The transcript arm carried it, so neither terminal fallback fires.
    expect(errorSpy.mock.calls).toEqual([]);
    expect(stderrSpy.mock.calls).toEqual([]);

    // The V9k fatal abort is unchanged by the wiring.
    expect(host.calls).toEqual(["registerFlag"]);
  });
});
