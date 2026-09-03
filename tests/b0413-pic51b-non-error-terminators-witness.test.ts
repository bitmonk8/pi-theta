// Bug 0413 — PIC-51b is implemented nowhere on the prompt-mode probe. A driven
// turn ending on `stopReason: "length"`, `"aborted"`, `"content_filter"`, or
// any unrecognised terminator — and a settled turn with NO trailing `assistant`
// message at all — is extracted as a successful `Ok(string)` with zero
// diagnostics, where the spec pins `Err(context_overflow)` / `Err(transport)`.
//
// docs/bugs/0413-pic51b-non-error-terminators-extract-as-ok.md (the spec, as
// filed against the pre-fix tree at `c2c25d81`; line citations below are
// re-derived against the fixed tree, not the bug doc's originally-cited ones).
// Before the fix, `extractPromptModeQueryResult` (now
// src/runtime/prompt-transport-mapping.ts:182) applied only PIC-51's
// cancellation short-circuit and the `trailing.stopReason === "error"` arm (now
// prompt-transport-mapping.ts:203); every other terminator, and the
// absent-trailing-assistant case, fell through to the unconditional
// `return { ok: true, value: extractTrailingTurnText(messages) }`. The two
// consumer sites compounded the gap: both filtered
// `if (!probe.ok && probe.error.kind === "transport")`
// (now production-theta-producer.ts:5015, :5126) and otherwise fell through to
// `extractTrailingTurnText(this.#readMessages())` (now production-theta-producer.ts:5019,
// :5129), so even a classifier fixed to return `context_overflow` would have been
// dropped on the floor at these sites. The settle predicate deliberately admits
// every trailing-`assistant` and tool-result ending as "settled"
// (`isSettledTurnEnding`, production-theta-producer.ts:5711 / :5716) on the
// STATED premise that `extractPromptModeQueryResult` classifies them — so
// nothing else catches the failure.
//
// The behaviour these cells encode is the §Expected/§Fix contract
// (conversation-drive.md:16 PIC-51b), NOT the fork's:
//   - a trailing `assistant` `stopReason: "length"` maps to
//     `Err(QueryError { kind: "context_overflow", tokens_used: null,
//     tokens_limit: null })` (provider-error-mapping.ts:373 stop-reason arm);
//   - every other non-normal terminator (`content_filter`, `"aborted"` with the
//     theta NOT cancelled, anything unrecognised) maps to
//     `Err(QueryError { kind: "transport", … })` carrying the turn's
//     `errorMessage` or the fixed `"provider transport failure"`;
//   - a settled turn with NO trailing `assistant` message at all (case (ii))
//     maps to `Err(transport, "provider transport failure")` "rather than to
//     `Ok("")`".
// The receiving seam already exists and is exercised by the off-session driver:
// `query-tool-loop.ts:113`–:116 widens the transport arm to
// `TransportError | ContextOverflowError` citing PIC-51b.
//
// The `?` operator unwinds a query `Err` out of the body (ERR-18), so a loud
// failure is observable as a `fail` outcome whose `execution.error` IS the leaf
// `QueryError`, and a SILENTLY-bound value is observable as a `success` outcome
// whose final value is the extracted string. Every cell here therefore reds at
// the fork as "a value was silently bound" and greens on the §Fix's `Err`.
//
// Harness: the house pattern of tests/b0288-prompt-turn-completion-witness.test.ts
// and its sibling tests/prompt-provider-field-derivation.test.ts — drive the REAL
// producer (`createProductionProducerDeps` → `bindPromptConversation` →
// `executeBody`) against an in-memory session double with an injected `Clock`,
// so the REAL `#resolvePromptQuery` constructs the REAL `LivePromptQueryModel`
// (never hand-built; it is not exported) and the REAL `#readMessages()` /
// `buildSessionContext` read surface feeds the REAL PIC-51/PIC-51b/PIC-53
// ordering. `clock.setTimeout` is the drive's only wait primitive while a turn
// is in flight, so one hook == one poll: the double completes its scripted turn
// on the first tick. Self-contained; deterministic; no live network, no
// pi-ai mocking. b0288 hardcodes `stopReason: "stop"` on the appended assistant;
// this file EXTENDS the double with a per-turn `stopReason` knob, an optional
// `errorMessage`, and a `toolResult`-only turn variant (user entry + a
// `toolResult`-role message, no assistant) — verified to settle rather than
// hang (the case-(ii) arm; `isSettledTurnEnding` reads the `toolResult` ending).
//
// A DIRECT unit block over `extractPromptModeQueryResult(messages, …)` pins the
// classifier arm itself (independent of the two consumer sites), mirroring
// tests/prompt-transport-mapping.test.ts's pi-ai `Message[]` builders.
//
// Spec: pi-integration-contract/conversation-drive.md:16 (PIC-51, PIC-51b,
// PIC-53 ordering), pi-integration-contract/provider-error-mapping.md:33
// (stop-reason classification arm); errors-and-results/queryerror-variants.md
// (§ContextOverflowError, §TransportError).

