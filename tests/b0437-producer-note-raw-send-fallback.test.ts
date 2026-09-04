// Bug 0437 — the producer's invocation-time note emitters send `pi.sendMessage`
// RAW (no try/catch, not through `sendSystemNote`), so the channel's mandated
// best-effort fallback chain (runtime-event-channel.md:130-135) never runs for
// them. On a NON-STALE synchronous host throw the note is lost, the throw
// unwinds into the dispatch outer catch (mis-framed as a theta internal error),
// and the framing note's own raw send re-throws → the slash handler ABORTS,
// violating runtime-event-channel.md:135 ("the fallback never aborts the
// slash-command handler").
//
// The §Fix routes every raw sender through `sendSystemNote` over the producer's
// `#input.systemNoteChannel` (or a pi-built fallback) — the SAME resolution the
// conformant clean-cancel note uses (production-theta-producer.ts:1871) —
// preserving each site's `display`/`content`/`details` bytes and
// `triggerTurn:false`. Per the parent adjudication `SystemNote.details` becomes
// OPTIONAL, so the three INFORMATIONAL sites (which per landed bug 0401 carry NO
// `details` on the wire) can also route through the chain with a
// details-ABSENT wire message.
//
// This file has TWO parts:
//   PART A — the two PUBLIC emitters `emitTopLevelErrNote`
//     (theta-composition-producer.ts:376; impl production-theta-producer.ts:1697;
//     raw send production-theta-producer.ts:1738) and `emitPanicNote`
//     (theta-composition-producer.ts:390; impl production-theta-producer.ts:1762;
//     raw send production-theta-producer.ts:1763). `emitTopLevelErrNote` is a
//     GROUP-A site: it stamps `occurred_at` via `root.clock.wallNow()` and mints
//     an invocation id via `root.idSource.newInvocationId()` BEFORE its raw send,
//     so the root double MUST supply both or the double dies on a TypeError (a
//     red for the WRONG reason). The `.not.toThrow()` red must be the HOST throw.
//   PART B — an INFORMATIONAL site cell (SLSH-1 no-params overflow,
//     `#emitNoParamsOverflowNote` production-theta-producer.ts:1667; raw send
//     :1672), proving a details-ABSENT note now routes THROUGH the injected
//     channel — the seam the fix routes onto.
//
// TIER: unit — offline, provider-free, deterministic. The two public emitters
// are methods on the `ThetaProducerDeps` value `createProductionProducerDeps`
// returns, reachable by a direct call; the SLSH-1 site is reached by
// `deps.runBinder` with a no-params theta, which bypasses the binder (no model
// turn, no filesystem). Both reach the raw `pi.sendMessage` seam with no
// dispatch drive and no provider. An integration/live tier would re-drive the
// full slash dispatch to reach the same raw-send seam and witness nothing
// further about the fallback's containment.

import { describe, expect, it } from "vitest";

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { QueryError } from "../src/runtime/query-error";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import { renderTopLevelErrNote } from "../src/runtime/err-note-render";
import {
  RendererGate,
  SystemNoteChannelHealth,
  SYSTEM_NOTE_DELIVERY_FAILED_CODE,
  type SystemNoteChannelDeps,
} from "../src/extension/system-note-channel";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

const SYSTEM_NOTE_CHANNEL_TYPE = "theta-system-note";

// The one non-stale host error every throwing `pi.sendMessage` (top-level and
// channel) raises. Non-stale (a plain `Error`, not a stale-ctx error) so
// `sendSystemNote`'s PIC-67 stale-dead arm does NOT fire — the chain must
// CONTAIN this throw, never rethrow it. The substring "host sendMessage refused"
// is the red-reason discriminator: a TypeError from a clock-less/id-less root
// double would NOT carry it.
const HOST_ERROR_MESSAGE = "host sendMessage refused (non-stale)";

// The non-stale error the group-A `Clock.wallNow()` stamp raises in the
// clock-guard cell. Non-stale (a plain `Error`) so `#buildGroupAEventOrFallback`
// does NOT rethrow it (its stale-ctx arm never fires); the guard must CONTAIN it
// through `sendSystemNote`'s synthetic send-failure path.
const STAMP_ERROR_MESSAGE = "clock refused (non-stale)";

// A pinned wall clock so the group-A `occurred_at` stamp (root.clock.wallNow())
// resolves to a real number and the raw send — not a clock TypeError — is what
// throws at the fork.
const KNOWN_WALL_NOW = 1720000000000;

