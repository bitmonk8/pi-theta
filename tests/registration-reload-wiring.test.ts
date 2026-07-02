import { describe, expect, it, vi } from "vitest";
import {
  createSyntheticSourceInfo,
  type SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import {
  LoomRegistry,
  rebuildAndSwap,
  createReloadFailureInjector,
  dropCollidingLooms,
  structuralChangeNote,
  createModelReferenceMatcher,
  loadPassParse,
  REGISTRY_SWAP_FAILED_CODE,
  type ParsedLoom,
  type AvailableModel,
  type ModelRegistrySurface,
} from "../src/extension/reload-wiring";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type {
  ModelReferenceMatcher,
  ParseFrontmatterOptions,
  FrontmatterParseResult,
} from "../src/parser/frontmatter";

// V9b-T — registration steps and reload-wiring seams (tests). These tests are
// written against the seams the paired V9b implementation leaf fills in; they
// MUST fail red for the intended reason (the implementation is absent), citing
// each spec REQ-ID inline.

// A `SlashCommandInfo` with the supplied name + source. `sourceInfo` is filler.
function command(name: string, source: SlashCommandInfo["source"]): SlashCommandInfo {
  return {
    name,
    source,
    sourceInfo: createSyntheticSourceInfo(`/x/${name}`, { source: "test" }),
  };
}

const NOOP_RUN = async (): Promise<void> => {};
const loom = (slashName: string): ParsedLoom => ({
  slashName,
  frontmatter: { mode: "prompt" },
  body: { statements: [], tail: null },
  run: NOOP_RUN,
});

// A `ModelRegistrySurface` over a fixed available-model set.
function registryOf(models: readonly AvailableModel[]): ModelRegistrySurface {
  return { getAvailable: () => models };
}

// --- PIC-36 — registry swap atomicity ---

describe("V9b-T — registry-swap atomicity (PIC-36)", () => {
  it("PIC-36: a successful rebuild publishes the staged map (build-aside then publish)", () => {
    const registry = new LoomRegistry();
    const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();

    const staged = new Map<string, ParsedLoom>([["foo", loom("foo")]]);
    const published = rebuildAndSwap(
      "/x/foo.loom",
      () => staged,
      { registry, emitDiagnostic },
    );

    expect(published).toBe(true);
    expect(registry.get("foo")).toEqual(loom("foo"));
    expect(emitDiagnostic).not.toHaveBeenCalled();
  });

  it("PIC-36: a failed rebuild discards the staging set, keeps the prior snapshot live, and fires loom/runtime/registry-swap-failed", () => {
    const registry = new LoomRegistry([["old", loom("old")]]);
    const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();

    const published = rebuildAndSwap(
      "/x/foo.loom",
      () => {
        throw new Error("recompile blew up");
      },
      { registry, emitDiagnostic },
    );

    // Discarded swap: prior snapshot remains live, staging set never published.
    expect(published).toBe(false);
    expect(registry.get("old")).toEqual(loom("old"));
    expect(registry.get("foo")).toBeUndefined();

    // Exactly one `loom/runtime/registry-swap-failed` diagnostic, message
    // sourced from the diagnostics registry `registry swap failed: <path>`.
    expect(emitDiagnostic).toHaveBeenCalledTimes(1);
    const diag = emitDiagnostic.mock.calls[0]?.[0] as Diagnostic;
    expect(diag.code).toBe(REGISTRY_SWAP_FAILED_CODE);
    expect(diag.code).toBe("loom/runtime/registry-swap-failed");
    expect(diag.message).toBe("registry swap failed: /x/foo.loom");
    expect(diag.hint).toContain("recompile blew up");
  });

  it("PIC-36: the ReloadFailureInjector routes a synthetic registry-swap / re-parse failure onto the registry-swap-failed surfacing path", () => {
    const registry = new LoomRegistry();
    const emitDiagnostic = vi.fn<(d: Diagnostic) => void>();
    const injector = createReloadFailureInjector({ registry, emitDiagnostic });

    injector.injectReloadFailure("registry-swap", new Error("swap boom"));
    injector.injectReloadFailure("loom-warp-reparse", new Error("parse boom"));

    expect(emitDiagnostic).toHaveBeenCalledTimes(2);
    for (const call of emitDiagnostic.mock.calls) {
      expect((call[0] as Diagnostic).code).toBe(REGISTRY_SWAP_FAILED_CODE);
    }
    expect((emitDiagnostic.mock.calls[0]?.[0] as Diagnostic).hint).toContain(
      "swap boom",
    );
    expect((emitDiagnostic.mock.calls[1]?.[0] as Diagnostic).hint).toContain(
      "parse boom",
    );
  });
});

// --- PIC-39 — getCommands() snapshot read-only-by-convention ---

describe("V9b-T — getCommands() snapshot read-only-by-convention (PIC-39)", () => {
  it("PIC-39: the collision pass drops colliding looms and leaves the snapshot array unmutated in length and order", () => {
    const pending: readonly ParsedLoom[] = [loom("foo"), loom("bar")];
    // A snapshot whose array mutators throw: any in-place write during the
    // single forward pass fails the test rather than passing silently.
    const snapshot: readonly SlashCommandInfo[] = Object.freeze([
      command("foo", "prompt"),
    ]);

    const result = dropCollidingLooms(pending, snapshot);

    // Behaviour: the name colliding with a `prompt`-source command is dropped.
    expect(result.survivors.map((p) => p.slashName)).toEqual(["bar"]);
    expect(result.dropped.map((p) => p.slashName)).toEqual(["foo"]);

    // Read-only-by-convention: the snapshot is the same instance, unchanged in
    // length and element order after the check runs.
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.name).toBe("foo");
    expect(snapshot[0]?.source).toBe("prompt");
  });
});

