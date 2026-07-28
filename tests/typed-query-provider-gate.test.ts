// Bug 0010 — INCREMENT C: the typed-query provider gate — runtime Err BEFORE
// any provider traffic + load-time warning wiring (regression pins + controls).
//
// docs/bugs/0010-typed-forced-respond-user-visible-no-toolchoice.md ("Provider
// gate" row: "the documented provider gate does not exist at runtime … the
// documented load warning and unsupported-provider Err(TransportError) never
// fire") and the fix brief §PROVIDER GATE. The contract
// (pi-integration-contract/conversation-drive.md §"Provider compatibility for
// typed queries" + the §"theta 1.0 seam — typed-query supported provider set"):
//
//   - RUNTIME: a typed query whose RESOLVED RESPOND MODEL (frontmatter
//     `model:` XOR the `ctx.model` fallback) carries a `String(.api)` outside
//     the supported set returns `Err(QueryError { kind: "transport", message:
//     "<api> does not support forced tool-use; typed queries unavailable",
//     http_status: null, provider: "<api>", retryable: false })` BEFORE any
//     provider traffic — ZERO `pi.sendUserMessage` calls and ZERO `complete()`
//     calls for that query (the gate short-circuits the free phase at round 0).
//     `<api>` is the api-shaped `Model<Api>.api` value.
//   - SUPPORTED SET at the theta-1.0 pin: the SIX `api`-shaped members now
//     pinned by conversation-drive.md §Provider compatibility (the bug-0010
//     spec clarification) — the four documented provider names
//     (`anthropic-messages`, `openai-completions`, `mistral`,
//     `amazon-bedrock`) plus the pin-observed KnownApi spellings pi-ai maps a
//     named-tool toolChoice for, `mistral-conversations` and
//     `bedrock-converse-stream` (the FORCED_TOOL_CHOICE_BY_API rows; the seam
//     note pins "a single named runtime constant referenced by every
//     consumer", so the set lives on TYPED_QUERY_SUPPORTED_PROVIDER_APIS).
//   - UNTYPED queries against the same theta continue to work (no gate).
//   - LOAD TIME: when a parsed theta CONTAINS at least one typed-query
//     expression AND its frontmatter `model:` is present AND load-resolves to
//     a model whose api is outside the set, the runtime emits the WARNING
//     `theta/load/typed-query-unsupported-provider` with the message from
//     `typedQueryUnsupportedProviderMessage(api, modelReference)`; the theta
//     STILL loads/registers. No `model:` → no warning. Untyped-only theta → no
//     warning. Supported api → no warning. A typed query nested in a
//     `subagent fn` body or a `let` initializer counts as "contains".
//
// LOAD-WIRING SEAM CHOICE (investigation outcome, retained as WHY): the
// emitter `checkTypedQueryProviderSupport` predated increment C; the increment
// added (1) the AST walk that decides `hasTypedQuery`
// (`detectTypedQueryExpression`, src/parser/theta-document.ts — true iff ANY
// QueryExpr reachable in the body carries a non-null `schema`: top-level
// statements/tail, `let` initializers, fn / `subagent fn` bodies, match arms,
// nested control flow) and (2) the composition-pass wiring that resolves the
// frontmatter `model:` and composes (1) with the emitter
// (`checkThetaTypedQueryProviderSupport`,
// src/extension/production-composition.ts — null when no `model:`, when the
// reference does not resolve, when no typed query exists, or when the api is
// supported). The full-composition integration cell for the WARNING lives in
// tests/load-warning-delivery.test.ts (cell A1): since the bug-0013 fix the
// shipped sink routes load-phase warnings onto the `theta-system-note`
// channel (and the helper path mirrors them to headless stderr), so the gate
// warning is observable end-to-end there. The cells below stay at the two
// exported helper seams — the right level for pinning the gate's
// classification table (which inputs warn, which are null) independent of
// delivery.
//
// TODO resolution (fix review, F3/F4): RESOLVED by the bug-0013 fix — both
// production load sinks deliver warnings (the shipped path onto the
// `theta-system-note` channel; the helper path onto headless stderr), and the
// integration cell those findings anticipated exists:
// tests/load-warning-delivery.test.ts drives this gate's warning through the
// real factory + `composeExtensionInstance` end-to-end. The helper-seam cells
// here continue to pin the decision logic; the delivery pin lives in that
// suite rather than duplicated here.
//
// e2e-s4 INVESTIGATION (ordered by the increment-C brief): neither
// tests/e2e-s4-never-emitted-diagnostics.test.ts nor
// tests/e2e-s4-uncovered-emitted-diagnostics.test.ts lists
// 'theta/load/typed-query-unsupported-provider' (verified by grep) — those
// suites cover the ten FIND-S4 parse/load codes only, so NO listing moves for
// bug 0010.
//
// Spec: pi-integration-contract/conversation-drive.md (§Provider compatibility
// for typed queries, §theta 1.0 seam — typed-query supported provider set,
// §complete() forced-tool presupposition), query/query-tool-loop.md (QRY-14),
// diagnostics/code-registry-load.md (the warning code/message),
// errors-and-results/queryerror-variants.md (TransportError shape, provider
// derivation).
//
// Method: the tests/typed-two-phase-live.test.ts LIVE harness, DUPLICATED per
// the increment-C rules (that suite stays untouched), with the same scripted
// `complete()` queue (sticky-last + throw-on-unscripted) — every runtime cell
// asserts BOTH counters (`sendUserMessage`, `complete()`). The load-time cells
// drive the emitter / walker / wiring seams directly (no session drive).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The recorded off-session `complete()` calls and the scripted reply queue
// (`vi.hoisted` so the hoisted `vi.mock` factory closes over the holder).
const scripted = vi.hoisted(() => ({
  queue: [] as Array<
    (call: { model: unknown; context: unknown; options: unknown }) => unknown
  >,
  calls: [] as Array<{ model: unknown; context: unknown; options: unknown }>,
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async (model: unknown, context: unknown, options: unknown) => {
      const call = { model, context, options };
      const index = scripted.calls.length;
      scripted.calls.push(call);
      if (scripted.queue.length === 0) {
        // No silent skipping: a dispatch against an unscripted cell fails
        // loudly (cells that pin ZERO complete() calls leave the queue empty).
        throw new Error(
          `scripted complete() called with an EMPTY reply queue (call #${index + 1})`,
        );
      }
      // Sticky-last consumption (the bug-0007 suite discipline).
      const factory = scripted.queue[Math.min(index, scripted.queue.length - 1)]!;
      return factory(call);
    }),
  };
});

