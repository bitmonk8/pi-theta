// Off-session forced respond dispatch: registry auth resolution, off-session reply classification, and the pi-ai `complete()` dispatch of the typed query's forced respond turn.

import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, Message, Model, ProviderResponse, Tool, ToolCall } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai/compat";
import { PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE } from "../runtime/prompt-transport-mapping";
import type { ForcedRespondTurn } from "../runtime/query-tool-loop";
import type { ContextOverflowError, ForcedRespondBranch, TransportError } from "../runtime/query-error";
import { respondPayloadFromWire } from "../runtime/respond-tool-wire";
import { forcedToolChoiceForApi, isForcedToolChoiceRejection } from "../binder/forced-tool-choice";
import { classifyProviderResponse } from "../binder/provider-error-mapping";
import { coerceUnderlyingString } from "../diagnostics/placeholder";
import { respondToolEntry, type RespondTurnContext } from "./respond-capture";

/** The resolved request auth (apiKey/headers) an off-session `complete()` threads. */
interface OffSessionRequestAuth {
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
}

/**
 * Bug 0010 (auth threading, increments C+D): resolve a model's request auth
 * off the model registry — the `#completeBinderReply` pattern — PROBING for
 * the optional `getApiKeyAndHeaders` capability first. WHY the probe: the
 * capability is genuinely optional on harness registries (the frozen bug-0007
 * suite constructs `modelRegistry: {}`), and auth is an enrichment, not a
 * precondition — its absence must not crash a dispatch that a credential-less
 * host could still serve. `undefined` = thread no auth options.
 */
async function resolveRegistryAuth(
  modelRegistry: ModelRegistry,
  model: Model<Api> | undefined,
): Promise<OffSessionRequestAuth | undefined> {
  if (model === undefined) {
    return undefined;
  }
  const registry = modelRegistry as {
    readonly getApiKeyAndHeaders?: (m: Model<Api>) => Promise<{
      readonly ok: boolean;
      readonly apiKey?: string;
      readonly headers?: Record<string, string>;
    }>;
  };
  if (typeof registry.getApiKeyAndHeaders !== "function") {
    return undefined;
  }
  const auth = await registry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return undefined;
  }
  return {
    ...(auth.apiKey !== undefined ? { apiKey: auth.apiKey } : {}),
    ...(auth.headers !== undefined ? { headers: auth.headers } : {}),
  };
}

/** Concatenate the text content of an assistant message (thinking / tool calls omitted). */
function assistantText(message: AssistantMessage): string {
  return message.content
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("");
}

/**
 * The classified resolution of one off-session `complete()` dispatch (bug
 * 0007): the reply's assistant text on a normal terminator, or the classified
 * provider failure. A resolved discriminated value — never throw-based control
 * flow: pi-ai's `complete()` RESOLVES its provider failures on most adapters
 * (the per-API adapter converts a caught throw into a reply carrying
 * `stopReason: "error"`), so classification is a probe over the resolved
 * reply, not a `catch`. Bug 0481 observation: the `anthropic-messages`
 * adapter's `result()` instead THROWS the error-terminated stream's message,
 * so on that adapter a provider failure arrives at the call site's own catch
 * arm and never reaches this classifier — both dispatch sites handle both
 * arms.
 */
type OffSessionCompletion =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "failure"; readonly error: TransportError | ContextOverflowError };

/**
 * The stop reasons that terminate an off-session turn normally. pi-ai's
 * `StopReason` union spells the turn boundary `"stop"` and the tool boundary
 * `"toolUse"`; the spec's stop-reason arm names `end_turn` / `stop` /
 * `tool_use` (provider-error-mapping.md §Stop-reason classification) — both
 * spellings are covered so neither surface's normal terminator is ever
 * classified as a failure.
 */
const OFF_SESSION_NORMAL_STOP_REASONS: ReadonlySet<string> = new Set([
  "stop",
  "end_turn",
  "toolUse",
  "tool_use",
]);

