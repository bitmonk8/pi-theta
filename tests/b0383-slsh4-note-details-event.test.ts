// Bug 0383 — the SLSH-4 top-level `Err` note ships `details: { event: {} }`
// where the spec pins `details: { event: RuntimeEvent }`.
//
// WHY this test exists: `slash-invocation.md:63` fixes the wire shape of every
// per-`kind` `Err` note — "Every row above emits as a `theta-system-note`
// carrying `details: { event: RuntimeEvent }`, where the `RuntimeEvent` payload
// is the same value emitted at the originating failure site (consumers
// deduplicate on `(kind, query_site, message, occurrence-timestamp)`)". A
// consumer following `diagnostic-shape.md:20` ("Renderers MUST switch on which
// key is present and MUST NOT assume more than one") switches on the present `details`
// key: `event` is present, so it takes the runtime-event arm — then reads an
// EMPTY payload. The emitter hardcodes `details: { event: {} }`
// (src/extension/production-theta-producer.ts:1614, re-derived by symbol —
// `emitTopLevelErrNote` at :1604). That literal `{ event: {} }` is the DEFECT:
// the `event` key classifies as the runtime-event arm but is not a
// `RuntimeEvent`.
//
// ADJUDICATED end state this test witnesses (Option B + forward hook): the note
// carries a real `RuntimeEvent` built once from the terminal Err LEAF
// (kind = leaf.kind, theta = `/${thetaName}`, message = leaf.message,
// invocation_id = a fresh `root.idSource.newInvocationId()`, occurred_at = a
// fresh `root.clock.wallNow()`; `query_site` omitted on this boundary path),
// via the conformant `buildRuntimeEventNote`. An optional third `event?`
// parameter (the forward hook) is used VERBATIM when supplied. The `content`
// line is byte-identical to today (`renderTopLevelErrNote`, unchanged).
//
// Tier: UNIT. The emitter takes no private state and `emitTopLevelErrNote` is a
// public producer-deps member reachable without a drive (per the bug's
// §Reproduction). No provider, no live model, no integration host needed — the
// production producer is built with a capturing `pi.sendMessage`, exactly as
// `tests/e2e-s5-binder-echo-emission.test.ts` does. An integration/live tier
// would add cost and nondeterminism for no additional reach.
//
// Rig mirrors tests/e2e-s5-binder-echo-emission.test.ts (rootDouble /
// producerWithCapture / modelRegistry double, capturing `pi.sendMessage`).

import { describe, expect, it } from "vitest";

import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  dedupKey,
  type RuntimeEvent,
} from "../src/runtime/runtime-event-channel";
import {
  isInvokeCalleeError,
  renderTopLevelErrNote,
} from "../src/runtime/err-note-render";
import type {
  CancelledError,
  CodeToolError,
  InvokeCalleeError,
  QueryError,
  TransportError,
} from "../src/runtime/query-error";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

// Known id/timestamp so the boundary-built path (absent-event arm) can be
// asserted at exact values, not merely "present".
const KNOWN_INVOCATION_ID = "inv-b0383";
const KNOWN_WALL_NOW = 1234567;

/**
 * A captured `pi.sendMessage` custom message — INCLUDING `details`, the
 * machine-readable half this bug is about (the sibling S5 test omits `details`
 * because it only reads `content`).
 */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: unknown;
}

/**
 * A runtime-root double whose `idSource.newInvocationId()` and `clock.wallNow()`
 * return KNOWN values, so the absent-event boundary path's freshly-minted
 * `invocation_id` / `occurred_at` are assertable at exact values. `fileSystem`
 * is absent, so the producer's invoke-provenance ledger is undefined and the
 * SLSH-5 chain is empty (irrelevant to the `details` payload under test).
 */
function rootDouble(): RuntimeRoot {
  return {
    idSource: {
      newInvocationId: (): string => KNOWN_INVOCATION_ID,
      newToolCallId: (): string => "tc-b0383",
    },
    clock: { wallNow: (): number => KNOWN_WALL_NOW },
  } as unknown as RuntimeRoot;
}

/**
 * A production producer wired with a capturing `pi.sendMessage` and the known-
 * value root double. Returns the producer deps + the captured-notes sink.
 */
function producerWithCapture(): {
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly notes: CapturedNote[];
} {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [],
  } as unknown as ModelRegistry;
  const deps = createProductionProducerDeps({ pi, root: rootDouble(), modelRegistry });
  return { deps, notes };
}

