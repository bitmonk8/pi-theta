// Shared exact-match model-reference resolver for frontmatter and binder loading.

import type {
  ModelMatchOutcome,
  ModelReferenceMatcher,
} from "./frontmatter";

/**
 * The narrow `ctx.modelRegistry.getAvailable()` surface theta's exact-match
 * resolver runs over (host-interfaces-core.md#model-registry-pin). A live
 * `ModelRegistry` is structurally assignable here.
 */
export interface AvailableModel {
  /** Model identity — matched against a bare `modelId` and the `modelId` half of `provider/modelId`. */
  readonly id: string;
  /** The short provider-id form (e.g. `anthropic`) — the `provider` half compares against this. */
  readonly provider: string;
  /** The api-shaped value (e.g. `anthropic-messages`) — NOT matched against. */
  readonly api: string;
}

/** The model-enumeration surface (`ctx.modelRegistry.getAvailable()`). */
export interface ModelRegistrySurface {
  getAvailable(): readonly AvailableModel[];
}

/**
 * Construct theta's own exact-match model-reference resolver over
 * `registry.getAvailable()`: a bare `modelId` matches each model's `id`; a
 * `provider/modelId` reference matches `provider` (the short provider-id form,
 * not the api-shaped `api`) plus `id`. A bare `modelId` matching across more
 * than one provider is `"ambiguous"`; anything matching no available model is
 * `"no-match"` (binder-model-and-context.md#binder-model-parse-rule).
 */
export function createModelReferenceMatcher(
  registry: ModelRegistrySurface,
): ModelReferenceMatcher {
  return {
    resolve(reference: unknown): ModelMatchOutcome {
      // A non-string reference matches no available model (no-match).
      if (typeof reference !== "string") {
        return "no-match";
      }
      const available = registry.getAvailable();
      const slash = reference.indexOf("/");
      if (slash >= 0) {
        // `provider/modelId`: the provider half compares against the short
        // provider-id `Model<Api>.provider` (NOT the api-shaped `.api`) and the
        // modelId half against `Model<Api>.id`.
        const provider = reference.slice(0, slash);
        const modelId = reference.slice(slash + 1);
        const matches = available.filter(
          (m) => m.provider === provider && m.id === modelId,
        );
        return outcomeOf(matches.length);
      }
      // A bare `modelId` matches each model's `Model<Api>.id`; a match across
      // more than one provider is ambiguous (resolves to no model).
      const matches = available.filter((m) => m.id === reference);
      return outcomeOf(matches.length);
    },
  };
}

/** Map a match count onto the resolution outcome: 1 → resolved, >1 → ambiguous, 0 → no-match. */
function outcomeOf(count: number): ModelMatchOutcome {
  if (count === 1) {
    return "resolved";
  }
  if (count > 1) {
    return "ambiguous";
  }
  return "no-match";
}