import { createHash } from "node:crypto";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import * as thetaDocumentModule from "../src/parser/theta-document";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaBody,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import * as productionComposition from "../src/extension/production-composition";
import {
  checkTypedQueryProviderSupport,
  TYPED_QUERY_SUPPORTED_PROVIDER_APIS,
  TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE,
  typedQueryUnsupportedProviderMessage,
} from "../src/binder/provider-error-mapping";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

// --- The resolved models ------------------------------------------------------
// DISTINCT `.api` / `.provider` / `.id` strings (the bug-0007/0009 fixture
// discipline) so a provider assertion catches a wrong-field read.

/** The user session's selected model (`ctx.model`) — a SUPPORTED api. */
const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

/**
 * The canonical UNSUPPORTED respond model: pi-ai exposes no named-tool
 * toolChoice mapping for google-generative-ai at the theta-1.0 pin, so a typed
 * query routed here must be refused by the gate.
 */
const GOOGLE_MODEL = {
  id: "m-gem",
  api: "google-generative-ai",
  provider: "google",
  strictCapable: true,
};

/**
 * The supported-SPELLING control: `mistral-conversations` is a pin-observed
 * KnownApi spelling with a working forced-tool mapping (the AB
 * FORCED_TOOL_CHOICE_BY_API row) — inside the WIDENED supported set, so no
 * gate fires and the dispatch takes the OpenAI-style toolChoice spelling.
 */
const MISTRAL_CONV_MODEL = {
  id: "m-mst",
  api: "mistral-conversations",
  provider: "mistral",
  strictCapable: true,
};

// --- The driven thetas ----------------------------------------------------------

/** Cells (g1)/(g4-typed shape): typed query, frontmatter `model:` → m-gem. */
const TYPED_THETA_MODEL_GEM = [
  "---",
  "mode: prompt",
  "model: m-gem",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (g2): typed query, NO frontmatter `model:` — `ctx.model` is the respond model. */
const TYPED_THETA_NO_MODEL = [
  "---",
  "mode: prompt",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (g3): typed query, frontmatter `model:` → the mistral-conversations model. */
const TYPED_THETA_MODEL_MST = [
  "---",
  "mode: prompt",
  "model: m-mst",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Cell (g4): an UNTYPED query on the unsupported-model theta — no gate. */
const UNTYPED_THETA_MODEL_GEM = [
  "---",
  "mode: prompt",
  "model: m-gem",
  "---",
  "let v = @`Ping`?",
  "v",
  "",
].join("\n");

// --- The lowered `Verdict` schema / slug --------------------------------------

interface RespondFixture {
  readonly lowered: LoweredSchema;
  readonly slug: string;
  readonly toolName: string;
}

let cachedRespondFixture: RespondFixture | undefined;

/**
 * The lowered `Verdict` schema / slug / respond-tool name, computed through
 * the production collaborators (the AB-suite recipe), so the fallback tool
 * name stays byte-exact against the contract.
 */
function respondFixture(): RespondFixture {
  if (cachedRespondFixture !== undefined) {
    return cachedRespondFixture;
  }
  const doc = parse(TYPED_THETA_NO_MODEL);
  const decls = doc.body.statements.filter(
    (stmt): stmt is SchemaDecl => stmt.kind === "schema",
  );
  const lowered = lowerQueryResponseSchema("Verdict", decls);
  if (lowered === undefined) {
    throw new Error("fixture defect: the Verdict schema annotation must lower");
  }
  const slug = createHash("sha256")
    .update(JSON.stringify(lowered))
    .digest("hex")
    .slice(0, 16);
  cachedRespondFixture = { lowered, slug, toolName: `__theta_respond_${slug}` };
  return cachedRespondFixture;
}

// --- Scripted `complete()` assistant replies ------------------------------------

/** An `AssistantMessage`-shaped reply for the mocked `complete()`. */
function assistantReply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  }>;
}): Record<string, unknown> {
  const content: Record<string, unknown>[] = [];
  if (fields.text !== undefined) {
    content.push({ type: "text", text: fields.text });
  }
  for (const call of fields.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }
  return {
    role: "assistant",
    content,
    api: "anthropic-messages",
    stopReason: fields.stopReason,
    ...(fields.errorMessage !== undefined ? { errorMessage: fields.errorMessage } : {}),
    timestamp: 0,
  };
}

