// Bug 0009 — prompt-mode `TransportError.provider` field derivation (RED suite).
//
// docs/bugs/0009-live-prompt-queryerror-provider-field-derivation.md: the live
// prompt-mode query seam constructs `LivePromptQueryModel` with
// `provider: String(deps.ctx.model?.provider ?? "unknown")`
// (src/extension/production-theta-producer.ts `#resolvePromptQuery`) — pi-ai's
// SHORT `ProviderId` form ("anthropic"). Every normative statement of the
// derivation pins the api-shaped `Model<Api>.api` value instead:
//
//   - errors-and-results/queryerror-variants.md §provider derivation: the
//     field is "an `api`-shaped `Model<Api>.api` value … NOT a short
//     provider-id form such as `"openai"`"; for this path specifically,
//     "prompt-mode driven-turn failures take the user session's
//     selected-model `.api` (`ctx.model`), substituting the fixed sentinel
//     `"unknown"` when `ctx.model` is `undefined`".
//   - pi-integration-contract/conversation-drive.md PIC-50: "the `Api`-shaped
//     `Model<Api>.api` value of the user session's currently-selected model —
//     read from `ctx.model`"; PIC-51/PIC-51b pin the same derivation for the
//     `stopReason: "error"` probe's `Err` shape.
//
// The wrong value flows into `LivePromptQueryModel.#provider` and out through
// all three prompt-mode `TransportError` feed reads: the PIC-51
// `extractPromptModeQueryResult` probe on a driven turn's trailing
// `assistant` `stopReason: "error"` message — both the untyped free-phase
// turn and the typed forced-respond turn read the same once-assigned
// `#provider` — and the PIC-50 `mapPromptModeSyncThrow` mapping of a
// synchronous `pi.sendUserMessage` throw. This suite pins the CONSTRUCTION
// SITE through the real producer (never a hand-built `LivePromptQueryModel`
// with a self-computed provider — that would test nothing): red today, green
// after the one-line `.api` fix.
//
// Method: the tests/off-session-transport-classification.test.ts harness shape
// (drive the production producer `createProductionProducerDeps` →
// `bindPromptConversation` → `executeBody`), but over the LIVE user-visible
// seam: a prompt-mode theta whose TOP-LEVEL `@`-query drives
// `LivePromptQueryModel` (`userVisible: true`) against an in-memory session
// double — `pi.sendUserMessage` opens a scripted streamed turn, the injected
// `Clock`'s `setTimeout` (the driver's only wait primitive while the turn is
// in flight) completes it, and `ctx.sessionManager.getEntries()` serves the
// committed transcript the PIC-51 probe reads. Deterministic; no live
// network, no pi-ai mocking (the live seam never calls `complete()`).
//
// Spec: errors-and-results/queryerror-variants.md (§TransportError schema,
// §provider derivation), pi-integration-contract/conversation-drive.md
// (PIC-50 provider derivation + sync-throw mapping, PIC-51 error-stop probe,
// PIC-53 trailing-turn extraction), query/query-forms.md (QRY-1).

import { describe, expect, it } from "vitest";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
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
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type ThetaDocument,
} from "../src/parser/theta-document";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";

// --- The user session's selected model ---------------------------------------
// DISTINCT `.api` and `.provider` strings so the TransportError.provider
// assertion (`provider` is the user session's selected-model API-shaped `.api`
// value per queryerror-variants.md §provider derivation / PIC-50) catches a
// wrong `.provider` read — the bug-0007 fixture discipline
// (tests/off-session-transport-classification.test.ts). A registry entry whose
// short provider id doubles as an `Api` value (e.g. `google-vertex`) would
// VALUE-MASK the wrong field read; a typical entry (`anthropic` /
// `anthropic-messages`) exposes it.

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

// --- The scripted provider failure texts ------------------------------------

/** The live-observed auth failure text a dead-provider error-stop carries. */
const AUTH_ERROR_MESSAGE =
  "No auth available for anthropic. Set ANTHROPIC_OAUTH_TOKEN or ANTHROPIC_API_KEY.";

/** The synchronous `pi.sendUserMessage` throw the PIC-50 mapping coerces. */
const SEND_THROW_MESSAGE = "socket hang up dispatching the user turn";