/**
 * The forward-hook signature the adjudicated fix adds (optional third `event?`).
 * The shipped `ThetaProducerDeps.emitTopLevelErrNote` is 2-arg today, so a
 * literal 3-arg call would be a TS error; casting `deps` to this widened member
 * compiles now and exercises the runtime path (today the 2-arg impl ignores the
 * third argument, so the forward-hook row REDS on the wire — correct RED). No
 * `@ts-expect-error`; `this` is preserved because it is still a method call on
 * the same object.
 */
interface DepsWithEventHook {
  emitTopLevelErrNote(thetaName: string, error: QueryError, event?: RuntimeEvent): void;
}

function noteChannelEntries(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

/**
 * The disjoint-by-key `details` classifier `diagnostic-shape.md:20` requires
 * renderers to implement ("switch on which key is present"). Returns which of
 * the five normative arms a `details` payload selects — the partition rule the
 * empty `{ event: {} }` breaks (it selects `event` but carries no RuntimeEvent).
 */
function presentDetailsKey(
  details: unknown,
): "diagnostics" | "event" | "structural" | "recovery" | "none" {
  if (typeof details !== "object" || details === null) return "none";
  if ("diagnostics" in details) return "diagnostics";
  if ("event" in details) return "event";
  if ("structural" in details) return "structural";
  if ("recovery" in details) return "recovery";
  return "none";
}

/** The `event` arm of a captured note's `details`, typed for assertion. */
function eventArm(details: unknown): Record<string, unknown> {
  return (details as { event: Record<string, unknown> }).event;
}

// Fully-typed leaf builders — the emitter reads only `kind`/`message`, but the
// interfaces require every field, so the file compiles without casts at the
// construction site.
function transportLeaf(message: string): TransportError {
  return {
    kind: "transport",
    message,
    http_status: null,
    provider: "anthropic-messages",
    retryable: false,
  };
}

function cancelledLeaf(message: string): CancelledError {
  return { kind: "cancelled", message };
}

function codeToolLeaf(message: string): CodeToolError {
  return { kind: "code_tool", message, tool_name: "grep", cause: "execution" };
}

describe("bug 0383 — SLSH-4 top-level Err note carries details: { event: RuntimeEvent }", () => {
  it("transport leaf (SNK-c): details.event is the originating RuntimeEvent, not the empty {} shipped today", () => {
    const { deps, notes } = producerWithCapture();
    const leaf = transportLeaf("boom");

    deps.emitTopLevelErrNote("demo", leaf);

    const channelNotes = noteChannelEntries(notes);
    expect(channelNotes, "exactly one SLSH-4 note is emitted").toHaveLength(1);
    const note = channelNotes[0]!;

    // RED-AT-FORK anchor. Today `note.details` is the literal `{ event: {} }`
    // hardcoded at production-theta-producer.ts:1614 — every GREEN-direction
    // assertion below fails against that empty payload.
    const key = presentDetailsKey(note.details);
    expect(key, "diagnostic-shape.md:20 partition — this note takes the `event` arm").toBe(
      "event",
    );
    const event = eventArm(note.details);
    // The classifier selects the runtime-event arm (true today AND after the
    // fix), but the payload must be NON-EMPTY — this reds today ({} → 0 keys).
    expect(
      Object.keys(event).length,
      "the `event` arm must carry a RuntimeEvent, not `{}` — bug 0383 ships an empty payload",
    ).toBeGreaterThan(0);

    // Primary per-field GREEN assertions (all red today against `{}`).
    expect(event.kind, "SNK-c per-kind coverage — kind is the leaf's transport kind").toBe(
      leaf.kind,
    );
    expect(event.message, "message is the leaf message").toBe(leaf.message);
    expect(event.theta, "theta is `/<thetaName>`").toBe("/demo");
    expect(
      event.invocation_id,
      "invocation_id is the fresh root.idSource id (boundary-built path)",
    ).toBe(KNOWN_INVOCATION_ID);
    expect(
      event.occurred_at,
      "occurred_at is the fresh root.clock.wallNow() (boundary-built path)",
    ).toBe(KNOWN_WALL_NOW);

    // The value validates as a RuntimeEvent: required fields present with the
    // right primitive types, then it is a usable dedup key (not `{}`).
    expect(typeof event.kind).toBe("string");
    expect(typeof event.theta).toBe("string");
    expect(typeof event.invocation_id).toBe("string");
    expect(typeof event.message).toBe("string");
    expect(typeof event.occurred_at).toBe("number");
    expect(
      typeof dedupKey(event as unknown as RuntimeEvent),
      "the RuntimeEvent yields a usable dedup key per slash-invocation.md:63",
    ).toBe("string");
  });

  it("byte-identity CONTROL: the content line is byte-identical to renderTopLevelErrNote (fix must not perturb content bytes)", () => {
    // Green BOTH directions — the `content` half is already correct (bug 0383
    // is confined to `details`); this locks 0382's landed content discipline.
    const { deps, notes } = producerWithCapture();
    const leaf = transportLeaf("boom");

    deps.emitTopLevelErrNote("demo", leaf);

    const note = noteChannelEntries(notes)[0]!;
    expect(note.display, "the SLSH-4 note is display:true").toBe(true);
    expect(note.content).toBe(
      renderTopLevelErrNote({ thetaName: "demo", error: leaf, chain: [] }),
    );
  });

  it("cancelled leaf (SNK-f): details.event.kind is the cancelled kind and content matches the SNK-f row", () => {
    const { deps, notes } = producerWithCapture();
    const leaf = cancelledLeaf("aborted");

    deps.emitTopLevelErrNote("demo", leaf);

    const note = noteChannelEntries(notes)[0]!;
    // RED today: details.event is `{}`, so `.kind` is undefined.
    expect(eventArm(note.details).kind, "SNK-f per-kind coverage").toBe("cancelled");
    // Content control — green both directions.
    expect(note.content).toBe(
      renderTopLevelErrNote({ thetaName: "demo", error: leaf, chain: [] }),
    );
  });

  it("code_tool leaf (SNK-g): details.event.kind is the code_tool kind and content matches the SNK-g row", () => {
    const { deps, notes } = producerWithCapture();
    const leaf = codeToolLeaf("nonzero exit");

    deps.emitTopLevelErrNote("demo", leaf);

    const note = noteChannelEntries(notes)[0]!;
    // RED today: details.event is `{}`, so `.kind` is undefined.
    expect(eventArm(note.details).kind, "SNK-g per-kind coverage").toBe("code_tool");
    expect(note.content).toBe(
      renderTopLevelErrNote({ thetaName: "demo", error: leaf, chain: [] }),
    );
  });

  it("invoke_callee wrapper: the RuntimeEvent kind is the LEAF kind (transport), proving leaf extraction", () => {
    const { deps, notes } = producerWithCapture();
    const inner = transportLeaf("underlying transport");
    const wrapper: InvokeCalleeError = {
      kind: "invoke_callee",
      message: "callee failed",
      callee_path: "/thetas/child.theta",
      inner,
    };
    // Guard the fixture: the wrapper really is an invoke_callee wrapper whose
    // leaf is the transport error the fix must walk `inner` down to.
    expect(isInvokeCalleeError(wrapper)).toBe(true);

    deps.emitTopLevelErrNote("demo", wrapper);

    const note = noteChannelEntries(notes)[0]!;
    // RED today ({} → undefined). GREEN after fix: the terminal LEAF kind, NOT
    // "invoke_callee" — the emitter walks `error.inner` to the leaf.
    expect(
      eventArm(note.details).kind,
      "leaf extraction — the event kind is the inner transport leaf, not the invoke_callee wrapper",
    ).toBe("transport");
    expect(eventArm(note.details).message, "message is the leaf message").toBe(inner.message);
  });

  it("forward hook: a supplied event? is used VERBATIM on the wire (query_site preserved)", () => {
    const { deps, notes } = producerWithCapture();
    // A distinctive event a boundary-built path could NOT produce: it carries a
    // `query_site` (omitted on the boundary path) and a non-known invocation_id
    // / occurred_at — so identity is unambiguous.
    const suppliedEvent: RuntimeEvent = {
      kind: "transport",
      theta: "/demo",
      invocation_id: "inv-forward-hook",
      message: "supplied verbatim",
      occurred_at: 987654,
      query_site: { file: "/thetas/demo.theta", line: 7, column: 3 },
    };
    const leaf = transportLeaf("supplied verbatim");

    // 3-arg call through the widened member (see DepsWithEventHook). Today the
    // 2-arg impl ignores the third argument → details.event stays `{}` → RED.
    (deps as unknown as DepsWithEventHook).emitTopLevelErrNote("demo", leaf, suppliedEvent);

    const note = noteChannelEntries(notes)[0]!;
    const event = eventArm(note.details);
    // Deep-equal on every supplied field (the fix threads the event through
    // unchanged); the boundary path omits `query_site`, so its presence
    // discriminates the hook from a rebuild.
    expect(event, "the supplied event is placed on the wire verbatim").toEqual(suppliedEvent);
    expect(
      event.query_site,
      "query_site is preserved — the boundary-built path would omit it",
    ).toEqual(suppliedEvent.query_site);
  });
});
