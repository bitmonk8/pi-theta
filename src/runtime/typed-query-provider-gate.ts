// V9j / V9j-T — Typed-query provider-support gate: the unsupported-provider
// load warning and runtime `TransportError` synthesis.
//
// Spec: pi-integration-contract/conversation-drive.md
// (§Provider compatibility for typed queries); diagnostic code/message from
// diagnostics/code-registry-load.md.

import type { Diagnostic } from "../diagnostics/diagnostic";
import type { TransportError } from "./query-error";

// --- typed-query supported-provider set + load warning ----------------------

/**
 * The theta 1.0 typed-query-supported provider set
 * (conversation-drive.md §"Provider compatibility for typed queries" / the
 * `theta 1.0 seam — typed-query supported provider set`): the `api`-shaped
 * values for which pi-ai exposes a named-tool `toolChoice` mapping. Exposed as a
 * single named constant so the set has one source of truth to widen.
 *
 * WHY seven members: the four documented provider names PLUS the pin-observed
 * KnownApi spellings at the theta-1.0 pi-ai pin (bug 0010 increment C) —
 * pi-ai's types.d.ts `KnownApi` spells the Mistral and Bedrock adapters
 * `mistral-conversations` / `bedrock-converse-stream`, and those adapters map
 * a working named-tool toolChoice (the FORCED_TOOL_CHOICE_BY_API rows), so a
 * gate refusing them would refuse providers the dispatch demonstrably
 * supports; the names `mistral` / `amazon-bedrock` are retained for the
 * documented provider set — PLUS `openai-responses` (bug 0480): its flat
 * forced-tool spelling was live-measured on the binder call by bug 0417 (which
 * admitted it to the binder bound only) and on the forced respond turn itself
 * by bug 0480's live cell, so the two gates agree. `openai-codex-responses`
 * carries a code-read spelling row but stays outside both gates until it is
 * measured (the measurement law). Spec: conversation-drive.md §"Provider
 * compatibility for typed queries" pins exactly this seven-member `api`-shaped
 * set.
 */
export const TYPED_QUERY_SUPPORTED_PROVIDER_APIS = [
  "anthropic-messages",
  "openai-completions",
  "mistral",
  "amazon-bedrock",
  "mistral-conversations",
  "bedrock-converse-stream",
  "openai-responses",
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