// --- The driven thetas ---------------------------------------------------------
// Prompt-mode thetas whose TOP-LEVEL `@`-query is the live user-visible turn
// (`userVisible: true` → `LivePromptQueryModel`; contrast bug 0007's
// `subagent fn` body queries, which route off-session). The `?` unwinds a
// transport `Err` out of the body (ERR-18), so the drive's observable is a
// `fail` outcome whose `execution.error` IS the leaf `TransportError`.

const UNTYPED_LIVE_THETA = [
  "---",
  "mode: prompt",
  "---",
  "let v = @`Ping`?",
  "v",
  "",
].join("\n");

// The typed twin: a schema-typed query dispatches ONLY the forced-respond
// terminator (`maxRounds: typed ? 0` — no free-phase turn), so the FIRST
// driven turn IS the forced-respond turn: the PIC-51 probe's second feed read.
const TYPED_LIVE_THETA = [
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

// --- The in-memory live user session -----------------------------------------

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
 * The live user-session double `LivePromptQueryModel` drives:
 *
 *  - `sendUserMessage` commits the `user` entry and marks the session
 *    streaming (`isIdle()` → false) — or throws synchronously when the cell
 *    scripts the PIC-50 sync-throw path;
 *  - `tick()` (invoked from the injected `Clock`'s `setTimeout`, the driver's
 *    only wait primitive while a turn is in flight) completes the streamed
 *    turn: it commits the scripted trailing `assistant` entry and returns the
 *    session to idle, so the driver's `isIdle()` poll observes the settled
 *    turn on its next probe;
 *  - `entries` (id/parentId-chained, so `buildSessionContext`'s leaf walk
 *    yields the full chronological transcript) back
 *    `ctx.sessionManager.getEntries()` — the PIC-51/PIC-53 read surface.
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof the LIVE seam drove the turn (off-session never calls `pi.sendUserMessage`). */
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];

  #idle = true;
  readonly #queue: ScriptedAssistantReply[];
  readonly #throwOnSend: Error | undefined;

  constructor(script: {
    readonly replies?: readonly ScriptedAssistantReply[];
    /** Scripts the PIC-50 path: `sendUserMessage` throws this synchronously. */
    readonly throwOnSend?: Error;
  }) {
    this.#queue = [...(script.replies ?? [])];
    this.#throwOnSend = script.throwOnSend;
  }

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    if (this.#throwOnSend !== undefined) {
      throw this.#throwOnSend;
    }
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

  /** Complete the in-flight streamed turn (inert while idle — a stray poll settles nothing). */
  tick(): void {
    if (this.#idle) {
      return;
    }
    const reply = this.#queue.shift();
    if (reply === undefined) {
      // No silent skipping: a drive that opens more turns than the cell
      // scripted fails loudly instead of hanging the poll loop.
      throw new Error("live session double: a driven turn completed with an EMPTY reply queue");
    }
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

// --- Harness ------------------------------------------------------------------

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
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
  expect(doc.frontmatter, "the fixture theta must carry parseable frontmatter").not.toBeNull();
  return doc;
}

/** The production AJV validator (the typed cell's schema machinery; matches the sibling harness). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * A runtime-root double for the LIVE prompt-mode drive: a noop checkpoint,
 * deterministic ids, and a `Clock` whose `setTimeout` first `tick()`s the
 * session double (completing any in-flight streamed turn) and then fires the
 * callback synchronously. `LivePromptQueryModel` awaits `clock.setTimeout`
 * between its `isIdle()` probes while the driven turn streams, so this hook is
 * exactly the point "the turn settles" becomes observable — deterministic, no
 * real timers, and the turn-lifecycle polling still runs the production code.
 */
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

/**
 * The `ExtensionAPI` surface the live drive touches: `sendUserMessage` (the
 * driven turn), the PIC-17 active-set save/restore pair, the governor's
 * one-time `pi.on` hook registration (inert — no fabricated tool rounds), and
 * the diagnostics `sendMessage` channel.
 */
function piDouble(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
}

/**
 * The dispatch ctx. `model` is the user session's selected model — the PIC-50
 * derivation source for the live seam (`ctx.model`, NOT the theta's resolved
 * `model:`) — or `undefined` for the sentinel control. `signal` is `undefined`
 * (idle slash-entry), `isIdle`/`waitForIdle` model the turn lifecycle, and
 * `sessionManager` serves the committed transcript.
 */
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

/**
 * Drive the fixture theta through the PRODUCTION prompt-mode binding
 * (`bindPromptConversation` → `executeBody`). The top-level `@`-query resolves
 * with `userVisible: true`, so the REAL `#resolvePromptQuery` constructs the
 * REAL `LivePromptQueryModel` — including the `provider:` expression under
 * test — and drives it against the session double.
 */
