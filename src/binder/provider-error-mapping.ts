// V9j / V9j-T — Provider-error → `QueryError` classification, the typed-query
// unsupported-provider load warning, and the unsupported-provider runtime
// `TransportError` synthesis.
//
// This module owns three mechanisms of
// pi-integration-contract/provider-error-mapping.md and the typed-query
// provider-compatibility clause of pi-integration-contract/conversation-drive.md:
//
//   - `classifyProviderResponse` — maps a classifier-reaching provider response
//     (HTTP status class + `AssistantMessage.stopReason` + `errorMessage`) to a
//     `QueryError` variant: overflow signatures and the `length` stop reason to
//     `ContextOverflowError` (with the deterministic token-count extraction),
//     every other classifier-reaching response to `TransportError` with the
//     `retryable` flag populated by transport-error class.
//   - `checkTypedQueryProviderSupport` — the load-time
//     `theta/load/typed-query-unsupported-provider` (W) emitter, fired when a theta
//     carries at least one typed-query expression and its resolved `model:`
//     routes through a provider outside the theta 1.0 typed-query supported set.
//   - `synthesizeUnsupportedProviderTransportError` — the runtime guard that,
//     on an unsupported provider, returns the pinned
//     `TransportError { retryable: false, http_status: null, … }`.
//
// V9j-T (tests-task) declares these seam shapes and stubs every behaviour-
// bearing function with an inert sentinel result so the failing tests compile
// and red on their own primary assertions (the classification table, the
// context-overflow extraction, the load warning, and the unsupported-provider
// synthesis are all absent). The paired V9j implementation leaf fills them in.
//
// Spec: pi-integration-contract/provider-error-mapping.md (§Provider error
// mapping, §`TransportError.retryable` population, §Overflow signatures,
// §Overflow token-count extraction, §Stop-reason classification, §Provider
// seed-field mapping), pi-integration-contract/conversation-drive.md
// (§Provider compatibility for typed queries); diagnostic code/message from
// diagnostics/code-registry-load.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type {
  ContextOverflowError,
  QueryError,
  TransportError,
} from "../runtime/query-error";

// --- typed-query supported-provider set + load warning ----------------------

/**
 * The theta 1.0 typed-query-supported provider set
 * (conversation-drive.md §"Provider compatibility for typed queries" / the
 * `theta 1.0 seam — typed-query supported provider set`): the `api`-shaped
 * values for which pi-ai exposes a named-tool `toolChoice` mapping. Exposed as a
 * single named constant so the set has one source of truth to widen.
 *
 * WHY six members (bug 0010 increment C): the four documented provider names
 * PLUS the pin-observed KnownApi spellings at the theta-1.0 pi-ai pin —
 * pi-ai's types.d.ts `KnownApi` spells the Mistral and Bedrock adapters
 * `mistral-conversations` / `bedrock-converse-stream`, and those adapters map
 * a working named-tool toolChoice (the FORCED_TOOL_CHOICE_BY_API rows), so a
 * gate refusing them would refuse providers the dispatch demonstrably
 * supports. The names `mistral` / `amazon-bedrock` are retained for the
 * documented provider set. Spec: conversation-drive.md §"Provider
 * compatibility for typed queries" pins exactly this six-member `api`-shaped
 * set (the bug-0010 fix's spec clarification).
 */
export const TYPED_QUERY_SUPPORTED_PROVIDER_APIS = [
  "anthropic-messages",
  "openai-completions",
  "mistral",
  "amazon-bedrock",
  "mistral-conversations",
  "bedrock-converse-stream",
] as const;

/** The load-phase warning code for a typed query against an unsupported provider. */
export const TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE =
  "theta/load/typed-query-unsupported-provider";

/**
 * The `theta/load/typed-query-unsupported-provider` message template
 * (diagnostics/code-registry-load.md): `<provider>` is the resolved
 * `Model<Api>.api` value, `<model>` the resolved `model:` reference. Tests source
 * the expected string from the registry per the *Diagnostic message anchors*
 * rule; this template mirrors it.
 */
