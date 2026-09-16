// RFC-0012 §5 — registered backends over `pi.events`: the versioned
// discover / offer protocol, structural validation at registration, the
// `theta/load/subagent-placement-invalid` row (message sourced from the
// registry, DIAG-4; mirrored in docs/reference/diagnostics.md), the
// order-independence of the two directions, unsubscribe on shutdown, and the
// no-`pi.events` degradation (built-ins only, no diagnostic).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — JS code-registry module, no type declarations.
import { parseRegistry, registryMessage } from "../tools/code-registry/index.js";
import {
  bindPlacementRegistration,
  PLACEMENT_DISCOVER_CHANNEL,
  PLACEMENT_OFFER_CHANNEL,
  PLACEMENT_REGISTRATION_API_VERSION,
  PlacementRegistry,
  SUBAGENT_PLACEMENT_INVALID_CODE,
  type PlacementDiscoverPayload,
  type PlacementEventBus,
} from "../src/runtime/subagent-placement-registry";
import type { PlacedChild, SubagentPlacementBackend } from "../src/runtime/subagent-placement";
import type { Diagnostic } from "../src/diagnostics/diagnostic";

const REGISTRY = parseRegistry(
  ["code-registry-parse.md", "code-registry-load.md", "code-registry-runtime.md", "code-registry-host.md"]
    .map((page) =>
      readFileSync(fileURLToPath(new URL(`../docs/spec_topics/diagnostics/${page}`, import.meta.url)), "utf8"),
    )
    .join("\n"),
) as { code: string; message: string; severity: string }[];

function backend(name: string, priority = 1): SubagentPlacementBackend {
  return {
    name,
    priority,
    detect: (): boolean => true,
    place: (): PlacedChild => ({
      handle: name,
      capabilities: { observesExit: false, inheritsEnv: true, visible: true },
      onExit: (): void => {},
      kill: (): void => {},
    }),
  };
}

/** A minimal in-memory `EventBus` (the pin's `emit` / `on → unsubscribe` shape). */
class FakeBus implements PlacementEventBus {
  readonly handlers = new Map<string, Set<(data: unknown) => void>>();
  readonly emitted: { channel: string; data: unknown }[] = [];
  emit(channel: string, data: unknown): void {
    this.emitted.push({ channel, data });
    for (const handler of [...(this.handlers.get(channel) ?? [])]) {
      handler(data);
    }
  }
  on(channel: string, handler: (data: unknown) => void): () => void {
    const set = this.handlers.get(channel) ?? new Set();
    set.add(handler);
    this.handlers.set(channel, set);
    return (): void => {
      set.delete(handler);
    };
  }
  subscriberCount(channel: string): number {
    return this.handlers.get(channel)?.size ?? 0;
  }
}