// --- PIC-37 / PIC-38 — structural-change watcher note ---

describe("V9b-T — structural-change watcher note (PIC-37 / PIC-38)", () => {
  it("PIC-37: an empty debounce window (added.length + removed.length === 0) emits no note", () => {
    // Including a settings edit whose post-merge `loomPaths` is byte-identical
    // and a burst that nets no added/removed `.loom`/`.warp` file — all resolve
    // to empty added/removed arrays.
    expect(structuralChangeNote([], [])).toBeUndefined();
  });

  it("PIC-38: a same-window rename of path P (removed P then added P, summing to 2) emits the note with the fixed content and display:true", () => {
    const note = structuralChangeNote(["/x/p.loom"], ["/x/p.loom"]);

    expect(note).toBeDefined();
    expect(note?.content).toBe(
      "loom watcher: 2 file(s) added or removed; run /reload to refresh the slash command list",
    );
    expect(note?.display).toBe(true);
    expect(note?.details).toEqual({
      structural: { added: ["/x/p.loom"], removed: ["/x/p.loom"] },
    });
  });
});

// --- model-reference-matcher production wiring (host-interfaces-core.md#model-registry-pin) ---

describe("V9b-T — model-reference-matcher production wiring (model-registry surface)", () => {
  const model = (
    id: string,
    provider: string,
    api: string,
  ): AvailableModel => ({ id, provider, api });

  it("constructs an exact-match resolver over getAvailable() matching .id / .provider, never the api-shaped .api", () => {
    const registry = registryOf([
      model("claude-x", "anthropic", "anthropic-messages"),
    ]);
    const matcher = createModelReferenceMatcher(registry);

    // Bare modelId matches `Model<Api>.id`.
    expect(matcher.resolve("claude-x")).toBe("resolved");
    // `provider/modelId` matches `Model<Api>.provider` (short id) + `.id`.
    expect(matcher.resolve("anthropic/claude-x")).toBe("resolved");
    // The api-shaped value is NOT a provider match — `.api` is excluded.
    expect(matcher.resolve("anthropic-messages/claude-x")).toBe("no-match");
    // A reference matching no available model is `no-match`.
    expect(matcher.resolve("openai/gpt-9")).toBe("no-match");
  });

  it("reports a bare modelId ambiguous across providers as ambiguous", () => {
    const registry = registryOf([
      model("shared", "anthropic", "anthropic-messages"),
      model("shared", "openai", "openai-responses"),
    ]);
    const matcher = createModelReferenceMatcher(registry);

    expect(matcher.resolve("shared")).toBe("ambiguous");
    // The disambiguated `provider/modelId` form still resolves.
    expect(matcher.resolve("anthropic/shared")).toBe("resolved");
  });

  it("constructs the matcher once at the load pass and injects that single instance into every V6a parse call (single-source-of-construction, instance identity)", () => {
    const registry = registryOf([
      model("claude-x", "anthropic", "anthropic-messages"),
    ]);

    const seen: ModelReferenceMatcher[] = [];
    const parse = (options: ParseFrontmatterOptions): FrontmatterParseResult => {
      seen.push(options.modelMatcher);
      return { registered: true, diagnostics: [] };
    };

    loadPassParse([{ file: "/x/a.loom" }, { file: "/x/b.loom" }], {
      modelRegistry: registry,
      parse,
    });

    // Both parse calls received the SAME matcher instance — one source of
    // construction, observed by instance identity (not equivalence-of-outcome).
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    // That injected instance is loom's registry-backed exact-match resolver.
    expect(seen[0]?.resolve("claude-x")).toBe("resolved");
  });
});