export function typedQueryUnsupportedProviderMessage(
  provider: string,
  model: string,
): string {
  return `provider '${provider}' (model '${model}') is outside the theta 1.0 typed-query supported set; typed queries will fail at runtime`;
}

/** Inputs to the load-time typed-query provider-support check. */
export interface TypedQueryProviderCheckInput {
  /** The source file path, for a file-only located diagnostic. */
  readonly file: string;
  /** Whether the theta carries at least one typed-query expression. */
  readonly hasTypedQuery: boolean;
  /** The resolved `Model<Api>.api` value of the theta's `model:`. */
  readonly api: string;
  /** The resolved `model:` reference, substituted for `<model>`. */
  readonly modelReference: string;
}

/**
 * The load-time `theta/load/typed-query-unsupported-provider` (W) emitter: return
 * the warning diagnostic when the theta carries a typed query and its provider is
 * outside the supported set; return `null` otherwise (no typed query, or a
 * supported provider). The theta still loads either way.
 *
 * V9j-T stub: returns a fixed non-matching sentinel diagnostic so BOTH the
 * unsupported case (expecting the registry code/message) and the supported /
 * no-typed-query cases (expecting `null`) red on their own assertions. The
 * paired V9j implementation fills this in.
 */
export function checkTypedQueryProviderSupport(
  input: TypedQueryProviderCheckInput,
): Diagnostic | null {
  if (!input.hasTypedQuery) return null;
  if (
    (TYPED_QUERY_SUPPORTED_PROVIDER_APIS as readonly string[]).includes(input.api)
  ) {
    return null;
  }
  return {
    severity: "warning",
    code: TYPED_QUERY_UNSUPPORTED_PROVIDER_CODE,
    file: input.file,
    message: typedQueryUnsupportedProviderMessage(
      input.api,
      input.modelReference,
    ),
  };
}

// --- unsupported-provider runtime TransportError synthesis ------------------

/**
 * The runtime guard's unsupported-provider `TransportError`
 * (conversation-drive.md §"Provider compatibility for typed queries"): a typed
 * query against a provider outside the supported set returns
 * `TransportError { retryable: false, http_status: null, provider, … }` — a
 * load-time capability gap, not a provider response.
 *
 * V9j-T stub: returns a wrong sentinel so the paired test reds on its own
 * assertion. The paired V9j implementation fills this in.
 */
export function synthesizeUnsupportedProviderTransportError(
  provider: string,
): TransportError {
  return {
    kind: "transport",
    message: `${provider} does not support forced tool-use; typed queries unavailable`,
    http_status: null,
    provider,
    retryable: false,
  };
}

// --- overflow signatures + deterministic token-count extraction -------------

/**
 * Per-provider context-overflow signatures (provider-error-mapping.md §"Overflow
 * signatures"). Each `|` is regex alternation; a backslash-escaped `\|` must not
 * appear in any signature. Matched against the pi-ai-formatted
 * `AssistantMessage.errorMessage` string.
 *
 * WHY the alias rows (bug 0010 fix round 2, n1): at the theta-1.0 pi-ai pin the
 * `mistral-conversations` / `bedrock-converse-stream` KnownApi spellings are the
 * SAME adapter modules the documented `mistral` / `amazon-bedrock` providers
 * register (dist/providers/mistral.js wraps `mistralConversationsApi()`;
 * dist/providers/amazon-bedrock.js wraps `bedrockConverseStreamApi()`), so the
 * classifier-input `errorMessage` text is formatted by one formatter per pair
 * (`formatMistralError` in dist/api/mistral-conversations.js,
 * `formatBedrockError` in dist/api/bedrock-converse-stream.js) — api-identical
 * across the spellings. The alias keys share the documented rows byte-for-byte;
 * without them a body-overflow observed under the pin's KnownApi spelling would
 * classify as generic transport instead of `ContextOverflowError`.
 */
