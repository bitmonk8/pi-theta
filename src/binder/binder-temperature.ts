// The per-(api, model-id) placement of `options.temperature` on a pi-ai
// `complete()` binder call, mirroring `forced-tool-choice.ts`'s per-api
// spelling table and `binder-inference.ts`'s per-api seed-field table. Housed
// under `src/binder/` for the same reason those two are: `binder-inference.ts`
// must consume this table too, and the producer already imports
// `binder-inference` — a producer export would be circular.
//
// `temperature: 0` is theta's determinism pin
// (determinism-cancellation-failure.md §Determinism), but the field is not
// universally acceptable: the Anthropic Messages API answers it with a `400
// invalid_request_error` ("`temperature` is deprecated for this model.") on
// the models that have deprecated it (bug 0064). The refusal is measured per
// (api, model id) exactly — it is neither a blanket `anthropic-messages` fact
// (`claude-opus-5` accepts the field) nor a "newest model" rule (`claude-opus-5`
// is newer than both refusing ids and still accepts it) — so the table below
// is keyed on the pair, widened only on further live measurement against a
// real provider, never derived from a capability flag or a model-name
// heuristic. An api OUTSIDE the table sends the field — the same "outside the
// table takes the default" posture `forcedToolChoiceForApi` documents for its
// own table — because the deprecation is a request-shape fact this table
// records only where a live provider response has measured it.
//
// Null-prototyped and own-key-guarded (`Object.hasOwn`), the defensive shape
// bugs 0031/0038 gave the parser's declared-field and `TypeEnv` records: `api`
// is a string of model-registry origin, so an unguarded bracket read of a
// plain object would resolve an `Object.prototype` own property name
// (`"constructor"`, `"__proto__"`, …) as a value instead of `undefined`.
//
// `binderSendsTemperature` compares `modelId` EXACTLY against a row's
// `refusedByModelId`: a dated alias (for example a future dated snapshot of a
// listed id) is a distinct id the provider may accept or refuse independently
// of the bare id, so it needs its own entry rather than a prefix or fuzzy
// match.
//
// Spec: pi-integration-contract/provider-error-mapping.md
// (#binder-temperature-placement-mapping), binder/determinism-cancellation-
// failure.md (§Determinism).

/**
 * One row of the per-(api, model-id) temperature placement table, keyed on
 * the resolved binder model's `Model<Api>.api`.
 *
 *   - `placement: "sent"` — the api sends `temperature` by default; a model id
 *     listed in `refusedByModelId` is the measured exception that omits it. No
 *     api has been measured to refuse the field API-WIDE, so no `"sent"` row
 *     lists a whole-api refusal.
 *   - `placement: "omitted"` — the api never sends `temperature`, for every
 *     model id (symmetric with the seed-field table's own `"omitted"` rows);
 *     `refusedByModelId` is not consulted when this arm is taken. The binder
 *     gate-refused apis (bug 0417) use this arm as their documented coverage
 *     disposition — the temperature key never reaches the wire for them because
 *     the binder refuses their dispatch before it is built, so `"omitted"`
 *     records that absence rather than a measured whole-api deprecation.
 *
 * `refusedByModelId` is the closed, MEASURED set of model ids under this api
 * that have answered `temperature` with a 400 — never a computed or
 * pattern-matched set (see the module header's exact-id-match WHY).
 */
export interface BinderTemperatureRow {
  readonly placement: "sent" | "omitted";
  readonly refusedByModelId: readonly string[];
}

/** Build one frozen {@link BinderTemperatureRow}; freezes the id array too. */
function row(
  placement: BinderTemperatureRow["placement"],
  refusedByModelId: readonly string[],
): BinderTemperatureRow {
  return Object.freeze({ placement, refusedByModelId: Object.freeze(refusedByModelId) });
}

/**
 * The per-(api, model-id) temperature placement table
 * (provider-error-mapping.md #binder-temperature-placement-mapping), keyed on
 * the resolved binder model's `Model<Api>.api`. Row keys are the pinned pi-ai
 * `Api` literal-union snapshot (`src/extension/sdk-inventory.ts`
 * `api-coverage`); the build-time `Api`-coverage assertion that guards the
 * seed-field table (`tests/version-bump-gates.test.ts`) guards this table too.
 * `anthropic-messages` is the one row a live provider response has measured a
 * refusal on, at the two model ids in its `refusedByModelId` (bug 0064's live
 * census); every other row carries no refusal.
 *
 * Bug 0417 widened the row keys to the ten `KnownApi` members the refreshed
 * `api-coverage` snapshot enumerates. The Responses-family and the KnownApi
 * mistral/bedrock alias spellings that the binder gate ADMITS
 * (`binderSupportsApi`) send `temperature: 0` by default — `openai-responses`'s
 * tolerated-temperature:0 was live-measured (bug 0417 §Fix), the alias rows
 * mirror their legacy siblings. The apis the binder gate REFUSES before
 * dispatch (`azure-openai-responses`, `openai-codex-responses`,
 * `google-generative-ai`, `google-vertex`, `pi-messages`) never reach this
 * table at runtime; their `"omitted"` rows are the documented coverage
 * disposition ("no temperature sent to an unmeasured, gated-out api"), never a
 * behavioural claim.
 */
export const BINDER_TEMPERATURE_TABLE: Readonly<Record<string, BinderTemperatureRow>> =
  Object.freeze(
    Object.assign(Object.create(null) as Record<string, BinderTemperatureRow>, {
      "openai-completions": row("sent", []),
      mistral: row("sent", []),
      "anthropic-messages": row("sent", ["claude-fable-5", "claude-sonnet-5"]),
      "amazon-bedrock": row("sent", []),
      // Bug 0417 — gate-admitted apis send temperature:0 by default.
      "mistral-conversations": row("sent", []),
      "bedrock-converse-stream": row("sent", []),
      "openai-responses": row("sent", []),
      // Bug 0417 — gate-refused, unmeasured apis: temperature is never sent to
      // them (the binder gate refuses before dispatch); the documented coverage
      // disposition is `"omitted"`.
      "azure-openai-responses": row("omitted", []),
      "openai-codex-responses": row("omitted", []),
      "google-generative-ai": row("omitted", []),
      "google-vertex": row("omitted", []),
      "pi-messages": row("omitted", []),
    }),
  );

/**
 * Whether the binder `complete()` call carries `options.temperature` for the
 * resolved (api, model id) pair. `false` means the caller MUST omit the key
 * from `options` entirely — never present holding `undefined`, which still
 * reaches the adapter's payload builder as an own key. Whether an adapter
 * then drops such a key before the wire is adapter-owned behaviour this
 * table presupposes nothing about in either direction: what the table pins
 * is the `options` shape theta constructs, not the request the adapter
 * emits from it.
 *
 * An api absent from {@link BINDER_TEMPERATURE_TABLE} sends the field: the
 * table records only measured refusals, so an unmeasured api defaults to the
 * spec's `temperature: 0` pin — the same "outside the table takes the
 * default" posture `forcedToolChoiceForApi` applies to an unlisted api.
 */
export function binderSendsTemperature(api: string, modelId: string): boolean {
  const entry = Object.hasOwn(BINDER_TEMPERATURE_TABLE, api)
    ? BINDER_TEMPERATURE_TABLE[api]
    : undefined;
  if (entry === undefined) {
    return true;
  }
  if (entry.placement === "omitted") {
    return false;
  }
  return !entry.refusedByModelId.includes(modelId);
}