/**
 * Bug 0007: probe the resolved off-session reply's `stopReason` before any
 * text extraction. On most adapters pi-ai's `complete()` resolves a provider
 * failure as a reply carrying `stopReason: "error"` (+ optional
 * `errorMessage`), making this probe that failure surface; the
 * `anthropic-messages` adapter instead REJECTS (bug 0481: its `result()`
 * throws the error text), which the call sites' catch arms own. A normal terminator passes through to the text
 * extraction; EVERY other string `stopReason` (`"error"`, `"length"`,
 * `"aborted"`, `"content_filter"`, any unrecognised) routes through the
 * existing `classifyProviderResponse` table with the status THIS call
 * actually captured (bug 0182): `httpStatus: captured?.status ?? null`.
 * `ProviderClassifierInput.httpStatus`'s own doc-comment
 * (`src/binder/provider-error-mapping.ts`) admits only a real captured value
 * or that `null` — nothing else — so a caller whose `onResponse` never fires
 * feeds the classifier the network-level `null` class, never a stand-in 200.
 */
function classifyOffSessionReply(
  model: Model<Api>,
  reply: AssistantMessage,
  captured: ProviderResponse | undefined,
): OffSessionCompletion {
  const provider = String(model.api);
  const stopReason = (reply as { readonly stopReason?: string }).stopReason;
  // A non-string/absent `stopReason` is not a provider failure: pi-ai always
  // sets the field on a resolved reply, so only a fabricated double reaches
  // here without one — treat it as a normal terminator rather than classifying
  // fixture shorthand as a transport failure.
  if (typeof stopReason !== "string" || OFF_SESSION_NORMAL_STOP_REASONS.has(stopReason)) {
    // PIC-53 disposition: a pure tool-use turn that produced no assistant text
    // yields the empty string — a legitimate `Ok("")`, distinct from the
    // error-stop empty content classified below.
    return { kind: "text", text: assistantText(reply) };
  }
  const errorMessage = reply.errorMessage;
  const partialText = assistantText(reply);
  const classified = classifyProviderResponse({
    api: provider,
    httpStatus: captured?.status ?? null,
    stopReason,
    ...(typeof errorMessage === "string" ? { errorMessage } : {}),
    rawResponse: partialText !== "" ? partialText : null,
  });
  // Stop-reason classification (provider-error-mapping.md): the overflow arm
  // (`length`, or an overflow-signature `errorMessage`) surfaces the
  // classifier's `ContextOverflowError` verbatim — token extraction and
  // `raw_response` included.
  if (classified.kind === "context_overflow") {
    return { kind: "failure", error: classified as ContextOverflowError };
  }
  // Every other classification folds to the off-session transport surface:
  // message from the classifier, `http_status` / `retryable` threaded from the
  // classifier's OWN verdict (bug 0291; provider-error-mapping.md:7 routes the
  // no-HTTP-response class through `{ retryable: true, http_status: null }`, :13
  // gives 5xx/429 `retryable: true` and carries a captured status). `provider`
  // is the resolved model's api-shaped `.api` (queryerror-variants.md). An
  // empty/absent classifier message still takes PIC-51's fixed fallback; the
  // `as` casts mirror the overflow arm (`kind` is `string`, ERR-15 openness).
  const message =
    classified.kind === "transport" && classified.message !== ""
      ? classified.message
      : PROMPT_MODE_TRANSPORT_FALLBACK_MESSAGE;
  return {
    kind: "failure",
    error: {
      kind: "transport",
      message,
      http_status: classified.kind === "transport" ? (classified as TransportError).http_status : null,
      provider,
      retryable: classified.kind === "transport" ? (classified as TransportError).retryable : false,
    },
  };
}