async function driveLiveTheta(
  model: unknown,
  script: {
    readonly replies?: readonly ScriptedAssistantReply[];
    readonly throwOnSend?: Error;
  },
  source: string = UNTYPED_LIVE_THETA,
): Promise<{ readonly execution: BodyExecution; readonly session: LiveSessionDouble }> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new LiveSessionDouble(script);
  const deps = createProductionProducerDeps({
    pi: piDouble(session),
    root: rootDouble(session),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session, model) });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, session };
}

/**
 * Dig the leaf `TransportError` out of a drive. The top-level `?` unwinds the
 * query's `Err` out of the body (ERR-18), so the observable is a `fail`
 * outcome whose `error` member IS the leaf `QueryError` — no `invoke_callee`
 * wrapper (contrast the bug-0007 `subagent fn` cells). Strict: fails loudly
 * (quoting the observed shape) when the drive terminated any other way.
 */
function expectTransportErr(execution: BodyExecution): Record<string, unknown> {
  expect(
    execution.outcome,
    "the `?`-unwound transport Err must FAIL the body (ERR-18); observed outcome " +
      `'${execution.outcome}' (final value: ${JSON.stringify(execution.result.value)})`,
  ).toBe("fail");
  const error = execution.error;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  const leaf = error as unknown as Record<string, unknown>;
  expect(
    leaf.kind,
    `the leaf QueryError classifies as transport; observed: ${JSON.stringify(leaf)}`,
  ).toBe("transport");
  return leaf;
}

// ===========================================================================
// RED cells — the spec-pinned `.api` derivation (fail today, green after the
// bug-0009 fix). Today the construction site reads `ctx.model?.provider`
// (the short "anthropic"), so each `provider` assertion observes the wrong
// vocabulary.
// ===========================================================================

describe("bug 0009 (RED) — prompt-mode TransportError.provider derives from ctx.model.api (PIC-50/51, queryerror-variants.md §provider derivation)", () => {
  it('(i) untyped probe (PIC-51): a driven turn ending `stopReason: "error"` yields Err(transport) whose provider is the user session model\'s api-shaped `.api` — never the short `.provider` id', async () => {
    const { execution, session } = await driveLiveTheta(ANTHROPIC_MODEL, {
      replies: [{ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }],
    });

    // The LIVE seam drove the turn: `pi.sendUserMessage` was called (the
    // off-session driver resolves through pi-ai `complete()` and never touches
    // the user session).
    expect(
      session.sendUserMessageCalls,
      "exactly one user-visible turn resolves the untyped query",
    ).toBe(1);
    const err = expectTransportErr(execution);
    // PIC-51 shape guards: the probe consumed OUR scripted error-stop turn.
    expect(err.message, "the provider's errorMessage is CARRIED into the Err").toBe(
      AUTH_ERROR_MESSAGE,
    );
    expect(err.http_status, "no HTTP status is observable at the prompt-mode seam").toBeNull();
    expect(err.retryable, "an error-stop is a definite outcome — retryable: false").toBe(false);
    // THE bug-0009 pin: queryerror-variants.md §provider derivation /
    // PIC-51 ("provider per PIC-50") — the api-shaped `ctx.model.api`
    // ("anthropic-messages"), NOT pi-ai's short `ProviderId` ("anthropic").
    // Red today: the construction site reads `.provider`.
    expect(
      err.provider,
      "TransportError.provider is the user session model's API-shaped `.api` value " +
        "(queryerror-variants.md §provider derivation; PIC-50/PIC-51), not its short `.provider` id",
    ).toBe("anthropic-messages");
  });

  it('(i-b) typed probe (PIC-51): a forced-respond turn ending `stopReason: "error"` yields Err(transport) whose provider is the user session model\'s `.api` — the probe\'s second feed read, pinned directly', async () => {
    const { execution, session } = await driveLiveTheta(
      ANTHROPIC_MODEL,
      { replies: [{ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }] },
      TYPED_LIVE_THETA,
    );

    // A typed prompt-mode query dispatches ONLY the forced-respond terminator
    // (`maxRounds: typed ? 0` — no free-phase turn), so the ONE driven turn IS
    // the forced-respond turn, and its transport failure terminates the typed
    // query immediately — no respond-repair re-drives (the bug-0007 cell (vi)
    // discipline, here on the live seam).
    expect(
      session.sendUserMessageCalls,
      "exactly one user-visible turn resolves the typed query — the forced-respond terminator",
    ).toBe(1);
    expect(
      session.sentQueryTexts[0],
      "the driven turn carries the typed-aware rendered query",
    ).toContain("Ping");
    const err = expectTransportErr(execution);
    expect(err.message, "the provider's errorMessage is CARRIED into the Err").toBe(
      AUTH_ERROR_MESSAGE,
    );
    // THE bug-0009 pin, second feed read: the PIC-51 probe on the typed
    // forced-respond turn reads the same once-assigned
    // `LivePromptQueryModel.#provider` as cell (i)'s untyped probe — pinned
    // here DIRECTLY rather than transitively.
    expect(
      err.provider,
      "TransportError.provider on the forced-respond turn is the user session model's " +
        "API-shaped `.api` value (PIC-50/PIC-51), not its short `.provider` id",
    ).toBe("anthropic-messages");
  });

  it("(ii) sync-throw (PIC-50): a synchronous pi.sendUserMessage throw yields Err(transport) whose provider is the user session model's `.api`", async () => {
    const { execution, session } = await driveLiveTheta(ANTHROPIC_MODEL, {
      throwOnSend: new Error(SEND_THROW_MESSAGE),
    });

    expect(
      session.sendUserMessageCalls,
      "the sync-throw fires on the one attempted user-visible turn",
    ).toBe(1);
    const err = expectTransportErr(execution);
    // PIC-50 shape guards: this is `mapPromptModeSyncThrow`'s Err (the coerced
    // throw message), not the PIC-51 probe's (no turn was committed at all).
    expect(
      err.message,
      "the sync-throw's message is derived through the underlying-error coercion rule",
    ).toBe(SEND_THROW_MESSAGE);
    expect(err.http_status, "no HTTP status is observable on a sync-throw").toBeNull();
    expect(err.retryable, "a sync-throw is a definite outcome — retryable: false").toBe(false);
    // THE bug-0009 pin, second synthesis code path: PIC-50's derivation sentence
    // names `.api` for the sync-throw mapping too — the same
    // `LivePromptQueryModel.#provider` feed as cell (i).
    expect(
      err.provider,
      "TransportError.provider is the user session model's API-shaped `.api` value " +
        "(PIC-50 sync-throw mapping), not its short `.provider` id",
    ).toBe("anthropic-messages");
  });
});