// ===========================================================================
// PART A — the two PUBLIC emitters (verbatim witness).
// ===========================================================================

/**
 * A runtime-root double sufficient for the two emitters: `emitTopLevelErrNote`
 * mints an invocation id and stamps `occurred_at` before its send, so both
 * seams must be real. Nothing else on the root is touched (no ledger — the
 * producer builds none without a `fileSystem` input, so `chainFor` is skipped).
 */
function rootDouble(clock?: { wallNow: () => number }): RuntimeRoot {
  let n = 0;
  return {
    idSource: {
      newInvocationId: (): string => `inv-${(n += 1)}`,
      newToolCallId: (): string => "tc-1",
    },
    clock: clock ?? { wallNow: (): number => KNOWN_WALL_NOW },
  } as unknown as RuntimeRoot;
}

/**
 * A `clock` whose `wallNow()` THROWS the non-stale stamp error and counts its
 * own invocations. Paired with `rootDouble(clock)` this fails the group-A
 * `occurred_at` stamp seam while `newInvocationId()` still mints a real id, so a
 * red is the stamp throw and not an id-less TypeError. The `calls` counter
 * witnesses that the fallback never re-stamps.
 */
function throwingClock(): { clock: { wallNow: () => number }; calls: () => number } {
  let calls = 0;
  return {
    clock: {
      wallNow: (): number => {
        calls += 1;
        throw new Error(STAMP_ERROR_MESSAGE);
      },
    },
    calls: (): number => calls,
  };
}

interface NotifyCall {
  readonly message: string;
  readonly type: "error";
}

interface RecordingChannel {
  readonly channel: SystemNoteChannelDeps;
  readonly notifyCalls: NotifyCall[];
  readonly diagnostics: Diagnostic[];
}

/**
 * A `SystemNoteChannelDeps` whose transcript `pi.sendMessage` throws the SAME
 * non-stale host error, plus RECORDING `ui.notify` and `emitDiagnostic` sinks.
 * A fresh `RendererGate` (available) keeps `sendSystemNote` on its steady-state
 * `pi.sendMessage`-first path (not the degraded ui-only arm), and a fresh
 * `SystemNoteChannelHealth` proves the throw is treated as non-stale (its
 * stale-dead latch never engages).
 */
function recordingChannel(): RecordingChannel {
  const notifyCalls: NotifyCall[] = [];
  const diagnostics: Diagnostic[] = [];
  const channel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (): void => {
        throw new Error(HOST_ERROR_MESSAGE);
      },
    },
    ui: {
      notify: (message: string, type: "error"): void => {
        notifyCalls.push({ message, type });
      },
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
  return { channel, notifyCalls, diagnostics };
}

/**
 * Build the production producer with BOTH a throwing top-level `pi.sendMessage`
 * (the RAW seam the fork sends through) AND the provided throwing-but-recording
 * `systemNoteChannel` (the seam the fix routes through).
 */
function producerWith(channel: SystemNoteChannelDeps, root: RuntimeRoot = rootDouble()) {
  const pi = {
    sendMessage: (): void => {
      throw new Error(HOST_ERROR_MESSAGE);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {} as unknown as ModelRegistry;
  return createProductionProducerDeps({
    pi,
    root,
    modelRegistry,
    systemNoteChannel: channel,
  });
}

interface StampGuardRecording {
  readonly channel: SystemNoteChannelDeps;
  readonly sends: unknown[];
  readonly notifyCalls: NotifyCall[];
  readonly diagnostics: Diagnostic[];
}

/**
 * A RECORDING channel for the group-A clock-guard cell: `pi.sendMessage` records
 * (it does NOT throw — the send itself would succeed; it is the STAMP that
 * throws), and `ui.notify` / `emitDiagnostic` record. Fresh `RendererGate`
 * (available) keeps `sendSystemNote` on its steady-state path, and a fresh
 * `SystemNoteChannelHealth` proves the synthetic stamp failure is treated as
 * non-stale.
 */
function stampGuardChannel(): StampGuardRecording {
  const sends: unknown[] = [];
  const notifyCalls: NotifyCall[] = [];
  const diagnostics: Diagnostic[] = [];
  const channel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        sends.push(message);
      },
    },
    ui: {
      notify: (message: string, type: "error"): void => {
        notifyCalls.push({ message, type });
      },
    },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
  return { channel, sends, notifyCalls, diagnostics };
}

