// Bug 0291 — `classifyOffSessionReply`'s transport fold discards the
// classifier's `http_status` / `retryable` verdict and pins the two
// author-visible fields to the literals `http_status: null` / `retryable: false`
// for every non-overflow classification
// (src/extension/production-theta-producer.ts, `classifyOffSessionReply`
// transport arm — the literal `http_status: null` / `retryable: false` return).
//
// docs/bugs/0291-off-session-transport-fold-pins-retryable-false.md
// (Mechanism 1, recommended): the fold calls `classifyProviderResponse` with
// the REAL captured HTTP status (`httpStatus: captured?.status ?? null`, bug
// 0182), which populates `http_status: input.httpStatus` and
// `retryable: transportRetryable(input.httpStatus)` per
// provider-error-mapping.md:13 — then throws both away and republishes the
// pinned literals. So the spec-prescribed values are author-unreachable at
// every off-session seam:
//   - provider-error-mapping.md:7 — the no-HTTP-response (network-level) class
//     "routes through `TransportError { retryable: true, http_status: null }`".
//   - provider-error-mapping.md:13 — `retryable` is `true` for network-level,
//     HTTP 5xx and HTTP 429; `false` for every other captured status; and a
//     captured status is carried in `http_status`.
//
// This suite pins the SPEC behaviour (RED at HEAD for the flip cells, GREEN for
// the controls), asserting the AUTHOR-VISIBLE leaf `QueryError` the theta
// observes across the `?`-propagated FN-6 boundary — the same observable, and
// the same harness, as tests/off-session-transport-classification.test.ts,
// whose scaffolding (the `vi.hoisted` scripted queue, the `vi.mock` of
// `@earendil-works/pi-ai/compat`'s `complete`, `reply()`, `driveTheta()`,
// `expectErrQueryError()`) this file copies unchanged. This is a NEW additive
// witness; it edits no existing test.
//
// Spec: provider-error-mapping.md:7 (§Classifier input surface — the
// no-HTTP-response routing sentence), :13 (§`TransportError.retryable`
// population — the retryable class rule and the captured-status carry);
// errors-and-results/queryerror-variants.md (`retryable` populated by
// transport-error class; `http_status` null only on network-level failure);
// conversation-drive.md (PIC-50 — the off-session `complete()` call's provider
// failures are classified "exactly as the binder's `complete()` call is").

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The scripted off-session reply QUEUE (mirrors
// tests/off-session-transport-classification.test.ts). `vi.hoisted` so the
// `vi.mock` factory can close over a mutable holder each test sets. One reply
// is consumed per `complete()` call, in order.
const scripted = vi.hoisted(() => ({
  queue: [] as unknown[],
  calls: 0,
  // Bug 0182: the per-reply `onResponse` firing directive — the HTTP status the
  // adapter reports for THAT reply, keyed by the reply object. A SIDE TABLE so
  // every scripted reply stays a pure `AssistantMessage` shape on the surface
  // production code reads.
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
        // Last entry sticky: a drive that issues MORE calls than scripted keeps
        // observing the terminal reply (a dead provider keeps failing).
        const entry = scripted.queue[Math.min(index, scripted.queue.length - 1)];
        // Bug 0182: a consumed entry that scripts a status fires the CALLER's
        // `onResponse` exactly once before the reply resolves — the pi-ai
        // adapters' own order. A caller that registers none observes nothing;
        // scripting none reproduces the adapters' measured no-firing shape.
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
import { respondSchemaSlug } from "../src/runtime/typed-query-validation";
import type { ThetaSource } from "../src/lexer/lexer";
import type { ModelReferenceMatcher } from "../src/parser/frontmatter";
import type { SystemNoteChannelDeps } from "../src/extension/system-note-channel";

// --- Scripted provider failure texts (non-overflow) --------------------------

/** A generic non-overflow transport `errorMessage` (network-level class). */
const TRANSPORT_ERROR_MESSAGE = "provider unavailable";

/**
 * A clearly NON-overflow HTTP-400 body wording: matches no provider overflow
 * signature, so a captured 400 classifies as transport (the class-sensitivity
 * CONTROL of cell (D)), never as ContextOverflowError.
 */
const NONOVERFLOW_400_MESSAGE = "invalid request error";

// --- The resolved off-session model ------------------------------------------
// DISTINCT `.api` / `.provider` so the TransportError.provider assertion
// (provider is the resolved model's API-shaped `.api`) catches a wrong read.

const ANTHROPIC_MODEL = {
  id: "m1",
  api: "anthropic-messages",
  provider: "anthropic",
  strictCapable: true,
};

// --- Scripted assistant replies (mirrors the sibling harness) ----------------

/**
 * An `AssistantMessage`-shaped reply for the mocked `complete()`. `text`
 * undefined scripts EMPTY content (the usual error-stop shape); a string
 * scripts one text part. `toolCalls` scripts pi-ai `ToolCall` content parts.
 * `onResponseStatus` is the HTTP status the adapter reports through
 * `onResponse` for this reply; OMITTED means the adapter never fires — the
 * measured no-HTTP-response class (`httpStatus: null`).
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
 * The `Verdict` respond-tool name, derived through the SAME production
 * collaborators the runtime uses, so cell (F) scripts its forced respond
 * ToolCall against the contract, not a copied constant.
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
  return `__theta_respond_${respondSchemaSlug(lowered)}`;
}

// --- The driven thetas (identical shape to the sibling harness) --------------

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

// --- Harness (copied from tests/off-session-transport-classification.test.ts) -

function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}

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

function ajv(): AjvSchemaValidator {
  const slugOf = (schema: LoweredSchema): SchemaSlug => ({
    slug: JSON.stringify(schema),
    canonicalBytes: JSON.stringify(schema),
  });
  return new AjvSchemaValidator({ emit: () => {}, slugOf });
}

function rootDouble(): RuntimeRoot {
  return {
    checkpoint: { before: (): Promise<void> => Promise.resolve() },
    idSource: { newInvocationId: (): string => "inv-1", newToolCallId: (): string => "tc-1" },
    clock: { wallNow: (): number => 0 },
    schemaValidator: ajv(),
  } as unknown as RuntimeRoot;
}

function ctxDouble(model: unknown): ExtensionCommandContext {
  return {
    model,
    sessionManager: { getEntries: (): readonly unknown[] => [], getLeafId: (): undefined => undefined },
  } as unknown as ExtensionCommandContext;
}

async function driveTheta(source: string, model: unknown): Promise<BodyExecution> {
  const doc = parse(source);
  const theta: ThetaCompositionInput = {
    slashName: "probe",
    sourcePath: "/theta/probe.theta",
    frontmatter: doc.frontmatter!,
    body: doc.body,
  };
  const deps = createProductionProducerDeps({
    pi: { sendMessage: () => {}, registerTool: () => {} } as unknown as ExtensionAPI,
    root: rootDouble(),
    modelRegistry: {} as unknown as ModelRegistry,
  });
  const binding = deps.bindPromptConversation({ theta, args: "", ctx: ctxDouble(model) });
  return executeBody(theta.body, binding.executeDeps);
}

/**
 * Dig the author-visible leaf `QueryError` out of a drive's final value: the
 * `?`-propagated leaf crosses the `subagent fn` boundary wrapped as
 * `invoke_callee` (FN-6). Strict — fails loudly when the shape is anything else.
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
    "the author-visible final value must be the Err Result carrying the QueryError; " +
      `observed final value: ${JSON.stringify(value)}`,
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
// bug 0291 (RED) — the off-session transport fold must thread the classifier's
// own `http_status` / `retryable` verdict, not pin `null` / `false`.
// ===========================================================================

describe("bug 0291 (RED) — off-session transport fold threads classifier http_status/retryable", () => {
  it("(A) b0291 untyped free-phase, no captured status: the no-HTTP-response class carries http_status null AND retryable true", async () => {
    // No `onResponseStatus` — the measured off-session error-response shape
    // (`onResponse` never fires), i.e. the network-level class. HEAD pins
    // `retryable: false`; provider-error-mapping.md:7 routes this class through
    // `TransportError { retryable: true, http_status: null }`.
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: TRANSPORT_ERROR_MESSAGE }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.http_status,
      "bug 0291: the no-HTTP-response class has no captured status — http_status null " +
        "(provider-error-mapping.md:7)",
    ).toBeNull();
    expect(
      err.retryable,
      "bug 0291: the no-HTTP-response (network-level) class routes through " +
        "`retryable: true` (provider-error-mapping.md:7/:13); HEAD pins the fold to false",
    ).toBe(true);
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(B) b0291 untyped free-phase, captured HTTP 500: http_status 500 AND retryable true (5xx)", async () => {
    // A captured 5xx. provider-error-mapping.md:13 assigns 5xx `retryable: true`
    // and carries the captured status in `http_status`; HEAD discards both.
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: TRANSPORT_ERROR_MESSAGE, onResponseStatus: 500 }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.http_status,
      "bug 0291: the captured 500 is carried in http_status (provider-error-mapping.md:13); " +
        "HEAD pins the fold to null",
    ).toBe(500);
    expect(
      err.retryable,
      "bug 0291: HTTP 5xx is `retryable: true` (provider-error-mapping.md:13); HEAD pins the fold to false",
    ).toBe(true);
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(C) b0291 untyped free-phase, captured HTTP 429: http_status 429 AND retryable true", async () => {
    // A captured 429 rate-limit. provider-error-mapping.md:13 assigns 429
    // `retryable: true` and carries the status; HEAD discards both.
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: TRANSPORT_ERROR_MESSAGE, onResponseStatus: 429 }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.http_status,
      "bug 0291: the captured 429 is carried in http_status (provider-error-mapping.md:13); " +
        "HEAD pins the fold to null",
    ).toBe(429);
    expect(
      err.retryable,
      "bug 0291: HTTP 429 is `retryable: true` (provider-error-mapping.md:13); HEAD pins the fold to false",
    ).toBe(true);
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(D) b0291 class-sensitivity CONTROL — captured HTTP 400 non-overflow: http_status 400 AND retryable false", async () => {
    // The control proving the flip is CLASS-SENSITIVE: a non-429 4xx stays
    // `retryable: false` (provider-error-mapping.md:13) while 500/429 above flip
    // to true. The `errorMessage` matches no overflow signature, so the 400
    // classifies as transport, not context_overflow. HEAD pins http_status to
    // null (RED) but already agrees on retryable false (GREEN both directions).
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: NONOVERFLOW_400_MESSAGE, onResponseStatus: 400 }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.http_status,
      "bug 0291: the captured 400 is carried in http_status (provider-error-mapping.md:13); " +
        "HEAD pins the fold to null",
    ).toBe(400);
    expect(
      err.retryable,
      "bug 0291: a non-429 4xx is `retryable: false` (provider-error-mapping.md:13) — the " +
        "flip must NOT make 400 retryable; GREEN both directions",
    ).toBe(false);
    expect(scripted.calls, "one provider call resolves the untyped query").toBe(1);
  });

  it("(F) b0291 typed FORCED-RESPOND seam, captured HTTP 503: the SAME fold threads http_status 503 AND retryable true at the respond dispatch", async () => {
    // Reply 1 terminates the free phase cleanly, so the failure lands on
    // `dispatchForcedRespondTurn`'s `complete()` — the seam a prompt-mode typed
    // query also takes. This proves the fold threads at the typed forced-respond
    // seam, not only the untyped free-phase seam. provider-error-mapping.md:13
    // assigns 5xx `retryable: true` and carries the captured 503; HEAD pins both.
    scripted.queue = [
      reply({ stopReason: "stop", text: "thinking" }),
      reply({ stopReason: "error", errorMessage: "boom", onResponseStatus: 503 }),
    ];

    const execution = await driveTheta(TYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.http_status,
      "bug 0291: the forced-respond dispatch's captured 503 is carried in http_status " +
        "(provider-error-mapping.md:13); HEAD pins the fold to null",
    ).toBe(503);
    expect(
      err.retryable,
      "bug 0291: HTTP 5xx at the forced-respond seam is `retryable: true` " +
        "(provider-error-mapping.md:13); HEAD pins the fold to false",
    ).toBe(true);
    expect(
      scripted.calls,
      "the free-phase call + the failing forced respond dispatch = exactly TWO",
    ).toBe(2);
  });
});

// ===========================================================================
// bug 0291 (GREEN controls) — the fields the fix must NOT move, and the fence.
// ===========================================================================

describe("bug 0291 (GREEN controls) — overflow arm, non-flip fields, on-session fence", () => {
  it("(E) b0291 overflow arm untouched: a stopReason 'length' reply stays Err(context_overflow)", async () => {
    // The overflow arm is passed through the fold verbatim and is NOT touched by
    // Mechanism 1 (which only replaces the transport arm's literals). GREEN at
    // HEAD and post-fix — the byte-identical control proving the fix's blast
    // radius excludes the overflow path.
    scripted.queue = [reply({ stopReason: "length", text: "partial answer" })];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(
      err.kind,
      "bug 0291: the overflow arm is passed through untouched by the transport-arm fix " +
        `(provider-error-mapping.md §Stop-reason classification); observed: ${JSON.stringify(err)}`,
    ).toBe("context_overflow");
  });

  it("(H) b0291 non-flip fields: for a captured-500 error-stop, message and provider stay byte-preserved", async () => {
    // Only `http_status` / `retryable` move under the fix; `message` and
    // `provider` are byte-identical. GREEN both directions — this guards the
    // fields the flip must NOT perturb (provider is the resolved model's
    // API-shaped `.api`, queryerror-variants.md provider derivation).
    scripted.queue = [
      reply({ stopReason: "error", errorMessage: TRANSPORT_ERROR_MESSAGE, onResponseStatus: 500 }),
    ];

    const execution = await driveTheta(UNTYPED_THETA, ANTHROPIC_MODEL);

    const err = expectErrQueryError(execution);
    expect(err.kind, `observed: ${JSON.stringify(err)}`).toBe("transport");
    expect(
      err.message,
      "bug 0291: only http_status/retryable move — the provider's errorMessage is byte-preserved",
    ).toBe(TRANSPORT_ERROR_MESSAGE);
    expect(
      err.provider,
      "bug 0291: provider is the resolved model's API-shaped `.api` value " +
        "(queryerror-variants.md provider derivation), byte-preserved across the flip",
    ).toBe("anthropic-messages");
  });

  it("(G) b0291 NON-GOAL fence (reference cell): the on-session prompt-mode transport surface is out of scope and stays null/false — discharged elsewhere, not by this off-session harness", async () => {
    // Bug 0291 §Non-goals: the on-session prompt-mode pins
    // (prompt-transport-mapping.ts, PIC-50/PIC-51/PIC-51b/PIC-70) are
    // spec-stated for a surface with no captured status and are NOT touched by
    // this fix. This off-session `complete()`-based harness cannot reach that
    // on-session `sendUserMessage` seam, so — per the task's (G) instruction —
    // NO on-session drive is fabricated here. The fence that the on-session
    // prompt-mode surface stays `http_status: null` / `retryable: false` is
    // discharged by two existing offline suites, referenced (not re-driven):
    //   - the (g-control) cell in tests/typed-two-phase-live.test.ts
    //     (complete() count 0, http_status null, retryable false), and
    //   - tests/prompt-transport-mapping.test.ts (V9n-T PIC-51/PIC-50 cells).
    // This cell asserts only that those authorities exist and still pin the
    // fence — a real, non-vacuous observable — and asserts nothing about an
    // on-session drive.
    const { readFileSync } = await import("node:fs");
    const gControl = readFileSync(
      new URL("./typed-two-phase-live.test.ts", import.meta.url),
      "utf8",
    );
    expect(
      gControl.includes("complete() count 0 (PIC-51 unchanged)"),
      "bug 0291 §Non-goals: the on-session prompt-mode fence stays discharged by the " +
        "(g-control) cell in tests/typed-two-phase-live.test.ts",
    ).toBe(true);
    const promptMapping = readFileSync(
      new URL("./prompt-transport-mapping.test.ts", import.meta.url),
      "utf8",
    );
    expect(
      promptMapping.includes("PIC-51 prompt-mode stopReason:'error' transport mapping"),
      "bug 0291 §Non-goals: the on-session prompt-mode transport surface is pinned by " +
        "tests/prompt-transport-mapping.test.ts, not touched by this off-session fix",
    ).toBe(true);
  });
});
