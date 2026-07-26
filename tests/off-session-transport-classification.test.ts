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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session reply QUEUE. `vi.hoisted` so the `vi.mock` factory
// (hoisted above the imports) can close over a mutable holder each test sets.
// One reply is consumed per `complete()` call, in order.
const scripted = vi.hoisted(() => ({
  queue: [] as unknown[],
  calls: 0,
}));

// Replace ONLY the off-session `complete()` free function; every other pi-ai
// export passes through unchanged.
vi.mock("@earendil-works/pi-ai/compat", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    complete: vi.fn(async () => {
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
      return scripted.queue[Math.min(index, scripted.queue.length - 1)];
    }),
  };
});

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
  type ThetaDocument,
} from "../src/parser/theta-document";
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
 */
function reply(fields: {
  readonly stopReason: string;
  readonly text?: string;
  readonly errorMessage?: string;
  readonly api?: string;
}): unknown {
  return {
    role: "assistant",
    content: fields.text !== undefined ? [{ type: "text", text: fields.text }] : [],
    api: fields.api ?? "anthropic-messages",
    stopReason: fields.stopReason,
    ...(fields.errorMessage !== undefined ? { errorMessage: fields.errorMessage } : {}),
    timestamp: 0,
  };
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
    pi: { sendMessage: () => {} } as unknown as ExtensionAPI,
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
    // envelopes (provider-error-mapping.md §Overflow signatures); anthropic's
    // gate is 400-only and unobservable at this seam, hence openai here.
    // Today: fabricated success — final value "".
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
      err.kind,
      "the overflow-signature match takes precedence over the stop-reason transport " +
        `arm — context_overflow, NOT transport; observed: ${JSON.stringify(err)}`,
    ).toBe("context_overflow");
  });

  it("(vi) typed: an error-stop on the forced respond turn is Err(transport) IMMEDIATELY — complete() called exactly ONCE, no respond-repair re-drives", async () => {
    // Today: the transport failure is laundered into the schema-validation
    // channel — Err(ValidationError { cause: "schema_validation" }) after
    // 1 (forced respond) + respond_repair.attempts (default 3) = 4 complete()
    // calls, each follow-up re-driving the dead provider and debiting an
    // attempts slot the spec says a transport failure must not consume.
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err.kind,
      "the forced-respond provider failure classifies as transport — never laundered " +
        `into the validation channel; observed: ${JSON.stringify(err)}`,
    ).toBe("transport");
    expect(err.message, "the provider's errorMessage is carried").toBe(AUTH_ERROR_MESSAGE);
    expect(
      scripted.calls,
      "the transport failure terminates the typed query at the forced-respond turn: " +
        "exactly ONE complete() call — no respond-repair re-drives (today: 4 calls)",
    ).toBe(1);
  });

  it("(vii) typed: a respond-repair FOLLOW-UP transport failure terminates repair and propagates — complete() called exactly TWICE", async () => {
    // First reply: a clean stop turn whose text does NOT validate against
    // `Verdict` (opens respond-repair). Second reply: the follow-up's provider
    // failure. query-failure-and-repair.md §respond-repair: a follow-up's
    // non-validation failure propagates as its QueryError variant and
    // terminates respond-repair immediately, consuming no attempts slot.
    // Today: repair burns ALL attempts against the dead provider —
    // 1 + 3 = 4 complete() calls — and returns Err(ValidationError).
    scripted.queue = [
      reply({ stopReason: "stop", text: "not json at all" }),
      reply({ stopReason: "error", errorMessage: AUTH_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err.kind,
      "the follow-up's transport failure propagates as the query's Err — never the " +
        `terminal validation misattribution; observed: ${JSON.stringify(err)}`,
    ).toBe("transport");
    expect(err.message, "the follow-up failure's errorMessage is carried").toBe(
      AUTH_ERROR_MESSAGE,
    );
    expect(
      scripted.calls,
      "repair terminates at the follow-up's transport failure: the original " +
        "forced-respond call + ONE follow-up = exactly TWO complete() calls " +
        "(today: 4 — the full attempts budget burned against a dead provider)",
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

  it("(b) typed: a clean stop turn with schema-valid JSON resolves the parsed value — complete() called once", async () => {
    scripted.queue = [reply({ stopReason: "stop", text: '{"score": 7}' })];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    expect(execution.outcome, "a schema-valid typed reply succeeds").toBe("success");
    expect(
      execution.result.value,
      "the forced-respond JSON parses and validates against `Verdict`, and the parsed " +
        "value flows out as the final value",
    ).toEqual({ score: 7 });
    expect(scripted.calls, "one forced-respond call; no repair follow-ups").toBe(1);
  });
});