// --- The in-memory live user session --------------------------------------------

/** The scripted trailing assistant message one driven turn commits. */
interface ScriptedAssistantReply {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
}

/** A `SessionManager` message entry (the `buildSessionContext` read shape). */
interface SessionEntryDouble {
  readonly type: "message";
  readonly id: string;
  readonly parentId: string | undefined;
  readonly message: Record<string, unknown>;
}

/**
 * The live user-session double (duplicated from
 * tests/typed-two-phase-live.test.ts): `sendUserMessage` commits the `user`
 * entry and marks the session streaming; `tick()` (from the injected `Clock`'s
 * `setTimeout`) completes the in-flight streamed turn with the scripted
 * trailing `assistant` entry; the reply queue is STICKY-LAST so over-driving
 * stays observable as the `sendUserMessageCalls` COUNT pin.
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof of ON-SESSION traffic (the gate must leave this at ZERO). */
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];

  #idle = true;
  #completedTurns = 0;
  readonly #replies: readonly ScriptedAssistantReply[];

  constructor(replies: readonly ScriptedAssistantReply[]) {
    this.#replies = [...replies];
  }

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({
      role: "user",
      content: [{ type: "text", text: content }],
      timestamp: 0,
    });
    this.#idle = false;
  }

  isIdle(): boolean {
    return this.#idle;
  }

  /** Complete the in-flight streamed turn (inert while idle). */
  tick(): void {
    if (this.#idle) {
      return;
    }
    if (this.#replies.length === 0) {
      // No silent skipping: a cell that scripts NO session replies pins a
      // drive that must issue NO session turn at all.
      throw new Error(
        "live session double: a driven turn completed with an EMPTY reply queue",
      );
    }
    const reply =
      this.#replies[Math.min(this.#completedTurns, this.#replies.length - 1)]!;
    this.#completedTurns += 1;
    this.#append({
      role: "assistant",
      content: reply.text !== undefined ? [{ type: "text", text: reply.text }] : [],
      api: "anthropic-messages",
      provider: "anthropic",
      model: "m1",
      stopReason: reply.stopReason,
      ...(reply.errorMessage !== undefined ? { errorMessage: reply.errorMessage } : {}),
      timestamp: 0,
    });
    this.#idle = true;
  }

  #append(message: Record<string, unknown>): void {
    const id = `e${this.entries.length + 1}`;
    const parentId = this.entries.length === 0 ? undefined : `e${this.entries.length}`;
    this.entries.push({ type: "message", id, parentId, message });
  }
}

// --- The recording `pi` double ---------------------------------------------------

/** The `ExtensionAPI` surface the drive touches (the AB recording double). */
class RecordingPi {
  readonly registeredTools: ToolDefinition[] = [];
  readonly setActiveToolsCalls: string[][] = [];
  getActiveToolsCalls = 0;
  readonly api: ExtensionAPI;

  constructor(session: LiveSessionDouble) {
    const record = this;
    this.api = {
      sendUserMessage: (content: string): void => session.sendUserMessage(content),
      getActiveTools: (): string[] => {
        record.getActiveToolsCalls += 1;
        return ["ambient-a"];
      },
      setActiveTools: (names: string[]): void => {
        record.setActiveToolsCalls.push([...names]);
      },
      registerTool: (tool: ToolDefinition): void => {
        record.registeredTools.push(tool);
      },
      on: (): void => {},
      sendMessage: (): void => {},
    } as unknown as ExtensionAPI;
  }
}

// --- Harness ---------------------------------------------------------------------

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
function parse(src: string): ThetaDocument {
  const source: ThetaSource = {
    path: "probe.theta",
    bytes: new TextEncoder().encode(src),
  };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is used").toEqual([]);
  return doc;
}