// A real `QueryError` leaf — a transport error renders cleanly through the
// SNK-c row of `renderTopLevelErrNote` (err-note-render.ts), so the emitter
// reaches its send with a genuine note rather than a render throw.
const TRANSPORT_MESSAGE = "503 upstream unavailable";
const TRANSPORT_ERROR: QueryError = {
  kind: "transport",
  message: TRANSPORT_MESSAGE,
  http_status: 503,
  provider: "anthropic-messages",
  retryable: true,
};

// A location-less runtime-defect diagnostic for the group-B panic note.
const PANIC_DIAGNOSTIC: Diagnostic = {
  severity: "error",
  code: "theta/runtime/internal-error",
  message: "x",
};

describe("bug 0437 — the producer's public note emitters must route through the channel fallback, not send raw", () => {
  it("emitTopLevelErrNote (group-A): a non-stale host send throw is CONTAINED, not propagated, and the fallback chain runs", () => {
    const { channel, notifyCalls, diagnostics } = recordingChannel();
    const deps = producerWith(channel);

    // RED ANCHOR (assertion 1): at the fork the raw `#input.pi.sendMessage`
    // throw escapes the emitter (the failure message names the HOST error, not
    // a clock/id TypeError). After the fix `sendSystemNote` contains it.
    expect(() => deps.emitTopLevelErrNote("demo", TRANSPORT_ERROR)).not.toThrow();

    // GREEN-direction observables (assertion 3): the chain walked. The note is
    // `display: true` (buildRuntimeEventNote, topLevelCascade), so the toast
    // fires with the rendered content bytes...
    const expectedContent = renderTopLevelErrNote({
      thetaName: "demo",
      error: TRANSPORT_ERROR,
      chain: [],
    });
    expect(
      notifyCalls,
      "runtime-event-channel.md:130-135 — a display:true note falls to ctx.ui.notify when pi.sendMessage throws",
    ).toEqual([{ message: expectedContent, type: "error" }]);

    // ...and the delivery-failed diagnostic reaches the off-channel sink.
    expect(diagnostics).toHaveLength(1);
    expect(
      diagnostics[0]!.code,
      "the fallback emits theta/runtime/system-note-delivery-failed on a contained send throw",
    ).toBe(SYSTEM_NOTE_DELIVERY_FAILED_CODE);
    expect(diagnostics[0]!.message).toBe(expectedContent);
  });

  // WHY: the group-A `occurred_at` stamp (`root.clock.wallNow()`) is an
  // ALWAYS-LOG step of the note-emission sequence, so the channel's best-effort
  // fallback chain must cover a stamp throw exactly as it covers the send throw
  // (runtime-event-channel.md:130 — the fallback "covers synchronous throws from
  // the always-log emission sequence: for group-A ... `Clock.wallNow()` during
  // `occurred_at` stamping AND the `pi.sendMessage` call"). The adjudicated
  // group-A clock guard `#buildGroupAEventOrFallback` realises that: on a
  // non-stale stamp throw it hands the failure to `sendSystemNote` as a synthetic
  // send failure over the real channel and returns `undefined` so the caller does
  // NOT send again. Reverting its body to a bare `buildEvent()` leaves the guard
  // unwitnessed (the whole suite stays green) — this cell pins it both directions.
  it("emitTopLevelErrNote (group-A stamp guard): a non-stale Clock.wallNow() throw is CONTAINED by the fallback, with no re-stamp and no double send", () => {
    const { clock, calls } = throwingClock();
    const { channel, sends, notifyCalls, diagnostics } = stampGuardChannel();
    const deps = producerWith(channel, rootDouble(clock));

    // (a) the stamp throw is CONTAINED. With the guard reverted to a bare
    // `return buildEvent();`, `wallNow()` throws straight out of the emitter and
    // this assertion reds with the stamp error.
    expect(() => deps.emitTopLevelErrNote("demo", TRANSPORT_ERROR)).not.toThrow();

    const expectedContent = renderTopLevelErrNote({
      thetaName: "demo",
      error: TRANSPORT_ERROR,
      chain: [],
    });

    // (b) exactly ONE delivery-failed diagnostic, whose `hint` is the STAMP
    // error's message (runtime-event-channel.md:132 — when the failing step was
    // group-A `RuntimeEvent` construction the hint is the `Clock.wallNow()` throw).
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe(SYSTEM_NOTE_DELIVERY_FAILED_CODE);
    expect(
      diagnostics[0]!.hint,
      "the synthetic send-failure carries the stamp error's message as the delivery-failed hint",
    ).toBe(STAMP_ERROR_MESSAGE);

    // (c) exactly ONE toast: the `display: true` err note falls to `ui.notify`
    // with the rendered err-note content.
    expect(notifyCalls).toEqual([{ message: expectedContent, type: "error" }]);

    // (d) the channel's own `pi.sendMessage` recorder saw ZERO writes — the guard
    // returns `undefined`, so the caller never sends the note a second time.
    expect(
      sends,
      "the guard returns undefined on the fallback path; the caller must not send again",
    ).toHaveLength(0);

    // (e) `wallNow()` was invoked exactly ONCE — the fallback did not re-stamp
    // (runtime-event-channel.md:132 — the runtime MUST NOT re-invoke
    // `Clock.wallNow()` in the fallback).
    expect(calls()).toBe(1);
  });

  it("emitPanicNote (group-B): a non-stale host send throw is CONTAINED, not propagated", () => {
    const { channel } = recordingChannel();
    const deps = producerWith(channel);

    // RED ANCHOR (assertion 2): identical propagation at the fork — the framing
    // note's own raw send re-throws the host error out of the emitter, which is
    // the second throw that aborts the slash handler (runtime-event-channel.md:135).
    expect(() =>
      deps.emitPanicNote("theta /demo aborted: x", PANIC_DIAGNOSTIC),
    ).not.toThrow();
  });
});

