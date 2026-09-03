import { describe, expect, it } from "vitest";
import { matchAvailableModel } from "../src/binder/binder-model";
import {
  createModelReferenceMatcher,
  type AvailableModel,
  type ModelRegistrySurface,
} from "../src/extension/reload-wiring";

// Bug 0418 — conformance pin of the SHIPPED first-slash split.
//
// A model reference that is simultaneously a valid `provider/modelId` reference
// AND an existing slash-carrying bare `Model.id` (the live registry serves
// openrouter ids like `anthropic/claude-sonnet-5`) satisfies BOTH spec readings.
// The parse rule (Spec
// docs/spec_topics/binder/binder-model-and-context.md#binder-model-parse-rule,
// binder-model-and-context.md:10 — "The resolver accepts both a canonical
// `provider/modelId` reference and a bare `modelId`") ordered neither reading,
// yet its own cross-provider ambiguity posture is refuse-not-pick. The parent
// adjudicated bug 0418 as Option A (ORDERING): the shipped first-slash split
// (any reference containing `/` is split at the FIRST slash and tried as
// `provider/modelId` only; the bare-id reading is reserved for slash-free
// strings) is ratified as canonical. Slash-carrying ids are therefore nameable
// only in double-qualified form.
//
// WHY this test exists: it pins that ordering against a synthetic registry
// exhibiting the collision, across BOTH matchers that implement the split, so a
// later refactor that flips to a bare-id-first or a both-readings reading
// (which would resolve the double-readable string to the wrong model, or report
// it ambiguous) reds here instead of silently changing which provider/api/
// billing serves every binder call. Both matchers must agree:
//   - `matchAvailableModel` (src/binder/binder-model.ts:116) — the runtime
//     re-resolution the binder dispatch uses.
//   - `createModelReferenceMatcher` (src/extension/reload-wiring.ts:518) — the
//     shared load-time resolver for `bind_model:` / `theta.binderModel` /
//     `model:`.
//
// This is a pin of EXISTING behaviour: green at the fork by design.

const model = (id: string, provider: string, api: string): AvailableModel => ({
  id,
  provider,
  api,
});

const registryOf = (models: readonly AvailableModel[]): ModelRegistrySurface => ({
  getAvailable: () => models,
});

// The collision: the string "anthropic/claude-sonnet-5" is BOTH the
// provider/id reference for the anthropic model AND the exact bare id of the
// openrouter model. Frozen so the pinned registry cannot drift under test.
const ANTHROPIC = model("claude-sonnet-5", "anthropic", "anthropic-messages");
const OPENROUTER = model("anthropic/claude-sonnet-5", "openrouter", "openai-completions");
const COLLISION: readonly AvailableModel[] = Object.freeze([ANTHROPIC, OPENROUTER]);

// A host registry serving ONE bare id under TWO providers — the bug 0169
// cross-provider ambiguity the spec DOES anticipate (refuse-not-pick).
const TWO_PROVIDERS: readonly AvailableModel[] = Object.freeze([
  model("claude-x", "anthropic", "anthropic-messages"),
  model("claude-x", "openrouter", "openai-completions"),
]);

describe("b0418 — double-readable string resolves by the provider/id reading (first-slash ordering wins)", () => {
  it("matchAvailableModel picks the anthropic (provider/id) reading, shadowing the openrouter bare-id model", () => {
    // First-slash split: provider "anthropic", id "claude-sonnet-5" — the
    // openrouter model whose bare id equals the WHOLE string is shadowed.
    expect(matchAvailableModel("anthropic/claude-sonnet-5", COLLISION)).toEqual(ANTHROPIC);
  });

  it("createModelReferenceMatcher resolves it (not ambiguous — the discriminator that pins first-slash ordering)", () => {
    // A both-readings implementation would count two matches and return
    // "ambiguous"; asserting "resolved" pins the single provider/id reading.
    const matcher = createModelReferenceMatcher(registryOf(COLLISION));
    expect(matcher.resolve("anthropic/claude-sonnet-5")).toBe("resolved");
  });
});

describe("b0418 — the double-qualified spelling reaches the slash-carrying bare-id model (its only escape spelling)", () => {
  it("matchAvailableModel splits the FIRST slash: provider 'openrouter', id 'anthropic/claude-sonnet-5'", () => {
    expect(matchAvailableModel("openrouter/anthropic/claude-sonnet-5", COLLISION)).toEqual(
      OPENROUTER,
    );
  });

  it("createModelReferenceMatcher resolves the double-qualified spelling", () => {
    const matcher = createModelReferenceMatcher(registryOf(COLLISION));
    expect(matcher.resolve("openrouter/anthropic/claude-sonnet-5")).toBe("resolved");
  });
});

describe("b0418 — slash-free bare-id behaviour unchanged (bug 0169 refuse-not-pick control)", () => {
  it("matchAvailableModel refuses a bare id served by two providers (ambiguous → not-pick-first)", () => {
    expect(matchAvailableModel("claude-x", TWO_PROVIDERS)).toBeUndefined();
  });

  it("createModelReferenceMatcher reports that bare id ambiguous", () => {
    const matcher = createModelReferenceMatcher(registryOf(TWO_PROVIDERS));
    expect(matcher.resolve("claude-x")).toBe("ambiguous");
  });

  it("the qualified disambiguation of that bare id still works", () => {
    const anthropicX = model("claude-x", "anthropic", "anthropic-messages");
    expect(matchAvailableModel("anthropic/claude-x", TWO_PROVIDERS)).toEqual(anthropicX);
    const matcher = createModelReferenceMatcher(registryOf(TWO_PROVIDERS));
    expect(matcher.resolve("anthropic/claude-x")).toBe("resolved");
  });

  it("a slash-free id matching exactly one model resolves; a no-match id does not (plain controls)", () => {
    const haiku = model("claude-haiku", "anthropic", "anthropic-messages");
    const single: readonly AvailableModel[] = Object.freeze([haiku]);
    expect(matchAvailableModel("claude-haiku", single)).toEqual(haiku);
    expect(matchAvailableModel("no-such-model", single)).toBeUndefined();
    const matcher = createModelReferenceMatcher(registryOf(single));
    expect(matcher.resolve("claude-haiku")).toBe("resolved");
    expect(matcher.resolve("no-such-model")).toBe("no-match");
  });
});