/**
 * Bug 0010 (QRY-14 step 2 / SLSH-2 / conversation-drive.md typed bullet):
 * dispatch ONE typed-query forced respond turn OFF-SESSION through pi-ai's
 * `complete()` free function — the binder's channel, the only one that carries
 * `options.toolChoice` (spec finding T34). `context.tools` is exactly the
 * synthesised respond tool, the tool choice is forced to it, the theta signal
 * and registry auth thread as options, and the reply resolves to the seam's
 * `ForcedRespondTurn`:
 *
 *   - EXTRACTION FIRST (binder-inference.md rule): the FIRST `ToolCall` content
 *     part naming the respond tool supplies the payload from its `arguments` —
 *     success extraction PRECEDES stopReason classification, so a late `error`
 *     stop never launders a delivered payload into a transport Err.
 *   - No matching call + a non-normal stopReason: the 0007/0009-aligned
 *     stop-reason classification (`classifyOffSessionReply`), provider = the
 *     RESOLVED RESPOND MODEL's `.api` (queryerror-variants.md §provider
 *     derivation). A non-string/absent stopReason stays a NORMAL terminator
 *     (fixture shorthand is never classified as a failure).
 *   - No matching call + a normal stopReason: ERR-17 non-compliance —
 *     `wrong_tool` when any ToolCall is present (first block's name), else
 *     `plain_text`; `raw_response` = the assistant text, or null when empty.
 *
 * A REJECTED `complete()` promise maps to the transport arm: "cancelled"
 * when the theta signal aborted, else the coerced throw message. On most
 * adapters a rejection is abort/defect-shaped (provider failures resolve as
 * `stopReason: "error"` replies); the `anthropic-messages` adapter also
 * rejects on PROVIDER failures (bug 0481: its `result()` throws the error
 * text), so the catch arm consults the bug-0481 rejection predicate before
 * mapping to transport.
 */
