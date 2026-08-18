// Bug 0007 — off-session `@`-query provider-failure classification (RED suite).
//
// docs/bugs/0007-off-session-error-stop-swallowed-as-ok-empty.md: pi-ai's
// `complete()` free function NEVER rejects on a provider failure — the per-API
// adapter converts every caught throw into a resolved `AssistantMessage` with
// `stopReason: "error"` (+ optional `errorMessage`). `offSessionComplete`
// (src/extension/production-theta-producer.ts:3620) returns `assistantText(reply)`
// without probing `stopReason`, so the off-session driver for every `@`-query in
// a `subagent fn` body (`OffSessionQueryModel`, :3362 — both in-process hosts
// pass `userVisible: false`, :1519/:2032) swallows the failure:
//
//   - untyped: the error-stop reply's empty (or partial) text resolves as a
//     TERMINATING `Ok("")` / `Ok(<partial>)` — a fabricated success;
//   - typed: the empty text enters `parseStructuredPayload` and the transport
//     failure is laundered into the schema-validation channel — respond-repair
//     re-drives the dead provider `respond_repair.attempts` (default 3) more
//     times and the terminal result is `Err(ValidationError)` after
//     1 + 3 = 4 `complete()` calls.
//
// This suite pins the FIXED behaviour (red today, green after the fix), plus
// two green controls that pass today and prove the drive exercises the
// off-session driver. Assertions target the AUTHOR-VISIBLE Result value the
// theta observes: with `?` in the fn body the Err propagates out of `helper`,
// crosses the FN-6 boundary wrapped as `InvokeCalleeError { inner: <leaf> }`
// (invocation.md §Failures), and `let out = helper("x")` binds that Err Result
// as the body's final value (`expectErrQueryError` digs out the leaf).
//
// Spec: pi-integration-contract/provider-error-mapping.md (§Provider error
// mapping, §Stop-reason classification, §Overflow signatures),
// pi-integration-contract/conversation-drive.md (PIC-50 off-session
// classification obligation; PIC-51 shape: `Err(QueryError { kind: "transport",
// message: <errorMessage>, http_status: null, provider: <provider>,
// retryable: false })`, fallback `"provider transport failure"`),
// query/query-failure-and-repair.md (QRY-10; §respond-repair — a follow-up's
// non-validation failure terminates repair immediately, no `attempts` debit),
// errors-and-results/queryerror-variants.md (§TransportError, provider
// derivation: the resolved model's `.api`, not `.provider`),
// query/query-forms.md (QRY-1), functions.md (FN-6), invocation.md (INV-5).
//
// Method: the tests/e2e-s5-binder-echo-emission.test.ts pattern — mock ONLY
// `@earendil-works/pi-ai/compat`'s `complete`, drive the production producer
// (`createProductionProducerDeps` → `bindPromptConversation` → `executeBody`)
// over a prompt-mode theta whose `subagent fn` body issues the `@`-query.
// Deterministic; no live network.
//
// Bug 0010 increment D re-seam: the off-session typed drive is now TWO-PHASE
// (a free-phase `complete()` tool loop over a held conversation, then the
// forced respond `complete()` with tools + forced toolChoice — see
// tests/off-session-two-phase.test.ts). The CLASSIFICATION this suite pins is
// unchanged (the same `classifyOffSessionReply` runs on every dispatch), but
// the typed cells' call SEATS moved: (vi)'s error-stop now lands on the
// free-phase call, (vii)'s on the forced respond dispatch, and the (b) green
// control scripts the two-phase happy path (free-phase stop turn + respond
// ToolCall) instead of the retired fused JSON-in-text single shot.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session reply QUEUE. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
// One reply is consumed per `complete()` call, in order.
const scripted = vi.hoisted(() => ({
  queue: [] as unknown[],
  calls: 0,
  // Bug 0182: the per-reply `onResponse` firing directive — the HTTP status the
  // adapter reports for THAT reply, keyed by the reply object `reply()` built.
  // A SIDE TABLE rather than a member of the reply, so every scripted reply
  // stays a pure `AssistantMessage` shape on the surface production code reads.
  onResponseStatus: new WeakMap<object, number>(),
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(
      async (
        _model: unknown,
        _context: unknown,
        options?: { readonly onResponse?: (response: unknown) => void },
      ) => {
        const index = scripted.calls;
        scripted.calls += 1;
        if (scripted.queue.length === 0) {
          // No silent skipping: a drive against an unscripted cell fails loudly.
          throw new Error(
            `scripted complete() called with an EMPTY reply queue (call #${scripted.calls})`,
          );
        }
        // Per-call consumption with the LAST entry sticky: a drive that issues
        // MORE calls than the cell scripted keeps observing the terminal reply
        // (a dead provider keeps failing identically), so today's respond-repair
        // over-driving (bug 0007: 1 + attempts(3) = 4 calls) stays observable as
        // a CALL-COUNT assertion instead of a mid-flight harness throw.
        const entry = scripted.queue[Math.min(index, scripted.queue.length - 1)];
        // Bug 0182: a consumed entry that scripts a status fires the CALLER's
        // `ProviderStreamOptions.onResponse` exactly once, before the reply
        // resolves — the pi-ai adapters' own order (the SDK call resolves,
        // `onResponse` is invoked with `{ status, headers }`, the reply is
        // returned: node_modules/@earendil-works/pi-ai/dist/api/
        // anthropic-messages.js, dist/api/openai-completions.js). A caller that
        // registers NO callback observes nothing, exactly as the real adapters
        // behave, so a firing scripted against a seam that registers none is
        // inert; scripting none reproduces the adapters' measured error-response
        // shape (`ONRESPONSE FIRINGS: []`).
        const status =
          typeof entry === "object" && entry !== null
            ? scripted.onResponseStatus.get(entry)
            : undefined;
        if (status !== undefined) {
          options?.onResponse?.({ status, headers: {} });
        }
        return entry;
      },
    ),
  };
});

