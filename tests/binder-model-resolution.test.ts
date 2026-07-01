import { describe, expect, it, vi } from "vitest";
import {
  resolveBinderModel,
  computeBinderModelRecoveryNote,
  renderBinderModelRecoveryContent,
  reconcileBinderModelSettingsEdit,
  loadPassResolveBinderModels,
  BINDER_MODEL_UNRESOLVED_CODE,
  BINDER_MODEL_UNRESOLVED_MESSAGE,
  BINDER_MODEL_NOT_STRICT_CAPABLE_CODE,
  BINDER_MODEL_STRICT_CAPABILITY_UNKNOWN_CODE,
  binderModelNotStrictCapableMessage,
  binderModelStrictCapabilityUnknownMessage,
  type BinderModelResolutionInput,
  type StrictCapableProbe,
  type LoadedLoom,
} from "../src/binder/binder-model";
import {
  createModelReferenceMatcher,
  type AvailableModel,
  type ModelRegistrySurface,
} from "../src/extension/reload-wiring";
import type {
  ModelReferenceMatcher,
  ParseFrontmatterOptions,
  FrontmatterParseResult,
} from "../src/parser/frontmatter";
import type { LoomSettings } from "../src/discovery/settings";

// V11a-T — binder-model resolution and the strict-capability probe (tests).
// Written against the seams the paired V11a implementation leaf fills in; every
// test MUST fail red for the intended reason (the resolution / probe / chain /
// recovery / BNDR-11 behaviour is absent), sourcing each diagnostic *Message*
// from the registry per the *Diagnostic message anchors* rule.
//
// Spec: binder/binder-model-and-context.md (§Binder model,
// #strict-capability-requirement, #binder-model-parse-rule,
// #binder-model-hot-reload, BNDR-11), binder.md; model-registry surface
// pi-integration-contract/host-interfaces-core.md#model-registry-pin.

const model = (id: string, provider: string, api: string): AvailableModel => ({
  id,
  provider,
  api,
});

const registryOf = (models: readonly AvailableModel[]): ModelRegistrySurface => ({
  getAvailable: () => models,
});

/** A probe that never runs (the reference resolves to no model). */
const noProbe = (): StrictCapableProbe | undefined => undefined;

// --- loom/load/binder-model-unresolved -------------------------------------

describe("V11a-T — binder-model unresolved (loom/load/binder-model-unresolved)", () => {
  it("fires for a bare modelId matched against Model<Api>.id that matches no available model", () => {
    // The registry has a differently-named model, so the bare `claude-haiku`
    // reference resolves to no model.
    const matcher = createModelReferenceMatcher(
      registryOf([model("gpt-9", "openai", "openai-responses")]),
    );
    const input: BinderModelResolutionInput = {
      file: "/x/a.loom",
      bindModel: "claude-haiku",
      bypassEligible: false,
      matcher,
      probeStrictCapable: noProbe,
    };

    const result = resolveBinderModel(input);

    const diag = result.diagnostics.find(
      (d) => d.code === BINDER_MODEL_UNRESOLVED_CODE,
    );
    // Primary assertion: the load-phase unresolved diagnostic fires.
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    // Message sourced from the diagnostics registry (code-registry-load.md).
    expect(diag?.message).toBe(BINDER_MODEL_UNRESOLVED_MESSAGE);
    expect(result.resolved).toBe(false);
  });

  it("fires for a provider/modelId reference matched against Model<Api>.provider (short id) + .id — worked example anthropic/claude-haiku", () => {
    // The short provider-id form is matched, NOT the api-shaped `.api`. Here the
    // only available model is under provider `openai`, so `anthropic/claude-haiku`
    // resolves to no model even though an `anthropic-messages` api exists.
    const matcher = createModelReferenceMatcher(
      registryOf([model("claude-haiku", "openai", "anthropic-messages")]),
    );
    const input: BinderModelResolutionInput = {
      file: "/x/a.loom",
      bindModel: "anthropic/claude-haiku",
      bypassEligible: false,
      matcher,
      probeStrictCapable: noProbe,
    };

    const result = resolveBinderModel(input);

    const diag = result.diagnostics.find(
      (d) => d.code === BINDER_MODEL_UNRESOLVED_CODE,
    );
    expect(diag).toBeDefined();
    expect(diag?.message).toBe(BINDER_MODEL_UNRESOLVED_MESSAGE);
    expect(result.resolved).toBe(false);
  });

  it("does not fire for a bypass-eligible loom — both checks are skipped", () => {
    // A bypass-eligible loom never calls the binder, so an absent chain produces
    // no `loom/load/binder-model-unresolved` and no probe diagnostic.
    const matcher = createModelReferenceMatcher(registryOf([]));
    const result = resolveBinderModel({
      file: "/x/a.loom",
      bypassEligible: true,
      matcher,
      probeStrictCapable: noProbe,
    });

    expect(
      result.diagnostics.some((d) => d.code === BINDER_MODEL_UNRESOLVED_CODE),
    ).toBe(false);
    expect(result.resolved).toBe(true);
  });
});

