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
import { deriveBinderSeed } from "../src/binder/binder-seed";
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

// Unit pins for the `V9j` "Binder inference call and provider-error mapping"
// pair. Closes the code-keyed obligation areas `cka-34`
// (binder-inference.md §Binder inference call) and `cka-35`
// (provider-error-mapping.md §Provider error mapping / §Provider seed-field
// mapping / §Binder temperature placement mapping), and
// supplies the asserting test for the load warning code
// `theta/load/typed-query-unsupported-provider`.
//
// Bug 0011 updated the cka-34 cells to the production-wired call shape: the
// tool `parameters` is the envelope schema rooted in the OBJECT ATTACHMENT
// WRAPPER (a top-level `anyOf` is not a valid provider `input_schema`;
// BNDR-1/BNDR-2 survive at `properties.envelope`), and the forced
// `options.toolChoice` is spelled PER-API from the shared
// `FORCED_TOOL_CHOICE_BY_API` table (the normalized `{type:"tool",name}` is a
// 400/TypeError on the openai-completions / mistral-family adapters).
// The bug-0011 LIVE round then flipped the wrapper's `$defs` transport from
// hoist to INLINE: provider tool input-schema `$ref`/`$defs` handling degrades
// the forced arguments (every NamedType bind failed live), so the attachment
// copy dereferences every `#/$defs/...` ref and carries no `$defs` key, while
// AJV/slug keep consuming the envelope schema document itself (refs + root
// `$defs` intact).
//
// Spec: pi-integration-contract/binder-inference.md,
// pi-integration-contract/provider-error-mapping.md,
// pi-integration-contract/conversation-drive.md §"Provider compatibility for
// typed queries"; diagnostic code/message from diagnostics/code-registry-load.md.

// --- helpers ----------------------------------------------------------------

/**
 * A minimal `Model<Api>` fixture. `.api` and `.id` are the fields the seam
 * reads; `modelOf` supplies only `.api`, so every row it drives is one the
 * temperature placement mapping sends the field for by default.
 */
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

/**
 * Deep scan: every path at which the object key `key` occurs anywhere within
 * `value` (nested objects and arrays). `[]` means the key is entirely absent —
 * the bug-0011 live-round pin for `$ref` / `$defs` on the attachment copy.
 */
