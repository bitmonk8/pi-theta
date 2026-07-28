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
// the per-api shape itself. An api OUTSIDE the table defaults to the spec's
// normalized `{type:"tool",name}` shape; the typed-query provider gate bounds
// which apis are reachable on the respond path. Spec: this per-api spelling is
// recorded as the *Pin clarification* under conversation-drive.md
// §"`complete()` forced-tool behavioural presupposition"
// (#complete-forced-tool-presupposition), which names this table.

/**
 * The per-api forced-tool-choice spelling table, keyed on the resolved model's
 * `Model<Api>.api`: `"tool"` rows take the normalized `{ type: "tool", name }`
 * shape, `"function"` rows the provider-native OpenAI-style
 * `{ type: "function", function: { name } }` shape.
 */
const FORCED_TOOL_CHOICE_BY_API: Readonly<Record<string, "tool" | "function">> =
  Object.freeze({
    "anthropic-messages": "tool",
    "bedrock-converse-stream": "tool",
    "amazon-bedrock": "tool",
    "openai-completions": "function",
    "mistral-conversations": "function",
    "mistral": "function",
  });

/** A forced named-tool `options.toolChoice` value, in one of the two spellings. */
export type ForcedToolChoice =
  | { readonly type: "tool"; readonly name: string }
  | { readonly type: "function"; readonly function: { readonly name: string } };

/**
 * The forced tool choice for a `complete()` dispatch, spelled per the resolved
 * model's api (see {@link FORCED_TOOL_CHOICE_BY_API}): the OpenAI-style
 * `{type:"function",function:{name}}` for the function-style rows, the spec's
 * normalized `{type:"tool",name}` for the tool-style rows AND for any api
 * outside the table.
 */
export function forcedToolChoiceForApi(api: string, name: string): ForcedToolChoice {
  return FORCED_TOOL_CHOICE_BY_API[api] === "function"
    ? { type: "function", function: { name } }
    : { type: "tool", name };
}
