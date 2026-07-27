import { describe, expect, it } from "vitest";
import { Type } from "typebox";
import type { Api, Model, ProviderResponse } from "@earendil-works/pi-ai";
import {
  BINDER_MESSAGE_CONTENT,
  BINDER_TOOL_DESCRIPTION,
  binderToolName,
  buildBinderCompleteCall,
  type BinderCompleteCallInput,
} from "../src/binder/binder-inference";
import {
  TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE,
  checkTypedQueryProviderSupport,
  classifyProviderResponse,
  synthesizeUnsupportedProviderTransportError,
  type ProviderClassifierInput,
} from "../src/binder/provider-error-mapping";
import type {
  ContextOverflowError,
  TransportError,
} from "../src/runtime/query-error";
import type { BinderEnvelopeSchema } from "../src/binder/binder-envelope";

// V9j-T — failing tests for the paired `V9j` "Binder inference call and
// provider-error mapping". Closes the code-keyed obligation areas `cka-34`
// (binder-inference.md §Binder inference call) and `cka-35`
// (provider-error-mapping.md §Provider error mapping / seed-field mapping), and
// supplies the asserting test for the load warning code
// `theta/load/typed-query-unsupported-provider`.
//
// Each test reds on its own primary assertion because the V9j behaviour is
// absent: `classifyProviderResponse` returns a sentinel `CancelledError` (never
// a `transport` / `context_overflow` variant), `buildBinderCompleteCall`
// returns an inert triple (no forced tool, no `temperature`, no seed, no
// signal, no `onResponse`, no user message), `checkTypedQueryProviderSupport`
// returns a non-matching sentinel diagnostic, and
// `synthesizeUnsupportedProviderTransportError` returns a wrong sentinel. No
// test reds on a compile error, a missing fixture, or a harness throw.
//
// Spec: pi-integration-contract/binder-inference.md,
// pi-integration-contract/provider-error-mapping.md,
// pi-integration-contract/conversation-drive.md §"Provider compatibility for
// typed queries"; diagnostic code/message from diagnostics/code-registry-load.md.

// --- helpers ----------------------------------------------------------------

/** A minimal `Model<Api>` fixture; only `.api` is read by the seam under test. */
function modelOf(api: string): Model<Api> {
  return { api } as unknown as Model<Api>;
}

function classify(
  overrides: Partial<ProviderClassifierInput> & { api: string },
): ProviderClassifierInput {
  return {
    httpStatus: null,
    stopReason: "error",
    ...overrides,
  };
}

// ============================================================================
// Bullet 1 — the provider classifier (cka-35, provider-error-mapping.md)
// ============================================================================