function deepKeyOccurrences(value: unknown, key: string): string[] {
  const hits: string[] = [];
  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (node === null || typeof node !== "object") {
      return;
    }
    for (const [k, child] of Object.entries(node as Record<string, unknown>)) {
      if (k === key) {
        hits.push(`${path}.${k}`);
      }
      visit(child, `${path}.${k}`);
    }
  };
  visit(value, "$");
  return hits;
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

  it("cka-34: context.tools carries exactly the forced structured-output tool with the object-rooted wrapper parameters", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    expect(call.context.tools).toHaveLength(1);
    const tool = call.context.tools?.[0];
    expect(tool?.name).toBe(binderToolName("triage"));
    expect(tool?.description).toBe(BINDER_TOOL_DESCRIPTION);
    // parameters is the envelope schema ROOTED IN THE OBJECT ATTACHMENT
    // WRAPPER (bug 0011: a top-level anyOf is not a valid provider
    // input_schema), wrapped as `Type.Unsafe<unknown>`; the anyOf envelope
    // document survives verbatim at properties.envelope.
    expect(tool?.parameters).toEqual(
      Type.Unsafe({
        type: "object",
        properties: { envelope },
        required: ["envelope"],
        additionalProperties: false,
      }),
    );
  });

  // Navigate to the ok arm's `args.properties.<field>` inside the attachment.
  function argsPropertyOf(parameters: unknown, field: string): unknown {
    const wrapper = parameters as {
      readonly properties?: {
        readonly envelope?: { readonly anyOf?: ReadonlyArray<Record<string, unknown>> };
      };
    };
    const okArm = wrapper.properties?.envelope?.anyOf?.[0] as
      | { readonly properties?: { readonly args?: Record<string, unknown> } }
      | undefined;
    const argsProperties = okArm?.properties?.args?.["properties"] as
      | Record<string, unknown>
      | undefined;
    return argsProperties?.[field];
  }

  it("cka-34: $defs refs on the envelope schema document are INLINED into the attachment copy — no $ref/$defs survives; the input document is unmutated (bug 0011 live round: provider $ref handling)", () => {
    // The live-gate failure class: provider tool input_schema handling of
    // $ref/$defs degrades the forced arguments (the d848f1b2 class scoped to
    // refs — all three NamedType cases failed every bind), so the attachment
    // copy dereferences the closure; AJV keeps consuming the envelope schema
    // document itself (refs + root $defs intact — the envelope-root hoist cell
    // in binder-bypass-envelope.test.ts pins that side).
    const envelopeWithDefs: BinderEnvelopeSchema = {
      anyOf: [
        {
          type: "object",
          properties: {
            kind: { const: "ok" },
            args: {
              type: "object",
              properties: { sev: { $ref: "#/$defs/Severity" } },
              required: ["sev"],
              additionalProperties: false,
            },
          },
          required: ["kind", "args"],
        },
      ],
      $defs: { Severity: { type: "string", enum: ["Low", "High"] } },
    };
    const snapshot = structuredClone(envelopeWithDefs);

    const call = buildBinderCompleteCall({
      ...callInput("anthropic-messages", 7),
      envelopeSchema: envelopeWithDefs,
    });
    const parameters = call.context.tools?.[0]?.parameters;

    // (a) Deep scan: the attachment carries NO $ref and NO $defs anywhere.
    expect(deepKeyOccurrences(parameters, "$ref")).toEqual([]);
    expect(deepKeyOccurrences(parameters, "$defs")).toEqual([]);
    // (b) The Severity fragment is inlined at the ref site.
    expect(argsPropertyOf(parameters, "sev")).toEqual({
      type: "string",
      enum: ["Low", "High"],
    });
    // (c) The INPUT envelope schema document is unmutated — it is also the
    // slug/AJV artifact.
    expect(envelopeWithDefs).toEqual(snapshot);
  });

  it("cka-34: transitive $defs — an entry referencing another entry inlines fully (bug 0011 live round)", () => {
    // A `schema` decl referencing an `enum` lowers with a ref INSIDE the
    // schema's $defs fragment; the inliner must dereference transitively.
    const envelopeWithDefs: BinderEnvelopeSchema = {
      anyOf: [
        {
          type: "object",
          properties: {
            kind: { const: "ok" },
            args: {
              type: "object",
              properties: { item: { $ref: "#/$defs/Item" } },
              required: ["item"],
              additionalProperties: false,
            },
          },
          required: ["kind", "args"],
        },
      ],
      $defs: {
        Item: {
          type: "object",
          properties: { sev: { $ref: "#/$defs/Severity" } },
          required: ["sev"],
          additionalProperties: false,
        },
        Severity: { type: "string", enum: ["Low", "High"] },
      },
    };
    const snapshot = structuredClone(envelopeWithDefs);

    const call = buildBinderCompleteCall({
      ...callInput("anthropic-messages", 7),
      envelopeSchema: envelopeWithDefs,
    });
    const parameters = call.context.tools?.[0]?.parameters;

    expect(deepKeyOccurrences(parameters, "$ref")).toEqual([]);
    expect(deepKeyOccurrences(parameters, "$defs")).toEqual([]);
    // Item inlined at the ref site with Severity inlined inside it.
    expect(argsPropertyOf(parameters, "item")).toEqual({
      type: "object",
      properties: { sev: { type: "string", enum: ["Low", "High"] } },
      required: ["sev"],
      additionalProperties: false,
    });
    expect(envelopeWithDefs).toEqual(snapshot);
  });

  it("cka-34: production-lowered NESTED $defs — the outer ref inlines, the inner dangling ref survives verbatim, the nested $defs key is dropped (upstream lowering gap; residual)", () => {
    // The production lowering (`lowerObjectFields`, body-type-lowering.ts)
    // nests a referenced schema's inner fragment in a `$defs` ON the referring
    // fragment instead of contributing it to the document-root closure, so a
    // two-level NamedType chain (`params: t: Task` + `schema Task { sev:
    // Severity }`, the enum not directly params-referenced) ships a
    // `#/$defs/Severity` ref that dangles from EVERY document root. That case
    // is pre-broken upstream regardless of attachment shape — the envelope
    // document's AJV compile throws on the same dangling ref at the routing
    // step (a recorded residual / neighbour-report candidate, outside this
    // bug's blast radius). This cell pins the inliner's contract over that
    // shape: inline what resolves, pass the dangling ref through verbatim
    // (the binder-inference.md carve-out), drop the nested `$defs` key, mint
    // no root `$defs`, mutate nothing.
    const envelopeWithNestedDefs: BinderEnvelopeSchema = {
      anyOf: [
        {
          type: "object",
          properties: {
            kind: { const: "ok" },
            args: { $ref: "#/$defs/Task" },
          },
          required: ["kind", "args"],
        },
      ],
      $defs: {
        Task: {
          type: "object",
          properties: { sev: { $ref: "#/$defs/Severity" } },
          required: ["sev"],
          additionalProperties: false,
          $defs: { Severity: { type: "string", enum: ["Low", "High"] } },
        },
      },
    };
    const snapshot = structuredClone(envelopeWithNestedDefs);

    const call = buildBinderCompleteCall({
      ...callInput("anthropic-messages", 7),
      envelopeSchema: envelopeWithNestedDefs,
    });
    const parameters = call.context.tools?.[0]?.parameters;

    // (a) No $defs key anywhere: Task's nested table is dropped, and the
    // dangling-passthrough branch mints no residual root closure (that
    // residual is cycle-guard-only).
    expect(deepKeyOccurrences(parameters, "$defs")).toEqual([]);
    // (b) Exactly one $ref survives — the INNER dangling Severity ref,
    // verbatim at the inlined Task's sev site; the outer Task ref inlined.
    expect(deepKeyOccurrences(parameters, "$ref")).toEqual([
      "$.properties.envelope.anyOf[0].properties.args.properties.sev.$ref",
    ]);
    const okArm = (
      parameters as {
        readonly properties?: {
          readonly envelope?: {
            readonly anyOf?: ReadonlyArray<Record<string, unknown>>;
          };
        };
      }
    ).properties?.envelope?.anyOf?.[0];
    expect(okArm?.["properties"]).toEqual({
      kind: { const: "ok" },
      args: {
        type: "object",
        properties: { sev: { $ref: "#/$defs/Severity" } },
        required: ["sev"],
        additionalProperties: false,
      },
    });
    // (c) The input envelope schema document is unmutated — it is also the
    // slug/AJV artifact.
    expect(envelopeWithNestedDefs).toEqual(snapshot);
  });

  it("cka-34: options force the tool choice to the single binder tool — anthropic-messages spells {type:'tool',name}", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    const options = call.options as Record<string, unknown>;
    expect(options["toolChoice"]).toEqual({
      type: "tool",
      name: binderToolName("triage"),
    });
  });

  it("cka-34: openai-completions spells the forced tool choice {type:'function',function:{name}}", () => {
    // The per-api spelling table (bug 0011 wires the same
    // FORCED_TOOL_CHOICE_BY_API rows the respond dispatch uses): the
    // openai-completions adapter consumes the OpenAI-style spelling directly;
    // the normalized {type:'tool',name} yields a provider 400.
    const call = buildBinderCompleteCall(callInput("openai-completions", 7));
    const options = call.options as Record<string, unknown>;
    expect(options["toolChoice"]).toEqual({
      type: "function",
      function: { name: binderToolName("triage") },
    });
  });

  it("cka-34: mistral spells the forced tool choice {type:'function',function:{name}}; an api outside the table takes the normalized spelling", () => {
    const mistral = buildBinderCompleteCall(callInput("mistral", 7));
    expect((mistral.options as Record<string, unknown>)["toolChoice"]).toEqual({
      type: "function",
      function: { name: binderToolName("triage") },
    });
    const outside = buildBinderCompleteCall(callInput("unknown-api", 7));
    expect((outside.options as Record<string, unknown>)["toolChoice"]).toEqual({
      type: "tool",
      name: binderToolName("triage"),
    });
  });

  it("cka-34: options.temperature is 0", () => {
    const call = buildBinderCompleteCall(callInput("anthropic-messages", 7));
    expect(call.options.temperature).toBe(0);
  });

  // --- per-(api, model-id) temperature placement (bug 0064) ----------------
  //
  // Whether the binder call carries `temperature` is a per-(api, model-id)
  // request-shape fact, not a universal one. The Anthropic Messages API answers
  // the field with `400 invalid_request_error` ("`temperature` is deprecated
  // for this model.") on the models that deprecate it; the classifier routes
  // that to the transport class, the single transport budget re-issues the
  // identical call, and every non-bypass `params:` theta terminates on
  // `argument binder unavailable` without ever running its body (bug 0064).
  // The placement therefore reads a static table keyed on BOTH the resolved
  // `Model<Api>.api` and the exact `Model<Api>.id` — the same shape the seed
  // field (`#provider-seed-field-mapping`) and the forced tool choice already
  // read — spec-anchored at
  // `provider-error-mapping.md#binder-temperature-placement-mapping`.
  //
  // A "not sent" row must OMIT the key: an own `temperature` key holding
  // `undefined` still reaches the adapter's payload builder, so presence is
  // asserted with `in`, never against `undefined`. The `modelOf`-built cells
  // above carry no `id` at all and so exercise only the default-sent rows;
  // these cells are the id-keyed half.

  /**
   * The `callInput` triple with a model carrying BOTH `api` and the exact `id`
   * — the pair the temperature placement is keyed on. `modelOf` above supplies
   * only `api`, which no id-scoped row can match.
   */
  function callInputForModelId(
    api: string,
    id: string,
    seed: number,
  ): BinderCompleteCallInput {
    return {
      ...callInput(api, seed),
      model: { api, id } as unknown as Model<Api>,
    };
  }

  /** The built options' own keys — the red message's evidence. */
  function optionKeys(call: { readonly options: unknown }): readonly string[] {
    return Object.keys(call.options as Record<string, unknown>);
  }

  it("cka-34: bug 0064 — anthropic-messages + claude-sonnet-5 omits the temperature key entirely", () => {
    const call = buildBinderCompleteCall(
      callInputForModelId("anthropic-messages", "claude-sonnet-5", 7),
    );
    expect(
      "temperature" in (call.options as Record<string, unknown>),
      "the binder call carries a `temperature` own key for an (api, model-id) " +
        "pair whose placement row refuses the field with a 400 — the whole " +
        "non-bypass `params:` feature is unavailable against this model. " +
        "options keys: " + JSON.stringify(optionKeys(call)),
    ).toBe(false);
    // The call was still BUILT (the omission is a deliberate row, not an
    // unbuilt/empty options object) — the same anchoring the seed-omission
    // cells below use.
    expect(optionKeys(call)).toContain("toolChoice");
  });

  it("cka-34: bug 0064 — anthropic-messages + claude-fable-5 omits the temperature key entirely", () => {
    const call = buildBinderCompleteCall(
      callInputForModelId("anthropic-messages", "claude-fable-5", 7),
    );
    expect(
      "temperature" in (call.options as Record<string, unknown>),
      "the binder call carries a `temperature` own key for the second measured " +
        "refusing model id — options keys: " + JSON.stringify(optionKeys(call)),
    ).toBe(false);
    expect(optionKeys(call)).toContain("toolChoice");
  });

  it("cka-34: bug 0064 control — anthropic-messages + claude-haiku-4-5 still sends temperature 0 (the row is id-scoped, not api-scoped)", () => {
    const call = buildBinderCompleteCall(
      callInputForModelId("anthropic-messages", "claude-haiku-4-5", 7),
    );
    expect(call.options.temperature).toBe(0);
  });

  it("cka-34: bug 0064 control — openai-completions + gpt-4o still sends temperature 0 (an api with no refusing row)", () => {
    const call = buildBinderCompleteCall(
      callInputForModelId("openai-completions", "gpt-4o", 7),
    );
    expect(call.options.temperature).toBe(0);
  });

  it("cka-34: bug 0064 control — openai-completions + claude-sonnet-5 still sends temperature 0 (the key is the (api, model-id) PAIR, not the id alone)", () => {
    // A model id that refuses the field under `anthropic-messages` says nothing
    // about the same id reached through another api's adapter, so the table
    // must not degrade into an id-only denylist.
    const call = buildBinderCompleteCall(
      callInputForModelId("openai-completions", "claude-sonnet-5", 7),
    );
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
    // The seed VALUE production supplies is the FNV-1a hash of the bare
    // command name (determinism-cancellation-failure.md reference vector).
    expect(deriveBinderSeed("code-review")).toBe(0x7ba86b63);
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

// ============================================================================
// Bug 0065 — the anthropic overflow status gate is unsatisfiable, and the
// token extraction scans the pi-ai-FORMATTED envelope
// (docs/bugs/0065-anthropic-overflow-status-gate-unsatisfiable.md)
// ============================================================================
//
// Two elements, both witnessed here against the classifier's own input surface.
//
//   Element 1 — an unavailable HTTP status must not veto a matching anthropic
//   overflow signature. The `anthropic-messages` pi-ai adapter never fires
//   `onResponse` on an HTTP 400 — the SDK call throws out of
//   `client.messages.create(...).asResponse()` before the
//   `options?.onResponse?.(...)` line
//   (node_modules/@earendil-works/pi-ai/dist/api/anthropic-messages.js:371) —
//   so a REAL overflow reaches the classifier with `httpStatus: null`.
//   `overflowStatusGateSatisfied` (src/binder/provider-error-mapping.ts:270)
//   therefore admits `httpStatus === 400 || httpStatus === null` on the
//   anthropic/mistral arm (:276); a CAPTURED non-400 status still vetoes, so
//   the openai-only HTTP-200 body-envelope arm (:277-281) cannot leak. Spec:
//   docs/spec_topics/pi-integration-contract/provider-error-mapping.md:7
//   (the condition-scoped no-captured-status carve-out) and :17 (the
//   anthropic row's "HTTP 400, or no captured HTTP status" gate).
//
//   Element 2 — the numeric-run scan runs over the provider-message window,
//   not the whole FORMATTED envelope. The classifier's `errorMessage` is the
//   pi-ai-formatted string — HTTP-status prefix + JSON body + `request_id` —
//   so `extractOverflowTokens` (:239) first narrows to the capture of the
//   LAST match of `/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/g` (the whole string
//   when nothing matches) and applies the unchanged exactly-two-runs rule
//   (:250) to that window. Spec: :24 (*Overflow token-count extraction*),
//   whose worked example (`"requested 1,234,567 tokens, limit 200,000"`) is
//   a BARE provider message the narrowing must not move.
//
// LIVE-MEASURED INPUT. `LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE` below is the
// verbatim `AssistantMessage.errorMessage` recorded from one `complete()`
// against `claude-haiku-4-5` with `"word ".repeat(220_000)` at pi-ai 0.80.10.
// The same probe recorded `ONRESPONSE FIRINGS: []` and `STOPREASON: error`; a
// success control on the same model recorded `ONRESPONSE FIRINGS: [200]`, so
// the empty firings are the adapter's error path, not an unregistered
// callback. The live half of this witness — the `ONRESPONSE FIRINGS: []`
// re-validation gate and the end-to-end classification — is
// tests/live/provider-error-revalidation-gate.test.ts.
//
// The constant below is a PINNED BYTE STRING, not an invariant provider fact:
// the tokenizer's count for the same prompt drifts run to run (220 044 for
// this capture; 220 039 on a later run of the same probe), which is why the
// live cell asserts a bound on `tokens_used` while these offline cells assert
// the exact values of the bytes they were given.

describe("bug 0065 — anthropic overflow: the null-status gate and the formatted-envelope scan", () => {
  /**
   * The verbatim live `errorMessage` byte string. Whole-string numeric runs
   * are SEVEN (`400`, `220044`, `200000`, `011`, `67`, `3`, `6` — the last
   * four from the `request_id`), so the exactly-two rule cannot fire against
   * it. The provider-message window is
   * `prompt is too long: 220044 tokens > 200000 maximum`, whose runs are
   * exactly `220044` and `200000`.
   */
  const LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE =
    `400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 220044 tokens > 200000 maximum"},"request_id":"req_011Ce67AeKSksfCvdLP3Q6Ha"}`;

  // --- the headline witness (both elements at once) -----------------------

  it("bug 0065: a REAL anthropic overflow (httpStatus null + the live errorMessage) → ContextOverflowError carrying 220044/200000", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: null,
        stopReason: "error",
        errorMessage: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE,
      }),
    ) as ContextOverflowError;
    expect(
      result.kind,
      "a genuine `prompt is too long` refusal must reach the author as " +
        "ContextOverflowError. `transport` means the status gate " +
        "(provider-error-mapping.ts:276) refused a status the anthropic " +
        "adapter never delivers, so the author's ContextOverflow match arm is " +
        "dead against the default provider and `retryable: true` invites a " +
        "retry of a request that cannot succeed. observed: " +
        JSON.stringify(result),
    ).toBe("context_overflow");
    expect(
      result.tokens_used,
      "the provider stated the used count in its own message; `null` means " +
        "the scan ran over the FORMATTED envelope (7 runs) instead of the " +
        "provider-message window (2 runs). observed: " + JSON.stringify(result),
    ).toBe(220044);
    expect(
      result.tokens_limit,
      "the provider stated the 200000 window in its own message; `null` means " +
        "the same formatted-envelope scan. observed: " + JSON.stringify(result),
    ).toBe(200000);
  });

  // --- element 1 in isolation (no numeric content to extract) -------------

  it("bug 0065 element 1: overflow wording with NO numeric content at httpStatus null → ContextOverflowError, both counts null", () => {
    // The gate is the ONLY thing under test here: the message carries no
    // numeric run at all, so the extraction answers null/null on every route
    // and cannot mask the gate's verdict.
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: null,
        stopReason: "error",
        errorMessage: "prompt is too long for this model",
      }),
    ) as ContextOverflowError;
    expect(
      result.kind,
      "an unavailable HTTP status must not VETO a matching anthropic overflow " +
        "signature — that is the same posture the bedrock arm already has " +
        "(provider-error-mapping.ts:282-285) and the condition " +
        "provider-error-mapping.md:7 describes. observed: " +
        JSON.stringify(result),
    ).toBe("context_overflow");
    expect(result.tokens_used, "no numeric run exists to extract").toBeNull();
    expect(result.tokens_limit, "no numeric run exists to extract").toBeNull();
  });

  // --- element 2 in isolation (already past the gate) ---------------------

  it("bug 0065 element 2: the live errorMessage at httpStatus 400 — past the gate — must still yield 220044/200000", () => {
    // The bug report's counterfactual, made mechanical: supply the one field
    // the gate wants and the classification succeeds while both counts stay
    // null, because the scanned string is the formatted envelope.
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        stopReason: "error",
        errorMessage: LIVE_ANTHROPIC_OVERFLOW_ERROR_MESSAGE,
      }),
    ) as ContextOverflowError;
    expect(
      result.kind,
      "the counterfactual anchor: with the status supplied the signature match " +
        "reaches ContextOverflowError, so any count failure below is element 2 " +
        "alone. observed: " + JSON.stringify(result),
    ).toBe("context_overflow");
    expect(
      result.tokens_used,
      "element 2: the formatted envelope yields 7 numeric runs " +
        "(400, 220044, 200000, 011, 67, 3, 6), so the exactly-two rule " +
        "(provider-error-mapping.ts:250) falls back to null. The window " +
        "`prompt is too long: 220044 tokens > 200000 maximum` yields exactly " +
        "two. observed: " + JSON.stringify(result),
    ).toBe(220044);
    expect(
      result.tokens_limit,
      "element 2, the smaller run of the provider-message window. observed: " +
        JSON.stringify(result),
    ).toBe(200000);
  });

  // --- the constraint the widened gate must not break ---------------------

  it("bug 0065 constraint: a CAPTURED non-400 status still vetoes the anthropic overflow match (HTTP 200 + overflow wording stays transport)", () => {
    // The widening is "an unavailable status does not veto", NOT "any status
    // matches". An HTTP-200 response carrying overflow wording is the
    // openai-completions body-envelope arm (provider-error-mapping.ts:277-281,
    // spec :18) and must not leak to anthropic, which has no such arm.
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 200,
        stopReason: "error",
        errorMessage: "prompt is too long: 220044 tokens > 200000 maximum",
      }),
    ) as TransportError;
    expect(
      result.kind,
      "a captured 200 must veto the anthropic overflow signature; " +
        "`context_overflow` means the gate widened past the no-HTTP-response " +
        "class into \"any status\". observed: " + JSON.stringify(result),
    ).toBe("transport");
    expect(
      result.http_status,
      "the captured status is carried through verbatim. observed: " +
        JSON.stringify(result),
    ).toBe(200);
    expect(
      result.retryable,
      "an application-level refusal returned under a success status is a " +
        "definite refusal, not a transient condition " +
        "(provider-error-mapping.md:13). observed: " + JSON.stringify(result),
    ).toBe(false);
  });

  // --- mistral parity: shared gate, UNMEASURED live behaviour -------------
  //
  // WHY these two cells are marked UNMEASURED. No mistral credential exists in
  // this environment: the configured pi install exposes `anthropic-messages`,
  // `openai-completions` and `openai-responses` over the anthropic +
  // openrouter + unity gateways only — there is no `mistral` api provider to
  // drive — so nothing about mistral here was observed live. The mistral arms
  // widen by SHARED-GATE PARITY with anthropic: they are the same switch
  // fallthrough (provider-error-mapping.ts:272-275 into the single `return` at
  // :276), so whatever the gate concedes to anthropic it concedes to mistral
  // by construction. Whether the mistral pi-ai adapter actually withholds
  // `onResponse` on a 400 is UNMEASURED and is NOT claimed by these cells.

  it("bug 0065 mistral parity (UNMEASURED): `mistral` at httpStatus null with a context-length body → ContextOverflowError, both counts null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "mistral",
        httpStatus: null,
        stopReason: "error",
        errorMessage: "the context length was exceeded",
      }),
    ) as ContextOverflowError;
    expect(
      result.kind,
      "the mistral arm shares the anthropic gate expression verbatim, so it " +
        "must share the widening. observed: " + JSON.stringify(result),
    ).toBe("context_overflow");
    expect(
      result.tokens_used,
      "mistral is outside TOKEN_EXTRACTING_APIS " +
        "(provider-error-mapping.ts:192-195), so counts stay null on every route",
    ).toBeNull();
    expect(
      result.tokens_limit,
      "mistral is outside TOKEN_EXTRACTING_APIS " +
        "(provider-error-mapping.ts:192-195), so counts stay null on every route",
    ).toBeNull();
  });

  it("bug 0065 mistral parity (UNMEASURED): the `mistral-conversations` alias behaves identically at httpStatus null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "mistral-conversations",
        httpStatus: null,
        stopReason: "error",
        errorMessage: "the context length was exceeded",
      }),
    ) as ContextOverflowError;
    expect(
      result.kind,
      "the pinned KnownApi alias shares the same switch fallthrough as " +
        "`mistral`, so the two spellings must classify identically. observed: " +
        JSON.stringify(result),
    ).toBe("context_overflow");
    expect(result.tokens_used, "outside TOKEN_EXTRACTING_APIS").toBeNull();
    expect(result.tokens_limit, "outside TOKEN_EXTRACTING_APIS").toBeNull();
  });

  // --- element-2 no-op guards: the narrowing must not move a BARE message --
  //
  // The provider-message window is the value of the LAST `"message": "…"`
  // match, or the WHOLE string when there is none. A bare provider message
  // carries no such member, so every worked example of
  // provider-error-mapping.md:24 must come out byte-identical. These are new
  // cells; the pre-existing extraction cells above stay untouched.

  it("bug 0065 element-2 no-op: a BARE two-run message is unchanged by the window narrowing (1234567/200000)", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage:
          "maximum context length exceeded: requested 1,234,567 tokens, limit 200,000",
      }),
    ) as ContextOverflowError;
    expect(
      result.tokens_used,
      "the spec's own worked example; a change here means the narrowing is " +
        "not a no-op on bare messages. observed: " + JSON.stringify(result),
    ).toBe(1234567);
    expect(result.tokens_limit, "the spec's own worked example").toBe(200000);
  });

  it("bug 0065 element-2 no-op: a BARE one-run message still falls back to null/null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage: "maximum context length exceeded: 5000 tokens",
      }),
    ) as ContextOverflowError;
    expect(
      result.tokens_used,
      "one run is not two; the fallback is unchanged by the narrowing. " +
        "observed: " + JSON.stringify(result),
    ).toBeNull();
    expect(result.tokens_limit, "one run is not two").toBeNull();
  });

  it("bug 0065 element-2 no-op: a BARE three-run message still falls back to null/null", () => {
    const result = classifyProviderResponse(
      classify({
        api: "anthropic-messages",
        httpStatus: 400,
        errorMessage: "maximum context length exceeded: a 1 b 2 c 3",
      }),
    ) as ContextOverflowError;
    expect(
      result.tokens_used,
      "three runs are not two; the fallback is unchanged by the narrowing. " +
        "observed: " + JSON.stringify(result),
    ).toBeNull();
    expect(result.tokens_limit, "three runs are not two").toBeNull();
  });

  // --- the status-prefix fabrication guard --------------------------------
  //
  // WHY DERIVED, NOT MEASURED. Both byte strings below are DERIVED from the
  // measured `openai-completions` formatted-error family — one live sample of
  // that formatter reads
  // `401: {"message":"LiteLLM Virtual Key expected. Received=UNIT****KEY1, expected to start with 'sk-'.","type":"auth_error","param":"None","code":"401"}`,
  // i.e. `<status>: <JSON body carrying an innermost "message" member>`. No
  // live openai-completions OVERFLOW was captured, so the overflow wording is
  // constructed, not observed.

  it("bug 0065 fabrication guard: an openai formatted error whose only in-window run is the limit yields null/null, never the HTTP status as a count", () => {
    // The two-run shape: whole-string runs are exactly `400` (the status
    // prefix) and `8192`, so the unnarrowed scan reads the HTTP STATUS as a
    // token count. The window `maximum context length is 8192 tokens` has ONE
    // run, which is the null/null fallback.
    const result = classifyProviderResponse(
      classify({
        api: "openai-completions",
        httpStatus: 400,
        errorMessage: `400: {"message":"maximum context length is 8192 tokens","code":"context_length_exceeded"}`,
      }),
    ) as ContextOverflowError;
    expect(
      result.kind,
      "anchor: the openai signature matches and the 400 gate concedes, so the " +
        "counts below are the only thing under test. observed: " +
        JSON.stringify(result),
    ).toBe("context_overflow");
    expect(
      result.tokens_used,
      "the HTTP status prefix must never be read as a token count. Without " +
        "the provider-message window the whole-string scan sees exactly two " +
        "runs (400, 8192) and fabricates tokens_used: 8192, tokens_limit: 400 " +
        "— a 400-token context window that no provider reported. observed: " +
        JSON.stringify(result),
    ).toBeNull();
    expect(
      result.tokens_limit,
      "the fabricated pair is (used 8192, limit 400); both must be null. " +
        "observed: " + JSON.stringify(result),
    ).toBeNull();
  });

  it("bug 0065 fabrication guard, numeric-`code` variant: the same shape with a numeric `code` member also yields null/null", () => {
    // A three-run whole string (`400`, `8192`, `400`), so the unnarrowed scan
    // ALREADY answers null/null here — this cell is the invariance half: the
    // window (`maximum context length is 8192 tokens`, one run) must reach the
    // same verdict rather than gaining a spurious pair.
    const result = classifyProviderResponse(
      classify({
        api: "openai-completions",
        httpStatus: 400,
        errorMessage: `400: {"message":"maximum context length is 8192 tokens","code":400}`,
      }),
    ) as ContextOverflowError;
    expect(result.kind, "anchor: the signature matches and the gate concedes").toBe(
      "context_overflow",
    );
    expect(
      result.tokens_used,
      "one in-window run is not two. observed: " + JSON.stringify(result),
    ).toBeNull();
    expect(
      result.tokens_limit,
      "one in-window run is not two. observed: " + JSON.stringify(result),
    ).toBeNull();
  });

  it("bug 0065 openai narrowing: a formatted overflow envelope yields the two IN-MESSAGE runs (10000/8192), not the three whole-string runs", () => {
    // DERIVED, NOT MEASURED — see the fabrication-guard WHY above: the
    // envelope shape is the measured openai-completions formatted family, the
    // overflow wording is constructed. Whole-string runs are `400`, `8192`,
    // `10000` (three → null/null); the window
    // `This model's maximum context length is 8192 tokens. However, your
    // messages resulted in 10000 tokens.` carries exactly two.
    const result = classifyProviderResponse(
      classify({
        api: "openai-completions",
        httpStatus: 400,
        errorMessage: `400 {"error":{"message":"This model's maximum context length is 8192 tokens. However, your messages resulted in 10000 tokens.","type":"invalid_request_error","code":"context_length_exceeded"}}`,
      }),
    ) as ContextOverflowError;
    expect(
      result.kind,
      "anchor: the openai signature matches at a captured 400. observed: " +
        JSON.stringify(result),
    ).toBe("context_overflow");
    expect(
      result.tokens_used,
      "element 2 for openai: the status prefix makes three whole-string runs, " +
        "so the unnarrowed scan falls back to null. observed: " +
        JSON.stringify(result),
    ).toBe(10000);
    expect(
      result.tokens_limit,
      "the smaller in-window run is the model's context window. observed: " +
        JSON.stringify(result),
    ).toBe(8192);
  });
});
