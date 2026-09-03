// Bug 0397 — every binder-failure `theta-system-note` ships `details: { event:
// {} }` where the always-log contract (`runtime-event-channel.md:40`, group-A
// enumeration `runtime-event-channel.md:46–53`, binder-failure sourcing
// `runtime-event-channel.md:83`) pins
// `details: { event: RuntimeEvent }`. The structured half is the note's only
// machine-readable part, and for a binder failure the note is the occurrence's
// ONLY emission — so `{}` makes the always-log guarantee for this group-A member
// vacuous, not merely degraded.
//
// WHY the seam is the FULL dispatch, not `runBinder` directly:
// `runtime-event-channel.md:83` sources the event's `invocation_id`/`theta` from
// the invocation's `ActiveInvocationRegistry` entry — the entry the dispatch
// site inserts at handler entry (`beginInvocation`, before the awaited binder
// step, per the registry contract). A bare `deps.runBinder(...)` call never runs
// `beginInvocation`, so no entry exists to source from; the witness must drive
// `composeThetaFixture(...).run(args, ctx)` with a REAL `ActiveInvocationRegistry`
// wired into the producer input so the entry is genuinely inserted. The fix
// THREADS that entry into the binder path through a NEW INTERNAL
// `BinderRunInput` field; this test references ONLY stable public API and never
// that field, so it compiles AND reds on the current tree.
//
// TIER: unit — offline, provider-free, deterministic. The off-session binder
// `complete()` free function is mocked (the `tests/e2e-s5-binder-echo-emission.test.ts`
// / bug-0011 pattern), so every failure route is reached with a scripted reply
// and no live model. An integration/live tier would re-drive discovery to reach
// the same `#emitBinderFailureNote` seam and witness nothing further.
//
// RED SHAPE (pre-fix): `details` was the literal `{ event: {} }` hardcoded
// unconditionally inside `#emitBinderFailureNote`, so every route's
// `details.event.kind` was `undefined` and `Object.keys(event).length` was 0.
// Post-fix, that literal survives ONLY on the ticket-undefined harness-only
// branch (`production-theta-producer.ts:1433`) — unreached here, since this
// witness drives the full dispatch and always threads a real ticket. The GREEN
// direction (constraint 1 / 4): `.kind` = the failure cause,
// `.invocation_id`/`.theta` from the registry entry, `query_site` absent,
// `.occurred_at` a `Clock.wallNow()` number, `.message` the interpolated string.
//
// One byte-identity CONTROL (green at fork AND after the fix) pins that the
// user-facing `content` bytes (`renderBinderSystemNote`) are untouched — the
// bug is confined to `details` (§Non-goals).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session binder reply. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
// `replyFor` is a FUNCTION of the captured call so a ToolCall reply can name
// whatever binder tool production actually attached for this fixture's schema.
const scripted = vi.hoisted(() => ({
  replyFor: undefined as undefined | ((context: unknown) => unknown),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export (types, helpers) passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (_model: unknown, context: unknown) =>
      scripted.replyFor?.(context),
    ),
  };
});

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import {
  composeThetaFixture,
  type ThetaCompositionInput,
} from "../src/extension/theta-composition-producer";
import {
  ActiveInvocationRegistry,
  type ActiveInvocationEntry,
} from "../src/runtime/active-invocation-registry";
import { renderBinderSystemNote } from "../src/binder/retry-taxonomy";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { RuntimeRoot } from "../src/runtime-root";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";

const SYSTEM_NOTE_CHANNEL = "theta-system-note";

// A pinned wall clock so the runtime-event `occurred_at` (stamped via
// `root.clock.wallNow()` per §Fix constraint 1) is assertable at an exact value.
const KNOWN_WALL_NOW = 1720000000000;

const BINDER_MODEL = {
  id: "binder-model",
  provider: "anthropic",
  api: "anthropic-messages",
  strictCapable: true,
};

/** The transport-failure `errorMessage` the scripted error-stop reply carries. */
const TRANSPORT_ERROR_MESSAGE = "503 upstream unavailable";

// --- captured note shape ----------------------------------------------------

/**
 * A captured `pi.sendMessage` custom message — INCLUDING `details`, the
 * machine-readable half this bug is about.
 */