import { describe, expect, it } from "vitest";
import type {
  AssistantMessage,
  Message,
  ToolResultMessage,
  UserMessage,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import {
  extractPromptModeQueryResult,
  PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE,
  type PromptModeQueryResult,
} from "../src/runtime/prompt-transport-mapping";
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
// Distinct `.api` / `.provider` strings (the bug-0009 fixture discipline) so a
// synthesised `TransportError.provider` is checked against the API-shaped
// `.api` value the PIC-50 derivation pins ("anthropic-messages"), not the short
// `.provider` id ("anthropic").

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

// ===========================================================================
// The in-memory live user session (b0288 / prompt-provider harness shape,
// EXTENDED per bug 0413).
// ===========================================================================

/**
 * One driven turn's scripted trailing message. The `assistant` arm carries the
 * per-turn `stopReason` knob (b0288 hardcodes `"stop"`) and an optional
 * `errorMessage`; the `toolResult` arm scripts the case-(ii) settled turn that
 * commits NO assistant message at all — a `toolResult`-role ending the
 * production `isSettledTurnEnding` (production-theta-producer.ts:5712) admits.
 */
type ScriptedReply =
  | {
      readonly role?: "assistant";
      /** Typed `string` so a raw provider terminator outside pi-ai's StopReason union (e.g. "content_filter") scripts without a cast. */
      readonly stopReason: string;
      readonly text?: string;
      readonly errorMessage?: string;
    }
  | { readonly role: "toolResult"; readonly text?: string };

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
 *  - `sendUserMessage` commits the `user` entry and marks the session streaming
 *    (`isIdle()` → false);
 *  - `tick()` (invoked from the injected `Clock`'s `setTimeout`, the drive's
 *    only wait primitive while a turn is in flight) completes the streamed turn:
 *    it commits the scripted trailing entry — an `assistant` message with the
 *    scripted `stopReason`/`text`/`errorMessage`, OR a `toolResult`-role message
 *    with no assistant — and returns the session to idle;
 *  - `entries` (id/parentId-chained so `buildSessionContext`'s leaf walk yields
 *    the full chronological transcript) back `ctx.sessionManager.getEntries()`,
 *    the PIC-51b/PIC-53 read surface.
 */
class LiveSessionDouble {
  readonly entries: SessionEntryDouble[] = [];
  /** Proof the LIVE seam drove the turn (off-session never calls `pi.sendUserMessage`). */
  sendUserMessageCalls = 0;
  readonly sentQueryTexts: string[] = [];

  #idle = true;
  readonly #queue: ScriptedReply[];

  constructor(replies: readonly ScriptedReply[]) {
    this.#queue = [...replies];
  }

  sendUserMessage(content: string): void {
    this.sendUserMessageCalls += 1;
    this.sentQueryTexts.push(content);
    this.#append({ role: "user", content: [{ type: "text", text: content }], timestamp: 0 });
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
    if (reply.role === "toolResult") {
      // The case-(ii) settled arm: a tool round the host committed with no
      // assistant entry of its own. `isSettledTurnEnding`
      // (production-theta-producer.ts:5712) reads this `toolResult` ending as
      // settled, so the drive does not hang — confirmed by cell (c) completing.
      this.#append({
        role: "toolResult",
        toolCallId: "tc-1",
        toolName: "probe_tool",
        content: reply.text !== undefined ? [{ type: "text", text: reply.text }] : [],
        isError: false,
        timestamp: 0,
      });
      this.#idle = true;
      return;
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

/** The production AJV validator (matches the sibling live-seam harnesses). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * The runtime root for the live drive. `clock.setTimeout` first `tick()`s the
 * session double (completing any in-flight streamed turn) and then fires the
 * callback synchronously: `macrotask` is the drive's only wait primitive while
 * a turn is in flight, so this hook is exactly where "the turn settles" becomes
 * observable. Deterministic, no real timers.
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

/** The `ExtensionAPI` surface the live drive touches (sibling harness shape). */
function piDouble(session: LiveSessionDouble): ExtensionAPI {
  return {
    sendUserMessage: (content: string): void => session.sendUserMessage(content),
    getActiveTools: (): string[] => [],
    setActiveTools: (): void => {},
    registerTool: (): void => {},
    on: (): void => {},
    sendMessage: (): void => {},
  } as unknown as ExtensionAPI;
}

/**
 * The dispatch ctx. `model` is the user session's selected model (the PIC-50
 * provider-derivation source), `signal` is `undefined` (idle slash-entry — the
 * theta is NEVER aborted here, which is the point of cell (d)'s
 * non-aborted-signal half), `isIdle`/`waitForIdle` model the turn lifecycle,
 * and `sessionManager` serves the committed transcript the probe reads.
 */
function ctxDouble(session: LiveSessionDouble): ExtensionCommandContext {
  return {
    model: ANTHROPIC_MODEL,
    signal: undefined,
    isIdle: (): boolean => session.isIdle(),
    waitForIdle: (): Promise<void> => Promise.resolve(),
    sessionManager: {
      getEntries: (): readonly SessionEntryDouble[] => [...session.entries],
      getLeafId: (): undefined => undefined,
    },
  } as unknown as ExtensionCommandContext;
}

/** Drive the fixture theta through the PRODUCTION prompt-mode binding. */
async function driveLiveTheta(
  replies: readonly ScriptedReply[],
): Promise<{ readonly execution: BodyExecution; readonly session: LiveSessionDouble }> {
  const doc = parse(ONE_QUERY_THETA);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const session = new LiveSessionDouble(replies);
  const deps = createProductionProducerDeps({
    pi: piDouble(session),
    root: rootDouble(session),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(session) });
  expect(
    binding.drivenAgainst,
    "the harness must bind the LIVE prompt-mode drive (the user session), not an off-session host",
  ).toBe("prompt-user-session");
  const execution = await executeBody(theta.body, binding.executeDeps);
  return { execution, session };
}

// --- The driven theta ---------------------------------------------------------
// One untyped top-level `@`-query whose `?` unwinds the query's `Err` out of the
// body (ERR-18), so a loud failure is a `fail` outcome carrying the leaf
// `QueryError` and a silently-bound value is a `success` outcome whose final
// value is the extracted string.

const ONE_QUERY_THETA = ["---", "mode: prompt", "---", "let v = @`Ping`?", "v", ""].join("\n");

// --- End-to-end assertion helpers ---------------------------------------------
// Both quote the observed outcome + final value on failure so a fork red reads
// as "a value was silently bound", not as an opaque mismatch.

/** Narrow a `fail` drive to its leaf `QueryError` record (fails loudly otherwise). */
function expectFailLeaf(execution: BodyExecution): Record<string, unknown> {
  expect(
    execution.outcome,
    "bug 0413 PIC-51b: the terminator must FAIL the body (ERR-18) and bind NO value; observed outcome " +
      `'${execution.outcome}' with final value ${JSON.stringify(execution.result.value)}`,
  ).toBe("fail");
  const error = execution.error;
  expect(
    error !== null && typeof error === "object",
    `the fail outcome must carry the leaf QueryError; observed: ${JSON.stringify(error)}`,
  ).toBe(true);
  return error as unknown as Record<string, unknown>;
}

/** Assert the drive failed with `Err(context_overflow)` and the spec's null token counts. */
function expectContextOverflow(execution: BodyExecution): void {
  const leaf = expectFailLeaf(execution);
  expect(
    leaf.kind,
    `PIC-51b: a "length" terminator maps to context_overflow; observed: ${JSON.stringify(leaf)}`,
  ).toBe("context_overflow");
  expect(leaf.tokens_used, "PIC-51b: the stop-reason overflow arm carries tokens_used: null").toBeNull();
  expect(leaf.tokens_limit, "PIC-51b: the stop-reason overflow arm carries tokens_limit: null").toBeNull();
}

/** Assert the drive failed with `Err(transport)` on the PIC-50/PIC-51 register. */
function expectTransport(
  execution: BodyExecution,
  expected: { readonly message: string; readonly retryable: boolean },
): void {
  const leaf = expectFailLeaf(execution);
  expect(
    leaf.kind,
    `PIC-51b: a non-normal terminator maps to transport; observed: ${JSON.stringify(leaf)}`,
  ).toBe("transport");
  expect(leaf.message, "PIC-51b: the transport message is the errorMessage or the fixed fallback").toBe(
    expected.message,
  );
  expect(leaf.http_status, "no HTTP status is observable at the prompt-mode seam").toBeNull();
  expect(
    leaf.provider,
    "provider is the user session model's API-shaped `.api` value (PIC-50)",
  ).toBe("anthropic-messages");
  expect(leaf.retryable, "a definite non-normal terminator is retryable: false").toBe(expected.retryable);
}

// ===========================================================================
// END-TO-END WITNESS cells — RED at the fork, for the filed reason: a
// truncated / filtered / torn / absent-assistant turn binds `Ok(string)` with
// zero diagnostics, where PIC-51b pins a loud `Err`.
// ===========================================================================

describe("bug 0413 (RED) — PIC-51b non-error terminators must fail the prompt-mode drive, not bind Ok(string)", () => {
  it('(a) trailing assistant stopReason "length" → Err(context_overflow) with null token counts, never Ok("TRUNCATED PREFIX")', async () => {
    // Pre-fix fork: `extractPromptModeQueryResult` had no "length" arm, so
    // control reached the unconditional Ok extraction and the consumer's
    // `kind === "transport"` filter would have dropped a context_overflow
    // anyway — the drive bound the truncated prefix. Post-fix: Err(context_overflow).
    const { execution, session } = await driveLiveTheta([
      { stopReason: "length", text: "TRUNCATED PREFIX" },
    ]);

    expect(session.sendUserMessageCalls, "exactly one user-visible turn (the live seam was reached)").toBe(1);
    expect(
      execution.result.value,
      "a context-overflowed reply must NOT silently bind its truncated prefix as the query's Ok value",
    ).not.toBe("TRUNCATED PREFIX");
    expectContextOverflow(execution);
  });

  it('(b) trailing assistant stopReason "content_filter" + errorMessage → Err(transport, "blocked by policy"), never Ok("partial")', async () => {
    // "content_filter" is a raw provider terminator OUTSIDE pi-ai's typed
    // StopReason union; PIC-51b routes every non-normal terminator through the
    // transport arm carrying the turn's `errorMessage`.
    const { execution, session } = await driveLiveTheta([
      { stopReason: "content_filter", text: "partial", errorMessage: "blocked by policy" },
    ]);

    expect(session.sendUserMessageCalls, "exactly one user-visible turn").toBe(1);
    expect(
      execution.result.value,
      "a content-filtered reply must NOT silently bind its partial text as the query's Ok value",
    ).not.toBe("partial");
    expectTransport(execution, { message: "blocked by policy", retryable: false });
  });

  it('(c) settled turn with NO trailing assistant (toolResult-only) → Err(transport, "provider transport failure"), never Ok("")', async () => {
    // Case (ii): the settled arm with no `assistant` at all. The scratch probe
    // confirmed the drive SETTLES (does not hang) on this shape —
    // `isSettledTurnEnding` reads the `toolResult` ending
    // (production-theta-producer.ts:5712) — and binds `Ok("")` at the fork.
    // PIC-51b pins the fixed transport Err "rather than to `Ok("")`".
    const { execution, session } = await driveLiveTheta([{ role: "toolResult" }]);

    expect(session.sendUserMessageCalls, "exactly one user-visible turn").toBe(1);
    expect(
      session.entries.map((entry) => entry.message.role),
      "the cell's premise: a user entry then a toolResult-role ending, NO assistant",
    ).toEqual(["user", "toolResult"]);
    expect(
      execution.result.value,
      "an absent-assistant settled turn must NOT silently bind the empty string as the query's Ok value",
    ).not.toBe("");
    expectTransport(execution, {
      message: PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE,
      retryable: false,
    });
  });

  it('(d) trailing assistant stopReason "aborted" with the theta NOT cancelled → Err(transport, fallback), never Ok("torn partial")', async () => {
    // The NON-aborted-signal half bug 0012 explicitly left to this gap:
    // `ctx.signal` is `undefined` / never aborted, so the cancellation
    // short-circuit does NOT fire, yet the turn ends on a torn `"aborted"`
    // terminator. PIC-51b routes it through the transport arm; with no
    // `errorMessage` the message is the fixed fallback.
    const { execution, session } = await driveLiveTheta([
      { stopReason: "aborted", text: "torn partial" },
    ]);

    expect(session.sendUserMessageCalls, "exactly one user-visible turn").toBe(1);
    expect(
      execution.result.value,
      "a torn (aborted, theta not cancelled) reply must NOT silently bind its partial text as Ok",
    ).not.toBe("torn partial");
    expectTransport(execution, {
      message: PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE,
      retryable: false,
    });
  });
});

// ===========================================================================
// CONTROL cell — GREEN at the fork AND after the fix. It proves the harness
// genuinely reaches `LivePromptQueryModel` (so the reds above are PIC-51b
// divergences, not a harness gap) and guards the §Fix against OVER-firing: a
// normal `stop` boundary must still bind its text through PIC-53.
// ===========================================================================

describe("bug 0413 (CONTROL) — a normal `stop` boundary still binds its Ok text (PIC-53)", () => {
  it('(control) trailing assistant stopReason "stop", text "pong answer" → success, value "pong answer"', async () => {
    const { execution, session } = await driveLiveTheta([{ stopReason: "stop", text: "pong answer" }]);

    expect(session.sendUserMessageCalls, "exactly one user-visible turn resolves the untyped query").toBe(1);
    expect(
      session.sentQueryTexts[0],
      "the driven turn carries the rendered query template (the live seam ran)",
    ).toContain("Ping");
    expect(
      execution.outcome,
      `a clean live turn succeeds; error: ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      "PIC-53: the trailing-turn assistant text flows through the `?` and out as the final value",
    ).toBe("pong answer");
  });
});

// ===========================================================================
// DIRECT unit cells over `extractPromptModeQueryResult` — pin the classifier
// arm itself, independent of the two consumer sites, mirroring
// tests/prompt-transport-mapping.test.ts's pi-ai `Message[]` builders. RED at
// the fork (the classifier returns Ok for every non-`"error"` terminator);
// the "toolUse" normal-boundary control stays Ok both before and after.
// ===========================================================================

function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: 0 };
}

function assistantMessage(opts: {
  text?: string;
  stopReason: AssistantMessage["stopReason"];
  errorMessage?: string;
}): AssistantMessage {
  const base: AssistantMessage = {
    role: "assistant",
    content: opts.text === undefined ? [] : [{ type: "text", text: opts.text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: opts.stopReason,
    timestamp: 0,
  };
  return opts.errorMessage === undefined ? base : { ...base, errorMessage: opts.errorMessage };
}

function toolResultMessage(): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "tc-1",
    toolName: "probe_tool",
    content: [{ type: "text", text: "" }],
    isError: false,
    timestamp: 0,
  };
}

/** Narrow a `PromptModeQueryResult` to its `Err` arm, failing loudly (quoting the Ok value) otherwise. */
function expectErr(result: PromptModeQueryResult): Record<string, unknown> {
  if (result.ok) {
    // No silent skip: a fork classifier that returned Ok reds HERE on the
    // behavioural expectation, quoting the silently-extracted value.
    expect.unreachable(
      `bug 0413 PIC-51b: expected an Err(QueryError) but the classifier bound Ok(${JSON.stringify(result.value)})`,
    );
  }
  return (result as Extract<PromptModeQueryResult, { ok: false }>).error as unknown as Record<string, unknown>;
}

const PROBE_CTX = { aborted: false, provider: "anthropic-messages" } as const;

describe("bug 0413 (RED, direct) — extractPromptModeQueryResult classifies non-error terminators, not Ok(string)", () => {
  it('(a) stopReason "length" → Err(context_overflow) with null token counts', () => {
    const messages: Message[] = [
      userMessage("Ping"),
      assistantMessage({ text: "TRUNCATED PREFIX", stopReason: "length" }),
    ];
    const leaf = expectErr(extractPromptModeQueryResult(messages, PROBE_CTX));
    expect(leaf.kind).toBe("context_overflow");
    expect(leaf.tokens_used).toBeNull();
    expect(leaf.tokens_limit).toBeNull();
  });

  it('(b) stopReason "content_filter" + errorMessage → Err(transport) carrying the errorMessage', () => {
    const messages: Message[] = [
      userMessage("Ping"),
      // "content_filter" is outside pi-ai's StopReason union — cast so it compiles.
      assistantMessage({
        text: "partial",
        stopReason: "content_filter" as AssistantMessage["stopReason"],
        errorMessage: "blocked by policy",
      }),
    ];
    const leaf = expectErr(extractPromptModeQueryResult(messages, PROBE_CTX));
    expect(leaf.kind).toBe("transport");
    expect(leaf.message).toBe("blocked by policy");
    expect(leaf.http_status).toBeNull();
    expect(leaf.provider).toBe("anthropic-messages");
    expect(leaf.retryable).toBe(false);
  });

  it('(c) no trailing assistant (toolResult-only) → Err(transport, "provider transport failure")', () => {
    const messages: Message[] = [userMessage("Ping"), toolResultMessage()];
    const leaf = expectErr(extractPromptModeQueryResult(messages, PROBE_CTX));
    expect(leaf.kind).toBe("transport");
    expect(leaf.message).toBe(PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE);
    expect(leaf.http_status).toBeNull();
    expect(leaf.provider).toBe("anthropic-messages");
    expect(leaf.retryable).toBe(false);
  });

  it('(d) stopReason "aborted" with probeCtx.aborted false → Err(transport, fallback)', () => {
    const messages: Message[] = [
      userMessage("Ping"),
      assistantMessage({ text: "torn partial", stopReason: "aborted" }),
    ];
    const leaf = expectErr(extractPromptModeQueryResult(messages, PROBE_CTX));
    expect(leaf.kind).toBe("transport");
    expect(leaf.message).toBe(PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE);
    expect(leaf.provider).toBe("anthropic-messages");
    expect(leaf.retryable).toBe(false);
  });

  it('(control) stopReason "toolUse" normal boundary → Ok(text) (PIC-53 fall-through, green before and after)', () => {
    const messages: Message[] = [
      userMessage("Ping"),
      assistantMessage({ text: "pong answer", stopReason: "toolUse" }),
    ];
    const result = extractPromptModeQueryResult(messages, PROBE_CTX);
    expect(
      result.ok,
      "a normal `tool_use` boundary is PIC-53 territory — the classifier must NOT fail it",
    ).toBe(true);
    expect((result as Extract<PromptModeQueryResult, { ok: true }>).value).toBe("pong answer");
  });
});