describe("RFC-0012 §5 — PlacementRegistry", () => {
  it("registers a well-formed backend once; snapshot is in registration order; get() finds it", () => {
    const registry = new PlacementRegistry();
    expect(registry.register(backend("herdr"))).toBeUndefined();
    expect(registry.register(backend("zellij", 3))).toBeUndefined();
    expect(registry.snapshot().map((b) => b.name)).toEqual(["herdr", "zellij"]);
    expect(registry.get("zellij")?.priority).toBe(3);
    registry.clear();
    expect(registry.snapshot()).toEqual([]);
  });

  it.each([
    ["not an object", 42, "<unnamed>", "backend is not an object"],
    ["a name outside the grammar", { ...backend("Herdr"), name: "Herdr" }, "Herdr", "name must match ^[a-z][a-z0-9-]{0,31}$"],
    ["a reserved name", backend("pipe"), "pipe", "name 'pipe' is reserved"],
    ["a non-finite priority", { ...backend("h"), priority: Number.POSITIVE_INFINITY }, "h", "priority must be a finite number"],
    ["detect not a function", { ...backend("h"), detect: true }, "h", "detect must be a function"],
    ["place not a function", { ...backend("h"), place: "x" }, "h", "place must be a function"],
  ])("drops a malformed candidate (%s) with theta/load/subagent-placement-invalid (W) naming it", (_label, candidate, name, reason) => {
    const dropped = new PlacementRegistry().register(candidate);
    expect(dropped?.code).toBe(SUBAGENT_PLACEMENT_INVALID_CODE);
    expect(dropped?.severity).toBe("warning");
    expect(dropped?.message).toBe(`ignoring subagent placement registration '${name}': ${reason}`);
  });

  it("R1: re-registering the IDENTICAL backend object under its name is a silent no-op (0.477.0) — both calls return undefined, snapshot stays length 1", () => {
    const registry = new PlacementRegistry();
    const b = backend("herdr");
    expect(registry.register(b)).toBeUndefined();
    expect(registry.register(b)).toBeUndefined();
    expect(registry.snapshot()).toHaveLength(1);
    expect(registry.get("herdr")).toBe(b);
  });

  it("R2: a duplicate name under a DIFFERENT object is dropped with the reworded reason and the first registration stands", () => {
    const registry = new PlacementRegistry();
    const first = backend("herdr", 1);
    expect(registry.register(first)).toBeUndefined();
    const dropped = registry.register(backend("herdr", 99));
    expect(dropped?.code).toBe(SUBAGENT_PLACEMENT_INVALID_CODE);
    expect(dropped?.severity).toBe("warning");
    expect(dropped?.message).toBe(
      "ignoring subagent placement registration 'herdr': a different backend is already registered under this name",
    );
    expect(registry.get("herdr")).toBe(first);
  });

  it("R7: clear() (session_shutdown) frees a name; re-registering the SAME object after clear lands cleanly", () => {
    const registry = new PlacementRegistry();
    const b = backend("herdr");
    expect(registry.register(b)).toBeUndefined();
    registry.clear();
    expect(registry.register(b)).toBeUndefined();
    expect(registry.snapshot()).toEqual([b]);
  });

  it("R9: clear() frees a name for a DIFFERENT object under the same name (fresh-set semantics unchanged)", () => {
    const registry = new PlacementRegistry();
    const first = backend("herdr");
    expect(registry.register(first)).toBeUndefined();
    registry.clear();
    const second = backend("herdr", 2);
    expect(registry.register(second)).toBeUndefined();
    expect(registry.get("herdr")).toBe(second);
  });

  it("the row's message is the registry's (DIAG-4), W, and the reference page mirrors it", () => {
    const template = registryMessage(REGISTRY, SUBAGENT_PLACEMENT_INVALID_CODE) as string | undefined;
    expect(template).toBe("ignoring subagent placement registration '<name>': <reason>");
    expect(REGISTRY.find((row) => row.code === SUBAGENT_PLACEMENT_INVALID_CODE)?.severity).toBe("W");
    const mirror = readFileSync(fileURLToPath(new URL("../docs/reference/diagnostics.md", import.meta.url)), "utf8");
    expect(mirror).toContain(`| \`${SUBAGENT_PLACEMENT_INVALID_CODE}\` | W | load | \`${template}\` |`);
  });
});