interface CapturedNote {
  readonly customType: string;
  readonly content: string;
  readonly display?: boolean;
  readonly details?: { readonly event?: Record<string, unknown> };
}

/**
 * A real `ActiveInvocationRegistry` that records each inserted entry's
 * `invocationId` at `add`-time. The dispatch `finally` removes the entry before
 * `run()` resolves, so a post-drive `snapshot()` is empty — recording the id on
 * insertion is how the witness reads the entry the event must source from
 * (`runtime-event-channel.md:83`), and proves the entry was GENUINELY inserted.
 */
class RecordingRegistry extends ActiveInvocationRegistry {
  readonly addedIds: string[] = [];
  override add(entry: ActiveInvocationEntry): void {
    this.addedIds.push(entry.invocationId);
    super.add(entry);
  }
}

// --- parse + root scaffolding (the e2e-s5 / bug-0066 production pattern) -----

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

/** Parse `.theta` source through the production whole-file parser (must be clean). */
function parse(src: string, path: string) {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the binder theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the binder theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator, wired with the shipped content-addressing. */
function realAjv(): AjvSchemaValidator {
  return new AjvSchemaValidator({
    emit: (): void => {},
    slugOf: (schema: LoweredSchema): SchemaSlug => {
      const canonicalBytes = JSON.stringify(schema);
      return { slug: canonicalBytes, canonicalBytes };
    },
  });
}

/**
 * A runtime-root double sufficient for a binder pass: noop checkpoint, a fresh
 * COUNTER id source (so the registry entry's minted id — the first mint — is
 * distinct from any later fresh mint, making an event that fresh-mints instead
 * of sourcing the entry fail the `invocation_id` assertion), the pinned wall
 * clock, the REAL AJV validator, and an in-memory fs resolving the fixtures.
 */
function rootDouble(): RuntimeRoot {
  let n = 0;
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: {
      newInvocationId: (): string => `inv-${(n += 1)}`,
      newToolCallId: (): string => "tc-1",
    },
    clock: { wallNow: (): number => KNOWN_WALL_NOW },
    schemaValidator: realAjv(),
    fileSystem: {
      readBytes: (path: string): Promise<Uint8Array> => {
        const src = SOURCES.get(path);
        return src !== undefined
          ? Promise.resolve(new TextEncoder().encode(src))
          : Promise.reject(new Error(`fixture fs: no source registered for ${path}`));
      },
    },
  } as unknown as RuntimeRoot;
}

// --- the driven thetas ------------------------------------------------------

/** Two required string params — a genuine binder pass with no defaulted fields. */
const TWO_PARAM_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  topic: string",
  "  audience: string",
  "---",
  "@`review ${topic} for ${audience}`",
  "",
].join("\n");
const TWO_PARAM_PATH = "/theta/code-review.theta";

/**
 * A five-deep named-schema chain whose lowered fragment ADMITS a depth-6
 * `params` document, so a depth-6 `ok`-envelope `args` reaches the
 * post-default-merge hook and cross-routes into the AJV-on-`args` class
 * (`ajv_args`) rather than being stopped by the envelope AJV at extraction. No
 * declared default → the depth walk over the binder's own args is the subject.
 */
const DEEP_CHAIN_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: L1",
  "---",
  "schema L1 { a: L2 }",
  "schema L2 { b: L3 }",
  "schema L3 { c: L4 }",
  "schema L4 { d: L5 }",
  "schema L5 { e: string }",
  "@`p bound`",
  "",
].join("\n");
const DEEP_CHAIN_PATH = "/theta/b0397deep.theta";
const DEPTH_6_ARGS = { p: { a: { b: { c: { d: { e: "x" } } } } } } as const;

const SOURCES: ReadonlyMap<string, string> = new Map([
  [TWO_PARAM_PATH, TWO_PARAM_THETA],
  [DEEP_CHAIN_PATH, DEEP_CHAIN_THETA],
]);