import { createHash } from "node:crypto";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import { createProductionProducerDeps } from "../src/extension/production-theta-producer";
import type { ThetaCompositionInput } from "../src/extension/theta-composition-producer";
import { executeBody, type BodyExecution } from "../src/runtime/statement-executor";
import { isResultValue, type ThetaValue } from "../src/runtime/value";
import {
  AjvSchemaValidator,
  type LoweredSchema,
  type SchemaSlug,
} from "../src/seams/schema-validator";
import type { RuntimeRoot } from "../src/runtime-root";
import {
  parseThetaDocument,
  type ParseThetaDocumentDeps,
  type SchemaDecl,
  type ThetaDocument,
} from "../src/parser/theta-document";
import { lowerQueryResponseSchema } from "../src/runtime/query-schema-lowering";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";

// --- The scripted provider failure texts ------------------------------------

/** The live-observed auth failure text the runtime currently destroys. */
const AUTH_ERROR_MESSAGE =
  "No auth available for anthropic. Set ANTHROPIC_OAUTH_TOKEN or ANTHROPIC_API_KEY.";

/** PIC-51's fixed fallback when the error-stop carries no `errorMessage`. */
const TRANSPORT_FALLBACK_MESSAGE = "provider transport failure";

/** An openai-completions overflow-signature `errorMessage` (HTTP-200 stopReason-error envelope). */
const OPENAI_OVERFLOW_MESSAGE =
  "This model's maximum context length is 128000 tokens. However, your messages resulted in 130000 tokens.";

// --- The resolved off-session models ----------------------------------------
// DISTINCT `.api` and `.provider` strings so the TransportError.provider
// assertion (`provider` is the resolved model's API-shaped `.api` value per
// queryerror-variants.md provider derivation) catches a wrong `.provider` read.

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

const OPENAI_MODEL = {
  id: "m2",
  api: "openai-completions",
  provider: "openai",
  strictCapable: true,
};

// --- Scripted assistant replies ----------------------------------------------

/**
 * An `AssistantMessage`-shaped reply for the mocked `complete()`. `text`
 * undefined scripts EMPTY content (the usual error-stop shape); a string
 * scripts one text part (a mid-stream partial, or a clean terminating turn).
 * `toolCalls` scripts pi-ai `ToolCall` content parts (the (b) green control's
 * forced respond call — bug 0010 increment D).
 */
function reply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
  readonly api?: string;
  readonly toolCalls?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly arguments: Record<string, unknown>;
  }>;
  /**
   * Bug 0182: the HTTP status the adapter reports through
   * `ProviderStreamOptions.onResponse` for this reply. OMITTED means the
   * adapter never fires — the measured anthropic and openai-completions
   * error-response shape (`ONRESPONSE FIRINGS: []`) and the no-HTTP-response
   * class `provider-error-mapping.ts` spells `httpStatus: null`.
   */
  readonly onResponseStatus?: number;
}): unknown {
  const content: Record<string, unknown>[] =
    fields.text !== undefined ? [{ type: "text", text: fields.text }] : [];
  for (const call of fields.toolCalls ?? []) {
    content.push({
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    });
  }
  const message = {
    role: "assistant",
    content,
    api: fields.api ?? "anthropic-messages",
    stopReason: fields.stopReason,
    ...(fields.errorMessage !== undefined ? { errorMessage: fields.errorMessage } : {}),
    timestamp: 0,
  };
  if (fields.onResponseStatus !== undefined) {
    scripted.onResponseStatus.set(message, fields.onResponseStatus);
  }
  return message;
}

/**
 * Bug 0010 increment D: the `Verdict` respond-tool name, derived through the
 * SAME production collaborators the runtime uses (`lowerQueryResponseSchema`
 * + the sha256-first-16-hex slug recipe of `respondSchemaSlug`), so the (b)
 * green control scripts its forced respond ToolCall against the contract, not
 * a copied constant.
 */
function respondToolName(): string {
  const doc = parse(TYPED_THETA);
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
  return `__theta_respond_${slug}`;
}

// --- The driven thetas ---------------------------------------------------------
// The bug-doc repro shape: a prompt-mode theta whose `subagent fn` body issues
// the `@`-query. The body's queries resolve through the in-process subagent-fn
// host (`userVisible: false`) → `OffSessionQueryModel` → mocked `complete()`.

const UNTYPED_THETA = [
  "---",
  "mode: prompt",
  "---",
  "subagent fn helper(a: string) {",
  "  let v = @`Echo ${a}`?",
  "  v",
  "}",
  'let out = helper("x")',
  "out",
  "",
].join("\n");