// ===========================================================================
// GREEN controls — pass today AND after the fix; they prove the drive
// exercises the real live seam (so the RED cells above are red for the
// derivation, not for a harness gap).
// ===========================================================================

describe("bug 0009 (GREEN controls) — the live prompt-mode drive and the PIC-50 sentinel", () => {
  it('(iii) sentinel: ctx.model undefined → provider is the fixed "unknown" (PIC-50) — the same construction expression\'s fallback arm, correct before and after the fix', async () => {
    // `String(ctx.model?.provider ?? "unknown")` and the fixed
    // `String(ctx.model?.api ?? "unknown")` agree when `ctx.model` is
    // undefined, so this cell is green on the unfixed runtime and MUST stay
    // green after: it pins the sentinel arm the fix must not disturb.
    const { execution } = await driveLiveTheta(undefined, {
      replies: [{ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }],
    });

    const err = expectTransportErr(execution);
    expect(
      err.provider,
      'PIC-50: when ctx.model is undefined (no user-session model selected) provider is the fixed sentinel "unknown"',
    ).toBe("unknown");
  });

  it("(iv) clean turn: a `stopReason: \"stop\"` reply flows through the live drive as the query's Ok text (PIC-53) — the harness genuinely reaches LivePromptQueryModel", async () => {
    const { execution, session } = await driveLiveTheta(ANTHROPIC_MODEL, {
      replies: [{ stopReason: "stop", text: "pong answer" }],
    });

    expect(execution.outcome, "a clean live turn succeeds").toBe("success");
    expect(
      execution.result.value,
      "the trailing-turn assistant text flows through the `?` and out as the final value — " +
        "this control proves the session double feeds the live prompt-mode driver",
    ).toBe("pong answer");
    expect(
      session.sendUserMessageCalls,
      "exactly one user-visible turn resolves the untyped query",
    ).toBe(1);
    expect(
      session.sentQueryTexts[0],
      "the driven turn carries the rendered query template",
    ).toContain("Ping");
  });
});