function twoParamTheta(): ThetaCompositionInput {
  const doc = parse(TWO_PARAM_THETA, TWO_PARAM_PATH);
  return {
    slashName: "code-review",
    sourcePath: TWO_PARAM_PATH,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

function deepChainTheta(): ThetaCompositionInput {
  const doc = parse(DEEP_CHAIN_THETA, DEEP_CHAIN_PATH);
  return {
    slashName: "b0397deep",
    sourcePath: DEEP_CHAIN_PATH,
    frontmatter: doc.frontmatter!,
    body: doc.body,
    binderModel: "binder-model",
  };
}

// --- scripted binder replies (one per failure route) ------------------------

/**
 * Script a ToolCall reply carrying `{ envelope }`, naming the binder tool
 * production attached on the captured call (`context.tools[0].name`) — the
 * bug-0011 forced-tool extraction reads the envelope from the FIRST ToolCall
 * naming the binder tool. Reaches the `needs_info` / `ambiguous` / `ajv_args`
 * routes (which classify off the extracted envelope).
 */
function scriptEnvelope(envelope: unknown): void {
  scripted.replyFor = (context: unknown): unknown => {
    const tools = (context as { tools?: ReadonlyArray<{ name?: unknown }> }).tools;
    const name = typeof tools?.[0]?.name === "string" ? tools[0].name : "__theta_bind_none";
    return {
      role: "assistant",
      content: [{ type: "toolCall", id: "tc-1", name, arguments: { envelope } }],
      stopReason: "toolUse",
      timestamp: 0,
    };
  };
}

/**
 * A free-text reply naming no binder tool → the envelope cannot be extracted →
 * every attempt classifies `malformed`; the single malformed-class retry
 * exhausts (2 LLM calls) and the terminal `malformed` row surfaces.
 */
function scriptMalformed(): void {
  scripted.replyFor = (): unknown => ({
    role: "assistant",
    content: [{ type: "text", text: "here is some prose, no tool call" }],
    // `OFF_SESSION_NORMAL_STOP_REASONS` (production-theta-producer.ts) is the
    // literal `pi-ai` `StopReason` vocabulary (`"stop" | "length" | "toolUse" |
    // "error" | "aborted"`) plus its snake_case sibling; "stop" (not "endTurn",
    // which is neither) is what routes past the transport-classification branch
    // into the intended no-ToolCall → malformed terminal below.
    stopReason: "stop",
    timestamp: 0,
  });
}

/**
 * A `stopReason: "error"` reply (the shape pi-ai's `complete()` resolves on a
 * provider failure) → every attempt classifies `transport`; the single
 * transport-class retry exhausts (2 LLM calls) and the terminal `transport` row
 * surfaces, carrying the resolved model's `.api` as `<provider>`.
 */
function scriptTransport(): void {
  scripted.replyFor = (): unknown => ({
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    stopReason: "error",
    errorMessage: TRANSPORT_ERROR_MESSAGE,
    timestamp: 0,
  });
}

// --- drive + capture --------------------------------------------------------

/** A dispatch ctx. `signal` is the pre-turn abort source the dispatch forwards. */
function ctxWith(signal?: AbortSignal): ExtensionCommandContext {
  return { signal } as unknown as ExtensionCommandContext;
}

interface DriveOutcome {
  readonly notes: CapturedNote[];
  readonly registry: RecordingRegistry;
}

/**
 * Drive the FULL slash dispatch (`composeThetaFixture(...).run`) with a REAL
 * `RecordingRegistry` wired into the producer input, so `beginInvocation`
 * genuinely inserts the entry the runtime-event must source from
 * (runtime-event-channel.md:83). The
 * binder failure short-circuits (`{ bound: false }`) before the body, so no
 * executor mock is needed.
 */
async function driveDispatch(
  theta: ThetaCompositionInput,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<DriveOutcome> {
  const notes: CapturedNote[] = [];
  const pi = {
    sendMessage: (message: CapturedNote): void => {
      notes.push(message);
    },
  } as unknown as ExtensionAPI;
  const modelRegistry = {
    getAvailable: (): readonly unknown[] => [BINDER_MODEL],
    getApiKeyAndHeaders: async (): Promise<{ ok: boolean }> => ({ ok: true }),
  } as unknown as ModelRegistry;
  const registry = new RecordingRegistry();
  const deps = createProductionProducerDeps({
    pi,
    root: rootDouble(),
    modelRegistry,
    activeInvocations: registry,
  });

  await composeThetaFixture(theta, deps).run(args, ctx);
  return { notes, registry };
}

function channelNotes(notes: readonly CapturedNote[]): CapturedNote[] {
  return notes.filter((n) => n.customType === SYSTEM_NOTE_CHANNEL);
}

/** A readable summary of the wire for a red that names what WAS emitted. */
function wireSummary(notes: readonly CapturedNote[]): string {
  return channelNotes(notes)
    .map((n) => `{content:${JSON.stringify(n.content)} details:${JSON.stringify(n.details)}}`)
    .join(", ");
}

/**
 * The shared per-route assertion. `expectedMessage` is asserted verbatim where
 * the event's message is a clear interpolation of a known string (the model's
 * message on `needs_info`/`ambiguous`/`transport`); elsewhere the message's
 * derivation is a fix detail, so only presence + non-emptiness is pinned.
 *
 * Every assertion below reds today against the empty `{ event: {} }` payload:
 * `.kind` is `undefined`, the key count is 0, and every sourcing field is
 * absent. The `query_site` absence holds today (vacuously, over `{}`) and after
 * the fix (runtime-event-channel.md:83 omits it), so it is a spec pin rather than a red anchor.
 */
function assertFailureEvent(
  outcome: DriveOutcome,
  expected: {
    readonly kind: string;
    readonly theta: string;
    readonly expectedMessage?: string;
  },
): void {
  const { notes, registry } = outcome;
  // Loud precondition: the registry entry was genuinely inserted, so
  // runtime-event-channel.md:83 has
  // something to source from. A silent absence here would make the id/theta
  // assertions vacuous.
  expect(
    registry.addedIds.length,
    "beginInvocation must have inserted exactly one ActiveInvocationRegistry entry for this dispatch (runtime-event-channel.md:83 sourcing)",
  ).toBe(1);
  const entryId = registry.addedIds[0]!;

  const rows = channelNotes(notes);
  expect(
    rows.length,
    `exactly one binder-failure note is the occurrence's only emission; wire: ${wireSummary(notes)}`,
  ).toBe(1);
  const note = rows[0]!;

  expect(
    note.details,
    "the group-A binder-failure note routes `details: { event: RuntimeEvent }` (runtime-event-channel.md:46-53)",
  ).toBeDefined();
  const event = note.details?.event;
  expect(
    event,
    "diagnostic-shape.md:20 — the present `event` key selects the runtime-event arm; it must be an object",
  ).toBeDefined();
  const ev = event as Record<string, unknown>;

  // PRIMARY RED ANCHOR: today `details.event` is `{}`, so `.kind` is undefined.
  expect(
    ev.kind,
    "runtime-event-channel.md:83 — `kind` is the binder failure cause; pre-fix, `#emitBinderFailureNote` shipped `details: { event: {} }` unconditionally, so `.kind` was undefined",
  ).toBe(expected.kind);
  expect(
    Object.keys(ev).length,
    "the `event` arm must carry a RuntimeEvent, not the empty `{}` the ticket-undefined harness-only branch still ships (production-theta-producer.ts:1433) — unreached here, since this witness always threads a real ticket",
  ).toBeGreaterThan(0);

  // runtime-event-channel.md:83 sourcing — read from the invocation's registry entry, NOT a fresh mint
  // (the counter id source makes a fresh mint a DIFFERENT value, so this fails
  // both against `{}` today and against any fresh-mint fix).
  expect(
    ev.invocation_id,
    "runtime-event-channel.md:83 — `invocation_id` is the ActiveInvocationRegistry entry's `invocationId` field",
  ).toBe(entryId);
  expect(
    ev.theta,
    "runtime-event-channel.md:83 — `theta` is the entry's `theta` field, wire form `/<name>`",
  ).toBe(expected.theta);
  expect(
    "query_site" in ev,
    "runtime-event-channel.md:83 — binder-failure events carry no `query_site` (the binder runs before any theta code)",
  ).toBe(false);

  // occurred_at via Clock.wallNow() (constraint 1).
  expect(
    typeof ev.occurred_at,
    "occurred_at is stamped via root.clock.wallNow()",
  ).toBe("number");
  expect(ev.occurred_at, "occurred_at is the pinned wall clock").toBe(KNOWN_WALL_NOW);

  // message — the same string interpolated into the user-facing template.
  if (expected.expectedMessage !== undefined) {
    expect(ev.message, "message is the string interpolated into the failure template").toBe(
      expected.expectedMessage,
    );
  } else {
    expect(typeof ev.message, "message is present as a string").toBe("string");
    expect((ev.message as string).length, "message is non-empty").toBeGreaterThan(0);
  }
}

beforeEach(() => {
  scripted.replyFor = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("bug 0397 — binder-failure notes carry details: { event: RuntimeEvent } sourced from the registry entry", () => {
  it("needs_info route: details.event.kind === \"needs_info\", sourced fields present, query_site absent", async () => {
    scriptEnvelope({ kind: "needs_info", message: "which topic?" });

    const outcome = await driveDispatch(twoParamTheta(), "vague", ctxWith());

    assertFailureEvent(outcome, {
      kind: "needs_info",
      theta: "/code-review",
      expectedMessage: "which topic?",
    });
  });

  it("ambiguous route: details.event.kind === \"ambiguous\", sourced fields present, query_site absent", async () => {
    // `candidates` is a REQUIRED field on the envelope's `ambiguous` arm
    // (`binder-envelope.ts` — `required: ["kind", "message", "candidates"]`, nullable);
    // omitting it fails the envelope's own AJV routing check and cross-routes to
    // `malformed`, not the `ambiguous` route this cell means to witness.
    scriptEnvelope({ kind: "ambiguous", message: "topic or audience is unclear", candidates: null });

    const outcome = await driveDispatch(twoParamTheta(), "either way", ctxWith());

    assertFailureEvent(outcome, {
      kind: "ambiguous",
      theta: "/code-review",
      expectedMessage: "topic or audience is unclear",
    });
  });

  it("malformed route: a reply naming no binder tool exhausts the retry budget → details.event.kind === \"malformed\"", async () => {
    scriptMalformed();

    const outcome = await driveDispatch(twoParamTheta(), "anything", ctxWith());

    assertFailureEvent(outcome, { kind: "malformed", theta: "/code-review" });
  });

  it("ajv_args route: a depth-6 `ok`-envelope args cross-routes at the post-merge hook → details.event.kind === \"ajv_args\"", async () => {
    scriptEnvelope({ kind: "ok", args: DEPTH_6_ARGS });

    const outcome = await driveDispatch(deepChainTheta(), "go", ctxWith());

    assertFailureEvent(outcome, { kind: "ajv_args", theta: "/b0397deep" });
  });

  it("transport route: a provider error-stop exhausts the retry budget → details.event.kind === \"transport\"", async () => {
    scriptTransport();

    const outcome = await driveDispatch(twoParamTheta(), "review it", ctxWith());

    assertFailureEvent(outcome, {
      kind: "transport",
      theta: "/code-review",
      expectedMessage: TRANSPORT_ERROR_MESSAGE,
    });
  });

  it("cancelled route: an aborted thetaAbort at the binder-call checkpoint → details.event.kind === \"cancelled\"", async () => {
    // An already-aborted `ctx.signal` immediately aborts the dispatch-owned
    // `thetaAbort` (`forwardSlashCommandCancel` → `forwardSignalReason`), so the
    // `binder-call` checkpoint short-circuits to `cancelled` before any LLM
    // call. No envelope is scripted — `complete()` is never reached.
    const controller = new AbortController();
    controller.abort(new Error("cancelled by user"));

    const outcome = await driveDispatch(twoParamTheta(), "review it", ctxWith(controller.signal));

    assertFailureEvent(outcome, { kind: "cancelled", theta: "/code-review" });
  });

  it("byte-identity CONTROL: the note `content` is renderBinderSystemNote output, unchanged (green at fork)", async () => {
    // Green BOTH directions: the `content` half is correct today (§Non-goals);
    // this locks that the fix does not perturb the user-facing bytes. The
    // needs_info row's template interpolates the model message after the em-dash.
    scriptEnvelope({ kind: "needs_info", message: "which topic?" });

    const outcome = await driveDispatch(twoParamTheta(), "vague", ctxWith());

    const rows = channelNotes(outcome.notes);
    expect(rows.length, "one failure note is emitted").toBe(1);
    const note = rows[0]!;
    expect(note.display, "the binder-failure note is display:true").toBe(true);
    expect(note.content).toBe(
      renderBinderSystemNote("code-review", { kind: "needs_info", message: "which topic?" }),
    );
  });
});