async function dispatchForcedRespondTurn(
  respond: RespondTurnContext,
  messages: readonly Message[],
): Promise<ForcedRespondTurn> {
  if (respond.signal.aborted) {
    // Pre-dispatch abort gate (bug 0010 fix review, F1 — the r7 discipline
    // generalised to EVERY forced respond dispatch): an already-aborted theta
    // signal must never reach `complete()` — a post-abort provider call is
    // token waste against a cancelled query and its reply could only be
    // discarded. The fixed "cancelled" transport shape is returned for the
    // seam's totality; the typed loop maps a signal-aborted transport outcome
    // to its CANCELLED arm (cancellation.md §Surfacing), so this shape is not
    // author-visible on the loop path.
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "cancelled",
        http_status: null,
        provider: String(respond.model?.api ?? "unknown"),
        retryable: false,
      },
    };
  }
  if (respond.model === undefined) {
    // No frontmatter `model:` resolution and no session-pinned `ctx.model`:
    // there is nothing to dispatch against — a transport Err with the fixed
    // sentinel provider, mirroring the off-session model-unavailable posture.
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "no resolved model for the typed-query forced respond turn",
        http_status: null,
        provider: "unknown",
        retryable: false,
      },
    };
  }
  const model = respond.model;
  const provider = String(model.api);
  const tool: Tool = respondToolEntry(respond);
  const auth = await respond.auth();
  // Bug 0481: at most TWO dispatches — the forced one, plus ONE degraded
  // re-issue (toolChoice omitted) when the provider rejects forcing at the
  // MODEL level (`isForcedToolChoiceRejection` over the raw resolved-failure
  // errorMessage). Stateless across dispatches: a repair restart re-forces
  // first, exactly like a fresh query.
  let degraded = false;
  for (;;) {
  // Bug 0182: a per-dispatch capture, mirroring `#classifyBinderAttempt`'s —
  // each forced respond call (a fresh attempt, or a repair restart) is its
  // own invocation, so a module-level slot would carry one dispatch's status
  // into the next's classification (CLAUDE.md: no globals/statics/singletons).
  let captured: ProviderResponse | undefined;
  const onResponse = (response: ProviderResponse): void => {
    captured = response;
  };
  const options: Record<string, unknown> = {
    // The forced tool choice — the entire content of spec finding T34
    // (`pi.sendUserMessage` exposes no toolChoice; `complete()` is the channel)
    // — spelled per the resolved respond model's api (bug 0010 fix round 1;
    // see FORCED_TOOL_CHOICE_BY_API in binder/forced-tool-choice.ts, shared
    // with the binder inference call since bug 0011). OMITTED on the bug-0481
    // degraded re-dispatch: the context still carries exactly one tool and the
    // trailing template instructs the model to call it, so `auto` is the
    // strongest request a forcing-rejecting model admits.
    ...(degraded ? {} : { toolChoice: forcedToolChoiceForApi(provider, respond.toolName) }),
    // CANCEL-4-style in-flight forwarding: the theta signal threads into the
    // provider invocation so an abort during the call propagates.
    signal: respond.signal,
    onResponse,
    ...(auth ?? {}),
  };
  let reply: AssistantMessage;
  try {
    reply = await complete(model, { messages: [...messages], tools: [tool] }, options);
  } catch (thrown: unknown) { // allow-broad-catch: pi-sdk-boundary — an aborted/defective complete() rejection → transport Err
    if (respond.signal.aborted) {
      // Mirrors `#classifyBinderAttempt`: an abort observed at the rejection is
      // the cancellation, not a retryable transport failure; the loop's
      // checkpoint surfaces `cancelled` downstream.
      return {
        kind: "transport",
        error: {
          kind: "transport",
          message: "cancelled",
          http_status: null,
          provider,
          retryable: false,
        },
      };
    }
    const thrownMessage = coerceUnderlyingString(thrown);
    // Bug 0481 (throw arm): the anthropic adapter's `result()` converts an
    // error-terminated stream into a THROW (`throw new Error(errorMessage)`,
    // pi-ai dist/api/anthropic-messages.js), so the model-level forcing
    // rejection arrives HERE on that adapter — not as a resolved
    // `stopReason: "error"` reply. Same one-shot degradation as the resolved
    // arm below.
    if (!degraded && isForcedToolChoiceRejection(thrownMessage)) {
      degraded = true;
      continue;
    }
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: thrownMessage,
        http_status: null,
        provider,
        retryable: false,
      },
    };
  }
  // EXTRACTION FIRST (binder-inference.md): the first ToolCall naming the
  // respond tool supplies the payload — before ANY stopReason probe.
  const calls = reply.content.filter(
    (part): part is ToolCall => part.type === "toolCall",
  );
  const match = calls.find((call) => call.name === respond.toolName);
  if (match !== undefined) {
    // Bug 0028 §Fix: the forced dispatch reads the provider's arguments
    // directly (no host validation runs on this channel), so the wire→payload
    // mapping the on-session `execute` gets from `prepareArguments` + the
    // envelope unwrap is applied here explicitly — same function, same result
    // for the same wire bytes.
    return { kind: "respond", payload: respondPayloadFromWire(respond.lowered, match.arguments) };
  }
  // Aborted precedence (bug 0010 fix round 1): pi-ai's `complete()` RESOLVES
  // an abort — the adapter surfaces `stopReason: "aborted"` rather than
  // rejecting — so the catch arm below never sees it. Mirror the prompt path's
  // aborted precedence here: an aborted signal or an aborted-stop reply maps
  // to the fixed "cancelled" transport Err (the loop's checkpoint surfaces
  // `cancelled` downstream), never to ERR-17 non-compliance (an abort is not
  // the model declining the tool). Extraction above still wins when a matching
  // ToolCall is present — a raced valid answer is a valid answer.
  const stopReason = (reply as { readonly stopReason?: string }).stopReason;
  if (respond.signal.aborted || stopReason === "aborted") {
    return {
      kind: "transport",
      error: {
        kind: "transport",
        message: "cancelled",
        http_status: null,
        provider,
        retryable: false,
      },
    };
  }
  // No matching call: classify the stop reason through the 0007/0009-aligned
  // table (provider = the resolved RESPOND model's `.api`).
  const classified = classifyOffSessionReply(model, reply, captured);
  if (classified.kind === "failure") {
    // Bug 0481: the MODEL-level forcing rejection — consulted only on a
    // classified FAILURE (mirroring the binder site's failure-block placement)
    // and on the RAW errorMessage, which the classifier would summarise away.
    // One shot: the degraded pass re-enters this identical interpretation
    // pipeline, where a repeat rejection no longer matches this arm.
    if (
      !degraded &&
      isForcedToolChoiceRejection(reply.errorMessage)
    ) {
      degraded = true;
      continue;
    }
    return { kind: "transport", error: classified.error };
  }
  // ERR-17: a normal terminator with no matching respond call is
  // non-compliance — `wrong_tool` when the model called something else,
  // `plain_text` when it called nothing.
  const branch: ForcedRespondBranch =
    calls.length > 0
      ? {
          kind: "wrong_tool",
          providerToolName: calls[0]!.name,
          respondToolName: respond.toolName,
        }
      : { kind: "plain_text" };
  const raw = assistantText(reply);
  return { kind: "noncompliance", branch, raw_response: raw !== "" ? raw : null };
  }
}

export { OFF_SESSION_NORMAL_STOP_REASONS, resolveRegistryAuth, dispatchForcedRespondTurn };