describe("V9j-T — provider classifier → QueryError (cka-35)", () => {
  // --- context-overflow signatures per provider ---------------------------

  it("cka-35: anthropic-messages HTTP 400 overflow signature → ContextOverflowError", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage: "prompt is too long for this model",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
    // No numeric runs in the message → both token counts null.
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  it("cka-35: openai-completions HTTP 400 context_length_exceeded → ContextOverflowError", () => {
    const result = classifyProviderResponse(
      classify({
        api: "openai-completions",
        httpStatus: 400,
        errorMessage:
          "context_length_exceeded: requested 100000 tokens, maximum 8192",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
    expect(result.tokens_used).toBe(100000);
    expect(result.tokens_limit).toBe(8192);
  });

  it("cka-35: openai-completions HTTP 200 stopReason error overflow → ContextOverflowError (200 body-envelope branch)", () => {
    // Overflow-signature precedence: a 200 resolving with stopReason "error"
    // whose errorMessage matches the openai overflow regex classifies as
    // ContextOverflowError, not TransportError.
    const result = classifyProviderResponse(
      classify({
        api: "openai-completions",
        httpStatus: 200,
        stopReason: "error",
        errorMessage: "maximum context length exceeded",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
  });

  it("cka-35: mistral HTTP 400 context-length body → ContextOverflowError, token counts null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "mistral",
        httpStatus: 400,
        errorMessage: "the context length was exceeded",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  it("cka-35: amazon-bedrock ValidationException overflow with no HTTP response → ContextOverflowError (signature precedence over network-level)", () => {
    // An SDK-only provider that resolves with stopReason "error" and no
    // onResponse (httpStatus null) is network-level UNLESS its errorMessage
    // matches the bedrock overflow signature, which takes precedence.
    const result = classifyProviderResponse(
      classify({
        api: "amazon-bedrock",
        httpStatus: null,
        stopReason: "error",
        errorMessage: "ValidationException: input is too long for requested model",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  it("cka-35: mistral-conversations alias — HTTP 400 context-length body → ContextOverflowError (bug 0010 fix round 2: the pinned KnownApi spelling shares mistral's signature row)", () => {
    // At the SDK pin the Mistral provider registers as `mistral-conversations`
    // with the same adapter module and error formatter as the documented
    // `mistral` name, so the overflow signature must classify identically
    // under either spelling.
    const result = classifyProviderResponse(
      classify({
        api: "mistral-conversations",
        httpStatus: 400,
        errorMessage: "the context length was exceeded",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  it("cka-35: bedrock-converse-stream alias — ValidationException overflow, no HTTP response → ContextOverflowError (bug 0010 fix round 2: signature precedence under the pinned KnownApi spelling)", () => {
    const result = classifyProviderResponse(
      classify({
        api: "bedrock-converse-stream",
        httpStatus: null,
        stopReason: "error",
        errorMessage: "ValidationException: input is too long for requested model",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  it("cka-35: mistral-conversations alias — a NON-overflow 400 stays transport (the alias adds the signature row, not a blanket reclassification)", () => {
    const result = classifyProviderResponse(
      classify({
        api: "mistral-conversations",
        httpStatus: 400,
        errorMessage: "invalid request: bad tool schema",
      }),
    );
    expect(result.kind).toBe("transport");
  });

  // --- deterministic overflow token-count extraction ----------------------

  it("cka-35: two numeric runs populate tokens_used (larger) and tokens_limit (smaller)", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage:
          "maximum context length exceeded: requested 1,234,567 tokens, limit 200,000",
      }),
    ) as ContextOverflowError;
    expect(result.tokens_used).toBe(1234567);
    expect(result.tokens_limit).toBe(200000);
  });

  it("cka-35: adjacent stray separators split into two runs (\"1,,234\" → 1 and 234)", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage: "maximum context length exceeded (1,,234)",
      }),
    ) as ContextOverflowError;
    expect(result.tokens_used).toBe(234);
    expect(result.tokens_limit).toBe(1);
  });

  it("cka-35: a single numeric run falls back to null/null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage: "maximum context length exceeded: 5000 tokens",
      }),
    ) as ContextOverflowError;
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  it("cka-35: three or more numeric runs fall back to null/null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage: "maximum context length exceeded: a 1 b 2 c 3",
      }),
    ) as ContextOverflowError;
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  // --- stop-reason classification (HTTP 200, no error envelope) ------------

  it("cka-35: HTTP 200 stopReason \"length\" → ContextOverflowError with null token counts", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 200,
        stopReason: "length",
      }),
    ) as ContextOverflowError;
    expect(result.kind).toBe("context_overflow");
    expect(result.tokens_used).toBeNull();
    expect(result.tokens_limit).toBeNull();
  });

  it("cka-35: HTTP 200 unrecognised stop reason → TransportError retryable false", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 200,
        stopReason: "content_filter",
      }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(false);
    expect(result.http_status).toBe(200);
  });

  // --- TransportError.retryable population by transport-error class --------

  it("cka-35: HTTP 5xx non-overflow → TransportError retryable true", () => {
    const result = classifyProviderResponse(
      classify({
        api: "openai-completions",
        httpStatus: 503,
        errorMessage: "internal server error",
      }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(true);
    expect(result.http_status).toBe(503);
    expect(result.provider).toBe("openai-completions");
  });

  it("cka-35: HTTP 429 → TransportError retryable true", () => {
    const result = classifyProviderResponse(
      classify({ api: "anthropic-messages", httpStatus: 429, errorMessage: "rate limited" }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(true);
    expect(result.http_status).toBe(429);
  });

  it("cka-35: non-429 HTTP 4xx non-overflow → TransportError retryable false", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage: "invalid request: unknown field",
      }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(false);
    expect(result.http_status).toBe(400);
  });

  it("cka-35: HTTP 200 non-overflow body-envelope error → TransportError retryable false", () => {
    const result = classifyProviderResponse(
      classify({
        api: "openai-completions",
        httpStatus: 200,
        stopReason: "error",
        errorMessage: "the server had an error processing your request",
      }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(false);
    expect(result.http_status).toBe(200);
  });

  it("cka-35: network-level failure (no HTTP response) → TransportError retryable true, http_status null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: null,
        stopReason: "error",
        errorMessage: "ECONNRESET",
      }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(true);
    expect(result.http_status).toBeNull();
  });

  it("cka-35: a non-200 2xx (204) → TransportError retryable false", () => {
    const result = classifyProviderResponse(
      classify({ api: "mistral", httpStatus: 204, errorMessage: "no content" }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(false);
    expect(result.http_status).toBe(204);
  });

  it("cka-35: a surfaced 3xx (302) → TransportError retryable false", () => {
    const result = classifyProviderResponse(
      classify({ api: "mistral", httpStatus: 302, errorMessage: "found" }),
    ) as TransportError;
    expect(result.kind).toBe("transport");
    expect(result.retryable).toBe(false);
    expect(result.http_status).toBe(302);
  });
});

// ============================================================================
// Bullet 2 — the complete() forced-tool envelope (cka-34, binder-inference.md)
// ============================================================================

describe("V9j-T — complete() binder envelope (cka-34)", () => {
  const envelope: BinderEnvelopeSchema = {
    anyOf: [
      {
        type: "object",
        properties: { kind: { const: "ok" } },
        required: ["kind"],
      },
    ],
  };

  function callInput(
    api: string,
    seed: number,
  ): BinderCompleteCallInput {
    return {
      model: modelOf(api),
      systemPrompt: "You are the binder.",
      envelopeSchema: envelope,
      slug: "triage",
      seed,
      signal: new AbortController().signal,
      onResponse: (_response: ProviderResponse, _model: Model<Api>) => {},
    };
  }

  it("cka-34: context.messages carries the fixed single user message literal", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    expect(call.context.messages).toHaveLength(1);
    const message = call.context.messages[0];
    expect(message?.role).toBe("user");
    expect(message && "content" in message ? message.content : undefined).toBe(
      BINDER_MESSAGE_CONTENT,
    );
  });

  it("cka-34: context.systemPrompt is the rendered binder system prompt", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    expect(call.context.systemPrompt).toBe("You are the binder.");
  });

  it("cka-34: context.tools carries exactly the forced structured-output tool", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    expect(call.context.tools).toHaveLength(1);
    const tool = call.context.tools?.[0];
    expect(tool?.name).toBe(binderToolName("triage"));
    expect(tool?.description).toBe(BINDER_TOOL_DESCRIPTION);
    // parameters is the envelope schema wrapped as `Type.Unsafe<unknown>`.
    expect(tool?.parameters).toEqual(Type.Unsafe(envelope));
  });

  it("cka-34: options force the tool choice to the single binder tool", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    const options = call.options as Record<string, unknown>;
    expect(options["toolChoice"]).toEqual({
      type: "tool",
      name: binderToolName("triage"),
    });
  });

  it("cka-34: options.temperature is 0", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    expect(call.options.temperature).toBe(0);
  });

  it("cka-34: options.signal is the supplied thetaAbort signal", () => {
    const input = callInput("anthropic-messages", 7);
    const call = buildBinderCompleteCall(input);
    expect(call.options.signal).toBe(input.signal);
  });

  it("cka-34: options.onResponse is the supplied provider-response capture callback", () => {
    const input = callInput("anthropic-messages", 7);
    const call = buildBinderCompleteCall(input);
    expect(call.options.onResponse).toBe(input.onResponse);
  });

  // --- provider seed-field mapping (provider-error-mapping.md) -------------

  it("cka-35: openai-completions maps the seed under the `seed` field", () => {
    const call = buildBinderCompleteCall(callInput("openai-completions", 42));
    const options = call.options as Record<string, unknown>;
    expect(options["seed"]).toBe(42);
  });

  it("cka-35: mistral maps the seed under the `random_seed` field", () => {
    const call = buildBinderCompleteCall(callInput("mistral", 42));
    const options = call.options as Record<string, unknown>;
    expect(options["random_seed"]).toBe(42);
    expect(options["seed"]).toBeUndefined();
  });

  it("cka-35: anthropic-messages omits the seed field entirely", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 42));
    // Anchor the omission to a built envelope: temperature 0 proves the call
    // was constructed, so the absent seed field is a deliberate omission rather
    // than an unbuilt (empty) options object.
    expect(call.options.temperature).toBe(0);
    const options = call.options as Record<string, unknown>;
    expect(options["seed"]).toBeUndefined();
    expect(options["random_seed"]).toBeUndefined();
  });

  it("cka-35: amazon-bedrock omits the seed field entirely", () => {
    const call = buildBinderCompleteCall(callInput("amazon-bedrock", 42));
    expect(call.options.temperature).toBe(0);
    const options = call.options as Record<string, unknown>;
    expect(options["seed"]).toBeUndefined();
    expect(options["random_seed"]).toBeUndefined();
  });
});

// ============================================================================
// Bullet 3 — the typed-query unsupported-provider load warning + runtime guard
// ============================================================================

describe("V9j-T — typed-query unsupported provider (theta/load/typed-query-unsupported-provider)", () => {
  // The expected message is sourced from the *Message* column of the load
  // diagnostics registry (diagnostics/code-registry-load.md) for the code
  // `theta/load/typed-query-unsupported-provider`, per the *Diagnostic message
  // anchors* rule.
  const registryMessage = (provider: string, model: string): string =>
    `provider '${provider}' (model '${model}') is outside the theta 1.0 typed-query supported set; typed queries will fail at runtime`;

  it("theta/load/typed-query-unsupported-provider: surfaced (W) for a typed query on an unsupported provider", () => {
    const diagnostic = checkTypedQueryProviderSupport({
      file: "/theta/triage.theta",
      hasTypedQuery: true,
      api: "google-generative-ai",
      modelReference: "gemini-pro",
    });
    expect(diagnostic).not.toBeNull();
    expect(diagnostic?.severity).toBe("warning");
    expect(diagnostic?.code).toBe(TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE);
    expect(diagnostic?.message).toBe(
      registryMessage("google-generative-ai", "gemini-pro"),
    );
  });

  it("theta/load/typed-query-unsupported-provider: NOT surfaced for a supported provider", () => {
    const diagnostic = checkTypedQueryProviderSupport({
      file: "/theta/triage.theta",
      hasTypedQuery: true,
      api: "anthropic-messages",
      modelReference: "claude-sonnet",
    });
    expect(diagnostic).toBeNull();
  });

  it("theta/load/typed-query-unsupported-provider: NOT surfaced when the theta carries no typed query", () => {
    const diagnostic = checkTypedQueryProviderSupport({
      file: "/theta/triage.theta",
      hasTypedQuery: false,
      api: "google-generative-ai",
      modelReference: "gemini-pro",
    });
    expect(diagnostic).toBeNull();
  });

  it("cka-35: the runtime guard synthesises the pinned unsupported-provider TransportError", () => {
    const error = synthesizeUnsupportedProviderTransportError(
      "google-generative-ai",
    );
    expect(error).toEqual({
      kind: "transport",
      message:
        "google-generative-ai does not support forced tool-use; typed queries unavailable",
      http_status: null,
      provider: "google-generative-ai",
      retryable: false,
    });
  });
});