describe("RFC-0012 §5 — bindPlacementRegistration over pi.events", () => {
  it("DISCOVER: pi-theta emits { apiVersion: 1, register } and a listener registering synchronously lands in the registry", () => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const diagnostics: Diagnostic[] = [];
    // One hoisted object: a conformant listener answers every discover with
    // the same backend, which is what R3 below relies on.
    const herdr = backend("herdr");
    bus.on(PLACEMENT_DISCOVER_CHANNEL, (data) => {
      const payload = data as PlacementDiscoverPayload;
      expect(payload.apiVersion).toBe(PLACEMENT_REGISTRATION_API_VERSION);
      payload.register(herdr);
    });
    const binding = bindPlacementRegistration(bus, registry, (d) => diagnostics.push(d));
    expect(registry.snapshot()).toEqual([]);
    binding.discover();
    expect(registry.snapshot().map((b) => b.name)).toEqual(["herdr"]);
    expect(bus.emitted.map((e) => e.channel)).toEqual([PLACEMENT_DISCOVER_CHANNEL]);
    expect(diagnostics).toEqual([]);
    // R3 (0.477.0): a second discover (a hot-reload re-compose) re-offers the
    // IDENTICAL object — the conformant answer-every-discover shape — and is
    // a silent no-op: zero diagnostics, the first registration stands.
    binding.discover();
    expect(registry.snapshot()).toHaveLength(1);
    expect(diagnostics).toEqual([]);
  });

  it("R4: a second discover with a FRESH object under the same name draws exactly one W and the first stands", () => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const diagnostics: Diagnostic[] = [];
    bus.on(PLACEMENT_DISCOVER_CHANNEL, (data) => {
      const payload = data as PlacementDiscoverPayload;
      payload.register(backend("herdr"));
    });
    const binding = bindPlacementRegistration(bus, registry, (d) => diagnostics.push(d));
    binding.discover();
    const first = registry.get("herdr");
    binding.discover();
    expect(registry.snapshot()).toHaveLength(1);
    expect(registry.get("herdr")).toBe(first);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(SUBAGENT_PLACEMENT_INVALID_CODE);
    expect(diagnostics[0]?.message).toBe(
      "ignoring subagent placement registration 'herdr': a different backend is already registered under this name",
    );
  });

  it("OFFER: a backend loading after pi-theta emits { apiVersion: 1, backend } and is registered — order-independent with discover", () => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const diagnostics: Diagnostic[] = [];
    bindPlacementRegistration(bus, registry, (d) => diagnostics.push(d));
    expect(bus.subscriberCount(PLACEMENT_OFFER_CHANNEL)).toBe(1);
    bus.emit(PLACEMENT_OFFER_CHANNEL, { apiVersion: 1, backend: backend("cmux") });
    expect(registry.snapshot().map((b) => b.name)).toEqual(["cmux"]);
    expect(diagnostics).toEqual([]);
  });

  it("R5: the same offer payload (same backend object) emitted twice is a silent no-op — one entry, zero diagnostics", () => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const diagnostics: Diagnostic[] = [];
    bindPlacementRegistration(bus, registry, (d) => diagnostics.push(d));
    const b = backend("cmux");
    const payload = { apiVersion: 1, backend: b };
    bus.emit(PLACEMENT_OFFER_CHANNEL, payload);
    bus.emit(PLACEMENT_OFFER_CHANNEL, payload);
    expect(registry.snapshot()).toHaveLength(1);
    expect(registry.get("cmux")).toBe(b);
    expect(diagnostics).toEqual([]);
  });

  it("R6: two offers under the same name with DIFFERENT backend objects draw the W on the second; the first stands", () => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const diagnostics: Diagnostic[] = [];
    bindPlacementRegistration(bus, registry, (d) => diagnostics.push(d));
    const first = backend("cmux", 1);
    bus.emit(PLACEMENT_OFFER_CHANNEL, { apiVersion: 1, backend: first });
    bus.emit(PLACEMENT_OFFER_CHANNEL, { apiVersion: 1, backend: backend("cmux", 2) });
    expect(registry.get("cmux")).toBe(first);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toBe(
      "ignoring subagent placement registration 'cmux': a different backend is already registered under this name",
    );
  });

  it.each([
    ["a non-object payload", "nope", "<unnamed>", "offer payload is not an object"],
    ["a wrong apiVersion", { apiVersion: 2, backend: backend("herdr") }, "herdr", "offer apiVersion 2 is not 1"],
    ["a missing apiVersion", { backend: backend("herdr") }, "herdr", "offer apiVersion undefined is not 1"],
    ["a malformed backend", { apiVersion: 1, backend: { name: "herdr" } }, "herdr", "priority must be a finite number"],
  ])("a malformed OFFER (%s) is dropped with the W row and nothing else changes", (_label, payload, name, reason) => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const diagnostics: Diagnostic[] = [];
    bindPlacementRegistration(bus, registry, (d) => diagnostics.push(d));
    bus.emit(PLACEMENT_OFFER_CHANNEL, payload);
    expect(registry.snapshot()).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.message).toBe(`ignoring subagent placement registration '${name}': ${reason}`);
  });

  it("a discover listener that throws is reported as an invalid registration and does not propagate into the compose pass", () => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const diagnostics: Diagnostic[] = [];
    bus.on(PLACEMENT_DISCOVER_CHANNEL, () => {
      throw new Error("backend init failed");
    });
    const binding = bindPlacementRegistration(bus, registry, (d) => diagnostics.push(d));
    expect(() => binding.discover()).not.toThrow();
    expect(diagnostics.map((d) => d.message)).toEqual([
      "ignoring subagent placement registration '<unnamed>': a discover listener threw: backend init failed",
    ]);
  });

  it("unsubscribe releases the offer subscription (idempotent); a later offer is not heard", () => {
    const bus = new FakeBus();
    const registry = new PlacementRegistry();
    const binding = bindPlacementRegistration(bus, registry, () => {});
    binding.unsubscribe();
    binding.unsubscribe();
    expect(bus.subscriberCount(PLACEMENT_OFFER_CHANNEL)).toBe(0);
    bus.emit(PLACEMENT_OFFER_CHANNEL, { apiVersion: 1, backend: backend("late") });
    expect(registry.snapshot()).toEqual([]);
  });

  it("no pi.events ⇒ no-op discover / unsubscribe, built-ins only, no diagnostic", () => {
    const diagnostics: Diagnostic[] = [];
    const binding = bindPlacementRegistration(undefined, new PlacementRegistry(), (d) => diagnostics.push(d));
    expect(() => {
      binding.discover();
      binding.unsubscribe();
    }).not.toThrow();
    expect(diagnostics).toEqual([]);
  });
});