/** The production AJV validator (real schema validation, as the sibling suites). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/** A runtime-root double whose `Clock.setTimeout` ticks the session double. */
function rootDouble(session: LiveSessionDouble): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: {
      now: (): number => 0,
      wallNow: (): number => 0,
      setTimeout: (fn: () => void): unknown => {
        session.tick();
        fn();
        return 0;
      },
      clearTimeout: (): void => {},
    },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/** Bug 0010 harness accommodation: getAvailable + getApiKeyAndHeaders double. */
function registryDouble(available: readonly unknown[]): ModelRegistry {
  return {
    getAvailable: () => [...available],
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "k-test" }),
  } as unknown as ModelRegistry;
}

/** The dispatch ctx: the user-session model + the committed-transcript surface. */
function ctxDouble(session: LiveSessionDouble, model: unknown): ExtensionCommandContext {
  return {
    model,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** One assembled drive: the session/pi doubles plus the producer deps. */
interface GateHarness {
  readonly session: LiveSessionDouble;
  readonly pi: RecordingPi;
  readonly deps: ReturnType<typeof createProductionProducerDeps>;
  readonly theta: ThetaCompositionInput;
  readonly ctx: ExtensionCommandContext;
}

function makeHarness(opts: {
  readonly source: string;
  readonly model?: unknown;
  readonly availableModels?: readonly unknown[];
  readonly sessionReplies: readonly ScriptedAssistantReply[];
}): GateHarness {
  const doc = parse(opts.source);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new LiveSessionDouble(opts.sessionReplies);
  const pi = new RecordingPi(session);
  const deps = createProductionProducerDeps({
    pi: pi.api,
    root: rootDouble(session),
    modelRegistry: registryDouble(opts.availableModels ?? [ANTHROPIC_MODEL]),
  });
  return {
    session,
    pi,
    deps,
    theta,
    ctx: ctxDouble(session, opts.model === undefined ? ANTHROPIC_MODEL : opts.model),
  };
}

/** Drive the harness theta once through the PRODUCTION prompt-mode binding. */
async function drive(harness: GateHarness): Promise<BodyExecution> {
  const binding = harness.deps.bindPromptConversation({
    theta: harness.theta,
    args: "",
    ctx: harness.ctx,
  });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  return executeBody(harness.theta.body, binding.executeDeps);
}

/** The respond tool name the drive minted (registerTool capture, recipe fallback). */
function respondToolNameOf(harness: GateHarness): string {
  return harness.pi.registeredTools[0]?.name ?? respondFixture().toolName;
}

/** Dig the leaf `QueryError` of the given kind out of a `?`-unwound failed drive. */
function expectErrOfKind(execution: BodyExecution, kind: string): Record<string, unknown> {
  expect(
    execution.outcome,
    `the \`?\`-unwound Err must FAIL the body (ERR-18); observed outcome '${execution.outcome}' ` +
      `(final value: ${JSON.stringify(execution.result.value)})`,
  ).toBe("fail");
  const error = execution.error;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as unknown as Record<string, unknown>;
  expect(
    leaf.kind,
    `the leaf QueryError classifies as ${kind}; observed: ${JSON.stringify(leaf)}`,
  ).toBe(kind);
  return leaf;
}

/** Assert a successful drive resolving the typed value. */
function expectValue(execution: BodyExecution, expected: unknown, why: string): void {
  expect(
    execution.outcome,
    `${why}; observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  expect(execution.result.value, why).toEqual(expected);
}

/** The pinned runtime gate message for one api (conversation-drive.md, verbatim). */
function gateMessage(api: string): string {
  return `${api} does not support forced tool-use; typed queries unavailable`;
}

/** Shared assertions for one runtime-gate refusal cell. */
function expectGateRefusal(
  harness: GateHarness,
  execution: BodyExecution,
  api: string,
): void {
  // THE GATE PIN (red pre-fix): the refusal precedes ALL provider traffic —
  // the free phase never sends and the respond turn never dispatches.
  expect(
    harness.session.sendUserMessageCalls,
    "ZERO sendUserMessage calls — the gate refuses BEFORE the free-phase turn " +
      "(conversation-drive.md §Provider compatibility; bug 0010 increment C)",
  ).toBe(0);
  expect(
    scripted.calls.length,
    "ZERO complete() calls — the gate refuses BEFORE the forced respond dispatch",
  ).toBe(0);
  const err = expectErrOfKind(execution, "transport");
  expect(
    err.message,
    "the gate Err carries the pinned message, api-shaped (conversation-drive.md: " +
      '"<provider> does not support forced tool-use; typed queries unavailable")',
  ).toBe(gateMessage(api));
  expect(
    err.provider,
    "the gate Err's provider is the resolved respond model's api-shaped `.api`",
  ).toBe(api);
  expect(err.http_status, "a capability gap carries no HTTP status").toBeNull();
  expect(err.retryable, "a capability gap is not retryable").toBe(false);
}

beforeEach(() => {
  scripted.queue = [];
  scripted.calls = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// RUNTIME gate cells. (g1)/(g2) are regression pins — pre-fix no production
// caller consulted the gate, so the typed query dispatched on any provider.
// (g3)/(g4) are CONTROLS — the supported-spelling dispatch and the untyped
// path did not move when the gate landed.
// ===========================================================================

describe("bug 0010 increment C (regression pins) — runtime typed-query provider gate refuses BEFORE any provider traffic (conversation-drive.md §Provider compatibility)", () => {
  it("(g1) frontmatter `model: m-gem` (google-generative-ai): Err(transport) with the pinned message/provider, ZERO sendUserMessage, ZERO complete()", async () => {
    const harness = makeHarness({
      source: TYPED_THETA_MODEL_GEM,
      availableModels: [ANTHROPIC_MODEL, GOOGLE_MODEL],
      // Scripted defensively: the gate contract drives NO session turn (the
      // pre-fix ungated runtime drove one) — sticky-last keeps a regression
      // observable as the count pin.
      sessionReplies: [{ stopReason: "stop", text: "gate must fire first" }],
    });
    // Scripted defensively (sticky-last): a regressed ungated runtime would
    // dispatch the forced respond turn against m-gem and RESOLVE — the count
    // pin and the Err pin both red on that.
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expectGateRefusal(harness, execution, "google-generative-ai");
  });

  it("(g2) no frontmatter `model:`, ctx.model api google-generative-ai: the ctx-model fallback is gated identically — same Err, ZERO/ZERO counts", async () => {
    const harness = makeHarness({
      source: TYPED_THETA_NO_MODEL,
      // The respond model falls back to the invocation-pinned session model
      // (`ctx.model`) when frontmatter omits `model:` — the gate reads THAT
      // resolved model's api.
      model: GOOGLE_MODEL,
      availableModels: [ANTHROPIC_MODEL, GOOGLE_MODEL],
      sessionReplies: [{ stopReason: "stop", text: "gate must fire first" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expectGateRefusal(harness, execution, "google-generative-ai");
  });
});

describe("bug 0010 increment C (controls) — supported spellings and untyped queries are NOT gated", () => {
  it("(g3) frontmatter `model:` resolving to api mistral-conversations: NO gate — one complete() with the OpenAI-style forced toolChoice, and the query resolves", async () => {
    // Green across the fix: pre-fix no gate existed; post-fix the supported
    // set carries the pin-observed KnownApi spellings — mistral-conversations
    // is a member, so the gate must NOT refuse it.
    const harness = makeHarness({
      source: TYPED_THETA_MODEL_MST,
      availableModels: [ANTHROPIC_MODEL, MISTRAL_CONV_MODEL],
      sessionReplies: [{ stopReason: "stop", text: "free reply" }],
    });
    scripted.queue = [
      () =>
        assistantReply({
          stopReason: "toolUse",
          toolCalls: [
            { id: "tc1", name: respondToolNameOf(harness), arguments: { score: 7 } },
          ],
        }),
    ];

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "one on-session free-phase turn — mistral-conversations is NOT gated",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "exactly ONE complete() — the forced respond turn dispatches on the supported spelling",
    ).toBe(1);
    const call = scripted.calls[0]!;
    expect(
      (call.model as { readonly id?: unknown }).id,
      "the respond complete() dispatches against the theta-resolved m-mst model",
    ).toBe("m-mst");
    // The AB per-api spelling map already handles mistral-conversations: the
    // provider-native OpenAI-style spelling (bug 0010 fix round 1,
    // FORCED_TOOL_CHOICE_BY_API) — the gate widening must keep this reachable.
    expect(
      (call.options as Record<string, unknown>)["toolChoice"],
      "a mistral-conversations respond model takes the OpenAI-style forced-tool spelling",
    ).toEqual({ type: "function", function: { name: respondToolNameOf(harness) } });
    expectValue(
      execution,
      { score: 7 },
      "the typed query resolves through the mistral-conversations respond turn",
    );
  });

  it("(g4) an UNTYPED query on the unsupported-model theta drives normally — no gate, one streamed turn, zero complete()", async () => {
    // conversation-drive.md §Provider compatibility: "Untyped queries against
    // the same theta continue to work." Green across the fix.
    const harness = makeHarness({
      source: UNTYPED_THETA_MODEL_GEM,
      availableModels: [ANTHROPIC_MODEL, GOOGLE_MODEL],
      sessionReplies: [{ stopReason: "stop", text: "hello" }],
    });
    scripted.queue = []; // any complete() dispatch would throw loudly

    const execution = await drive(harness);

    expect(
      harness.session.sendUserMessageCalls,
      "the untyped query drives its one streamed turn — the gate never applies to untyped",
    ).toBe(1);
    expect(
      scripted.calls.length,
      "an untyped query never dispatches complete() (PIC-53 extraction path)",
    ).toBe(0);
    expectValue(
      execution,
      "hello",
      "the untyped query resolves its trailing-turn text on the unsupported-model theta",
    );
  });
});

// ===========================================================================
// LOAD-TIME cells.
//
// The emitter (`checkTypedQueryProviderSupport`) predated increment C — those
// cells are CONTROLS pinning the code/message/severity shape the wiring
// emits. The SUPPORTED-SET WIDENING and the two wiring seams
// (`detectTypedQueryExpression`, `checkThetaTypedQueryProviderSupport`) are
// increment-C regression pins — see the header for the seam-choice record.
// ===========================================================================

describe("bug 0010 increment C (controls) — checkTypedQueryProviderSupport emitter shape (predates the increment)", () => {
  it("unsupported api + typed query → the warning diagnostic with the registry code and template message; the theta still loads (warning severity)", () => {
    const diagnostic = checkTypedQueryProviderSupport({
      file: "probe.theta",
      hasTypedQuery: true,
      api: "google-generative-ai",
      modelReference: "m-gem",
    });
    expect(diagnostic, "an unsupported api with a typed query yields the warning").not.toBeNull();
    expect(diagnostic?.severity, "the gate diagnostic is a WARNING — the theta still loads").toBe(
      "warning",
    );
    expect(diagnostic?.code).toBe(TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE);
    expect(diagnostic?.code).toBe("theta/load/typed-query-unsupported-provider");
    expect(
      diagnostic?.message,
      "the message comes from typedQueryUnsupportedProviderMessage(api, modelReference)",
    ).toBe(typedQueryUnsupportedProviderMessage("google-generative-ai", "m-gem"));
    expect(diagnostic?.file).toBe("probe.theta");
  });

  it("supported spec-four api (anthropic-messages) → null; no typed query → null", () => {
    expect(
      checkTypedQueryProviderSupport({
        file: "probe.theta",
        hasTypedQuery: true,
        api: "anthropic-messages",
        modelReference: "m1",
      }),
      "a supported api emits no warning",
    ).toBeNull();
    expect(
      checkTypedQueryProviderSupport({
        file: "probe.theta",
        hasTypedQuery: false,
        api: "google-generative-ai",
        modelReference: "m-gem",
      }),
      "an untyped-only theta emits no warning even on an unsupported api",
    ).toBeNull();
  });
});

describe("bug 0010 increment C (regression pins) — the supported set carries the pin-observed KnownApi spellings (conversation-drive.md §typed-query supported provider set seam)", () => {
  it("TYPED_QUERY_SUPPORTED_PROVIDER_APIS carries the four documented provider names PLUS mistral-conversations and bedrock-converse-stream", () => {
    // The seam note pins ONE named constant as the single source of truth for
    // every consumer (load emitter + runtime guard), so the set is pinned on
    // the constant itself. conversation-drive.md §Provider compatibility now
    // names exactly these six `api`-shaped members (the bug-0010 spec
    // clarification): the two KnownApi spellings are the pin-observed values
    // the FORCED_TOOL_CHOICE_BY_API rows map a working named-tool toolChoice
    // for — a gate refusing them would refuse providers the dispatch
    // demonstrably supports (cell (g3)).
    expect(
      [...TYPED_QUERY_SUPPORTED_PROVIDER_APIS],
      "the supported set = the six api-shaped members conversation-drive.md " +
        "§Provider compatibility pins (bug 0010 increment C)",
    ).toEqual(
      expect.arrayContaining([
        "anthropic-messages",
        "openai-completions",
        "mistral",
        "amazon-bedrock",
        "mistral-conversations",
        "bedrock-converse-stream",
      ]),
    );
  });

  it("checkTypedQueryProviderSupport(api: mistral-conversations) → null (the widened member is not warned on)", () => {
    expect(
      checkTypedQueryProviderSupport({
        file: "probe.theta",
        hasTypedQuery: true,
        api: "mistral-conversations",
        modelReference: "m-mst",
      }),
      "mistral-conversations is inside the six-member supported set — no load " +
        "warning (pre-fix the four-element constant warned on it)",
    ).toBeNull();
  });
});

// --- The walker seam: detectTypedQueryExpression(body) --------------------------

/** The absent-export red message for the walker seam. */
const WALKER_EXPORT_PIN =
  "bug 0010 increment C: src/parser/theta-document.ts must export " +
  "`detectTypedQueryExpression(body: ThetaBody): boolean` — the load-time " +
  "typed-query detection walk over the parsed body (top-level statements/tail, " +
  "let initializers, fn / subagent fn bodies, match arms, nested control flow)";

/** The narrowed callable, guarded behind the typeof pin in each cell. */
function detectTypedQueryExpression(body: ThetaBody): boolean {
  return (
    thetaDocumentModule as unknown as {
      detectTypedQueryExpression: (body: ThetaBody) => boolean;
    }
  ).detectTypedQueryExpression(body);
}

/** Walker fixture: the typed query is the top-level body TAIL expression. */
const W_TOP_LEVEL_TAIL = [
  "schema Verdict {",
  "  score: number",
  "}",
  "@<Verdict>`Ping`",
  "",
].join("\n");

/** Walker fixture: the typed query sits inside a `subagent fn` body. */
const W_SUBAGENT_FN_BODY = [
  "schema Verdict {",
  "  score: number",
  "}",
  "subagent fn probe(): Verdict {",
  "  @<Verdict>`Ping`?",
  "}",
  '"done"',
  "",
].join("\n");

/**
 * Walker fixture: the typed query is a `let` INITIALIZER whose schema arrives
 * via the parser's `let x: T = @` annotation propagation (no explicit `@<T>`)
 * — a genuinely distinct AST path (LetStmt.init) AND the propagated-schema
 * form, proving the walk reads the post-propagation `QueryExpr.schema`.
 */
const W_LET_INITIALIZER = [
  "schema Verdict {",
  "  score: number",
  "}",
  "let v: Verdict = @`Ping`?",
  "v",
  "",
].join("\n");

/** Walker fixture: the typed query is nested inside an `if` block statement. */
const W_NESTED_IF_BLOCK = [
  "schema Verdict {",
  "  score: number",
  "}",
  "if true {",
  "  let v: Verdict = @`Ping`?",
  "}",
  '"done"',
  "",
].join("\n");

/**
 * Walker fixture: untyped queries ONLY (statement + let-init positions). The
 * statement-position query carries `?` because a BARE `@`…`` expression
 * statement is the QRY-19 `theta/parse/discarded-query-result` parse ERROR
 * (the fixture must parse cleanly); the `?`-propagate form keeps the query in
 * statement position — as a try-wrapped expression statement, a genuinely
 * distinct walk path from the let-initializer — without tripping QRY-19
 * (bug 0010 increment C fixture repair).
 */
const W_UNTYPED_ONLY = [
  "let a = @`One`?",
  "@`Two`?",
  "a",
  "",
].join("\n");

describe("bug 0010 increment C (regression pins) — detectTypedQueryExpression walks the parsed body (load-time hasTypedQuery)", () => {
  it("a typed query at TOP LEVEL (the body tail expression) → true", () => {
    expect(
      typeof (thetaDocumentModule as Record<string, unknown>)["detectTypedQueryExpression"],
      WALKER_EXPORT_PIN,
    ).toBe("function");
    expect(
      detectTypedQueryExpression(parse(W_TOP_LEVEL_TAIL).body),
      "an explicit @<Verdict> tail expression is a typed-query expression",
    ).toBe(true);
  });

  it("a typed query inside a `subagent fn` body → true (counts as 'contains')", () => {
    expect(
      typeof (thetaDocumentModule as Record<string, unknown>)["detectTypedQueryExpression"],
      WALKER_EXPORT_PIN,
    ).toBe("function");
    expect(
      detectTypedQueryExpression(parse(W_SUBAGENT_FN_BODY).body),
      "a typed query nested in a subagent fn body counts — the fn's queries run " +
        "typed dispatches at call time (fix brief §PROVIDER GATE)",
    ).toBe(true);
  });

  it("a typed query as a `let` initializer (schema via annotation propagation) → true", () => {
    expect(
      typeof (thetaDocumentModule as Record<string, unknown>)["detectTypedQueryExpression"],
      WALKER_EXPORT_PIN,
    ).toBe("function");
    expect(
      detectTypedQueryExpression(parse(W_LET_INITIALIZER).body),
      "the parser propagates `let v: Verdict = @` onto QueryExpr.schema — the walk " +
        "must observe the post-propagation schema, not only explicit @<T> forms",
    ).toBe(true);
  });

  it("a typed query nested inside an `if` block → true (the walk descends control flow)", () => {
    expect(
      typeof (thetaDocumentModule as Record<string, unknown>)["detectTypedQueryExpression"],
      WALKER_EXPORT_PIN,
    ).toBe("function");
    expect(
      detectTypedQueryExpression(parse(W_NESTED_IF_BLOCK).body),
      "the walk descends nested control-flow blocks",
    ).toBe(true);
  });

  it("an untyped-only body → false", () => {
    expect(
      typeof (thetaDocumentModule as Record<string, unknown>)["detectTypedQueryExpression"],
      WALKER_EXPORT_PIN,
    ).toBe("function");
    expect(
      detectTypedQueryExpression(parse(W_UNTYPED_ONLY).body),
      "untyped queries (statement and let-init positions) do not trip the gate",
    ).toBe(false);
  });
});

// --- The wiring seam: checkThetaTypedQueryProviderSupport -----------------------

/** The absent-export red message for the composition-wiring seam. */
const WIRING_EXPORT_PIN =
  "bug 0010 increment C: src/extension/production-composition.ts must export " +
  "`checkThetaTypedQueryProviderSupport({ file, body, modelReference, resolveModel })" +
  ": Diagnostic | null` — the load-pass wiring that walks the body for typed " +
  "queries, resolves the frontmatter `model:` through the injected resolver " +
  "(matchAvailableModel-bound in production), and returns the " +
  "theta/load/typed-query-unsupported-provider warning or null";

/** The wiring seam's pinned input shape. */
interface WiringInput {
  readonly file: string;
  readonly body: ThetaBody;
  readonly modelReference: string | undefined;
  readonly resolveModel: (reference: string) => { readonly api: string } | undefined;
}

/** The narrowed callable, guarded behind the typeof pin in each cell. */
function checkThetaTypedQueryProviderSupport(input: WiringInput): Diagnostic | null {
  return (
    productionComposition as unknown as {
      checkThetaTypedQueryProviderSupport: (input: WiringInput) => Diagnostic | null;
    }
  ).checkThetaTypedQueryProviderSupport(input);
}

/** The wiring cells' model resolver: the registry the load pass would consult. */
function resolveFixtureModel(reference: string): { readonly api: string } | undefined {
  if (reference === "m-gem") {
    return { api: "google-generative-ai" };
  }
  if (reference === "m1") {
    return { api: "anthropic-messages" };
  }
  return undefined;
}

describe("bug 0010 increment C (regression pins) — checkThetaTypedQueryProviderSupport load-pass wiring (helper seam; see header for the integration-tractability record)", () => {
  it("typed body + model: resolving to an unsupported api → the warning diagnostic (code/message/severity/file)", () => {
    expect(
      typeof (productionComposition as Record<string, unknown>)[
        "checkThetaTypedQueryProviderSupport"
      ],
      WIRING_EXPORT_PIN,
    ).toBe("function");
    const doc = parse(TYPED_THETA_MODEL_GEM);
    const diagnostic = checkThetaTypedQueryProviderSupport({
      file: "probe.theta",
      body: doc.body,
      modelReference: doc.frontmatter?.model,
      resolveModel: resolveFixtureModel,
    });
    expect(
      diagnostic,
      "a typed theta whose model: load-resolves to an unsupported api warns",
    ).not.toBeNull();
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.code).toBe(TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE);
    expect(diagnostic?.message).toBe(
      typedQueryUnsupportedProviderMessage("google-generative-ai", "m-gem"),
    );
    expect(diagnostic?.file).toBe("probe.theta");
  });

  it("typed body + NO frontmatter model: → null (the load gate reads only a present model:)", () => {
    expect(
      typeof (productionComposition as Record<string, unknown>)[
        "checkThetaTypedQueryProviderSupport"
      ],
      WIRING_EXPORT_PIN,
    ).toBe("function");
    const doc = parse(TYPED_THETA_NO_MODEL);
    expect(doc.frontmatter?.model, "fixture control: the theta declares no model:").toBeUndefined();
    expect(
      checkThetaTypedQueryProviderSupport({
        file: "probe.theta",
        body: doc.body,
        modelReference: doc.frontmatter?.model,
        resolveModel: resolveFixtureModel,
      }),
      "no model: → no load warning (the session model is unknown at load; the " +
        "runtime gate still covers the ctx.model fallback — cell (g2))",
    ).toBeNull();
  });

  it("UNTYPED body + model: resolving to an unsupported api → null", () => {
    expect(
      typeof (productionComposition as Record<string, unknown>)[
        "checkThetaTypedQueryProviderSupport"
      ],
      WIRING_EXPORT_PIN,
    ).toBe("function");
    const doc = parse(UNTYPED_THETA_MODEL_GEM);
    expect(
      checkThetaTypedQueryProviderSupport({
        file: "probe.theta",
        body: doc.body,
        modelReference: doc.frontmatter?.model,
        resolveModel: resolveFixtureModel,
      }),
      "an untyped-only theta emits no warning even on an unsupported model:",
    ).toBeNull();
  });

  it("typed body + model: resolving to a SUPPORTED api → null", () => {
    expect(
      typeof (productionComposition as Record<string, unknown>)[
        "checkThetaTypedQueryProviderSupport"
      ],
      WIRING_EXPORT_PIN,
    ).toBe("function");
    const doc = parse(TYPED_THETA_NO_MODEL);
    expect(
      checkThetaTypedQueryProviderSupport({
        file: "probe.theta",
        body: doc.body,
        modelReference: "m1",
        resolveModel: resolveFixtureModel,
      }),
      "a supported api emits no warning",
    ).toBeNull();
  });

  it("typed body + model: that resolves to NO available model → null (unresolvable references are the binder-model machinery's concern)", () => {
    expect(
      typeof (productionComposition as Record<string, unknown>)[
        "checkThetaTypedQueryProviderSupport"
      ],
      WIRING_EXPORT_PIN,
    ).toBe("function");
    const doc = parse(TYPED_THETA_NO_MODEL);
    expect(
      checkThetaTypedQueryProviderSupport({
        file: "probe.theta",
        body: doc.body,
        modelReference: "m-ghost",
        resolveModel: resolveFixtureModel,
      }),
      "an unresolvable model: reference cannot be classified against the set — " +
        "no warning (the fix brief gates on 'load-resolves to a model whose .api " +
        "is outside the set')",
    ).toBeNull();
  });
});