// ===========================================================================
// PART B — an INFORMATIONAL site cell: SLSH-1 no-params overflow
// (`#emitNoParamsOverflowNote`, production-theta-producer.ts:1667; raw send
// :1672). Mirrors the bug-0401 no-params-theta + `runBinder` plumbing
// (tests/b0401-informational-notes-omit-details.test.ts). Proves a
// details-ABSENT note routes THROUGH the injected channel after the fix.
// ===========================================================================

/** The wire message a `pi.sendMessage` recorder captured. `details` is optional
 * so `"details" in note` reflects whether the SITE put the key on the wire —
 * the whole point of the bug-0401 informational contract this fix must preserve.
 */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: unknown;
}

/** The `theta-system-note` entries among the captured messages. */
function channelNotes(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL_TYPE);
}

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

function parse(path: string, src: string) {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
  expect(errors, "the theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/**
 * The bug-0401 binder-path root double: schemaValidator + checkpoint + clock +
 * idSource. The no-params bypass touches none of these before its emit, but the
 * plumbing is mirrored exactly so this cell shares the known-good harness.
 */
function binderRootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => "inv-1",
      newToolCallId: (): string => "tc-1",
    },
    clock: { wallNow: (): number => 0 },
    schemaValidator: new AjvSchemaValidator({
      emit: (): void => {},
      slugOf: (schema: LoweredSchema): SchemaSlug => {
        const canonicalBytes = JSON.stringify(schema);
        return { slug: canonicalBytes, canonicalBytes };
      },
    }),
  } as unknown as RuntimeRoot;
}

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic-messages",
  api: "anthropic-messages",
  strictCapable: true,
};

