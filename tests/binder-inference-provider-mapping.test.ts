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