// The typed twin: `let v: Verdict = @`…`?` drives the forced-respond turn and,
// on non-conformance, the respond-repair loop (default attempts = 3).
const TYPED_THETA = [
  "---",
  "mode: prompt",
  "---",
  "schema Verdict {",
  "  score: number",
  "}",
  "subagent fn helper(a: string) {",
  "  let v: Verdict = @`Rate ${a}`?",
  "  v",
  "}",
  'let out = helper("x")',
  "out",
  "",
].join("\n");

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

/** The production AJV validator (real schema validation for the typed cells). */
function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

/**
 * A runtime-root double sufficient for the off-session query drive: a noop
 * checkpoint, deterministic ids, a wall clock for the query-loop config, and
 * the REAL AJV validator so the typed cells' schema validation behaves as
 * production (a non-conforming payload genuinely fails and opens repair).
 */
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

/**
 * The dispatch ctx. It MUST carry `.model` (the resolved off-session model) or
 * `offSessionComplete`'s H8a `OffSessionModelUnavailableError` arm fires instead
 * of the classification under test.
 */
function ctxDouble(model: unknown): ExtensionCommandContext {
  return {
    model,
    sessionManager: { getEntries: (): readonly unknown[] => [], getLeafId: (): undefined => undefined },
  } as unknown as ExtensionCommandContext;
}

/**
 * Drive one fixture theta through the PRODUCTION prompt-mode binding
 * (`bindPromptConversation` → `executeBody`) and return the body execution.
 * The `subagent fn` call inside re-binds the body's queries onto the
 * off-session host (`#spawnSubagentFnSession` → `userVisible: false`).
 */
async function driveTheta(source: string, model: unknown): Promise<BodyExecution> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const deps = createProductionProducerDeps({
    // Bug 0010 harness accommodation: the shared respond-tool machinery routes
    // a typed query through the PIC-44 registration cache, so the double
    // tolerates (and ignores) the registration surface rather than crashing a
    // conforming implementation. The registry stays `{}` — the fixed auth
    // threading PROBES for `getApiKeyAndHeaders` and threads nothing here.
    pi: { sendMessage: () => {}, registerTool: () => {} } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(model) });
  return executeBody(theta.body, binding.executeDeps);
}

/**
 * Dig the author-visible leaf `QueryError` out of a drive's final value. The
 * body itself completes either way (the fn-call result is BOUND by `let out`,
 * tail `out`), so the observable is a success-outcome body whose FINAL VALUE is
 * the Err Result; the fn boundary wraps the `?`-propagated leaf as
 * `InvokeCalleeError { kind: "invoke_callee", inner: <leaf> }` (FN-6 /
 * invocation.md §Failures). Strict: fails loudly (quoting the observed value)
 * when the shape is anything else — on the unfixed runtime the untyped cells
 * observe a fabricated plain-string success here.
 */
function expectErrQueryError(execution: BodyExecution): Record<string, unknown> {
  expect(
    execution.outcome,
    `the drive's body must complete with the Err BOUND as its final value; ` +
      `observed outcome '${execution.outcome}' (error: ${JSON.stringify(execution.error)})`,
  ).toBe("success");
  const value = execution.result.value;
  const isErr =
    value !== undefined &&
    isResultValue(value as ThetaValue) &&
    (value as { readonly ok: boolean }).ok === false;
  expect(
    isErr,
    "bug 0007: the author-visible final value must be the Err Result carrying the " +
      `QueryError — never a fabricated success; observed final value: ${JSON.stringify(value)}`,
  ).toBe(true);
  const envelope = (value as { readonly error: unknown }).error;
  expect(
    envelope !== null && typeof envelope === "object",
    `the Err payload must be the QueryError envelope object; observed: ${JSON.stringify(envelope)}`,
  ).toBe(true);
  const wrapper = envelope as Record<string, unknown>;
  expect(
    wrapper.kind,
    "a `?`-propagated Err crosses the `subagent fn` boundary wrapped as invoke_callee " +
      `(FN-6); observed envelope: ${JSON.stringify(wrapper)}`,
  ).toBe("invoke_callee");
  const inner = wrapper.inner;
  expect(
    inner !== null && typeof inner === "object",
    `invoke_callee.inner must carry the leaf QueryError; observed envelope: ${JSON.stringify(wrapper)}`,
  ).toBe(true);
  return inner as Record<string, unknown>;
}