const OVERFLOW_SIGNATURES: Readonly<Record<string, RegExp>> = Object.freeze({
  "anthropic-messages":
    /(prompt is too long|exceeds .* context window|maximum context length)/i,
  "openai-completions": /maximum context length|context_length_exceeded/i,
  mistral: /context.*length/i,
  "mistral-conversations": /context.*length/i,
  "amazon-bedrock": /(input is too long|context window)/i,
  "bedrock-converse-stream": /(input is too long|context window)/i,
});

/**
 * The two providers whose overflow `errorMessage` carries extractable numeric
 * token counts (provider-error-mapping.md §"Overflow token-count extraction").
 * `mistral` and `amazon-bedrock` surface no counts — both fields stay `null`.
 */
const TOKEN_EXTRACTING_APIS: ReadonlySet<string> = new Set([
  "anthropic-messages",
  "openai-completions",
]);

/** A maximal numeric run: digits with interior `,`/`_` separators flanked by digits. */
const NUMERIC_RUN = /[0-9]+(?:[,_][0-9]+)*/g;

/**
 * Deterministic overflow token-count extraction
 * (provider-error-mapping.md §"Overflow token-count extraction"): scan the
 * message for numeric runs, strip separators, parse base-10. Exactly two runs →
 * larger populates `tokens_used`, smaller `tokens_limit`; any other count → both
 * `null`. Providers outside the token-extracting set always yield `null`/`null`.
 */
function extractOverflowTokens(
  api: string,
  message: string,
): { tokens_used: number | null; tokens_limit: number | null } {
  if (!TOKEN_EXTRACTING_APIS.has(api)) {
    return { tokens_used: null, tokens_limit: null };
  }
  const runs = [...message.matchAll(NUMERIC_RUN)].map((match) =>
    Number.parseInt(match[0].replace(/[,_]/g, ""), 10),
  );
  if (runs.length !== 2) {
    return { tokens_used: null, tokens_limit: null };
  }
  const [a, b] = runs as [number, number];
  return { tokens_used: Math.max(a, b), tokens_limit: Math.min(a, b) };
}

/**
 * Whether the response's HTTP status satisfies the provider's overflow-signature
 * status gate (provider-error-mapping.md §"Overflow signatures"). Anthropic and
 * mistral gate on HTTP 400; openai additionally admits an HTTP-200 `stopReason:
 * "error"` body-envelope overflow; bedrock is SDK-only, so signature match takes
 * precedence at any captured status (including the network-level `null` class).
 */
function overflowStatusGateSatisfied(input: ProviderClassifierInput): boolean {
  switch (input.api) {
    case "anthropic-messages":
    case "mistral":
    // Alias spelling of the same adapter/formatter (see OVERFLOW_SIGNATURES).
    case "mistral-conversations":
      return input.httpStatus === 400;
    case "openai-completions":
      return (
        input.httpStatus === 400 ||
        (input.httpStatus === 200 && input.stopReason === "error")
      );
    case "amazon-bedrock":
    // Alias spelling of the same adapter/formatter (see OVERFLOW_SIGNATURES).
    case "bedrock-converse-stream":
      return true;
    default:
      return false;
  }
}

/**
 * Return a `ContextOverflowError` when the response matches the resolved
 * provider's overflow signature and its status gate; `null` otherwise. Overflow
 * matching takes precedence over both stop-reason and transport classification.
 */
function matchOverflowSignature(
  input: ProviderClassifierInput,
): ContextOverflowError | null {
  const signature = OVERFLOW_SIGNATURES[input.api];
  if (signature === undefined) return null;
  const message = input.errorMessage;
  if (message === undefined) return null;
  if (!signature.test(message)) return null;
  if (!overflowStatusGateSatisfied(input)) return null;
  const { tokens_used, tokens_limit } = extractOverflowTokens(
    input.api,
    message,
  );
  return {
    kind: "context_overflow",
    message,
    tokens_used,
    tokens_limit,
    raw_response: input.rawResponse ?? null,
  };
}

