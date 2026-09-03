// The per-api SPELLING of a forced named-tool `options.toolChoice` on a pi-ai
// `complete()` call, shared by the two forced-tool dispatch sites: the
// typed-query forced respond turn (bug 0010) and the binder inference call
// (bug 0011). Housed under `src/binder/` because `binder-inference.ts` must
// consume the same table and the producer already imports `binder-inference`
// — a producer export would be circular.
//
// The spec's normalized shape is `{ type: "tool", name }` (conversation-drive.md
// §complete-forced-tool-presupposition), but that section is a CONSUMPTION
// posture over pi-ai behaviour that is NOT part of pi-ai's typed surface — and
// at the theta-1.0 pi-ai pin the per-api adapters do NOT all normalise it:
// `anthropic-messages` passes `options.toolChoice` through verbatim (its
// Anthropic-native shape IS `{type:"tool",name}`) and `bedrock-converse-stream`
// maps that same shape, while `openai-completions` and `mistral-conversations`
// type and consume the provider-native OpenAI-style spelling directly —
// observed at dist/api/openai-completions.d.ts (verbatim `tool_choice`
// passthrough) and dist/api/mistral-conversations.js `mapToolChoice` (reads
// `choice.function.name`) — so handing them `{type:"tool",name}` yields a
// provider 400 / TypeError instead of a forced tool. Theta therefore supplies
// the per-api shape itself.
//
// The OpenAI RESPONSES family needs a THIRD spelling (bug 0417): neither shipped
// shape works. `dist/api/openai-responses.js` forwards `options.toolChoice`
// VERBATIM, and the Responses endpoint rejects the `{type:"tool",name}` default
// with a 400 on the `type` value ("Supported values are: … 'function' …") AND
// rejects the `"function"` row's NESTED `{type:"function",function:{name}}`
// form with a 400 on the missing flat `name` — Reach 1 measured that only the
// FLAT `{type:"function",name}` force-calls the tool. `openai-codex-responses`
// shares that verbatim passthrough (dist/api/openai-codex-responses.js:
// `tool_choice: options?.toolChoice ?? "auto"`, same `openai-responses-shared`
// adapter family), so it takes the same flat row on the code-read. But
// `azure-openai-responses` DROPS the forced choice entirely
// (dist/api/azure-openai-responses.js `buildParams` never reads
// `options.toolChoice`), so it shares no passthrough and earns no row.
//
// WHY the binder now GATES which apis are reachable (bug 0417, parent
// adjudication Option A). An api OUTSIDE the table defaults to the spec's
// normalized `{type:"tool",name}` shape. The typed-query provider gate bounds
// which apis are reachable on the RESPOND path, but the binder path had no such
// gate: `bind_model:` resolves any registry model, so an `openai-responses`
// binder call shipped the 400-prone default, burning both budgeted binder calls
// per invocation before failing on `argument binder unavailable`. The binder
// now consults {@link binderSupportsApi} and SYNTHESIZES a transport refusal
// BEFORE dispatch (zero provider spend) for any api with no MEASURED row —
// mirroring the respond path's synthesize-before-dispatch. Spec: this per-api
// spelling is recorded as the *Pin clarification* under conversation-drive.md
// §"`complete()` forced-tool behavioural presupposition"
// (#complete-forced-tool-presupposition), which names this table, and the
// supported-api bound at binder-inference.md.

/**
 * The per-api forced-tool-choice spelling table, keyed on the resolved model's
 * `Model<Api>.api`:
 *   - `"tool"` rows take the normalized `{ type: "tool", name }` shape;
 *   - `"function"` rows the provider-native OpenAI-style
 *     `{ type: "function", function: { name } }` shape;
 *   - `"responses-function"` rows the FLAT `{ type: "function", name }` shape
 *     the OpenAI Responses family requires (bug 0417).
 */
const FORCED_TOOL_CHOICE_BY_API: Readonly<
  Record<string, "tool" | "function" | "responses-function">
> = Object.freeze({
  "anthropic-messages": "tool",
  "bedrock-converse-stream": "tool",
  "amazon-bedrock": "tool",
  "openai-completions": "function",
  "mistral-conversations": "function",
  "mistral": "function",
  // Bug 0417 — the flat Responses-family spelling. `openai-responses` is
  // live-measured (Reach 1); `openai-codex-responses` shares the same verbatim
  // `options.toolChoice` passthrough by code-read (both route through
  // `openai-responses-shared`).
  "openai-responses": "responses-function",
  "openai-codex-responses": "responses-function",
});

