// V9j / V9j-T — Provider-error → `QueryError` classification.
//
// This module owns the provider-response classifier of
// pi-integration-contract/provider-error-mapping.md:
//
//   - `classifyProviderResponse` — maps a classifier-reaching provider response
//     (HTTP status class + `AssistantMessage.stopReason` + `errorMessage`) to a
//     `QueryError` variant: overflow signatures and the `length` stop reason to
//     `ContextOverflowError` (with the deterministic token-count extraction),
//     every other classifier-reaching response to `TransportError` with the
//     `retryable` flag populated by transport-error class.
//
// Spec: pi-integration-contract/provider-error-mapping.md (§Provider error
// mapping, §`TransportError.retryable` population, §Overflow signatures,
// §Overflow token-count extraction, §Stop-reason classification, §Provider
// seed-field mapping).

import type {
  ContextOverflowError,
  QueryError,
} from "../runtime/query-error";

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
const OVERFLOW_SIGNATURES = Object.freeze({
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
 * The last `"message": "…"` member of a pi-ai-formatted error envelope (see
 * `providerMessageWindow` below). Reuse across calls is safe because
 * `matchAll` never writes the shared instance's `lastIndex` — it iterates a
 * clone — but the clone STARTS from the shared `lastIndex`, so this regex
 * must only ever be read through `matchAll`: one `exec`/`test` call would
 * leave a non-zero offset behind and silently blind every later scan.
 */
const PROVIDER_MESSAGE_MEMBER = /"message"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

/**
 * The provider-message window (provider-error-mapping.md §"Overflow
 * token-count extraction", the provider-message-window step): the capture of
 * the LAST `PROVIDER_MESSAGE_MEMBER` match in source order, or the whole
 * message when none matches. WHY: the classifier's `errorMessage` input is the
 * pi-ai-FORMATTED string (provider-error-mapping.md §"Classifier input
 * surface") — an HTTP-status prefix plus the whole JSON error body including
 * `request_id` — so scanning it unnarrowed makes the numeric-run count below a
 * function of envelope metadata and lets the HTTP status itself be read as a
 * token count. This is a SUBSTRING SELECTION, not a parse: it constructs no
 * JSON value and does not unescape the JSON string escapes inside the
 * captured window.
 */
function providerMessageWindow(message: string): string {
  let window: string | undefined;
  for (const match of message.matchAll(PROVIDER_MESSAGE_MEMBER)) {
    window = match[1];
  }
  return window ?? message;
}

/**
 * Deterministic overflow token-count extraction
 * (provider-error-mapping.md §"Overflow token-count extraction"): narrow the
 * message to its provider-message window (`providerMessageWindow`), scan the
 * window for numeric runs, strip separators, parse base-10. Exactly two runs →
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
  const window = providerMessageWindow(message);
  const runs = [...window.matchAll(NUMERIC_RUN)].map((match) =>
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
 * mistral gate on HTTP 400 or the no-HTTP-response class (`httpStatus === null`):
 * the `anthropic-messages` pi-ai adapter measurably never invokes `onResponse` on
 * an HTTP 400, so an unavailable status must not veto a matching overflow
 * signature — the posture the bedrock arm below already has, narrowed here to
 * the no-HTTP-response class rather than every status. A CAPTURED non-400
 * status still vetoes the match. Openai additionally admits an HTTP-200
 * `stopReason: "error"` body-envelope overflow; bedrock is SDK-only, so
 * signature match takes precedence at any captured status (including the
 * network-level `null` class).
 */
function overflowStatusGateSatisfied(
  input: ProviderClassifierInput,
  api: keyof typeof OVERFLOW_SIGNATURES,
): boolean {
  switch (api) {
    case "anthropic-messages":
    case "mistral":
    // Alias spelling of the same adapter/formatter (see OVERFLOW_SIGNATURES).
    case "mistral-conversations":
      return input.httpStatus === 400 || input.httpStatus === null;
    case "openai-completions":
      return (
        input.httpStatus === 400 ||
        (input.httpStatus === 200 && input.stopReason === "error")
      );
    case "amazon-bedrock":
    // Alias spelling of the same adapter/formatter (see OVERFLOW_SIGNATURES).
    case "bedrock-converse-stream":
      return true;
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
  // The lookup guard below excludes unlisted APIs before the status-gate call.
  const api = input.api as keyof typeof OVERFLOW_SIGNATURES;
  const signature = OVERFLOW_SIGNATURES[api];
  if (signature === undefined) return null;
  const message = input.errorMessage;
  if (message === undefined) return null;
  if (!signature.test(message)) return null;
  if (!overflowStatusGateSatisfied(input, api)) return null;
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