beforeEach(() => {
  scripted.queue = [];
  scripted.calls = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// RED cells — the FIXED classification (fail today, green after the fix).
// ===========================================================================

describe("bug 0007 (RED) — off-session error-stop classification (PIC-50/PIC-51, QRY-10)", () => {
  it("(i) untyped: a `stopReason: \"error\"` reply with empty content is Err(transport) carrying the errorMessage — never Ok(\"\")", async () => {
    // Today: fabricated success — outcome "success", final value "" (the
    // provider's auth-failure text is destroyed).
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    expect(
      execution.result.value,
      "bug 0007: the error-stop must NOT resolve as the fabricated empty-string success",
    ).not.toBe("");
    const err = expectErrQueryError(execution);
    expect(err.kind, `the leaf QueryError classifies as transport; observed: ${JSON.stringify(err)}`).toBe(
      "transport",
    );
    expect(err.message, "the provider's errorMessage is CARRIED, not destroyed").toBe(
      AUTH_ERROR_MESSAGE,
    );
    expect(err.http_status, "no HTTP status is observable at the off-session seam").toBeNull();
    expect(
      err.provider,
      "TransportError.provider is the resolved model's API-shaped `.api` value " +
        "(queryerror-variants.md provider derivation), not its `.provider`",
    ).toBe("anthropic-messages");
    expect(err.retryable, "an error-stop is a definite outcome — retryable: false").toBe(false);
    expect(scripted.calls, "exactly one provider call resolves the untyped query").toBe(1);
  });

  it("(ii) untyped: a mid-stream failure (error-stop WITH partial text) is still Err(transport) — never Ok(\"partial answer\")", async () => {
    // Today: fabricated success — final value "partial answer".
    scripted.queue = [
      reply({
        stopReason: "error",
        text: "partial answer",
        errorMessage: "stream terminated unexpectedly",
      }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    expect(
      execution.result.value,
      "bug 0007: a mid-stream failure's partial text must NOT resolve as a successful query value",
    ).not.toBe("partial answer");
    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(err.message).toBe("stream terminated unexpectedly");
    expect(err.retryable).toBe(false);
  });

  it("(iii) untyped: a `stopReason: \"length\"` reply is Err(context_overflow) with null token counts (stop-reason classification)", async () => {
    // Today: the length terminator is equally unprobed — the partial text
    // resolves as Ok("partial answer").
    scripted.queue = [reply({ stopReason: "length", text: "partial answer" })];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err.kind,
      "provider-error-mapping.md §Stop-reason classification: the output-boundary " +
        `\`length\` terminator maps to ContextOverflowError; observed: ${JSON.stringify(err)}`,
    ).toBe("context_overflow");
    expect(err.tokens_used, "no error message is present to extract counts from").toBeNull();
    expect(err.tokens_limit, "no error message is present to extract counts from").toBeNull();
  });

  it("(iv) untyped: an errorMessage-ABSENT error-stop is Err(transport) with the fixed PIC-51 fallback message", async () => {
    // Today: fabricated success — final value "".
    scripted.queue = [reply({ stopReason: "error" })];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.message,
      "PIC-51: when errorMessage is absent, message is EXACTLY the fixed fallback",
    ).toBe(TRANSPORT_FALLBACK_MESSAGE);
    expect(err.http_status).toBeNull();
    expect(err.retryable).toBe(false);
  });

  it("(iv-b) untyped: an error-stop with an EMPTY-STRING errorMessage takes the fixed fallback message", async () => {
    // errorMessage PRESENT but empty ("") — distinct from cell (iv)'s absent
    // field. `classifyOffSessionReply` folds an empty classifier message to
    // PIC-51's fixed fallback (the binder-parity fold, bug 0007), so the
    // author never observes a blank transport message.
    // Today: fabricated success — final value "".
    scripted.queue = [reply({ stopReason: "error", errorMessage: "" })];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.message,
      "PIC-51: an empty-string errorMessage folds to EXACTLY the fixed fallback — never a blank message",
    ).toBe(TRANSPORT_FALLBACK_MESSAGE);
    expect(err.http_status).toBeNull();
    expect(err.retryable).toBe(false);
    expect(scripted.calls, "exactly one provider call resolves the untyped query").toBe(1);
  });

  it("(v) untyped: an openai-completions overflow-signature errorMessage under stopReason \"error\" is Err(context_overflow) — the signature match takes precedence over transport", async () => {
    // openai's documented overflow gate admits HTTP-200 stopReason-error
    // envelopes (provider-error-mapping.md §Overflow signatures); the
    // anthropic gate admits HTTP 400 or no captured status
    // (provider-error-mapping.md §Classifier input surface), which is a
    // DIFFERENT row — hence openai here.
    // The scripted `onResponse({ status: 200 })` is the REAL captured status of
    // this envelope, not a fold fabrication: an openai-completions success
    // response fires `onResponse` once with `[200]` (measured), and this arm's
    // whole subject is an overflow delivered INSIDE a 200 body, so the arm
    // stays reachable off-session once the seam presents what it captured
    // (bug 0182 §Fix (b)(1)).
    // Today: fabricated success — final value "".
    scripted.queue = [
      reply({
        stopReason: "error",
        errorMessage: OPENAI_OVERFLOW_MESSAGE,
        api: "openai-completions",
        onResponseStatus: 200,
      }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, OPENAI_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err.kind,
      "the overflow-signature match takes precedence over the stop-reason transport " +
        `arm — context_overflow, NOT transport; observed: ${JSON.stringify(err)}`,
    ).toBe("context_overflow");
  });

  it("(vi) typed: an error-stop on the typed query's FIRST provider call is Err(transport) IMMEDIATELY — complete() called exactly ONCE, no respond dispatch, no respond-repair re-drives", async () => {
    // Pre-0007: the transport failure was laundered into the schema-validation
    // channel — Err(ValidationError { cause: "schema_validation" }) after
    // 1 + respond_repair.attempts (default 3) = 4 complete() calls, each
    // follow-up re-driving the dead provider and debiting an attempts slot the
    // spec says a transport failure must not consume. Bug 0010 increment D:
    // the first call is now the two-phase FREE-PHASE dispatch — its failure
    // still terminates the typed query with ONE call (PIC-50; the forced
    // respond dispatch is never issued after a dead free phase).
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err.kind,
      "the free-phase provider failure classifies as transport — never laundered " +
        `into the validation channel; observed: ${JSON.stringify(err)}`,
    ).toBe("transport");
    expect(err.message, "the provider's errorMessage is carried").toBe(AUTH_ERROR_MESSAGE);
    expect(
      scripted.calls,
      "the transport failure terminates the typed query at its first (free-phase) " +
        "call: exactly ONE complete() — no respond dispatch, no respond-repair " +
        "re-drives (pre-0007: 4 calls)",
    ).toBe(1);
  });

  it("(vii) typed: a transport failure on the FORCED RESPOND dispatch propagates — complete() called exactly TWICE, no repair re-drives", async () => {
    // First reply: a clean stop turn terminating the free phase (bug 0010
    // increment D: the two-phase shape's call #1). Second reply: the forced
    // respond dispatch's provider failure. query-failure-and-repair.md
    // §respond-repair / QRY-11 §non-validation: a transport failure terminates
    // the typed query as its proximate QueryError, consuming no attempts slot.
    // Pre-0007: repair burned ALL attempts against the dead provider —
    // 1 + 3 = 4 complete() calls — and returned Err(ValidationError).
    scripted.queue = [
      reply({ stopReason: "stop", text: "not json at all" }),
      reply({ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err.kind,
      "the respond dispatch's transport failure propagates as the query's Err — never " +
        `the terminal validation misattribution; observed: ${JSON.stringify(err)}`,
    ).toBe("transport");
    expect(err.message, "the respond-dispatch failure's errorMessage is carried").toBe(
      AUTH_ERROR_MESSAGE,
    );
    expect(
      scripted.calls,
      "the free-phase call + the failing forced respond dispatch = exactly TWO " +
        "complete() calls; the transport failure terminates the query with no " +
        "repair re-drives (pre-0007: 4 — the full attempts budget burned against " +
        "a dead provider)",
    ).toBe(2);
  });
});

// ===========================================================================
// GREEN controls — pass today AND after the fix; they prove this drive
// reaches the off-session driver (the bug doc's control cell).
// ===========================================================================

describe("bug 0007 (GREEN controls) — clean off-session turns flow through the same drive", () => {
  it("(a) untyped: a clean `stopReason: \"stop\"` turn resolves the text through the fn — final value \"OK7 x\"", async () => {
    scripted.queue = [reply({ stopReason: "stop", text: "OK7 x" })];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    expect(execution.outcome, "a clean off-session turn succeeds").toBe("success");
    expect(
      execution.result.value,
      "the assistant text flows through the fn body's `?` and out as the final value — " +
        "this control proves the mocked complete() feeds the off-session driver",
    ).toBe("OK7 x");
    expect(scripted.calls, "exactly one provider call resolves the untyped query").toBe(1);
  });

  it("(b) typed: a clean two-phase drive — free-phase stop turn, then the forced respond ToolCall — resolves the validated payload with complete() called twice", async () => {
    // Bug 0010 increment D re-pin: the fused single-call JSON-in-text drive is
    // retired — the off-session typed query is two-phase (free phase over the
    // held conversation, then the forced respond dispatch whose ToolCall
    // arguments supply the payload). This control still proves the mocked
    // complete() feeds the off-session driver end to end.
    scripted.queue = [
      reply({ stopReason: "stop", text: "thinking" }),
      reply({
        stopReason: "toolUse",
        toolCalls: [{ id: "tc1", name: respondToolName(), arguments: { score: 7 } }],
      }),
    ];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    expect(execution.outcome, "a schema-valid typed respond call succeeds").toBe("success");
    expect(
      execution.result.value,
      "the forced respond ToolCall's arguments validate against `Verdict`, and the " +
        "validated value flows out as the final value",
    ).toEqual({ score: 7 });
    expect(
      scripted.calls,
      "the two-phase shape: one free-phase call + one forced respond dispatch " +
        "(bug 0010 increment D)",
    ).toBe(2);
  });
});

// ===========================================================================
// Bug 0182 — the off-session fold must present the HTTP status the seam
// CAPTURED, never a fabricated 200.
//
// docs/bugs/0182-off-session-fold-fabricated-200-vetoes-overflow-match.md:
// `classifyOffSessionReply` (src/extension/production-theta-producer.ts) builds
// its `classifyProviderResponse` input with a literal `httpStatus: 200`. Bug
// 0065 widened the anthropic / mistral overflow gate to
// `input.httpStatus === 400 || input.httpStatus === null`
// (`overflowStatusGateSatisfied`, src/binder/provider-error-mapping.ts) because
// the `anthropic-messages` adapter measurably never fires `onResponse` on an
// HTTP 400 — but 200 is neither value, and provider-error-mapping.md:7 makes a
// CAPTURED non-400 status VETO a match under a row whose gate names HTTP 400.
// The widened arm is therefore unreachable at every off-session seam: a real
// `prompt is too long: 220044 tokens > 200000 maximum` reaches the theta author
// as `Err(transport)` with both counts dropped, where the same bytes with no
// captured status classify `context_overflow { 220044, 200000 }`.
//
// These cells pin the FIXED classifier input: the status the seam actually
// captured (`captured?.status ?? null` — the shape `#classifyBinderAttempt`
// already ships), which for a reply the adapter never reported on is `null`.
// The harness's `reply({ onResponseStatus })` firing is the ONLY source of a
// non-null status here, so a cell that scripts none IS the no-captured-status
// class and a cell that scripts one is a genuine capture.
//
// Spec: provider-error-mapping.md:7 (§Classifier input surface — the
// no-captured-status carve-out, its `openai-completions` exclusion, and the
// captured-status veto), :17 (the anthropic row: "HTTP 400, or no captured HTTP
// status"), :19 (mistral), :24 (§Overflow token-count extraction), :31
// (§Stop-reason classification); query/query-failure-and-repair.md:25 (QRY-10 —
// the counts are populated when the provider supplies them);
// errors-and-results/queryerror-variants.md:125 (the `ContextOverflowError`
// field set); conversation-drive.md:16 (PIC-50 — the off-session `complete()`
// call's provider failures are classified "exactly as the binder's `complete()`
// call is").
// ===========================================================================

/**
 * The bug-0182 author-side witness theta (W8): the `subagent fn` body MATCHES
 * the untyped `@`-query's Result and renders one deterministic token per
 * verdict, so the observable is the arm an author's `match` actually takes.
 * Pattern forms are expressions.md#pattern-grammar — a constructor over an
 * object/schema pattern with literal fields, no guards and no rest patterns.
 * The query is the `match` SCRUTINEE rather than a `let` binding: a bare
 * `let r = @…` binds the UNWRAPPED value on success and terminates the body on
 * failure (`evalExpr`'s checkpointed-effect arm in
 * src/runtime/statement-executor.ts yields its `fail` flow), so the query's
 * `Result` is observable only where a `match` dispatches on it.
 */
const MATCH_ARM_THETA = [
  "---",
  "mode: prompt",
  "---",
  "subagent fn probe() {",
  "  let verdict = match @`Echo` {",
  '    Ok(_) => "UNEXPECTED_OK",',
  '    Err(QueryError { kind: "context_overflow", tokens_limit: 200000 }) => "OVF_LIMIT_200000",',
  '    Err(QueryError { kind: "context_overflow" }) => "OVF_NO_COUNTS",',
  '    Err(QueryError { kind: "transport" }) => "TRANSPORT",',
  '    Err(_) => "OTHER",',
  "  }",
  "  verdict",
  "}",
  "let out = probe()",
  "out",
  "",
].join("\n");

describe("bug 0182 — the off-session fold's fabricated httpStatus 200 vetoes the overflow-signature match", () => {
  /**
   * The verbatim live anthropic overflow `errorMessage`, copied from the pin
   * bug 0065's 0.100.0 run committed at
   * tests/binder-inference-provider-mapping.test.ts:942 (recorded from one real
   * `complete()` against `claude-haiku-4-5` with `"word ".repeat(220_000)` at
   * pi-ai 0.80.10, alongside `ONRESPONSE FIRINGS: []` and `STOPREASON: error`).
   * Whole-string numeric runs are SEVEN, so the counts asserted below can only
   * come from `extractOverflowTokens`'s provider-message window
   * (`prompt is too long: 220044 tokens > 200000 maximum`, exactly two runs).
   */
  const LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE =
    `400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}`;

  /** A `mistral`-row overflow body: that row's own signature is `/context.*length/i`. */
  const MISTRAL_OVERFLOW_MESSAGE = "the context length was exceeded";

  /** A resolved `mistral` off-session model; `.api` and `.provider` stay distinct. */
  const MISTRAL_MODEL = {
    id: "m3",
    api: "mistral",
    provider: "mistral-ai",
    strictCapable: true,
  };

  it("(0182 W1) untyped FREE-PHASE seam: the live anthropic overflow with no captured status is Err(context_overflow) carrying 220044/200000 — not Err(transport)", async () => {
    // The untyped `@`-query dispatches through
    // `OffSessionQueryModel.#driveFreePhaseRound`'s
    // `complete(model, …, { signal, …auth })`. NO firing is scripted because
    // that is the measured anthropic error-response shape
    // (`ONRESPONSE FIRINGS: []`): the seam's real classifier input is the
    // no-HTTP-response class `null`, the value provider-error-mapping.md:17
    // admits alongside HTTP 400. The fold sends 200 instead, and 200 is the one
    // value the gate refuses.
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err,
      "bug 0182: a genuine `prompt is too long` refusal must reach the author as " +
        "the ContextOverflowError variant carrying the two integers the provider " +
        "stated in its own message (QRY-10; queryerror-variants.md:125). " +
        'kind "transport" means the fold fabricated a captured 200 and the ' +
        "anthropic status gate vetoed the signature match on a status no " +
        `onResponse produced. observed: ${JSON.stringify(err)}`,
    ).toEqual({
      kind: "context_overflow",
      message: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE,
      tokens_used: 220044,
      tokens_limit: 200000,
      raw_response: null,
    });
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(0182 W2) typed FORCED-RESPOND seam: the same overflow on the respond dispatch is Err(context_overflow) carrying 220044/200000", async () => {
    // The second seam of the census. Reply 1 terminates the free phase cleanly,
    // so the overflow lands on `dispatchForcedRespondTurn`'s
    // `complete(model, …, { toolChoice, signal, …auth })` — the seam a
    // prompt-mode typed query also takes, carrying the whole accumulated query
    // window plus the QRY-15 template, which is the shape most likely to
    // overflow. Same fold, same fabricated status, so the fix is proven here and
    // not only at the free-phase dispatch.
    scripted.queue = [
      reply({ stopReason: "stop", text: "thinking" }),
      reply({ stopReason: "error", errorMessage: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err,
      "bug 0182: the forced respond dispatch classifies through the same fold, " +
        "so it must surface the same ContextOverflowError. observed: " +
        JSON.stringify(err),
    ).toEqual({
      kind: "context_overflow",
      message: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE,
      tokens_used: 220044,
      tokens_limit: 200000,
      raw_response: null,
    });
    expect(
      scripted.calls,
      "the free-phase call + the failing forced respond dispatch = exactly TWO",
    ).toBe(2);
  });

  it("(0182 W3) untyped, mistral (UNMEASURED): a context-length body with no captured status is Err(context_overflow) with both counts null", async () => {
    // WHY UNMEASURED. The `mistral` row moves with anthropic by SHARED-GATE
    // PARITY ONLY: both api values fall through to the single
    // `input.httpStatus === 400 || input.httpStatus === null` return in
    // `overflowStatusGateSatisfied`, so whatever that gate concedes to anthropic
    // it concedes to mistral by construction. NO `mistral` api provider exists
    // in the configured pi install (bug 0065 residual 3 — the install exposes
    // `anthropic-messages`, `openai-completions` and `openai-responses` only),
    // so whether the mistral adapter withholds `onResponse` on a 400 is NOT
    // claimed by this cell, which measures nothing live. Counts stay null on
    // every route: `mistral` is outside `TOKEN_EXTRACTING_APIS`.
    scripted.queue = [
      reply({
        stopReason: "error",
        errorMessage: MISTRAL_OVERFLOW_MESSAGE,
        api: "mistral",
      }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, MISTRAL_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err,
      "bug 0182: the mistral row shares the anthropic gate expression verbatim, " +
        "so it must share the widening the fold's fabricated 200 defeats " +
        `(provider-error-mapping.md:19). observed: ${JSON.stringify(err)}`,
    ).toEqual({
      kind: "context_overflow",
      message: MISTRAL_OVERFLOW_MESSAGE,
      tokens_used: null,
      tokens_limit: null,
      raw_response: null,
    });
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(0182 W4) the captured status is THREADED, not ignored: the same openai overflow bytes classify differently with and without a firing", async () => {
    // The threading witness. Both drives script the SAME `errorMessage`, api and
    // stop reason; the ONLY difference is whether the adapter reported a status.
    // `openai-completions`'s gate is `400 || (200 && stopReason "error")`, so a
    // captured 200 admits the match and no captured status refuses it
    // (provider-error-mapping.md:7 — the carve-out "does not extend to
    // `openai-completions`"). Two identical verdicts mean the fold never reads
    // the capture and the threading is dead code.
    scripted.queue = [
      reply({
        stopReason: "error",
        errorMessage: OPENAI_OVERFLOW_MESSAGE,
        api: "openai-completions",
        onResponseStatus: 200,
      }),
    ];
    const captured = expectErrQueryError(await driveTheta(UNTYPED_THETA, OPENAI_MODEL));

    // A fresh script for the second drive: the queue is per-drive and the call
    // count is asserted below, so both are reset rather than carried over.
    scripted.queue = [
      reply({
        stopReason: "error",
        errorMessage: OPENAI_OVERFLOW_MESSAGE,
        api: "openai-completions",
      }),
    ];
    scripted.calls = 0;
    const uncaptured = expectErrQueryError(await driveTheta(UNTYPED_THETA, OPENAI_MODEL));

    expect(
      captured.kind === uncaptured.kind,
      "bug 0182: the two drives differ in NOTHING but the adapter's `onResponse` " +
        "firing, so an identical verdict proves the fold decided on a status the " +
        `seam never captured. captured-200 verdict: ${JSON.stringify(captured)}; ` +
        `no-firing verdict: ${JSON.stringify(uncaptured)}`,
    ).toBe(false);
    expect(
      captured.kind,
      'a captured 200 with stopReason "error" is openai\'s body-envelope overflow ' +
        `arm (provider-error-mapping.md:18). observed: ${JSON.stringify(captured)}`,
    ).toBe("context_overflow");
    expect(
      uncaptured.kind,
      "no captured status is the network-level class, which openai's gate refuses " +
        `(provider-error-mapping.md:7). observed: ${JSON.stringify(uncaptured)}`,
    ).toBe("transport");
    expect(scripted.calls, "one provider call resolves the second drive").toBe(1);
  });

  it("(0182 W5) untyped, openai-completions: an HTTP-400 overflow — the measured no-firing shape — is Err(transport) with http_status null and retryable false", async () => {
    // REGRESSION BY HONESTY, and it is the SPECIFIED outcome rather than a
    // defect.
    // (a) MEASURED live: the `openai-completions` pi-ai adapter fires
    //     `onResponse` exactly once with `[200]` on a success and ZERO times on
    //     an HTTP 400 — on `openrouter/openai/gpt-3.5-turbo` a real overflow 400
    //     recorded `ONRESPONSE FIRINGS: []`, and a `temperature: 99` 400
    //     recorded `[]` as well. A real openai overflow 400 therefore reaches
    //     this seam with NO captured status, which is what this cell scripts.
    // (b) provider-error-mapping.md:7 states that outcome: the
    //     no-captured-status carve-out "does not extend to `openai-completions`,
    //     whose gate admits only a captured status — HTTP 400, or HTTP 200
    //     resolving with `stopReason: \"error\"`", so "a no-status
    //     `openai-completions` response classifies as network-level even when
    //     its `errorMessage` carries overflow wording". The fold's fabricated
    //     200 masked that by satisfying the gate's second half with a status the
    //     seam never had.
    // (c) The openai HTTP-200 body-envelope arm is UNAFFECTED: a real 200 does
    //     fire, which is why cell (v) above scripts the firing and keeps its
    //     `context_overflow` assertion.
    scripted.queue = [
      reply({
        stopReason: "error",
        errorMessage: OPENAI_OVERFLOW_MESSAGE,
        api: "openai-completions",
      }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, OPENAI_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err,
      "bug 0182: with no captured status openai's gate refuses the signature " +
        "match, and the fold's pinned surface publishes `http_status: null` / " +
        `\`retryable: false\` regardless. observed: ${JSON.stringify(err)}`,
    ).toEqual({
      kind: "transport",
      message: OPENAI_OVERFLOW_MESSAGE,
      http_status: null,
      provider: "openai-completions",
      retryable: false,
    });
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(0182 W6 control) non-perturbation: a NON-overflow error-stop renders a byte-identical leaf with and without a captured 500", async () => {
    // §Fix constraint 2: threading the captured status must move no non-overflow
    // outcome. A captured 500 would make the classifier's OWN verdict
    // `http_status: 500` / `retryable: true` (`transportRetryable`), so this pair
    // proves the fold still overwrites both fields with its pinned values
    // (PIC-51 / conversation-drive.md:16) rather than publishing what it
    // captured.
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE, onResponseStatus: 500 }),
    ];
    const withCapture = expectErrQueryError(await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL));

    scripted.queue = [reply({ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE })];
    scripted.calls = 0;
    const withoutCapture = expectErrQueryError(await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL));

    expect(
      withCapture,
      "a captured status must not leak into the fold's transport surface. " +
        `captured-500 leaf: ${JSON.stringify(withCapture)}; no-firing leaf: ` +
        JSON.stringify(withoutCapture),
    ).toEqual(withoutCapture);
    expect(
      withCapture,
      `the pinned off-session transport surface. observed: ${JSON.stringify(withCapture)}`,
    ).toEqual({
      kind: "transport",
      message: AUTH_ERROR_MESSAGE,
      http_status: null,
      provider: "anthropic-messages",
      retryable: false,
    });
  });

  it("(0182 W7 control) the `length` stop-reason arm stays reachable and status-blind, even under a captured 400", async () => {
    // §Fix constraint 4: `classifyProviderResponse`'s `length` arm reads no
    // status (provider-error-mapping.md:31), so threading the captured value
    // must not move it — the variant's other off-session route keeps working,
    // counts null and `raw_response` carrying the partial text.
    scripted.queue = [
      reply({ stopReason: "length", text: "partial answer", onResponseStatus: 400 }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err,
      "the output-boundary terminator classifies on the stop reason alone. " +
        `observed: ${JSON.stringify(err)}`,
    ).toEqual({
      kind: "context_overflow",
      message: "",
      tokens_used: null,
      tokens_limit: null,
      raw_response: "partial answer",
    });
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(0182 W8) the AUTHOR'S match arm: a theta matching the query Result renders OVF_LIMIT_200000, never TRANSPORT", async () => {
    // The most faithful witness — the whole point of the variant is the arm an
    // author writes, and `MATCH_ARM_THETA` renders one deterministic token per
    // verdict so the observable is that DISPATCH rather than a field the test
    // reads itself. All four `Err` arms are live: the `length`-stop route
    // renders `OVF_NO_COUNTS` through the same theta (cell W7's classification),
    // so `OVF_LIMIT_200000` is reachable only when both the variant AND the
    // extracted `tokens_limit` are right.
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(MATCH_ARM_THETA, ANTHROPIC_MODEL);

    expect(
      execution.outcome,
      `the drive must complete; observed error: ${JSON.stringify(execution.error)}`,
    ).toBe("success");
    expect(
      execution.result.value,
      'bug 0182: the author\'s `Err(QueryError { kind: "context_overflow", ' +
        "tokens_limit: 200000 })` arm must be the arm that runs on a real " +
        "anthropic overflow. `TRANSPORT` means the fabricated 200 sent the author " +
        "down the transport arm with both counts gone; `OVF_NO_COUNTS` means the " +
        "variant matched but the counts were dropped. observed final value: " +
        JSON.stringify(execution.result.value),
    ).toBe("OVF_LIMIT_200000");
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });
});