// --- strict-capability probe (three-valued) --------------------------------

describe("V11a-T — strictCapable probe (binder-model-and-context.md#strict-capability-requirement)", () => {
  const resolvableMatcher = (): ModelReferenceMatcher =>
    createModelReferenceMatcher(
      registryOf([model("claude-haiku", "anthropic", "anthropic-messages")]),
    );

  it("strictCapable false → loom/load/binder-model-not-strict-capable (E), loom refused", () => {
    const result = resolveBinderModel({
      file: "/x/a.loom",
      bindModel: "claude-haiku",
      bypassEligible: false,
      matcher: resolvableMatcher(),
      probeStrictCapable: () => ({ strictCapable: false }),
    });

    const diag = result.diagnostics.find(
      (d) => d.code === BINDER_MODEL_NOT_STRICT_CAPABLE_CODE,
    );
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("error");
    expect(diag?.message).toBe(
      binderModelNotStrictCapableMessage("claude-haiku"),
    );
    expect(result.resolved).toBe(false);
  });

  it("strictCapable undefined → loom/load/binder-model-strict-capability-unknown (W), loom registered", () => {
    const result = resolveBinderModel({
      file: "/x/a.loom",
      bindModel: "claude-haiku",
      bypassEligible: false,
      matcher: resolvableMatcher(),
      // The pinned production branch: the field is absent on `Model<Api>`.
      probeStrictCapable: () => ({}),
    });

    const diag = result.diagnostics.find(
      (d) => d.code === BINDER_MODEL_STRICT_CAPABILITY_UNKNOWN_CODE,
    );
    expect(diag).toBeDefined();
    expect(diag?.severity).toBe("warning");
    expect(diag?.message).toBe(
      binderModelStrictCapabilityUnknownMessage("claude-haiku"),
    );
    // W-level: the loom still registers.
    expect(result.resolved).toBe(true);
  });

  it("strictCapable true → resolves with no diagnostic", () => {
    const result = resolveBinderModel({
      file: "/x/a.loom",
      bindModel: "claude-haiku",
      bypassEligible: false,
      matcher: resolvableMatcher(),
      probeStrictCapable: () => ({ strictCapable: true }),
    });

    expect(result.resolved).toBe(true);
    expect(result.binderModel).toBe("claude-haiku");
    expect(result.diagnostics).toHaveLength(0);
  });
});

// --- two-step chain: fallback to looms.binderModel -------------------------

describe("V11a-T — binder-model two-step chain (binder-model-and-context.md#binder-model)", () => {
  it("falls back to looms.binderModel when frontmatter bind_model: is omitted", () => {
    // The merged setting supplies the reference; the frontmatter omits bind_model.
    const settings: LoomSettings = { looms: { binderModel: "claude-haiku" } };
    const matcher = createModelReferenceMatcher(
      registryOf([model("claude-haiku", "anthropic", "anthropic-messages")]),
    );

    const merged = settings.looms?.binderModel ?? "";
    const result = resolveBinderModel({
      file: "/x/a.loom",
      // bind_model omitted — the chain falls through to the merged setting.
      settingsBinderModel: merged,
      bypassEligible: false,
      matcher,
      probeStrictCapable: () => ({ strictCapable: true }),
    });

    // The merged setting resolves the binder model (no unresolved diagnostic),
    // and the value reaches the binder from V10c's merged settings — not a
    // hardcoded model.
    expect(
      result.diagnostics.some((d) => d.code === BINDER_MODEL_UNRESOLVED_CODE),
    ).toBe(false);
    expect(result.resolved).toBe(true);
    expect(result.binderModel).toBe("claude-haiku");
  });
});