/**
 * The pinned pi-ai `KnownApi` members deliberately OUTSIDE
 * {@link FORCED_TOOL_CHOICE_BY_API} — their forced-tool-choice disposition is a
 * documented ABSENCE, not a silent gap (bug 0417 §Fix, the api-coverage gate's
 * two-direction assertion over the forced-tool table):
 *   - `azure-openai-responses` — code-read shows the adapter drops
 *     `options.toolChoice`, so no spelling can force a tool through it;
 *   - `google-generative-ai` / `google-vertex` / `pi-messages` — no forced-tool
 *     spelling has been live-measured, and the measurement law forbids minting a
 *     guessed spelling (that is bug 0417's own defect class).
 * All four are refused by {@link binderSupportsApi} before any binder dispatch.
 */
export const FORCED_TOOL_CHOICE_UNMEASURED_APIS: readonly string[] = Object.freeze([
  "azure-openai-responses",
  "google-generative-ai",
  "google-vertex",
  "pi-messages",
]);

/** The forced-tool-choice table's row keys — the api-coverage gate's domain. */
export const FORCED_TOOL_CHOICE_API_KEYS: readonly string[] = Object.freeze(
  Object.keys(FORCED_TOOL_CHOICE_BY_API),
);

/**
 * The binder's supported-api set (bug 0417, parent adjudication Option A): the
 * six existing MEASURED forced-tool rows' apis PLUS `openai-responses`
 * (live-measured in Reach 1). A resolved binder model whose `Model<Api>.api` is
 * outside this set is refused BEFORE any provider call.
 *
 * `openai-codex-responses` carries a spelling ROW (code-read) but is
 * DELIBERATELY outside this gate: a code-read is weaker than a live measurement,
 * so it stays gated out until an end-to-end live drive measures it — the row
 * documents the spelling without admitting the api. Held as a `Set` so the
 * membership test is prototype-safe over a registry-origin `api` string.
 */
const BINDER_SUPPORTED_APIS: ReadonlySet<string> = new Set([
  "anthropic-messages",
  "bedrock-converse-stream",
  "amazon-bedrock",
  "openai-completions",
  "mistral-conversations",
  "mistral",
  "openai-responses",
]);

/**
 * Whether the binder may dispatch a forced-tool `complete()` against a model of
 * this `Model<Api>.api` (bug 0417). `false` means the api has no MEASURED
 * forced-tool-choice row, so a dispatch would ship the 400-prone
 * `{type:"tool",name}` default; the caller must synthesize a refusal BEFORE any
 * provider call instead ({@link binderUnsupportedApiMessage}).
 */
export function binderSupportsApi(api: string): boolean {
  return BINDER_SUPPORTED_APIS.has(api);
}

/**
 * The honest refusal message the binder gate synthesizes for an unsupported api
 * (bug 0417). The resolved `Model<Api>.api` is named by the transport row's own
 * `(<provider>: <message>)` parenthetical, so this message states only the
 * cause. Carried on the existing binder transport failure surface — no new
 * failure class, no new registry code.
 */
export function binderUnsupportedApiMessage(): string {
  return "no measured forced-tool-choice mapping for this provider api; argument binding unavailable";
}

/** A forced named-tool `options.toolChoice` value, in one of the three spellings. */
export type ForcedToolChoice =
  | { readonly type: "tool"; readonly name: string }
  | { readonly type: "function"; readonly function: { readonly name: string } }
  | { readonly type: "function"; readonly name: string };

/**
 * The forced tool choice for a `complete()` dispatch, spelled per the resolved
 * model's api (see {@link FORCED_TOOL_CHOICE_BY_API}): the OpenAI-style nested
 * `{type:"function",function:{name}}` for the function-style rows, the flat
 * `{type:"function",name}` for the Responses-family rows, and the spec's
 * normalized `{type:"tool",name}` for the tool-style rows AND for any api
 * outside the table.
 */
export function forcedToolChoiceForApi(api: string, name: string): ForcedToolChoice {
  const spelling = FORCED_TOOL_CHOICE_BY_API[api];
  if (spelling === "responses-function") {
    return { type: "function", name };
  }
  if (spelling === "function") {
    return { type: "function", function: { name } };
  }
  return { type: "tool", name };
}