/**
 * `TransportError.retryable` population by transport-error class
 * (provider-error-mapping.md §"`TransportError.retryable` population"): `true`
 * for network-level failures (no HTTP response — status `null`), HTTP 5xx, and
 * HTTP 429; `false` for every other captured status.
 */
function transportRetryable(httpStatus: number | null): boolean {
  if (httpStatus === null) return true;
  if (httpStatus === 429) return true;
  return httpStatus >= 500 && httpStatus <= 599;
}

// --- provider-error → QueryError classifier ---------------------------------

/**
 * The classifier's input surface (provider-error-mapping.md §"Classifier input
 * surface"): theta obtains each field from a fixed `@earendil-works/pi-ai`
 * surface rather than a single typed error object the SDK does not expose.
 */
export interface ProviderClassifierInput {
  /**
   * The resolved `Model<Api>.api` value (api-shaped, e.g. `anthropic-messages`).
   * Selects the per-provider overflow signature and populates
   * `TransportError.provider` / `ContextOverflowError` provenance.
   */
  readonly api: string;
  /**
   * `ProviderResponse.status` captured through `StreamOptions.onResponse`, or
   * `null` when `onResponse` did not fire before `complete()` resolved (the
   * no-HTTP-response / network-level class).
   */
  readonly httpStatus: number | null;
  /**
   * The resolved `AssistantMessage.stopReason` (raw string; kept open for the
   * forward-compatibility "any stop reason the runtime does not recognise" arm).
   */
  readonly stopReason: string;
  /** The pi-ai-formatted `AssistantMessage.errorMessage`, when present. */
  readonly errorMessage?: string;
  /** The final malformed assistant text for `raw_response`, when available. */
  readonly rawResponse?: string | null;
}

/**
 * Classify a provider response to its `QueryError` variant
 * (provider-error-mapping.md): an overflow-signature or `length`-stop-reason
 * response to `ContextOverflowError` (with deterministic token-count
 * extraction), every other classifier-reaching response to `TransportError`
 * with `retryable` populated by transport-error class.
 *
 * V9j-T stub: returns a sentinel `CancelledError` (a valid `QueryError` variant
 * the classifier never produces) so every paired classification test reds on its
 * own `kind` / `retryable` / token-count assertion. The paired V9j
 * implementation fills this in.
 */
export function classifyProviderResponse(
  input: ProviderClassifierInput,
): QueryError {
  // 1. Overflow-signature precedence over stop-reason and transport routing.
  const overflow = matchOverflowSignature(input);
  if (overflow !== null) return overflow;

  // 2. Stop-reason classification: the HTTP-200 output-boundary terminator
  //    (`length`) is a clean context overflow with null token counts. Every
  //    other non-turn-boundary stop reason (`error`, `content_filter`, …) falls
  //    through to the transport classifier below, which yields retryable:false
  //    for its captured status.
  if (input.stopReason === "length") {
    return {
      kind: "context_overflow",
      message: input.errorMessage ?? "",
      tokens_used: null,
      tokens_limit: null,
      raw_response: input.rawResponse ?? null,
    };
  }

  // 3. Every other classifier-reaching response is a TransportError, with
  //    `retryable` populated by transport-error class.
  return {
    kind: "transport",
    message: input.errorMessage ?? "",
    http_status: input.httpStatus,
    provider: input.api,
    retryable: transportRetryable(input.httpStatus),
  };
}

// A type-only reference so `ContextOverflowError` stays part of this module's
// declared surface for the paired implementation (the classifier's overflow arm
// returns it). Erased at compile time.
export type ClassifiedOverflow = ContextOverflowError;