function binderModelRegistry(): ModelRegistry {
  return {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
}

// A no-params theta bypasses the binder; a non-empty slash-argument remainder
// drives `#emitNoParamsOverflowNote` (SLSH-1).
const NO_PARAMS_THETA = ["---", "mode: prompt", "---", "@`hello`", ""].join("\n");

function noParamsTheta(): ThetaCompositionInput {
  const doc = parse("plain.theta", NO_PARAMS_THETA);
  return {
    slashName: "plain",
    // The prefix is composed rather than written as one span so the DIAG-2
    // corpus gate's extractor does not read this fixture path as an asserted
    // diagnostic code in the `theta/` namespace (the composed-prefix idiom the
    // registry-closed-set corpus gate documents for path-shaped literals).
    sourcePath: "/theta/" + "plain.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
}

function ctxDouble(): ExtensionCommandContext {
  return {} as unknown as ExtensionCommandContext;
}

// The SLSH-1 content (slash-invocation.md#slsh-1) — em-dash (U+2014) separator.
const OVERFLOW_CONTENT =
  "theta /plain: ignoring extra arguments \u2014 this theta takes no parameters";

/** A recording (non-throwing) channel: captures the wire note the fix routes here. */
function recordingSystemNoteChannel(): {
  readonly channel: SystemNoteChannelDeps;
  readonly notes: CapturedNote[];
  readonly diagnostics: Diagnostic[];
} {
  const notes: CapturedNote[] = [];
  const diagnostics: Diagnostic[] = [];
  const channel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (message): void => {
        notes.push(message as CapturedNote);
      },
    },
    ui: { notify: (): void => {} },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
  return { channel, notes, diagnostics };
}

/** A throwing channel: `pi.sendMessage` throws the host error; records the
 * delivery-failed diagnostic on its off-channel sink. Fresh gate + health so
 * the throw is treated as non-stale and the chain is walked (not rethrown). */
function throwingSystemNoteChannel(): {
  readonly channel: SystemNoteChannelDeps;
  readonly diagnostics: Diagnostic[];
} {
  const diagnostics: Diagnostic[] = [];
  const channel: SystemNoteChannelDeps = {
    pi: {
      sendMessage: (): void => {
        throw new Error(HOST_ERROR_MESSAGE);
      },
    },
    ui: { notify: (): void => {} },
    emitDiagnostic: (diagnostic: Diagnostic): void => {
      diagnostics.push(diagnostic);
    },
    rendererGate: new RendererGate(),
    health: new SystemNoteChannelHealth(),
  };
  return { channel, diagnostics };
}

/** A recording top-level `pi` — the seam the RAW send lands on today. */
function recordingPi(): { readonly pi: ExtensionAPI; readonly notes: CapturedNote[] } {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  return { pi, notes };
}

/** A throwing top-level `pi` — the RAW send it receives today rejects `runBinder`. */
function throwingPi(): ExtensionAPI {
  return {
    sendMessage: (): void => {
      throw new Error(HOST_ERROR_MESSAGE);
    },
  } as unknown as ExtensionAPI;
}

function producerWithChannel(pi: ExtensionAPI, channel: SystemNoteChannelDeps) {
  return createProductionProducerDeps({
    pi,
    root: binderRootDouble(),
    modelRegistry: binderModelRegistry(),
    systemNoteChannel: channel,
  });
}

describe("bug 0437 — the SLSH-1 informational note routes through the channel with `details` absent", () => {
  it("B1 (routed + details-absent): the overflow note lands on the injected channel, not the raw top-level pi, and carries no `details`", async () => {
    const { channel, notes: channelLog } = recordingSystemNoteChannel();
    const { pi } = recordingPi();
    const deps = producerWithChannel(pi, channel);

    const result = await deps.runBinder({
      theta: noParamsTheta(),
      args: "extra text here",
      ctx: ctxDouble(),
    });
    expect(result.bound, "a no-params theta binds and its body runs").toBe(true);

    // RED AT FORK: today the raw `#input.pi.sendMessage` send lands on the
    // top-level pi, so the injected channel — the seam the §Fix routes onto —
    // is EMPTY. Fail loudly on the empty channel (the bypass the doc describes),
    // never a downstream vacuous pass.
    const routed = channelNotes(channelLog);
    expect(
      routed,
      "runtime-event-channel.md:130 — the SLSH-1 overflow note must route through #input.systemNoteChannel, not raw #input.pi.sendMessage",
    ).toHaveLength(1);
    const note = routed[0]!;
    expect(note.content).toBe(OVERFLOW_CONTENT);
    expect(note.display).toBe(true);

    // Parent adjudication: `SystemNote.details` becomes OPTIONAL so this bug-0401
    // informational note routes with `details` ABSENT on the wire (the byte
    // contract landed by bug 0401 is preserved, not fabricated).
    expect(
      "details" in note,
      "the routed overflow note must not carry a `details` key (bug 0401 informational contract preserved)",
    ).toBe(false);
    expect(
      JSON.stringify(note),
      'the serialised routed note must not contain "details"',
    ).not.toContain("details");
  });

  it("B2 (containment under a throwing host): the routed send is CONTAINED and runBinder resolves, emitting the delivery-failed diagnostic", async () => {
    const { channel, diagnostics } = throwingSystemNoteChannel();
    const deps = producerWithChannel(throwingPi(), channel);

    // RED AT FORK: today the raw send to the throwing TOP-LEVEL pi rejects
    // runBinder; after the fix the send routes to the throwing CHANNEL where
    // `sendSystemNote` contains the non-stale throw and runBinder resolves.
    await expect(
      deps.runBinder({
        theta: noParamsTheta(),
        args: "extra text here",
        ctx: ctxDouble(),
      }),
    ).resolves.toBeDefined();

    // Non-vacuous (AGENTS.md): the containment must have walked the chain and
    // emitted the delivery-failed diagnostic on the channel's off-channel sink.
    expect(
      diagnostics.map((d) => d.code),
      "the fallback emits theta/runtime/system-note-delivery-failed on the contained channel send throw",
    ).toContain(SYSTEM_NOTE_DELIVERY_FAILED_CODE);
  });
});