// --- hot-reload recovery note (binder-model-and-context.md#binder-model-hot-reload) ---

describe("V11a-T — binder-model hot-reload recovery note", () => {
  it("emits the consolidated recovery loom-system-note when a previously-unresolved model now resolves", () => {
    // Under the changed setting, `alpha`'s binder model now re-resolves.
    const matcher = createModelReferenceMatcher(
      registryOf([model("claude-haiku", "anthropic", "anthropic-messages")]),
    );
    const resolution: BinderModelResolutionInput = {
      file: "/x/alpha.loom",
      settingsBinderModel: "claude-haiku",
      bypassEligible: false,
      matcher,
      probeStrictCapable: () => ({ strictCapable: true }),
    };

    const note = computeBinderModelRecoveryNote([
      { slashName: "alpha", resolution },
    ]);

    // Primary assertion: a recovery note is emitted (informational; no loom/load/* code).
    expect(note).not.toBeNull();
    expect(note?.display).toBe(true);
    expect(note?.details).toEqual({ recovery: { looms: ["alpha"] } });
    // The content is the verbatim template with `<N>` and `<names>` substituted.
    expect(note?.content).toBe(renderBinderModelRecoveryContent(["alpha"]));
  });
});

// --- BNDR-11: settings-only edit does not re-run resolution ----------------

describe("V11a-T — BNDR-11 (binder-model-and-context.md#bndr-11)", () => {
  it("a looms.binderModel-only edit does not re-run resolution or the probe; each loaded loom retains its handle", () => {
    const loaded: readonly LoadedLoom[] = [
      { slashName: "alpha", binderModelHandle: "claude-haiku" },
      { slashName: "beta", binderModelHandle: "gpt-9" },
    ];
    const resolve = vi.fn();

    const after = reconcileBinderModelSettingsEdit(loaded, { resolve });

    // BNDR-11: no re-resolution or probe is run for any already-loaded loom.
    expect(resolve).not.toHaveBeenCalled();
    // Each loom retains its previously-resolved binder-model handle.
    expect(after).toEqual(loaded);
  });
});

// --- single-matcher cross-resolution reconciliation (instance identity) ----

describe("V11a-T — single-matcher cross-resolution reconciliation (host-interfaces-core.md#model-registry-pin)", () => {
  it("threads the one load-pass matcher instance into both V6a's model: resolution and this leaf's binder-model resolution", () => {
    const registry = registryOf([
      model("claude-haiku", "anthropic", "anthropic-messages"),
    ]);

    const parseMatchers: ModelReferenceMatcher[] = [];
    const parse = (options: ParseFrontmatterOptions): FrontmatterParseResult => {
      parseMatchers.push(options.modelMatcher);
      return { registered: true, diagnostics: [] };
    };

    const binderMatchers: ModelReferenceMatcher[] = [];
    const resolveFn = (input: BinderModelResolutionInput): ReturnType<
      typeof resolveBinderModel
    > => {
      binderMatchers.push(input.matcher);
      return { resolved: true, binderModel: "claude-haiku", diagnostics: [] };
    };

    const settings: LoomSettings = { looms: { binderModel: "claude-haiku" } };

    loadPassResolveBinderModels(
      [{ file: "/x/a.loom", bypassEligible: false }],
      {
        modelRegistry: registry,
        parse,
        resolveBinderModel: resolveFn,
        settings,
        probeStrictCapable: () => ({ strictCapable: true }),
      },
    );

    // Both resolution paths were exercised…
    expect(parseMatchers.length).toBeGreaterThan(0);
    expect(binderMatchers.length).toBeGreaterThan(0);
    // …and both bound the SAME matcher instance (single-source-of-construction,
    // observed by instance identity, not equivalence-of-outcome).
    expect(binderMatchers[0]).toBe(parseMatchers[0]);
  });
});
